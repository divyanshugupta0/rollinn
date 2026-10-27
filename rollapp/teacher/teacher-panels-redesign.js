document.addEventListener('DOMContentLoaded', () => {
    const settings = document.querySelector('#settingsSection .settings-form');
    if (settings && !settings.querySelector('.teacher-settings-grid')) {
        const grid = document.createElement('div');
        grid.className = 'teacher-settings-grid';
        const nodes = [...settings.children];
        for (let i = 0; i < nodes.length;) {
            const heading = nodes[i];
            const form = nodes[i + 1];
            if (heading?.tagName === 'H2' && form?.tagName === 'FORM') {
                const card = document.createElement('section');
                card.className = 'teacher-setting-card';
                card.append(heading, form);
                grid.append(card);
                i += 2;
            } else {
                grid.append(nodes[i++]);
            }
        }
        settings.append(grid);
    }

    const dashboard = document.getElementById('dashboardSection');
    if (dashboard) {
        dashboard.classList.add('teacher-dashboard-redesigned');
        enhanceTeacherDashboard(dashboard);
    }
    if (settings) settings.classList.add('teacher-settings-redesigned');
});

function enhanceTeacherDashboard(dashboard) {
    const header = dashboard.querySelector('.header');
    const teacherInfo = dashboard.querySelector('#teacherInfo');
    if (header && teacherInfo && !header.querySelector('#dashboardRefreshBtn')) {
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.id = 'dashboardRefreshBtn';
        refresh.className = 'dashboard-refresh-btn';
        refresh.innerHTML = '<i class="fas fa-rotate-right" aria-hidden="true"></i><span>Refresh</span>';
        refresh.addEventListener('click', () => {
            refresh.disabled = true;
            refresh.classList.add('is-loading');
            if (typeof window.loadActiveClasses === 'function') window.loadActiveClasses();
            window.setTimeout(() => { refresh.disabled = false; refresh.classList.remove('is-loading'); }, 1200);
        });
        header.insertBefore(refresh, teacherInfo);
    }

    const welcome = dashboard.querySelector('#teacherWelcome');
    const dateBox = welcome?.querySelector('.welcome-date');
    if (dateBox && !dateBox.querySelector('#dashboardLiveClock')) {
        const live = document.createElement('span');
        live.id = 'dashboardLiveClock';
        live.className = 'dashboard-live-clock';
        dateBox.append(live);
        const tick = () => { live.textContent = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date()); };
        tick();
        window.setInterval(tick, 30000);
    }

    const sessions = dashboard.querySelector('#upcomingClassesList');
    const sessionPanel = sessions?.closest('.upcoming-classes');
    if (sessionPanel && sessions && !sessions.dataset.dashboardSummary) {
        sessions.dataset.dashboardSummary = 'true';
        const title = sessionPanel.querySelector('h2');
        if (title) title.innerHTML = '<i class="fas fa-door-open" aria-hidden="true"></i> Attendance sessions';
        sessions.innerHTML = '<div class="dashboard-session-summary"><span class="dashboard-session-icon"><i class="fas fa-clipboard-check" aria-hidden="true"></i></span><div class="dashboard-session-copy"><strong id="dashboardSessionStatus">Loading your sessions</strong><p>Start or review attendance for sessions available to your school.</p></div><button type="button" id="dashboardAttendanceLink">Open attendance <i class="fas fa-arrow-right" aria-hidden="true"></i></button></div>';
        document.getElementById('dashboardAttendanceLink')?.addEventListener('click', () => document.querySelector('.sidebar-menu .menu-item[data-section="attendance"]')?.click());
        const classCount = document.getElementById('todayClassCount');
        const status = document.getElementById('dashboardSessionStatus');
        const updateStatus = () => {
            const amount = Number(classCount?.textContent || 0);
            if (status) status.textContent = amount ? `${amount} active session${amount === 1 ? '' : 's'} available` : 'No active sessions right now';
        };
        updateStatus();
        if (classCount) new MutationObserver(updateStatus).observe(classCount, { childList: true, characterData: true, subtree: true });
    }

    const today = document.getElementById('welcomeToday');
    if (today) today.textContent = new Intl.DateTimeFormat([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

    const fillScopedStudentCount = async user => {
        const count = document.getElementById('totalStudentCount');
        const note = count?.closest('.summary-card')?.querySelector('small');
        if (!count || !user || !window.firebase?.database) return;
        try {
            const db = firebase.database();
            const snapshot = await db.ref(`users/${user.uid}`).once('value');
            const profile = snapshot.val() || {};
            if (profile.role !== 'teacher' || !profile.schoolId) return;
            const raw = profile.assignedSections ?? profile.sectionsAssigned ?? profile.sectionAssignments ?? [];
            const sections = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : (raw && typeof raw === 'object' ? Object.keys(raw).filter(key => raw[key]) : []));
            const unique = [...new Set(sections.map(value => String(value).trim()).filter(Boolean))];
            if (!unique.length) {
                count.textContent = '0';
                if (note) note.textContent = 'No sections assigned';
                return;
            }
            const snapshots = await Promise.all(unique.map(section => db.ref(`schoolUsers/${profile.schoolId}`).orderByChild('section').equalTo(section).once('value')));
            const studentIds = new Set();
            snapshots.forEach(result => result.forEach(child => {
                const student = child.val() || {};
                if (student.schoolId === profile.schoolId && (!student.role || student.role === 'student')) studentIds.add(child.key);
            }));
            count.textContent = String(studentIds.size);
            if (note) note.textContent = `${unique.length} assigned section${unique.length === 1 ? '' : 's'}`;
        } catch (error) {
            console.error('Unable to load assigned-section student total:', error);
            if (note) note.textContent = 'Assigned-section total unavailable';
        }
    };
    firebase.auth().onAuthStateChanged(user => { if (user) fillScopedStudentCount(user); });
}

