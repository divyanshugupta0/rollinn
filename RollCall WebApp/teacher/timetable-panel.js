// Read-only, school-scoped timetable for teachers.
document.addEventListener('DOMContentLoaded', () => {
    const DAYS = [
        { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' },
        { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' },
        { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
        { key: 'sun', label: 'Sunday' }
    ];
    const dayKey = value => String(value || '').trim().toLowerCase().slice(0, 3);
    const minutes = value => {
        const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const time = value => {
        const m = minutes(value);
        if (m === null) return String(value || '');
        return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };
    const dateValue = value => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const style = document.createElement('style');
    style.textContent = `
      #timetableSection .timetable-manager,#timetableModal,#timetableSection .modal-overlay,#timetableSection #timetableAlert{display:none!important}
      .main-content .container.timetable-page-container{width:100%;max-width:none}.section-container#timetableSection.active{min-height:calc(100vh - 125px);display:flex;flex-direction:column}.tp-shell{display:flex;flex:1 0 auto;flex-direction:column;width:100%;max-width:none;min-height:calc(100vh - 220px);margin:18px 0 0;color:#20342a}.tp-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 26px;border:1px solid #dfebe2;border-radius:20px;background:linear-gradient(120deg,#fff 10%,#f0f8f2 100%);box-shadow:0 12px 32px rgba(26,63,42,.06)}
      .tp-kicker{margin:0 0 7px;color:#267352;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.tp-hero h2{margin:0;font-size:25px;letter-spacing:-.03em}.tp-hero p{margin:8px 0 0;color:#718178;font-size:14px}.tp-readonly{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #d6e8dc;border-radius:999px;background:#fff;color:#24704e;font-size:12px;font-weight:750;white-space:nowrap}
      .tp-toolbar{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0;padding:14px 17px;border:1px solid #e1ebe4;border-radius:15px;background:#fff}.tp-week-label{font-weight:750;color:#263b30}.tp-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}.tp-btn,.tp-select{min-height:40px;border:1px solid #dce8df;border-radius:10px;background:#fff;color:#26513b;font:inherit}.tp-actions .tp-btn{display:inline-flex!important;width:auto!important;min-width:44px;height:42px;min-height:42px;flex:0 0 auto;padding:0 13px;align-items:center;justify-content:center;gap:7px;font-family:inherit;font-size:13px;line-height:1;white-space:nowrap;box-shadow:none}.tp-btn:hover{background:#f0f8f2}.tp-select{padding:0 32px 0 12px}.tp-live{margin:0 0 12px;color:#63766a;font-size:13px}.tp-live strong{color:#23744f}
      .tp-grid-wrap{overflow:auto;border:1px solid #e0e9e2;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(34,60,42,.04)}.tp-grid{width:100%;min-width:920px;border-collapse:separate;border-spacing:0;table-layout:fixed}.tp-grid th{padding:15px 12px;border-bottom:1px solid #e4ece6;background:#f5f9f6;color:#687b70;text-align:left;font-size:11px;letter-spacing:.07em;text-transform:uppercase}.tp-grid th:first-child{width:130px}.tp-grid td{height:106px;padding:9px;vertical-align:top;border-right:1px solid #edf1ee;border-bottom:1px solid #edf1ee}.tp-grid td:first-child{background:#fafcfb;color:#63766a;font-size:12px;font-weight:700}.tp-grid td:last-child,.tp-grid th:last-child{border-right:0}.tp-grid tr:last-child td{border-bottom:0}.tp-grid .tp-day-head{color:#244a35}.tp-grid .tp-day-head.today{background:#eaf6ed;color:#1a7048}.tp-cell-list{display:grid;gap:7px}.tp-event{padding:9px 10px;border:1px solid #dcebe0;border-left:3px solid #40986a;border-radius:10px;background:#f4faf5}.tp-event.active{border-color:#65b783;background:#e8f8ec;animation:tpPulse 1.35s ease-in-out infinite}.tp-event-time{display:block;margin-bottom:4px;color:#28704c;font-size:11px;font-weight:800}.tp-event-title{display:block;color:#243a2e;font-size:12px;font-weight:750;line-height:1.35}.tp-event-meta{display:block;margin-top:4px;color:#708076;font-size:11px;line-height:1.35}.tp-active-tag{display:inline-flex;margin-top:6px;padding:3px 7px;border-radius:99px;background:#ccefd6;color:#17663f;font-size:9px;font-weight:900;letter-spacing:.04em}.tp-empty-cell{padding:8px 2px;color:#c0cbc3;text-align:center;font-size:12px}.tp-foot{display:flex;align-items:center;gap:8px;margin-top:13px;color:#74837a;font-size:12px}.tp-foot i{color:#28734f}.tp-mobile{display:none}.tp-state{padding:32px 18px;border:1px solid #e0e9e2;border-radius:16px;background:#fff;color:#76847b;text-align:center}.tp-state i{display:block;margin-bottom:10px;color:#4a9a6b;font-size:24px}.tp-empty-week{display:none;padding:32px 20px;border:1px solid #e0e9e2;border-radius:16px;background:#fff;color:#76847b;text-align:center}.tp-empty-week i{display:block;margin-bottom:10px;color:#4a9a6b;font-size:24px}
      @keyframes tpPulse{0%,100%{box-shadow:0 0 0 0 rgba(60,160,100,.08)}50%{box-shadow:0 0 0 4px rgba(60,160,100,.16)}}
      @media(max-width:760px){.section-container#timetableSection.active{min-height:calc(100svh - 90px)}.tp-shell{min-height:calc(100svh - 180px);margin-top:12px}.tp-hero{align-items:flex-start;padding:19px;flex-direction:column}.tp-hero h2{font-size:21px}.tp-toolbar{align-items:flex-start;flex-direction:column}.tp-grid-wrap{display:none}.tp-mobile{display:grid;gap:10px}.tp-mobile-day{padding:13px;border:1px solid #e0e9e2;border-radius:13px;background:#fff}.tp-mobile-day h3{display:flex;justify-content:space-between;margin:0 0 10px;color:#30483a;font-size:14px}.tp-mobile-day h3.today{color:#1b754d}.tp-mobile .tp-event{padding:12px}.tp-mobile .tp-event-title{font-size:13px}.tp-mobile .tp-empty-cell{text-align:left;padding:5px 0}.tp-actions{width:auto;max-width:100%;flex-wrap:wrap}.tp-readonly{font-size:11px}}
      @media(prefers-reduced-motion:reduce){.tp-event.active{animation:none}}
    `;
    document.head.appendChild(style);

    const tryInit = () => {
        const section = document.getElementById('timetableSection');
        if (!section || section.querySelector('.tp-shell')) return false;
        const pageContainer = section.closest('.main-content .container');
        if (pageContainer) pageContainer.classList.add('timetable-page-container');
        const shell = document.createElement('div');
        shell.className = 'tp-shell';
        shell.innerHTML = `
          <header class="tp-hero"><div><p class="tp-kicker">School schedule · teacher view</p><h2><i class="fas fa-calendar-week"></i> My weekly timetable</h2><p>Classes and sessions assigned by your school administrator.</p></div><span class="tp-readonly"><i class="fas fa-lock"></i> Read only</span></header>
          <div class="tp-toolbar"><div class="tp-week-label" id="tpWeekLabel">This week</div><div class="tp-actions"><button type="button" class="tp-btn" id="tpPrev" aria-label="Previous week"><i class="fas fa-chevron-left"></i></button><button type="button" class="tp-btn" id="tpToday"><i class="fas fa-calendar-day"></i> This week</button><button type="button" class="tp-btn" id="tpNext" aria-label="Next week"><i class="fas fa-chevron-right"></i></button><button type="button" class="tp-btn" id="tpRefresh"><i class="fas fa-rotate-right"></i> Refresh</button></div></div>
          <p class="tp-live" id="tpLive" role="status" aria-live="polite">Loading your school timetable…</p>
          <div class="tp-grid-wrap"><table class="tp-grid"><thead><tr id="tpHead"><th>Time</th></tr></thead><tbody id="tpBody"></tbody></table></div>
          <div class="tp-empty-week" id="tpEmptyWeek"><i class="fas fa-calendar-check"></i>No classes are scheduled for this week.</div>
          <div class="tp-mobile" id="tpMobile"></div>
          <div class="tp-foot"><i class="fas fa-circle-info"></i> Schedule changes are managed by your school administrator.</div>`;
        const header = section.querySelector('.header');
        (header || section).insertAdjacentElement(header ? 'afterend' : 'afterbegin', shell);

        let events = [];
        let weekStart = monday(new Date());
        const head = shell.querySelector('#tpHead'), body = shell.querySelector('#tpBody'), mobile = shell.querySelector('#tpMobile'), live = shell.querySelector('#tpLive'), weekLabel = shell.querySelector('#tpWeekLabel'), gridWrap = shell.querySelector('.tp-grid-wrap'), emptyWeek = shell.querySelector('#tpEmptyWeek');
        function monday(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
        function fmtDate(d) { return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
        function weekdayIndex(value) { const key = dayKey(value); return DAYS.findIndex(day => day.key === key); }
        function normalize(classes, locations) {
            const list = [];
            Object.entries(classes || {}).forEach(([id, c]) => {
                if (!c || c.status === 'inactive' || !c.startTime || !c.endTime) return;
                const days = Array.isArray(c.days) ? c.days : (c.days ? [c.days] : []);
                days.forEach(d => { const di = weekdayIndex(d); if (di >= 0) list.push({ id, day: di, start: c.startTime, end: c.endTime, title: c.name || c.subject || 'Class', subject: c.subject || '', place: c.room || '', section: Array.isArray(c.section) ? c.section.join(', ') : (c.section || c.grade || ''), kind: 'Class' }); });
            });
            Object.entries(locations || {}).forEach(([id, loc]) => {
                if (!loc || loc.status === 'inactive') return;
                const startDate = dateValue(loc.scheduledStart);
                if (startDate) {
                    const finish = dateValue(loc.expiresAt) || new Date(startDate.getTime() + (Number(loc.classDuration) || 60) * 60000);
                    const di = (startDate.getDay() + 6) % 7;
                    list.push({ id, day: di, start: `${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`, end: `${String(finish.getHours()).padStart(2,'0')}:${String(finish.getMinutes()).padStart(2,'0')}`, date: startDate, finish, title: loc.className || loc.name || 'Scheduled session', subject: '', place: loc.name || '', section: Array.isArray(loc.section) ? loc.section.join(', ') : (loc.section || ''), kind: 'Location session' });
                } else {
                    const days = Array.isArray(loc.days) ? loc.days : (loc.days ? [loc.days] : []);
                    days.forEach(d => { const di = weekdayIndex(d); if (di >= 0 && loc.startTime && loc.endTime) list.push({ id, day: di, start: loc.startTime, end: loc.endTime, title: loc.className || loc.name || 'Scheduled session', subject: '', place: loc.name || '', section: Array.isArray(loc.section) ? loc.section.join(', ') : (loc.section || ''), kind: 'Location session' }); });
                }
            });
            return list.sort((a,b) => a.day-b.day || (minutes(a.start) ?? 0) - (minutes(b.start) ?? 0));
        }
        function active(e, now) {
            if (e.date) return now >= e.date && now < e.finish;
            const nowMinutes = now.getHours()*60+now.getMinutes();
            return ((now.getDay()+6)%7) === e.day && minutes(e.start) !== null && minutes(e.end) !== null && nowMinutes >= minutes(e.start) && nowMinutes < minutes(e.end);
        }
        function eventHtml(e, now) {
            const current = active(e, now);
            const detail = [e.kind, e.section && `Section ${e.section}`, e.place].filter(Boolean).join(' · ');
            return `<article class="tp-event${current ? ' active' : ''}"><span class="tp-event-time">${esc(time(e.start))} – ${esc(time(e.end))}</span><span class="tp-event-title">${esc(e.title)}</span>${detail ? `<span class="tp-event-meta">${esc(detail)}</span>` : ''}${current ? '<span class="tp-active-tag">● IN SESSION</span>' : ''}</article>`;
        }
        function render() {
            const now = new Date(), endWeek = new Date(weekStart); endWeek.setDate(endWeek.getDate()+6);
            weekLabel.textContent = `${fmtDate(weekStart)} – ${fmtDate(endWeek)} · ${weekStart.getFullYear()}`;
            head.innerHTML = '<th>Time</th>' + DAYS.map((d,i) => `<th class="tp-day-head${((now.getDay()+6)%7)===i && weekStart.toDateString()===monday(now).toDateString()?' today':''}">${d.label}</th>`).join('');
            body.replaceChildren(); mobile.replaceChildren();
            const weekEvents = events.filter(e => !e.date || (e.date >= weekStart && e.date < new Date(endWeek.getFullYear(),endWeek.getMonth(),endWeek.getDate()+1)));
            const times = [...new Set(weekEvents.map(e => e.start))].sort((a,b)=>(minutes(a)??0)-(minutes(b)??0));
            if (!weekEvents.length) {
                gridWrap.hidden = true; emptyWeek.style.display = 'block';
                mobile.innerHTML = '<div class="tp-state"><i class="fas fa-calendar-check"></i>No classes are scheduled for this week.</div>';
            } else {
                gridWrap.hidden = false; emptyWeek.style.display = 'none';
                times.forEach(start => {
                    const tr = document.createElement('tr');
                    const label = document.createElement('td'); label.textContent = time(start); tr.appendChild(label);
                    DAYS.forEach((_, i) => { const td = document.createElement('td'); const items = weekEvents.filter(e => e.day===i && e.start===start); td.innerHTML = items.length ? `<div class="tp-cell-list">${items.map(e=>eventHtml(e,now)).join('')}</div>` : '<div class="tp-empty-cell">—</div>'; tr.appendChild(td); });
                    body.appendChild(tr);
                });
                DAYS.forEach((day,i) => {
                    const dayEvents = weekEvents.filter(e=>e.day===i);
                    const today = ((now.getDay()+6)%7)===i && weekStart.toDateString()===monday(now).toDateString();
                    const article = document.createElement('section'); article.className='tp-mobile-day';
                    article.innerHTML = `<h3 class="${today?'today':''}"><span>${day.label}</span>${today?'<span>Today</span>':''}</h3>${dayEvents.length ? dayEvents.map(e=>eventHtml(e,now)).join('') : '<div class="tp-empty-cell">No scheduled classes</div>'}`;
                    mobile.appendChild(article);
                });
            }
            const currentCount = events.filter(e=>active(e,now)).length;
            live.innerHTML = currentCount ? `<strong>${currentCount} class${currentCount===1?'':'es'} in session now</strong> · highlighted in the timetable` : `${events.length} scheduled class${events.length===1?'':'es'} found for your school.`;
        }
        async function load() {
            const user = firebase.auth().currentUser;
            if (!user) { live.textContent = 'Sign in to load your school timetable.'; return; }
            live.textContent = 'Loading your school timetable…';
            try {
                const profileSnap = await firebase.database().ref(`users/${user.uid}`).once('value');
                const profile = profileSnap.val() || {};
                if (profile.role !== 'teacher' || !profile.schoolId) { events=[]; live.textContent = 'This teacher account is not assigned to a school.'; render(); return; }
                const [classSnap, locationSnap] = await Promise.all([
                    firebase.database().ref(`schoolClasses/${profile.schoolId}`).once('value'),
                    firebase.database().ref(`schoolLocations/${profile.schoolId}`).once('value')
                ]);
                events = normalize(classSnap.val() || {}, locationSnap.val() || {});
                render();
            } catch (error) { console.error('Unable to load timetable:', error); events=[]; live.textContent='Unable to load the school timetable. Please try again.'; render(); }
        }
        shell.querySelector('#tpRefresh').addEventListener('click', load);
        shell.querySelector('#tpToday').addEventListener('click', () => { weekStart=monday(new Date()); render(); });
        shell.querySelector('#tpPrev').addEventListener('click', () => { weekStart.setDate(weekStart.getDate()-7); render(); });
        shell.querySelector('#tpNext').addEventListener('click', () => { weekStart.setDate(weekStart.getDate()+7); render(); });
        firebase.auth().onAuthStateChanged(user => { if (user) load(); else { events=[]; live.textContent='Sign in to load your school timetable.'; render(); } });
        window.setInterval(render, 30000);
        return true;
    };
    if (!tryInit()) {
        const observer = new MutationObserver(() => { if (tryInit()) observer.disconnect(); });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 10000);
    }
});
