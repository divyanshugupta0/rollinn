/* Shared teacher attendance session enhancements. Uses the existing Realtime Database schema. */
(function () {
    'use strict';

    const statuses = ['present', 'absent', 'late', 'excused', 'onDuty'];
    let previousDraft = null;
    let selected = new Set();

    function text(value) { return String(value == null ? '' : value); }
    function ownsSchool(record) {
        return !!(typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.schoolId && record && record.schoolId === currentTeacher.schoolId);
    }
    function html(value) {
        return text(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    }
    function classMatchesStudent(student, classData) {
        if (!ownsSchool(student) || !classData) return false;
        const ids = [student.classId, student.locationId, student.enrolledClassId, student.courseId].map(text);
        if (ids.includes(text(classData.id))) return true;
        const names = [student.className, student.courseName, student.subject, student.section].map(v => text(v).trim().toLowerCase()).filter(Boolean);
        const candidates = [classData.className, classData.name, classData.section].map(v => text(v).trim().toLowerCase()).filter(Boolean);
        return names.some(value => candidates.includes(value));
    }
    function sessionRef(classId, date) {
        return firebase.database().ref('attendance_by_location/' + classId + '/' + date);
    }
    function studentStatus(id) {
        const value = attendanceData && attendanceData[id];
        return statuses.includes(value) ? value : 'unmarked';
    }
    function renderCounts() {
        const counts = { total: (students || []).length, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
        (students || []).forEach(student => {
            const status = studentStatus(student.id);
            if (status === 'onDuty') counts.excused++;
            else if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
        });
        const ids = { total: 'rcCountTotal', present: 'rcCountPresent', absent: 'rcCountAbsent', late: 'rcCountLate', excused: 'rcCountExcused', unmarked: 'rcCountUnmarked' };
        Object.keys(ids).forEach(key => { const el = document.getElementById(ids[key]); if (el) el.textContent = counts[key]; });
        const rate = counts.total ? Math.round((counts.present + counts.late) / counts.total * 100) : 0;
        const rateEl = document.getElementById('rcCountRate'); if (rateEl) rateEl.textContent = rate + '%';
        const selectedEl = document.getElementById('rcSelectedCount'); if (selectedEl) selectedEl.textContent = selected.size + ' selected';
    }
    function refreshRows() {
        document.querySelectorAll('#popupStudentList [data-rc-student]').forEach(row => {
            const id = row.dataset.rcStudent;
            row.dataset.status = studentStatus(id);
            const select = row.querySelector('[data-rc-check]');
            if (select) select.checked = selected.has(id);
            const choice = row.querySelector('[data-rc-status-select]');
            if (choice) choice.value = studentStatus(id);
        });
        applyRosterFilters();
        renderCounts();
    }
    function applyRosterFilters() {
        const statusFilter = document.getElementById('rcStatusFilter')?.value || 'all';
        const verificationFilter = document.getElementById('rcVerificationFilter')?.value || 'all';
        const query = (document.getElementById('popupStudentFilter')?.value || '').trim().toLowerCase();
        document.querySelectorAll('#popupStudentList [data-rc-student]').forEach(row => {
            const statusMatches = statusFilter === 'all' || row.dataset.status === statusFilter;
            const verification = text(row.querySelector('.rc-verify-badge')?.textContent).toLowerCase();
            const verificationMatches = verificationFilter === 'all' || verification === verificationFilter.toLowerCase();
            const textMatches = !query || row.textContent.toLowerCase().includes(query);
            row.hidden = !(statusMatches && verificationMatches && textMatches);
            row.style.display = row.hidden ? 'none' : '';
        });
    }
    function renderRoster(isToday) {
        const roster = document.getElementById('popupStudentList');
        if (!roster) return;
        selected = new Set();
        attendanceData = attendanceData || {};
        const searchable = [...(students || [])].sort((a, b) => text(a.classRoll || a.univRoll).localeCompare(text(b.classRoll || b.univRoll), undefined, { numeric: true }) || text(a.name).localeCompare(text(b.name)));
        roster.style.display = 'block';
        if (!searchable.length) {
            roster.innerHTML = '<div class="empty-state"><i class="fas fa-user-lock"></i><p>No enrolled students are available for this class in your school.</p><small>Check the school, class, and enrollment IDs on the student and class records.</small></div>';
            renderCounts();
            return;
        }
        const editable = !!isToday && !window.rcSessionLocked;
        const submitButton = document.getElementById('submitAttendancePopupBtn');
        if (submitButton) submitButton.style.display = editable ? 'inline-flex' : 'none';
        roster.innerHTML = `<div class="rc-table-wrap"><table class="attendance-table rc-attendance-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible students" data-rc-select-visible></th><th>Student</th><th>Roll / Reg. no.</th><th>Status</th><th>Verification</th><th>Remarks</th></tr></thead><tbody>${searchable.map(student => {
            const id = text(student.id);
            const displayName = text(student.name || student.email || 'Student');
            const roll = text(student.classRoll || student.univRoll || student.registrationId || '—');
            const status = studentStatus(id);
            const verification = text(attendanceData[id + '_verification'] || 'notRequired');
            return `<tr class="rc-student-row" data-rc-student="${html(id)}" data-status="${html(status)}"><td><input type="checkbox" aria-label="Select ${html(displayName)}" data-rc-check ${editable ? '' : 'disabled'}></td><td><span class="rc-avatar">${html(displayName.trim().charAt(0).toUpperCase() || 'S')}</span><span class="rc-student-name">${html(displayName)}</span><small>${html(student.email || '')}</small></td><td>${html(roll)}</td><td><select aria-label="Attendance status for ${html(displayName)}" data-rc-status-select ${editable ? '' : 'disabled'}><option value="unmarked" ${status === 'unmarked' ? 'selected' : ''}>Unmarked</option><option value="present" ${status === 'present' ? 'selected' : ''}>Present</option><option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option><option value="late" ${status === 'late' ? 'selected' : ''}>Late</option><option value="excused" ${status === 'excused' ? 'selected' : ''}>Excused</option><option value="onDuty" ${status === 'onDuty' ? 'selected' : ''}>On duty</option></select></td><td><span class="rc-verify-badge">${html(verification)}</span></td><td><input type="text" maxlength="240" data-rc-remark placeholder="Optional note" value="${html(attendanceData[id + '_remark'] || '')}" ${editable ? '' : 'disabled'}></td></tr>`;
        }).join('')}</tbody></table></div>`;
        renderCounts();
    }
    function setStatus(id, status) {
        if (!id) return;
        if (status === 'unmarked') delete attendanceData[id];
        else attendanceData[id] = status;
        if (currentTeacher && currentTeacher.schoolId && currentClassData) {
            const date = formatDateForDatabase(document.getElementById('popupAttendanceDate')?.value || new Date());
            const draftKey = `rc_draft_${currentTeacher.schoolId}_${currentClassData.id}_${date}`;
            try { localStorage.setItem(draftKey, JSON.stringify(attendanceData)); } catch (e) {}
        }
        refreshRows();
    }
    function visibleIds() {
        return [...document.querySelectorAll('#popupStudentList [data-rc-student]')].filter(row => !row.hidden).map(row => row.dataset.rcStudent);
    }
    function wireWorkspace() {
        const style = document.createElement('style');
        style.textContent = `
        .rc-attendance-workspace{margin:18px 0;padding:20px;border:1px solid #dce8e0;border-radius:18px;background:linear-gradient(135deg,#f8fbf8,#fff)}
        .rc-session-heading{display:flex;justify-content:space-between;gap:18px;align-items:center}.rc-eyebrow{color:#16704f;font-size:10px;font-weight:800;letter-spacing:.14em}.rc-session-heading h4{margin:5px 0;font-size:20px;color:#19362a}.rc-session-heading p{margin:0;color:#708077;font-size:13px}.rc-mode-label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#46574e;min-width:190px}.rc-mode-label select,.rc-student-row select,.rc-student-row input[data-rc-remark]{padding:10px;border:1px solid #dce6df;border-radius:10px;background:#fff;color:#26372e}.rc-session-stats{display:grid;grid-template-columns:repeat(7,minmax(82px,1fr));gap:9px;margin:18px 0}.rc-session-stats div{padding:12px;border:1px solid #e3ebe5;background:#fff;border-radius:12px}.rc-session-stats span{display:block;font-size:11px;color:#728078}.rc-session-stats strong{display:block;margin-top:4px;font-size:20px;color:#183b2b}.rc-bulk-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;position:sticky;bottom:0;z-index:3;padding:10px;border:1px solid #dce8e0;border-radius:13px;background:#ffffffed;backdrop-filter:blur(8px)}.rc-bulk-toolbar span{font-size:12px;font-weight:800;color:#176b4d;margin:0 8px}.rc-bulk-toolbar button{border:1px solid #dce7e0;background:#fff;border-radius:9px;padding:8px 10px;color:#32443a;font-weight:700;font-size:12px;cursor:pointer}.rc-bulk-toolbar button:hover{border-color:#7ab897;color:#176b4d}.rc-mode-notice{font-size:12px;color:#65736b;margin-top:10px}.rc-table-wrap{overflow:auto;border:1px solid #e2eae4;border-radius:14px}.rc-attendance-table{min-width:760px;width:100%;border-collapse:separate;border-spacing:0}.rc-attendance-table thead{position:sticky;top:0;z-index:1}.rc-attendance-table th{background:#f3f8f4;color:#56675d;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:13px;text-align:left}.rc-attendance-table td{padding:12px;border-top:1px solid #edf1ee;vertical-align:middle}.rc-student-row[data-status="present"]{background:#f3fbf5}.rc-student-row[data-status="absent"]{background:#fff8f7}.rc-student-name{font-weight:750;color:#25372d}.rc-student-row td small{display:block;color:#839087;font-size:11px}.rc-avatar{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:11px;background:#e3f2e8;color:#176b4d;font-weight:800;margin-right:8px}.rc-verify-badge{font-size:11px;border-radius:20px;background:#eef3ef;padding:6px 9px;color:#58675d}.rc-student-row [data-rc-remark]{min-width:130px}.rc-mode-notice[data-warning="true"]{padding:10px;border-radius:10px;color:#875d11;background:#fff8e5}.rc-attendance-table input[type="checkbox"]{accent-color:#176b4d;width:16px;height:16px}
        .rc-attendance-filters{display:flex;gap:10px;margin:12px 0}.rc-attendance-filters label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#64746a}.rc-attendance-filters select{min-width:150px;padding:8px;border:1px solid #dce6df;border-radius:9px;background:#fff;color:#32443a}
        @media(max-width:760px){.rc-session-heading{align-items:stretch;flex-direction:column}.rc-mode-label{min-width:0}.rc-session-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.rc-session-stats div:last-child{grid-column:span 2}.rc-bulk-toolbar{bottom:4px}.rc-bulk-toolbar button{flex:1 1 30%}.rc-attendance-workspace{padding:13px}.rc-table-wrap{margin:0 -3px}.rc-attendance-filters{flex-direction:column}.rc-attendance-filters select{width:100%}}
        `;
        document.head.appendChild(style);

        document.addEventListener('change', event => {
            if (event.target.matches('#rcStatusFilter,#rcVerificationFilter')) applyRosterFilters();
            const row = event.target.closest('[data-rc-student]');
            if (event.target.matches('[data-rc-check]') && row) {
                event.target.checked ? selected.add(row.dataset.rcStudent) : selected.delete(row.dataset.rcStudent);
                renderCounts();
            } else if (event.target.matches('[data-rc-status-select]') && row) {
                previousDraft = Object.assign({}, attendanceData);
                setStatus(row.dataset.rcStudent, event.target.value);
            } else if (event.target.matches('[data-rc-select-visible]')) {
                visibleIds().forEach(id => event.target.checked ? selected.add(id) : selected.delete(id));
                refreshRows();
            }
        });
        document.addEventListener('input', event => {
            if (event.target.matches('#popupStudentFilter')) applyRosterFilters();
            const row = event.target.closest('[data-rc-student]');
            if (row && event.target.matches('[data-rc-remark]')) attendanceData[row.dataset.rcStudent + '_remark'] = event.target.value;
        });
        document.addEventListener('click', event => {
            const statusButton = event.target.closest('[data-rc-status]');
            if (statusButton) {
                const ids = selected.size ? [...selected] : [];
                if (!ids.length) { showWorkspaceNotice('Select students first. Bulk changes only affect selected students.', true); return; }
                previousDraft = Object.assign({}, attendanceData);
                ids.forEach(id => setStatus(id, statusButton.dataset.rcStatus));
                return;
            }
            const selectButton = event.target.closest('[data-rc-select]');
            if (selectButton) {
                if (selectButton.dataset.rcSelect === 'all') visibleIds().forEach(id => selected.add(id));
                else selected.clear();
                refreshRows();
                return;
            }
            if (event.target.closest('[data-rc-undo]')) {
                if (!previousDraft) { showWorkspaceNotice('There are no unsaved changes to undo.', true); return; }
                attendanceData = Object.assign({}, previousDraft);
                previousDraft = null;
                refreshRows();
                return;
            }
            if (event.target.closest('#rcSaveDraftBtn')) saveDraft();
            if (event.target.closest('#rcLockSessionBtn')) lockSession();
        });
        document.getElementById('rcAttendanceMode')?.addEventListener('change', event => {
            const mode = event.target.value;
            const notice = mode === 'location'
                ? 'Location check-in requires a trusted server verifier. This workspace records manual statuses only; GPS results are not asserted as verified.'
                : mode === 'qr'
                    ? 'QR check-in requires a signed, expiring server token and scanner integration. No scan is marked successful here.'
                    : 'This mode uses the shared class roster and attendance session.';
            showWorkspaceNotice(notice, mode === 'location' || mode === 'qr');
        });
    }
    function showWorkspaceNotice(message, warning) {
        const notice = document.getElementById('rcModeNotice');
        if (!notice) return;
        notice.textContent = message;
        notice.dataset.warning = warning ? 'true' : 'false';
    }
    async function loadScopedStudents(classId) {
        const roster = document.getElementById('popupStudentList');
        if (!currentTeacher || !currentTeacher.schoolId) {
            students = [];
            if (roster) { roster.style.display = 'block'; roster.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><p>Your teacher account has no school assignment.</p><small>Ask the school administrator to assign a school before taking attendance.</small></div>'; }
            showWorkspaceNotice('Attendance is blocked because this teacher profile has no schoolId.', true);
            return;
        }
        try {
            const date = formatDateForDatabase(popupAttendanceDate.value);
            const draftKey = `rc_draft_${currentTeacher.schoolId}_${classId}_${date}`;
            let localDraft = null;
            try {
                const raw = localStorage.getItem(draftKey);
                if (raw) localDraft = JSON.parse(raw);
            } catch (e) {}

            const [classSnap, peopleSnap, savedSnap] = await Promise.all([
                firebase.database().ref('classes/' + classId).once('value'),
                firebase.database().ref(`schoolUsers/${currentTeacher.schoolId}`).once('value'),
                sessionRef(classId, date).once('value')
            ]);
            const classRecord = classSnap.val() || (currentClassData && currentClassData.locationData) || currentClassData || {};
            if (classRecord.schoolId && classRecord.schoolId !== currentTeacher.schoolId) throw new Error('This class belongs to another school.');
            if (!classRecord.schoolId) throw new Error('This class has no school assignment and is hidden for privacy.');
            students = [];
            peopleSnap.forEach(child => {
                const person = child.val() || {};
                person.id = person.id || child.key;
                if (classMatchesStudent(person, Object.assign({ id: classId }, classRecord))) students.push(person);
            });
            const saved = (localDraft || (savedSnap.exists() ? savedSnap.val() : null)) || {};
            attendanceData = {};
            Object.keys(saved).forEach(key => { if (key !== '_meta') attendanceData[key] = saved[key]; });
            const isSchoolMode = document.body.classList.contains('teacher-school-mode') || currentTeacher?.isSchoolMode;
            window.rcSessionLocked = isSchoolMode ? false : !!(savedSnap.exists() || (saved._meta && (['submitted', 'locked'].includes(saved._meta.state) || saved._meta.submitted === true)));
            if (!isSchoolMode && saved._meta && saved._meta.state === 'locked') showWorkspaceNotice('This attendance session is locked and read-only.', true);
            else if (localDraft) showWorkspaceNotice('Restored unsaved attendance draft from your device.', false);
            else if (saved._meta && (saved._meta.state === 'submitted' || saved._meta.submitted === true)) showWorkspaceNotice('Showing saved attendance. You can edit and update anytime.', false);
            const lockButton = document.getElementById('rcLockSessionBtn');
            if (lockButton) lockButton.hidden = isSchoolMode || !(saved._meta && (saved._meta.state === 'submitted' || saved._meta.submitted === true) && saved._meta.state !== 'locked');
            renderRoster(!window.rcSessionLocked && popupAttendanceDate.value === formatDateForDatabase(new Date()));
        } catch (error) {
            students = [];
            if (roster) { roster.style.display = 'block'; roster.innerHTML = `<div class="empty-state"><i class="fas fa-shield-alt"></i><p>${html(error.message || 'Unable to load this class roster.')}</p></div>`; }
            console.error('Scoped class roster load failed:', error);
        }
    }
    async function saveDraft() {
        if (!currentTeacher || !currentTeacher.schoolId || !currentClassData || !students.length) return showWorkspaceNotice('A school, class, and enrolled roster are required before saving.', true);
        const date = formatDateForDatabase(popupAttendanceDate.value);
        const draftKey = `rc_draft_${currentTeacher.schoolId}_${currentClassData.id}_${date}`;
        try {
            localStorage.setItem(draftKey, JSON.stringify(attendanceData));
            showWorkspaceNotice('Draft saved locally on this device. Database is not updated until you submit.', false);
        } catch (error) { showWorkspaceNotice('Draft save failed: ' + (error.message || 'storage error'), true); }
    }
    async function lockSession() {
        if (!currentTeacher || !currentTeacher.schoolId || !currentClassData) return showWorkspaceNotice('A school and class are required.', true);
        const date = formatDateForDatabase(popupAttendanceDate.value);
        const ref = sessionRef(currentClassData.id, date);
        try {
            const result = await ref.transaction(existing => {
                if (!existing || !existing._meta || existing._meta.schoolId !== currentTeacher.schoolId || !(existing._meta.state === 'submitted' || existing._meta.submitted === true)) return;
                existing._meta.state = 'locked';
                existing._meta.lockedAt = Date.now();
                existing._meta.lockedBy = currentTeacher.id;
                return existing;
            });
            if (!result.committed) throw new Error('Only a submitted session in your school can be locked.');
            window.rcSessionLocked = true;
            const button = document.getElementById('rcLockSessionBtn');
            if (button) button.hidden = true;
            showWorkspaceNotice('Session locked. The roster is now read-only.', false);
            try { await firebase.database().ref(`attendance_audit/${currentClassData.id}/${date}`).push({ action: 'locked', actorId: currentTeacher.id, schoolId: currentTeacher.schoolId, timestamp: Date.now() }); }
            catch (auditError) { console.error('Session locked, but the client audit record failed:', auditError); showWorkspaceNotice('Session locked, but its audit event could not be saved. Contact your administrator.', true); }
        } catch (error) { showWorkspaceNotice(error.message || 'Unable to lock session.', true); }
    }
    async function submitSession() {
        if (!currentTeacher || !currentTeacher.schoolId || !currentClassData || !students.length) throw new Error('A school, class, and enrolled roster are required.');
        const date = formatDateForDatabase(popupAttendanceDate.value);
        const payload = Object.assign({}, attendanceData);
        students.forEach(student => {
            const note = payload[student.id + '_remark'];
            if (!statuses.includes(payload[student.id])) payload[student.id] = 'unmarked';
            payload[student.id + '_record'] = { status: payload[student.id], remark: text(note || ''), updatedAt: Date.now(), actorId: currentTeacher.id, verificationStatus: 'notRequired' };
        });
        payload._meta = { classId: currentClassData.id, className: currentClassData.name || currentClassData.className || '', locationId: currentClassData.id, schoolId: currentTeacher.schoolId, teacherId: currentTeacher.id, teacherName: currentTeacher.name || currentTeacher.email || '', date, state: 'submitted', submitted: true, timestamp: Date.now(), stats: { total: students.length, present: students.filter(s => payload[s.id] === 'present').length, absent: students.filter(s => payload[s.id] === 'absent').length, late: students.filter(s => payload[s.id] === 'late').length, excused: students.filter(s => ['excused', 'onDuty'].includes(payload[s.id])).length, unmarked: students.filter(s => payload[s.id] === 'unmarked').length } };
        const ref = sessionRef(currentClassData.id, date);
        await ref.set(payload);
        try {
            await firebase.database().ref(`attendance/${currentTeacher.schoolId}/${currentClassData.id}/${date}`).set(payload);
        } catch (e) {}
        // Clear draft from local storage on successful submit
        const draftKey = `rc_draft_${currentTeacher.schoolId}_${currentClassData.id}_${date}`;
        try { localStorage.removeItem(draftKey); } catch (e) {}
        try { await firebase.database().ref(`attendance_audit/${currentClassData.id}/${date}`).push({ action: 'submitted', actorId: currentTeacher.id, schoolId: currentTeacher.schoolId, timestamp: Date.now(), sessionState: 'submitted' }); }
        catch (auditError) { console.error('Attendance saved, but the client audit record failed:', auditError); }
        showWorkspaceNotice('Attendance saved successfully to database and local draft cleared.', false);
        return payload;
    }

    document.addEventListener('DOMContentLoaded', () => {
        wireWorkspace();
        const list = document.getElementById('popupStudentList');
        if (list) new MutationObserver(() => {
            if (students && students.length && document.getElementById('rcSessionStats')) refreshRows();
        }).observe(list, { childList: true });
        window.loadStudentsForClass = function (classId) { return loadScopedStudents(classId); };
        window.loadAttendance = function () { if (currentClassData) return loadScopedStudents(currentClassData.id); };
        window.displaySubmittedAttendance = function (classId) {
            if (currentClassData && currentClassData.id === classId) return loadScopedStudents(classId);
        };
        window.markAttendance = function (studentId, status) { previousDraft = Object.assign({}, attendanceData); setStatus(studentId, status); };
        window.submitAttendance = async function () {
            const button = document.getElementById('submitAttendancePopupBtn');
            const unmarked = (students || []).filter(student => studentStatus(student.id) === 'unmarked').length;
            if (!window.confirm('Submit and make this session read-only? ' + unmarked + ' student(s) will remain unmarked; they will not be changed to absent.')) return;
            if (button) button.disabled = true;
            try {
                const record = await submitSession();
                submittedAttendances[currentClassData.id] = record;
                window.rcSessionLocked = true;
                const lockButton = document.getElementById('rcLockSessionBtn');
                if (lockButton) lockButton.hidden = false;
                showWorkspaceNotice('Attendance submitted. This session is now read-only.', false);
                renderRoster(false);
                document.getElementById('attendanceSummary').style.display = 'grid';
                document.getElementById('popupPresentCount').textContent = record._meta.stats.present;
                document.getElementById('popupAbsentCount').textContent = record._meta.stats.absent;
                document.getElementById('popupTotalCount').textContent = record._meta.stats.total;
                if (typeof showAlert === 'function') showAlert(attendanceAlert, 'Attendance submitted successfully.', 'success');
            } catch (error) {
                if (typeof showAlert === 'function') showAlert(attendanceAlert, error.message || 'Attendance submission failed.', 'error');
                else showWorkspaceNotice(error.message || 'Attendance submission failed.', true);
            } finally { if (button) button.disabled = false; }
        };
        document.addEventListener('click', event => {
            if (!event.target.closest('#submitAttendancePopupBtn')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            window.submitAttendance();
        }, true);
    });
}());
