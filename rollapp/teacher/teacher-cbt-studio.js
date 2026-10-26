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

  function selectedSections(modal) {
    return [...modal.querySelectorAll('input[name="cbt-sections"]:checked')].map(input => ({
      value: input.value,
      classId: input.dataset.classId || '',
      section: input.dataset.section || '',
      className: input.dataset.className || input.dataset.label || 'Class'
    }));
  }

  async function loadAvailableClassSections(db, access, panel) {
    const list = [];
    const seen = new Set();
    const addSection = (classId, className, section) => {
      const secNorm = norm(section || 'A').toUpperCase();
      const cId = String(classId || '').trim();
      const cName = String(className || cId || 'Class').trim();
      const val = `${cId}:::${secNorm}`;
      if (!cId || seen.has(val)) return;
      seen.add(val);
      list.push({ classId: cId, className: cName, section: secNorm, value: val, label: `${cName} - Sec ${secNorm}` });
    };

    // 1. Read from outer panel dropdown if available
    const select = panel?.querySelector('#ttsClassSelect');
    if (select?.options?.length) {
      [...select.options].forEach(opt => {
        if (!opt.value || !opt.value.includes(':::')) return;
        const [cId, sec] = opt.value.split(':::');
        const cName = opt.textContent?.replace(/\s+-\s+Sec\s+.*$/i, '').trim() || cId;
        addSection(cId, cName, sec);
      });
    }

    // 2. Read from teacher profile assignedSections or classes if empty
    if (!list.length && access?.profile) {
      const p = access.profile;
      const assigned = p.assignedSections || p.classTeacherSections || [];
      const sections = Array.isArray(assigned) ? assigned : [assigned];
      sections.filter(Boolean).forEach(sec => {
        addSection(p.classId || 'class_1', p.className || 'Assigned Class', sec);
      });
    }

    // 3. Fallback: query database courses
    if (!list.length && db && access?.schoolId) {
      try {
        const snap = await db.ref(`schools/${access.schoolId}/courses`).once('value');
        const courses = snap.val() || {};
        Object.entries(courses).forEach(([cId, course]) => {
          const secs = course.sections || course.assignedSections || ['A'];
          (Array.isArray(secs) ? secs : Object.keys(secs)).forEach(sec => {
            addSection(cId, course.courseName || course.name || 'Class', sec);
          });
        });
      } catch (_) {}
    }

    return list.sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section));
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
    modal.setAttribute('hidden', '');
    modal.style = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);padding:20px;overflow-y:auto;display:none;align-items:flex-start;justify-content:center;box-sizing:border-box;';
    modal.innerHTML = `
      <div style="width:100%;max-width:980px;margin:24px auto;background:#ffffff;border-radius:20px;padding:26px;box-shadow:0 25px 60px rgba(15,23,42,0.35);border:1px solid #e2e8f0;box-sizing:border-box;font-family:inherit;">
        <!-- Modal Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:18px;">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:#e0f2fe;color:#0369a1;font-size:0.72rem;font-weight:800;padding:3px 9px;border-radius:6px;margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase;">
              <i class="fas fa-shield-halved"></i> CBT Exam Authoring Studio
            </div>
            <h2 style="margin:0 0 4px 0;font-size:1.35rem;font-weight:800;color:#0f172a;">CBT Offline Exam Package Generator</h2>
            <p style="margin:0;color:#64748b;font-size:0.84rem;line-height:1.45;">Select assigned classes and sections, organize questions into exam sections, and generate encrypted <code>.rollcbt</code> offline packages with candidate photos.</p>
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
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fas fa-award" style="color:#0284c7;"></i> Total Marks (Auto-Calculated)</label>
            <input id="cbtMarks" type="number" min="1" value="0" readonly style="padding:10px 13px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:0.88rem;background:#e2e8f0;color:#0f172a;font-weight:750;width:100%;box-sizing:border-box;">
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

        <!-- Class & Section Selection Bar -->
        <div class="cbt-class-selection-card" style="margin:16px 0;padding:16px 18px;border:1.5px solid #cbd5e1;border-radius:14px;background:#f8fafc;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
            <div>
              <label style="display:flex;align-items:center;gap:6px;font-weight:800;color:#0f172a;font-size:0.92rem;margin:0;">
                <i class="fas fa-chalkboard-user" style="color:#0284c7;"></i>
                <span>Target Class &amp; Sections</span>
              </label>
              <small style="color:#64748b;font-size:0.80rem;">Choose the class and select sections that will take this exam.</small>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="cbtSelectAllSections" type="button" class="tts-btn-secondary" style="width:auto !important;padding:5px 12px;font-size:0.78rem;min-height:32px;">
                <i class="fas fa-check-double"></i> Select All
              </button>
              <button id="cbtClearAllSections" type="button" class="tts-btn-secondary" style="width:auto !important;padding:5px 12px;font-size:0.78rem;min-height:32px;">
                <i class="fas fa-times"></i> Clear All
              </button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:minmax(200px, 280px) 1fr;gap:14px;align-items:start;">
            <div class="tts-field-group">
              <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                <i class="fas fa-layer-group" style="color:#0284c7;"></i> Class Filter
              </label>
              <select id="cbtClassSelector" style="padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.86rem;background:#ffffff;width:100%;box-sizing:border-box;">
                <option value="ALL">All Assigned Classes</option>
              </select>
            </div>

            <div>
              <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:block;">
                Assigned Sections (<span id="cbtSelectedCount" style="color:#0284c7;font-weight:800;">0</span> selected)
              </label>
              <div id="cbtSectionPicker" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
                <!-- Populated dynamically -->
              </div>
            </div>
          </div>
        </div>

        <!-- Exam Sections & Question Paper Manager -->
        <div style="margin:22px 0 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:7px;">
                <i class="fas fa-layer-group" style="color:#0284c7;"></i> Exam Sections &amp; Questions
              </h3>
              <span style="font-size:0.78rem;color:#64748b;">Add multiple exam sections (e.g. Section A, Section B) with questions and answer keys.</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button id="cbtOpenAiModalBtn" type="button" class="tts-btn-primary" style="width:auto !important;padding:8px 16px;font-size:0.82rem;min-height:36px;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);border-color:#4f46e5;font-weight:800;box-shadow:0 3px 10px rgba(99,102,241,0.25);">
                <i class="fas fa-wand-magic-sparkles"></i> AI Question Generator
              </button>
              <button id="cbtAddSection" type="button" class="tts-btn-secondary" style="width:auto !important;padding:8px 16px;font-size:0.82rem;min-height:36px;background:#e0f2fe;color:#0369a1;border-color:#bae6fd;font-weight:700;">
                <i class="fas fa-folder-plus"></i> Add Exam Section
              </button>
            </div>
          </div>

          <!-- Dynamic Exam Sections Container -->
          <div id="cbtSectionsContainer" style="display:flex;flex-direction:column;gap:18px;">
            <!-- Sections populated by JS -->
          </div>
        </div>

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
    (document.body || panel).appendChild(modal);

    // AI Question Generator Modal (Powered by Kilo Code AI Gateway Free Endpoint)
    const aiModal = document.createElement('div');
    aiModal.id = 'cbtAiGenModal';
    aiModal.style = 'position:fixed;inset:0;z-index:100005;background:rgba(15,23,42,0.8);backdrop-filter:blur(6px);padding:20px;overflow-y:auto;display:none;align-items:center;justify-content:center;box-sizing:border-box;';
    aiModal.innerHTML = `
      <div style="width:100%;max-width:620px;background:#ffffff;border-radius:18px;padding:24px;box-shadow:0 25px 60px rgba(0,0,0,0.35);border:1px solid #e2e8f0;box-sizing:border-box;font-family:inherit;">
        <!-- Modal Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px;">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#4f46e5;font-size:0.72rem;font-weight:800;padding:3px 8px;border-radius:6px;margin-bottom:5px;text-transform:uppercase;">
              <i class="fas fa-wand-magic-sparkles"></i> Powered by Kilo Code AI Gateway (Free Tier)
            </div>
            <h3 style="margin:0;font-size:1.20rem;font-weight:800;color:#0f172a;">AI Question Generator</h3>
            <p style="margin:2px 0 0;font-size:0.78rem;color:#64748b;">Specify topics and syllabus to generate curriculum-aligned questions automatically.</p>
          </div>
          <button id="cbtAiClose" type="button" aria-label="Close" style="width:32px;height:32px;border-radius:50%;border:1px solid #cbd5e1;background:#f8fafc;color:#64748b;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&times;</button>
        </div>

        <!-- Details Form -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <!-- Target Class & Section -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-chalkboard" style="color:#4f46e5;"></i> Class &amp; Section
            </label>
            <input id="cbtAiClassSec" style="padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#f8fafc;width:100%;box-sizing:border-box;" placeholder="e.g. Class 10 - Sec A">
          </div>

          <!-- Subject -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-book" style="color:#4f46e5;"></i> Subject
            </label>
            <input id="cbtAiSubject" style="padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#f8fafc;width:100%;box-sizing:border-box;" placeholder="e.g. Science / Mathematics">
          </div>

          <!-- Topic / Chapters (Full width) -->
          <div class="tts-field-group" style="grid-column:1/-1;">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-lightbulb" style="color:#4f46e5;"></i> Exam Topic / Chapter / Syllabus <span style="color:#ef4444;">*</span>
            </label>
            <textarea id="cbtAiTopic" rows="3" style="padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.85rem;background:#fff;width:100%;box-sizing:border-box;font-family:inherit;resize:vertical;" placeholder="e.g. Chemical Reactions &amp; Equations, Types of Reactions (Combination, Decomposition, Displacement, Redox), Balancing Chemical Equations"></textarea>
          </div>

          <!-- Number of Questions -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-list-ol" style="color:#4f46e5;"></i> Number of Questions
            </label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input id="cbtAiNumQuestions" type="number" min="1" max="30" value="5" style="width:70px;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.86rem;text-align:center;background:#fff;">
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button type="button" class="cbt-ai-count-chip" data-num="3" style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;font-size:0.72rem;font-weight:700;cursor:pointer;">3</button>
                <button type="button" class="cbt-ai-count-chip active" data-num="5" style="padding:4px 8px;border:1px solid #4f46e5;border-radius:6px;background:#eef2ff;color:#4f46e5;font-size:0.72rem;font-weight:700;cursor:pointer;">5</button>
                <button type="button" class="cbt-ai-count-chip" data-num="10" style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;font-size:0.72rem;font-weight:700;cursor:pointer;">10</button>
                <button type="button" class="cbt-ai-count-chip" data-num="15" style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;font-size:0.72rem;font-weight:700;cursor:pointer;">15</button>
              </div>
            </div>
          </div>

          <!-- Difficulty -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-chart-line" style="color:#4f46e5;"></i> Difficulty Level
            </label>
            <select id="cbtAiDifficulty" style="padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
              <option value="Mixed" selected>Mixed (Balanced)</option>
              <option value="Easy">Easy (Foundational)</option>
              <option value="Medium">Medium (Standard)</option>
              <option value="Hard">Hard (Advanced / HOTS)</option>
            </select>
          </div>

          <!-- Marks per Question -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-award" style="color:#4f46e5;"></i> Marks per Question
            </label>
            <input id="cbtAiMarksPerQ" type="number" min="1" max="100" value="1" style="padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
          </div>

          <!-- Target Section -->
          <div class="tts-field-group">
            <label style="font-size:0.74rem;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <i class="fas fa-folder" style="color:#4f46e5;"></i> Target Exam Section
            </label>
            <select id="cbtAiTargetSection" style="padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#fff;width:100%;box-sizing:border-box;">
            </select>
          </div>
        </div>

        <!-- AI Generation Progress & Status Banner -->
        <div id="cbtAiStatusBox" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:0.82rem;font-weight:600;"></div>

        <!-- Actions -->
        <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;padding-top:14px;">
          <button id="cbtAiCancelBtn" type="button" class="tts-btn-secondary" style="padding:8px 18px;min-height:38px;">Cancel</button>
          <button id="cbtAiGenerateBtn" type="button" class="tts-btn-primary" style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);border-color:#4f46e5;font-weight:800;padding:8px 22px;min-height:38px;box-shadow:0 3px 10px rgba(99,102,241,0.3);">
            <i class="fas fa-wand-magic-sparkles"></i> Generate Questions
          </button>
        </div>
      </div>
    `;
    (document.body || panel).appendChild(aiModal);

    const closeAiModal = () => {
      aiModal.style.display = 'none';
    };
    aiModal.querySelector('#cbtAiClose').onclick = closeAiModal;
    aiModal.querySelector('#cbtAiCancelBtn').onclick = closeAiModal;
    aiModal.onclick = (e) => { if (e.target === aiModal) closeAiModal(); };

    // Count preset chips
    aiModal.querySelectorAll('.cbt-ai-count-chip').forEach(chip => {
      chip.onclick = () => {
        aiModal.querySelectorAll('.cbt-ai-count-chip').forEach(c => {
          c.classList.remove('active');
          c.style.background = '#f8fafc';
          c.style.color = '#334155';
          c.style.borderColor = '#cbd5e1';
        });
        chip.classList.add('active');
        chip.style.background = '#eef2ff';
        chip.style.color = '#4f46e5';
        chip.style.borderColor = '#4f46e5';
        aiModal.querySelector('#cbtAiNumQuestions').value = chip.dataset.num;
      };
    });

    // Modal show/hide handlers
    const closeModal = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      modal.style.display = 'none';
      modal.setAttribute('hidden', '');
      closeAiModal();
      document.body.style.overflow = '';
    };

    const openModal = () => {
      modal.style.display = 'flex';
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
    };

    const closeBtn = modal.querySelector('#teacherCbtClose');
    if (closeBtn) closeBtn.onclick = closeModal;
    const cancelBtn = modal.querySelector('#cbtCancel');
    if (cancelBtn) cancelBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(e); };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (aiModal.style.display === 'flex') {
          closeAiModal();
        } else if (modal.style.display === 'flex') {
          closeModal(e);
        }
      }
    });

    // Sections & Questions Engine
    const sectionsContainer = modal.querySelector('#cbtSectionsContainer');
    let sectionCount = 0;

    function recalculateTotalMarks() {
      let grandTotalMarks = 0;
      let totalQuestions = 0;
      const sectionCards = [...sectionsContainer.querySelectorAll('.cbt-section-card')];

      sectionCards.forEach((secCard, sIdx) => {
        const badge = secCard.querySelector('.cbt-sec-badge');
        if (badge) badge.textContent = `Section ${sIdx + 1}`;
        const qCards = [...secCard.querySelectorAll('.cbt-question-card')];
        let secMarks = 0;
        qCards.forEach((qCard, qIdx) => {
          const qBadge = qCard.querySelector('.cbt-q-badge');
          if (qBadge) qBadge.textContent = `Q${qIdx + 1}`;
          const marks = Number(qCard.querySelector('.cbt-qmarks')?.value) || 1;
          secMarks += marks;
        });
        const summary = secCard.querySelector('.cbt-sec-summary');
        if (summary) summary.textContent = `${qCards.length} Question${qCards.length === 1 ? '' : 's'} · ${secMarks} Mark${secMarks === 1 ? '' : 's'}`;
        grandTotalMarks += secMarks;
        totalQuestions += qCards.length;

        // Show/hide remove section button if only 1 section exists
        const removeSecBtn = secCard.querySelector('.cbt-remove-sec');
        if (removeSecBtn) removeSecBtn.style.display = sectionCards.length > 1 ? 'inline-flex' : 'none';
      });

      const marksInput = modal.querySelector('#cbtMarks');
      if (marksInput) marksInput.value = grandTotalMarks;
    }

    function addQuestionToSection(sectionCard, initialData = null) {
      const qList = sectionCard.querySelector('.cbt-sec-questions');
      const qIndex = qList.children.length + 1;
      const qCard = document.createElement('div');
      qCard.className = 'cbt-question-card';
      qCard.style = 'border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.02);box-sizing:border-box;transition:all 0.3s ease;';

      const textVal = initialData?.text || '';
      const opts = initialData?.options || ['', '', '', ''];
      const ansVal = initialData?.correctIndex !== undefined ? initialData.correctIndex : 0;
      const marksVal = initialData?.marks !== undefined ? initialData.marks : 1;

      qCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <strong class="cbt-q-badge" style="color:#0f172a;font-size:0.86rem;background:#f1f5f9;padding:2px 8px;border-radius:5px;">Q${qIndex}</strong>
            ${initialData?.explanation ? `<span title="${esc(initialData.explanation)}" style="font-size:0.70rem;color:#4f46e5;background:#eef2ff;padding:2px 6px;border-radius:4px;cursor:help;"><i class="fas fa-info-circle"></i> AI Hint</span>` : ''}
          </div>
          <button type="button" class="tts-btn-secondary cbt-remove-q" style="width:auto !important;padding:3px 8px;color:#dc2626;border-color:#fecaca;background:#fff;font-size:0.74rem;min-height:28px;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <div class="tts-field-group" style="margin-bottom:8px;">
          <input class="cbt-text" value="${esc(textVal)}" placeholder="Question statement..." style="padding:8px 11px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.84rem;background:#f8fafc;width:100%;box-sizing:border-box;">
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;margin-bottom:8px;">
          <input class="cbt-opt" value="${esc(opts[0] || '')}" placeholder="Option A" style="padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;">
          <input class="cbt-opt" value="${esc(opts[1] || '')}" placeholder="Option B" style="padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;">
          <input class="cbt-opt" value="${esc(opts[2] || '')}" placeholder="Option C" style="padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;">
          <input class="cbt-opt" value="${esc(opts[3] || '')}" placeholder="Option D" style="padding:6px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;">
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="tts-field-group" style="flex:1;min-width:130px;">
            <label style="font-size:0.70rem;font-weight:700;color:#64748b;margin-bottom:2px;display:block;">Correct Answer</label>
            <select class="cbt-answer" style="padding:6px 9px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;">
              <option value="0" ${ansVal === 0 ? 'selected' : ''}>Option A</option>
              <option value="1" ${ansVal === 1 ? 'selected' : ''}>Option B</option>
              <option value="2" ${ansVal === 2 ? 'selected' : ''}>Option C</option>
              <option value="3" ${ansVal === 3 ? 'selected' : ''}>Option D</option>
            </select>
          </div>
          <div class="tts-field-group" style="width:90px;">
            <label style="font-size:0.70rem;font-weight:700;color:#64748b;margin-bottom:2px;display:block;">Marks</label>
            <input class="cbt-qmarks" type="number" min="1" value="${marksVal}" style="padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:0.82rem;background:#fff;width:100%;box-sizing:border-box;text-align:center;">
          </div>
        </div>
      `;
      qCard.querySelector('.cbt-remove-q').onclick = () => {
        qCard.remove();
        recalculateTotalMarks();
      };
      qCard.querySelector('.cbt-qmarks').oninput = recalculateTotalMarks;
      qList.appendChild(qCard);
      recalculateTotalMarks();
      return qCard;
    }

    function createExamSection(initialTitle = '', addEmptyQuestion = true) {
      sectionCount += 1;
      const sIndex = sectionsContainer.children.length + 1;
      const title = initialTitle || (sIndex === 1 ? 'Section A - General' : `Section ${String.fromCharCode(64 + sIndex)} - Subjective`);
      const secCard = document.createElement('div');
      secCard.className = 'cbt-section-card';
      secCard.style = 'border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;background:#f8fafc;box-shadow:0 2px 6px rgba(0,0,0,0.03);box-sizing:border-box;';
      secCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:260px;">
            <span class="cbt-sec-badge" style="background:#0284c7;color:#fff;font-size:0.75rem;font-weight:800;padding:3px 9px;border-radius:6px;letter-spacing:0.04em;">Section ${sIndex}</span>
            <input class="cbt-sec-name" value="${esc(title)}" placeholder="Section Name (e.g. Section A: Objective)" style="padding:6px 12px;border:1.5px solid #cbd5e1;border-radius:7px;font-size:0.86rem;font-weight:700;color:#0f172a;background:#fff;flex:1;min-width:180px;box-sizing:border-box;">
            <span class="cbt-sec-stats cbt-sec-summary" style="font-size:0.78rem;color:#64748b;font-weight:700;white-space:nowrap;">0 Questions</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button type="button" class="tts-btn-secondary cbt-ai-gen-btn" style="width:auto !important;padding:5px 12px;font-size:0.78rem;min-height:32px;background:#eef2ff;color:#4338ca;border-color:#c7d2fe;font-weight:700;">
              <i class="fas fa-wand-magic-sparkles"></i> AI Generate
            </button>
            <button type="button" class="tts-btn-secondary cbt-add-q-to-sec" style="width:auto !important;padding:5px 12px;font-size:0.78rem;min-height:32px;background:#fff;">
              <i class="fas fa-plus"></i> Add Question
            </button>
            <button type="button" class="tts-btn-secondary cbt-remove-sec" style="width:auto !important;padding:5px 10px;font-size:0.78rem;min-height:32px;color:#dc2626;border-color:#fecaca;background:#fff;">
              <i class="fas fa-trash"></i> Delete Section
            </button>
          </div>
        </div>
        <div class="cbt-sec-questions" style="display:flex;flex-direction:column;gap:4px;"></div>
      `;

      secCard.querySelector('.cbt-ai-gen-btn').onclick = () => {
        const idx = [...sectionsContainer.children].indexOf(secCard);
        openAiGenModal(idx >= 0 ? idx : null);
      };
      secCard.querySelector('.cbt-add-q-to-sec').onclick = () => addQuestionToSection(secCard);
      secCard.querySelector('.cbt-remove-sec').onclick = () => {
        secCard.remove();
        recalculateTotalMarks();
      };
      sectionsContainer.appendChild(secCard);
      if (addEmptyQuestion) {
        addQuestionToSection(secCard);
      }
      recalculateTotalMarks();
      return secCard;
    }

    modal.querySelector('#cbtAddSection').onclick = () => createExamSection();

    // =========================================================================
    // Kilo Code AI Question Generation Engine (Free Open Endpoint)
    // =========================================================================
    const KILO_DIRECT_API = 'https://ai-gateway.kilo.ai/api/v1/chat/completions';
    const KILO_FREE_MODEL = 'kilo-auto/free';

    async function generateQuestionsWithKiloDirect(params) {
      const { className, section, subject, topic, numQuestions, difficulty, marksPerQ } = params;
      const systemPrompt = 'You are an expert school assessment question author. You must generate multiple-choice questions (MCQ) for school examinations. Output ONLY a valid JSON array, with no Markdown ticks, prose, or conversation.';
      const userPrompt = `Create exactly ${numQuestions} multiple choice questions (MCQ) for school examination.
Class: ${className || 'General'}
Section: ${section || 'General'}
Subject: ${subject || 'General'}
Topic/Syllabus: ${topic}
Difficulty: ${difficulty || 'Mixed'}
Marks per question: ${marksPerQ || 1}

Requirements:
1. Each question must have exactly 4 plausible options (Option A, Option B, Option C, Option D).
2. Exactly one option is correct.
3. correctIndex must be an integer from 0 to 3 (0 for Option A, 1 for Option B, 2 for Option C, 3 for Option D).
4. Include a brief, clear explanation for why the answer is correct.

Respond STRICTLY with a valid JSON array matching this exact schema:
[
  {
    "text": "Question statement here...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "marks": ${marksPerQ || 1},
    "explanation": "Brief solution..."
  }
]`;

      const kiloRes = await fetch(KILO_DIRECT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: KILO_FREE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      if (!kiloRes.ok) {
        const errText = await kiloRes.text().catch(() => '');
        throw new Error(`Kilo AI Gateway returned status ${kiloRes.status}: ${errText.substring(0, 180)}`);
      }

      const data = await kiloRes.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error('Empty response received from Kilo AI.');

      let parsed = null;
      try {
        parsed = JSON.parse(rawContent.trim());
      } catch (_) {
        const match = rawContent.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI output could not be parsed as a question array.');
      }

      const questions = [];
      parsed.forEach(q => {
        if (!q || !q.text || !Array.isArray(q.options) || q.options.length < 2) return;
        const opts = q.options.slice(0, 4).map(o => String(o || '').trim());
        while (opts.length < 4) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
        let ansIdx = parseInt(q.correctIndex !== undefined ? q.correctIndex : q.answer, 10);
        if (isNaN(ansIdx) || ansIdx < 0 || ansIdx > 3) ansIdx = 0;
        const marks = Number(q.marks) || marksPerQ || 1;
        questions.push({
          text: String(q.text).trim(),
          options: opts,
          correctIndex: ansIdx,
          marks: marks,
          explanation: String(q.explanation || '').trim()
        });
      });

      if (questions.length === 0) throw new Error('No valid questions could be extracted from AI output.');
      return questions;
    }

    async function generateQuestionsWithAi(params) {
      // 1. Try backend Cloudflare Worker endpoint if available
      const workerBase = window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || 'https://rollcall-worker.divyanshugupta415.workers.dev/';
      const backendUrl = `${String(workerBase).replace(/\/+$/, '')}/ai-generate-questions`;

      let lastError = null;
      try {
        const res = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
            return data.questions;
          }
          if (data.error) throw new Error(data.error);
        } else {
          const errJson = await res.json().catch(() => ({}));
          if (errJson.error) throw new Error(errJson.error);
        }
      } catch (err) {
        lastError = err;
        console.warn('Backend AI route unavailable, trying direct Kilo endpoint fallback...', err);
      }

      // 2. Fallback: Direct Kilo AI Gateway call (works in Electron / non-CORS environments)
      try {
        const directQuestions = await generateQuestionsWithKiloDirect(params);
        return directQuestions;
      } catch (directErr) {
        throw new Error(lastError ? `${lastError.message} (Fallback: ${directErr.message})` : directErr.message);
      }
    }

    function openAiGenModal(targetSecIndex = null) {
      // Refresh section target dropdown
      const targetSecSelect = aiModal.querySelector('#cbtAiTargetSection');
      targetSecSelect.innerHTML = '';
      const sectionCards = [...sectionsContainer.querySelectorAll('.cbt-section-card')];
      sectionCards.forEach((sec, idx) => {
        const secName = sec.querySelector('.cbt-sec-name')?.value.trim() || `Section ${idx + 1}`;
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${secName} (${sec.querySelectorAll('.cbt-question-card').length} Qs)`;
        if (targetSecIndex !== null && idx === targetSecIndex) {
          opt.selected = true;
        }
        targetSecSelect.appendChild(opt);
      });
      const newSecOpt = document.createElement('option');
      newSecOpt.value = 'NEW';
      newSecOpt.textContent = '+ Create New Exam Section';
      targetSecSelect.appendChild(newSecOpt);

      // Pre-fill Class & Section from selected sections in CBT Studio
      const secs = selectedSections(modal);
      const classSecInp = aiModal.querySelector('#cbtAiClassSec');
      if (secs.length > 0) {
        classSecInp.value = secs.map(s => `${s.className} (Sec ${s.section})`).join(', ');
      } else {
        const filterCls = modal.querySelector('#cbtClassSelector')?.selectedOptions[0]?.textContent || '';
        classSecInp.value = filterCls.includes('All') ? (panel.querySelector('#ttsClassSelect')?.selectedOptions[0]?.textContent || '') : filterCls;
      }

      // Pre-fill Subject
      const subjInp = aiModal.querySelector('#cbtAiSubject');
      const subjVal = panel.querySelector('#ttsSubjectSelect')?.value || '';
      subjInp.value = subjVal || 'General';

      // Pre-fill Topic if exam title has something
      const titleVal = modal.querySelector('#cbtTitle')?.value.trim() || '';
      const topicInp = aiModal.querySelector('#cbtAiTopic');
      if (titleVal && !topicInp.value) {
        topicInp.value = titleVal;
      }

      // Reset status box
      const statusBox = aiModal.querySelector('#cbtAiStatusBox');
      statusBox.style.display = 'none';

      aiModal.style.display = 'flex';
      topicInp.focus();
    }

    modal.querySelector('#cbtOpenAiModalBtn').onclick = () => {
      openAiGenModal(null);
    };

    aiModal.querySelector('#cbtAiGenerateBtn').onclick = async () => {
      const topic = (aiModal.querySelector('#cbtAiTopic').value || '').trim();
      if (!topic) {
        alert('Please enter the Topic, Chapter, or Syllabus for the questions.');
        aiModal.querySelector('#cbtAiTopic').focus();
        return;
      }

      const className = (aiModal.querySelector('#cbtAiClassSec').value || '').trim();
      const subject = (aiModal.querySelector('#cbtAiSubject').value || '').trim();
      const numQuestions = Math.min(30, Math.max(1, parseInt(aiModal.querySelector('#cbtAiNumQuestions').value, 10) || 5));
      const difficulty = aiModal.querySelector('#cbtAiDifficulty').value || 'Mixed';
      const marksPerQ = Math.max(1, parseInt(aiModal.querySelector('#cbtAiMarksPerQ').value, 10) || 1);
      const targetSecChoice = aiModal.querySelector('#cbtAiTargetSection').value;

      const genBtn = aiModal.querySelector('#cbtAiGenerateBtn');
      const cancelBtn = aiModal.querySelector('#cbtAiCancelBtn');
      const statusBox = aiModal.querySelector('#cbtAiStatusBox');

      genBtn.disabled = true;
      cancelBtn.disabled = true;
      genBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating ${numQuestions} Questions with Kilo AI...`;
      statusBox.style.display = 'block';
      statusBox.style.background = '#eef2ff';
      statusBox.style.border = '1px solid #c7d2fe';
      statusBox.style.color = '#4338ca';
      statusBox.innerHTML = `<i class="fas fa-wand-magic-sparkles fa-spin"></i> Contacting Kilo Code AI Gateway... Generating ${numQuestions} curriculum-aligned questions on "${esc(topic)}"...`;

      try {
        const questions = await generateQuestionsWithAi({
          className,
          subject,
          topic,
          numQuestions,
          difficulty,
          marksPerQ
        });

        // Determine target section
        let targetSecCard = null;
        const sectionCards = [...sectionsContainer.querySelectorAll('.cbt-section-card')];
        if (targetSecChoice === 'NEW' || !sectionCards.length) {
          targetSecCard = createExamSection(`Section ${String.fromCharCode(65 + sectionCards.length)}: ${topic.substring(0, 24)}`, false);
        } else {
          const idx = parseInt(targetSecChoice, 10);
          targetSecCard = sectionCards[idx] || sectionCards[0];
        }

        // Insert generated questions
        questions.forEach(q => {
          const card = addQuestionToSection(targetSecCard, q);
          card.style.background = '#f0fdf4';
          card.style.borderColor = '#86efac';
          setTimeout(() => {
            card.style.background = '#ffffff';
            card.style.borderColor = '#e2e8f0';
          }, 2000);
        });

        recalculateTotalMarks();

        // Close AI modal
        closeAiModal();

        // Update CBT Studio status
        const cbtStatus = modal.querySelector('#cbtStatus');
        if (cbtStatus) {
          cbtStatus.innerHTML = `<span style="color:#15803d; font-weight:700;"><i class="fas fa-check-circle"></i> Successfully generated and added ${questions.length} questions for "${esc(topic)}"!</span>`;
          setTimeout(() => { if (cbtStatus.innerHTML.includes('Successfully')) cbtStatus.innerHTML = ''; }, 6000);
        }

        // Scroll target section into view
        targetSecCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        console.error('AI question generation error:', err);
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.style.color = '#b91c1c';
        statusBox.innerHTML = `<i class="fas fa-triangle-exclamation"></i> AI Generation Failed: ${esc(err.message || 'Unknown error')}. Please check your connection or try again.`;
      } finally {
        genBtn.disabled = false;
        cancelBtn.disabled = false;
        genBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Generate Questions`;
      }
    };

    modal.querySelector('#cbtAddSection').onclick = () => createExamSection();

    // Class & Section Picker Logic
    let allAvailableSections = [];
    function updateSelectedSectionCount() {
      const checked = modal.querySelectorAll('input[name="cbt-sections"]:checked').length;
      const countEl = modal.querySelector('#cbtSelectedCount');
      if (countEl) countEl.textContent = checked;
    }

    function renderSectionsGrid(filterClassId = 'ALL') {
      const picker = modal.querySelector('#cbtSectionPicker');
      if (!picker) return;
      const filtered = filterClassId === 'ALL'
        ? allAvailableSections
        : allAvailableSections.filter(s => s.classId === filterClassId);

      if (!filtered.length) {
        picker.innerHTML = '<span style="color:#64748b;font-size:0.82rem;grid-column:1/-1;">No sections found for this class.</span>';
        updateSelectedSectionCount();
        return;
      }

      picker.innerHTML = filtered.map(item => `
        <label class="cbt-section-item" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;cursor:pointer;font-size:0.82rem;font-weight:600;color:#334155;user-select:none;transition:all 0.15s ease;">
          <input type="checkbox" name="cbt-sections" value="${esc(item.value)}" data-class-id="${esc(item.classId)}" data-section="${esc(item.section)}" data-class-name="${esc(item.className)}" style="width:16px;height:16px;accent-color:#0284c7;cursor:pointer;">
          <span style="flex:1;">${esc(item.label)}</span>
        </label>
      `).join('');

      picker.querySelectorAll('input[name="cbt-sections"]').forEach(input => {
        input.onchange = () => {
          input.closest('label').style.background = input.checked ? '#f0f9ff' : '#ffffff';
          input.closest('label').style.borderColor = input.checked ? '#0284c7' : '#cbd5e1';
          updateSelectedSectionCount();
        };
      });
      updateSelectedSectionCount();
    }

    modal.querySelector('#cbtSelectAllSections').onclick = () => {
      modal.querySelectorAll('#cbtSectionPicker input[name="cbt-sections"]').forEach(input => {
        input.checked = true;
        input.closest('label').style.background = '#f0f9ff';
        input.closest('label').style.borderColor = '#0284c7';
      });
      updateSelectedSectionCount();
    };

    modal.querySelector('#cbtClearAllSections').onclick = () => {
      modal.querySelectorAll('#cbtSectionPicker input[name="cbt-sections"]').forEach(input => {
        input.checked = false;
        input.closest('label').style.background = '#ffffff';
        input.closest('label').style.borderColor = '#cbd5e1';
      });
      updateSelectedSectionCount();
    };

    modal.querySelector('#cbtClassSelector').onchange = (e) => {
      renderSectionsGrid(e.target.value);
    };

    button.onclick = async () => {
      const access = await getCbtAccess();
      if (!access.active) { alert('An active CBT plan is required for this school.'); return; }
      const db = window.firebase?.database?.();

      allAvailableSections = await loadAvailableClassSections(db, access, panel);
      const classSelector = modal.querySelector('#cbtClassSelector');
      const uniqueClasses = [];
      const seenClasses = new Set();
      allAvailableSections.forEach(s => {
        if (!seenClasses.has(s.classId)) {
          seenClasses.add(s.classId);
          uniqueClasses.push({ classId: s.classId, className: s.className });
        }
      });

      classSelector.innerHTML = '<option value="ALL">All Assigned Classes (' + uniqueClasses.length + ')</option>' +
        uniqueClasses.map(c => `<option value="${esc(c.classId)}">${esc(c.className)}</option>`).join('');

      const outerClassSelect = panel.querySelector('#ttsClassSelect');
      const outerVal = outerClassSelect?.value || '';
      renderSectionsGrid('ALL');

      // Pre-select matching section or select all if only 1 section
      const allCheckboxes = modal.querySelectorAll('input[name="cbt-sections"]');
      if (allCheckboxes.length === 1 || outerVal) {
        allCheckboxes.forEach(input => {
          if (input.value === outerVal || allCheckboxes.length === 1) {
            input.checked = true;
            input.closest('label').style.background = '#f0f9ff';
            input.closest('label').style.borderColor = '#0284c7';
          }
        });
      } else {
        // Select all by default so teacher doesn't have an empty roster
        allCheckboxes.forEach(input => {
          input.checked = true;
          input.closest('label').style.background = '#f0f9ff';
          input.closest('label').style.borderColor = '#0284c7';
        });
      }
      updateSelectedSectionCount();

      // Ensure at least 1 section exists
      if (!sectionsContainer.children.length) {
        createExamSection('Section A - General');
      }

      openModal();
    };

    // CBT Package Generation & Export
    modal.querySelector('#cbtGenerate').onclick = async () => {
      const status = modal.querySelector('#cbtStatus');
      try {
        const access = await getCbtAccess();
        if (!access.active) throw new Error('An active CBT plan is required for this school.');
        const sections = selectedSections(modal);
        if (!sections.length) throw new Error('Select at least one class section.');
        const title = modal.querySelector('#cbtTitle').value.trim();
        const code = modal.querySelector('#cbtCode').value.trim().toUpperCase();
        if (!title || !code) throw new Error('Enter exam title and exam code.');

        // Build exam sections and questions
        const sectionCards = [...sectionsContainer.querySelectorAll('.cbt-section-card')];
        if (!sectionCards.length) throw new Error('Add at least one exam section.');

        const answers = {};
        const examSections = [];
        let totalExamMarks = 0;

        for (let sIdx = 0; sIdx < sectionCards.length; sIdx++) {
          const secCard = sectionCards[sIdx];
          const secName = secCard.querySelector('.cbt-sec-name')?.value.trim() || `Section ${sIdx + 1}`;
          const qCards = [...secCard.querySelectorAll('.cbt-question-card')];
          if (!qCards.length) throw new Error(`Add at least one question to ${secName}.`);

          const questions = [];
          for (let qIdx = 0; qIdx < qCards.length; qIdx++) {
            const qCard = qCards[qIdx];
            const qText = qCard.querySelector('.cbt-text')?.value.trim();
            const opts = [...qCard.querySelectorAll('.cbt-opt')].map(i => i.value.trim());
            const marks = Number(qCard.querySelector('.cbt-qmarks')?.value) || 1;
            const ans = Number(qCard.querySelector('.cbt-answer')?.value) || 0;

            if (!qText || opts.some(opt => !opt)) {
              throw new Error(`Complete question text and all four options for Question ${qIdx + 1} in ${secName}.`);
            }

            const qId = `S${sIdx + 1}_Q${qIdx + 1}`;
            answers[qId] = { correctAnswer: ans, explanation: '' };
            questions.push({ id: qId, type: 'mcq', text: qText, options: opts, marks });
            totalExamMarks += marks;
          }

          examSections.push({
            id: `section-${sIdx + 1}`,
            name: secName,
            title: secName,
            questions
          });
        }

        const subject = panel.querySelector('#ttsSubjectSelect')?.value || 'General';
        const scheduledAt = modal.querySelector('#cbtScheduledAt').value ? new Date(modal.querySelector('#cbtScheduledAt').value).toISOString() : null;
        const db = window.firebase?.database?.();
        const generatedFiles = [];
        const multiSectionCandidates = [];

        for (const assignment of sections) {
          const rawStudents = await loadStudents(db, access, assignment);
          // Sort strictly by class roll ascending within section
          rawStudents.sort((a, b) => {
            const ar = Number.parseInt(a.classRoll || a.univRoll || a.rollNo || a.rollNumber, 10);
            const br = Number.parseInt(b.classRoll || b.univRoll || b.rollNo || b.rollNumber, 10);
            if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
            return String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''));
          });
          const allocation = createDeviceAssignments(rawStudents, access.maxDevices);
          const assignedStudents = await Promise.all(allocation.students.map(async (student, index) => {
            const pic = await embedStudentPhoto(student);
            const rec = candidateRecord(student, assignment, index, student.deviceIndex);
            rec.section = assignment.section;
            rec.sectionSequence = index + 1; // 1-indexed sequence within this section
            rec.sequence = index + 1;
            if (pic) {
              rec.profilePic = pic;
              rec.profilePhoto = pic;
              rec.profilePicData = pic;
              rec.photoURL = pic;
            }
            return rec;
          }));
          multiSectionCandidates.push(...assignedStudents);

          const examId = `EXAM-${Date.now()}-${norm(assignment.section).replace(/[^a-z0-9]+/g, '-').toUpperCase()}`;
          const payload = {
            version: '1.0', magic: 'ROLLCBT', schoolCode: access.schoolCode, schoolName: access.schoolName,
            examId, assignmentId: examId, scheduleType: 'CBT_SECTION', scheduledType: 'SECTION', assignmentType: 'SECTION', scheduledAt,
            title, code: `${code}-${String(assignment.section).replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
            subject, grade: assignment.className, assignedClassId: assignment.classId,
            assignedClassName: assignment.className, assignedSection: assignment.section,
            durationMinutes: Number(modal.querySelector('#cbtDuration').value) || 60,
            totalMarks: totalExamMarks,
            passMarks: 40, instructions: modal.querySelector('#cbtInstructions').value,
            rules: {
              fullScreenEnforced: modal.querySelector('#cbtFullscreen')?.checked !== false,
              maxBlurStrikes: Number(modal.querySelector('#cbtStrikes')?.value || 3),
              webcamProctoringRequired: modal.querySelector('#cbtWebcam')?.checked === true,
              randomizeQuestions: modal.querySelector('#cbtShuffleQ')?.checked === true,
              randomizeOptions: modal.querySelector('#cbtShuffleOpt')?.checked === true,
              calculatorAllowed: modal.querySelector('#cbtCalculator')?.value || 'basic',
              scratchpadAllowed: modal.querySelector('#cbtScratchpad')?.checked !== false,
              showImmediateResult: modal.querySelector('#cbtShowResult')?.checked !== false,
              negativeMarkingPerQuestion: Number(modal.querySelector('#cbtNegative')?.value || 0)
            },
            candidates: assignedStudents,
            sections: examSections,
            deviceAllocation: { maxDevices: access.maxDevices, threshold: allocation.threshold, deviceCount: allocation.deviceCount, sequenceOrder: 'classRoll ascending' },
            sectionAssignment: { classId: assignment.classId, className: assignment.className, section: assignment.section, studentCount: assignedStudents.length },
            createdAt: new Date().toISOString(), createdBy: window.currentUser?.uid || ''
          };
          payload.encryptedAnswers = await encrypt(JSON.stringify(answers), examId, access.schoolCode);
          const envelope = { header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1', checksum: await sign(JSON.stringify(payload)), payload };
          const content = JSON.stringify(envelope, null, 2);
          await db.ref(`cbtTeacherExams/${access.schoolId}/${examId}`).set({ ...payload, encryptedAnswers: null, createdAtMs: Date.now() });

          // Register as a scheduled assessment tile in schoolTests
          const scheduledDateStr = scheduledAt ? scheduledAt.substring(0, 10) : new Date().toISOString().substring(0, 10);
          await db.ref(`schoolTests/${access.schoolId}/${examId}`).set({
            id: examId,
            title: title,
            teacherId: window.currentUser?.uid || '',
            teacherName: access.profile?.name || access.profile?.displayName || 'Teacher',
            classId: assignment.classId,
            className: assignment.className,
            section: assignment.section,
            subject: subject,
            testDate: scheduledDateStr,
            maxMarks: totalExamMarks,
            passingMarks: Math.round(totalExamMarks * 0.4),
            examType: 'Mock CBT Test',
            durationMinutes: Number(modal.querySelector('#cbtDuration').value) || 60,
            assessmentComponent: 'Theory',
            instructions: modal.querySelector('#cbtInstructions').value || '',
            studentCount: assignedStudents.length,
            scoredCount: 0,
            status: 'scheduled',
            isCbtExam: true,
            cbtCode: `${code}-${String(assignment.section).replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
            createdAt: Date.now()
          }).catch(e => console.warn('Could not auto-register test tile:', e));

          const anchor = document.createElement('a');
          anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
          anchor.download = `${code}_${norm(assignment.section).replace(/[^a-z0-9]+/g, '_')}_exam.rollcbt`;
          anchor.click();
          generatedFiles.push(`${assignment.className} Sec ${assignment.section}: ${assignedStudents.length} students, ${allocation.threshold} per device`);
        }

        // Generate unified Multi-Section Bundle if more than 1 section was chosen
        if (sections.length > 1) {
          const multiExamId = `EXAM-${Date.now()}-MULTI-SECTION`;
          const multiSectionNames = sections.map(s => s.section).join(', ');
          const multiPayload = {
            version: '1.0', magic: 'ROLLCBT', schoolCode: access.schoolCode, schoolName: access.schoolName,
            examId: multiExamId, assignmentId: multiExamId, scheduleType: 'CBT_MULTI_SECTION', scheduledType: 'MULTI_SECTION', assignmentType: 'MULTI_SECTION', scheduledAt,
            title: `${title} (Sections: ${multiSectionNames})`,
            code: `${code}-ALL-SECTIONS`,
            subject, grade: sections[0].className, assignedClassId: sections[0].classId,
            assignedClassName: sections[0].className, assignedSection: multiSectionNames,
            durationMinutes: Number(modal.querySelector('#cbtDuration').value) || 60,
            totalMarks: totalExamMarks,
            passMarks: 40, instructions: modal.querySelector('#cbtInstructions').value,
            rules: {
              fullScreenEnforced: modal.querySelector('#cbtFullscreen')?.checked !== false,
              maxBlurStrikes: Number(modal.querySelector('#cbtStrikes')?.value || 3),
              webcamProctoringRequired: modal.querySelector('#cbtWebcam')?.checked === true,
              randomizeQuestions: modal.querySelector('#cbtShuffleQ')?.checked === true,
              randomizeOptions: modal.querySelector('#cbtShuffleOpt')?.checked === true,
              calculatorAllowed: modal.querySelector('#cbtCalculator')?.value || 'basic',
              scratchpadAllowed: modal.querySelector('#cbtScratchpad')?.checked !== false,
              showImmediateResult: modal.querySelector('#cbtShowResult')?.checked !== false,
              negativeMarkingPerQuestion: Number(modal.querySelector('#cbtNegative')?.value || 0)
            },
            candidates: multiSectionCandidates,
            sections: examSections,
            deviceAllocation: { maxDevices: access.maxDevices, threshold: Math.ceil(multiSectionCandidates.length / access.maxDevices), deviceCount: access.maxDevices, sequenceOrder: 'section ascending, classRoll ascending' },
            sectionAssignment: { isMultiSection: true, sections: sections.map(s => ({ classId: s.classId, className: s.className, section: s.section, studentCount: multiSectionCandidates.filter(c => c.section === s.section).length })) },
            createdAt: new Date().toISOString(), createdBy: window.currentUser?.uid || ''
          };
          multiPayload.encryptedAnswers = await encrypt(JSON.stringify(answers), multiExamId, access.schoolCode);
          const multiEnvelope = { header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1', checksum: await sign(JSON.stringify(multiPayload)), payload: multiPayload };
          const multiContent = JSON.stringify(multiEnvelope, null, 2);
          await db.ref(`cbtTeacherExams/${access.schoolId}/${multiExamId}`).set({ ...multiPayload, encryptedAnswers: null, createdAtMs: Date.now() });

          const multiDateStr = scheduledAt ? scheduledAt.substring(0, 10) : new Date().toISOString().substring(0, 10);
          await db.ref(`schoolTests/${access.schoolId}/${multiExamId}`).set({
            id: multiExamId,
            title: `${title} (Sections: ${multiSectionNames})`,
            teacherId: window.currentUser?.uid || '',
            teacherName: access.profile?.name || access.profile?.displayName || 'Teacher',
            classId: sections[0].classId,
            className: sections[0].className,
            section: multiSectionNames,
            subject: subject,
            testDate: multiDateStr,
            maxMarks: totalExamMarks,
            passingMarks: Math.round(totalExamMarks * 0.4),
            examType: 'Mock CBT Test',
            durationMinutes: Number(modal.querySelector('#cbtDuration').value) || 60,
            assessmentComponent: 'Theory',
            instructions: modal.querySelector('#cbtInstructions').value || '',
            studentCount: multiSectionCandidates.length,
            scoredCount: 0,
            status: 'scheduled',
            isCbtExam: true,
            cbtCode: `${code}-ALL-SECTIONS`,
            createdAt: Date.now()
          }).catch(e => console.warn('Could not auto-register test tile:', e));

          const multiAnchor = document.createElement('a');
          multiAnchor.href = URL.createObjectURL(new Blob([multiContent], { type: 'application/json' }));
          multiAnchor.download = `${code}_ALL_SECTIONS_exam.rollcbt`;
          multiAnchor.click();
          generatedFiles.push(`Master Multi-Section File: ${multiSectionCandidates.length} candidates sequenced section-wise`);
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
        if (!active) closeModal();
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
