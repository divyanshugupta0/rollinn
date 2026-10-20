// Read-only school schedule for the teacher Classes panel.
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('classesSection');
    if (!section) return;

    const originalManagement = section.querySelector('.class-management');
    if (originalManagement) originalManagement.hidden = true;
    const legacyManager = section.querySelector('.class-manager');
    if (legacyManager) legacyManager.hidden = true;

    const panel = document.createElement('section');
    panel.className = 'teacher-schedule-panel';
    panel.innerHTML = `
        <div class="teacher-schedule-heading">
            <div><span class="teacher-schedule-eyebrow">READ ONLY · SCHOOL TIMETABLE</span><h2><i class="fas fa-calendar-week"></i> My Class Schedule</h2><p>Classes and location sessions assigned by your school administrator.</p></div>
            <button type="button" class="teacher-schedule-refresh" id="refreshTeacherSchedule"><i class="fas fa-rotate-right"></i> Refresh</button>
        </div>
        <div class="teacher-schedule-live" id="teacherScheduleLive" role="status" aria-live="polite"></div>
        <div class="teacher-schedule-table-wrap"><table class="teacher-schedule-table"><thead><tr><th>Day / Date</th><th>Time</th><th>Class</th><th>Location / Room</th><th>Section</th><th>Status</th></tr></thead><tbody id="teacherScheduleRows"><tr><td colspan="6" class="teacher-schedule-empty">Sign in to load your school timetable.</td></tr></tbody></table></div>
        <div class="teacher-schedule-mobile" id="teacherScheduleMobile" aria-label="Class schedule"></div>
        <div class="teacher-schedule-footnote"><i class="fas fa-circle-info"></i> This timetable is view only. Contact your administrator to change a class schedule.</div>`;
    const header = section.querySelector('.header');
    if (header) header.insertAdjacentElement('afterend', panel);
    else section.prepend(panel);

    const style = document.createElement('style');
    style.textContent = `
        #classesSection .class-manager,#classesSection .class-management,#classesSection > .date-selector-container{display:none!important}
        .teacher-schedule-panel{margin:18px 0 24px;padding:24px;border:1px solid #e2eae3;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(28,55,37,.05)}
        .teacher-schedule-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:18px}
        .teacher-schedule-eyebrow{color:#678174;font-size:10px;font-weight:800;letter-spacing:.12em}
        .teacher-schedule-heading h2{margin:5px 0;color:#20342a;font-size:21px}
        .teacher-schedule-heading h2 i{margin-right:8px;color:#17704d}
        .teacher-schedule-heading p{margin:0;color:#75847b;font-size:13px}
        .teacher-schedule-refresh{display:inline-flex!important;align-items:center;justify-content:center;gap:8px;width:max-content!important;min-width:120px;max-width:max-content;flex:0 0 auto!important;align-self:flex-start;white-space:nowrap;min-height:42px;padding:0 14px;border:1px solid #dce8df;border-radius:10px;background:#f5faf6;color:#176b4d;font-weight:700;cursor:pointer}
        .teacher-schedule-live{margin:0 0 12px;color:#65766b;font-size:13px}
        .teacher-schedule-table-wrap{overflow:auto;border:1px solid #e5ece6;border-radius:12px}
        .teacher-schedule-table{width:100%;border-collapse:collapse;min-width:750px;text-align:left}
        .teacher-schedule-table th{padding:12px 14px;background:#f4f8f5;color:#65766b;font-size:10px;text-transform:uppercase;letter-spacing:.07em}
        .teacher-schedule-table td{padding:14px;border-top:1px solid #edf1ee;color:#304238;font-size:13px}
        .teacher-schedule-table tbody tr.is-current{animation:teacherClassPulse 1.35s ease-in-out infinite;box-shadow:inset 4px 0 #36a568}
        @keyframes teacherClassPulse{0%,100%{background:#eff9f1}50%{background:#d7f1df}}
        .teacher-schedule-current{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:#d9f2e0;color:#17613f;font-size:11px;font-weight:800}
        .teacher-schedule-current i{animation:teacherDotPulse 1s ease-in-out infinite}
        @keyframes teacherDotPulse{50%{opacity:.25;transform:scale(.8)}}
        .teacher-schedule-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#f1f4f2;color:#69776f;font-size:11px;font-weight:700}
        .teacher-schedule-empty{padding:34px!important;text-align:center;color:#79867e!important}
        .teacher-schedule-footnote{margin-top:14px;color:#7a887f;font-size:11px}.teacher-schedule-footnote i{margin-right:5px;color:#28734f}
        .teacher-schedule-mobile{display:none}
        @media(max-width:700px){.teacher-schedule-panel{padding:16px}.teacher-schedule-heading{align-items:flex-start}.teacher-schedule-heading h2{font-size:18px}.teacher-schedule-heading p{max-width:250px;line-height:1.45}.teacher-schedule-table-wrap{display:none}.teacher-schedule-mobile{display:grid;gap:10px}.teacher-schedule-card{padding:14px;border:1px solid #e2eae3;border-radius:12px;background:#fff}.teacher-schedule-card.is-current{animation:teacherClassPulse 1.35s ease-in-out infinite;border-color:#68b987}.teacher-schedule-card h3{margin:0 0 6px;color:#20342a;font-size:15px}.teacher-schedule-card p{margin:4px 0;color:#65766b;font-size:12px}.teacher-schedule-refresh{padding:0 10px;font-size:12px}}
    `;
    document.head.appendChild(style);

    const body = document.getElementById('teacherScheduleRows');
    const mobile = document.getElementById('teacherScheduleMobile');
    const live = document.getElementById('teacherScheduleLive');
    let records = [];

    const escape = value => String(value == null ? '' : value);
    const asDate = value => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
    const toMinutes = value => {
        if (!value || !/^\d{1,2}:\d{2}$/.test(String(value))) return null;
        const [hour, minute] = String(value).split(':').map(Number);
        return hour * 60 + minute;
    };
    const normDay = value => String(value || '').toLowerCase().slice(0, 3);
    const sectionText = value => Array.isArray(value) ? value.join(', ') : (value || 'General');
    const dateLabel = date => date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const timeLabel = date => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    function convertRows(classes, locations) {
        const rows = [];
        Object.entries(classes || {}).forEach(([id, item]) => {
            if (!item || item.status === 'inactive') return;
            const days = Array.isArray(item.days) ? item.days : (item.days ? [item.days] : []);
            if (days.length && item.startTime && item.endTime) {
                days.forEach(day => rows.push({ id, source: 'class', day: String(day), start: item.startTime, end: item.endTime, title: item.name || item.subject || 'Class', place: item.room || '—', section: item.section || item.grade || '—', sourceData: item }));
            } else if (item.startTime && item.endTime) {
                rows.push({ id, source: 'class', day: 'Schedule', start: item.startTime, end: item.endTime, title: item.name || item.subject || 'Class', place: item.room || '—', section: item.section || item.grade || '—', sourceData: item });
            }
        });
        Object.entries(locations || {}).forEach(([id, item]) => {
            if (!item || item.status === 'inactive') return;
            const startDate = asDate(item.scheduledStart);
            const endDate = asDate(item.expiresAt);
            if (startDate) {
                const fallbackEnd = new Date(startDate.getTime() + (Number(item.classDuration) || 60) * 60000);
                rows.push({ id, source: 'location', startDate, endDate: endDate || fallbackEnd, day: dateLabel(startDate), start: timeLabel(startDate), end: timeLabel(endDate || fallbackEnd), title: item.className || item.name || 'Class session', place: item.name || '—', section: sectionText(item.section), sourceData: item });
            } else if (item.startTime && item.endTime) {
                const days = Array.isArray(item.days) ? item.days : (item.days ? [item.days] : []);
                (days.length ? days : ['Schedule']).forEach(day => rows.push({ id, source: 'location', day: String(day), start: item.startTime, end: item.endTime, title: item.className || item.name || 'Class session', place: item.name || '—', section: sectionText(item.section), sourceData: item }));
            }
        });
        rows.sort((a, b) => {
            const dayOrder = ['mon','tue','wed','thu','fri','sat','sun'];
            const aDay = dayOrder.indexOf(normDay(a.day));
            const bDay = dayOrder.indexOf(normDay(b.day));
            const dayCompare = (aDay < 0 ? 99 : aDay) - (bDay < 0 ? 99 : bDay);
            return dayCompare || (toMinutes(a.start) ?? (a.startDate?.getHours() * 60 + a.startDate?.getMinutes() || 0)) - (toMinutes(b.start) ?? (b.startDate?.getHours() * 60 + b.startDate?.getMinutes() || 0));
        });
        return rows;
    }

    function isCurrent(row, now) {
        if (row.sourceData.status === 'inactive') return false;
        if (row.startDate) return now >= row.startDate && now <= row.endDate;
        const dayMatches = normDay(row.day) === now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const start = toMinutes(row.start), end = toMinutes(row.end), current = now.getHours() * 60 + now.getMinutes();
        return dayMatches && start !== null && end !== null && current >= start && current < end;
    }

    function render() {
        const now = new Date();
        body.replaceChildren();
        mobile.replaceChildren();
        if (!records.length) {
            const empty = document.createElement('tr');
            empty.innerHTML = '<td colspan="6" class="teacher-schedule-empty">No scheduled classes are assigned to your school yet.</td>';
            body.appendChild(empty);
            mobile.innerHTML = '<div class="teacher-schedule-empty">No scheduled classes are assigned to your school yet.</div>';
            live.textContent = 'Your schedule has no upcoming entries.';
            return;
        }
        let activeCount = 0;
        records.forEach(row => {
            const current = isCurrent(row, now);
            if (current) activeCount++;
            const tr = document.createElement('tr');
            if (current) tr.className = 'is-current';
            const values = [row.day, `${row.start} – ${row.end}`, row.title, row.place, row.section];
            values.forEach(value => { const td = document.createElement('td'); td.textContent = escape(value); tr.appendChild(td); });
            const statusTd = document.createElement('td');
            if (current) { statusTd.innerHTML = '<span class="teacher-schedule-current"><i class="fas fa-circle"></i> IN SESSION</span>'; }
            else { const badge = document.createElement('span'); badge.className = 'teacher-schedule-badge'; badge.textContent = row.startDate && now > row.endDate ? 'Completed' : 'Scheduled'; statusTd.appendChild(badge); }
            tr.appendChild(statusTd);
            body.appendChild(tr);

            const card = document.createElement('article');
            card.className = `teacher-schedule-card${current ? ' is-current' : ''}`;
            const heading = document.createElement('h3'); heading.textContent = row.title;
            const details = document.createElement('p'); details.textContent = `${row.day} · ${row.start}–${row.end} · ${row.place}`;
            const sectionLine = document.createElement('p'); sectionLine.textContent = `Section: ${row.section}`;
            card.append(heading, details, sectionLine);
            if (current) { const badge = document.createElement('span'); badge.className = 'teacher-schedule-current'; badge.textContent = 'IN SESSION'; card.appendChild(badge); }
            mobile.appendChild(card);
        });
        live.textContent = activeCount ? `${activeCount} class${activeCount === 1 ? '' : 'es'} in session now.` : `Today · ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    }

    async function load(schoolId) {
        if (!schoolId) {
            body.innerHTML = '<tr><td colspan="6" class="teacher-schedule-empty">This teacher account is not assigned to a school.</td></tr>';
            live.textContent = '';
            return;
        }
        live.textContent = 'Loading school timetable…';
        body.innerHTML = '<tr><td colspan="6" class="teacher-schedule-empty"><i class="fas fa-spinner fa-spin"></i> Loading schedule</td></tr>';
        try {
            const [classesSnap, locationsSnap] = await Promise.all([
                firebase.database().ref(`schoolClasses/${schoolId}`).once('value'),
                firebase.database().ref(`schoolLocations/${schoolId}`).once('value')
            ]);
            records = convertRows(classesSnap.val() || {}, locationsSnap.val() || {});
            render();
        } catch (error) {
            console.error('Unable to load school timetable:', error);
            body.innerHTML = '<tr><td colspan="6" class="teacher-schedule-empty">Unable to load the school timetable. Please try again.</td></tr>';
            live.textContent = '';
        }
    }

    document.getElementById('refreshTeacherSchedule').addEventListener('click', () => {
        const user = firebase.auth().currentUser;
        if (!user) return;
        firebase.database().ref(`users/${user.uid}`).once('value').then(snapshot => load(snapshot.val()?.schoolId));
    });
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            body.innerHTML = '<tr><td colspan="6" class="teacher-schedule-empty">Sign in to load your school timetable.</td></tr>';
            mobile.replaceChildren();
            live.textContent = '';
            return;
        }
        firebase.database().ref(`users/${user.uid}`).once('value').then(snapshot => {
            const profile = snapshot.val() || {};
            if (profile.role !== 'teacher') throw new Error('Teacher access required.');
            load(profile.schoolId);
        }).catch(error => {
            console.error('Unable to verify teacher schedule account:', error);
            body.innerHTML = '<tr><td colspan="6" class="teacher-schedule-empty">Unable to verify your school timetable.</td></tr>';
        });
    });
    setInterval(render, 30000);
});
