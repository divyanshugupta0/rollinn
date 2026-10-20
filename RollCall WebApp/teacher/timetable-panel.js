document.addEventListener('DOMContentLoaded', () => {
    const DAYS = [
        ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
        ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']
    ];
    const section = document.getElementById('timetableSection');
    if (!section) return;
    const shell = document.createElement('div');
    shell.className = 'ct-shell';
    shell.innerHTML = `
        <header class="ct-hero">
            <div><span class="ct-kicker">Read-only class timetable</span><h2><i class="fas fa-calendar-week"></i> Class timetable</h2><p>View the schedule for the class sections you lead.</p></div>
            <button type="button" class="ct-refresh" id="ctRefresh"><i class="fas fa-rotate-right"></i> Refresh</button>
        </header>
        <div class="ct-toolbar"><span id="ctSingleSection" hidden></span><label id="ctSectionLabel" for="ctSectionSelect">Class section</label><select id="ctSectionSelect" disabled><option value="">Loading your class sections…</option></select></div>
        <p id="ctStatus" class="ct-status" role="status" aria-live="polite">Loading your class timetables…</p>
        <div id="ctGrid" class="ct-grid-wrap"><div class="ct-empty">Loading your class timetables…</div></div>
        <p class="ct-note"><i class="fas fa-lock"></i> This timetable is read-only. Contact your administrator to request changes.</p>`;
    const header = section.querySelector('.header');
    (header || section).insertAdjacentElement(header ? 'afterend' : 'afterbegin', shell);
    const style = document.createElement('style');
    style.textContent = `
        #timetableSection .timetable-manager,#timetableModal,#timetableSection .modal-overlay,#timetableSection #timetableAlert{display:none!important}
        .ct-shell{margin:18px 0 24px;color:#20342a}
        .ct-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:23px 25px;border:1px solid #dfebe2;border-radius:18px;background:linear-gradient(120deg,#fff,#f0f8f2)}
        .ct-kicker{color:#267352;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        .ct-hero h2{margin:6px 0;font-size:23px}.ct-hero h2 i{color:#28734f}.ct-hero p{margin:0;color:#718178;font-size:13px}
        .ct-refresh{min-height:40px;padding:0 13px;border:1px solid #dce8df;border-radius:9px;background:white;color:#26513b;font:inherit;cursor:pointer}
        .ct-toolbar{display:flex;align-items:center;gap:12px;margin:14px 0;padding:13px 16px;border:1px solid #e1ebe4;border-radius:13px;background:#fff}
        .ct-toolbar label{font-size:13px;font-weight:750;color:#415648}.ct-toolbar select{min-width:min(100%,320px);min-height:40px;padding:7px 10px;border:1px solid #d4e1d8;border-radius:8px;background:#fff;color:#304238;font:inherit}.ct-toolbar #ctSingleSection{color:#405447;font-size:14px;font-weight:750}
        .ct-status{min-height:1.4em;color:#63766a;font-size:13px}
        .ct-grid-wrap{overflow:auto;border:1px solid #e0e9e2;border-radius:14px;background:#fff}
        .ct-grid{width:100%;min-width:760px;border-collapse:collapse}.ct-grid th,.ct-grid td{min-width:115px;padding:10px;border:1px solid #e8eee9;text-align:left;vertical-align:top}
        .ct-grid th{background:#f4f8f5;color:#65776b;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        .ct-grid td:first-child{min-width:92px;background:#fafcfb;color:#53685a;font-size:12px;font-weight:750}
        .ct-slot{min-height:58px;padding:9px;border:1px solid #dcebe0;border-left:3px solid #40986a;border-radius:9px;background:#f4faf5}
        .ct-slot strong{display:block;color:#243a2e;font-size:12px}.ct-slot span{display:block;margin-top:4px;color:#708076;font-size:11px}
        .ct-empty-cell{color:#bbc7be;text-align:center!important}.ct-empty{padding:32px 18px;color:#718077;text-align:center}
        .ct-note{margin:12px 0 0;color:#74837a;font-size:12px}.ct-note i{color:#28734f}
        @media(max-width:650px){.ct-hero{align-items:flex-start;flex-direction:column;padding:18px}.ct-toolbar{align-items:flex-start;flex-direction:column}.ct-toolbar select{width:100%}}
    `;
    document.head.appendChild(style);
    const selector = shell.querySelector('#ctSectionSelect');
    const grid = shell.querySelector('#ctGrid');
    const status = shell.querySelector('#ctStatus');
    let scope = [];
    let settings = {days: DAYS.slice(0, 6).map(([key]) => key), periods: []};
    let schedules = {};
    let subjectAssignments = {};
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const safeKey = value => Array.from(new TextEncoder().encode(String(value)), byte => byte.toString(16).padStart(2, '0')).join('');
    const subjectKey = value => safeKey(String(value || '').trim().toLocaleLowerCase());
    const selectedScope = () => scope.find(item => item.value === selector.value) || null;
    function render() {
        const item = selectedScope();
        if (!item) {
            grid.innerHTML = '<div class="ct-empty">Your administrator has not assigned any class-teacher timetable sections.</div>';
            return;
        }
        const timetable = schedules[item.classId]?.[item.sectionKey] || {};
        const sectionAssignments = subjectAssignments[item.classId]?.[item.sectionKey] || {};
        const periods = settings.periods.length ? settings.periods : [];
        const days = settings.days.length ? settings.days : [];
        if (!periods.length || !days.length) {
            grid.innerHTML = '<div class="ct-empty">Your school timetable periods have not been configured yet.</div>';
            return;
        }
        const dayNames = new Map(DAYS);
        const header = ['<th>Day</th>', ...periods.map(period => `<th>${esc(period.name)}${period.start && period.end ? `<br><small>${esc(period.start)}–${esc(period.end)}</small>` : ''}</th>`)].join('');
        const rows = days.map(day => `<tr><td>${esc(dayNames.get(day) || day)}</td>${periods.map(period => {
            const slot = timetable.slots?.[day]?.[period.id];
            const teacher = slot?.subject ? sectionAssignments[subjectKey(slot.subject)]?.teacherName : '';
            return slot?.subject
                ? `<td><div class="ct-slot"><strong>${esc(slot.subject)}</strong><span>${esc(teacher || slot.teacherName || 'Teacher not assigned')}</span></div></td>`
                : '<td class="ct-empty-cell">—</td>';
        }).join('')}</tr>`).join('');
        grid.innerHTML = `<table class="ct-grid"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    async function load() {
        const user = firebase.auth().currentUser;
        if (!user) {
            scope = [];
            schedules = {};
            subjectAssignments = {};
            status.textContent = 'Sign in to view your class timetable.';
            selector.innerHTML = '<option value="">Sign in required</option>';
            selector.disabled = true;
            render();
            return;
        }
        const previous = selector.value;
        const singleSection = shell.querySelector('#ctSingleSection');
        status.textContent = 'Loading your class timetables…';
        selector.disabled = true;
        try {
            const db = firebase.database();
            const profileSnap = await db.ref(`users/${user.uid}`).once('value');
            const profile = profileSnap.val() || {};
            if (profile.role !== 'teacher' || !profile.schoolId) throw new Error('This teacher account is not assigned to a school.');
            const [settingsSnap, coursesSnap, assignmentSnap, subjectAssignmentsSnap, schedulesSnap] = await Promise.all([
                db.ref(`schoolTimetableSettings/${profile.schoolId}`).once('value'),
                db.ref(`schoolCourses/${profile.schoolId}`).once('value'),
                db.ref(`classTeacherAssignmentsByClass/${profile.schoolId}`).once('value'),
                db.ref(`subjectTeacherAssignments/${profile.schoolId}`).once('value'),
                db.ref(`schoolTimetables/${profile.schoolId}`).once('value')
            ]);
            const config = settingsSnap.val() || {};
            settings = {
                days: Array.isArray(config.days) ? config.days : DAYS.slice(0, 6).map(([key]) => key),
                periods: Array.isArray(config.periods) ? config.periods : []
            };
            const courses = coursesSnap.val() || {};
            const classTeacherAssignments = assignmentSnap.val() || {};
            subjectAssignments = subjectAssignmentsSnap.val() || {};
            const assigned = [];
            const profileScopes = Array.isArray(profile.classTeacherClassSections) ? profile.classTeacherClassSections : [];
            profileScopes.forEach(item => {
                if (!item?.classId || !item.section) return;
                const classRecord = courses[item.classId] || {};
                const sectionKey = safeKey(`${item.year || ''}|${item.section}`);
                const mapping = classTeacherAssignments[item.classId]?.[sectionKey];
                if (mapping && mapping.teacherId !== user.uid) return;
                if (!classRecord.courseName && !item.className) return;
                assigned.push({
                    classId: item.classId,
                    className: item.className || classRecord.courseName || 'Class',
                    section: item.section,
                    year: item.year || '',
                    sectionKey,
                    value: `${item.classId}|${sectionKey}`
                });
            });
            if (!assigned.length) Object.entries(classTeacherAssignments).forEach(([classId, sections]) => {
                Object.entries(sections || {}).forEach(([sectionKey, assignment]) => {
                    if (assignment?.teacherId !== user.uid) return;
                    assigned.push({
                        classId,
                        className: assignment.className || courses[classId]?.courseName || 'Class',
                        section: assignment.section || '',
                        year: assignment.year || '',
                        sectionKey,
                        value: `${classId}|${sectionKey}`
                    });
                });
            });
            scope = [...new Map(assigned.map(item => [item.value, item])).values()]
                .sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section));
            schedules = schedulesSnap.val() || {};
            selector.innerHTML = '<option value="">Select a class section</option>' + scope.map(item =>
                `<option value="${esc(item.value)}">${esc(item.className)} · ${esc(item.section)}${item.year ? ` · Year ${esc(item.year)}` : ''}</option>`
            ).join('');
            if (scope.length === 1) selector.value = scope[0].value;
            else selector.value = scope.some(item => item.value === previous) ? previous : '';
            selector.hidden = scope.length <= 1;
            shell.querySelector('#ctSectionLabel').hidden = scope.length <= 1;
            if (singleSection) {
                singleSection.hidden = scope.length !== 1;
                singleSection.textContent = scope.length === 1 ? `${scope[0].className} · ${scope[0].section}${scope[0].year ? ` · Year ${scope[0].year}` : ''}` : '';
            }
            selector.disabled = scope.length <= 1;
            render();
            status.textContent = scope.length
                ? `Loaded ${scope.length} class section timetable${scope.length === 1 ? '' : 's'}.`
                : 'Your administrator has not assigned any class-teacher timetable sections.';
        } catch (error) {
            console.error('Unable to load class-teacher timetable:', error);
            scope = [];
            schedules = {};
            subjectAssignments = {};
            selector.innerHTML = '<option value="">Timetable unavailable</option>';
            status.textContent = error.message || 'Unable to load your class timetable.';
            grid.innerHTML = '<div class="ct-empty">Your timetable could not be loaded. Please try again.</div>';
        }
    }
    selector.addEventListener('change', render);
    shell.querySelector('#ctRefresh').addEventListener('click', load);
    firebase.auth().onAuthStateChanged(() => load());
});
