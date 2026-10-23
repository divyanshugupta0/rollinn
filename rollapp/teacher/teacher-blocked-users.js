(() => {
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const normalizeSection = value => String(value || '').trim().replace(/^section\s+/i, '').toLowerCase();
    const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

    document.addEventListener('DOMContentLoaded', () => {
        const nav = document.querySelector('.sidebar-menu');
        const main = document.querySelector('.main-content .container');
        if (!nav || !main) return;

        let menu = nav.querySelector('[data-section="blocked-users"]');
        if (!menu) {
            menu = document.createElement('div');
            menu.className = 'menu-item';
            menu.dataset.section = 'blocked-users';
            menu.innerHTML = '<i class="fas fa-user-lock" aria-hidden="true"></i><span>Blocked Users</span>';
            nav.insertBefore(menu, nav.querySelector('[data-section="notifications"]') || null);
        }

        let section = document.getElementById('blocked-usersSection');
        if (!section) {
            section = document.createElement('section');
            section.id = 'blocked-usersSection';
            section.className = 'section-container';
            section.innerHTML = `
                <div class="header"><h1><i class="fas fa-user-lock"></i> Blocked Users</h1></div>
                <div class="tb-shell">
                    <div class="tb-intro"><div><span class="tb-kicker">STUDENT ACCESS</span><h2>Manage access in your assigned classes</h2><p>Only students in classes and sections assigned to your teacher account are listed.</p></div><button type="button" class="tb-refresh" id="tb-refresh"><i class="fas fa-rotate"></i> Refresh</button></div>
                    <p class="tb-status" id="tb-status" role="status" aria-live="polite">Sign in to load assigned students.</p>
                    <div class="tb-filter"><label for="tb-class-filter">Assigned class / section</label><select id="tb-class-filter"><option value="">All assigned classes</option></select><label for="tb-search">Search students</label><input id="tb-search" type="search" autocomplete="off" placeholder="Name, email, or roll number"></div>
                    <div id="tb-results"></div>
                </div>`;
            main.appendChild(section);
        }

        const status = section.querySelector('#tb-status');
        const classFilter = section.querySelector('#tb-class-filter');
        const search = section.querySelector('#tb-search');
        const results = section.querySelector('#tb-results');
        let reasonModal = document.getElementById('tb-reason-modal');
        let confirmModal = document.getElementById('tb-confirm-modal');
        let reasonInput = document.getElementById('tb-reason-input');
        const style = document.createElement('style');
        style.textContent = `
            .tb-shell{color:#26392e;min-width:0}
            .tb-intro{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:18px 0;padding:22px;border:1px solid #dfebe2;border-radius:16px;background:linear-gradient(120deg,#fff,#eff8f1)}
            .tb-kicker{color:#287451;font-size:10px;font-weight:850;letter-spacing:.14em}
            .tb-intro h2{margin:5px 0;font-size:21px}
            .tb-intro p,.tb-status{margin:5px 0 0;color:#718178;font-size:13px}
            .tb-refresh,.tb-action{min-height:42px;padding:0 13px;border:1px solid #d8e6dc;border-radius:9px;background:#f5faf6;color:#196c49;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
            .tb-refresh{white-space:nowrap}
            .tb-action:disabled,.tb-refresh:disabled{opacity:.55;cursor:wait}
            .tb-filter{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(230px,1.3fr);gap:8px 12px;align-items:center;margin:14px 0;padding:15px;border:1px solid #e3ebe5;border-radius:13px;background:#fff}
            .tb-filter label{color:#5f7065;font-size:11px;font-weight:750}
            .tb-filter select,.tb-filter input{width:100%;height:44px;padding:0 11px;border:1px solid #dce6df;border-radius:9px;background:white;color:#27382e;font:inherit;font-size:13px;min-width:0}
            .tb-table-wrap{overflow:auto;border:1px solid #e1eae3;border-radius:13px;background:#fff}
            .tb-table{width:100%;min-width:690px;border-collapse:collapse;text-align:left}
            .tb-table th{padding:12px;background:#f4f8f5;color:#68796f;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
            .tb-table td{padding:12px;border-top:1px solid #edf1ee;font-size:12px}
            .tb-student{display:flex;align-items:center;gap:10px;min-width:0}
            .tb-student>span:last-child{min-width:0}
            .tb-avatar{display:block;flex:0 0 42px;width:42px;height:42px;border-radius:50%;object-fit:cover;background:#e7f2e9}
            .tb-avatar-fallback{display:grid;place-items:center;color:#196c49;font-size:13px;font-weight:800}
            .tb-name{font-weight:750}
            .tb-muted{display:block;margin-top:3px;color:#7b8980;font-size:11px;overflow-wrap:anywhere}
            .tb-badge{display:inline-block;padding:5px 8px;border-radius:30px;background:#fff4df;color:#8d6417;font-size:10px;font-weight:750;overflow-wrap:anywhere}
            .tb-action.danger{border-color:#f0d6d4;background:#fff8f7;color:#a33c36}
            .tb-empty{padding:34px 18px;border:1px solid #e1eae3;border-radius:13px;background:#fff;color:#718178;text-align:center}
            .tb-empty strong{display:block;margin-bottom:5px;color:#30473a}
            .tb-error{color:#a13f39}
            @media(max-width:760px){
                .tb-intro{align-items:stretch;flex-direction:column;margin:12px 0;padding:17px}
                .tb-intro h2{font-size:19px;line-height:1.3}
                .tb-intro p{line-height:1.5}
                .tb-refresh{width:100%}
                .tb-filter{grid-template-columns:1fr;gap:6px;margin:12px 0;padding:13px}
                .tb-filter label:not(:first-child){margin-top:7px}
                .tb-table-wrap{overflow:visible;border:0;background:transparent}
                .tb-table{display:block;width:100%;min-width:0;border:0}
                .tb-table thead{display:none}
                .tb-table tbody{display:grid;gap:10px}
                .tb-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px 12px;padding:14px;border:1px solid #e1eae3;border-radius:13px;background:#fff;box-shadow:0 3px 12px #173b7008}
                .tb-table td{min-width:0;padding:0;border:0;font-size:12px;overflow-wrap:anywhere}
                .tb-table td:first-child{grid-column:1/-1;padding-bottom:9px;border-bottom:1px solid #edf1ee}
                .tb-table td:first-child .tb-name{font-size:14px}
                .tb-table td:nth-child(2)::before{content:'Class / section';display:block;margin-bottom:4px;color:#718178;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
                .tb-table td:nth-child(3)::before{content:'Access';display:block;margin-bottom:4px;color:#718178;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
                .tb-table td:last-child{grid-column:1/-1;padding-top:3px}
                .tb-action{width:100%;min-height:44px}
            }
            @media(max-width:380px){
                .tb-table tr{grid-template-columns:1fr}
                .tb-table td:first-child,.tb-table td:last-child{grid-column:1}
            }
        `;
        document.head.appendChild(style);
        const modalStyle = document.createElement('style');
        modalStyle.textContent = `
            .tb-modal{position:fixed;inset:0;z-index:1400;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}
            .tb-modal.visible{display:flex}.tb-dialog{width:min(100%,480px);max-height:min(90vh,680px);overflow:auto;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.26);animation:tb-dialog-in .18s ease-out}
            .tb-dialog-header{display:flex;align-items:center;gap:13px;padding:21px 23px;border-bottom:1px solid #eef0f3}.tb-dialog-icon{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border-radius:14px;color:#b42318;background:#fff0ee;font-size:17px}.tb-dialog-icon.unblock{color:#087443;background:#e9f8ef}
            .tb-dialog-heading{min-width:0}.tb-dialog-eyebrow{margin:0 0 3px;color:#b42318;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.tb-dialog-heading h3{margin:0;color:#182230;font-size:19px;font-weight:750}.tb-dialog-heading p{margin:4px 0 0;color:#667085;font-size:12px;line-height:1.45}
            .tb-dialog-close{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;margin-left:auto;border:0;border-radius:10px;color:#667085;background:#f8fafc;cursor:pointer}.tb-dialog-body{padding:21px 23px 8px}.tb-dialog-user{display:flex;align-items:center;gap:12px;min-width:0;padding:13px;border:1px solid #e7ebf0;border-radius:14px;background:#fbfcfe}.tb-dialog-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;object-fit:cover;background:#edf1f6}.tb-dialog-user>span{display:grid;gap:4px;min-width:0}.tb-dialog-user strong,.tb-dialog-user small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tb-dialog-user strong{color:#182230;font-size:14px}.tb-dialog-user small{color:#667085;font-size:12px}.tb-dialog-role{margin-left:auto;padding:5px 9px;border:1px solid #dbe3ee;border-radius:999px;color:#475467;background:#fff;font-size:11px;font-weight:700;white-space:nowrap}
            .tb-reason-label{display:block;margin:17px 0 7px;color:#344054;font-size:12px;font-weight:700}.tb-reason-label small{color:#98a2b3;font-weight:500}.tb-reason-input{box-sizing:border-box;width:100%;min-height:100px;padding:11px 12px;border:1px solid #d8e0eb;border-radius:10px;font:inherit;font-size:13px;resize:vertical}.tb-reason-input:focus{border-color:#7898dc;outline:3px solid rgba(49,88,166,.12)}
            .tb-dialog-note{display:flex;align-items:flex-start;gap:9px;margin-top:15px;padding:12px;border:1px solid #f8d4ae;border-radius:12px;color:#854a0e;background:#fff8ed;font-size:12px;line-height:1.5}.tb-dialog-note i{margin-top:2px}.tb-dialog-note.tb-unblock-note{border-color:#cce9dc;color:#176b45;background:#f0fbf5}.tb-confirm-reason{margin-top:14px;padding:12px 13px;border:1px solid #e7ebf0;border-radius:12px;background:#f8fafc;color:#475467;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.tb-confirm-reason strong{display:block;margin-bottom:4px;color:#667085;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
            .tb-dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:17px 23px 21px}.tb-dialog-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border:1px solid #d0d5dd;border-radius:10px;color:#344054;background:white;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.tb-dialog-actions .tb-dialog-primary{border-color:#b42318;color:white;background:#b42318}.tb-dialog-actions .tb-dialog-primary:hover{background:#912018}.tb-dialog-actions .tb-dialog-restore{border-color:#087443;color:white;background:#087443}.tb-dialog-actions button:disabled{opacity:.6;cursor:wait}
            @keyframes tb-dialog-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
            @media(max-width:520px){.tb-modal{align-items:flex-end;padding:8px}.tb-dialog{width:100%;max-height:90vh;border-radius:18px}.tb-dialog-header{padding:17px}.tb-dialog-body{padding:17px 17px 5px}.tb-dialog-actions{display:grid;grid-template-columns:1fr 1fr;padding:15px 17px max(17px,env(safe-area-inset-bottom))}.tb-dialog-actions button{width:100%;padding:0 9px;font-size:12px}}
        `;
        document.head.appendChild(modalStyle);
        if (!reasonModal || !confirmModal) document.body.insertAdjacentHTML('beforeend', `
            <div class="tb-modal" id="tb-reason-modal" aria-hidden="true"><div class="tb-dialog" role="dialog" aria-modal="true" aria-labelledby="tb-reason-title">
                <header class="tb-dialog-header"><span class="tb-dialog-icon"><i class="fas fa-user-shield"></i></span><div class="tb-dialog-heading"><p class="tb-dialog-eyebrow">Access control</p><h3 id="tb-reason-title">Block student access</h3><p>Add a reason, then review the action.</p></div><button class="tb-dialog-close" type="button" data-modal-close="reason" aria-label="Close"><i class="fas fa-times"></i></button></header>
                <div class="tb-dialog-body"><div class="tb-dialog-user"><img id="tb-reason-photo" class="tb-dialog-avatar" alt=""><span><strong id="tb-reason-name"></strong><small id="tb-reason-email"></small></span><b class="tb-dialog-role">Student</b></div><label class="tb-reason-label" for="tb-reason-input">Reason <small>Optional</small></label><textarea id="tb-reason-input" class="tb-reason-input" maxlength="500" placeholder="Explain why this student’s access is being restricted."></textarea><div class="tb-dialog-note"><i class="fas fa-circle-info"></i><span>The student will be signed out and blocked from signing in to the student portal.</span></div></div>
                <footer class="tb-dialog-actions"><button type="button" data-modal-close="reason">Cancel</button><button type="button" class="tb-dialog-primary" id="tb-review-block"><i class="fas fa-arrow-right"></i> Review block</button></footer>
            </div></div>
            <div class="tb-modal" id="tb-confirm-modal" aria-hidden="true"><div class="tb-dialog" role="dialog" aria-modal="true" aria-labelledby="tb-confirm-title">
                <header class="tb-dialog-header"><span class="tb-dialog-icon" id="tb-confirm-icon"><i class="fas fa-user-slash"></i></span><div class="tb-dialog-heading"><p class="tb-dialog-eyebrow" id="tb-confirm-eyebrow">Access control</p><h3 id="tb-confirm-title">Block this student?</h3><p id="tb-confirm-description">Review the account before continuing.</p></div><button class="tb-dialog-close" type="button" data-modal-close="confirm" aria-label="Close"><i class="fas fa-times"></i></button></header>
                <div class="tb-dialog-body"><div class="tb-dialog-user"><img id="tb-confirm-photo" class="tb-dialog-avatar" alt=""><span><strong id="tb-confirm-name"></strong><small id="tb-confirm-email"></small></span><b class="tb-dialog-role">Student</b></div><div class="tb-confirm-reason" id="tb-confirm-reason" hidden></div><div class="tb-dialog-note" id="tb-confirm-note"><i class="fas fa-triangle-exclamation"></i><span>Blocking prevents this student from signing in until access is restored.</span></div></div>
                <footer class="tb-dialog-actions"><button type="button" id="tb-confirm-cancel">Cancel</button><button type="button" class="tb-dialog-primary" id="tb-confirm-action"><i class="fas fa-ban"></i> Block student</button></footer>
            </div></div>`);
        reasonModal = document.getElementById('tb-reason-modal');
        confirmModal = document.getElementById('tb-confirm-modal');
        reasonInput = document.getElementById('tb-reason-input');

        const state = { students: [], busyUid: '', pendingAction: null };
        const classKey = student => `${String(student.classId || student.courseId || student.enrolledClassId || student.className || student.courseName || student.course || student.class || student.grade || '').trim()}|${normalizeSection(student.section)}`.toLowerCase();
        const studentPhotoUrl = student => {
            const value = String(student.profilePhoto || student.photoURL || student.photoUrl || student.profilePic || student.profileImage || student.avatar || student.photo || '').trim();
            if (/^https:\/\//i.test(value)) return value;
            const key = String(student.profilePhotoKey || value).trim().replace(/^\/+/, '');
            const base = String(window.ROLLCALL_FIREBASE_CONFIG?.profilePhotoPublicBaseUrl || '').trim();
            if (!key || !base) return '';
            try {
                const prefix = base.endsWith('/') ? base : `${base}/`;
                return new URL(key.split('/').map(encodeURIComponent).join('/'), prefix).href;
            } catch (_) { return ''; }
        };
        const photoCacheKey = student => `teacher-student:${student.id}:${student.profilePhotoKey || studentPhotoUrl(student)}`;

        async function cacheStudentPhotos(students) {
            const photos = students.map(student => ({ student, url: studentPhotoUrl(student) })).filter(item => item.url);
            if (!photos.length) return;
            status.textContent = `Caching ${photos.length} student profile photo${photos.length === 1 ? '' : 's'} on this device…`;
            let next = 0;
            const workers = Array.from({ length: Math.min(5, photos.length) }, async () => {
                while (next < photos.length) {
                    const item = photos[next++];
                    item.student.photoCached = await window.RollCallImageCache?.cacheUrl(photoCacheKey(item.student), item.url) || false;
                }
            });
            await Promise.all(workers);
            state.photosReady = true;
            if (firebase.auth().currentUser) status.textContent = `Student photos saved for faster return visits. ${state.students.length} assigned student${state.students.length === 1 ? '' : 's'} loaded.`;
            render();
        }

        function render() {
            const term = search.value.trim().toLowerCase();
            const selected = classFilter.value;
            const visible = state.students.filter(student => (!selected || classKey(student) === selected) &&
                (!term || [student.name, student.fullName, student.email, student.classRoll, student.rollNumber, student.rollNo].some(value => String(value || '').toLowerCase().includes(term))))
                .sort((a, b) => String(a.name || a.fullName || '').localeCompare(String(b.name || b.fullName || '')));
            if (!visible.length) {
                results.innerHTML = `<div class="tb-empty"><strong>${state.students.length ? 'No matching students' : 'No assigned students found'}</strong>${state.students.length ? 'Try another class or search.' : 'Your administrator must assign classes and sections before you can manage student access.'}</div>`;
                return;
            }
            results.innerHTML = `<div class="tb-table-wrap"><table class="tb-table"><thead><tr><th>Student</th><th>Class / section</th><th>Status</th><th>Action</th></tr></thead><tbody>${visible.map(student => {
                const blocked = Boolean(student.blockRecord);
                const details = [student.email, student.classRoll ? `Roll ${student.classRoll}` : ''].filter(Boolean).join(' · ');
                const name = student.name || student.fullName || student.displayName || 'Student';
                const url = studentPhotoUrl(student);
                const avatar = url && state.photosReady
                    ? `<img class="tb-avatar" data-photo-url="${escapeHtml(url)}" data-image-cache-key="${escapeHtml(photoCacheKey(student))}" data-preview-details="${escapeHtml(student.classLabel || '')}" alt="${escapeHtml(name)} profile photo. Click to preview." role="button" tabindex="0" loading="lazy">`
                    : `<span class="tb-avatar tb-avatar-fallback" aria-hidden="true">${escapeHtml(name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'S')}</span>`;
                return `<tr><td><span class="tb-student">${avatar}<span><span class="tb-name">${escapeHtml(name)}</span><span class="tb-muted">${escapeHtml(details || student.id)}</span></span></span></td><td>${escapeHtml(student.classLabel)}</td><td>${blocked ? `<span class="tb-badge" title="${escapeHtml(student.blockRecord.reason || '')}">Blocked${student.blockRecord.reason ? ` · ${escapeHtml(student.blockRecord.reason)}` : ''}</span>` : 'Active'}</td><td><button type="button" class="tb-action ${blocked ? '' : 'danger'}" data-uid="${escapeHtml(student.id)}" data-action="${blocked ? 'unblock' : 'block'}" ${state.busyUid ? 'disabled' : ''}>${state.busyUid === student.id ? 'Saving…' : blocked ? 'Unblock' : 'Block'}</button></td></tr>`;
            }).join('')}</tbody></table></div>`;
            results.querySelectorAll('.tb-avatar:not(.tb-avatar-fallback)').forEach(image => {
                const url = image.dataset.photoUrl;
                window.RollCallImageCache?.apply(image, url, image.dataset.imageCacheKey || url);
                const openPreview = () => window.TeacherStudentPhotoPreview?.open({
                    src: image.currentSrc || image.src || url,
                    name: image.alt.replace(/ profile photo\. Click to preview\.$/, ''),
                    details: image.dataset.previewDetails || ''
                });
                image.addEventListener('click', openPreview);
                image.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPreview(); }
                });
                image.addEventListener('error', () => {
                    const fallback = document.createElement('span');
                    fallback.className = 'tb-avatar tb-avatar-fallback';
                    fallback.setAttribute('aria-hidden', 'true');
                    fallback.textContent = (image.alt || 'S').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
                    image.replaceWith(fallback);
                }, { once: true });
            });
            results.querySelectorAll('[data-uid]').forEach(button => button.addEventListener('click', () => beginAction(button.dataset.uid, button.dataset.action)));
        }

        function setModal(modal, visible) {
            modal.classList.toggle('visible', visible);
            modal.setAttribute('aria-hidden', String(!visible));
        }

        function fillModalIdentity(prefix, student) {
            const name = student.name || student.fullName || student.displayName || 'Student';
            const photo = studentPhotoUrl(student);
            const image = document.getElementById(`${prefix}-photo`);
            const nameEl = document.getElementById(`${prefix}-name`);
            const emailEl = document.getElementById(`${prefix}-email`);
            nameEl.textContent = name;
            emailEl.textContent = student.email || student.classLabel || 'Student account';
            image.onerror = () => { image.hidden = true; };
            image.hidden = !photo;
            image.removeAttribute('src');
            if (photo) window.RollCallImageCache?.apply(image, photo, photoCacheKey(student));
        }

        function beginAction(uid, action) {
            const student = state.students.find(item => item.id === uid);
            if (!student || !['block', 'unblock'].includes(action)) return;
            state.pendingAction = { uid, action, reason: '' };
            fillModalIdentity(action === 'block' ? 'tb-reason' : 'tb-confirm', student);
            if (action === 'block') {
                reasonInput.value = '';
                setModal(reasonModal, true);
                setTimeout(() => reasonInput.focus(), 0);
            } else {
                showConfirmation(student, action, '');
            }
        }

        function showConfirmation(student, action, reason) {
            fillModalIdentity('tb-confirm', student);
            const blocking = action === 'block';
            document.getElementById('tb-confirm-eyebrow').textContent = blocking ? 'Access control' : 'Restore access';
            document.getElementById('tb-confirm-title').textContent = blocking ? 'Block this student?' : 'Unblock this student?';
            document.getElementById('tb-confirm-description').textContent = blocking
                ? 'Review the account and reason before restricting access.'
                : 'Confirm the account before restoring student portal access.';
            const reasonBox = document.getElementById('tb-confirm-reason');
            reasonBox.hidden = !blocking || !reason;
            reasonBox.innerHTML = blocking && reason ? `<strong>Reason</strong>${escapeHtml(reason)}` : '';
            const note = document.getElementById('tb-confirm-note');
            note.classList.toggle('tb-unblock-note', !blocking);
            note.innerHTML = blocking
                ? '<i class="fas fa-triangle-exclamation"></i><span>Blocking immediately prevents this student from signing in until access is restored.</span>'
                : '<i class="fas fa-circle-check"></i><span>This student will be able to sign in again after access is restored.</span>';
            const actionButton = document.getElementById('tb-confirm-action');
            actionButton.classList.toggle('tb-dialog-restore', !blocking);
            actionButton.innerHTML = blocking ? '<i class="fas fa-ban"></i> Block student' : '<i class="fas fa-unlock"></i> Restore access';
            const icon = document.getElementById('tb-confirm-icon');
            icon.classList.toggle('unblock', !blocking);
            icon.innerHTML = blocking ? '<i class="fas fa-user-slash"></i>' : '<i class="fas fa-unlock-keyhole"></i>';
            setModal(reasonModal, false);
            setModal(confirmModal, true);
        }

        async function updateStudent(uid, action, reason = '') {
            const student = state.students.find(item => item.id === uid);
            if (!student || !['block', 'unblock'].includes(action)) return;
            state.busyUid = uid;
            state.pendingAction = null;
            status.classList.remove('tb-error');
            status.textContent = `${action === 'block' ? 'Blocking' : 'Unblocking'} student…`;
            render();
            try {
                const user = firebase.auth().currentUser;
                if (!user) throw new Error('Sign in again to manage student access.');
                const config = window.ROLLCALL_FIREBASE_CONFIG || {};
                const endpoint = String(config.profileUploadWorkerUrl || '').trim();
                if (!endpoint) throw new Error('Teacher access service is not configured.');
                const token = await user.getIdToken();
                const response = await fetch(new URL('teacher-block-user', endpoint), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, targetUid: uid, schoolId: student.schoolId, reason })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || 'Student access could not be updated.');
                status.textContent = `Student ${action === 'block' ? 'blocked' : 'unblocked'} successfully.`;
                await load(firebase.auth().currentUser);
            } catch (error) {
                status.classList.add('tb-error');
                status.textContent = error.message || 'Student access could not be updated.';
            } finally {
                state.busyUid = '';
                render();
            }
        }

        document.querySelectorAll('[data-modal-close="reason"]').forEach(button => button.addEventListener('click', () => {
            state.pendingAction = null; setModal(reasonModal, false);
        }));
        document.querySelectorAll('[data-modal-close="confirm"]').forEach(button => button.addEventListener('click', () => {
            state.pendingAction = null; setModal(confirmModal, false);
        }));
        [reasonModal, confirmModal].forEach(modal => modal.addEventListener('click', event => {
            if (event.target !== modal) return;
            state.pendingAction = null; setModal(modal, false);
        }));
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (confirmModal.classList.contains('visible')) setModal(confirmModal, false);
            else if (reasonModal.classList.contains('visible')) setModal(reasonModal, false);
            else return;
            state.pendingAction = null;
        });
        document.getElementById('tb-review-block').addEventListener('click', () => {
            if (!state.pendingAction || state.pendingAction.action !== 'block') return;
            state.pendingAction.reason = reasonInput.value.trim().slice(0, 500);
            const student = state.students.find(item => item.id === state.pendingAction.uid);
            if (student) showConfirmation(student, 'block', state.pendingAction.reason);
        });
        document.getElementById('tb-confirm-cancel').addEventListener('click', () => {
            if (state.pendingAction?.action === 'block') {
                setModal(confirmModal, false); setModal(reasonModal, true); reasonInput.focus();
            } else {
                state.pendingAction = null; setModal(confirmModal, false);
            }
        });
        document.getElementById('tb-confirm-action').addEventListener('click', async event => {
            const pending = state.pendingAction;
            if (!pending) return;
            const actionButton = event.currentTarget;
            actionButton.disabled = true;
            setModal(reasonModal, false); setModal(confirmModal, false);
            try { await updateStudent(pending.uid, pending.action, pending.reason); }
            finally { actionButton.disabled = false; }
        });

        async function load(user) {
            state.students = [];
            classFilter.replaceChildren(new Option('All assigned classes', ''));
            if (!user) {
                status.textContent = 'Sign in to load assigned students.';
                render();
                return;
            }
            status.classList.remove('tb-error');
            status.textContent = 'Checking your school assignments…';
            try {
                const profile = window.waitForTeacherPortalProfile
                    ? await window.waitForTeacherPortalProfile(user)
                    : (await firebase.database().ref(`users/${user.uid}`).once('value')).val() || {};
                if (String(profile.role || '').toLowerCase() !== 'teacher') throw new Error('Teacher account required.');
                const schoolId = String(profile.schoolId || '').trim();
                if (!schoolId) throw new Error('Your teacher account is not assigned to a school.');
                const [assignmentSnap, studentSnap, blockedSnap] = await Promise.all([
                    firebase.database().ref(`classTeacherAssignmentsByClass/${schoolId}`).once('value'),
                    firebase.database().ref(`schoolUsers/${schoolId}`).once('value'),
                    firebase.database().ref('blockedUsers').once('value')
                ]);
                const assignments = assignmentSnap.val() || {};
                const blocked = blockedSnap.val() || {};
                const assigned = [];
                Object.entries(assignments).forEach(([classId, sections]) => Object.values(sections || {}).forEach(item => {
                    if (!item || String(item.teacherId || '') !== user.uid ||
                        (item.schoolId && String(item.schoolId) !== schoolId)) return;
                    assigned.push({ classId: String(item.classId || classId), className: item.className || '', section: item.section || '', year: item.year || '' });
                }));
                const students = [];
                studentSnap.forEach(child => {
                    const student = child.val() || {};
                    if ((student.role && String(student.role).toLowerCase() !== 'student') ||
                        (student.schoolId && String(student.schoolId).trim() !== schoolId)) return;
                    const studentIds = [student.classId, student.courseId, student.enrolledClassId].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
                    const studentNames = [student.className, student.courseName, student.course, student.class, student.grade].map(normalizeName).filter(Boolean);
                    const studentSection = normalizeSection(student.section);
                    const match = assigned.find(item => {
                        if (normalizeSection(item.section) !== studentSection) return false;
                        const assignedClassId = String(item.classId || '').trim().toLowerCase();
                        if (studentIds.includes(assignedClassId)) return true;
                        if (studentIds.length) return false;
                        return Boolean(normalizeName(item.className) && studentNames.includes(normalizeName(item.className)));
                    });
                    if (!match) return;
                    const classLabel = `${match.className || student.className || student.courseName || student.course || 'Class'} · Section ${student.section || match.section}${match.year ? ` · ${match.year}` : ''}`;
                    const candidateBlock = blocked[child.key] || null;
                    const blockRecord = candidateBlock && String(candidateBlock.schoolId || '').trim() === schoolId ? candidateBlock : null;
                    students.push({ ...student, id: child.key, schoolId, classLabel, blockRecord });
                });
                state.students = students;
                state.photosReady = false;
                const keys = [...new Map(students.map(student => [classKey(student), student.classLabel])).entries()];
                keys.sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })).forEach(([key, label]) => classFilter.add(new Option(label, key)));
                status.textContent = `${students.length} student${students.length === 1 ? '' : 's'} in ${keys.length} assigned class section${keys.length === 1 ? '' : 's'}.`;
                render();
                void cacheStudentPhotos(students);
            } catch (error) {
                state.students = [];
                status.classList.add('tb-error');
                status.textContent = error.message || 'Could not verify class assignments.';
                render();
            }
        }

        menu.addEventListener('click', event => {
            event.preventDefault();
            window.switchTeacherSection?.('blocked-users');
        });
        classFilter.addEventListener('change', render);
        search.addEventListener('input', render);
        section.querySelector('#tb-refresh').addEventListener('click', () => load(firebase.auth().currentUser));
        firebase.auth().onAuthStateChanged(user => load(user));
    });
})();
