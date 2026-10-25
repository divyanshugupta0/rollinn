(() => {
  'use strict';

  const SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = value => String(value ?? '').trim().replace(/^section\s+/i, '').toLowerCase();
  const bytes = value => new TextEncoder().encode(value);
  const hex = buffer => Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('');
  const b64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)));

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

  async function getCbtAccess() {
    const db = window.firebase?.database?.();
    const uid = window.firebase?.auth?.()?.currentUser?.uid || window.currentUser?.uid || '';
    const profile = window.currentTeacher || (uid && db ? (await db.ref(`users/${uid}`).once('value')).val() : null) || {};
    const schoolId = String(profile.schoolId || window.currentUser?.schoolId || '');
    if (!db || !schoolId) return { active: false, schoolId, profile };
    const subscription = (await db.ref(`schools/${schoolId}/cbtSubscription`).once('value')).val() || {};
    const end = Date.parse(subscription.endDate || '');
    const active = String(subscription.status || 'active').toLowerCase() !== 'inactive' && (!end || end >= Date.now());
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
    return {
      uid: student.id,
      id: student.id,
      name: student.name || student.displayName || student.email || `Student ${index + 1}`,
      profilePic: student.profilePic || student.profilePhoto || student.photoURL || student.photoUrl || student.profilePicture || student.imageUrl || '',
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
    modal.style = 'position:fixed;inset:0;z-index:1500;background:rgba(15,23,42,.6);padding:20px;overflow:auto';
    modal.innerHTML = `<div style="max-width:980px;margin:3vh auto;background:#fff;border-radius:16px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #e2e8f0;padding-bottom:12px"><div><small style="color:#0284c7;font-weight:800">TEACHER AUTHORING</small><h2 style="margin:4px 0">CBT Exam Studio</h2><p style="margin:0;color:#64748b;font-size:.85rem">Select one or more assigned sections. Saving creates a separate scheduled CBT assignment and exam file for each checked section.</p></div><button id="teacherCbtClose" class="tts-btn-secondary">&times;</button></div><div class="tts-config-grid" style="margin-top:14px"><div class="tts-field-group"><label>Exam title</label><input id="cbtTitle" placeholder="Unit test - Algebra"></div><div class="tts-field-group"><label>Exam code</label><input id="cbtCode" placeholder="MATH-CBT-01"></div><div class="tts-field-group"><label>Duration (minutes)</label><input id="cbtDuration" type="number" min="5" value="60"></div><div class="tts-field-group"><label>Total marks</label><input id="cbtMarks" type="number" min="1" value="20"></div><div class="tts-field-group"><label>Scheduled start (optional)</label><input id="cbtScheduledAt" type="datetime-local"></div><div class="tts-field-group"><label>Instructions</label><input id="cbtInstructions" value="Answer all questions. Do not leave the RollCall CBT application."></div></div><div style="margin:16px 0"><label style="display:block;font-weight:800;color:#334155;margin-bottom:8px">Assign sections</label><div id="cbtSectionPicker" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px"></div><small style="display:block;color:#64748b;margin-top:6px">Each selected section receives its own schedule, roster, threshold and .rollcbt file.</small></div><div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 8px"><h3 style="margin:0">Questions</h3><button id="cbtAddQuestion" class="tts-btn-secondary">+ Add question</button></div><div id="cbtQuestionList"></div><p id="cbtStatus" style="color:#475569;font-size:.85rem"></p><div style="display:flex;justify-content:flex-end;gap:8px"><button id="cbtCancel" class="tts-btn-secondary">Cancel</button><button id="cbtGenerate" class="tts-btn-primary"><i class="fas fa-file-export"></i> Save & Download Section Exams</button></div></div>`;
    panel.appendChild(modal);

    const list = modal.querySelector('#cbtQuestionList');
    let count = 0;
    const addQuestion = () => {
      count += 1;
      const row = document.createElement('div');
      row.style = 'border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;background:#f8fafc';
      row.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>Question ${count}</strong><button class="tts-btn-secondary cbt-remove" style="padding:3px 8px;color:#b91c1c">Remove</button></div><div class="tts-field-group"><label>Question text</label><input class="cbt-text" placeholder="Enter question"></div><div class="tts-config-grid" style="margin-top:8px;grid-template-columns:repeat(2,minmax(0,1fr))"><div class="tts-field-group"><label>Option A</label><input class="cbt-opt"></div><div class="tts-field-group"><label>Option B</label><input class="cbt-opt"></div><div class="tts-field-group"><label>Option C</label><input class="cbt-opt"></div><div class="tts-field-group"><label>Option D</label><input class="cbt-opt"></div><div class="tts-field-group"><label>Correct option</label><select class="cbt-answer"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div><div class="tts-field-group"><label>Marks</label><input class="cbt-qmarks" type="number" min="1" value="1"></div></div>`;
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
          const assignedStudents = allocation.students.map((student, index) => candidateRecord(student, assignment, index, student.deviceIndex));
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
            rules: { fullScreenEnforced: true, maxBlurStrikes: 3, webcamProctoringRequired: false, randomizeQuestions: false, randomizeOptions: false, calculatorAllowed: 'basic', scratchpadAllowed: true, showImmediateResult: true, negativeMarkingPerQuestion: 0 },
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
          const end = Date.parse(subscription.endDate || '');
          updateVisibility(String(subscription.status || 'active').toLowerCase() !== 'inactive' && (!end || end >= Date.now()));
        });
      }
    });
  }

  const start = () => { if (document.getElementById('testScoresSection')) mount(); else setTimeout(start, 500); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