const teacherPanelStyles = document.createElement('style');
teacherPanelStyles.id = 'teacher-panels-redesign-styles';
teacherPanelStyles.textContent = `
body.teacher-authenticated #dashboardSection.teacher-dashboard-redesigned {
    display:grid; grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr); gap:20px;
    align-content:start; width:100%; max-width:none; padding-bottom:32px;
}
body.teacher-authenticated #dashboardSection > .header,
body.teacher-authenticated #dashboardSection > #dashboardAlert,
body.teacher-authenticated #dashboardSection > .teacher-welcome,
body.teacher-authenticated #dashboardSection > .dashboard-stats,
body.teacher-authenticated #dashboardSection > .quick-actions,
body.teacher-authenticated #dashboardSection > .student-search { grid-column:1 / -1; }
body.teacher-authenticated #dashboardSection > .header { margin-bottom:0; }
body.teacher-authenticated #dashboardSection > .header { position:relative;z-index:30;display:flex;align-items:center;gap:12px; }
body.teacher-authenticated .section-container > .header { position:relative;z-index:30; }
body.teacher-authenticated .section-container > .header .teacher-info { position:relative;z-index:31; }
body.teacher-authenticated .section-container > .header .header-dropdown { z-index:9999!important; }
body.teacher-authenticated .section-container > .header .header-dropdown,
body.teacher-authenticated .section-container > .header .header-dropdown .dropdown-item,
body.teacher-authenticated .section-container > .header .header-dropdown .dropdown-item span { font-size:13px!important;line-height:1.3; }
body.teacher-authenticated .section-container > .header .header-dropdown .dropdown-item { display:flex!important;align-items:center;gap:10px;min-height:42px;white-space:nowrap; }
body.teacher-authenticated .section-container > .header .header-dropdown .dropdown-item span { display:inline!important;color:#26372d!important;visibility:visible!important;opacity:1!important;font-weight:600; }
body.teacher-authenticated #dashboardSection > .header .teacher-info { margin-left:auto; }
body.teacher-authenticated #dashboardSection .dashboard-refresh-btn { display:inline-flex;width:auto!important;max-width:none;flex:0 0 auto;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid #dce9df;border-radius:11px;background:#fff;color:#246746;font:inherit;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer; }
body.teacher-authenticated #dashboardSection .dashboard-refresh-btn:hover { background:#f0f8f2;border-color:#bad9c2; }
body.teacher-authenticated #dashboardSection .dashboard-refresh-btn.is-loading i { animation:teacherDashSpin .8s linear infinite; }
@keyframes teacherDashSpin { to { transform:rotate(360deg); } }
body.teacher-authenticated #dashboardSection > .teacher-welcome {
    min-height:142px; padding:28px 32px; border:1px solid #dbe9df; border-radius:20px;
    background:radial-gradient(circle at 90% 20%,rgba(117,191,134,.18),transparent 27%),linear-gradient(115deg,#eaf5ec,#fbfdfb 75%);
    box-shadow:0 12px 32px rgba(24,74,49,.06);
}
body.teacher-authenticated #dashboardSection > .teacher-welcome h2 { font-size:clamp(25px,3vw,34px); letter-spacing:-.04em; }
body.teacher-authenticated #dashboardSection > .teacher-welcome p:last-child { font-size:14px; }
body.teacher-authenticated #dashboardSection .welcome-date { display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:9px;row-gap:4px; }
body.teacher-authenticated #dashboardSection .dashboard-live-clock { grid-column:2;color:#fff!important;font-size:12px;font-weight:750; }
body.teacher-authenticated #dashboardSection .dashboard-stats { gap:14px; }
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card {
    min-height:118px; padding:20px; border:1px solid #e0e9e2; border-radius:16px;
    background:#fff; box-shadow:0 8px 24px rgba(24,74,49,.045); transition:transform .18s,box-shadow .18s;
}
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card:hover { transform:translateY(-2px); box-shadow:0 14px 30px rgba(24,74,49,.09); }
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card > i { width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:#eaf5ed;color:#16704f;font-size:17px; }
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card h4 { margin:0 0 7px; color:#718078;font-size:12px;font-weight:650; }
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card .count { font-size:27px;font-weight:750;letter-spacing:-.04em;color:#1d3327; }
body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card small { display:block;margin-top:5px;color:#839087;font-size:10px;line-height:1.35; }
body.teacher-authenticated #dashboardSection > .quick-actions { padding:18px 22px; }
body.teacher-authenticated #dashboardSection .action-buttons { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px; }
body.teacher-authenticated #dashboardSection > .quick-actions .action-buttons { grid-template-columns:repeat(4,minmax(0,1fr)); }
body.teacher-authenticated #dashboardSection .action-btn { min-height:74px; justify-content:flex-start; gap:12px; padding:14px 16px; border:1px solid #e3ece5; border-radius:14px;background:#fbfdfb; color:#284334; font-weight:650; }
body.teacher-authenticated #dashboardSection .action-btn i { width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:#e8f4eb;color:#16704f; }
body.teacher-authenticated #dashboardSection .action-btn:hover { border-color:#b9d8c2;background:#f2f9f3;transform:translateY(-1px); }
body.teacher-authenticated #dashboardSection > .upcoming-classes,
body.teacher-authenticated #dashboardSection > .recent-activity { min-width:0;min-height:210px;margin:0; }
body.teacher-authenticated #dashboardSection .classes-list,
body.teacher-authenticated #dashboardSection .activity-list { min-height:150px; }
body.teacher-authenticated #dashboardSection .dashboard-session-summary { display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:13px;min-height:112px;padding:15px;border:1px solid #e5eee7;border-radius:13px;background:#f9fcf9; }
body.teacher-authenticated #dashboardSection .dashboard-session-icon { flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#e9f5ec;color:#176b4d; }
body.teacher-authenticated #dashboardSection .dashboard-session-copy { min-width:0;flex:1; }
body.teacher-authenticated #dashboardSection .dashboard-session-copy strong { color:#294334;font-size:14px; }
body.teacher-authenticated #dashboardSection .dashboard-session-copy p { margin:5px 0 0;color:#7b8980;font-size:12px;line-height:1.5; }
body.teacher-authenticated #dashboardSection .dashboard-session-summary button,
body.teacher-authenticated #dashboardSection .dashboard-directory-button { display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 13px;border:0;border-radius:10px;background:#176b4d;color:#fff;font:inherit;font-size:12px;font-weight:750;white-space:nowrap;cursor:pointer; }
body.teacher-authenticated #dashboardSection .dashboard-session-summary button { width:auto;min-width:150px;flex:none; }
body.teacher-authenticated #dashboardSection .dashboard-session-summary button:hover,
body.teacher-authenticated #dashboardSection .dashboard-directory-button:hover { background:#10563d; }
body.teacher-authenticated #dashboardSection > .student-search { margin-top:0; }
body.teacher-authenticated #dashboardSection .dashboard-directory-card { display:flex;align-items:center;justify-content:space-between;gap:20px; }
body.teacher-authenticated #dashboardSection .dashboard-directory-copy { display:flex;align-items:center;gap:14px;min-width:0; }
body.teacher-authenticated #dashboardSection .dashboard-directory-icon { flex:0 0 44px;width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:#e9f5ec;color:#176b4d;font-size:18px; }
body.teacher-authenticated #dashboardSection .dashboard-directory-copy h2 { margin:0;color:#24392e;font-size:16px; }
body.teacher-authenticated #dashboardSection .dashboard-directory-copy p { margin:5px 0 0;color:#718078;font-size:12px; }
body.teacher-authenticated #dashboardSection .dashboard-directory-card .dashboard-directory-button { min-width:175px; }
body.teacher-authenticated #settingsSection.teacher-settings-redesigned { width:100%;max-width:none;min-height:calc(100vh - 48px);padding-bottom:34px; }
body.teacher-authenticated #settingsSection .settings-form { padding:24px; }
body.teacher-authenticated #settingsSection .settings-form > h2 { margin:0 0 14px;color:#20382a; }
body.teacher-authenticated #settingsSection .teacher-settings-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px; }
body.teacher-authenticated #settingsSection .teacher-setting-card { min-width:0;padding:20px;border:1px solid #e1ebe3;border-radius:16px;background:linear-gradient(155deg,#fff,#fbfdfb);box-shadow:0 8px 24px rgba(24,74,49,.045); }
body.teacher-authenticated #settingsSection .teacher-setting-card h2 { display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 0 13px;border-bottom:1px solid #e9f0ea;color:#20382a;font-size:17px; }
body.teacher-authenticated #settingsSection .teacher-setting-card h2 i { width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#eaf5ed;color:#16704f; }
body.teacher-authenticated #settingsSection .teacher-setting-card form { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0;padding:0;border:0;background:transparent; }
body.teacher-authenticated #settingsSection .teacher-setting-card .form-group { min-width:0;margin:0; }
body.teacher-authenticated #settingsSection .teacher-setting-card .primary-btn { align-self:end;justify-self:start;min-height:44px;padding:0 20px;border-radius:11px; }
body.teacher-authenticated #settingsSection #profileSettingsForm .form-group:has(#settingsProfilePic),
body.teacher-authenticated #settingsSection #profileSettingsForm .primary-btn,
body.teacher-authenticated #settingsSection #changePasswordForm .primary-btn { grid-column:1/-1; }
body.teacher-authenticated #settingsSection .teacher-setting-card .checkbox-group { display:flex;align-items:center;gap:10px;min-height:48px;margin:0;padding:10px 12px;border:1px solid #e7eee8;border-radius:11px;background:#fff; }
body.teacher-authenticated #settingsSection .teacher-setting-card .checkbox-group input { accent-color:#16704f; }
body.teacher-authenticated #settingsSection .teacher-setting-card .checkbox-group label { margin:0; }
@media(max-width:1000px) {
 body.teacher-authenticated #dashboardSection.teacher-dashboard-redesigned { grid-template-columns:1fr;gap:15px; }
 body.teacher-authenticated #dashboardSection > .upcoming-classes, body.teacher-authenticated #dashboardSection > .recent-activity { grid-column:1/-1; }
 body.teacher-authenticated #dashboardSection .action-buttons { grid-template-columns:repeat(3,minmax(0,1fr)); }
 body.teacher-authenticated #dashboardSection > .quick-actions .action-buttons { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media(max-width:680px) {
 body.teacher-authenticated #dashboardSection.teacher-dashboard-redesigned { padding:0 0 20px; }
 body.teacher-authenticated .section-container > .header { display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;gap:8px!important;min-height:48px;margin:0 0 15px;padding:0 0 10px 52px!important; }
 body.teacher-authenticated .section-container > .header h1 { flex:1 1 auto;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px!important;line-height:1.2; }
 body.teacher-authenticated .section-container > .header h1 i { display:inline-grid;place-items:center;font-size:15px;margin-right:5px; }
 body.teacher-authenticated .section-container > .header .teacher-info { flex:0 0 38px;width:38px;height:38px;margin:0!important;padding:0!important;display:grid;place-items:center;overflow:visible;border-radius:11px;font-size:0!important; }
 body.teacher-authenticated .section-container > .header .teacher-info > i { display:grid;place-items:center;width:100%;height:100%;margin:0!important;font-size:13px; }
 body.teacher-authenticated .section-container > .header .teacher-info .teacher-name { display:none!important; }
 body.teacher-authenticated .section-container > .header .header-dropdown { right:0;top:calc(100% + 8px); }
 body.teacher-authenticated #dashboardSection > .header { display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;gap:8px!important;min-height:48px;margin:0 0 15px;padding:0 0 10px 52px!important; }
 body.teacher-authenticated #dashboardSection > .header h1 { flex:1 1 auto;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px!important;line-height:1.2; }
 body.teacher-authenticated #dashboardSection > .header h1 i { font-size:15px;margin-right:5px; }
 body.teacher-authenticated #dashboardSection > .header .teacher-info { flex:0 0 38px;width:38px;height:38px;margin:0!important;padding:0!important;display:grid;place-items:center;border-radius:11px;font-size:0!important; }
 body.teacher-authenticated #dashboardSection > .header .teacher-info > i { font-size:13px; }
 body.teacher-authenticated #dashboardSection .dashboard-refresh-btn { flex:0 0 38px;width:38px!important;min-width:38px;height:38px;min-height:38px;padding:0;border-radius:11px; }
 body.teacher-authenticated #dashboardSection .dashboard-refresh-btn span { display:none; }
 body.teacher-authenticated #dashboardSection > .teacher-welcome { padding:16px 18px; }
 body.teacher-authenticated #dashboardSection .dashboard-stats { grid-template-columns:repeat(2,minmax(0,1fr));gap:9px; }
 body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card { min-height:100px;padding:12px;gap:9px; }
 body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card > i { width:33px;height:33px; }
 body.teacher-authenticated #dashboardSection .dashboard-stats .summary-card .count { font-size:22px; }
 body.teacher-authenticated #dashboardSection .action-buttons { grid-template-columns:1fr 1fr; }
 body.teacher-authenticated #dashboardSection .action-btn { min-height:60px;padding:10px;gap:8px;font-size:11px; }
 body.teacher-authenticated #dashboardSection .action-btn i { flex:0 0 30px;width:30px;height:30px; }
 body.teacher-authenticated #dashboardSection > .header { flex-wrap:wrap; }
 body.teacher-authenticated #dashboardSection > .header .teacher-info { margin-left:auto; }
 body.teacher-authenticated #dashboardSection .dashboard-refresh-btn span { display:none; }
 body.teacher-authenticated #dashboardSection .dashboard-session-summary { grid-template-columns:36px minmax(0,1fr);align-items:center; }
 body.teacher-authenticated #dashboardSection .dashboard-session-icon { grid-column:1;grid-row:1; }
 body.teacher-authenticated #dashboardSection .dashboard-session-copy { grid-column:2;grid-row:1; }
 body.teacher-authenticated #dashboardSection .dashboard-session-summary button { grid-column:1/-1;width:100%;min-width:0; }
 body.teacher-authenticated #settingsSection .settings-form { padding:14px; }
 body.teacher-authenticated #settingsSection .teacher-settings-grid { grid-template-columns:1fr;gap:10px; }
 body.teacher-authenticated #settingsSection .teacher-setting-card { padding:14px; }
 body.teacher-authenticated #settingsSection .teacher-setting-card form { grid-template-columns:1fr; }
 body.teacher-authenticated #settingsSection #profileSettingsForm .form-group:has(#settingsProfilePic),
 body.teacher-authenticated #settingsSection #profileSettingsForm .primary-btn,
 body.teacher-authenticated #settingsSection #changePasswordForm .primary-btn { grid-column:auto; }
}
`;
document.head.appendChild(teacherPanelStyles);
