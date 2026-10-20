document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('classesSection');
    if (!section) return;
    section.querySelector('.class-management')?.setAttribute('hidden', '');
    section.querySelector('.class-manager')?.setAttribute('hidden', '');

    const panel = document.createElement('section');
    panel.className = 'teacher-schedule-panel';
    panel.innerHTML = `
        <div class="teacher-schedule-heading">
            <div><span class="teacher-schedule-eyebrow">READ ONLY · YOUR TEACHING TIMETABLE</span><h2><i class="fas fa-calendar-week"></i> My Classes &amp; Lessons</h2><p>Your weekly lessons based on your subject assignments.</p></div>
            <button type="button" class="teacher-schedule-refresh" id="refreshTeacherSchedule"><i class="fas fa-rotate-right"></i> Refresh</button>
        </div>
        <label class="teacher-schedule-class-filter" for="teacherScheduleClass">Filter by class <select id="teacherScheduleClass"><option value="">All my classes</option></select></label>
        <div class="teacher-schedule-live" id="teacherScheduleLive" role="status" aria-live="polite">Sign in to load your teaching timetable.</div>
        <div class="teacher-schedule-table-wrap" id="teacherScheduleGrid"><div class="teacher-schedule-empty">Your lessons will appear here when your administrator assigns subjects and adds them to class timetables.</div></div>
        <div class="teacher-schedule-footnote"><i class="fas fa-lock"></i> This timetable is read-only. Contact your administrator to change an assignment or lesson.</div>`;
    const header = section.querySelector('.header');
    (header || section).insertAdjacentElement(header ? 'afterend' : 'afterbegin', panel);
    const style = document.createElement('style');
    style.textContent = `
        #classesSection>.header h1{text-align:left}
        #classesSection .class-manager,#classesSection .class-management,#classesSection > .date-selector-container{display:none!important}
        .teacher-schedule-panel{margin:18px 0 24px;padding:24px;border:1px solid #e2eae3;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(28,55,37,.05)}
        .teacher-schedule-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:14px;text-align:left}
        .teacher-schedule-eyebrow{color:#678174;font-size:10px;font-weight:800;letter-spacing:.12em}
        .teacher-schedule-heading h2{margin:5px 0;color:#20342a;font-size:21px;text-align:left}.teacher-schedule-heading h2 i{margin-right:8px;color:#17704d}
        .teacher-schedule-heading p{margin:0;color:#75847b;font-size:13px;text-align:left}
        .teacher-schedule-refresh{display:inline-flex!important;align-items:center;justify-content:center;gap:8px;width:max-content!important;min-width:120px;max-width:max-content;flex:0 0 auto!important;white-space:nowrap;min-height:42px;padding:0 14px;border:1px solid #dce8df;border-radius:10px;background:#f5faf6;color:#176b4d;font-weight:700;cursor:pointer}
        .teacher-schedule-class-filter{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#405447;font-size:13px;font-weight:700;text-align:left}
        .teacher-schedule-class-filter select{min-width:220px;min-height:40px;padding:7px 10px;border:1px solid #d5e0d8;border-radius:8px;background:#fff;color:#304238;font:inherit}
        .teacher-schedule-live{min-height:1.4em;margin:0 0 12px;color:#65766b;font-size:13px}
        .teacher-schedule-table-wrap{overflow:auto;border:1px solid #e5ece6;border-radius:12px}
        .teacher-schedule-table{width:100%;min-width:760px;border-collapse:collapse;text-align:left}
        .teacher-schedule-table th,.teacher-schedule-table td{min-width:115px;padding:10px;border:1px solid #edf1ee;vertical-align:top}
        .teacher-schedule-table th{background:#f4f8f5;color:#65766b;font-size:10px;text-transform:uppercase;letter-spacing:.07em}
        .teacher-schedule-table .teacher-schedule-interval-row td{background:#f7faf7;color:#42614d;font-size:11px;font-weight:700;white-space:nowrap}
        .teacher-schedule-table .teacher-schedule-interval-label{background:#f2f7f3!important}
        .teacher-schedule-table .teacher-schedule-lunch-cell{background:#fff8e8!important;color:#89651d!important;text-align:center}
        .teacher-schedule-table td:first-child{min-width:90px;background:#fafcfb;color:#52685a;font-size:12px;font-weight:750}
        .teacher-schedule-lesson{margin:0 0 6px;padding:8px;border:1px solid #dcebe0;border-left:3px solid #40986a;border-radius:8px;background:#f4faf5}
        .teacher-schedule-lesson strong{display:block;color:#243a2e;font-size:12px}.teacher-schedule-lesson small{display:block;margin-top:4px;color:#708076;font-size:11px}
        .teacher-schedule-empty{padding:28px!important;color:#79867e!important;text-align:center}
        .teacher-schedule-footnote{margin-top:12px;color:#7a887f;font-size:11px}.teacher-schedule-footnote i{margin-right:5px;color:#28734f}
        @media(max-width:650px){.teacher-schedule-panel{padding:16px}.teacher-schedule-heading{align-items:flex-start;flex-direction:column}.teacher-schedule-heading h2{font-size:18px}.teacher-schedule-class-filter{align-items:flex-start;flex-direction:column}.teacher-schedule-class-filter select{width:100%}}
    `;
    document.head.appendChild(style);
    const live = panel.querySelector('#teacherScheduleLive');
    const grid = panel.querySelector('#teacherScheduleGrid');
    const classFilter = panel.querySelector('#teacherScheduleClass');
    const DAYS = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
    let lessons = [];
    let settings = {days: DAYS.slice(0, 6).map(([key]) => key), periods: [], lunchBreak: {enabled: false}};
    let selectedClassId = '';
    let currentSchoolId = '';
    let cachedScheduleMap = {};
    let cachedAssignmentMap = {};

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const safeKey = value => Array.from(new TextEncoder().encode(String(value)), byte => byte.toString(16).padStart(2, '0')).join('');
    const subjectKey = value => safeKey(String(value || '').trim().toLocaleLowerCase());

    function render() {
        const filtered = lessons.filter(item => !selectedClassId || item.classId === selectedClassId);
        if (!settings.periods.length || !settings.days.length) {
            grid.innerHTML = '<div class="teacher-schedule-empty">Your school timetable periods have not been configured yet.</div>';
            return;
        }
        if (!filtered.length) {
            grid.innerHTML = '<div class="teacher-schedule-empty">No lessons are scheduled for this selection yet.</div>';
            return;
        }
        const dayLabels = new Map(DAYS);
        const lunchBreak = settings.lunchBreak || {};
        const columns = [];
        settings.periods.forEach(period => {
            columns.push({type: 'period', period});
            if (lunchBreak.enabled && lunchBreak.afterPeriodId === period.id) columns.push({type: 'lunch'});
        });
        const header = ['<th>Day</th>', ...columns.map(column => column.type === 'period'
            ? `<th>${esc(column.period.name)}</th>`
            : '<th class="teacher-schedule-lunch-cell">Lunch break</th>'
        )].join('');
        const intervals = `<tr class="teacher-schedule-interval-row"><td class="teacher-schedule-interval-label">Class interval</td>${columns.map(column => {
            if (column.type === 'lunch') return `<td class="teacher-schedule-lunch-cell">${esc(lunchBreak.start || '')}–${esc(lunchBreak.end || '')}<br>${Number(lunchBreak.duration) || 0} min</td>`;
            return `<td>${column.period.start && column.period.end ? `${esc(column.period.start)}–${esc(column.period.end)}` : '—'}</td>`;
        }).join('')}</tr>`;
        const rows = settings.days.map(day => `<tr><td>${esc(dayLabels.get(day) || day)}</td>${columns.map(column => {
            if (column.type === 'lunch') return '<td class="teacher-schedule-lunch-cell">Lunch break</td>';
            const period = column.period;
            const items = filtered.filter(item => item.day === day && item.periodId === period.id);
            return `<td>${items.map(item => `<article class="teacher-schedule-lesson"><strong>${esc(item.subject)}</strong><small>${esc(item.className)} · ${esc(item.section)}</small></article>`).join('') || '<span class="teacher-schedule-empty">—</span>'}</td>`;
        }).join('')}</tr>`).join('');
        grid.innerHTML = `<table class="teacher-schedule-table"><thead><tr>${header}</tr></thead><tbody>${intervals}${rows}</tbody></table>`;
    }

    function extractLessons(scheduleMap, assignmentMap, userId) {
        const result = [];
        Object.entries(scheduleMap || {}).forEach(([classId, sections]) => {
            Object.entries(sections || {}).forEach(([sectionKeyStr, schedule]) => {
                Object.entries(schedule?.slots || {}).forEach(([day, periods]) => {
                    Object.entries(periods || {}).forEach(([periodId, slot]) => {
                        if (!slot?.subject) return;
                        const assignment = assignmentMap[classId]?.[sectionKeyStr]?.[subjectKey(slot.subject)];
                        const isMyLesson = (slot.teacherId && slot.teacherId === userId) || (assignment?.teacherId === userId);
                        if (!isMyLesson) return;
                        result.push({
                            classId,
                            className: schedule.className || assignment?.className || 'Class',
                            section: schedule.section || assignment?.section || '',
                            day,
                            periodId,
                            subject: slot.subject
                        });
                    });
                });
            });
        });
        return result;
    }

    function updateClassFilterAndRender() {
        const classOptions = [...new Map(lessons.map(item => [item.classId, item])).values()].sort((a, b) => a.className.localeCompare(b.className));
        classFilter.innerHTML = '<option value="">All my classes</option>' + classOptions.map(item =>
            `<option value="${esc(item.classId)}">${esc(item.className)}</option>`
        ).join('');
        selectedClassId = classOptions.some(item => item.classId === selectedClassId) ? selectedClassId : '';
        classFilter.value = selectedClassId;
        classFilter.disabled = classOptions.length < 2;
        render();
        live.textContent = lessons.length
            ? `${lessons.length} assigned lesson${lessons.length === 1 ? '' : 's'} across ${classOptions.length} class${classOptions.length === 1 ? '' : 'es'}.`
            : 'No lessons have been added for your subject assignments yet.';
    }

    async function load(user, forceRefresh = false) {
        if (!user) {
            lessons = [];
            currentSchoolId = '';
            cachedScheduleMap = {};
            cachedAssignmentMap = {};
            live.textContent = 'Sign in to load your teaching timetable.';
            render();
            return;
        }
        live.textContent = 'Loading your assigned lessons…';
        grid.innerHTML = '<div class="teacher-schedule-empty"><i class="fas fa-spinner fa-spin"></i> Loading timetable</div>';
        try {
            const db = firebase.database();
            const profileSnap = await db.ref(`users/${user.uid}`).once('value');
            const profile = profileSnap.val() || {};
            if (profile.role !== 'teacher' || !profile.schoolId) throw new Error('This teacher account is not assigned to a school.');
            currentSchoolId = profile.schoolId;

            const [settingsSnap, assignmentsSnap, timetablesData] = await Promise.all([
                db.ref(`schoolTimetableSettings/${profile.schoolId}`).once('value'),
                db.ref(`subjectTeacherAssignments/${profile.schoolId}`).once('value'),
                window.RollCallTimetableCache
                    ? window.RollCallTimetableCache.syncTimetables(profile.schoolId, forceRefresh)
                    : db.ref(`schoolTimetables/${profile.schoolId}`).once('value').then(s => ({ timetables: s.val() || {} }))
            ]);

            const config = settingsSnap.val() || {};
            settings = {
                days: Array.isArray(config.days) ? config.days : DAYS.slice(0, 6).map(([key]) => key),
                periods: Array.isArray(config.periods) ? config.periods : [],
                lunchBreak: config.lunchBreak || {enabled: false}
            };
            cachedAssignmentMap = assignmentsSnap.val() || {};
            cachedScheduleMap = timetablesData.timetables || {};

            // Subscribe to remote version changes for realtime updates
            if (window.RollCallTimetableCache) {
                window.RollCallTimetableCache.subscribeVersion(profile.schoolId, updatedTimetables => {
                    cachedScheduleMap = updatedTimetables || {};
                    lessons = extractLessons(cachedScheduleMap, cachedAssignmentMap, user.uid);
                    updateClassFilterAndRender();
                });
            }

            lessons = extractLessons(cachedScheduleMap, cachedAssignmentMap, user.uid);
            updateClassFilterAndRender();
        } catch (error) {
            console.error('Unable to load teacher lesson timetable:', error);
            lessons = [];
            live.textContent = error.message || 'Unable to load your teaching timetable.';
            grid.innerHTML = '<div class="teacher-schedule-empty">Your timetable could not be loaded. Please try again.</div>';
        }
    }

    classFilter.addEventListener('change', () => {
        selectedClassId = classFilter.value;
        render();
    });
    panel.querySelector('#refreshTeacherSchedule').addEventListener('click', () => load(firebase.auth().currentUser, true));
    firebase.auth().onAuthStateChanged(user => {
        if (!user && currentSchoolId && window.RollCallTimetableCache) {
            window.RollCallTimetableCache.unsubscribeVersion(currentSchoolId);
        }
        load(user, false);
    });
});
