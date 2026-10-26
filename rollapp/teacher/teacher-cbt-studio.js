(() => {
  'use strict';

  const SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = value => String(value ?? '').trim().replace(/^section\s+/i, '').toLowerCase();
  const bytes = value => new TextEncoder().encode(value);
  const hex = buffer => Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('');
  const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const bytesToBase64 = bytesValue => {
    let binary = '';
    for (let index = 0; index < bytesValue.length; index += 0x8000) binary += String.fromCharCode(...bytesValue.subarray(index, index + 0x8000));
    return btoa(binary);
  };

  async function digest(value) {
    return crypto.subtle.digest('SHA-256', bytes(value));
  }

  async function sign(value) {
    const key = await crypto.subtle.importKey('raw', bytes(SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, bytes(value)));
  }

  async function encrypt(value, examId, schoolCode) {
    const key = await crypto.subtle.importKey('raw', await digest(`${schoolCode}::${examId}::${SALT}`), { name: 'AES-CBC' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const data = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, bytes(value));
    return { iv: hex(iv), data: b64(data) };
  }

  async function embedStudentPhoto(student) {
    const url = student.profilePicData || student.profilePic || student.profilePhoto || student.photoURL || student.photoUrl || student.profilePicture || student.imageUrl || '';
    if (!url || String(url).startsWith('data:')) return url || '';
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        return `data:${blob.type || 'image/jpeg'};base64,${bytesToBase64(new Uint8Array(buffer))}`;
      }
    } catch (_) {}

    // Fallback: load into HTML Image element and extract to canvas
    try {
      const dataUri = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(256, img.naturalWidth || img.width || 128);
            canvas.height = Math.min(256, img.naturalHeight || img.height || 128);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
        setTimeout(() => reject(new Error('timeout')), 3000);
      });
      return dataUri;
    } catch (_) {
      return url;
    }
  }

  async function getCbtAccess() {
    const db = window.firebase?.database?.();
    const uid = window.firebase?.auth?.()?.currentUser?.uid || window.currentUser?.uid || '';
    const profile = window.currentTeacher || (uid && db ? (await db.ref(`users/${uid}`).once('value')).val() : null) || {};
    const schoolId = String(profile.schoolId || window.currentUser?.schoolId || '');
    if (!db || !schoolId) return { active: false, schoolId, profile };
    const subscription = (await db.ref(`schools/${schoolId}/cbtSubscription`).once('value')).val() || {};
    const baseSubscription = (await db.ref(`schools/${schoolId}/subscription`).once('value')).val() || {};
    const end = Date.parse(subscription.endDate || '');
    const baseEnd = Date.parse(baseSubscription.endDate || '');
    const baseActive = String(baseSubscription.status || 'active').toLowerCase() !== 'inactive' && (!baseEnd || baseEnd >= Date.now());
    const active = baseActive && String(subscription.status || 'active').toLowerCase() !== 'inactive' && (!end || end >= Date.now());
    return {
      active,
      schoolId,
      profile,
      subscription,
      schoolCode: String(profile.schoolCode || profile.institutionCode || schoolId).toUpperCase(),
      schoolName: String(profile.schoolName || profile.institutionName || profile.school || 'RollCall Institution'),
      maxDevices: Math.max(1, Math.floor(Number(subscription.maxDevices || subscription.deviceLimit || 1)))
    };
  }

  function selectedSections(panel) {
    return [...panel.querySelectorAll('input[name="cbt-sections"]:checked')].map(input => ({
      value: input.value,
      classId: input.dataset.classId || '',
      section: input.dataset.section || '',
      className: input.dataset.className || input.dataset.label || 'Class'
    }));
  }

  function renderSectionPicker(panel, select) {
    const picker = panel.querySelector('#cbtSectionPicker');
    if (!picker) return;
    const options = [...select.options].filter(option => option.value);
    picker.innerHTML = options.length ? options.map((option, index) => {
      const [classId, section] = option.value.split(':::');
      const label = option.textContent || `${classId} - Sec ${section}`;
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc"><input type="checkbox" name="cbt-sections" value="${esc(option.value)}" data-class-id="${esc(classId)}" data-section="${esc(section)}" data-class-name="${esc(label.replace(/\s+-\s+Sec\s+.*$/i, ''))}"><span>${esc(label)}</span></label>`;
    }).join('') : '<span style="color:#64748b;font-size:.82rem">No assigned class sections are available.</span>';
  }

  function studentBelongsToSection(student, assignment) {
    const studentClassId = String(student.classId || student.enrolledClassId || student.courseId || '').trim().toLowerCase();
    const targetClassId = String(assignment.classId || '').trim().toLowerCase();
    const studentSection = norm(student.section || student.classSection || student.sectionName);
    const targetSection = norm(assignment.section);
    if (studentSection && targetSection && studentSection !== targetSection) return false;
    if (studentClassId && targetClassId) return studentClassId === targetClassId;
    const names = [student.className, student.courseName, student.course, student.class, student.assignedClass].filter(Boolean).map(value => String(value).toLowerCase());
    return names.some(name => name.includes(String(assignment.className || '').toLowerCase()) || String(assignment.className || '').toLowerCase().includes(name));
  }

  async function loadStudents(db, access, assignment) {
    const students = [];
    const addFromSnapshot = snapshot => snapshot?.forEach(child => {
      const student = { ...(child.val() || {}), id: child.key };
      if ((!student.role || student.role === 'student') && studentBelongsToSection(student, assignment)) students.push(student);
    });
    const schoolSnapshot = await db.ref(`schoolUsers/${access.schoolId}`).once('value');
    addFromSnapshot(schoolSnapshot);
    if (!students.length) addFromSnapshot(await db.ref('users').orderByChild('schoolId').equalTo(access.schoolId).once('value'));
    return students.sort((a, b) => {
      const ar = Number.parseInt(a.classRoll || a.univRoll || a.rollNo || a.rollNumber, 10);
      const br = Number.parseInt(b.classRoll || b.univRoll || b.rollNo || b.rollNumber, 10);
      if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
      return String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''));
    });
  }

  function createDeviceAssignments(students, maxDevices) {
    const threshold = Math.max(1, Math.ceil(students.length / maxDevices));
    return {
      threshold,
      deviceCount: Math.min(maxDevices, Math.max(1, students.length)),
      students: students.map((student, index) => ({
        ...student,
        sequence: index + 1,
        deviceIndex: Math.min(maxDevices, Math.floor(index / threshold) + 1),
        deviceSequence: `${Math.min(maxDevices, Math.floor(index / threshold) + 1)}:${index + 1}`
      }))
    };
  }

  function candidateRecord(student, assignment, index, deviceIndex) {
    const photo = student.profilePicData || student.profilePic || student.profilePhoto || student.photoURL || student.photoUrl || student.profilePicture || student.imageUrl || '';
    return {
      uid: student.id,
      id: student.id,
      name: student.name || student.displayName || student.email || `Student ${index + 1}`,
      profilePic: photo,
      profilePhoto: photo,
      profilePicData: photo,
      photoURL: photo,
      class: assignment.className,
      batch: assignment.className,
      classId: assignment.classId,
      section: assignment.section,
      classRoll: student.classRoll || student.univRoll || student.rollNo || student.rollNumber || index + 1,
      rollNo: student.classRoll || student.univRoll || student.rollNo || student.rollNumber || index + 1,
      pin: student.cbtPin || '',
      sequence: index + 1,
      deviceIndex
    };
  }

  function mount() {
    const panel = document.getElementById('testScoresSection');
    if (!panel || document.getElementById('teacherCbtStudio')) return;
    const header = panel.querySelector('.tts-header-actions');
    if (!header) return;

    const button = document.createElement('button');
    button.className = 'tts-btn-secondary';
    button.id = 'teacherCbtStudio';
    button.hidden = true;
    button.innerHTML = '<i class="fas fa-shield-halved"></i> CBT Exam Studio';
    header.prepend(button);

    const modal = document.createElement('div');
    modal.id = 'teacherCbtStudioModal';
    modal.hidden = true;
    modal.style = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.72);backdrop-filter:blur(6px);padding:20px;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;';
    modal.innerHTML = `
      <div style="width:100%;max-width:980px;margin:24px auto;background:#ffffff;border-radius:20px;padding:26px;box-shadow:0 25px 60px rgba(15,23,42,0.35);border:1px solid #e2e8f0;box-sizing:border-box;font-family:inherit;">
        <!-- Modal Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:18px;">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:#e0f2fe;color:#0369a1;font-size:0.72rem;font-weight:800;padding:3px 9px;border-radius:6px;margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase;">
              <i class="fas fa-shield-halved"></i> CBT Exam Authoring Studio
            </div>
            <h2 style="margin:0 0 4px 0;font-size:1.35rem;font-weight:800;color:#0f172a;">CBT Offline Exam Package Generator</h2>
            <p style="margin:0;color:#64748b;font-size:0.84rem;line-height:1.45;">Select one or more assigned class sections to generate tamper-proof, encrypted <code>.rollcbt</code> offline packages with student photos and proctoring rules.</p>
          </div>
          <button id="teacherCbtClose" type="button" aria-label="Close" style="width:36px !important;height:36px !important;min-width:36px !important;min-height:36px !important;max-width:36px !important;max-height:36px !important;padding:0 !important;border-radius:50% !important;border:1.5px solid #cbd5e1;background:#f8fafc;color:#64748b;font-size:1.3rem;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 36px !important;box-shadow:none;line-height:1;">&times;</button>
        </div>

        <!-- Basic Exam Info Grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="tts-field-group" style="grid-column: span 2;">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-heading" style="color:#0284c7;"></i> Exam Title</label>
            <input id="cbtTitle" placeholder="e.g. Unit Test - Algebra & Equations" style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-hashtag" style="color:#0284c7;"></i> Exam Code</label>
            <input id="cbtCode" placeholder="e.g. MATH-CBT-01" style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;text-transform:uppercase;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-stopwatch" style="color:#0284c7;"></i> Duration (Minutes)</label>
            <input id="cbtDuration" type="number" min="5" value="60" style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-award" style="color:#0284c7;"></i> Total Marks</label>
            <input id="cbtMarks" type="number" min="1" value="20" style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-calendar-day" style="color:#0284c7;"></i> Scheduled Start (Optional)</label>
            <input id="cbtScheduledAt" type="datetime-local" style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group" style="grid-column: 1 / -1;">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-align-left" style="color:#0284c7;"></i> Candidate Instructions</label>
            <input id="cbtInstructions" value="Answer all questions. Do not leave the RollCall CBT application." style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#f8fafc;width:100%;box-sizing:border-box;">
          </div>
        </div>

        <!-- Standalone Full-Width Exam Settings Card -->
        <div class="cbt-exam-settings" style="margin:16px 0;padding:16px 18px;border:1.5px solid #bae6fd;border-radius:14px;background:#f0f9ff;width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;color:#0369a1;font-weight:800;font-size:0.92rem;">
              <i class="fas fa-sliders" style="font-size:1rem;"></i>
              <span>Exam Security &amp; Engine Rules</span>
            </div>
            <small style="color:#64748b;font-weight:600;">Saved into every generated .rollcbt file</small>
          </div>
          <div class="cbt-settings-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:10px;width:100%;box-sizing:border-box;">
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtFullscreen" type="checkbox" checked style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-expand" style="color:#0284c7;width:14px;margin-right:4px;"></i> Fullscreen lockdown</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtWebcam" type="checkbox" style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-camera" style="color:#0284c7;width:14px;margin-right:4px;"></i> Require webcam proctoring</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtShuffleQ" type="checkbox" style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-shuffle" style="color:#0284c7;width:14px;margin-right:4px;"></i> Shuffle questions</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtShuffleOpt" type="checkbox" style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-random" style="color:#0284c7;width:14px;margin-right:4px;"></i> Shuffle options</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtScratchpad" type="checkbox" checked style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-pen" style="color:#0284c7;width:14px;margin-right:4px;"></i> Allow scratchpad</span>
            </label>
            <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;cursor:pointer;">
              <input id="cbtShowResult" type="checkbox" checked style="width:17px;height:17px;accent-color:#0284c7;cursor:pointer;flex:0 0 17px;margin:0;">
              <span><i class="fas fa-chart-pie" style="color:#0284c7;width:14px;margin-right:4px;"></i> Show result after submit</span>
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;">
              <span><i class="fas fa-triangle-exclamation" style="color:#d97706;width:14px;margin-right:4px;"></i> Max focus strikes</span>
              <input id="cbtStrikes" type="number" min="1" max="10" value="3" style="width:65px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.84rem;text-align:center;">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;">
              <span><i class="fas fa-calculator" style="color:#0284c7;width:14px;margin-right:4px;"></i> Calculator</span>
              <select id="cbtCalculator" style="width:105px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;">
                <option value="none">None</option>
                <option value="basic" selected>Basic</option>
                <option value="scientific">Scientific</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#ffffff;color:#334155;font-size:0.82rem;font-weight:600;min-height:42px;box-sizing:border-box;">
              <span><i class="fas fa-minus-circle" style="color:#dc2626;width:14px;margin-right:4px;"></i> Negative marks/Q</span>
              <input id="cbtNegative" type="number" min="0" step="0.25" value="0" style="width:65px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.84rem;text-align:center;">
            </label>
          </div>
        </div>

        <!-- Section Assignment Picker -->
        <div style="margin:16px 0;padding:16px 18px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">
          <label style="display:block;font-weight:800;color:#1e293b;margin-bottom:6px;font-size:0.88rem;">
            <i class="fas fa-chalkboard-user" style="color:#0284c7;margin-right:4px;"></i> Assign Target Class Sections
          </label>
          <small style="display:block;color:#64748b;margin-bottom:10px;font-size:0.80rem;">Select one or more sections. Each checked section receives its own schedule, roster, and encrypted <code>.rollcbt</code> file.</small>
          <div id="cbtSectionPicker" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;"></div>
        </div>

        <!-- Questions List Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px;">
          <div>
            <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:6px;">
              <i class="fas fa-list-check" style="color:#0284c7;"></i> Questions
            </h3>
            <span style="font-size:0.78rem;color:#64748b;">Add multiple-choice questions with answer keys</span>
          </div>
          <button id="cbtAddQuestion" type="button" class="tts-btn-secondary" style="width:auto !important;padding:7px 14px;font-size:0.80rem;min-height:36px;">
            <i class="fas fa-plus"></i> Add Question
          </button>
        </div>

        <!-- Questions Dynamic List -->
        <div id="cbtQuestionList"></div>

        <p id="cbtStatus" style="color:#0369a1;font-size:0.85rem;font-weight:600;margin:12px 0;min-height:18px;"></p>

        <!-- Footer Actions -->
        <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px;">
          <button id="cbtCancel" type="button" class="tts-btn-secondary" style="width:auto !important;padding:10px 20px;min-height:42px;">Cancel</button>
          <button id="cbtGenerate" type="button" class="tts-btn-primary" style="width:auto !important;padding:10px 24px;min-height:42px;">
            <i class="fas fa-file-export"></i> Save &amp; Download Section Exams
          </button>
        </div>
      </div>
    `;
    panel.appendChild(modal);

    const list = modal.querySelector('#cbtQuestionList');
    let count = 0;
    const addQuestion = () => {
      count += 1;
      const row = document.createElement('div');
      row.style = 'border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px;background:#f8fafc;box-shadow:0 1px 3px rgba(0,0,0,0.03);';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#0f172a;font-size:0.90rem;">Question ${count}</strong>
          <button type="button" class="tts-btn-secondary cbt-remove" style="width:auto !important;padding:4px 10px;color:#dc2626;border-color:#fecaca;background:#fff;font-size:0.75rem;min-height:30px;">
            <i class="fas fa-trash"></i> Remove
          </button>
        </div>
        <div class="tts-field-group" style="margin-bottom:10px;">
          <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:block;">Question Text</label>
          <input class="cbt-text" placeholder="Enter question statement..." style="padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.86rem;background:#fff;width:100%;box-sizing:border-box;">
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:10px;">
          <div class="tts-field-group">
            <label style="font-size:0.72rem;font-weight:700;color:#64748b;margin-bottom:3px;display:block;">Option A</label>
            <input class="cbt-opt" placeholder="Option A text" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.72rem;font-weight:700;color:#64748b;margin-bottom:3px;display:block;">Option B</label>
            <input class="cbt-opt" placeholder="Option B text" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.72rem;font-weight:700;color:#64748b;margin-bottom:3px;display:block;">Option C</label>
            <input class="cbt-opt" placeholder="Option C text" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
          </div>
          <div class="tts-field-group">
            <label style="font-size:0.72rem;font-weight:700;color:#64748b;margin-bottom:3px;display:block;">Option D</label>
            <input class="cbt-opt" placeholder="Option D text" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div class="tts-field-group" style="flex:1;min-width:140px;">
            <label style="font-size:0.72rem;font-weight:700;color:#475569;margin-bottom:3px;display:block;">Correct Option</label>
            <select class="cbt-answer" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
              <option value="0">Option A</option>
              <option value="1">Option B</option>
              <option value="2">Option C</option>
              <option value="3">Option D</option>
            </select>
          </div>
          <div class="tts-field-group" style="width:110px;">
            <label style="font-size:0.72rem;font-weight:700;color:#475569;margin-bottom:3px;display:block;">Marks</label>
            <input class="cbt-qmarks" type="number" min="1" value="1" style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;text-align:center;">
          </div>
        </div>
      `;
      row.querySelector('.cbt-remove').onclick = () => row.remove();
      list.appendChild(row);
    };

    const close = () => { modal.hidden = true; };
    button.onclick = async () => {
      const access = await getCbtAccess();
      if (!access.active) { alert('An active CBT plan is required for this school.'); return; }
      const select = panel.querySelector('#ttsClassSelect');
      if (!select?.options?.length) { alert('Your assigned classes are still loading. Please try again.'); return; }
      renderSectionPicker(panel, select);
      const current = select.value;
      modal.querySelectorAll('input[name="cbt-sections"]').forEach(input => { input.checked = input.value === current; });
      modal.hidden = false;
      if (!list.children.length) addQuestion();
    };
    modal.querySelector('#teacherCbtClose').onclick = close;
    modal.querySelector('#cbtCancel').onclick = close;
    modal.querySelector('#cbtAddQuestion').onclick = addQuestion;

    modal.querySelector('#cbtGenerate').onclick = async () => {
      const status = modal.querySelector('#cbtStatus');
      try {
        const access = await getCbtAccess();
        if (!access.active) throw new Error('An active CBT plan is required for this school.');
        const sections = selectedSections(panel);
        if (!sections.length) throw new Error('Select at least one class section.');
        const title = modal.querySelector('#cbtTitle').value.trim();
        const code = modal.querySelector('#cbtCode').value.trim().toUpperCase();
        const rows = [...list.children];
        if (!title || !code || !rows.length) throw new Error('Enter title, code, and at least one question.');
        const questions = rows.map((row, index) => ({ id: `Q${index + 1}`, type: 'mcq', text: row.querySelector('.cbt-text').value.trim(), options: [...row.querySelectorAll('.cbt-opt')].map(input => input.value.trim()), marks: Number(row.querySelector('.cbt-qmarks').value) || 1 }));
        if (questions.some(question => !question.text || question.options.some(option => !option))) throw new Error('Complete every question and all four options.');
        const answers = {};
        rows.forEach((row, index) => { answers[`Q${index + 1}`] = { correctAnswer: Number(row.querySelector('.cbt-answer').value) || 0, explanation: '' }; });
        const subject = panel.querySelector('#ttsSubjectSelect')?.value || 'General';
        const scheduledAt = modal.querySelector('#cbtScheduledAt').value ? new Date(modal.querySelector('#cbtScheduledAt').value).toISOString() : null;
        const db = window.firebase?.database?.();
        const generatedFiles = [];

        for (const assignment of sections) {
          const rawStudents = await loadStudents(db, access, assignment);
          const allocation = createDeviceAssignments(rawStudents, access.maxDevices);
          const assignedStudents = await Promise.all(allocation.students.map(async (student, index) => {
            const pic = await embedStudentPhoto(student);
            const rec = candidateRecord(student, assignment, index, student.deviceIndex);
            if (pic) {
              rec.profilePic = pic;
              rec.profilePhoto = pic;
              rec.profilePicData = pic;
              rec.photoURL = pic;
            }
            return rec;
          }));
          const examId = `EXAM-${Date.now()}-${norm(assignment.section).replace(/[^a-z0-9]+/g, '-').toUpperCase()}`;
          const payload = {
            version: '1.0', magic: 'ROLLCBT', schoolCode: access.schoolCode, schoolName: access.schoolName,
            examId, assignmentId: examId, scheduleType: 'CBT_SECTION', scheduledType: 'SECTION', assignmentType: 'SECTION', scheduledAt,
            title, code: `${code}-${String(assignment.section).replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
            subject, grade: assignment.className, assignedClassId: assignment.classId,
            assignedClassName: assignment.className, assignedSection: assignment.section,
            durationMinutes: Number(modal.querySelector('#cbtDuration').value) || 60,
            totalMarks: Number(modal.querySelector('#cbtMarks').value) || questions.reduce((sum, question) => sum + question.marks, 0),
            passMarks: 40, instructions: modal.querySelector('#cbtInstructions').value,
            rules: { fullScreenEnforced: modal.querySelector('#cbtFullscreen')?.checked !== false, maxBlurStrikes: Number(modal.querySelector('#cbtStrikes')?.value || 3), webcamProctoringRequired: modal.querySelector('#cbtWebcam')?.checked === true, randomizeQuestions: modal.querySelector('#cbtShuffleQ')?.checked === true, randomizeOptions: modal.querySelector('#cbtShuffleOpt')?.checked === true, calculatorAllowed: modal.querySelector('#cbtCalculator')?.value || 'basic', scratchpadAllowed: modal.querySelector('#cbtScratchpad')?.checked !== false, showImmediateResult: modal.querySelector('#cbtShowResult')?.checked !== false, negativeMarkingPerQuestion: Number(modal.querySelector('#cbtNegative')?.value || 0) },
            candidates: assignedStudents,
            sections: [{ id: 'section-1', name: 'General', questions }],
            deviceAllocation: { maxDevices: access.maxDevices, threshold: allocation.threshold, deviceCount: allocation.deviceCount, sequenceOrder: 'classRoll ascending' },
            sectionAssignment: { classId: assignment.classId, className: assignment.className, section: assignment.section, studentCount: assignedStudents.length },
            createdAt: new Date().toISOString(), createdBy: window.currentUser?.uid || ''
          };
          payload.encryptedAnswers = await encrypt(JSON.stringify(answers), examId, access.schoolCode);
          const envelope = { header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1', checksum: await sign(JSON.stringify(payload)), payload };
          const content = JSON.stringify(envelope, null, 2);
          await db.ref(`cbtTeacherExams/${access.schoolId}/${examId}`).set({ ...payload, encryptedAnswers: null, createdAtMs: Date.now() });
          const anchor = document.createElement('a');
          anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
          anchor.download = `${code}_${norm(assignment.section).replace(/[^a-z0-9]+/g, '_')}_exam.rollcbt`;
          anchor.click();
          generatedFiles.push(`${assignment.className} Sec ${assignment.section}: ${assignedStudents.length} students, ${allocation.threshold} per device`);
        }
        status.textContent = `Saved ${generatedFiles.length} section schedule${generatedFiles.length === 1 ? '' : 's'} and downloaded the exam file${generatedFiles.length === 1 ? '' : 's'}. ${generatedFiles.join(' | ')}`;
      } catch (error) {
        status.textContent = error.message || 'Could not generate exam files.';
      }
    };

    getCbtAccess().then(access => {
      const updateVisibility = active => {
        window.teacherCbtPlanActive = active;
        button.hidden = !active;
        if (!active) modal.hidden = true;
      };
      updateVisibility(access.active);
      const db = window.firebase?.database?.();
      if (db && access.schoolId) {
        db.ref(`schools/${access.schoolId}/cbtSubscription`).on('value', snapshot => {
          const subscription = snapshot.val() || {};
          db.ref(`schools/${access.schoolId}/subscription`).once('value').then(baseSnapshot => {
            const baseSubscription = baseSnapshot.val() || {};
            const baseEnd = Date.parse(baseSubscription.endDate || '');
            const baseActive = String(baseSubscription.status || 'active').toLowerCase() !== 'inactive' && (!baseEnd || baseEnd >= Date.now());
            const end = Date.parse(subscription.endDate || '');
            updateVisibility(baseActive && String(subscription.status || 'active').toLowerCase() !== 'inactive' && (!end || end >= Date.now()));
          });
        });
      }
    });
  }

  const start = () => { if (document.getElementById('testScoresSection')) mount(); else setTimeout(start, 500); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
