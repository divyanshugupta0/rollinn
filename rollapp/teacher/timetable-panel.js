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
            <div><span class="ct-kicker">Read-only class timetable</span><h2><i class="fas fa-calendar-week"></i> Class timetable</h2><p>View weekly timetables for your assigned classes and school sections.</p></div>
            <button type="button" class="ct-refresh" id="ctRefresh"><i class="fas fa-rotate-right"></i> Refresh</button>
        </header>
        <div class="ct-toolbar" hidden><label id="ctSectionLabel" for="ctSectionSelect">Class section</label><select id="ctSectionSelect" disabled><option value="">Loading class sections…</option></select></div>
        <p id="ctStatus" class="ct-status" role="status" aria-live="polite">Loading class timetables…</p>
        <div id="ctGrid" class="ct-grid-wrap"><div class="ct-empty">Loading class timetables…</div></div>
        <p class="ct-note"><i class="fas fa-lock"></i> This timetable is read-only. Contact your administrator to request changes.</p>`;
    const header = section.querySelector('.header');
    (header || section).insertAdjacentElement(header ? 'afterend' : 'afterbegin', shell);
    const style = document.createElement('style');
    style.textContent = `
        #timetableSection>.header h1{text-align:left}
        #timetableSection .timetable-manager,#timetableModal,#timetableSection .modal-overlay,#timetableSection #timetableAlert{display:none!important}
        .ct-shell{margin:18px 0 24px;color:#20342a}
        .ct-hero{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:23px 25px;border:1px solid #dfebe2;border-radius:18px;background:linear-gradient(120deg,#fff,#f0f8f2);text-align:left}
        .ct-hero>div{min-width:0;flex:1}
        .ct-kicker{color:#267352;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        .ct-hero h2{margin:6px 0;font-size:23px;text-align:left}.ct-hero h2 i{color:#28734f}.ct-hero p{margin:0;color:#718178;font-size:13px;text-align:left}
        .ct-refresh{display:inline-flex;align-items:center;justify-content:center;gap:8px;flex:0 0 auto;width:auto!important;min-width:120px;min-height:40px;padding:0 15px;border:1px solid #dce8df;border-radius:9px;background:white;color:#26513b;font:inherit;cursor:pointer}
        .ct-toolbar{display:flex;align-items:center;gap:12px;margin:14px 0;padding:12px 16px;border:1px solid #e1ebe4;border-radius:13px;background:#fff;text-align:left}
        .ct-toolbar[hidden],.ct-toolbar [hidden]{display:none!important}
        .ct-toolbar label{flex:0 0 auto;font-size:13px;font-weight:750;color:#415648}
        .ct-toolbar select{flex:0 1 440px;width:auto!important;min-width:min(100%,260px);min-height:40px;padding:7px 10px;border:1px solid #d4e1d8;border-radius:8px;background:#fff;color:#304238;font:inherit;cursor:pointer}
        .ct-toolbar select optgroup{font-weight:700;color:#26513b;background:#f5faf6}
        .ct-toolbar select option{font-weight:400;color:#22332a;background:#fff}
        .ct-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .ct-grid-wrap{overflow:auto;border:1px solid #e0e9e2;border-radius:14px;background:#fff}
        .ct-grid{width:100%;min-width:760px;border-collapse:collapse}.ct-grid th,.ct-grid td{min-width:115px;padding:10px;border:1px solid #e8eee9;text-align:left;vertical-align:top}
        .ct-grid th{background:#f4f8f5;color:#65776b;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        .ct-grid td:first-child{min-width:92px;background:#fafcfb;color:#53685a;font-size:12px;font-weight:750}
        .ct-grid .ct-interval-row td{background:#f7faf7;color:#42614d;font-size:11px;font-weight:700;white-space:nowrap}
        .ct-grid .ct-interval-label{background:#f2f7f3!important}
        .ct-grid .ct-lunch-cell{background:#fff8e8!important;color:#89651d!important;text-align:center!important}
        .ct-slot{min-height:58px;padding:9px;border:1px solid #dcebe0;border-left:3px solid #40986a;border-radius:9px;background:#f4faf5}
        .ct-slot strong{display:block;color:#243a2e;font-size:12px}.ct-slot span{display:block;margin-top:4px;color:#708076;font-size:11px}
        .ct-slot-mine{border-left:3px solid #1f8b54!important;background:#ecf7f0!important}
        .ct-slot-mine strong{color:#155734!important}
        .ct-badge-you{display:inline-block;margin-left:4px;padding:1px 5px;font-size:10px;font-weight:700;color:#166534;background:#dcfce7;border-radius:4px;vertical-align:middle;font-style:normal}
        .ct-empty-cell{color:#bbc7be;text-align:center!important}.ct-empty{padding:32px 18px;color:#718077;text-align:center}
        .ct-note{margin:12px 0 0;color:#74837a;font-size:12px}.ct-note i{color:#28734f}
        @media(max-width:650px){.ct-hero{align-items:flex-start;flex-direction:column;padding:18px}.ct-refresh{align-self:flex-start}.ct-toolbar{align-items:stretch;flex-direction:column}.ct-toolbar select{flex:0 0 auto;width:100%!important;min-width:0}.ct-toolbar label{flex:0 0 auto}}
    `;
    document.head.appendChild(style);
    const selector = shell.querySelector('#ctSectionSelect');
    const grid = shell.querySelector('#ctGrid');
    const status = shell.querySelector('#ctStatus');
    let scope = [];
    let settings = {days: DAYS.slice(0, 6).map(([key]) => key), periods: [], lunchBreak: {enabled: false}};
    let schedules = {};
    let subjectAssignments = {};
    let currentSchoolId = '';
    let currentUserId = '';

    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const safeKey = value => Array.from(new TextEncoder().encode(String(value)), byte => byte.toString(16).padStart(2, '0')).join('');
    const subjectKey = value => safeKey(String(value || '').trim().toLocaleLowerCase());
    const selectedScope = () => scope.find(item => item.value === selector.value) || null;

    function render() {
        const item = selectedScope();
        if (!item) {
            grid.innerHTML = '<div class="ct-empty">Select a class section from above to view its timetable.</div>';
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
        const lunchBreak = settings.lunchBreak || {};
        const columns = [];
        periods.forEach(period => {
            columns.push({type: 'period', period});
            if (lunchBreak.enabled && lunchBreak.afterPeriodId === period.id) columns.push({type: 'lunch'});
        });
        const header = ['<th>Day</th>', ...columns.map(column => column.type === 'period'
            ? `<th>${esc(column.period.name)}</th>`
            : '<th class="ct-lunch-cell">Lunch break</th>'
        )].join('');
        const intervals = `<tr class="ct-interval-row"><td class="ct-interval-label">Class interval</td>${columns.map(column => {
            if (column.type === 'lunch') return `<td class="ct-lunch-cell">${esc(lunchBreak.start || '')}–${esc(lunchBreak.end || '')}<br>${Number(lunchBreak.duration) || 0} min</td>`;
            return `<td>${column.period.start && column.period.end ? `${esc(column.period.start)}–${esc(column.period.end)}` : '—'}</td>`;
        }).join('')}</tr>`;
        const rows = days.map(day => `<tr><td>${esc(dayNames.get(day) || day)}</td>${columns.map(column => {
            if (column.type === 'lunch') return '<td class="ct-lunch-cell">Lunch break</td>';
            const period = column.period;
            const slot = timetable.slots?.[day]?.[period.id];
            if (!slot?.subject) return '<td class="ct-empty-cell">—</td>';

            const assignedTeacher = sectionAssignments[subjectKey(slot.subject)];
            const teacherName = assignedTeacher?.teacherName || slot.teacherName || 'Teacher not assigned';
            const isMine = (slot.teacherId && currentUserId && slot.teacherId === currentUserId) ||
                           (assignedTeacher?.teacherId && currentUserId && assignedTeacher.teacherId === currentUserId);

            return `<td><div class="ct-slot ${isMine ? 'ct-slot-mine' : ''}"><strong>${esc(slot.subject)}</strong><span>${esc(teacherName)}${isMine ? ' <em class="ct-badge-you">You</em>' : ''}</span></div></td>`;
        }).join('')}</tr>`).join('');
        grid.innerHTML = `<table class="ct-grid"><thead><tr>${header}</tr></thead><tbody>${intervals}${rows}</tbody></table>`;
    }

    async function load(forceRefresh = false) {
        const user = firebase.auth().currentUser;
        if (!user) {
            currentUserId = '';
            currentSchoolId = '';
            scope = [];
            schedules = {};
            subjectAssignments = {};
            shell.querySelector('.ct-toolbar').hidden = true;
            status.textContent = 'Sign in to view your class timetable.';
            selector.innerHTML = '<option value="">Sign in required</option>';
            selector.disabled = true;
            grid.innerHTML = '<div class="ct-empty">Sign in to view your class timetable.</div>';
            return;
        }
        currentUserId = user.uid;
        const previous = selector.value;
        status.textContent = 'Loading class timetables…';
        selector.disabled = true;
        try {
            const db = firebase.database();
            const profileSnap = await db.ref(`users/${user.uid}`).once('value');
            const profile = profileSnap.val() || {};
            if (profile.role !== 'teacher' || !profile.schoolId) throw new Error('This teacher account is not assigned to a school.');
            currentSchoolId = profile.schoolId;

            // Fetch metadata and timetables (via versioned cache)
            const [settingsSnap, coursesSnap, assignmentSnap, subjectAssignmentsSnap, timetablesData] = await Promise.all([
                db.ref(`schoolTimetableSettings/${profile.schoolId}`).once('value'),
                db.ref(`schoolCourses/${profile.schoolId}`).once('value'),
                db.ref(`classTeacherAssignmentsByClass/${profile.schoolId}`).once('value'),
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
            const courses = coursesSnap.val() || {};
            const classTeacherAssignments = assignmentSnap.val() || {};
            subjectAssignments = subjectAssignmentsSnap.val() || {};
            schedules = timetablesData.timetables || {};

            // Subscribe to remote version changes to keep cache & view in sync
            if (window.RollCallTimetableCache) {
                window.RollCallTimetableCache.subscribeVersion(profile.schoolId, updatedTimetables => {
                    schedules = updatedTimetables || {};
                    render();
                });
            }

            // Collect all assigned classes for this teacher
            const myAssignedMap = new Map();

            // 1. Class Teacher assignments from profile
            const profileScopes = Array.isArray(profile.classTeacherClassSections) ? profile.classTeacherClassSections : [];
            profileScopes.forEach(item => {
                if (!item?.classId || !item.section) return;
                const classRecord = courses[item.classId] || {};
                const sectionKeyStr = safeKey(`${item.year || ''}|${item.section}`);
                const mapping = classTeacherAssignments[item.classId]?.[sectionKeyStr];
                if (mapping && mapping.teacherId !== user.uid) return;
                const className = item.className || classRecord.courseName || 'Class';
                const key = `${item.classId}|${sectionKeyStr}`;
                myAssignedMap.set(key, {
                    classId: item.classId,
                    className,
                    section: item.section,
                    year: item.year || '',
                    sectionKey: sectionKeyStr,
                    value: key,
                    role: 'Class Teacher'
                });
            });

            // 2. Class Teacher assignments by class
            Object.entries(classTeacherAssignments).forEach(([classId, sections]) => {
                Object.entries(sections || {}).forEach(([sectionKeyStr, assignment]) => {
                    if (assignment?.teacherId !== user.uid) return;
                    const className = assignment.className || courses[classId]?.courseName || 'Class';
                    const key = `${classId}|${sectionKeyStr}`;
                    if (!myAssignedMap.has(key)) {
                        myAssignedMap.set(key, {
                            classId,
                            className,
                            section: assignment.section || '',
                            year: assignment.year || '',
                            sectionKey: sectionKeyStr,
                            value: key,
                            role: 'Class Teacher'
                        });
                    }
                });
            });

            // 3. Subject Teacher assignments
            Object.entries(subjectAssignments).forEach(([classId, sections]) => {
                Object.entries(sections || {}).forEach(([sectionKeyStr, subjects]) => {
                    Object.entries(subjects || {}).forEach(([subKeyStr, assignment]) => {
                        if (assignment?.teacherId !== user.uid) return;
                        const className = assignment.className || courses[classId]?.courseName || 'Class';
                        const key = `${classId}|${sectionKeyStr}`;
                        if (!myAssignedMap.has(key)) {
                            myAssignedMap.set(key, {
                                classId,
                                className,
                                section: assignment.section || '',
                                year: assignment.year || '',
                                sectionKey: sectionKeyStr,
                                value: key,
                                role: assignment.subjectName || assignment.subject || 'Subject Teacher'
                            });
                        }
                    });
                });
            });

            // 4. Lessons assigned directly in timetable slots
            Object.entries(schedules).forEach(([classId, sections]) => {
                Object.entries(sections || {}).forEach(([sectionKeyStr, schedule]) => {
                    const key = `${classId}|${sectionKeyStr}`;
                    if (myAssignedMap.has(key)) return;
                    let hasMySlot = false;
                    let mySubject = '';
                    Object.values(schedule?.slots || {}).forEach(periods => {
                        Object.values(periods || {}).forEach(slot => {
                            if (slot?.teacherId === user.uid) {
                                hasMySlot = true;
                                if (slot.subject && !mySubject) mySubject = slot.subject;
                            }
                        });
                    });
                    if (hasMySlot) {
                        myAssignedMap.set(key, {
                            classId,
                            className: schedule.className || courses[classId]?.courseName || 'Class',
                            section: schedule.section || '',
                            year: schedule.year || '',
                            sectionKey: sectionKeyStr,
                            value: key,
                            role: mySubject ? `Subject: ${mySubject}` : 'My Lessons'
                        });
                    }
                });
            });

            // 5. Collect all other classes in school that have timetables or exist in courses
            const otherClassesMap = new Map();
            Object.entries(schedules).forEach(([classId, sections]) => {
                Object.entries(sections || {}).forEach(([sectionKeyStr, schedule]) => {
                    const key = `${classId}|${sectionKeyStr}`;
                    if (!myAssignedMap.has(key) && !otherClassesMap.has(key)) {
                        otherClassesMap.set(key, {
                            classId,
                            className: schedule.className || courses[classId]?.courseName || 'Class',
                            section: schedule.section || '',
                            year: schedule.year || '',
                            sectionKey: sectionKeyStr,
                            value: key,
                            role: ''
                        });
                    }
                });
            });

            // Also check courses that have sections
            Object.entries(courses).forEach(([classId, course]) => {
                const courseName = course.courseName || course.name || 'Class';
                const courseSections = Array.isArray(course.sections) ? course.sections : [];
                courseSections.forEach(sec => {
                    const secName = typeof sec === 'string' ? sec : (sec.name || '');
                    const secYear = typeof sec === 'object' ? (sec.year || '') : '';
                    if (!secName) return;
                    const secKey = safeKey(`${secYear}|${secName}`);
                    const key = `${classId}|${secKey}`;
                    if (!myAssignedMap.has(key) && !otherClassesMap.has(key)) {
                        otherClassesMap.set(key, {
                            classId,
                            className: courseName,
                            section: secName,
                            year: secYear,
                            sectionKey: secKey,
                            value: key,
                            role: ''
                        });
                    }
                });
            });

            const myClassesList = Array.from(myAssignedMap.values()).sort((a, b) =>
                a.className.localeCompare(b.className) || a.section.localeCompare(b.section)
            );
            const otherClassesList = Array.from(otherClassesMap.values()).sort((a, b) =>
                a.className.localeCompare(b.className) || a.section.localeCompare(b.section)
            );

            scope = [...myClassesList, ...otherClassesList];

            // Build selector HTML with clean optgroups
            let optionsHtml = '<option value="">Select a class section</option>';
            if (myClassesList.length > 0 && otherClassesList.length > 0) {
                optionsHtml += `<optgroup label="My Classes (${myClassesList.length})">` +
                    myClassesList.map(item =>
                        `<option value="${esc(item.value)}">${esc(item.className)} · ${esc(item.section)}${item.year ? ` · ${esc(item.year)}` : ''}${item.role ? ` (${esc(item.role)})` : ''}</option>`
                    ).join('') + '</optgroup>';
                optionsHtml += `<optgroup label="All School Classes (${otherClassesList.length})">` +
                    otherClassesList.map(item =>
                        `<option value="${esc(item.value)}">${esc(item.className)} · ${esc(item.section)}${item.year ? ` · ${esc(item.year)}` : ''}</option>`
                    ).join('') + '</optgroup>';
            } else if (myClassesList.length > 0) {
                optionsHtml += myClassesList.map(item =>
                    `<option value="${esc(item.value)}">${esc(item.className)} · ${esc(item.section)}${item.year ? ` · ${esc(item.year)}` : ''}${item.role ? ` (${esc(item.role)})` : ''}</option>`
                ).join('');
            } else {
                optionsHtml += otherClassesList.map(item =>
                    `<option value="${esc(item.value)}">${esc(item.className)} · ${esc(item.section)}${item.year ? ` · ${esc(item.year)}` : ''}</option>`
                ).join('');
            }

            selector.innerHTML = optionsHtml;

            // Preserve previous selection if still available, or pick default
            if (previous && scope.some(item => item.value === previous)) {
                selector.value = previous;
            } else if (myClassesList.length > 0) {
                selector.value = myClassesList[0].value;
            } else if (otherClassesList.length > 0) {
                selector.value = otherClassesList[0].value;
            } else {
                selector.value = '';
            }

            shell.querySelector('.ct-toolbar').hidden = scope.length === 0;
            selector.disabled = scope.length === 0;

            render();
            status.textContent = scope.length
                ? `Loaded ${scope.length} class timetable${scope.length === 1 ? '' : 's'}.`
                : '';
        } catch (error) {
            console.error('Unable to load timetables:', error);
            scope = [];
            schedules = {};
            subjectAssignments = {};
            shell.querySelector('.ct-toolbar').hidden = true;
            selector.innerHTML = '<option value="">Timetable unavailable</option>';
            status.textContent = error.message || 'Unable to load class timetables.';
            grid.innerHTML = '<div class="ct-empty">Your timetable could not be loaded. Please try again.</div>';
        }
    }

    selector.addEventListener('change', render);
    shell.querySelector('#ctRefresh').addEventListener('click', () => load(true));
    firebase.auth().onAuthStateChanged(user => {
        if (!user && currentSchoolId && window.RollCallTimetableCache) {
            window.RollCallTimetableCache.unsubscribeVersion(currentSchoolId);
        }
        load(false);
    });
});
