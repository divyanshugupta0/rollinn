// Initialize Firebase Compat if loaded and not yet initialized
if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
    const defaultFirebaseConfig = window.ROLLCALL_FIREBASE_CONFIG;
    firebase.initializeApp(defaultFirebaseConfig);
}

// Reusable lifecycle for sidebar panels. Add a template/sidebar entry as usual,
// then register its initializer with AdminPanelAPI.register(sectionKey, fn, options).
window.AdminPanelAPI = window.AdminPanelAPI || (() => {
    const registrations = new Map();
    function setContentSizedLayout(root, enabled) {
        const shell = document.querySelector('.main-container');
        const content = document.getElementById('content-wrapper');
        const setOrReset = (element, property, value) => {
            if (!element) return;
            if (enabled) element.style.setProperty(property, value, 'important');
            else element.style.removeProperty(property);
        };
        setOrReset(shell, 'min-height', '0');
        setOrReset(shell, 'height', 'auto');
        setOrReset(shell, 'align-items', 'flex-start');
        setOrReset(content, 'min-height', '0');
        setOrReset(content, 'height', 'auto');
        setOrReset(content, 'max-height', 'none');
        setOrReset(content, 'overflow-x', 'visible');
        setOrReset(content, 'overflow-y', 'visible');
        setOrReset(content, 'align-self', 'flex-start');
        setOrReset(root, 'min-height', '0');
        setOrReset(root, 'height', 'auto');
        setOrReset(root, 'flex', '0 0 auto');
        if (enabled) {
            // These compact panels can be shorter than the viewport. Reset both
            // scroll containers so navigation never opens at the old page offset.
            if (content) content.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            window.scrollTo(0, 0);
        }
    }
    return {
        register(sectionKey, initialize, options = {}) {
            if (!sectionKey || typeof initialize !== 'function') throw new TypeError('A section key and initializer function are required.');
            registrations.set(sectionKey, { initialize, contentSized: options.contentSized === true });
            return () => registrations.delete(sectionKey);
        },
        get(sectionKey) { return registrations.get(sectionKey) || null; },
        mount(sectionKey, root) {
            const registration = registrations.get(sectionKey);
            setContentSizedLayout(root, registration?.contentSized === true);
            if (!registration) return;
            try {
                const result = registration.initialize(root);
                if (result && typeof result.catch === 'function') result.catch(error => console.error(`Panel initializer failed (${sectionKey}):`, error));
            } catch (error) {
                console.error(`Panel initializer failed (${sectionKey}):`, error);
            }
        },
        clearLayout() { setContentSizedLayout(null, false); }
    };
})();

let sidebarBadgesInitialized = false;
const SIDEBAR_BADGE_KEYS = {
    notifications: 'adminNotificationsLastSeen',
    profile: 'adminProfileRequestsLastSeen'
};

function getLastSeen(key) {
    try {
        const raw = localStorage.getItem(key);
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    } catch (e) {
        return 0;
    }
}

function setLastSeen(key, value) {
    try {
        const nextValue = Number.isFinite(value) ? value : Date.now();
        localStorage.setItem(key, String(nextValue));
    } catch (e) {
        // Ignore storage errors (e.g., privacy mode)
    }
}

function setSidebarBadge(badgeEl, count) {
    if (!badgeEl) return;
    const value = Number(count) || 0;
    if (value <= 0) {
        badgeEl.textContent = '';
        badgeEl.classList.add('is-hidden');
        return;
    }
    badgeEl.textContent = value > 99 ? '99+' : String(value);
    badgeEl.classList.remove('is-hidden');
}

function markNotificationsSeen() {
    setLastSeen(SIDEBAR_BADGE_KEYS.notifications, Date.now());
    setSidebarBadge(document.getElementById('notification-badge'), 0);
}

function markProfileRequestsSeen() {
    setLastSeen(SIDEBAR_BADGE_KEYS.profile, Date.now());
    setSidebarBadge(document.getElementById('profile-badge'), 0);
}

function initSidebarBadges() {
    if (sidebarBadgesInitialized) return;
    sidebarBadgesInitialized = true;

    const notificationBadge = document.getElementById('notification-badge');
    const profileBadge = document.getElementById('profile-badge');
    if (!notificationBadge && !profileBadge) return;

    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = window.ROLLCALL_FIREBASE_CONFIG;
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();

    // Notifications badge (unread)
    const notificationsRef = db.ref('notifications').orderByChild('timestamp').limitToLast(200);
    notificationsRef.on('value', (snapshot) => {
        const lastSeen = getLastSeen(SIDEBAR_BADGE_KEYS.notifications);
        let unreadCount = 0;
        snapshot.forEach(child => {
            const notif = child.val() || {};
            const timestamp = Number(notif.timestamp) || 0;
            if (timestamp > lastSeen && notif.read !== true) {
                unreadCount += 1;
            }
        });
        setSidebarBadge(notificationBadge, unreadCount);
    }, () => {
        setSidebarBadge(notificationBadge, 0);
    });

    // Profile requests badge (pending)
    let profileRequestsCount = 0;
    let profileUpdateCount = 0;

    const updateProfileBadge = () => {
        setSidebarBadge(profileBadge, profileRequestsCount + profileUpdateCount);
    };

    const countTeacherProfileRequests = async snapshot => {
        const lastSeen = getLastSeen(SIDEBAR_BADGE_KEYS.profile);
        const pending = [];
        snapshot.forEach(child => {
            const request = child.val() || {};
            if (String(request.status || 'pending').toLowerCase() === 'pending' && Number(request.timestamp || 0) > lastSeen && request.userId) pending.push(request.userId);
        });
        const roles = await Promise.all([...new Set(pending)].map(async uid => {
            try { const profile = await db.ref(`users/${uid}`).once('value'); return profile.val()?.role === 'teacher'; }
            catch (_) { return false; }
        }));
        return roles.filter(Boolean).length;
    };

    db.ref('profileRequests').on('value', async snapshot => {
        try { profileRequestsCount = await countTeacherProfileRequests(snapshot); }
        catch (_) { profileRequestsCount = 0; }
        updateProfileBadge();
    }, () => {
        profileRequestsCount = 0;
        updateProfileBadge();
    });

    db.ref('profile_update_requests').on('value', async snapshot => {
        try { profileUpdateCount = await countTeacherProfileRequests(snapshot); }
        catch (_) { profileUpdateCount = 0; }
        updateProfileBadge();
    }, () => {
        profileUpdateCount = 0;
        updateProfileBadge();
    });
}

document.addEventListener('DOMContentLoaded', initSidebarBadges);

let erpPortalModeActive = false;
let erpModeInstitutionRef = null;
let erpModeAuthUid = '';

function setErpPortalMode(enabled) {
    erpPortalModeActive = enabled === true;
    window.rollCallErpModeActive = erpPortalModeActive;
    document.body.classList.toggle('erp-portal-mode', erpPortalModeActive);
    const contentWrapper = document.getElementById('content-wrapper');
    if (contentWrapper) {
        contentWrapper.classList.toggle('erp-mode-panel-locked', erpPortalModeActive);
        contentWrapper.classList.toggle(
            'erp-account-visible',
            erpPortalModeActive && !!document.querySelector('[data-section="manage-account"].active')
        );
    }
    document.querySelectorAll('.sidebar-menu-item-modern[data-section], .sidebar-menu-item[data-section]').forEach(item => {
        const locked = erpPortalModeActive &&
            !['manage-account', 'logout'].includes(item.dataset.section || '');
        if (locked) {
            item.dataset.erpLocked = 'true';
            item.dataset.erpLockReason = 'Locked in ERP mode. Only Manage Account is available.';
            item.setAttribute('aria-disabled', 'true');
            item.title = item.dataset.erpLockReason;
            item.setAttribute('aria-label', `${item.querySelector('.menu-item-text')?.textContent.trim() || item.textContent.trim()}. ${item.dataset.erpLockReason}`);
        } else {
            delete item.dataset.erpLocked;
            delete item.dataset.erpLockReason;
            item.removeAttribute('aria-disabled');
            item.removeAttribute('aria-label');
            if (item.title === 'Locked in ERP mode. Only Manage Account is available.') item.removeAttribute('title');
        }
    });
    if (erpPortalModeActive) {
        const accountMenuItem = document.querySelector('[data-section="manage-account"]');
        if (accountMenuItem && !accountMenuItem.classList.contains('active')) accountMenuItem.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', event => {
        if (!erpPortalModeActive) return;
        const item = event.target.closest('.sidebar-menu-item-modern[data-section], .sidebar-menu-item[data-section]');
        if (!item || ['manage-account', 'logout'].includes(item.dataset.section || '')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelector('[data-section="manage-account"]')?.click();
    }, true);

    if (typeof firebase === 'undefined' || !firebase.apps?.length) return;
    firebase.auth().onAuthStateChanged(async user => {
        erpModeInstitutionRef?.off();
        erpModeInstitutionRef = null;
        erpModeAuthUid = user?.uid || '';
        if (!user) {
            setErpPortalMode(false);
            window.currentAdminSchoolId = '';
            window.currentAdminSchoolCode = '';
            window.currentAdminSchoolName = '';
            window.refreshCbtPlanAccess?.('');
            return;
        }
        try {
            const profileSnapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
            if (firebase.auth().currentUser?.uid !== user.uid) return;
            const profile = profileSnapshot.val() || {};
            const schoolId = String(profile.schoolId || '').trim();
            if (String(profile.role || '').toLowerCase() !== 'admin' || !schoolId) {
                setErpPortalMode(false);
                window.currentAdminSchoolId = '';
                window.refreshCbtPlanAccess?.('');
                return;
            }
            window.currentAdminSchoolId = schoolId;
            const schoolSnapshot = await firebase.database().ref(`schools/${schoolId}`).once('value');
            const school = schoolSnapshot.val() || {};
            window.currentAdminSchoolCode = school.code || profile.schoolCode || schoolId;
            window.currentAdminSchoolName = school.name || profile.schoolName || 'RollCall Institution';
            await window.refreshCbtPlanAccess?.(schoolId);
            erpModeInstitutionRef = firebase.database().ref(`schools/${schoolId}/type`);
            erpModeInstitutionRef.on('value', snapshot => {
                if (firebase.auth().currentUser?.uid !== erpModeAuthUid) return;
                setErpPortalMode(String(snapshot.val() || '').trim().toLowerCase() === 'erp');
            }, error => {
                console.error('Could not monitor the ERP portal mode:', error);
            });
        } catch (error) {
            console.error('Could not determine the ERP portal mode:', error);
            setErpPortalMode(false);
        }
    });
});


function initBlockedUsers(panelRoot = null) {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        firebase.initializeApp(window.ROLLCALL_FIREBASE_CONFIG);
    }
    const db = firebase.database();
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

    if (!document.getElementById('blocked-users-section')) {
        const section = document.createElement('div');
        section.id = 'blocked-users-section';
        section.className = 'section-template';
        section.innerHTML = `
            <section class="bu-workspace" aria-labelledby="bu-title">
                <header class="bu-header"><div class="bu-heading"><button class="section-menu-btn" type="button" aria-label="Open navigation"><i class="fas fa-bars"></i></button><div class="bu-heading-copy"><span class="bu-kicker">ACCESS MANAGEMENT</span><h2 id="bu-title">Blocked users</h2><p>Review restricted accounts and manage access.</p></div></div>
                    <div class="bu-header-actions"><button id="refresh-blocked-users-btn" class="secondary-btn" type="button"><i class="fas fa-rotate"></i><span>Refresh</span></button><button id="add-blocked-user-btn" class="primary-btn" type="button"><i class="fas fa-user-plus"></i><span>Block user</span></button></div>
                </header>
                <div id="blocked-users-container" class="bu-content">
                    <div class="bu-overview"><div class="bu-overview-main"><span class="bu-overview-icon"><i class="fas fa-user-lock"></i></span><span class="bu-overview-copy"><span>Restricted accounts</span><strong id="blocked-user-total-count">0</strong></span></div><div class="bu-overview-divider"></div><div class="bu-role-total"><span class="bu-role-dot student"></span><span>Students</span><strong id="blocked-user-student-count">0</strong></div><div class="bu-role-total"><span class="bu-role-dot teacher"></span><span>Teachers</span><strong id="blocked-user-teacher-count">0</strong></div></div>
                    <section class="bu-list-panel"><div class="bu-list-toolbar"><div class="bu-list-heading"><h3>Account list</h3><span id="blocked-user-count" class="bu-result-count"></span></div><div class="bu-filters"><label class="bu-filter-role" for="blocked-user-type-filter"><span>Role</span><select id="blocked-user-type-filter" class="form-control"><option value="all">All roles</option><option value="student">Students</option><option value="teacher">Teachers</option></select></label><label class="bu-filter-search" for="blocked-user-search"><span>Search accounts</span><span class="bu-search-field"><i class="fas fa-search"></i><input id="blocked-user-search" type="search" name="blocked-account-filter" autocomplete="off" autocapitalize="off" spellcheck="false" readonly placeholder="Name, email, or reason"></span></label></div></div>
                        <div class="bu-table-scroll"><table class="attendance-list bu-table"><thead><tr><th>User</th><th>Role</th><th>Reason</th><th>Blocked on</th><th>Action</th></tr></thead><tbody id="blocked-users-list"></tbody></table></div>
                    </section>
                </div>
            </section>`;
        document.body.appendChild(section);
    }

    const panel = panelRoot || document.querySelector('#blocked-users-section-active:not(.hidden)') || document.querySelector('#blocked-users-section:not(.hidden)');
    if (!panel) return;



    if (!document.getElementById('block-user-popup')) {
        const popup = document.createElement('div');
        popup.id = 'block-user-popup';
        popup.className = 'popup-container hidden';
        popup.innerHTML = `<div class="popup"><div class="popup-header"><h3>Block User</h3><button class="close-popup-btn"><i class="fas fa-times"></i></button></div><div class="popup-body">
            <div class="form-group"><label for="block-user-type">User Type</label><select id="block-user-type"><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
            <div class="form-group"><label for="block-user-search-input">Find user</label><input id="block-user-search-input" type="search" name="block-account-lookup" autocomplete="off" autocapitalize="off" spellcheck="false" readonly placeholder="Search by name or email"></div>
            <div class="form-group"><label for="block-user-select">Select <span id="block-user-type-label">Student</span></label><select id="block-user-select"><option value="">Select a user</option></select></div>
            <div class="form-group"><label for="block-reason">Reason (optional)</label><textarea id="block-reason" rows="3" maxlength="500"></textarea></div>
            <div class="popup-footer"><button id="confirm-block-btn" class="primary-btn">Block User</button><button class="cancel-btn close-popup-btn">Cancel</button></div>
        </div></div>`;
        document.body.appendChild(popup);
    }

    const list = panel.querySelector('#blocked-users-list');
    const typeFilter = panel.querySelector('#blocked-user-type-filter');
    const blockedSearch = panel.querySelector('#blocked-user-search');
    const blockedCount = panel.querySelector('#blocked-user-count');
    const blockedTotalCount = panel.querySelector('#blocked-user-total-count');
    const blockedStudentCount = panel.querySelector('#blocked-user-student-count');
    const blockedTeacherCount = panel.querySelector('#blocked-user-teacher-count');
    const userType = document.getElementById('block-user-type');
    const userSearch = document.getElementById('block-user-search-input');
    const userSelect = document.getElementById('block-user-select');
    const userTypeLabel = document.getElementById('block-user-type-label');
    let blockedRows = [];
    let eligibleUsers = [];

    [blockedSearch, userSearch].forEach(input => {
        if (!input) return;
        input.value = '';
        input.setAttribute('readonly', 'readonly');
        input.onfocus = () => input.removeAttribute('readonly');
    });

    function renderBlockedUsers() {
        const role = typeFilter?.value || 'all';
        const term = (blockedSearch?.value || '').trim().toLowerCase();
        if (blockedTotalCount) blockedTotalCount.textContent = blockedRows.length;
        if (blockedStudentCount) blockedStudentCount.textContent = blockedRows.filter(user => user.role === 'student').length;
        if (blockedTeacherCount) blockedTeacherCount.textContent = blockedRows.filter(user => user.role === 'teacher').length;
        const rows = blockedRows.filter(user => (role === 'all' || user.role === role) &&
            (!term || [user.name, user.email, user.reason, user.role].some(value => String(value || '').toLowerCase().includes(term))));
        if (blockedCount) blockedCount.textContent = `${rows.length} of ${blockedRows.length} blocked user${blockedRows.length === 1 ? '' : 's'}`;
        if (!rows.length) {
            const filtered = blockedRows.length > 0;
            list.innerHTML = `<tr class="bu-empty-row"><td colspan="5"><div class="bu-empty-state"><span class="bu-empty-icon"><i class="fas ${filtered ? 'fa-filter' : 'fa-user-shield'}"></i></span><strong>${filtered ? 'No matching accounts' : 'No blocked accounts'}</strong><span>${filtered ? 'Try a different role or search term.' : 'Accounts you block will appear here.'}</span></div></td></tr>`;
            return;
        }
        list.innerHTML = rows.map(user => {
            const role = ['student', 'teacher'].includes(user.role) ? user.role : 'unknown';
            const name = user.name || 'Unnamed user';
            return `
            <tr>
                <td data-label="User"><div class="bu-user-cell"><span class="bu-avatar" aria-hidden="true"><i class="fas fa-user"></i></span><span class="bu-user-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(user.email || 'No email on file')}</span></span></div></td>
                <td data-label="Role"><span class="bu-role-badge ${role}"><span></span>${escapeHtml(role === 'unknown' ? 'Unknown' : role[0].toUpperCase() + role.slice(1))}</span></td>
                <td data-label="Reason"><span class="bu-reason">${escapeHtml(user.reason || 'No reason provided')}</span></td>
                <td data-label="Blocked on">${escapeHtml(user.blockedDate ? new Date(user.blockedDate).toLocaleString() : 'Unknown')}</td>
                <td data-label="Action" class="bu-action-cell"><button class="unblock-user-btn small-btn" data-id="${escapeHtml(user.id)}" type="button"><i class="fas fa-unlock"></i><span>Unblock</span></button></td>
            </tr>`;
        }).join('');
    }

    function loadBlockedUsers() {
        list.innerHTML = '<tr class="bu-empty-row"><td colspan="5"><div class="bu-empty-state"><i class="fas fa-spinner fa-spin"></i><span>Loading blocked accounts...</span></div></td></tr>';
        Promise.all([db.ref('blockedUsers').once('value'), db.ref('users').once('value'), getCurrentAdminNotificationContext()]).then(([blockedSnapshot, usersSnapshot, adminContext]) => {
            const users = usersSnapshot.val() || {};
            blockedRows = [];
            if (blockedSnapshot.exists()) blockedSnapshot.forEach(child => {
                const data = child.val() || {};
                const profile = users[child.key] || {};
                const role = String(data.role || profile.role || '').toLowerCase();
                const schoolId = String(data.schoolId || profile.schoolId || '').trim();
                if (schoolId !== adminContext.schoolId || !['student', 'teacher'].includes(role) ||
                    String(profile.schoolId || '').trim() !== adminContext.schoolId) return;
                blockedRows.push({
                    id: child.key,
                    role,
                    schoolId,
                    name: data.name || profile.name || '',
                    email: data.email || profile.email || '',
                    reason: data.reason || '',
                    blockedDate: Number(data.blockedDate) || 0
                });
            });
            blockedRows.sort((a, b) => b.blockedDate - a.blockedDate);
            renderBlockedUsers();
        }).catch(error => {
            list.innerHTML = `<tr class="bu-empty-row"><td colspan="5"><div class="bu-empty-state bu-load-error"><strong>Could not load blocked accounts</strong><span>${escapeHtml(error.message)}</span></div></td></tr>`;
        });
    }

    function renderEligibleUsers() {
        const role = userType.value;
        const term = (userSearch?.value || '').trim().toLowerCase();
        const matches = eligibleUsers.filter(user => user.role === role && (!term || `${user.name} ${user.email}`.toLowerCase().includes(term)));
        userSelect.innerHTML = `<option value="">${matches.length ? `Select a ${role}` : `No available ${role}s found`}</option>` + matches.map(user =>
            `<option value="${escapeHtml(user.id)}" data-name="${escapeHtml(user.name)}" data-email="${escapeHtml(user.email)}" data-role="${escapeHtml(user.role)}">${escapeHtml(user.name || 'Unnamed user')} (${escapeHtml(user.email || 'no email')})</option>`).join('');
        if (userTypeLabel) userTypeLabel.textContent = role === 'teacher' ? 'Teacher' : 'Student';
    }

    function loadEligibleUsers() {
        userSelect.innerHTML = '<option value="">Loading users...</option>';
        Promise.all([db.ref('users').once('value'), db.ref('blockedUsers').once('value'), getCurrentAdminNotificationContext()]).then(([usersSnapshot, blockedSnapshot, adminContext]) => {
            const blocked = blockedSnapshot.val() || {};
            eligibleUsers = [];
            usersSnapshot.forEach(child => {
                const data = child.val() || {};
                const role = String(data.role || '').toLowerCase();
                if (!['student', 'teacher'].includes(role) || String(data.schoolId || '').trim() !== adminContext.schoolId || data.blocked || blocked[child.key]) return;
                eligibleUsers.push({ id: child.key, role, schoolId: adminContext.schoolId, name: data.name || '', email: data.email || '' });
            });
            eligibleUsers.sort((a, b) => a.name.localeCompare(b.name));
            renderEligibleUsers();
        }).catch(error => {
            userSelect.innerHTML = '<option value="">Unable to load users</option>';
            console.error('Error loading users to block:', error);
        });
    }

    panel.querySelector('#refresh-blocked-users-btn').onclick = loadBlockedUsers;
    if (typeFilter) typeFilter.onchange = renderBlockedUsers;
    if (blockedSearch) blockedSearch.oninput = renderBlockedUsers;
    userType.onchange = renderEligibleUsers;
    if (userSearch) userSearch.oninput = renderEligibleUsers;
    panel.querySelector('#add-blocked-user-btn').onclick = () => {
        userType.value = 'student';
        if (userSearch) userSearch.value = '';
        loadEligibleUsers();
        document.getElementById('block-user-popup').classList.remove('hidden');
    };

    document.querySelectorAll('#block-user-popup .close-popup-btn').forEach(button => button.onclick = () => {
        document.getElementById('block-user-popup').classList.add('hidden');
    });

    document.getElementById('confirm-block-btn').onclick = () => {
        const id = userSelect.value;
        if (!id) return alert('Please select a user to block.');
        const option = userSelect.options[userSelect.selectedIndex];
        document.getElementById('block-confirm-user-name').textContent = option.dataset.name || 'Unknown user';
        document.getElementById('block-confirm-user-email').textContent = option.dataset.email || 'No email';
        const roleEl = document.getElementById('block-confirm-user-role');
        if (roleEl) roleEl.textContent = option.dataset.role === 'teacher' ? 'Teacher' : 'Student';
        const finalButton = document.getElementById('final-confirm-block-btn');
        finalButton.dataset.id = id;
        finalButton.dataset.role = option.dataset.role || userType.value;
        finalButton.dataset.reason = (document.getElementById('block-reason').value || '').trim().slice(0, 500);
        document.getElementById('block-confirm-popup').classList.remove('hidden');
        document.getElementById('block-user-popup').classList.add('hidden');
    };

    document.getElementById('final-confirm-block-btn').onclick = function () {
        const id = this.dataset.id;
        const role = this.dataset.role;
        if (!id || !['student', 'teacher'].includes(role)) return;
        this.disabled = true;
        Promise.all([db.ref(`users/${id}`).once('value'), getCurrentAdminNotificationContext()]).then(([snapshot, adminContext]) => {
            if (!snapshot.exists()) throw new Error('Selected user not found.');
            const user = snapshot.val() || {};
            if (String(user.role || '').toLowerCase() !== role) throw new Error('The user type changed. Refresh and try again.');
            if (String(user.schoolId || '').trim() !== adminContext.schoolId) throw new Error('You can only block students or teachers belonging to your school.');
            const updates = {};
            const blockedAt = Date.now();
            const reason = this.dataset.reason || '';
            const noticeKey = db.ref(`notifications/${id}`).push().key;
            updates[`blockedUsers/${id}`] = {
                name: user.name || '', email: user.email || '', role, schoolId: adminContext.schoolId,
                reason, blockedDate: blockedAt,
                blockedBy: firebase.auth().currentUser?.uid || null
            };
            updates[`users/${id}/blocked`] = true;
            updates[`users/${id}/blockedSchoolId`] = adminContext.schoolId;
            updates[`users/${id}/blockedRole`] = role;
            updates[`users/${id}/blockedBy`] = firebase.auth().currentUser?.uid || null;
            updates[`users/${id}/blockedReason`] = reason;
            updates[`notifications/${id}/${noticeKey}`] = {
                title: 'Account access blocked',
                message: `Your ${role} account was blocked by your school administrator.${reason ? ` Reason: ${reason}` : ''} Contact your administrator if you believe this is a mistake.`,
                type: 'warning',
                category: 'Account access',
                timestamp: blockedAt,
                read: false
            };
            return db.ref().update(updates);
        }).then(() => {
            document.getElementById('block-confirm-popup').classList.add('hidden');
            document.getElementById('block-user-popup').classList.add('hidden');
            document.getElementById('block-reason').value = '';
            loadBlockedUsers();
            loadEligibleUsers();
        }).catch(error => alert(`Error blocking user: ${error.message}`)).finally(() => { this.disabled = false; });
    };

    document.getElementById('confirm-unblock-btn').onclick = function () {
        const id = this.dataset.id;
        if (!id) return;
        this.disabled = true;
        Promise.all([db.ref(`users/${id}`).once('value'), getCurrentAdminNotificationContext()]).then(([snapshot, adminContext]) => {
            if (!snapshot.exists()) throw new Error('Selected account no longer exists.');
            const user = snapshot.val() || {};
            if (!['student', 'teacher'].includes(String(user.role || '').toLowerCase()) ||
                String(user.schoolId || '').trim() !== adminContext.schoolId) {
                throw new Error('You can only unblock students or teachers belonging to your school.');
            }
            const updates = {};
            updates[`blockedUsers/${id}`] = null;
            updates[`users/${id}/blocked`] = false;
            updates[`users/${id}/blockedSchoolId`] = null;
            updates[`users/${id}/blockedRole`] = null;
            updates[`users/${id}/blockedBy`] = null;
            updates[`users/${id}/blockedReason`] = null;
            return db.ref().update(updates);
        }).then(() => {
            document.getElementById('unblock-confirm-popup').classList.add('hidden');
            loadBlockedUsers();
            loadEligibleUsers();
        }).catch(error => alert(`Error unblocking user: ${error.message}`)).finally(() => { this.disabled = false; });
    };

    list.onclick = event => {
        const button = event.target.closest('.unblock-user-btn');
        if (!button) return;
        const user = blockedRows.find(item => item.id === button.dataset.id);
        if (!user) return;
        document.getElementById('unblock-user-name').textContent = user.name || 'Unknown';
        document.getElementById('unblock-user-email').textContent = user.email || 'No email';
        document.getElementById('confirm-unblock-btn').dataset.id = user.id;
        document.getElementById('unblock-confirm-popup').classList.remove('hidden');
    };

    loadBlockedUsers();
}

function initDownloadLimitSection() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = window.ROLLCALL_FIREBASE_CONFIG;
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const originalSection = document.getElementById('download-limit-section');
    const activeSection = document.getElementById('download-limit-section-active');
    const section = activeSection || originalSection;

    if (!section) {
        console.error('Download limit section not found in DOM');
        return;
    }

    const listEl = section.querySelector('#download-limit-list');
    const summaryEl = section.querySelector('#download-limit-summary');
    const refreshBtn = section.querySelector('#refresh-download-limit-btn');
    const downloadLimit = 1;

    if (!listEl) {
        console.error('Download limit list element not found');
        return;
    }

    const renderSummary = (count) => {
        if (!summaryEl) return;
        summaryEl.innerHTML = `
            <p>Android app download limit: <strong>${downloadLimit}</strong>. Users at or above limit: <strong>${count}</strong>.</p>
        `;
    };

    const loadDownloadLimitUsers = () => {
        listEl.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center;">
                    <i class="fas fa-spinner fa-spin"></i> Loading download limits...
                </td>
            </tr>`;

        db.ref('users').orderByChild('appDownloadUsed').startAt(downloadLimit).once('value')
            .then(snapshot => {
                const users = [];
                snapshot.forEach(childSnapshot => {
                    const userData = childSnapshot.val() || {};
                    const used = Number(userData.appDownloadUsed || 0);
                    if (used < downloadLimit) return;
                    users.push({
                        id: childSnapshot.key,
                        name: userData.name || userData.displayName || 'Unknown',
                        email: userData.email || 'N/A',
                        role: userData.role || 'N/A',
                        used,
                        classRoll: userData.classRoll,
                        univRoll: userData.univRoll
                    });
                });

                users.sort((a, b) => {
                    if (b.used !== a.used) return b.used - a.used;
                    return (a.name || '').localeCompare(b.name || '');
                });

                if (!users.length) {
                    listEl.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center;">No users have reached the download limit.</td>
                        </tr>`;
                    renderSummary(0);
                    return;
                }

                listEl.innerHTML = users.map(user => {
                    const rollBits = [];
                    if (user.classRoll) rollBits.push(`Class: ${user.classRoll}`);
                    if (user.univRoll) rollBits.push(`Univ: ${user.univRoll}`);
                    const rollHtml = rollBits.length
                        ? `<div style="font-size: 0.8rem; color: #6b7280;">${rollBits.join(' | ')}</div>`
                        : '';
                    const status = user.used > downloadLimit
                        ? `Exceeded by ${user.used - downloadLimit}`
                        : 'Limit reached';
                    return `
                        <tr>
                            <td>${user.name}${rollHtml}</td>
                            <td>${user.email}</td>
                            <td>${user.role}</td>
                            <td>${user.used}</td>
                            <td>${status}</td>
                            <td>
                                <button class="small-btn revive-download-credit-btn" data-id="${user.id}" data-name="${user.name || 'User'}" data-email="${user.email || ''}">
                                    <i class="fas fa-undo"></i> Revive
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');

                renderSummary(users.length);

                section.querySelectorAll('.revive-download-credit-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userId = btn.getAttribute('data-id');
                        const userName = btn.getAttribute('data-name') || 'User';
                        const userEmail = btn.getAttribute('data-email') || '';
                        const label = userEmail ? `${userName} (${userEmail})` : userName;
                        const confirmReset = confirm(`Reset download credits for ${label}?`);
                        if (!confirmReset) return;

                        db.ref(`users/${userId}/appDownloadUsed`).set(0)
                            .then(() => {
                                if (typeof showAlert === 'function') {
                                    showAlert('Download credits revived successfully', 'success');
                                }
                                loadDownloadLimitUsers();
                            })
                            .catch(error => {
                                if (typeof showAlert === 'function') {
                                    showAlert(`Error reviving credits: ${error.message}`, 'error');
                                } else {
                                    alert(`Error reviving credits: ${error.message}`);
                                }
                            });
                    });
                });
            })
            .catch(error => {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center;">Error loading download limits: ${error.message}</td>
                    </tr>`;
                if (summaryEl) {
                    summaryEl.innerHTML = `<p>Error loading download limit users: ${error.message}</p>`;
                }
            });
    };

    if (refreshBtn) {
        refreshBtn.onclick = loadDownloadLimitUsers;
    }

    loadDownloadLimitUsers();
}

function initDeviceLocksSection() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = window.ROLLCALL_FIREBASE_CONFIG;
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const originalSection = document.getElementById('device-locks-section');
    const activeSection = document.getElementById('device-locks-section-active');
    const section = activeSection || originalSection;

    if (!section) {
        console.error('Device locks section not found in DOM');
        return;
    }

    const listEl = section.querySelector('#device-locks-list');
    const countEl = section.querySelector('#device-locks-count');
    const refreshBtn = section.querySelector('#refresh-device-locks-btn');
    const infoEl = section.querySelector('.status-indicator');
    const LOCK_WINDOW_MS = 30 * 60 * 1000;

    if (!listEl) {
        console.error('Device locks list element not found');
        return;
    }

    const formatDate = (value) => {
        if (!value || isNaN(value)) return 'Unknown';
        const date = new Date(Number(value));
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    };

    const formatRemaining = (remainingMs) => {
        if (remainingMs === null) return 'Unknown';
        const minutes = Math.ceil(remainingMs / 60000);
        return minutes > 0 ? `${minutes} min` : 'Expired';
    };

    const loadDeviceLocks = () => {
        listEl.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center;">
                    <i class="fas fa-spinner fa-spin"></i> Loading device locks...
                </td>
            </tr>`;

        db.ref('userLocks').once('value')
            .then(snapshot => {
                if (!snapshot.exists()) {
                    listEl.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center;">No active device locks.</td>
                        </tr>`;
                    if (infoEl) {
                        infoEl.innerHTML = '<p>No active device locks found.</p>';
                    }
                    if (countEl) {
                        countEl.textContent = '0';
                    }
                    return;
                }

                const locks = [];
                const userPromises = [];
                const userDataMap = {};
                let expiredCount = 0;

                snapshot.forEach(childSnapshot => {
                    const lock = childSnapshot.val() || {};
                    const userId = childSnapshot.key;
                    const attendanceTime = Number(lock.attendanceTime || 0);
                    const elapsed = attendanceTime ? Date.now() - attendanceTime : 0;
                    const remaining = attendanceTime ? Math.max(LOCK_WINDOW_MS - elapsed, 0) : null;
                    const isActive = attendanceTime ? remaining > 0 : true;

                    if (!isActive) {
                        expiredCount += 1;
                        return;
                    }

                    if (userId) {
                        userPromises.push(
                            db.ref(`users/${userId}`).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    locks.push({
                        userId,
                        lock,
                        attendanceTime,
                        remaining
                    });
                });

                Promise.all(userPromises).then(() => {
                    locks.forEach(item => {
                        const userData = userDataMap[item.userId] || {};
                        item.userName = userData.name || userData.displayName || item.lock.userName || 'Unknown User';
                        item.userEmail = userData.email || item.lock.userEmail || 'No email';
                    });

                    if (countEl) {
                        countEl.textContent = String(locks.length);
                    }

                    if (!locks.length) {
                        listEl.innerHTML = `
                            <tr>
                                <td colspan="6" style="text-align: center;">No active device locks.</td>
                            </tr>`;
                        if (infoEl) {
                            infoEl.innerHTML = `<p>No active device locks found.${expiredCount ? ` ${expiredCount} expired lock(s) hidden.` : ''}</p>`;
                        }
                        if (countEl) {
                            countEl.textContent = '0';
                        }
                        return;
                    }

                    locks.sort((a, b) => b.attendanceTime - a.attendanceTime);

                    listEl.innerHTML = locks.map(item => {
                        const deviceId = item.lock.deviceId || '';
                        const fingerprint = item.lock.deviceFingerprint || '';
                        const deviceLabel = deviceId ? deviceId.slice(0, 10) : 'N/A';
                        const fingerprintLabel = fingerprint ? fingerprint.slice(0, 10) : 'N/A';
                        return `
                            <tr>
                                <td>
                                    <div style="font-weight: 600;">${item.userName}</div>
                                    <div style="font-size: 0.85rem; color: #6b7280;">${item.userEmail}</div>
                                </td>
                                <td>${item.lock.locationName || 'Unknown'}</td>
                                <td>${formatDate(item.attendanceTime)}</td>
                                <td>${formatRemaining(item.remaining)}</td>
                                <td>
                                    <div style="font-size: 0.85rem; color: #64748b;">Device: ${deviceLabel}</div>
                                    <div style="font-size: 0.85rem; color: #94a3b8;">Fingerprint: ${fingerprintLabel}</div>
                                </td>
                                <td>
                                    <button class="small-btn clear-device-lock-btn" data-user-id="${item.userId}" data-device-id="${deviceId}" data-device-fingerprint="${fingerprint}">
                                        <i class="fas fa-unlock"></i> Clear
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('');

                    if (infoEl) {
                        infoEl.innerHTML = `<p>${locks.length} active lock(s).${expiredCount ? ` ${expiredCount} expired lock(s) hidden.` : ''}</p>`;
                    }

                    section.querySelectorAll('.clear-device-lock-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const userId = btn.getAttribute('data-user-id');
                            const deviceId = btn.getAttribute('data-device-id');
                            const deviceFingerprint = btn.getAttribute('data-device-fingerprint');
                            if (!userId) return;
                            if (!confirm('Clear this user device lock?')) return;

                            const removals = [
                                db.ref(`userLocks/${userId}`).remove()
                            ];
                            if (deviceId) {
                                removals.push(db.ref(`deviceLocks/${deviceId}`).remove());
                            }
                            if (deviceFingerprint) {
                                removals.push(db.ref(`deviceFingerprintLocks/${deviceFingerprint}`).remove());
                            }

                            Promise.all(removals)
                                .then(() => {
                                    if (typeof showAlert === 'function') {
                                        showAlert('Device lock cleared', 'success');
                                    }
                                    loadDeviceLocks();
                                })
                                .catch(error => {
                                    if (typeof showAlert === 'function') {
                                        showAlert(`Error clearing lock: ${error.message}`, 'error');
                                    } else {
                                        alert(`Error clearing lock: ${error.message}`);
                                    }
                                });
                        });
                    });
                });
            })
            .catch(error => {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center;">Error loading device locks: ${error.message}</td>
                    </tr>`;
                if (infoEl) {
                    infoEl.innerHTML = `<p>Error loading device locks.</p>`;
                }
                if (countEl) {
                    countEl.textContent = '0';
                }
            });
    };

    if (refreshBtn) {
        refreshBtn.onclick = loadDeviceLocks;
    }

    loadDeviceLocks();
}
function initDatabaseManagement() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = window.ROLLCALL_FIREBASE_CONFIG;
        firebase.initializeApp(firebaseConfig);
    }

    // Get references to Firebase services
    const db = firebase.database();

    // Create delete all confirmation popup if it doesn't exist
    if (!document.getElementById('delete-all-db-popup')) {
        const popup = document.createElement('div');
        popup.id = 'delete-all-db-popup';
        popup.className = 'popup-container hidden';
        popup.innerHTML = `
                    <div class="popup">
                        <div class="popup-header">
                            <h3>Confirm Delete All Database</h3>
                            <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="popup-body">
                            <div class="confirmation-message">
                                <i class="fas fa-exclamation-triangle confirmation-icon"></i>
                                <p>Are you sure you want to delete the entire database?</p>
                                <p><strong>This action cannot be undone and will delete ALL data!</strong></p>
                                <div class="section-details">
                                    <p>To confirm, type <strong>DELETE</strong> in the box below:</p>
                                    <input type="text" id="delete-confirmation-input" class="reason-input" placeholder="Type DELETE here" style="min-height: 40px;">
                                </div>
                            </div>
                            <div class="popup-actions">
                                <button id="confirm-delete-all-btn" class="primary-btn" style="background-color: var(--danger-color);" disabled>Delete Entire Database</button>
                                <button class="close-popup-btn secondary-btn">Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
        document.body.appendChild(popup);
    }

    // Add CSS for popups if not already present
    if (!document.getElementById('popup-styles')) {
        const style = document.createElement('style');
        style.id = 'popup-styles';
        style.textContent = `
                    .popup-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.5);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 1000;
                    }
                    .popup-container.hidden {
                        display: none;
                    }
                    .popup {
                        background-color: white;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        width: 90%;
                        max-width: 500px;
                        max-height: 90vh;
                        overflow-y: auto;
                    }
                    .popup-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        border-bottom: 1px solid #eee;
                    }
                    .popup-body {
                        padding: 20px;
                    }
                    .confirmation-message {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .confirmation-icon {
                        font-size: 48px;
                        color: var(--warning-color);
                        margin-bottom: 15px;
                    }
                    .popup-actions {
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 20px;
                    }
                    .section-details {
                        margin: 15px 0;
                        padding: 10px;
                        background-color: #f9f9f9;
                        border-radius: 4px;
                    }
                `;
        document.head.appendChild(style);
    }

    // Require PIN verification before showing database management section
    const dbSection = document.getElementById('database-management-section');
    if (false && dbSection) {
        dbSection.classList.add('hidden');

        // Show PIN verification popup
        const verificationPopup = document.getElementById('password-verification-popup');
        if (verificationPopup) {
            verificationPopup.classList.remove('hidden');

            // Focus on first PIN input
            const firstPinInput = verificationPopup.querySelector('.pin-input');
            if (firstPinInput) {
                firstPinInput.focus();
            }

            // Set up PIN input behavior
            setupPinInputs();

            // Add event listener for verify button
            const verifyBtn = document.getElementById('verify-pin-btn');
            if (verifyBtn) {
                verifyBtn.addEventListener('click', verifyAdminPin);
            }
        }
    }

    // Function to set up PIN input behavior
    function setupPinInputs() {
        const pinInputs = document.querySelectorAll('.pin-input');

        pinInputs.forEach((input, index) => {
            // Auto-focus next input when a digit is entered
            input.addEventListener('input', function () {
                if (this.value.length === 1) {
                    if (index < pinInputs.length - 1) {
                        pinInputs[index + 1].focus();
                    } else {
                        // If last input, trigger verify
                        document.getElementById('verify-pin-btn').click();
                    }
                }
            });

            // Handle backspace to go to previous input
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && this.value.length === 0 && index > 0) {
                    pinInputs[index - 1].focus();
                }
            });
        });
    }

    // Function to verify admin PIN
    function verifyAdminPin() {
        const pinInputs = document.querySelectorAll('.pin-input');
        let pin = '';

        // Collect PIN from inputs
        pinInputs.forEach(input => {
            pin += input.value;
        });

        // Check if PIN is correct
        const signedInUser = firebase.auth().currentUser;
        if (!signedInUser) {
            alert('Please sign in again before verifying the security PIN.');
            return;
        }
        db.ref(`users/${signedInUser.uid}/schoolId`).once('value')
            .then(schoolSnapshot => {
                const schoolId = String(schoolSnapshot.val() || '').trim();
                if (!schoolId) throw new Error('This administrator is not linked to a school.');
                return db.ref(`schoolSettings/${schoolId}/securityPinHash`).once('value');
            })
            .then(snapshot => {
                const bytes = new TextEncoder().encode(pin);
                return crypto.subtle.digest('SHA-256', bytes).then(digest => ({
                    correctPin: snapshot.val(),
                    enteredPin: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
                }));
            })
            .then(({ correctPin, enteredPin }) => {

                if (enteredPin === correctPin) {
                    // PIN is correct, hide verification popup and show database section
                    document.getElementById('password-verification-popup').classList.add('hidden');
                    document.getElementById('database-management-section').classList.remove('hidden');

                    // Clear PIN inputs
                    pinInputs.forEach(input => {
                        input.value = '';
                    });

                    // Hide error message if visible
                    const errorMsg = document.getElementById('pin-error-message');
                    if (errorMsg) {
                        errorMsg.style.display = 'none';
                    }

                    // Initialize database management functionality
                    initDatabaseManagementFunctionality();
                } else {
                    // PIN is incorrect, show error message
                    const errorMsg = document.getElementById('pin-error-message');
                    if (errorMsg) {
                        errorMsg.style.display = 'block';
                    }

                    // Clear PIN inputs and focus on first input
                    pinInputs.forEach(input => {
                        input.value = '';
                    });
                    pinInputs[0].focus();
                }
            })
            .catch(error => {
                console.error('Error verifying PIN:', error);
                alert('Error verifying PIN: ' + error.message);
            });
    }

    // Add event listener for close popup buttons
    document.querySelectorAll('.close-popup-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const popup = this.closest('.popup-container');
            if (popup) {
                popup.classList.add('hidden');
            }
        });
    });

    // Function to initialize database management functionality
    function initDatabaseManagementFunctionality() {
        // Make sure we're using the same database reference
        const db = firebase.database();

        // Load database sections
        loadDatabaseSections();

        // Add event listeners after all elements are created
        setTimeout(() => {
            // Add event listener for refresh button
            const refreshBtn = document.getElementById('refresh-db-sections-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    loadDatabaseSections();
                });
            }

            // Add event listener for delete all button
            const deleteAllBtn = document.getElementById('database-delete-all');
            if (deleteAllBtn) {
                deleteAllBtn.addEventListener('click', function () {
                    showDeleteAllConfirmation();
                });
            }

            // Add event listener for delete confirmation input
            const confirmInput = document.getElementById('delete-confirmation-input');
            if (confirmInput) {
                confirmInput.addEventListener('input', function () {
                    const confirmBtn = document.getElementById('confirm-delete-all-btn');
                    if (this.value === 'DELETE') {
                        confirmBtn.removeAttribute('disabled');
                    } else {
                        confirmBtn.setAttribute('disabled', 'disabled');
                    }
                });
            }

            // Add event listener for confirm delete all button
            const confirmDeleteAllBtn = document.getElementById('confirm-delete-all-btn');
            if (confirmDeleteAllBtn) {
                confirmDeleteAllBtn.addEventListener('click', function () {
                    const confirmInput = document.getElementById('delete-confirmation-input');
                    if (confirmInput && confirmInput.value === 'DELETE') {
                        deleteAllDatabase();
                    }
                });
            }

            // Add event listener for confirm delete section button
            const confirmDeleteSectionBtn = document.getElementById('confirm-delete-section-btn');
            if (confirmDeleteSectionBtn) {
                confirmDeleteSectionBtn.addEventListener('click', function () {
                    const sectionPath = this.getAttribute('data-path');
                    if (sectionPath) {
                        deleteSection(sectionPath);
                    }
                });
            }

            // Close popup buttons
            document.querySelectorAll('.close-popup-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const popup = this.closest('.popup-container');
                    if (popup) {
                        popup.classList.add('hidden');
                    } else {
                        // Fallback for buttons that might not be inside a direct parent popup container
                        const deleteDbSectionPopup = document.getElementById('delete-db-section-popup');
                        const deleteAllDbPopup = document.getElementById('delete-all-db-popup');

                        if (deleteDbSectionPopup) deleteDbSectionPopup.classList.add('hidden');
                        if (deleteAllDbPopup) deleteAllDbPopup.classList.add('hidden');
                    }
                });
            });

            // Add event listener for cancel delete button specifically
            const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
            if (cancelDeleteBtn) {
                cancelDeleteBtn.addEventListener('click', function () {
                    const popup = document.getElementById('delete-all-db-popup');
                    if (popup) popup.classList.add('hidden');
                });
            }
        }, 100); // Small delay to ensure DOM is ready
    }

    // Function to load database sections
    function loadDatabaseSections() {
        const sectionsContainer = document.getElementById('db-sections-list');
        if (!sectionsContainer) return;
        sectionsContainer.innerHTML = '<div class="db-load-error">Use the institution-scoped Database Storage panel to review records.</div>';
    }

    // Function to count items in a section
    function countItems(obj) {
        if (!obj) return 0;
        return Object.keys(obj).length;
    }

    // Function to create a section card
    function createSectionCard(sectionName, itemCount) {
        const card = document.createElement('div');
        card.className = 'db-section-card';

        // Choose icon based on section name
        let iconClass = 'fa-database';
        if (sectionName.toLowerCase().includes('user')) iconClass = 'fa-users';
        else if (sectionName.toLowerCase().includes('attend')) iconClass = 'fa-calendar-check';
        else if (sectionName.toLowerCase().includes('locat')) iconClass = 'fa-map-marker-alt';
        else if (sectionName.toLowerCase().includes('modif')) iconClass = 'fa-edit';
        else if (sectionName.toLowerCase().includes('device')) iconClass = 'fa-mobile-alt';
        else if (sectionName.toLowerCase().includes('admin')) iconClass = 'fa-user-shield';

        card.innerHTML = `
            <div class="db-section-header">
                <div class="db-title-wrapper">
                    <div class="db-icon-box">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div>
                        <h4 class="db-section-title">${sectionName}</h4>
                        <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 2px;">Firebase Root Collection</div>
                    </div>
                </div>
            </div>
            <div class="db-section-content">
                <div class="db-stats-grid">
                    <div class="db-stat-row">
                        <span class="db-stat-label">Total Records</span>
                        <span class="db-stat-value">${itemCount}</span>
                    </div>
                </div>
            </div>
            <div class="db-section-actions">
                <button class="delete-section-btn" data-section="${sectionName}" data-count="${itemCount}">
                    <i class="fas fa-trash-alt"></i> Delete Section
                </button>
            </div>
        `;

        // Add event listener for delete button
        const deleteBtn = card.querySelector('.delete-section-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                const section = this.getAttribute('data-section');
            const adminPanel = document.getElementById('admin-panel');
                const count = this.getAttribute('data-count');
                showDeleteConfirmation(section, count);
            });
        }

        return card;
    }

    // Function to show delete confirmation
    function showDeleteConfirmation(section, count) {
        const popup = document.getElementById('delete-db-section-popup');
        if (!popup) return;

        const sectionNameEl = document.getElementById('delete-section-name');
        const sectionCountEl = document.getElementById('delete-section-count');
        const confirmBtn = document.getElementById('confirm-delete-section-btn');

        if (sectionNameEl) sectionNameEl.textContent = section;
        if (sectionCountEl) sectionCountEl.textContent = count;
        if (confirmBtn) confirmBtn.setAttribute('data-path', section);

        popup.classList.remove('hidden');
    }

    // Function to show delete all confirmation
    function showDeleteAllConfirmation() {
        const popup = document.getElementById('delete-all-db-popup');
        if (!popup) return;

        const confirmInput = document.getElementById('delete-confirmation-input');
        const confirmBtn = document.getElementById('confirm-delete-all-btn');

        if (confirmInput) confirmInput.value = '';
        if (confirmBtn) confirmBtn.setAttribute('disabled', 'disabled');

        popup.classList.remove('hidden');
    }

    // Function to delete a section
    function deleteSection(path) {
        showAlert('Deleting arbitrary database sections is disabled. Use the dated attendance cleanup in Database Storage.', 'warning');
    }

    // Function to delete entire database
    function deleteAllDatabase() {
        showAlert('Whole-database deletion is disabled to protect student and administrator accounts.', 'warning');
    }

    // Helper function to show alerts
    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = message;
        document.body.appendChild(alertDiv);

        setTimeout(() => {
            alertDiv.classList.add('show');
        }, 10);

        setTimeout(() => {
            alertDiv.classList.remove('show');
            setTimeout(() => {
                alertDiv.remove();
            }, 300);
        }, 3000);
    }
}

function initManageAccountSection() {
    const section = document.getElementById('manage-account-section-active');
    if (!section) return;

    const status = section.querySelector('#account-status');
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        if (status) status.innerHTML = '<p>Please sign in again to manage your account.</p>';
        return;
    }

    const nameInput = section.querySelector('#account-name');
    const nameDisplay = section.querySelector('#account-name-display');
    const usernameInput = section.querySelector('#account-username');
    const usernameDisplay = section.querySelector('#account-username-display');
    const dobInput = section.querySelector('#account-dob');
    const dobDisplay = section.querySelector('#account-dob-display');
    const editableProfileFields = [
        { input: nameInput, display: nameDisplay },
        { input: usernameInput, display: usernameDisplay },
        { input: dobInput, display: dobDisplay }
    ];
    const schoolValue = section.querySelector('#account-school-value');
    const subscriptionValue = section.querySelector('#account-subscription-value');
    const subscriptionDetails = section.querySelector('#account-subscription-details');
    const accountGrid = section.querySelector('.ac-grid');
    const editButton = section.querySelector('#edit-account-profile-btn');
    const requestButton = section.querySelector('#request-account-profile-btn');
    const cancelButton = section.querySelector('#cancel-account-profile-btn');
    const securityResetButton = section.querySelector('#account-security-reset-btn');
    const copyCodeButton = section.querySelector('#copy-institution-code-btn');
    const exportButton = section.querySelector('#export-account-summary-btn');
    const erpLicensePanel = section.querySelector('#account-erp-license');
    const erpDownloadPanel = section.querySelector('#account-erp-download');
    const erpLicenseDescription = section.querySelector('#account-erp-license-description');
    const erpLicenseStatus = section.querySelector('#account-erp-license-status');
    const erpCodeRow = section.querySelector('#account-erp-code-row');
    const erpAccessCode = section.querySelector('#account-erp-access-code');
    const erpCopyCodeButton = section.querySelector('#copy-account-erp-code-btn');
    const erpRenewButton = section.querySelector('#request-account-erp-renewal-btn');
    const erpDevices = section.querySelector('#account-erp-devices');
    const erpDevicesList = section.querySelector('#account-erp-devices-list');
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
    const formatDate = value => {
        const date = value ? new Date(value) : null;
        return date && Number.isFinite(date.getTime())
            ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Not available';
    };
    const formatDeviceDate = value => {
        const date = new Date(Number(value));
        return Number.isFinite(date.getTime())
            ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : 'Not available';
    };
    const renderErpDevices = devices => {
        if (!erpDevices || !erpDevicesList) return;
        const items = Array.isArray(devices) ? devices : [];
        erpDevices.hidden = false;
        if (!items.length) {
            erpDevicesList.textContent = 'No ERP devices have verified this license yet.';
            return;
        }
        erpDevicesList.innerHTML = `<div class="account-erp-device-grid">${items.map(device => `
            <article class="account-erp-device">
                <strong>${escape(device.deviceName || 'Unnamed device')}</strong>
                <span>Operating system: ${escape(device.os || 'Not available')} ${escape(device.osVersion || '')}</span>
                <span>ERP app version: ${escape(device.appVersion || 'Not available')}</span>
                <span>CPU architecture: ${escape(device.architecture || 'Not available')}</span>
                <span>First activated: ${escape(formatDeviceDate(device.firstActivatedAt))}</span>
                <span>Last verified: ${escape(formatDeviceDate(device.lastVerifiedAt))}</span>
            </article>`).join('')}</div>`;
    };

    let loadedUser = null;
    let loadedSchool = null;
    let loadedSubscription = null;
    let loadedSchoolId = '';
    const setEditing = editing => {
        editableProfileFields.forEach(({ input, display }) => {
            const field = input.closest('.ac-account-field');
            input.hidden = !editing;
            display.hidden = editing;
            field.classList.toggle('is-editing', editing);
            field.querySelector('.ac-edit-label').hidden = !editing;
        });
        editButton.hidden = editing;
        requestButton.hidden = !editing;
        cancelButton.hidden = !editing;
        if (editing) nameInput.focus();
    };
    let statusHideTimer = null;
    const showStatus = (kind, message, icon = '') => {
        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }
        status.className = `status-indicator ${kind}`;
        status.innerHTML = `<p>${icon ? `<i class="fas ${icon}"></i> ` : ''}${escape(message)}</p>`;
        status.hidden = false;
        const dismissalDelay = kind === 'success' ? 4000 : kind === 'warning' ? 6500 : kind === 'error' ? 8000 : 0;
        if (dismissalDelay) {
            const currentMessage = status.innerHTML;
            statusHideTimer = setTimeout(() => {
                if (status.innerHTML === currentMessage) {
                    status.hidden = true;
                    statusHideTimer = null;
                }
            }, dismissalDelay);
        }
    };
    const sendPasswordReset = button => {
        const email = currentUser.email;
        if (!email) {
            showStatus('error', 'This account does not have an email address for password recovery.');
            return;
        }
        button.disabled = true;
        window.RollCallPasswordReset.send(email)
            .then(() => showStatus('success', 'If an account exists for that email, password reset instructions will be sent.', 'fa-check-circle'))
            .catch(error => {
                console.error('Error sending password reset email:', error);
                showStatus('error', error.message || 'Unable to send password reset instructions.');
            })
            .finally(() => { button.disabled = false; });
    };

    const loadAccount = () => {
        showStatus('info', 'Loading account details...', 'fa-spinner fa-spin');
        return firebase.database().ref(`users/${currentUser.uid}`).once('value')
            .then(userSnapshot => {
                const user = userSnapshot.val() || {};
                const schoolId = String(user.schoolId || '').trim();
                if (!schoolId) throw new Error('Your account is not linked to a school or college.');

                loadedUser = user;
                loadedSchoolId = schoolId;
                nameInput.value = user.name || currentUser.displayName || '';
                nameDisplay.textContent = user.name || currentUser.displayName || 'Not provided';
                section.querySelector('#account-email').textContent = user.email || currentUser.email || 'Not provided';
                usernameInput.value = user.username || '';
                usernameDisplay.textContent = user.username || 'Not provided';
                const dobValue = String(user.dob || user.dateOfBirth || '').slice(0, 10);
                dobInput.value = /^\d{4}-\d{2}-\d{2}$/.test(dobValue) ? dobValue : '';
                dobDisplay.textContent = formatDate(dobValue);
                section.querySelector('#account-role-value').textContent = user.role || 'Administrator';
                section.querySelector('#account-hero-name').textContent = user.name || currentUser.displayName || 'Administrator';
                section.querySelector('#account-hero-email').textContent = currentUser.email || 'No sign-in email available';
                section.querySelector('#account-avatar').textContent = (user.name || currentUser.displayName || 'A').trim().charAt(0) || 'A';
                section.querySelector('#account-last-signin').textContent = formatDate(currentUser.metadata?.lastSignInTime);
                section.querySelector('#account-created-at').textContent = formatDate(currentUser.metadata?.creationTime);
                setEditing(false);
                return Promise.all([
                    firebase.database().ref(`schools/${schoolId}`).once('value'),
                    firebase.database().ref('users').once('value')
                ]).then(([schoolSnapshot, usersSnapshot]) => ({ schoolSnapshot, usersSnapshot }));
            })
            .then(({ schoolSnapshot, usersSnapshot }) => {
                const school = schoolSnapshot.val() || {};
                const subscription = school.subscription || {};
                const planId = String(subscription.planId || '').trim();
                const planPath = school.ownerId && planId
                    ? firebase.database().ref(`owners/${school.ownerId}/pricingPlans/${planId}`)
                    : null;
                if (!planPath) return { school, usersSnapshot, planDefinition: null };
                return planPath.once('value').then(planSnapshot => ({
                    school,
                    usersSnapshot,
                    planDefinition: planSnapshot.val()
                }));
            })
            .then(({ school, usersSnapshot, planDefinition }) => {
                const subscription = school.subscription || {};
                loadedSchool = school;
                loadedSubscription = subscription;
                const plan = subscription.plan || 'No plan configured';
                const endDate = formatDate(subscription.endDate);
                const startDate = formatDate(subscription.startDate);
                const topups = Array.isArray(subscription.topups) ? subscription.topups : Object.values(subscription.topups || {});
                const now = Date.now();
                const activeTopups = topups.filter(item => {
                    const startsAt = Date.parse(item?.startDate || '');
                    const endsAt = Date.parse(item?.endDate || '');
                    return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt > now);
                });
                const topupStudents = activeTopups.reduce((sum, item) => sum + (Number(item?.studentCapacity) || 0), 0);
                const topupTeachers = activeTopups.reduce((sum, item) => sum + (Number(item?.teacherCapacity) || 0), 0);
                const studentCapacity = Number(planDefinition?.studentCapacity ?? subscription.studentCapacity ?? 0) + topupStudents;
                const teacherCapacity = Number(planDefinition?.teacherCapacity ?? subscription.teacherCapacity ?? 0) + topupTeachers;
                const usage = { students: 0, teachers: 0 };
                usersSnapshot.forEach(userSnapshot => {
                    const user = userSnapshot.val() || {};
                    if (String(user.schoolId || '') !== loadedSchoolId) return;
                    const role = String(user.role || '').toLowerCase();
                    if (role === 'student') usage.students += 1;
                    else if (role === 'teacher') usage.teachers += 1;
                });
                const endTime = Date.parse(subscription.endDate || '');
                const expired = Number.isFinite(endTime) && endTime < Date.now();
                const schoolStatus = school.status || 'Unknown';
                const subscriptionState = String(subscription.status || schoolStatus).toLowerCase();
                const statusActive = !expired && ['active', 'trial', 'trialing'].includes(subscriptionState);
                const address = school.address || {};
                const location = [address.city, address.state, address.zipCode].filter(Boolean).join(', ') || address.complete || 'Not provided';
                const institutionType = String(school.type || 'Institution').replace(/^./, character => character.toUpperCase());

                schoolValue.textContent = school.name || 'School account';
                subscriptionValue.textContent = plan;
                section.querySelector('#account-institution-name').textContent = school.name || 'Institution';
                section.querySelector('#account-institution-type').textContent = institutionType;
                section.querySelector('#account-institution-code').textContent = school.code || 'Not available';
                section.querySelector('#account-institution-status').textContent = schoolStatus;
                section.querySelector('#account-institution-location').textContent = location;
                copyCodeButton.disabled = !school.code;
                const totalPrice = Number(subscription.price) || Number(subscription.basePlanPrice) || 0;
                const currency = subscription.currency || 'INR';
                const topupLabel = topups.length
                    ? topups.map(item => `${item.name || 'Capacity top-up'}${item.bonus ? ' · Bonus' : ''}`).join(', ')
                    : 'No top-ups assigned';
                const renderUsage = (label, icon, usedValue, capacityValue, category) => {
                    const used = Math.max(0, Number(usedValue) || 0);
                    const capacity = Math.max(0, Number(capacityValue) || 0);
                    const remaining = Math.max(0, capacity - used);
                    const percent = capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
                    return `<section class="account-usage-item ${category}">
                        <div class="account-usage-heading"><span class="account-usage-icon"><i class="fas ${icon}"></i></span><div><strong>${label}</strong><span>${used.toLocaleString()} used of ${capacity.toLocaleString()} allotted</span></div></div>
                        <div class="account-usage-track" role="progressbar" aria-label="${label} usage" aria-valuemin="0" aria-valuemax="${capacity || 1}" aria-valuenow="${Math.min(used, capacity)}"><span style="width:${percent}%"></span></div>
                        <div class="account-usage-footer"><span>${percent}% used</span><strong>${remaining.toLocaleString()} remaining</strong></div>
                    </section>`;
                };
                subscriptionDetails.innerHTML = `
                    <div class="account-plan-heading">
                        <strong>${escape(plan)}</strong>
                        <span class="account-plan-status ${statusActive ? '' : 'is-inactive'}">${statusActive ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="account-usage-grid">
                        ${renderUsage('Student profiles', 'fa-user-graduate', usage.students, studentCapacity, 'students')}
                        ${renderUsage('Teacher accounts', 'fa-chalkboard-user', usage.teachers, teacherCapacity, 'teachers')}
                    </div>
                    <div class="account-topups"><strong>Top-ups:</strong> ${escape(topupLabel)}${topupStudents || topupTeachers ? ` · +${topupStudents.toLocaleString()} student records · +${topupTeachers.toLocaleString()} teachers` : ''}</div>
                    <p class="small text-muted mb-0">Profile limits come from the assigned subscription plan and active top-ups. School size recorded during registration is informational only.</p>
                    <dl class="account-detail-list">
                        <div><dt>Subscription status</dt><dd>${escape(subscription.status || schoolStatus)}</dd></div>
                        <div><dt>Plan price</dt><dd>${escape(currency)} ${totalPrice.toLocaleString()}</dd></div>
                    </dl>
                    <div class="account-plan-dates"><span><strong>Started:</strong> ${escape(startDate)}</span><span><strong>Renews / ends:</strong> ${escape(endDate)}</span></div>
                `;
                const institutionCategory = String(school.type || school.institutionType || '').trim().toLowerCase();
                const isErpInstitution = institutionCategory === 'erp' || institutionCategory === 'rollcall erp' || institutionCategory.includes('erp');
                accountGrid?.classList.toggle('erp-mode', isErpInstitution);
                if (isErpInstitution && erpLicensePanel) {
                    erpLicensePanel.hidden = false;
                    if (erpDownloadPanel) erpDownloadPanel.hidden = false;
                    erpLicenseDescription.textContent = 'Checking the active ERP subscription and access code...';
                    erpLicenseStatus.textContent = '';
                    erpCodeRow.hidden = true;
                    erpRenewButton.hidden = true;
                    loadErpPortalLicense();
                } else if (erpLicensePanel) {
                    erpLicensePanel.hidden = true;
                    if (erpDownloadPanel) erpDownloadPanel.hidden = true;
                }
                if (typeof window.initManageAccountCbtLicense === 'function') {
                    window.currentAdminSchoolCode = school.code;
                    window.currentAdminSchoolName = school.name;
                    window.currentAdminSchoolId = loadedSchoolId;
                    if (typeof window.refreshCbtPlanAccess === 'function') window.refreshCbtPlanAccess(loadedSchoolId);
                    window.initManageAccountCbtLicense(section);
                }
                showStatus('success', 'Account and institution details are up to date.', 'fa-check-circle');
            })
            .catch(error => {
                console.error('Error loading account details:', error);
                showStatus('error', error.message || 'Unable to load account details.');
                subscriptionDetails.innerHTML = '<p class="error-message">Unable to load subscription details.</p>';
            });
    };

    async function loadErpPortalLicense() {
        try {
            const idToken = await currentUser.getIdToken();
            const workerBase = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || 'https://rollcall-worker.divyanshugupta415.workers.dev/').replace(/\/?$/, '/');
            const response = await fetch(new URL('erp-license/portal', workerBase), {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `ERP license service returned HTTP ${response.status}.`);
            renderErpDevices(result.devices);
            if (result.erpMode !== true) {
                erpLicenseDescription.textContent = 'This subscription is not currently configured as an ERP plan. Contact the institution owner.';
                return;
            }
            const planName = result.plan || loadedSubscription?.plan || 'ERP plan';
            const price = Number(result.price ?? loadedSubscription?.price ?? 0);
            const currency = result.currency || loadedSubscription?.currency || 'INR';
            const licenseEnd = result.endDate || loadedSubscription?.endDate;
            if (result.active === true && result.code) {
                erpLicenseDescription.textContent = `${planName} · ${currency} ${price.toLocaleString()} · Active until ${formatDate(licenseEnd)}.`;
                erpAccessCode.textContent = result.code;
                erpCodeRow.hidden = false;
                erpRenewButton.hidden = true;
                return;
            }
            if (result.subscriptionRequired === true) {
                erpLicenseDescription.textContent = 'No active ERP subscription plan is attached. The institution owner must assign or renew an ERP plan before an access code can be issued.';
                erpRenewButton.hidden = false;
            } else if (result.expired === true) {
                erpLicenseDescription.textContent = `${planName} expired on ${formatDate(licenseEnd)}. The access code is inactive. Send a renewal request to the institution owner to receive a new code after renewal.`;
                erpRenewButton.hidden = false;
            } else if (result.renewalRequired === true) {
                erpLicenseDescription.textContent = `${planName} expired on ${formatDate(licenseEnd)}. A new access code is issued only after the institution owner renews the subscription.`;
                erpRenewButton.hidden = false;
            } else {
                erpLicenseDescription.textContent = `${planName} is not currently active. Contact the institution owner for assistance.`;
            }
        } catch (error) {
            console.error('Could not load the ERP access code:', error);
            erpLicenseDescription.textContent = 'The ERP access code could not be loaded. Check your connection and refresh this panel.';
            erpLicenseStatus.textContent = error.message || 'ERP license service is unavailable.';
        }
    }

    erpCopyCodeButton?.addEventListener('click', async () => {
        const code = String(erpAccessCode?.textContent || '').trim();
        if (!code) {
            erpLicenseStatus.textContent = 'There is no active ERP access code to copy.';
            return;
        }
        try {
            await navigator.clipboard.writeText(code);
            erpLicenseStatus.textContent = 'ERP access code copied.';
        } catch (error) {
            console.error('Could not copy the ERP access code:', error);
            erpLicenseStatus.textContent = 'Copy failed. Select and copy the code manually.';
        }
    });

    erpRenewButton?.addEventListener('click', async () => {
        if (!loadedSchoolId || !loadedSchool?.ownerId || !loadedSubscription) {
            erpLicenseStatus.textContent = 'Institution owner or subscription details are unavailable.';
            return;
        }
        erpRenewButton.disabled = true;
        erpLicenseStatus.textContent = 'Sending renewal request...';
        const requestRef = firebase.database().ref(`subscriptionResubscribeRequests/${loadedSchoolId}/${currentUser.uid}`);
        const request = {
            schoolId: loadedSchoolId,
            schoolName: loadedSchool.name || '',
            schoolCode: loadedSchool.code || '',
            ownerId: String(loadedSchool.ownerId),
            requestedBy: currentUser.uid,
            requesterName: loadedUser?.name || currentUser.displayName || currentUser.email || 'Administrator',
            requesterEmail: loadedUser?.email || currentUser.email || '',
            requesterRole: String(loadedUser?.role || 'admin'),
            subscriptionEndDate: loadedSubscription.endDate || '',
            requestedPlan: {
                id: String(loadedSubscription.planId || ''),
                name: String(loadedSubscription.plan || ''),
                price: Number(loadedSubscription.basePlanPrice ?? loadedSubscription.price ?? 0),
                currency: String(loadedSubscription.currency || 'INR'),
                durationMonths: Number(loadedSubscription.durationMonths || 0),
                studentCapacity: Number(loadedSubscription.studentCapacity || 0),
                teacherCapacity: Number(loadedSubscription.teacherCapacity || 0)
            },
            status: 'pending',
            requestedAt: Date.now()
        };
        try {
            const result = await requestRef.transaction(current => current?.status === 'pending' ? undefined : request);
            erpLicenseStatus.textContent = result.committed
                ? 'ERP renewal request sent to the institution owner.'
                : 'A renewal request is already pending with the institution owner.';
            erpRenewButton.textContent = result.committed ? 'Request sent' : 'Request already pending';
        } catch (error) {
            console.error('Could not send ERP renewal request:', error);
            erpLicenseStatus.textContent = error.message || 'Could not send the renewal request. Try again.';
            erpRenewButton.disabled = false;
        }
    });

    editButton.addEventListener('click', () => setEditing(true));
    cancelButton.addEventListener('click', () => {
        nameInput.value = loadedUser?.name || currentUser.displayName || '';
        usernameInput.value = loadedUser?.username || '';
        const dobValue = String(loadedUser?.dob || loadedUser?.dateOfBirth || '').slice(0, 10);
        dobInput.value = /^\d{4}-\d{2}-\d{2}$/.test(dobValue) ? dobValue : '';
        setEditing(false);
    });

    requestButton.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
            showStatus('warning', 'Please enter your full name.');
            nameInput.focus();
            return;
        }
        if (name.length > 100) {
            showStatus('warning', 'Your name must be 100 characters or fewer.');
            nameInput.focus();
            return;
        }
        const username = usernameInput.value.trim();
        if (username.length > 64) {
            showStatus('warning', 'Your username must be 64 characters or fewer.');
            usernameInput.focus();
            return;
        }
        const dob = dobInput.value;
        if (dob && dob > new Date().toISOString().slice(0, 10)) {
            showStatus('warning', 'Date of birth cannot be in the future.');
            dobInput.focus();
            return;
        }

        const currentName = loadedUser?.name || currentUser.displayName || '';
        const currentUsername = loadedUser?.username || '';
        const currentDob = String(loadedUser?.dob || loadedUser?.dateOfBirth || '').slice(0, 10);
        const requestedData = {};
        const currentData = {};
        if (name !== currentName) {
            currentData.name = currentName;
            requestedData.name = name;
        }
        if (username !== currentUsername) {
            currentData.username = currentUsername;
            requestedData.username = username;
        }
        if (dob && dob !== currentDob) {
            currentData.dob = currentDob;
            currentData.dateOfBirth = currentDob;
            requestedData.dob = dob;
            requestedData.dateOfBirth = dob;
        }
        if (!Object.keys(requestedData).length) {
            showStatus('info', 'No profile changes to submit.');
            return;
        }

        requestButton.disabled = true;
        requestButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        const request = {
            requestType: 'Administrator Profile Update',
            userId: currentUser.uid,
            schoolId: loadedSchoolId,
            ownerId: null,
            userName: loadedUser?.name || currentUser.displayName || '',
            userEmail: currentUser.email || '',
            currentData,
            requestedData,
            status: 'pending',
            timestamp: Date.now()
        };
        firebase.database().ref(`schools/${loadedSchoolId}/ownerId`).once('value')
            .then(ownerSnapshot => {
                request.ownerId = ownerSnapshot.val() || null;
                if (!request.ownerId) throw new Error('The school owner could not be identified.');
                return firebase.database().ref('profile_update_requests').push(request);
            })
            .then(() => {
                showStatus('success', 'Update request sent to the school owner for approval.', 'fa-check-circle');
                nameInput.value = loadedUser?.name || currentUser.displayName || '';
                usernameInput.value = loadedUser?.username || '';
                const dobValue = String(loadedUser?.dob || loadedUser?.dateOfBirth || '').slice(0, 10);
                dobInput.value = /^\d{4}-\d{2}-\d{2}$/.test(dobValue) ? dobValue : '';
                setEditing(false);
            })
            .catch(error => {
                console.error('Error sending administrator profile request:', error);
                showStatus('error', error.message || 'Unable to send update request.');
            })
            .finally(() => {
                requestButton.disabled = false;
                requestButton.innerHTML = '<i class="fas fa-paper-plane"></i> Send Update Request';
            });
    });

    securityResetButton.addEventListener('click', () => sendPasswordReset(securityResetButton));
    copyCodeButton.addEventListener('click', () => {
        const code = String(loadedSchool?.code || '').trim();
        if (!code) {
            showStatus('warning', 'No institution code is available to copy.');
            return;
        }
        const copyWithFallback = () => {
            const copyField = document.createElement('textarea');
            copyField.value = code;
            copyField.setAttribute('readonly', '');
            copyField.style.position = 'fixed';
            copyField.style.opacity = '0';
            section.appendChild(copyField);
            copyField.select();
            const copied = document.execCommand('copy');
            copyField.remove();
            if (!copied) throw new Error('Clipboard copy command was rejected.');
        };
        const copyRequest = navigator.clipboard?.writeText
            ? navigator.clipboard.writeText(code).catch(error => {
                console.error('Clipboard API failed; trying copy fallback:', error);
                copyWithFallback();
            })
            : Promise.resolve().then(copyWithFallback);
        copyRequest
            .then(() => showStatus('success', 'Institution code copied to clipboard.', 'fa-check-circle'))
            .catch(error => {
                console.error('Unable to copy institution code:', error);
                showStatus('error', 'Could not copy the institution code. Please select and copy it manually.');
            });
    });
    exportButton.addEventListener('click', () => {
        if (!loadedUser || !loadedSchool) {
            showStatus('warning', 'Account details are still loading. Try exporting again shortly.');
            return;
        }
        const summary = {
            exportedAt: new Date().toISOString(),
            administrator: {
                name: loadedUser.name || currentUser.displayName || '',
                email: currentUser.email || '',
                username: loadedUser.username || '',
                role: loadedUser.role || 'Administrator',
                lastSignIn: currentUser.metadata?.lastSignInTime || null,
                accountCreated: currentUser.metadata?.creationTime || null
            },
            institution: {
                name: loadedSchool.name || '',
                code: loadedSchool.code || '',
                type: loadedSchool.type || '',
                status: loadedSchool.status || ''
            },
            subscription: loadedSubscription || {}
        };
        const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'rollcall-account-summary.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        showStatus('success', 'Account summary exported.', 'fa-check-circle');
    });

    const refreshButton = section.querySelector('#refresh-account-btn');
    refreshButton?.addEventListener('click', loadAccount);
    loadAccount();
}

// Function to initialize the Manage Administrators section
function initManageAdminsSection() {
    const adminUsersList = document.getElementById('admin-users-list');

    if (!adminUsersList) {
        console.error("Could not find admin-users-list element");
        return;
    }

    // Show loading state
    adminUsersList.innerHTML = '<p class="loading">Loading administrators...</p>';

    const signedInUser = firebase.auth().currentUser;
    if (!signedInUser) {
        adminUsersList.innerHTML = '<p class="error-message">Please sign in again to view administrators.</p>';
        return;
    }

    firebase.database().ref(`users/${signedInUser.uid}/schoolId`).once('value')
        .then((schoolSnapshot) => {
            const schoolId = String(schoolSnapshot.val() || '').trim();
            if (!schoolId) throw new Error('This administrator is not linked to a school.');
            return firebase.database().ref('users').get().then(snapshot => ({ schoolId, snapshot }));
        })
        .then(({ schoolId, snapshot }) => {
            if (snapshot.exists()) {
                const users = snapshot.val();
                let adminUsers = [];

                // Filter for admin users
                for (const userId in users) {
                    const user = users[userId];
                    if (user.role === 'admin' && String(user.schoolId || '') === schoolId) {
                        adminUsers.push({
                            id: userId,
                            ...user
                        });
                    }
                }

                if (adminUsers.length > 0) {
                    // Sort admins by name
                    adminUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                    // Clear loading message
                    adminUsersList.innerHTML = '';

                    // Update admin count in metric card if present
                    const countEl = document.getElementById('admin-summary-count');
                    if (countEl) countEl.textContent = adminUsers.length + ' Active';

                    // Get current user ID from Firebase Auth
                    const currentUserId = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;

                    // Create admin user cards
                    adminUsers.forEach(admin => {
                        const adminCard = document.createElement('div');
                        adminCard.className = 'admin-card';

                        // Format last login date if available
                        let lastLoginText = 'Never logged in';

                        // If this is the current user and showing "Never logged in", show "Currently logged in" instead
                        if (admin.id === currentUserId) {
                            lastLoginText = 'Currently active';
                        } else if (admin.lastLogin) {
                            const lastLogin = new Date(admin.lastLogin);
                            lastLoginText = `Last login: ${lastLogin.toLocaleDateString()} at ${lastLogin.toLocaleTimeString()}`;
                        }

                        const profilePhoto = admin.profilePhoto || admin.photoURL || '';
                        const avatarContent = profilePhoto
                            ? `<img class="admin-profile-photo" alt="${admin.name || 'Admin'} profile photo" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: none;">`
                            : `<i class="fas fa-user-shield"></i>`;

                        adminCard.innerHTML = `
                            <div class="admin-info">
                                <div class="admin-avatar">
                                    ${avatarContent}
                                </div>
                                <div class="admin-details">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <h4>${admin.name || 'Admin User'}</h4>
                                        <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(79, 70, 229, 0.1); color: #4f46e5; border: 1px solid rgba(79, 70, 229, 0.2);">Administrator</span>
                                    </div>
                                    <p>${admin.email || 'No email provided'}</p>
                                    <p class="last-login"><i class="fas fa-clock"></i> ${lastLoginText}</p>
                                </div>
                            </div>
                            <div class="admin-actions">
                                <button class="action-btn view-admin-btn" data-admin-id="${admin.id}">
                                    <i class="fas fa-eye"></i> View Profile
                                </button>
                                ${admin.id !== currentUserId ?
                                    `<button class="action-btn reset-password-btn" data-admin-id="${admin.id}">
                                        <i class="fas fa-key"></i> Reset Password
                                    </button>
                                    <button class="action-btn delete-btn remove-admin-btn" data-admin-id="${admin.id}">
                                        <i class="fas fa-user-minus"></i> Remove
                                    </button>` :
                                    '<span class="current-user-badge">Current User</span>'}
                            </div>
                        `;

                        if (profilePhoto) {
                            const avatar = adminCard.querySelector('.admin-avatar');
                            const photo = adminCard.querySelector('.admin-profile-photo');
                            const fallbackIcon = document.createElement('i');
                            fallbackIcon.className = 'fas fa-user-shield';
                            photo.addEventListener('load', () => {
                                photo.style.display = 'block';
                                fallbackIcon.remove();
                            }, { once: true });
                            photo.addEventListener('error', () => {
                                photo.remove();
                            }, { once: true });
                            photo.style.cursor = 'zoom-in';
                            photo.setAttribute('role', 'button');
                            photo.tabIndex = 0;
                            photo.setAttribute('aria-label', `Preview ${admin.name || 'admin'} profile photo`);
                            photo.addEventListener('click', event => {
                                event.stopPropagation();
                                window.showProfilePhotoPreview(profilePhoto, admin.profilePhotoKey || profilePhoto, `${admin.name || 'Admin'} profile photo`);
                            });
                            photo.addEventListener('keydown', event => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                window.showProfilePhotoPreview(profilePhoto, admin.profilePhotoKey || profilePhoto, `${admin.name || 'Admin'} profile photo`);
                            });
                            avatar.appendChild(fallbackIcon);

                            const cacheKey = admin.profilePhotoKey || profilePhoto;
                            if (typeof window.applyEncryptedPhotoToImg === 'function') {
                                window.applyEncryptedPhotoToImg(photo, profilePhoto, cacheKey);
                            } else {
                                photo.src = profilePhoto;
                            }
                        }

                        adminUsersList.appendChild(adminCard);
                    });

                    // Add event listeners to admin action buttons
                    document.querySelectorAll('.view-admin-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');
                            // Show admin details in a popup
                            const admin = adminUsers.find(a => a.id === adminId);

                            // Create popup container
                            const popupContainer = document.createElement('div');
                            popupContainer.className = 'popup-container';

                            // Adjust last login text for popup
                            let popupLastLoginText = admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never logged in';
                            if (admin.id === currentUserId && !admin.lastLogin) {
                                popupLastLoginText = 'Currently logged in';
                            }

                            // Create popup content
                            popupContainer.innerHTML = `
                                    <div class="popup">
                                        <div class="popup-header">
                                            <h3>Admin Details</h3>
                                            <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                        </div>
                                        <div class="popup-body" style="padding: 20px;">
                                            <div style="margin-bottom: 15px;">
                                                <strong>Name:</strong> ${admin.name}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Email:</strong> ${admin.email}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Admin ID:</strong> ${admin.id}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Last Login:</strong> ${popupLastLoginText}
                                            </div>
                                        </div>
                                    </div>
                                `;

                            // Add popup to body
                            document.body.appendChild(popupContainer);

                            // Add close button functionality
                            popupContainer.querySelector('.close-popup-btn').addEventListener('click', function () {
                                document.body.removeChild(popupContainer);
                            });

                            // Close popup when clicking outside
                            popupContainer.addEventListener('click', function (e) {
                                if (e.target === popupContainer) {
                                    document.body.removeChild(popupContainer);
                                }
                            });
                        });
                    });

                    document.querySelectorAll('.reset-password-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');
                            const admin = adminUsers.find(a => a.id === adminId);
                            if (admin && confirm(`Are you sure you want to send a password reset email to ${admin.email}?`)) {
                                window.RollCallPasswordReset.send(admin.email, {
                                    user: firebase.auth().currentUser,
                                    targetUid: admin.id
                                })
                                    .then(() => {
                                        showAlert('If an account exists for that email, password reset instructions will be sent.', 'success');
                                    })
                                    .catch((error) => {
                                        console.error('Error sending password reset email:', error);
                                        showAlert(`Error: ${error.message}`, 'error');
                                    });
                            }
                        });
                    });

                    document.querySelectorAll('.remove-admin-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');

                            // Check if this is the last admin
                            if (adminUsers.length <= 1) {
                                // Create custom popup for last admin warning
                                const popupContainer = document.createElement('div');
                                popupContainer.className = 'popup-container';

                                popupContainer.innerHTML = `
                                        <div class="popup">
                                            <div class="popup-header">
                                                <h3>Cannot Remove Last Admin</h3>
                                                <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                            </div>
                                            <div class="popup-body" style="padding: 20px;">
                                                <div style="margin-bottom: 15px; text-align: center;">
                                                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f39c12; margin-bottom: 15px;"></i>
                                                    <p>You cannot remove the last administrator account.</p>
                                                    <p>Please add another admin before removing this one.</p>
                                                </div>
                                                <div style="text-align: center; margin-top: 20px;">
                                                    <button class="action-btn close-warning-btn">OK</button>
                                                </div>
                                            </div>
                                        </div>
                                    `;

                                // Add popup to body
                                document.body.appendChild(popupContainer);

                                // Add close button functionality
                                const closeButtons = popupContainer.querySelectorAll('.close-popup-btn, .close-warning-btn');
                                closeButtons.forEach(btn => {
                                    btn.addEventListener('click', function () {
                                        document.body.removeChild(popupContainer);
                                    });
                                });

                                // Close popup when clicking outside
                                popupContainer.addEventListener('click', function (e) {
                                    if (e.target === popupContainer) {
                                        document.body.removeChild(popupContainer);
                                    }
                                });
                            } else {
                                // Create custom confirmation popup
                                const popupContainer = document.createElement('div');
                                popupContainer.className = 'popup-container';

                                // Find the admin to be removed
                                const adminToRemove = adminUsers.find(a => a.id === adminId);

                                popupContainer.innerHTML = `
                                        <div class="popup">
                                            <div class="popup-header">
                                                <h3>Confirm Admin Removal</h3>
                                                <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                            </div>
                                            <div class="popup-body" style="padding: 20px;">
                                                <div style="margin-bottom: 15px; text-align: center;">
                                                    <i class="fas fa-user-minus" style="font-size: 48px; color: #e74c3c; margin-bottom: 15px;"></i>
                                                    <p>Are you sure you want to remove admin privileges from:</p>
                                                    <p><strong>${adminToRemove.name}</strong> (${adminToRemove.email})?</p>
                                                    <p>This user will be converted to a student account.</p>
                                                </div>
                                                <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                                                    <button class="action-btn cancel-remove-btn">Cancel</button>
                                                    <button class="action-btn delete-btn confirm-remove-btn">Remove Admin</button>
                                                </div>
                                            </div>
                                        </div>
                                    `;

                                // Add popup to body
                                document.body.appendChild(popupContainer);

                                // Add close button functionality
                                popupContainer.querySelector('.close-popup-btn').addEventListener('click', function () {
                                    document.body.removeChild(popupContainer);
                                });

                                // Add cancel button functionality
                                popupContainer.querySelector('.cancel-remove-btn').addEventListener('click', function () {
                                    document.body.removeChild(popupContainer);
                                });

                                // Add confirm button functionality
                                popupContainer.querySelector('.confirm-remove-btn').addEventListener('click', function () {
                                    // Update user role to 'student'
                                    firebase.database().ref(`users/${adminId}`).update({
                                        role: 'student'
                                    })
                                        .then(() => {
                                            document.body.removeChild(popupContainer);
                                            showAlert('Admin privileges removed successfully', 'success');
                                            initManageAdminsSection(); // Refresh the list
                                        })
                                        .catch(error => {
                                            console.error('Error removing admin privileges:', error);
                                            showAlert('Error removing admin privileges', 'error');
                                            document.body.removeChild(popupContainer);
                                        });
                                });

                                // Close popup when clicking outside
                                popupContainer.addEventListener('click', function (e) {
                                    if (e.target === popupContainer) {
                                        document.body.removeChild(popupContainer);
                                    }
                                });
                            }
                        });
                    });
                } else {
                    adminUsersList.innerHTML = '<p class="no-data">No administrators found.</p>';
                }
            } else {
                adminUsersList.innerHTML = '<p class="no-data">No users found in the system.</p>';
            }
        })
        .catch((error) => {
            console.error('Error fetching school administrators:', error);
            adminUsersList.innerHTML = `<p class="error-message">${error.message || 'Error loading administrators. Please try again.'}</p>`;
        });

    // Set up refresh button event listener - remove previous listener first to avoid duplicates
    const refreshAdminsBtn = document.getElementById('refresh-admins-btn');
    if (refreshAdminsBtn) {
        // Remove existing event listeners by cloning and replacing the button
        const newRefreshBtn = refreshAdminsBtn.cloneNode(true);
        refreshAdminsBtn.parentNode.replaceChild(newRefreshBtn, refreshAdminsBtn);

        // Add new event listener
        newRefreshBtn.addEventListener('click', function () {
            showAlert('Refreshing administrators list...', 'info');
            initManageAdminsSection();
        });
    }

    // Live search filter for admins
    const adminSearchInput = document.getElementById('admin-search-filter');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase().trim();
            const cards = adminUsersList.querySelectorAll('.admin-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'flex' : 'none';
            });
        });
    }

    // Add Administrator dialog
    if (!window.__rollCallAddAdminHandlerAttached) {
        window.__rollCallAddAdminHandlerAttached = true;
        document.addEventListener('click', function (event) {
            const clickedElement = event.target instanceof Element ? event.target : null;
            const addAdminBtn = clickedElement ? clickedElement.closest('#add-admin-direct-btn') : null;
            if (!addAdminBtn) return;
            event.preventDefault();
            const popup = document.createElement('div');
            popup.className = 'popup-overlay';
            popup.innerHTML = `
                <div class="popup-content" style="max-width: 480px;">
                    <div class="popup-header">
                        <h3><i class="fas fa-user-plus" style="color: var(--accent-indigo);"></i> Add Administrator</h3>
                        <button type="button" class="close-btn">&times;</button>
                    </div>
                    <div class="popup-body">
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0; margin-bottom: 16px;">
                            Create a Firebase Authentication account with administrator access for this school or college.
                        </p>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Full Name</label>
                            <input type="text" id="new-admin-name" placeholder="e.g. Sarah Jenkins" style="width: 100%; height: 40px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-size: 0.88rem; box-sizing: border-box; outline: none;">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Email Address</label>
                            <input type="email" id="new-admin-email" placeholder="admin@domain.edu" style="width: 100%; height: 40px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-size: 0.88rem; box-sizing: border-box; outline: none;">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Temporary Password</label>
                            <input type="password" id="new-admin-password" minlength="6" autocomplete="new-password" placeholder="At least 6 characters" style="width: 100%; height: 40px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-size: 0.88rem; box-sizing: border-box; outline: none;">
                        </div>
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Confirm Password</label>
                            <input type="password" id="new-admin-password-confirm" minlength="6" autocomplete="new-password" placeholder="Re-enter the password" style="width: 100%; height: 40px; padding: 0 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-size: 0.88rem; box-sizing: border-box; outline: none;">
                        </div>
                    </div>
                    <div class="popup-actions">
                        <button type="button" class="btn-cancel"><i class="fas fa-times"></i> Cancel</button>
                        <button type="button" id="save-new-admin-btn" class="btn-send"><i class="fas fa-check"></i> Grant Access</button>
                    </div>
                </div>
            `;
            document.body.appendChild(popup);

            const closeBtn = popup.querySelector('.close-btn');
            const cancelBtn = popup.querySelector('.btn-cancel');
            const close = () => popup.remove();
            closeBtn.onclick = close;
            cancelBtn.onclick = close;
            popup.onclick = (e) => { if (e.target === popup) close(); };

            const saveBtn = popup.querySelector('#save-new-admin-btn');
            saveBtn.onclick = async () => {
                const name = popup.querySelector('#new-admin-name').value.trim();
                const email = popup.querySelector('#new-admin-email').value.trim();
                const password = popup.querySelector('#new-admin-password').value;
                const passwordConfirmation = popup.querySelector('#new-admin-password-confirm').value;

                if (!name || !email || !password || !passwordConfirmation) {
                    showAlert('Please complete all administrator fields.', 'warning');
                    return;
                }
                if (password.length < 6) {
                    showAlert('The password must contain at least 6 characters.', 'warning');
                    return;
                }
                if (password !== passwordConfirmation) {
                    showAlert('The passwords do not match.', 'warning');
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                const currentAdmin = firebase.auth().currentUser;
                if (!currentAdmin) {
                    showAlert('Your administrator session has expired. Please sign in again.', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Grant Access';
                    return;
                }

                let temporaryApp;
                try {
                    const schoolSnapshot = await firebase.database().ref(`users/${currentAdmin.uid}/schoolId`).once('value');
                    const schoolId = String(schoolSnapshot.val() || '').trim();
                    if (!schoolId) throw new Error('Your account is not linked to a school or college.');

                    const normalizedEmail = email.toLowerCase();
                    const appName = `schoolAdmin-${schoolId}-${Date.now()}`;
                    temporaryApp = firebase.initializeApp(firebase.app().options, appName);
                    const credential = await temporaryApp.auth().createUserWithEmailAndPassword(normalizedEmail, password);
                    await credential.user.updateProfile({ displayName: name });

                    const createdAt = new Date().toISOString();
                    const profile = {
                        uid: credential.user.uid,
                        name,
                        username: normalizedEmail.split('@')[0],
                        email: normalizedEmail,
                        role: 'admin',
                        schoolId,
                        createdAt,
                        createdBy: currentAdmin.uid,
                        lastLogin: null
                    };

                    await firebase.database().ref().update({
                        [`users/${credential.user.uid}`]: profile,
                        [`schoolAdmins/${schoolId}/administrators/${credential.user.uid}`]: profile
                    });

                    showAlert('Administrator account created successfully.', 'success');
                    popup.remove();
                    initManageAdminsSection();
                } catch (err) {
                    console.error('Error creating school administrator:', err);
                    showAlert(`Error creating administrator: ${err.message}`, 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Grant Access';
                } finally {
                    if (temporaryApp) {
                        await temporaryApp.auth().signOut().catch(error => console.warn('Temporary administrator session could not be signed out.', error));
                        await temporaryApp.delete().catch(error => console.warn('Temporary Firebase app could not be deleted.', error));
                    }
                }
            };
        });
    }
}

// Alias function to maintain naming consistency
function initManageAdmins() {
    initManageAdminsSection();
}

document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('add-admin-direct-btn')) {
        initManageAdminsSection();
    }
});


// Redesigned Broadcast & Notification Section supporting Campus Announcements and Direct Alerts
let currentBroadcastTab = 'announcements';

async function getCurrentAdminNotificationContext() {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Sign in to view school notifications.');
    const snapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
    const profile = snapshot.val() || {};
    const schoolId = String(profile.schoolId || '').trim();
    if (String(profile.role || '').toLowerCase() !== 'admin' || !schoolId) throw new Error('This administrator account is not linked to a school or college.');
    return { user, profile, schoolId };
}

async function getSchoolNotificationMemberIds(schoolId, adminUid) {
    const snapshot = await firebase.database().ref('users').orderByChild('schoolId').equalTo(schoolId).once('value');
    const memberIds = new Set();
    snapshot.forEach(child => memberIds.add(child.key));
    if (adminUid) memberIds.add(adminUid);
    return memberIds;
}

function isNotificationForSchool(notification, schoolId, memberIds) {
    if (String(notification.schoolId || '') === String(schoolId)) return true;
    const pathParts = String(notification.id || '').split('/');
    if (pathParts.length > 1 && memberIds.has(pathParts[0])) return true;
    const senderIds = [notification.sentBy, notification.senderId, notification.reviewedBy, notification.approvedBy].map(value => String(value || ''));
    if (senderIds.some(uid => memberIds.has(uid))) return true;
    const recipients = Array.isArray(notification.recipients) ? notification.recipients : [];
    return recipients.some(recipient => memberIds.has(String(typeof recipient === 'object' ? recipient.id || recipient.uid : recipient)));
}

function initNotificationsSection() {
    const notificationsList = document.getElementById('notifications-list');
    if (!notificationsList) return;

    markNotificationsSeen();
    addNotificationStyles();

    const db = firebase.database();
    const readRecent = path => window.__rollCallSchoolDatabase?.readRecent
        ? window.__rollCallSchoolDatabase.readRecent(path)
        : db.ref(path).limitToLast(50).once('value');

    // Render tab switchers at the top of the container
    let tabsHeader = document.getElementById('broadcast-tabs-header');
    if (!tabsHeader) {
        tabsHeader = document.createElement('div');
        tabsHeader.id = 'broadcast-tabs-header';
        tabsHeader.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;';
        notificationsList.parentNode.insertBefore(tabsHeader, notificationsList);
    }

    tabsHeader.innerHTML = `
        <button type="button" class="tab-pill ${currentBroadcastTab === 'announcements' ? 'active' : ''}" id="tab-broadcast-announcements" style="padding:6px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;border:1px solid ${currentBroadcastTab === 'announcements' ? '#4f46e5' : '#cbd5e1'};background:${currentBroadcastTab === 'announcements' ? '#4f46e5' : '#ffffff'};color:${currentBroadcastTab === 'announcements' ? '#ffffff' : '#475569'};">
            <i class="fas fa-bullhorn" style="margin-right:6px;"></i> Campus Announcements (Board)
        </button>
        <button type="button" class="tab-pill ${currentBroadcastTab === 'notifications' ? 'active' : ''}" id="tab-broadcast-notifications" style="padding:6px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;cursor:pointer;border:1px solid ${currentBroadcastTab === 'notifications' ? '#4f46e5' : '#cbd5e1'};background:${currentBroadcastTab === 'notifications' ? '#4f46e5' : '#ffffff'};color:${currentBroadcastTab === 'notifications' ? '#ffffff' : '#475569'};">
            <i class="fas fa-bell" style="margin-right:6px;"></i> Direct Notifications
        </button>
    `;

    document.getElementById('tab-broadcast-announcements').onclick = () => {
        currentBroadcastTab = 'announcements';
        initNotificationsSection();
    };
    document.getElementById('tab-broadcast-notifications').onclick = () => {
        currentBroadcastTab = 'notifications';
        initNotificationsSection();
    };

    // Show loading
    notificationsList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    const countBadge = document.getElementById('notification-count');

    if (currentBroadcastTab === 'announcements') {
        Promise.all([getCurrentAdminNotificationContext(), readRecent('announcements')])
            .then(async ([adminContext, snapshot]) => {
                const schoolMemberIds = await getSchoolNotificationMemberIds(adminContext.schoolId, adminContext.user.uid);
                const items = [];
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        items.push({ id: child.key, ...child.val() });
                    });
                }
                const schoolItems = items.filter(item => isNotificationForSchool(item, adminContext.schoolId, schoolMemberIds));
                schoolItems.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
                if (countBadge) countBadge.textContent = schoolItems.length;
                displayAnnouncements(schoolItems);
            })
            .catch(error => {
                console.error('Could not load campus announcements:', error);
                notificationsList.textContent = error.message || 'Error loading campus announcements';
            });
    } else {
        Promise.all([
            getCurrentAdminNotificationContext(),
            readRecent('notifications')
        ]).then(async ([adminContext, snapshot]) => {
                const schoolMemberIds = await getSchoolNotificationMemberIds(adminContext.schoolId, adminContext.user.uid);
                const notifications = [];
                const collectNotifications = (value, path) => {
                    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
                    const isNotification = ['header', 'title', 'subject', 'body', 'message', 'content']
                        .some(field => typeof value[field] === 'string') ||
                        (value.timestamp !== undefined && value.type !== undefined);
                    if (isNotification) {
                        notifications.push({ ...value, id: path.join('/') });
                        return;
                    }
                    Object.entries(value).forEach(([key, child]) => collectNotifications(child, [...path, key]));
                };
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        collectNotifications(child.val(), [child.key]);
                    });
                }
                const schoolNotifications = notifications.filter(notification => isNotificationForSchool(notification, adminContext.schoolId, schoolMemberIds));
                schoolNotifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                if (countBadge) countBadge.textContent = schoolNotifications.length;
                displayNotifications(schoolNotifications);
            })
            .catch(error => {
                console.error('Could not load school notifications:', error);
                notificationsList.textContent = error.message || 'Error loading school notifications';
            });
    }

    function displayAnnouncements(items) {
        if (items.length === 0) {
            notificationsList.innerHTML = `
                <div class="no-data" style="text-align:center;padding:36px 20px;color:#94a3b8;">
                    <i class="fas fa-bullhorn" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
                    No campus announcements published yet.
                </div>`;
            return;
        }

        notificationsList.innerHTML = items.map(item => {
            const categoryLabels = {
                academic: 'Academic',
                events: 'Events',
                administrative: 'Administrative',
                sports: 'Sports & Culture',
                urgent: 'Urgent Alert'
            };
            const cat = categoryLabels[item.category] || item.category || 'Campus';
            const dateStr = new Date(item.timestamp || item.createdAt || Date.now()).toLocaleString();
            return `
                <div class="notification-item ${item.type === 'urgent' ? 'error' : (item.type || 'info')}" style="cursor:pointer;" onclick="viewBroadcastItem('${item.id}', 'announcements')">
                    <div class="notification-icon">
                        <i class="fas ${item.type === 'urgent' ? 'fa-exclamation-triangle' : 'fa-bullhorn'}"></i>
                    </div>
                    <div class="notification-content">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <h4 style="margin:0;">${item.title || item.subject || 'Campus Announcement'}</h4>
                            <span class="badge secondary" style="font-size:0.7rem;padding:2px 8px;">${cat}</span>
                        </div>
                        <p style="margin:0 0 6px;color:#475569;">${(item.content || item.message || '').replace(/<[^>]*>/g, '').substring(0, 110)}...</p>
                        <small style="color:#94a3b8;"><i class="fas fa-clock"></i> ${dateStr} • By ${item.author || 'Administration'}</small>
                    </div>
                    <button onclick="deleteBroadcastItem('${item.id}', 'announcements', event)" class="delete-btn" title="Delete Announcement">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    function displayNotifications(notifications) {
        if (notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="no-data" style="text-align:center;padding:36px 20px;color:#94a3b8;">
                    <i class="fas fa-inbox" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
                    No notifications found.
                </div>`;
            return;
        }

        const getTypeIcon = (type) => {
            switch (type) {
                case 'success': return 'fa-check-circle';
                case 'warning': return 'fa-exclamation-triangle';
                case 'error': return 'fa-exclamation-circle';
                default: return 'fa-info-circle';
            }
        };

        notificationsList.innerHTML = notifications.map(notif => {
            const title = notif.header || notif.title || notif.subject || 'Notification';
            const rawBody = notif.body || notif.message || notif.content || '';
            const preview = String(rawBody).replace(/<[^>]*>/g, '').trim();
            const timestamp = Number(notif.timestamp || notif.createdAt || notif.sentAt) || Date.now();
            return `
                <div class="notification-item ${notif.type || 'info'}" onclick="viewBroadcastItem('${notif.id}', 'notifications')">
                    <div class="notification-icon">
                        <i class="fas ${getTypeIcon(notif.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <h4>${title}</h4>
                        <p>${preview ? `${preview.substring(0, 110)}${preview.length > 110 ? '…' : ''}` : 'No message content was saved.'}</p>
                        <small><i class="fas fa-clock"></i> ${new Date(timestamp).toLocaleString()}</small>
                    </div>
                    <button onclick="deleteBroadcastItem('${notif.id}', 'notifications', event)" class="delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    setupNotificationButtons();
}

// View item details (Announcement or Notification)
function viewBroadcastItem(id, channel) {
    hideSidebar();
    const path = channel === 'announcements' ? `announcements/${id}` : `notifications/${id}`;

    firebase.database().ref(path).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) return;
            const data = snapshot.val();
            const title = data.title || data.subject || data.header || 'Broadcast Item';
            const body = data.content || data.message || data.body || 'No content';
            const timeStr = new Date(data.timestamp || data.createdAt || Date.now()).toLocaleString();

            const popup = document.createElement('div');
            popup.className = 'popup-overlay';
            popup.innerHTML = `
                <div class="popup-content notification-view">
                    <div class="popup-header ${data.type || 'info'}">
                        <h3><i class="fas ${channel === 'announcements' ? 'fa-bullhorn' : 'fa-bell'}"></i> ${title}</h3>
                        <button onclick="closePopup(this)" class="close-btn">&times;</button>
                    </div>
                    <div class="popup-body">
                        <div class="notification-message">${body}</div>
                        ${data.category ? `<div style="margin-top:10px;"><span class="badge secondary">Category: ${data.category}</span></div>` : ''}
                        ${data.recipientType === 'specific' && data.recipients ? `
                            <div class="recipients-info">
                                <h4><i class="fas fa-users"></i> Recipients (${data.recipients.length}):</h4>
                        <div class="recipients-list">${(data.recipientNames || data.recipients).map(r => typeof r === 'string' ? r : (r.name || r.email || r.id || 'Student')).join(', ')}</div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="popup-footer">
                        <div class="notification-meta">
                            <small><i class="fas fa-clock"></i> ${timeStr}</small>
                            ${data.sentByEmail ? `<small><i class="fas fa-user"></i> ${data.sentByEmail}</small>` : ''}
                        </div>
                        <button onclick="closePopup(this)" class="btn-close"><i class="fas fa-times"></i> Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);
            popup.addEventListener('click', e => {
                if (e.target === popup) closePopup(popup);
            });
        });
}

function viewNotification(id) {
    viewBroadcastItem(id, 'notifications');
}

// Delete broadcast item
function deleteBroadcastItem(id, channel, event) {
    if (event) event.stopPropagation();
    const itemLabel = channel === 'announcements' ? 'campus announcement' : 'notification';
    if (confirm(`Are you sure you want to delete this ${itemLabel}?`)) {
        const path = channel === 'announcements' ? `announcements/${id}` : `notifications/${id}`;
        firebase.database().ref(path).remove()
            .then(() => {
                initNotificationsSection();
                showAlert(`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} deleted successfully`, 'success');
            })
            .catch(() => showAlert(`Error deleting ${itemLabel}`, 'error'));
    }
}

function deleteNotification(id, event) {
    deleteBroadcastItem(id, 'notifications', event);
}

// Create new notification or campus announcement with rich text editor
function createNotification() {
    const existingPopup = document.querySelector('.popup-overlay');
    if (existingPopup) existingPopup.remove();

    hideSidebar();
    window.selectedStudentsList = [];

    const popup = document.createElement('div');
    popup.className = 'popup-overlay';
    popup.innerHTML = `
        <div class="popup-content notification-popup" style="max-width:640px; width:92%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden;">
            <div class="popup-header" style="flex-shrink:0;">
                <h3><i class="fas fa-bullhorn"></i> Create Broadcast</h3>
                <button onclick="closePopup(this)" class="close-btn">&times;</button>
            </div>
            <div class="popup-body" style="overflow-y:auto; flex:1 1 auto; max-height:calc(90vh - 130px); padding:20px 24px;">
                <div class="form-group">
                    <label><i class="fas fa-bullhorn"></i> Broadcast Channel:</label>
                    <select id="notif-channel" onchange="window.toggleBroadcastChannelUi()">
                        <option value="announcements">📢 Campus Announcement (Campus Board - Visible to All Students)</option>
                        <option value="notifications">🔔 Direct Notification (Targeted or System Alert)</option>
                    </select>
                </div>

                <div class="form-group" id="announcement-category-group">
                    <label><i class="fas fa-folder"></i> Announcement Category:</label>
                    <select id="notif-category">
                        <option value="academic">📚 Academic (Exams, Classes, Schedules)</option>
                        <option value="administrative">🏛️ Administrative & Official Notices</option>
                        <option value="events">🎉 Events, Seminars & Workshops</option>
                        <option value="sports">🏆 Sports & Cultural Activities</option>
                        <option value="urgent">🚨 Urgent Campus Alert</option>
                    </select>
                </div>

                <div class="form-group">
                    <label><i class="fas fa-heading"></i> Title / Subject:</label>
                    <input type="text" id="notif-header" placeholder="Enter title or subject">
                </div>

                <div class="form-group">
                    <label><i class="fas fa-edit"></i> Message Content:</label>
                    <div class="editor-toolbar">
                        <button type="button" onclick="formatText('bold')" title="Bold"><i class="fas fa-bold"></i></button>
                        <button type="button" onclick="formatText('italic')" title="Italic"><i class="fas fa-italic"></i></button>
                        <button type="button" onclick="formatText('underline')" title="Underline"><i class="fas fa-underline"></i></button>
                        <button type="button" onclick="formatText('insertUnorderedList')" title="Bullet List"><i class="fas fa-list-ul"></i></button>
                        <button type="button" onclick="formatText('insertOrderedList')" title="Numbered List"><i class="fas fa-list-ol"></i></button>
                        <button type="button" onclick="insertLink()" title="Insert Link"><i class="fas fa-link"></i></button>
                    </div>
                    <div id="notif-body" contenteditable="true" class="rich-editor" placeholder="Enter broadcast message here..." style="min-height:120px;"></div>
                </div>

                <div class="form-group" id="notification-recipients-group" style="display:none;">
                    <label><i class="fas fa-users"></i> Recipients:</label>
                    <select id="recipient-type" onchange="toggleStudentSelection()">
                        <option value="all">All Students</option>
                        <option value="specific">Specific Students</option>
                    </select>
                    <div id="student-selection" style="display: none; margin-top: 10px;">
                        <div id="students-list" style="max-height: 180px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">Loading students...</div>
                        <div id="selected-students-display" style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; min-height: 40px;">
                            <small style="color: #666;">Selected: <span id="selected-count">0</span> students</small>
                            <div id="selected-tags" style="margin-top: 5px;"></div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Priority / Type:</label>
                    <select id="notif-type">
                        <option value="info">📢 Information</option>
                        <option value="urgent">🚨 Urgent / High Priority</option>
                        <option value="success">✅ Success / Good News</option>
                        <option value="warning">⚠️ Warning / Notice</option>
                    </select>
                </div>
            </div>
            <div class="popup-actions" style="flex-shrink:0;">
                <button onclick="closePopup(this)" class="btn-cancel"><i class="fas fa-times"></i> Cancel</button>
                <button onclick="sendNotification()" class="btn-send"><i class="fas fa-paper-plane"></i> Publish</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);
    popup.addEventListener('click', e => {
        if (e.target === popup) closePopup(popup);
    });

    window.toggleBroadcastChannelUi = function () {
        const channel = document.getElementById('notif-channel')?.value;
        const catGroup = document.getElementById('announcement-category-group');
        const recGroup = document.getElementById('notification-recipients-group');
        if (channel === 'announcements') {
            if (catGroup) catGroup.style.display = 'block';
            if (recGroup) recGroup.style.display = 'none';
        } else {
            if (catGroup) catGroup.style.display = 'none';
            if (recGroup) recGroup.style.display = 'block';
        }
    };

    setTimeout(() => document.getElementById('notif-header')?.focus(), 100);
}

// Send notification or campus announcement
function sendNotification() {
    const channel = document.getElementById('notif-channel')?.value || 'announcements';
    const header = document.getElementById('notif-header')?.value.trim();
    const bodyElement = document.getElementById('notif-body');
    const body = bodyElement?.innerHTML.trim();
    const type = document.getElementById('notif-type')?.value || 'info';
    const category = document.getElementById('notif-category')?.value || 'academic';
    const recipientType = document.getElementById('recipient-type')?.value;

    if (!header) {
        showAlert('Please enter a title or header', 'warning');
        document.getElementById('notif-header')?.focus();
        return;
    }

    if (!body || bodyElement?.textContent.trim() === '') {
        showAlert('Please enter message content', 'warning');
        bodyElement?.focus();
        return;
    }

    const sendBtn = document.querySelector('.popup-overlay .btn-send');
    if (!sendBtn) return;

    const originalContent = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';

    if (channel === 'announcements') {
        getCurrentAdminNotificationContext()
            .then(({ user, profile, schoolId }) => firebase.database().ref('announcements').push({
                title: header,
                subject: header,
                content: body,
                message: body,
                category,
                type,
                priority: type === 'urgent' ? 'high' : 'normal',
                timestamp: Date.now(),
                createdAt: Date.now(),
                author: 'Administration',
                sentBy: user.uid,
                sentByEmail: user.email || '',
                schoolId,
                schoolName: profile.schoolName || profile.institutionName || ''
            }))
            .then(() => {
                const popup = document.querySelector('.popup-overlay');
                if (popup) popup.remove();
                currentBroadcastTab = 'announcements';
                initNotificationsSection();
                showAlert('Campus Announcement published successfully!', 'success');
                showSidebar();
            })
            .catch(error => {
                console.error('Announcement publish error:', error);
                showAlert('Error publishing announcement: ' + error.message, 'error');
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = originalContent;
                }
            });
    } else {
        getCurrentAdminNotificationContext()
            .then(async ({ user, profile, schoolId }) => {
                const studentsSnapshot = await firebase.database().ref('users').orderByChild('schoolId').equalTo(schoolId).once('value');
                const schoolStudents = [];
                studentsSnapshot.forEach(child => {
                    const student = child.val() || {};
                    if (String(student.role || '').toLowerCase() === 'student') schoolStudents.push({ id: child.key, name: student.name || student.email || child.key });
                });
                const schoolStudentIds = new Set(schoolStudents.map(student => student.id));
                const selectedIds = recipientType === 'specific' ? (window.selectedStudentsList || []).map(student => String(student.id)) : schoolStudents.map(student => student.id);
                if (!selectedIds.length) throw new Error('No students are available in this school or college.');
                if (selectedIds.some(id => !schoolStudentIds.has(id))) throw new Error('The selection includes a student outside this school or college. Refresh the student list and try again.');
                const notification = {
                    header,
                    body,
                    type,
                    timestamp: Date.now(),
                    sentBy: user.uid,
                    sentByEmail: user.email || '',
                    schoolId,
                    schoolName: profile.schoolName || profile.institutionName || '',
                    recipientType,
                    recipients: selectedIds
                };
                if (recipientType === 'specific') {
                    notification.recipientNames = window.selectedStudentsList.map(student => student.name || student.email || student.id);
                }
                return firebase.database().ref('notifications').push(notification);
            })
            .then(() => {
                const popup = document.querySelector('.popup-overlay');
                if (popup) popup.remove();
                window.selectedStudentsList = [];
                currentBroadcastTab = 'notifications';
                initNotificationsSection();
                showAlert('Notification sent successfully', 'success');
                showSidebar();
            })
            .catch(error => {
                console.error('Send error:', error);
                showAlert('Error sending notification', 'error');
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = originalContent;
                }
            });
    }
}

// Setup notification buttons
function setupNotificationButtons() {
    const refreshBtn = document.getElementById('refresh-notifications-btn');
    const newBtn = document.getElementById('new-notification-btn');
    const clearBtn = document.getElementById('clear-all-notifications-btn');

    if (refreshBtn) {
        refreshBtn.onclick = () => initNotificationsSection();
    }

    if (newBtn) {
        newBtn.onclick = () => createNotification();
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm('Delete ALL notifications? This cannot be undone.')) {
                firebase.database().ref('notifications').remove()
                    .then(() => initNotificationsSection())
                    .catch(() => alert('Error clearing notifications'));
            }
        };
    }
}

// Text formatting functions
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('notif-body').focus();
}

function insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
        document.execCommand('createLink', false, url);
        document.getElementById('notif-body').focus();
    }
}

// Alert utility
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(alert);

    setTimeout(() => alert.classList.add('show'), 10);
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// Student selection functions
window.selectedStudentsList = [];

function toggleStudentSelection() {
    const recipientType = document.getElementById('recipient-type').value;
    const studentSelection = document.getElementById('student-selection');
    studentSelection.style.display = recipientType === 'specific' ? 'block' : 'none';

    if (recipientType === 'specific') {
        setTimeout(loadStudentsInline, 100);
    } else {
        window.selectedStudentsList = [];
    }
}

function loadStudentsInline() {
    const studentsContainer = document.getElementById('students-list');
    if (!studentsContainer) return;

    studentsContainer.innerHTML = 'Loading...';

    getCurrentAdminNotificationContext()
        .then(({ schoolId }) => firebase.database().ref('users').orderByChild('schoolId').equalTo(schoolId).once('value'))
        .then(snapshot => {
            let html = '';
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const user = child.val();
                    if (String(user?.role || '').toLowerCase() !== 'student') return;
                    const id = child.key;
                    const selected = window.selectedStudentsList.some(s => s.id === id);
                    html += `<div style="padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick="toggleStudentInline('${id}','${user.name}','${user.email}')">
                        <input type="checkbox" id="student-${id}" ${selected ? 'checked' : ''}>
                        <label style="margin-left:8px;cursor:pointer">${user.name} (${user.email})</label>
                    </div>`;
                });
            }
            studentsContainer.innerHTML = html || 'No students found';
            updateSelectedDisplay();
        })
        .catch(() => {
            studentsContainer.innerHTML = 'Error loading students';
        });
}

function toggleStudentInline(id, name, email) {
    const checkbox = document.getElementById(`student-${id}`);
    if (!checkbox) return;

    checkbox.checked = !checkbox.checked;

    if (!window.selectedStudentsList) window.selectedStudentsList = [];

    if (checkbox.checked) {
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({
                id: id,
                name: name.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                email: email.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            });
        }
    } else {
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }

    updateSelectedDisplay();
}

function updateSelectedDisplay() {
    const countEl = document.getElementById('selected-count');
    const tagsEl = document.getElementById('selected-tags');

    if (!countEl || !tagsEl) return;

    countEl.textContent = window.selectedStudentsList.length;

    if (window.selectedStudentsList.length === 0) {
        tagsEl.innerHTML = '<span style="color: #999; font-style: italic;">No students selected</span>';
        return;
    }

    tagsEl.innerHTML = window.selectedStudentsList.map(student => `
        <span style="display: inline-block; background: #e9f5fe; border: 1px solid #c2e0ff; border-radius: 12px; padding: 2px 8px; margin: 2px; font-size: 12px;">
            ${student.name || student.email}
            <button onclick="removeStudent('${student.id}')" style="background: none; border: none; color: #666; margin-left: 4px; cursor: pointer;">&times;</button>
        </span>
    `).join('');
}

function removeStudent(id) {
    window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    const checkbox = document.getElementById(`student-${id}`);
    if (checkbox) checkbox.checked = false;
    updateSelectedDisplay();
}



function toggleStudent(id, name, email) {
    const checkbox = document.getElementById(`student-${id}`);
    if (!checkbox) return;

    checkbox.checked = !checkbox.checked;

    // Update the selected students list
    if (checkbox.checked) {
        // Add to selection if not already present
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({
                id: id,
                name: name.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                email: email.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            });
        }
    } else {
        // Remove from selection
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }
}

function confirmStudentSelection() {
    // The selectedStudentsList is already updated by toggleStudent function
    // Just need to update the display and close popup
    updateSelectedStudentsDisplay();
    closePopup(document.querySelector('.student-popup'));
    console.log(`Selected ${window.selectedStudentsList.length} students:`, window.selectedStudentsList);
}

function updateSelectedStudentsDisplay() {
    const container = document.getElementById('selected-students');
    if (!container) return;

    if (window.selectedStudentsList.length === 0) {
        container.innerHTML = '<div class="no-selection">No students selected</div>';
    } else {
        container.innerHTML = window.selectedStudentsList.map(student => `
            <span class="student-tag">
                ${student.name}
                <button onclick="removeStudent('${student.id}')">&times;</button>
            </span>
        `).join('');
    }
}

function removeStudent(id) {
    window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    updateSelectedStudentsDisplay();
}

// Sidebar control functions
function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    const adminPanel = document.getElementById('admin-panel');
    if (sidebar && contentWrapper) {
        sidebar.classList.add('sidebar-collapsed');
        contentWrapper.classList.add('expanded');
        contentWrapper.style.width = '100%';
        contentWrapper.style.marginLeft = '0';
    }
}

function showSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    const adminPanel = document.getElementById('admin-panel');
    if (sidebar && contentWrapper) {
        sidebar.classList.remove('sidebar-collapsed');
        contentWrapper.classList.remove('expanded');
        if (window.innerWidth >= 992) {
            contentWrapper.style.width = 'calc(100% - 280px)';
            contentWrapper.style.marginLeft = '280px';
        }
    }
}

// Close popup utility
function closePopup(element) {
    const popup = element.closest('.popup-overlay') || element;
    if (popup && popup.parentNode) {
        popup.parentNode.removeChild(popup);
        showSidebar();
    }
}

// Add notification styles
function addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        .notification-item { display: flex; align-items: center; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.3s; }
        .notification-item:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
        .notification-item.info { border-left: 4px solid #17a2b8; }
        .notification-item.success { border-left: 4px solid #28a745; }
        .notification-item.warning { border-left: 4px solid #ffc107; }
        .notification-item.error { border-left: 4px solid #dc3545; }
        .notification-icon { margin-right: 15px; font-size: 20px; }
        .notification-icon .fa-info-circle { color: #17a2b8; }
        .notification-icon .fa-check-circle { color: #28a745; }
        .notification-icon .fa-exclamation-triangle { color: #ffc107; }
        .notification-icon .fa-exclamation-circle { color: #dc3545; }
        .notification-content { flex: 1; }
        .notification-content h4 { margin: 0 0 5px 0; color: #333; }
        .notification-content p { margin: 0 0 5px 0; color: #666; }
        .notification-content small { color: #999; }
        .delete-btn { background: none; border: none; color: #dc3545; padding: 8px; border-radius: 4px; cursor: pointer; }
        .delete-btn:hover { background: #f8d7da; }
        .popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .popup-content { background: #fff; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .popup-content::-webkit-scrollbar { width: 6px; }
        .popup-content::-webkit-scrollbar-track { background: transparent; }
        .popup-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .popup-content::-webkit-scrollbar-thumb:hover { background: #999; }
        .popup-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .popup-header.info { background: linear-gradient(135deg, #17a2b8, #138496); color: white; }
        .popup-header.success { background: linear-gradient(135deg, #28a745, #1e7e34); color: white; }
        .popup-header.warning { background: linear-gradient(135deg, #ffc107, #e0a800); color: #212529; }
        .popup-header.error { background: linear-gradient(135deg, #dc3545, #c82333); color: white; }
        .popup-header h3 { margin: 0; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: inherit; opacity: 0.7; }
        .close-btn:hover { opacity: 1; }
        .popup-body { padding: 20px; }
        .popup-footer { padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: #007bff; box-shadow: 0 0 0 2px rgba(0,123,255,0.25); }
        .editor-toolbar { display: flex; gap: 5px; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px 4px 0 0; }
        .editor-toolbar button { background: #fff; border: 1px solid #ddd; padding: 8px 10px; border-radius: 4px; cursor: pointer; color: #333; }
        .editor-toolbar button:hover { background: #e9ecef; color: #000; }
        .rich-editor { min-height: 120px; padding: 10px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; outline: none; }
        .rich-editor::-webkit-scrollbar { width: 6px; }
        .rich-editor::-webkit-scrollbar-track { background: transparent; }
        .rich-editor::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .rich-editor::-webkit-scrollbar-thumb:hover { background: #999; }
        .rich-editor:empty:before { content: attr(placeholder); color: #999; }
        .popup-actions { display: flex; gap: 10px; justify-content: flex-end; margin: 20px 0; }
        .btn-cancel, .btn-send, .btn-close { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn-cancel, .btn-close { background: #6c757d; color: white; }
        .btn-send { background: #28a745; color: white; }
        .btn-cancel:hover, .btn-close:hover { background: #5a6268; }
        .btn-send:hover { background: #218838; }
        .loading, .error, .no-data { text-align: center; padding: 40px; color: #666; }
        .error { color: #dc3545; }
        .alert { position: fixed; top: 20px; right: 20px; padding: 15px 20px; border-radius: 4px; color: white; z-index: 1001; transform: translateX(400px); transition: transform 0.3s; }
        .alert.show { transform: translateX(0); }
        .alert-success { background: #28a745; }
        .alert-warning { background: #ffc107; color: #212529; }
        .alert-error { background: #dc3545; }
        .notification-meta { display: flex; flex-direction: column; gap: 5px; }
        .notification-message { line-height: 1.6; }
        .recipients-info { margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
        .recipients-info h4 { margin: 0 0 8px 0; color: #495057; }
        .recipients-list { font-size: 14px; color: #6c757d; }
        .btn-select { background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
        .btn-select:hover { background: #0056b3; }
        .selected-list { margin-top: 10px; }
        .student-tag { display: inline-block; background: #e9ecef; padding: 4px 8px; margin: 2px; border-radius: 12px; font-size: 12px; }
        .student-tag button { background: none; border: none; margin-left: 5px; cursor: pointer; }
        .no-selection { color: #6c757d; font-style: italic; }
        .students-container { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; }
        .students-container::-webkit-scrollbar { width: 6px; }
        .students-container::-webkit-scrollbar-track { background: transparent; }
        .students-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .students-container::-webkit-scrollbar-thumb:hover { background: #999; }
        .student-item { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; }
        .student-item:hover { background: #f8f9fa; }
        .student-item input { margin-right: 10px; }
        .search-input { width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .no-students { padding: 20px; text-align: center; color: #6c757d; font-style: italic; }
        .error { padding: 20px; text-align: center; color: #dc3545; }
    `;
    document.head.appendChild(style);
}

// Alias function to maintain naming consistency
function initNotifications() {
    initNotificationsSection();
}


// Function to initialize the Profile Requests section
function initProfileRequestsSection() {
    const profileRequestsList = document.getElementById('profile-requests-list');
    const requestCount = document.getElementById('requests-count');
    const updateRequestCount = count => {
        const label = requestCount?.querySelector('span');
        if (label) label.textContent = `${count} request${count === 1 ? '' : 's'}`;
    };

    if (!profileRequestsList) {
        console.error("Could not find profile-requests-list element");
        return;
    }

    markProfileRequestsSeen();

    // Show loading state
    updateRequestCount(0);
    profileRequestsList.innerHTML = '<div class="profile-requests-loading"><i class="fas fa-spinner fa-spin"></i> Loading profile requests...</div>';

    // Reference to profile requests in Firebase
    // References to profile and device requests in Firebase
    const profileRequestsRef = firebase.database().ref('profileRequests');
    const profileUpdateRequestsRef = firebase.database().ref('profile_update_requests');
    const deviceUnlockRequestsRef = firebase.database().ref('device_unlock_requests');

    // Get all request types
    Promise.all([
        profileRequestsRef.orderByChild('timestamp').once('value'),
        profileUpdateRequestsRef.orderByChild('timestamp').once('value'),
        deviceUnlockRequestsRef.orderByChild('timestamp').once('value')
    ])
        .then(([profileSnapshot, updateSnapshot, deviceSnapshot]) => {
            const requests = [];
            const userPromises = [];
            const userDataMap = {};

            // Process profile requests
            if (profileSnapshot.exists() && profileSnapshot.val() !== null) {
                profileSnapshot.forEach((childSnapshot) => {
                    const data = childSnapshot.val();
                    const userId = data.userId;

                    if (userId) {
                        userPromises.push(
                            firebase.database().ref('users/' + userId).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    requests.push({
                        id: childSnapshot.key,
                        source: 'profileRequests',
                        userId: userId,
                        userName: data.userName || data.name || 'No Name Provided',
                        userEmail: data.userEmail || data.email || 'No Email Provided',
                        userPhoto: data.profilePhoto || null,
                        userPhotoKey: data.profilePhotoKey || null,
                        ...data
                    });
                });
            }

            // Process profile update requests
            if (updateSnapshot.exists() && updateSnapshot.val() !== null) {
                updateSnapshot.forEach((childSnapshot) => {
                    const data = childSnapshot.val();
                    const userId = data.userId;

                    if (userId) {
                        userPromises.push(
                            firebase.database().ref('users/' + userId).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    requests.push({
                        id: childSnapshot.key,
                        source: 'profile_update_requests',
                        userId: userId,
                        userName: data.userName || data.name || 'No Name Provided',
                        userEmail: data.userEmail || data.email || 'No Email Provided',
                        userPhoto: data.profilePhoto || null,
                        userPhotoKey: data.profilePhotoKey || null,
                        requestType: 'Profile Update',
                        changes: data.requestedData || {},
                        currentData: data.currentData || {},
                        timestamp: data.timestamp || Date.now(),
                        status: data.status || 'pending',
                        ...data
                    });
                });
            }

            // Process device unlock / transfer requests
            if (deviceSnapshot && deviceSnapshot.exists() && deviceSnapshot.val() !== null) {
                deviceSnapshot.forEach((childSnapshot) => {
                    const data = childSnapshot.val() || {};
                    const userId = childSnapshot.key;

                    if (userId) {
                        userPromises.push(
                            firebase.database().ref('users/' + userId).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    requests.push({
                        id: childSnapshot.key,
                        source: 'device_unlock_requests',
                        userId: userId,
                        userName: data.name || data.userName || 'Student',
                        userEmail: data.email || data.userEmail || '',
                        userPhoto: null,
                        userPhotoKey: null,
                        requestType: 'Device Unlock / Transfer',
                        platform: data.platform || 'Unknown OS',
                        browser: data.browser || 'Unknown Browser',
                        deviceFingerprint: data.deviceFingerprint || '',
                        changes: {
                            'Platform / OS': data.platform || 'Unknown OS',
                            'Browser': data.browser || 'Unknown Browser',
                            'Hardware Fingerprint': data.deviceFingerprint || 'Unknown ID'
                        },
                        currentData: {},
                        timestamp: data.timestamp || Date.now(),
                        status: data.status || 'pending',
                        ...data
                    });
                });
            }

            // Wait for all user data to be fetched
            Promise.all(userPromises)
                .then(() => {
                    // Update requests with user data from database
                    requests.forEach(request => {
                        if (request.userId && userDataMap[request.userId]) {
                            const userData = userDataMap[request.userId];
                            request.userName = userData.name || userData.displayName || request.userName;
                            request.userEmail = userData.email || request.userEmail;
                            request.userPhoto = userData.profilePhoto || request.userPhoto || null;
                            request.userPhotoKey = userData.profilePhotoKey || request.userPhotoKey || null;
                        }
                    });

                    // The admin queue handles teacher profile requests only.
                    // Student profile requests are routed to their assigned class teacher.
                    for (let index = requests.length - 1; index >= 0; index--) {
                        const request = requests[index];
                        if (request.source !== 'device_unlock_requests' && userDataMap[request.userId]?.role !== 'teacher') requests.splice(index, 1);
                    }

                    // Sort by timestamp descending (newest first)
                    requests.sort((a, b) => b.timestamp - a.timestamp);
                    updateRequestCount(requests.length);

                    if (requests.length > 0) {
                        // Clear loading message
                        profileRequestsList.innerHTML = '';

                        // Create table with styling
                        const table = document.createElement('table');
                        table.className = 'profile-requests-table';

                        // Create table header
                        const tableHeader = document.createElement('thead');
                        tableHeader.innerHTML = `
                                <tr>
                                    <th>User</th>
                                    <th>Request</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            `;
                        table.appendChild(tableHeader);

                        // Create table body
                        const tableBody = document.createElement('tbody');

                        // Create request items
                        requests.forEach((request, index) => {
                            const requestItem = document.createElement('tr');
                            requestItem.style.borderBottom = '1px solid #eee';
                            requestItem.style.transition = 'background-color 0.2s';

                            // Add alternating row colors
                            if (index % 2 === 0) {
                                requestItem.style.backgroundColor = '#ffffff';
                            } else {
                                requestItem.style.backgroundColor = '#f9f9f9';
                            }

                            // Add hover effect
                            requestItem.onmouseover = function () {
                                this.style.backgroundColor = '#f0f0f0';
                            };
                            requestItem.onmouseout = function () {
                                this.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
                            };

                            // Format date
                            const date = new Date(request.timestamp);
                            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

                            // Determine status class
                            let statusClass = 'status-pending';
                            let statusStyle = 'background-color: #fff3cd; color: #856404;';
                            if (request.status === 'approved') {
                                statusClass = 'status-approved';
                                statusStyle = 'background-color: #d4edda; color: #155724;';
                            } else if (request.status === 'rejected') {
                                statusClass = 'status-rejected';
                                statusStyle = 'background-color: #f8d7da; color: #721c24;';
                            }

                            // Cleanly format request labels and badges
                            let requestLabel = '';
                            let requestDetails = '';
                            const dataObj = (request.source === 'profile_update_requests' && request.requestedData) ? request.requestedData : (request.changes || {});
                            const fieldKeys = Object.keys(dataObj);

                            if (request.source === 'device_unlock_requests') {
                                requestLabel = `<span class="badge warning" style="display:inline-flex;align-items:center;gap:5px;font-weight:600;"><i class="fas fa-mobile-screen"></i> Device Unlock</span>`;
                                requestDetails = `Transfer to ${request.platform || 'Device'} (${request.browser || 'Browser'})`;
                            } else if (request.requestType === 'Profile Photo Update' || dataObj.profilePhoto) {
                                requestLabel = `<span class="badge info" style="display:inline-flex;align-items:center;gap:5px;font-weight:600;"><i class="fas fa-camera"></i> Profile Photo Update</span>`;
                                requestDetails = 'New profile photo upload pending review';
                            } else if (fieldKeys.length > 0) {
                                const fieldNames = {
                                    department: 'Branch / Dept',
                                    branch: 'Branch',
                                    bloodGroup: 'Blood Group',
                                    blood: 'Blood Group',
                                    academicBatch: 'Academic Batch',
                                    batch: 'Academic Batch',
                                    classRoll: 'Class Roll',
                                    univRoll: 'University Roll',
                                    phone: 'Phone',
                                    emergencyContact: 'Emergency Contact',
                                    section: 'Section'
                                };
                                const niceLabels = fieldKeys.map(k => fieldNames[k] || k);
                                requestLabel = niceLabels.slice(0, 2).map(l => `<span class="badge secondary" style="margin-right:4px;display:inline-block;">${l}</span>`).join('') + (niceLabels.length > 2 ? `<span class="badge secondary">+${niceLabels.length - 2} more</span>` : '');
                                requestDetails = `Update fields: ${niceLabels.join(', ')}`;
                            } else {
                                requestLabel = `<span class="badge info">${request.requestType || 'Profile Update'}</span>`;
                                requestDetails = request.source === 'profile_update_requests' ? 'Profile update request' : 'Profile change request';
                            }

                            // Format user display
                            const initials = (request.userName || request.userEmail || 'U')
                                .split(' ')
                                .map(part => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase();
                            const photoUrl = request.userPhoto || '';
                            const photoKey = request.userPhotoKey || request.userId || photoUrl;
                            const avatarInner = photoUrl
                                ? `<span class="request-avatar-text">${initials}</span>
                                   <img class="request-avatar-img" src="/api/placeholder/60/60" data-photo-url="${photoUrl}" data-cache-key="${photoKey}" alt="${request.userName || 'User'}">`
                                : `<span class="request-avatar-text">${initials}</span>`;
                            const userDisplay = `
                                <div class="request-user">
                                    <div class="request-avatar">${avatarInner}</div>
                                    <div class="request-user-meta">
                                        <div class="request-user-name">${request.userName || 'Unknown User'}</div>
                                        <div class="request-user-email">${request.userEmail || 'No email'}</div>
                                    </div>
                                </div>
                            `;

                            requestItem.innerHTML = `
                                    <td>${userDisplay}</td>
                                    <td>
                                        <div class="request-summary">
                                            <div class="request-type">${requestLabel}</div>
                                            <div class="request-detail">${requestDetails}</div>
                                        </div>
                                    </td>
                                    <td><div class="request-date">${formattedDate}</div></td>
                                    <td>
                                        <span class="status-pill ${statusClass}">
                                            ${request.status || 'pending'}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="request-actions">
                                            <button class="view-request-btn action-btn-ghost" data-request-id="${request.id}" data-source="${request.source}">
                                                <i class="fas fa-eye"></i> View
                                            </button>
                                            ${request.status === 'pending' ? `
                                                <button class="approve-request-btn action-btn-approve" data-request-id="${request.id}" data-source="${request.source}">
                                                    <i class="fas fa-check"></i> Approve
                                                </button>
                                                <button class="reject-request-btn action-btn-reject" data-request-id="${request.id}" data-source="${request.source}">
                                                    <i class="fas fa-times"></i> Reject
                                                </button>
                                            ` : ''}
                                            ${(request.source === 'profile_update_requests' && request.userId) ? `
                                                <div class="request-more-wrap">
                                                    <button class="more-actions-btn" data-user-id="${request.userId}" data-request-id="${request.id}" aria-label="More actions">
                                                        <i class="fas fa-ellipsis-v"></i>
                                                    </button>
                                                    <div class="more-actions-menu">
                                                        <button class="revive-credit-btn" data-user-id="${request.userId}" data-request-id="${request.id}">
                                                            <i class="fas fa-undo"></i> Revive 1 Credit
                                                        </button>
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </td>
                                `;

                            tableBody.appendChild(requestItem);
                        });

                        table.appendChild(tableBody);
                        profileRequestsList.appendChild(table);
                        hydrateProfileRequestAvatars(table);

                        // Add event listeners to buttons
                        addProfileRequestEventListeners();
                    } else {
                        profileRequestsList.innerHTML = '<div class="profile-requests-empty"><i class="fas fa-inbox"></i><p>No profile requests found.</p></div>';
                    }
                });
        })
        .catch((error) => {
            console.error('Error fetching profile requests:', error);
            profileRequestsList.innerHTML = '<div class="profile-requests-error">Error loading profile requests. Please try again.</div>';
        });

    // Set up refresh button event listener
    const refreshRequestsBtn = document.getElementById('refresh-requests-btn');
    if (refreshRequestsBtn) {
        // Remove existing event listeners by cloning and replacing the button
        const newRefreshBtn = refreshRequestsBtn.cloneNode(true);
        refreshRequestsBtn.parentNode.replaceChild(newRefreshBtn, refreshRequestsBtn);

        // Add new event listener
        newRefreshBtn.addEventListener('click', function () {
            showAlert('Refreshing profile requests...', 'info');
            initProfileRequestsSection();
        });
    }
}


function hydrateProfileRequestAvatars(container) {
    if (!container) return;
    const images = container.querySelectorAll('img[data-photo-url]');
    images.forEach(img => {
        if (img.dataset.photoHydrated === 'true') return;
        img.dataset.photoHydrated = 'true';
        const photoUrl = img.dataset.photoUrl;
        const cacheKey = img.dataset.cacheKey || photoUrl;
        const avatar = img.closest('.request-avatar');

        img.addEventListener('load', () => {
            if (avatar) avatar.classList.add('has-photo');
        });
        img.addEventListener('error', () => {
            if (avatar) avatar.classList.remove('has-photo');
        });

        if (!photoUrl) return;
        if (typeof window.applyEncryptedPhotoToImg === 'function') {
            window.applyEncryptedPhotoToImg(img, photoUrl, cacheKey);
        } else {
            img.src = photoUrl;
        }

        if (!img.dataset.previewBound) {
            img.dataset.previewBound = 'true';
            img.classList.add('request-avatar-img');
            img.style.cursor = 'pointer';
            img.addEventListener('click', (event) => {
                event.stopPropagation();
                showProfilePhotoPreview(photoUrl, cacheKey, img.getAttribute('alt') || 'Profile photo');
            });
        }
    });
}

function showProfilePhotoPreview(photoUrl, cacheKey, altText) {
    if (!photoUrl) return;
    const popupContainer = document.createElement('div');
    popupContainer.className = 'popup-container';
    popupContainer.style.position = 'fixed';
    popupContainer.style.top = '0';
    popupContainer.style.left = '0';
    popupContainer.style.width = '100%';
    popupContainer.style.height = '100%';
    popupContainer.style.backgroundColor = 'rgba(15, 23, 42, 0.75)';
    popupContainer.style.display = 'flex';
    popupContainer.style.justifyContent = 'center';
    popupContainer.style.alignItems = 'center';
    popupContainer.style.zIndex = '1200';

    popupContainer.innerHTML = `
        <div class="photo-preview-modal">
            <button class="photo-preview-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
            <div class="photo-preview-frame">
                <img class="photo-preview-img" src="/api/placeholder/600/600" alt="${altText || 'Profile photo'}">
            </div>
        </div>
    `;

    document.body.appendChild(popupContainer);

    const imgEl = popupContainer.querySelector('.photo-preview-img');
    if (imgEl) {
        if (typeof window.applyEncryptedPhotoToImg === 'function') {
            window.applyEncryptedPhotoToImg(imgEl, photoUrl, cacheKey || photoUrl);
        } else {
            imgEl.src = photoUrl;
        }
    }

    const close = () => {
        if (popupContainer.parentNode) {
            popupContainer.parentNode.removeChild(popupContainer);
        }
        document.removeEventListener('keydown', handleEscape);
    };

    popupContainer.querySelectorAll('.photo-preview-close').forEach(btn => {
        btn.addEventListener('click', close);
    });

    const handleEscape = event => {
        if (event.key === 'Escape') {
            close();
        }
    };
    document.addEventListener('keydown', handleEscape);

    popupContainer.addEventListener('click', (event) => {
        if (event.target === popupContainer) {
            close();
        }
    });
}
window.showProfilePhotoPreview = showProfilePhotoPreview;


// Function to add event listeners to profile request buttons
function addProfileRequestEventListeners() {
    // View request buttons
    document.querySelectorAll('.view-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            viewProfileRequest(requestId, source);
        });
    });

    // Approve request buttons
    document.querySelectorAll('.approve-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            if (confirm('Are you sure you want to approve this request?')) {
                approveProfileRequest(requestId, source);
            }
        });
    });

    // Reject request buttons
    document.querySelectorAll('.reject-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            if (confirm('Are you sure you want to reject this request?')) {
                rejectProfileRequest(requestId, source);
            }
        });
    });

    const closeAllProfileRequestMenus = (exceptMenu) => {
        document.querySelectorAll('.more-actions-menu').forEach(menu => {
            if (menu !== exceptMenu) {
                menu.style.display = 'none';
            }
        });
    };

    document.querySelectorAll('.more-actions-btn').forEach(button => {
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            const menu = this.parentElement ? this.parentElement.querySelector('.more-actions-menu') : null;
            if (!menu) return;
            const isOpen = menu.style.display === 'block';
            closeAllProfileRequestMenus(menu);
            menu.style.display = isOpen ? 'none' : 'block';
        });
    });

    document.querySelectorAll('.revive-credit-btn').forEach(button => {
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            if (!userId) {
                showAlert('User ID missing for credit revive', 'error');
                return;
            }
            const confirmReset = confirm('Revive 1 profile update credit for this user?');
            if (!confirmReset) return;

            const db = firebase.database();
            const usedRef = db.ref(`users/${userId}/profileUpdateUsed`);
            usedRef.transaction(current => {
                const used = Number(current || 0);
                if (used <= 0) {
                    return;
                }
                return used - 1;
            }).then(result => {
                if (!result.committed) {
                    showAlert('No credits to revive', 'info');
                    return;
                }
                showAlert('Revived 1 profile update credit', 'success');
            }).catch(error => {
                showAlert(`Error reviving credit: ${error.message}`, 'error');
            });

            const menu = this.closest('.more-actions-menu');
            if (menu) menu.style.display = 'none';
        });
    });

    if (!window.profileRequestMenuListenerAttached) {
        window.profileRequestMenuListenerAttached = true;
        document.addEventListener('click', () => {
            closeAllProfileRequestMenus();
        });
    }
}

// Function to view profile request details
function viewProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                showAlert('Request not found', 'error');
                return;
            }

            const request = snapshot.val();

            // Create popup container
            const popupContainer = document.createElement('div');
            popupContainer.className = 'popup-container';
            popupContainer.style.position = 'fixed';
            popupContainer.style.top = '0';
            popupContainer.style.left = '0';
            popupContainer.style.width = '100%';
            popupContainer.style.height = '100%';
            popupContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            popupContainer.style.display = 'flex';
            popupContainer.style.justifyContent = 'center';
            popupContainer.style.alignItems = 'center';
            popupContainer.style.zIndex = '1000';

            // Format date
            const date = new Date(request.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

            const changeItems = [];
            if (source === 'profile_update_requests' && request.requestedData) {
                for (const field in request.requestedData) {
                    const currentValue = request.currentData && request.currentData[field] ? request.currentData[field] : 'Not set';
                    if (currentValue !== request.requestedData[field]) {
                        changeItems.push({ field, from: currentValue, to: request.requestedData[field] });
                    }
                }
            } else if (request.changes) {
                for (const field in request.changes) {
                    const currentValue = request.currentData && request.currentData[field] ? request.currentData[field] : 'Not set';
                    if (currentValue !== request.changes[field]) {
                        changeItems.push({ field, from: currentValue, to: request.changes[field] });
                    }
                }
            }

            let changesHtml = '';
            if (changeItems.length) {
                const fieldLabels = {
                    department: 'Branch / Department',
                    branch: 'Branch / Department',
                    bloodGroup: 'Blood Group',
                    blood: 'Blood Group',
                    academicBatch: 'Academic Batch',
                    batch: 'Academic Batch',
                    classRoll: 'Class Roll',
                    univRoll: 'University Roll',
                    phone: 'Phone Number',
                    emergencyContact: 'Emergency Contact',
                    profilePhoto: 'Profile Photo',
                    section: 'Section'
                };

                const rows = changeItems.map(change => {
                    let fromDisplay = change.from;
                    let toDisplay = change.to;
                    const fieldLabel = fieldLabels[change.field] || change.field;

                    if (change.field === 'profilePhoto') {
                        fromDisplay = change.from && change.from !== 'Not set'
                            ? `<img src="${change.from}" alt="Current" style="width:48px;height:48px;border-radius:50%;object-fit:cover;vertical-align:middle;border:2px solid #cbd5e1;">`
                            : '<span style="color:#94a3b8;font-style:italic;">Not set</span>';
                        toDisplay = change.to
                            ? `<img src="${change.to}" alt="Requested" style="width:48px;height:48px;border-radius:50%;object-fit:cover;vertical-align:middle;border:2.5px solid #4f46e5;box-shadow:0 4px 12px rgba(79,70,229,0.25);">`
                            : '<span style="color:#94a3b8;font-style:italic;">None</span>';
                    }
                    return `
                    <li style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:8px;border:1px solid #e2e8f0;">
                        <span class="change-field" style="font-weight:600;color:#334155;min-width:140px;">${fieldLabel}</span>
                        <div style="display:flex;align-items:center;gap:12px;flex:1;justify-content:flex-end;">
                            <span class="change-from" style="color:#64748b;font-size:0.88rem;">${fromDisplay}</span>
                            <span class="change-arrow" style="color:#94a3b8;"><i class="fas fa-arrow-right"></i></span>
                            <span class="change-to" style="font-weight:600;color:#0f172a;font-size:0.88rem;">${toDisplay}</span>
                        </div>
                    </li>
                `;
                }).join('');
                changesHtml = `
                    <div class="profile-request-popup__changes">
                        <div class="profile-request-popup__section-title">Requested Changes</div>
                        <ul style="list-style:none;padding:0;margin:10px 0;">${rows}</ul>
                    </div>
                `;
            }

            if (source === 'device_unlock_requests') {
                changesHtml = `
                    <div class="profile-request-popup__changes">
                        <div class="profile-request-popup__section-title" style="display:flex;align-items:center;gap:6px;"><i class="fas fa-shield-halved" style="color:#0284c7;"></i> Device Transfer & Unlock</div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-top:10px;">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.88rem;">
                                <div><strong style="color:#64748b;">Operating System:</strong> <div style="font-weight:600;color:#0f172a;margin-top:2px;">${request.platform || 'Unknown OS'}</div></div>
                                <div><strong style="color:#64748b;">Browser Engine:</strong> <div style="font-weight:600;color:#0f172a;margin-top:2px;">${request.browser || 'Unknown Browser'}</div></div>
                                <div style="grid-column:1 / -1;"><strong style="color:#64748b;">Hardware Fingerprint:</strong> <div style="font-family:monospace;font-size:0.8rem;background:#e2e8f0;padding:6px 10px;border-radius:6px;margin-top:4px;word-break:break-all;">${request.deviceFingerprint || 'Unknown Fingerprint'}</div></div>
                            </div>
                            <div style="margin-top:12px;font-size:0.82rem;color:#475569;background:#e0f2fe;border:1px solid #bae6fd;padding:8px 12px;border-radius:8px;">
                                <i class="fas fa-info-circle" style="color:#0284c7;"></i> Approving this request will unlink the student's previous device lock and bind their session to this hardware device.
                            </div>
                        </div>
                    </div>
                `;
            }

            const userName = request.userName || request.name || '';
            const userEmail = request.userEmail || request.email || '';
            const fallbackName = request.userId ? `User ${request.userId.slice(0, 6)}` : 'User';
            const displayName = userName || fallbackName;
            const displayEmail = userEmail || 'Email unavailable';
            const initials = (userName || userEmail || request.userId || 'U')
                .split(' ')
                .map(part => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

            const userDisplay = `
                <div class="profile-request-popup__user-card">
                    <div class="profile-request-popup__avatar">${initials}</div>
                    <div>
                        <div class="profile-request-popup__user-name">${displayName}</div>
                        <div class="profile-request-popup__user-email">${displayEmail}</div>
                    </div>
                </div>
            `;

            let statusClass = 'status-pending';
            if (request.status === 'approved') {
                statusClass = 'status-approved';
            } else if (request.status === 'rejected') {
                statusClass = 'status-rejected';
            }

            const statusText = request.status || 'pending';
            const requestType = request.requestType || (source === 'profile_update_requests' ? 'Profile Update' : 'Other Request');

            // Create popup content - redesigned layout
            popupContainer.innerHTML = `
                <div class="profile-request-popup">
                    <div class="profile-request-popup__header">
                        <div>
                            <div class="profile-request-popup__title">Profile Request Details</div>
                            <div class="profile-request-popup__subtitle">${requestType}</div>
                        </div>
                        <button class="close-popup-btn profile-request-popup__close" aria-label="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="profile-request-popup__meta">
                        <div class="profile-request-popup__user">
                            ${userDisplay}
                        </div>
                        <div class="profile-request-popup__chips">
                            <span class="status-pill ${statusClass}">${statusText}</span>
                            <span class="profile-request-popup__chip"><i class="fas fa-calendar"></i> ${formattedDate}</span>
                        </div>
                    </div>
                    <div class="profile-request-popup__body">
                        ${changesHtml || '<div class="profile-request-popup__empty">No changes were detected.</div>'}
                    </div>
                    <div class="profile-request-popup__footer">
                        <button class="see-details-btn action-btn-ghost">
                            <i class="fas fa-user"></i> See Details
                        </button>
                        <div class="profile-request-popup__actions">
                            <button class="close-popup-btn action-btn-ghost">Close</button>
                            ${request.status === 'pending' ? `
                                <button class="approve-popup-btn action-btn-approve"><i class="fas fa-check"></i> Approve</button>
                                <button class="reject-popup-btn action-btn-reject"><i class="fas fa-times"></i> Reject</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;

            // Add popup to body
            document.body.appendChild(popupContainer);

            if ((!userName || !userEmail) && request.userId) {
                firebase.database().ref(`users/${request.userId}`).once('value')
                    .then(userSnapshot => {
                        if (!userSnapshot.exists()) return;
                        const data = userSnapshot.val() || {};
                        const resolvedName = userName || data.name || data.displayName || (data.email ? data.email.split('@')[0] : '');
                        const resolvedEmail = userEmail || data.email || '';

                        if (resolvedName) {
                            const nameEl = popupContainer.querySelector('.profile-request-popup__user-name');
                            if (nameEl) nameEl.textContent = resolvedName;
                        }
                        if (resolvedEmail) {
                            const emailEl = popupContainer.querySelector('.profile-request-popup__user-email');
                            if (emailEl) emailEl.textContent = resolvedEmail;
                        }
                        if (resolvedName || resolvedEmail) {
                            const initialsBase = resolvedName || resolvedEmail || request.userId || 'U';
                            const initialsUpdate = initialsBase.split(' ')
                                .map(part => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase();
                            const avatarEl = popupContainer.querySelector('.profile-request-popup__avatar');
                            if (avatarEl) avatarEl.textContent = initialsUpdate;
                        }
                    })
                    .catch(() => { });
            }

            // Close popup buttons
            popupContainer.querySelectorAll('.close-popup-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    document.body.removeChild(popupContainer);
                });
            });

            // See details button
            const seeDetailsBtn = popupContainer.querySelector('.see-details-btn');
            if (seeDetailsBtn) {
                seeDetailsBtn.addEventListener('click', function () {
                    showUserDetails(request.userId);
                });
            }

            // Approve button in popup
            const approveBtn = popupContainer.querySelector('.approve-popup-btn');
            if (approveBtn) {
                approveBtn.addEventListener('click', function () {
                    if (confirm('Are you sure you want to approve this request?')) {
                        approveProfileRequest(requestId, source);
                        document.body.removeChild(popupContainer);
                    }
                });
            }

            // Reject button in popup
            const rejectBtn = popupContainer.querySelector('.reject-popup-btn');
            if (rejectBtn) {
                rejectBtn.addEventListener('click', function () {
                    if (confirm('Are you sure you want to reject this request?')) {
                        rejectProfileRequest(requestId, source);
                        document.body.removeChild(popupContainer);
                    }
                });
            }

            // Close popup when clicking outside
            popupContainer.addEventListener('click', function (e) {
                if (e.target === popupContainer) {
                    document.body.removeChild(popupContainer);
                }
            });
        })
        .catch((error) => {
            console.error('Error fetching request details:', error);
            showAlert('Error loading request details', 'error');
        });
}

// Function to approve profile request
function approveProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const request = snapshot.val();

                // Update request status
                requestRef.update({
                    status: 'approved',
                    approvedAt: Date.now(),
                    approvedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
                })
                    .then(() => {
                        if (source === 'device_unlock_requests') {
                            const newDevice = request.deviceFingerprint || null;
                            const targetUserId = request.userId || requestId;
                            const userRef = firebase.database().ref('users/' + targetUserId);
                            userRef.update({
                                registeredDeviceId: newDevice,
                                deviceFingerprint: newDevice,
                                deviceLockUpdated: Date.now()
                            }).then(() => {
                                return firebase.database().ref('notifications').push({
                                    recipientType: 'specific',
                                    recipients: [targetUserId],
                                    type: 'device_unlocked',
                                    header: 'Device Unlock Approved',
                                    body: 'Your device transfer request has been approved by the Admin. You can now log in securely.',
                                    timestamp: firebase.database.ServerValue.TIMESTAMP
                                }).catch(() => {});
                            }).then(() => {
                                showAlert('Device transfer request approved and unlocked', 'success');
                                initProfileRequestsSection();
                            }).catch((err) => {
                                console.error('Error approving device unlock:', err);
                                showAlert('Error updating device binding: ' + err.message, 'error');
                            });
                            return;
                        }

                        // Apply changes to user profile with synchronized field aliases
                        if (source === 'profile_update_requests' && request.userId && request.requestedData) {
                            const userRef = firebase.database().ref('users/' + request.userId);
                            const updatePayload = { ...request.requestedData, updatedAt: Date.now() };
                            if (updatePayload.department && !updatePayload.branch) updatePayload.branch = updatePayload.department;
                            if (updatePayload.branch && !updatePayload.department) updatePayload.department = updatePayload.branch;
                            if (updatePayload.academicBatch && !updatePayload.batch) updatePayload.batch = updatePayload.academicBatch;
                            if (updatePayload.batch && !updatePayload.academicBatch) updatePayload.academicBatch = updatePayload.batch;
                            if (updatePayload.bloodGroup && !updatePayload.blood) updatePayload.blood = updatePayload.bloodGroup;
                            if (updatePayload.blood && !updatePayload.bloodGroup) updatePayload.bloodGroup = updatePayload.blood;

                            userRef.update(updatePayload)
                                .then(() => {
                                    showAlert('Request approved and profile updated', 'success');
                                    initProfileRequestsSection(); // Refresh the list
                                })
                                .catch((error) => {
                                    console.error('Error updating user profile:', error);
                                    showAlert('Request approved but error updating profile', 'warning');
                                    initProfileRequestsSection(); // Refresh the list
                                });
                        } else if (request.userId && request.changes) {
                            const userRef = firebase.database().ref('users/' + request.userId);
                            const updatePayload = { ...request.changes, updatedAt: Date.now() };
                            if (updatePayload.department && !updatePayload.branch) updatePayload.branch = updatePayload.department;
                            if (updatePayload.branch && !updatePayload.department) updatePayload.department = updatePayload.branch;
                            if (updatePayload.academicBatch && !updatePayload.batch) updatePayload.batch = updatePayload.academicBatch;
                            if (updatePayload.batch && !updatePayload.academicBatch) updatePayload.academicBatch = updatePayload.batch;
                            if (updatePayload.bloodGroup && !updatePayload.blood) updatePayload.blood = updatePayload.bloodGroup;
                            if (updatePayload.blood && !updatePayload.bloodGroup) updatePayload.bloodGroup = updatePayload.blood;

                            userRef.update(updatePayload)
                                .then(() => {
                                    showAlert('Request approved and profile updated', 'success');
                                    initProfileRequestsSection(); // Refresh the list
                                })
                                .catch((error) => {
                                    console.error('Error updating user profile:', error);
                                    showAlert('Request approved but error updating profile', 'warning');
                                    initProfileRequestsSection(); // Refresh the list
                                });
                        } else {
                            showAlert('Request approved successfully', 'success');
                            initProfileRequestsSection(); // Refresh the list
                        }
                    })
                    .catch((error) => {
                        console.error('Error approving request:', error);
                        showAlert('Error approving request', 'error');
                    });
            } else {
                showAlert('Request not found', 'error');
            }
        })
        .catch((error) => {
            console.error('Error fetching request:', error);
            showAlert('Error approving request', 'error');
        });
}

// Function to reject profile request
function rejectProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.update({
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
    })
        .then(() => {
            if (source === 'device_unlock_requests') {
                const targetUserId = requestId;
                firebase.database().ref('notifications').push({
                    recipientType: 'specific',
                    recipients: [targetUserId],
                    type: 'device_rejected',
                    header: 'Device Transfer Declined',
                    body: 'Your device transfer request was reviewed and declined by the Admin.',
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                }).catch(() => {});
            }
            showAlert('Request rejected successfully', 'success');
            initProfileRequestsSection(); // Refresh the list
        })
        .catch((error) => {
            console.error('Error rejecting request:', error);
            showAlert('Error rejecting request', 'error');
        });
}

// Function to show complete user details with editing, Face ID biometrics management, and Digital ID preview
function showUserDetails(userId) {
    if (!userId) return;

    firebase.database().ref(`users/${userId}`).once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                showAlert('User not found', 'warning');
                return;
            }
            const userData = snapshot.val() || {};
            const displayName = userData.name || (userData.email ? userData.email.split('@')[0] : 'User');
            const userEmail = userData.email || '';
            const photoUrl = userData.profilePhoto || userData.photoURL || '';
            const initials = displayName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U';
            const hasFaceId = !!(userData.faceDescriptor || userData.faceRegistered || userData.faceEnrolled);
            const role = (userData.role || 'student').toLowerCase();
            const branch = userData.department || userData.branch || '';
            const batch = userData.academicBatch || userData.batch || '';
            const blood = userData.bloodGroup || userData.blood || '';
            const classRoll = userData.classRoll || '';
            const univRoll = userData.univRoll || '';
            const section = userData.section || '';
            const phone = userData.phone || userData.mobile || userData.emergencyContact || '';

            const isSchoolMode = document.body.classList.contains('admin-school-mode') || window.rollCallAdminMode?.isSchool;
            const fatherName = userData.fatherName || userData.father_name || userData.fathersName || userData.father || userData.guardianName || userData.parentName || '';
            const fatherMobile = userData.fatherMobile || userData.fatherMobileNumber || userData.fatherPhone || userData.fatherContact || userData.guardianMobile || userData.guardianPhone || userData.parentMobile || '';

            const avatarHtml = photoUrl
                ? `<img src="${photoUrl}" alt="${displayName}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:3px solid #4f46e5;box-shadow:0 4px 14px rgba(79,70,229,0.3);">`
                : `<div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg, #4f46e5, #7c3aed);color:white;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;box-shadow:0 4px 14px rgba(79,70,229,0.3);">${initials}</div>`;

            const existingModal = document.getElementById('user-details-modal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = 'user-details-modal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;z-index:9999;padding:16px;box-sizing:border-box;';

            modal.innerHTML = `
                <div style="background:#ffffff;border-radius:16px;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,0.25);border:1px solid #e2e8f0;display:flex;flex-direction:column;">
                    <!-- Modal Header -->
                    <div style="padding:22px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border-radius:16px 16px 0 0;">
                        <div style="display:flex;align-items:center;gap:16px;">
                            ${avatarHtml}
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <h3 style="margin:0;font-size:1.25rem;font-weight:700;color:#0f172a;">${displayName}</h3>
                                    <span class="badge ${role === 'admin' ? 'badge-success' : 'badge-present'}" style="text-transform:capitalize;">${role}</span>
                                </div>
                                <div style="font-size:0.85rem;color:#64748b;margin-top:2px;"><i class="fas fa-envelope" style="margin-right:4px;"></i>${userEmail}</div>
                                <div style="font-size:0.75rem;color:#94a3b8;font-family:monospace;margin-top:2px;">UID: ${userId}</div>
                            </div>
                        </div>
                        <button class="close-user-details-btn" style="background:none;border:none;font-size:1.3rem;color:#94a3b8;cursor:pointer;padding:6px;border-radius:8px;line-height:1;"><i class="fas fa-times"></i></button>
                    </div>

                    <!-- Modal Body / Fields Form -->
                    <div style="padding:24px;display:flex;flex-direction:column;gap:20px;">
                        <!-- Biometrics & Security Section -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                                <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#0f172a;font-size:0.92rem;">
                                    <i class="fas fa-id-card" style="color:#4f46e5;"></i> Identity & Pass Actions
                                </div>
                                ${hasFaceId
                                    ? `<span class="badge badge-success" style="display:inline-flex;align-items:center;gap:5px;font-weight:600;"><i class="fas fa-circle-check"></i> Enrolled</span>`
                                    : `<span class="badge badge-warning" style="display:inline-flex;align-items:center;gap:5px;font-weight:600;"><i class="fas fa-clock"></i> Not Enrolled</span>`
                                }
                            </div>
                            <p style="margin:0 0 12px;font-size:0.82rem;color:#64748b;">
                                View student digital pass or manage identification settings.
                            </p>
                            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                <button type="button" class="primary-btn" onclick="showStudentDigitalId('${userId}')" style="font-size:0.82rem;padding:7px 14px;">
                                    <i class="fas fa-id-card"></i> View Digital ID Pass
                                </button>
                                ${isSchoolMode ? '' : `
                                <button type="button" class="secondary-btn" onclick="generateFaceIdToken('${userId}')" style="font-size:0.82rem;padding:7px 14px;">
                                    <i class="fas fa-key"></i> ${hasFaceId ? 'Re-enroll Face ID' : 'Generate Registration Link'}
                                </button>
                                ${hasFaceId ? `
                                <button type="button" class="secondary-btn" onclick="resetStudentFaceId('${userId}')" style="font-size:0.82rem;padding:7px 14px;color:#d97706;">
                                    <i class="fas fa-undo"></i> Reset Face ID
                                </button>` : ''}`}
                            </div>

                            ${isSchoolMode ? '' : `
                            <!-- Hardware & Single-Device Lock Section -->
                            <div style="margin-top:14px;padding-top:14px;border-top:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                                <div>
                                    <div style="font-weight:600;font-size:0.86rem;color:#0f172a;display:flex;align-items:center;gap:6px;">
                                        <i class="fas fa-mobile-screen" style="color:#0284c7;"></i> Hardware & Single-Device Lock
                                    </div>
                                    <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">
                                        ${(userData.registeredDeviceId || userData.deviceFingerprint)
                                            ? `Device Bound: <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:0.75rem;color:#1e293b;">${(userData.registeredDeviceId || userData.deviceFingerprint).slice(0, 18)}...</code>`
                                            : 'No device bound. Student can log in and pair from any device.'}
                                    </div>
                                </div>
                                <div style="display:flex;gap:8px;">
                                    ${(userData.registeredDeviceId || userData.deviceFingerprint) ? `
                                    <button type="button" class="secondary-btn" onclick="resetStudentDeviceLock('${userId}')" style="font-size:0.82rem;padding:6px 12px;color:#dc2626;border-color:#fca5a5;">
                                        <i class="fas fa-trash-can"></i> Reset Device Lock
                                    </button>` : `
                                    <span class="badge badge-success" style="font-size:0.75rem;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-lock-open"></i> Device Unlocked</span>
                                    `}
                                </div>
                            </div>
                            `}
                        </div>

                        <!-- Editable Academic & Identity Information -->
                        <div>
                            <div style="font-weight:700;color:#0f172a;font-size:0.95rem;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-user-edit" style="color:#0284c7;"></i> Academic & Identity Information
                            </div>
                            <form id="edit-user-details-form" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Full Name</label>
                                    <input type="text" id="detail-name" value="${displayName.replace(/"/g, '&quot;')}" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Branch / Department / Class</label>
                                    <input type="text" id="detail-branch" value="${branch.replace(/"/g, '&quot;')}" placeholder="e.g. Class 10 or Computer Science" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Academic Batch</label>
                                    <input type="text" id="detail-batch" value="${batch.replace(/"/g, '&quot;')}" placeholder="e.g. 2024-2025" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Blood Group</label>
                                    <input type="text" id="detail-blood" value="${blood.replace(/"/g, '&quot;')}" placeholder="e.g. O+, B+, A+" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Class Roll</label>
                                    <input type="text" id="detail-class-roll" value="${classRoll.replace(/"/g, '&quot;')}" placeholder="Class Roll" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">University / Registration Roll</label>
                                    <input type="text" id="detail-univ-roll" value="${univRoll.replace(/"/g, '&quot;')}" placeholder="Univ Roll" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Section</label>
                                    <input type="text" id="detail-section" value="${section.replace(/"/g, '&quot;')}" placeholder="e.g. A, B, General" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Emergency Contact / Student Phone</label>
                                    <input type="text" id="detail-phone" value="${phone.replace(/"/g, '&quot;')}" placeholder="+91 ..." style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Father / Guardian Name</label>
                                    <input type="text" id="detail-father-name" value="${fatherName.replace(/"/g, '&quot;')}" placeholder="Father or Guardian Name" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                                <div>
                                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:4px;">Father / Guardian Mobile</label>
                                    <input type="text" id="detail-father-mobile" value="${fatherMobile.replace(/"/g, '&quot;')}" placeholder="+91 ..." style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.88rem;box-sizing:border-box;">
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Modal Footer -->
                    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border-radius:0 0 16px 16px;">
                        <button type="button" class="secondary-btn close-user-details-btn"><i class="fas fa-times"></i> Close</button>
                        <button type="button" id="save-user-details-btn" class="primary-btn" style="padding:8px 20px;"><i class="fas fa-save"></i> Save Changes</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const closeModal = () => modal.remove();
            modal.querySelectorAll('.close-user-details-btn').forEach(b => b.addEventListener('click', closeModal));
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

            // Save updates handler
            const saveBtn = modal.querySelector('#save-user-details-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const newName = modal.querySelector('#detail-name').value.trim();
                    const newBranch = modal.querySelector('#detail-branch').value.trim();
                    const newBatch = modal.querySelector('#detail-batch').value.trim();
                    const newBlood = modal.querySelector('#detail-blood').value.trim();
                    const newCRoll = modal.querySelector('#detail-class-roll').value.trim();
                    const newURoll = modal.querySelector('#detail-univ-roll').value.trim();
                    const newSec = modal.querySelector('#detail-section').value.trim();
                    const newPhone = modal.querySelector('#detail-phone').value.trim();
                    const newFatherName = modal.querySelector('#detail-father-name')?.value.trim() || '';
                    const newFatherMobile = modal.querySelector('#detail-father-mobile')?.value.trim() || '';

                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                    const updateData = {
                        name: newName,
                        department: newBranch,
                        branch: newBranch,
                        academicBatch: newBatch,
                        batch: newBatch,
                        bloodGroup: newBlood,
                        blood: newBlood,
                        classRoll: newCRoll,
                        univRoll: newURoll,
                        section: newSec,
                        phone: newPhone,
                        emergencyContact: newPhone,
                        fatherName: newFatherName,
                        father_name: newFatherName,
                        fatherMobile: newFatherMobile,
                        fatherPhone: newFatherMobile,
                        updatedAt: Date.now()
                    };

                    firebase.database().ref(`users/${userId}`).update(updateData)
                        .then(() => {
                            showAlert('Student profile updated successfully!', 'success');
                            closeModal();
                            if (typeof loadUsers === 'function') loadUsers();
                        })
                        .catch((err) => {
                            console.error('Error saving user profile:', err);
                            showAlert('Failed to update profile: ' + err.message, 'error');
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                        });
                });
            }
        })
        .catch((error) => {
            console.error('Error fetching user details:', error);
            showAlert('Error loading user details: ' + error.message, 'error');
        });
}
window.showUserDetails = showUserDetails;

// Function to reset student hardware / single-device lock
function resetStudentDeviceLock(userId) {
    if (!userId) return;
    if (!confirm('Are you sure you want to unlink and reset the hardware lock for this student? They will be able to log in from a new device.')) {
        return;
    }
    firebase.database().ref(`users/${userId}`).update({
        registeredDeviceId: null,
        deviceFingerprint: null,
        deviceLock: null,
        deviceResetAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        return firebase.database().ref(`device_unlock_requests/${userId}`).remove().catch(() => {});
    }).then(() => {
        showAlert('Hardware device lock reset successfully! Student can now register their new device.', 'success');
        const modal = document.getElementById('user-details-modal');
        if (modal) {
            showUserDetails(userId);
        }
    }).catch((err) => {
        console.error('Error resetting device lock:', err);
        showAlert('Failed to reset device lock: ' + err.message, 'error');
    });
}
window.resetStudentDeviceLock = resetStudentDeviceLock;

// Function to generate Face ID Registration token for a student
function generateFaceIdToken(userId) {
    if (!userId) return;

    firebase.database().ref(`users/${userId}`).once('value').then(snapshot => {
        if (!snapshot.exists()) {
            showAlert('User not found', 'warning');
            return;
        }
        const user = snapshot.val() || {};
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let accessToken = '';
        for (let i = 0; i < 32; i++) {
            accessToken += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        accessToken += '_' + Date.now();

        const tokenData = {
            uid: userId,
            email: user.email || '',
            name: user.name || '',
            classRoll: user.classRoll || '',
            univRoll: user.univRoll || '',
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };

        firebase.database().ref(`faceRegistrationTokens/${accessToken}`).set(tokenData)
            .then(() => {
                const regUrl = window.location.origin + window.location.pathname.replace(/\/admin\/.*$|\/admin\/?$/, '/student/face-attendance.html?token=' + accessToken);

                const existingModal = document.getElementById('face-token-modal');
                if (existingModal) existingModal.remove();

                const tokenModal = document.createElement('div');
                tokenModal.id = 'face-token-modal';
                tokenModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;';

                tokenModal.innerHTML = `
                    <div style="background:#ffffff;border-radius:16px;width:100%;max-width:540px;box-shadow:0 20px 40px rgba(0,0,0,0.25);border:1px solid #e2e8f0;padding:24px;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                            <div style="width:44px;height:44px;border-radius:50%;background:#e0e7ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                                <i class="fas fa-camera"></i>
                            </div>
                            <div>
                                <h3 style="margin:0;font-size:1.15rem;font-weight:700;color:#0f172a;">Face Registration Link</h3>
                                <p style="margin:2px 0 0;font-size:0.82rem;color:#64748b;">Generated for ${user.name || user.email || 'Student'}</p>
                            </div>
                        </div>

                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;">
                            <label style="display:block;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Registration URL (Valid for 24 Hours)</label>
                            <input type="text" id="face-reg-url-input" value="${regUrl}" readonly style="width:100%;padding:8px 10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;font-size:0.82rem;font-family:monospace;color:#0f172a;box-sizing:border-box;">
                        </div>

                        <div style="display:flex;gap:10px;justify-content:flex-end;">
                            <button type="button" class="secondary-btn" id="close-token-modal-btn"><i class="fas fa-times"></i> Close</button>
                            <button type="button" class="secondary-btn" id="open-face-reg-btn"><i class="fas fa-external-link-alt"></i> Open Page</button>
                            <button type="button" class="primary-btn" id="copy-face-url-btn"><i class="fas fa-copy"></i> Copy Link</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(tokenModal);

                const closeFn = () => tokenModal.remove();
                tokenModal.querySelector('#close-token-modal-btn').addEventListener('click', closeFn);
                tokenModal.addEventListener('click', (e) => { if (e.target === tokenModal) closeFn(); });

                tokenModal.querySelector('#copy-face-url-btn').addEventListener('click', () => {
                    const urlInput = tokenModal.querySelector('#face-reg-url-input');
                    urlInput.select();
                    navigator.clipboard.writeText(urlInput.value).then(() => {
                        showAlert('Face Registration link copied to clipboard!', 'success');
                    }).catch(() => {
                        document.execCommand('copy');
                        showAlert('Face Registration link copied to clipboard!', 'success');
                    });
                });

                tokenModal.querySelector('#open-face-reg-btn').addEventListener('click', () => {
                    window.open(regUrl, '_blank');
                });
            })
            .catch(err => {
                showAlert('Failed to generate registration token: ' + err.message, 'error');
            });
    });
}
window.generateFaceIdToken = generateFaceIdToken;

// Function to reset Face ID for a student
function resetStudentFaceId(userId) {
    if (!userId) return;
    if (!confirm('Are you sure you want to reset Face ID for this student? Their biometric vectors will be removed and they will need to re-enroll.')) {
        return;
    }

    const updates = {
        faceDescriptor: null,
        faceRegistered: null,
        faceEnrolled: null,
        faceUpdatedAt: Date.now()
    };

    firebase.database().ref(`users/${userId}`).update(updates)
        .then(() => {
            showAlert('Face ID biometrics successfully reset', 'success');
            const detailsModal = document.getElementById('user-details-modal');
            if (detailsModal) {
                detailsModal.remove();
                showUserDetails(userId);
            }
            if (typeof loadUsers === 'function') loadUsers();
        })
        .catch(err => {
            showAlert('Failed to reset Face ID: ' + err.message, 'error');
        });
}
window.resetStudentFaceId = resetStudentFaceId;

// Function to preview Student's Digital ID Card Pass with live data, school isolation & father details
function showStudentDigitalId(userId) {
    if (!userId) return;

    const esc = (val) => String(val ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    const userRef = firebase.database().ref(`users/${userId}`);
    const blockedRef = firebase.database().ref(`blockedUsers/${userId}`);

    Promise.all([
        userRef.once('value'),
        blockedRef.once('value')
    ]).then(async ([snapshot, blockedSnapshot]) => {
        if (!snapshot.exists()) {
            showAlert('User not found', 'warning');
            return;
        }
        const user = snapshot.val() || {};
        const studentSchoolId = String(user.schoolId || '').trim();

        // Enforce School Isolation
        let effectiveAdminSchoolId = String(window.rollCallAdminMode?.schoolId || (typeof currentUser !== 'undefined' ? currentUser?.schoolId : '') || '').trim();
        if (!effectiveAdminSchoolId && firebase.auth().currentUser) {
            try {
                const adminSnap = await firebase.database().ref(`users/${firebase.auth().currentUser.uid}`).once('value');
                effectiveAdminSchoolId = String(adminSnap.val()?.schoolId || '').trim();
            } catch (e) {}
        }

        if (effectiveAdminSchoolId && studentSchoolId && studentSchoolId !== effectiveAdminSchoolId) {
            showAlert('Access restricted: Student belongs to another school.', 'error');
            return;
        }

        // School Blocked Isolation Check
        const blockedData = blockedSnapshot.exists() ? (blockedSnapshot.val() || {}) : {};
        const blockedSchoolId = String(blockedData.schoolId || user.blockedSchoolId || '').trim();
        const isBlocked = !!(
            (user.blocked && (!user.blockedSchoolId || !effectiveAdminSchoolId || user.blockedSchoolId === effectiveAdminSchoolId)) ||
            (blockedSnapshot.exists() && (!blockedSchoolId || !effectiveAdminSchoolId || blockedSchoolId === effectiveAdminSchoolId))
        );
        const blockReason = blockedData.reason || user.blockedReason || 'Account restricted by school administration';

        // Dynamically resolve actual school name (never show hardcoded INSTITUTE OF TECHNOLOGY)
        const targetSchoolId = studentSchoolId || effectiveAdminSchoolId;
        let loadedSchoolName = '';
        if (targetSchoolId) {
            try {
                const schoolSnap = await firebase.database().ref(`schools/${targetSchoolId}`).once('value');
                if (schoolSnap.exists()) {
                    const sData = schoolSnap.val() || {};
                    loadedSchoolName = sData.name || sData.schoolName || '';
                }
            } catch (e) {}
        }

        const isSchoolMode = document.body.classList.contains('admin-school-mode') || window.rollCallAdminMode?.isSchool;
        const defaultSchoolName = isSchoolMode ? 'ROLLCALL SCHOOL' : 'CAMPUS ACADEMY';
        const rawSchoolName = user.schoolName || loadedSchoolName || user.school || user.institutionName || user.institution || user.collegeName || defaultSchoolName;
        const instName = String(rawSchoolName).trim().toUpperCase();

        const displayName = user.name || (user.email ? user.email.split('@')[0] : 'Student');
        const courseDisplay = isSchoolMode
            ? (user.className || user.courseName || user.course || user.department || 'School Student')
            : (user.course || user.department || user.branch || 'Undergraduate Student');
        const defaultAvatar = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/person-1824144_960_720.png';
        const photoUrl = user.profilePhoto || user.photoURL || defaultAvatar;
        const univRoll = user.univRoll || 'Not Set';
        const classRoll = user.classRoll || 'Not Set';
        const section = user.section ? `Sec ${user.section}` : 'N/A';
        const blood = user.bloodGroup || user.blood || 'Not Provided';
        const emergency = user.emergencyContact || user.phone || 'Not Provided';

        const fatherName = user.fatherName || user.father_name || user.fathersName || user.father || user.guardianName || user.parentName || 'Not Provided';
        const fatherMobile = user.fatherMobile || user.fatherMobileNumber || user.fatherPhone || user.fatherContact || user.guardianMobile || user.guardianPhone || user.parentMobile || 'Not Provided';

        let validThru = user.academicBatch || user.batch;
        if (validThru) {
            const match = String(validThru).match(/\d{4}$/);
            if (match) validThru = match[0];
        } else {
            validThru = (new Date().getFullYear() + 4).toString();
        }

        const qrPayload = isSchoolMode
            ? `ROLLCALL-PASS|TYPE:SCHOOL|UID:${userId}|NAME:${displayName}|CLASS:${courseDisplay}|ROLL:${classRoll}|SECTION:${user.section || ''}`
            : `ROLLCALL-PASS|UID:${userId}|NAME:${displayName}|UNIV:${univRoll}|ROLL:${classRoll}|BATCH:${validThru}`;

        const existingModal = document.getElementById('admin-digital-id-modal');
        if (existingModal) existingModal.remove();

        const idModal = document.createElement('div');
        idModal.id = 'admin-digital-id-modal';
        idModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.8);backdrop-filter:blur(6px);display:flex;justify-content:center;align-items:center;z-index:10001;padding:16px;box-sizing:border-box;perspective:1000px;';

        idModal.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
                <!-- Flip card wrapper -->
                <div id="admin-id-flipper" style="width:340px;min-height:530px;position:relative;transform-style:preserve-3d;transition:transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);cursor:pointer;">
                    <!-- FRONT FACE -->
                    <div style="position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:20px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);background:linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%);color:white;display:flex;flex-direction:column;padding:22px;box-sizing:border-box;border:1px solid rgba(255,255,255,0.15);">
                        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:12px;">
                            <div style="max-width:240px;">
                                <div style="font-size:0.65rem;letter-spacing:1.5px;color:#a5b4fc;font-weight:700;">${isSchoolMode ? 'SCHOOL PASS' : 'ROLLCALL PASS'}</div>
                                <div style="font-size:0.8rem;font-weight:800;color:#ffffff;letter-spacing:0.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(instName)}">${esc(instName)}</div>
                            </div>
                            <div style="width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(245,158,11,0.4);">
                                <i class="fas ${isSchoolMode ? 'fa-school' : 'fa-microchip'}" style="color:#78350f;font-size:0.85rem;"></i>
                            </div>
                        </div>

                        <div style="display:flex;flex-direction:column;align-items:center;margin:16px 0 12px;">
                            <div style="width:92px;height:92px;border-radius:50%;overflow:hidden;border:3px solid ${isBlocked ? '#ef4444' : '#818cf8'};box-shadow:0 8px 24px rgba(0,0,0,0.4);margin-bottom:8px;">
                                <img src="${esc(photoUrl)}" alt="${esc(displayName)}" style="width:100%;height:100%;object-fit:cover;">
                            </div>
                            <div style="font-size:1.15rem;font-weight:800;color:#ffffff;text-align:center;line-height:1.2;">${esc(displayName)}</div>
                            <div style="font-size:0.75rem;color:#c7d2fe;font-weight:600;margin-top:3px;text-align:center;">${esc(courseDisplay)}</div>
                            ${isBlocked ? `
                            <div style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#ffffff;font-size:0.68rem;font-weight:700;padding:3px 10px;border-radius:6px;margin-top:6px;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 8px rgba(220,38,38,0.5);letter-spacing:0.5px;">
                                <i class="fas fa-ban"></i> ACCESS RESTRICTED / BLOCKED
                            </div>` : ''}
                        </div>

                        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.75rem;">
                            <div>
                                <div style="color:#94a3b8;font-size:0.65rem;font-weight:600;text-transform:uppercase;">${isSchoolMode ? 'Admission / Reg' : 'Univ Roll'}</div>
                                <div style="color:#ffffff;font-weight:700;font-size:0.82rem;">${esc(univRoll)}</div>
                            </div>
                            <div>
                                <div style="color:#94a3b8;font-size:0.65rem;font-weight:600;text-transform:uppercase;">Class Roll</div>
                                <div style="color:#ffffff;font-weight:700;font-size:0.82rem;">${esc(classRoll)}</div>
                            </div>
                            <div>
                                <div style="color:#94a3b8;font-size:0.65rem;font-weight:600;text-transform:uppercase;">Section</div>
                                <div style="color:#ffffff;font-weight:700;">${esc(section)}</div>
                            </div>
                            <div>
                                <div style="color:#94a3b8;font-size:0.65rem;font-weight:600;text-transform:uppercase;">Blood Group</div>
                                <div style="color:#f43f5e;font-weight:800;">${esc(blood)}</div>
                            </div>
                        </div>

                        <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.15);padding-top:10px;font-size:0.7rem;">
                            <span style="color:#94a3b8;">VALID THRU: <strong style="color:#ffffff;">${esc(validThru)}</strong></span>
                            <span style="color:#a5b4fc;font-size:0.7rem;"><i class="fas fa-sync-alt" style="margin-right:4px;"></i> Tap to flip</span>
                        </div>
                    </div>

                    <!-- BACK FACE -->
                    <div style="position:absolute;width:100%;height:100%;backface-visibility:hidden;transform:rotateY(180deg);border-radius:20px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);color:white;display:flex;flex-direction:column;padding:22px;box-sizing:border-box;border:1px solid rgba(255,255,255,0.15);text-align:center;">
                        <div style="font-size:0.75rem;font-weight:800;letter-spacing:1px;color:#c7d2fe;margin-bottom:3px;">STUDENT ACCESS VERIFICATION</div>
                        <div style="font-size:0.65rem;color:#94a3b8;margin-bottom:12px;">Scan QR for gate and campus authorization</div>

                        <div id="admin-id-qr-box" style="width:102px;height:102px;background:#ffffff;border-radius:12px;padding:6px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,0.3);">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(qrPayload)}&color=0f172a&bgcolor=ffffff" alt="ID QR" style="width:90px;height:90px;border-radius:6px;">
                        </div>

                        ${isBlocked ? `
                        <div style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:8px;padding:6px 10px;font-size:0.7rem;margin-bottom:8px;text-align:left;color:#fca5a5;">
                            <div style="font-weight:700;color:#f87171;display:flex;align-items:center;gap:4px;"><i class="fas fa-shield-halved"></i> School Block Active</div>
                            <div style="font-size:0.65rem;color:#fecaca;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Reason: ${esc(blockReason)}</div>
                        </div>` : ''}

                        <!-- FATHER / GUARDIAN DETAILS GRID -->
                        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;font-size:0.75rem;margin-bottom:8px;text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <div>
                                <div style="color:#94a3b8;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Father / Guardian</div>
                                <div style="color:#ffffff;font-weight:700;margin-top:2px;font-size:0.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(fatherName)}">${esc(fatherName)}</div>
                            </div>
                            <div>
                                <div style="color:#94a3b8;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Father Mobile</div>
                                <div style="color:#ffffff;font-weight:700;margin-top:2px;font-size:0.78rem;">${esc(fatherMobile)}</div>
                            </div>
                        </div>

                        <!-- EMERGENCY CONTACT -->
                        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;font-size:0.75rem;margin-bottom:10px;text-align:left;">
                            <div style="color:#94a3b8;font-size:0.62rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Emergency Contact</div>
                            <div style="color:#ffffff;font-weight:700;margin-top:2px;">${esc(emergency)}</div>
                        </div>

                        <div style="font-size:0.62rem;color:#94a3b8;line-height:1.4;margin-top:auto;">
                            This digital pass is the property of ${esc(instName)}. Valid with active school enrollment.
                        </div>

                        <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.15);padding-top:8px;display:flex;justify-content:space-between;font-size:0.7rem;color:#a5b4fc;">
                            <span>ID: ${userId.slice(0, 8).toUpperCase()}</span>
                            <span><i class="fas fa-sync-alt" style="margin-right:4px;"></i> Tap to flip</span>
                        </div>
                    </div>
                </div>

                <!-- Controls below card -->
                <div style="display:flex;gap:12px;">
                    <button type="button" id="admin-flip-btn" class="secondary-btn" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.25);padding:8px 16px;border-radius:8px;font-size:0.85rem;"><i class="fas fa-sync-alt"></i> Flip Card</button>
                    <button type="button" id="admin-close-id-btn" class="primary-btn" style="padding:8px 20px;border-radius:8px;font-size:0.85rem;"><i class="fas fa-times"></i> Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(idModal);

        const flipper = idModal.querySelector('#admin-id-flipper');
        let isFlipped = false;
        const toggleFlip = () => {
            isFlipped = !isFlipped;
            flipper.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
        };

        flipper.addEventListener('click', toggleFlip);
        idModal.querySelector('#admin-flip-btn').addEventListener('click', toggleFlip);

        const closeIdModal = () => idModal.remove();
        idModal.querySelector('#admin-close-id-btn').addEventListener('click', closeIdModal);
        idModal.addEventListener('click', (e) => { if (e.target === idModal) closeIdModal(); });
    }).catch(err => {
        showAlert('Failed to load Digital ID: ' + err.message, 'error');
    });
}
window.showStudentDigitalId = showStudentDigitalId;

// Alias function to maintain naming consistency
function initProfileRequests() {
    initProfileRequestsSection();
}

// ============================================================================
// STUDENT LEAVE & ON-DUTY (OD) REQUESTS MANAGEMENT
// ============================================================================
let leaveRequestsListenerAttached = false;
window.allLeaveRequests = [];
window.studentUserCache = window.studentUserCache || {};
window.leaveFilterState = {
    status: 'all',
    type: 'all',
    search: ''
};

function initLeaveRequestsSection() {
    const listContainers = document.querySelectorAll('#leave-requests-list, #leave-requests-section-active #leave-requests-list');
    if (listContainers.length === 0) return;

    listContainers.forEach(c => {
        c.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#4f46e5;margin-bottom:12px;display:block;"></i>Loading leave applications...</div>';
    });

    setupLeaveRequestsFilterListeners();

    const admin = firebase.auth().currentUser;
    if (!admin) return;
    firebase.database().ref(`users/${admin.uid}`).once('value').then(profileSnap => {
        const profile=profileSnap.val()||{};
        if (profile.role !== 'admin') throw new Error('Only school administrators can review teacher leave requests.');
        const schoolId=String(profile.schoolId||admin.uid);
        const teacherLeaveRef=firebase.database().ref(`teacher_leave_requests/${schoolId}`);
        if (!leaveRequestsListenerAttached) {
            leaveRequestsListenerAttached = true;
            teacherLeaveRef.on('value', snapshot => handleLeaveRequestsSnapshot(snapshot, schoolId), error => {
                console.error('Error listening to teacher leave requests:', error);
                showAlert('Failed to load teacher leave requests: ' + error.message, 'error');
            });
        } else {
            teacherLeaveRef.once('value').then(snapshot => handleLeaveRequestsSnapshot(snapshot, schoolId));
        }
    }).catch(error=>{ console.error('Could not determine admin school for leave inbox:',error); showAlert(error.message||'Could not load teacher leave requests.','error'); });
}

function handleLeaveRequestsSnapshot(snapshot, schoolId) {
    const data = snapshot.val() || {};
    const requests = [];
    const userFetchPromises = [];

    for (const uid in data) {
        const userLeaves = data[uid] || {};
        for (const reqId in userLeaves) {
            const reqData = userLeaves[reqId] || {};
            if (reqData.requesterRole !== 'teacher' || String(reqData.schoolId||'') !== String(schoolId)) continue;
            const item = {
                userId: uid,
                requestId: reqId,
                requestPath: `teacher_leave_requests/${schoolId}/${uid}/${reqId}`,
                requesterRole: 'teacher',
                schoolId: String(schoolId),
                type: reqData.type || 'Leave Request',
                from: reqData.from || '',
                to: reqData.to || '',
                reason: reqData.reason || 'No specific reason provided',
                status: reqData.status || 'Pending Review',
                createdAt: reqData.createdAt || reqData.timestamp || Date.now(),
                studentName: reqData.teacherName || '',
                studentRoll: reqData.teacherEmail || '',
                reviewedAt: reqData.reviewedAt || null,
                reviewedBy: reqData.reviewedBy || null,
                rejectionReason: reqData.rejectionReason || null
            };
            requests.push(item);

            if (!window.studentUserCache[uid]) {
                userFetchPromises.push(
                    firebase.database().ref(`users/${uid}`).once('value').then(snap => {
                        if (snap.exists()) {
                            window.studentUserCache[uid] = snap.val() || {};
                        }
                    }).catch(() => {})
                );
            }
        }
    }

    Promise.all(userFetchPromises).then(() => {
        requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.allLeaveRequests = requests;
        updateLeaveRequestsKpis();
        renderAdminLeaveRequests();
    });
}

function updateLeaveRequestsKpis() {
    const requests = window.allLeaveRequests || [];
    const total = requests.length;
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    requests.forEach(r => {
        const s = (r.status || '').toLowerCase();
        if (s.includes('approve')) approved++;
        else if (s.includes('reject')) rejected++;
        else pending++;
    });

    document.querySelectorAll('[id^="kpi-leave-total"]').forEach(el => el.innerText = total);
    document.querySelectorAll('[id^="kpi-leave-pending"]').forEach(el => el.innerText = pending);
    document.querySelectorAll('[id^="kpi-leave-approved"]').forEach(el => el.innerText = approved);
    document.querySelectorAll('[id^="kpi-leave-rejected"]').forEach(el => el.innerText = rejected);
    document.querySelectorAll('#leave-filter-pending-count').forEach(el => el.innerText = pending);
    document.querySelectorAll('#leave-requests-total-badge').forEach(el => el.innerText = `${total} Request${total === 1 ? '' : 's'}`);
    document.querySelectorAll('#leave-filter-total-count').forEach(el => el.innerText = total);
    document.querySelectorAll('#requests-count span').forEach(el => el.innerText = `${total} ${total === 1 ? 'request' : 'requests'}`);

    const sidebarBadge = document.getElementById('leave-badge');
    if (sidebarBadge) {
        if (pending > 0) {
            sidebarBadge.innerText = pending;
            sidebarBadge.classList.remove('is-hidden');
            sidebarBadge.style.display = 'inline-flex';
        } else {
            sidebarBadge.classList.add('is-hidden');
            sidebarBadge.style.display = 'none';
        }
    }
}

function setupLeaveRequestsFilterListeners() {
    document.querySelectorAll('.leave-tab-filter').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.leave-tab-filter').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            window.leaveFilterState.status = this.getAttribute('data-filter') || 'all';
            renderAdminLeaveRequests();
        };
    });

    document.querySelectorAll('#leave-type-filter').forEach(select => {
        select.onchange = function() {
            window.leaveFilterState.type = this.value;
            renderAdminLeaveRequests();
        };
    });

    document.querySelectorAll('#leave-search-input').forEach(input => {
        input.oninput = function() {
            window.leaveFilterState.search = this.value.trim().toLowerCase();
            renderAdminLeaveRequests();
        };
    });

    document.querySelectorAll('#refresh-leave-requests-btn').forEach(btn => {
        btn.onclick = function() {
            initLeaveRequestsSection();
            showAlert('Leave requests refreshed', 'info');
        };
    });
}

function renderAdminLeaveRequests() {
    const listContainers = document.querySelectorAll('#leave-requests-list, #leave-requests-section-active #leave-requests-list');
    if (!listContainers.length) return;

    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const all = window.allLeaveRequests || [];
    const filter = window.leaveFilterState || { status: 'all', type: 'all', search: '' };
    const filtered = all.filter(item => {
        const status = String(item.status || '').toLowerCase();
        if (filter.status === 'pending' && !status.includes('pending')) return false;
        if (filter.status === 'approved' && !status.includes('approve')) return false;
        if (filter.status === 'rejected' && !status.includes('reject')) return false;
        if (filter.type !== 'all' && String(item.type || '').toLowerCase() !== filter.type.toLowerCase()) return false;
        if (filter.search) {
            const user = window.studentUserCache[item.userId] || {};
            const haystack = [item.studentName, item.studentRoll, user.name, user.email, user.univRoll, user.classRoll, item.reason, item.type].join(' ').toLowerCase();
            if (!haystack.includes(filter.search)) return false;
        }
        return true;
    });

    const count = document.querySelector('#requests-count span');
    if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'request' : 'requests'}`;
    const totalFilterCount = document.getElementById('leave-filter-total-count');
    if (totalFilterCount) totalFilterCount.textContent = all.length;

    if (!filtered.length) {
        const hasFilters = filter.status !== 'all' || filter.type !== 'all' || Boolean(filter.search);
        listContainers.forEach(container => {
            container.innerHTML = `<div class="lr-empty-state"><span class="lr-empty-icon"><i class="fas ${hasFilters ? 'fa-filter-circle-xmark' : 'fa-inbox'}"></i></span><h4>${hasFilters ? 'No matching requests' : 'No leave requests yet'}</h4><p>${hasFilters ? 'Try changing the filters or search terms.' : 'Teacher leave and on-duty applications will appear here.'}</p></div>`;
        });
        return;
    }

    const html = `<div class="lr-request-list">${filtered.map(req => {
        const user = window.studentUserCache[req.userId] || {};
        const name = req.studentName || user.name || (user.email ? user.email.split('@')[0] : 'Teacher');
        const email = req.studentRoll || user.email || '';
        const photo = user.profilePhoto || user.photoURL || '';
        const initials = String(name).split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'T';
        const status = String(req.status || '').toLowerCase();
        const isApproved = status.includes('approve');
        const isRejected = status.includes('reject');
        const isPending = !isApproved && !isRejected;
        const statusClass = isApproved ? 'approved' : isRejected ? 'rejected' : 'pending';
        const statusLabel = isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending review';
        const type = String(req.type || 'Leave Request');
        const typeLower = type.toLowerCase();
        const typeClass = typeLower.includes('medical') ? 'medical' : typeLower.includes('emergency') ? 'emergency' : typeLower.includes('od') || typeLower.includes('duty') ? 'duty' : 'leave';
        const from = req.from || 'Not specified';
        const to = req.to || req.from || 'Not specified';
        let days = 1;
        if (req.from && req.to) {
            const first = new Date(req.from);
            const last = new Date(req.to);
            if (!Number.isNaN(first.getTime()) && !Number.isNaN(last.getTime())) days = Math.max(1, Math.round((last - first) / 86400000) + 1);
        }
        const appliedDate = new Date(Number(req.createdAt) || req.createdAt);
        const appliedLabel = Number.isNaN(appliedDate.getTime()) ? 'Date unavailable' : appliedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const avatar = photo
            ? `<img class="lr-avatar" src="${escape(photo)}" alt="" loading="lazy">`
            : `<span class="lr-avatar lr-avatar-fallback" aria-hidden="true">${escape(initials)}</span>`;
        const userId = escape(req.userId);
        const requestId = escape(req.requestId);
        return `<article class="lr-request-card">
            <header class="lr-request-header"><div class="lr-teacher"><button type="button" class="lr-teacher-profile" onclick="showUserDetails('${userId}')" aria-label="View ${escape(name)} profile">${avatar}<span class="lr-teacher-copy"><strong>${escape(name)}</strong><span>${escape(email || 'No email provided')}</span></span></button></div><span class="lr-status ${statusClass}"><i class="fas ${isApproved ? 'fa-circle-check' : isRejected ? 'fa-circle-xmark' : 'fa-clock'}"></i>${statusLabel}</span></header>
            <div class="lr-request-details"><div class="lr-detail-item"><span>Request type</span><strong><span class="lr-type ${typeClass}">${escape(type)}</span></strong></div><div class="lr-detail-item"><span>Requested dates</span><strong>${escape(from)} <i class="fas fa-arrow-right" aria-hidden="true"></i> ${escape(to)}</strong><small>${days} ${days === 1 ? 'day' : 'days'}</small></div><div class="lr-detail-item"><span>Applied on</span><strong>${escape(appliedLabel)}</strong></div></div>
            <div class="lr-reason"><span>Reason</span><p>${escape(req.reason || 'No specific reason provided')}</p>${req.rejectionReason ? `<small><i class="fas fa-circle-info"></i> Review note: ${escape(req.rejectionReason)}</small>` : ''}</div>
            <footer class="lr-request-footer"><span class="lr-request-id">${isPending ? 'Awaiting your review' : `Reviewed${req.reviewedAt ? ` on ${escape(new Date(req.reviewedAt).toLocaleDateString())}` : ''}`}</span><div class="lr-actions">${isPending ? `<button type="button" class="lr-action-btn approve" onclick="approveLeaveRequest('${userId}', '${requestId}')"><i class="fas fa-check"></i> Approve</button><button type="button" class="lr-action-btn reject" onclick="rejectLeaveRequest('${userId}', '${requestId}')"><i class="fas fa-xmark"></i> Reject</button>` : `<button type="button" class="lr-action-btn review" onclick="approveLeaveRequest('${userId}', '${requestId}')" title="Re-approve request"><i class="fas fa-rotate"></i><span class="sr-only">Re-approve</span></button><button type="button" class="lr-action-btn review" onclick="rejectLeaveRequest('${userId}', '${requestId}')" title="Reject request"><i class="fas fa-ban"></i><span class="sr-only">Reject</span></button>`}<button type="button" class="lr-action-btn delete" onclick="deleteLeaveRequest('${userId}', '${requestId}')" title="Delete request"><i class="fas fa-trash"></i><span class="sr-only">Delete</span></button></div></footer>
        </article>`;
    }).join('')}</div>`;
    listContainers.forEach(container => { container.innerHTML = html; });
}
function approveLeaveRequest(userId, requestId) {
    if (!userId || !requestId) return;
    const req = (window.allLeaveRequests || []).find(r => r.userId === userId && r.requestId === requestId);
    const studentName = req ? req.studentName : 'Teacher';

    if (!confirm(`Approve leave request for ${studentName}?`)) {
        return;
    }

    const currentAdmin = firebase.auth().currentUser;
    const updates = {
        status: 'Approved',
        reviewedAt: Date.now(),
        reviewedBy: currentAdmin ? currentAdmin.uid : 'admin'
    };

    const requestPath = req?.requestPath || `teacher_leave_requests/${req?.schoolId || ''}/${userId}/${requestId}`;
    firebase.database().ref(requestPath).update(updates)
        .then(() => {
            const noticeRef=firebase.database().ref(`notifications/${userId}`).push();
            return noticeRef.set({title:'Leave application approved',message:`Your ${req?.type || 'leave'} application (${req?.from || ''} to ${req?.to || ''}) has been approved by your school administrator.`,type:'success',category:'Leave request',timestamp:firebase.database.ServerValue.TIMESTAMP}).catch(() => {});
        })
        .then(() => {
            showAlert(`Leave request approved for ${studentName}`, 'success');
        })
        .catch(err => {
                        console.error('Error approving teacher leave request:', err);
            showAlert('Failed to approve leave: ' + err.message, 'error');
        });
}

function rejectLeaveRequest(userId, requestId) {
    if (!userId || !requestId) return;
    const req = (window.allLeaveRequests || []).find(r => r.userId === userId && r.requestId === requestId);
    const studentName = req ? req.studentName : 'Teacher';

    const reason = prompt(`Provide an optional reason for rejecting ${studentName}'s leave request:`, 'Attendance criteria or documentation requirements not fulfilled');
    if (reason === null) return;

    const currentAdmin = firebase.auth().currentUser;
    const updates = {
        status: 'Rejected',
        rejectionReason: reason.trim() || 'Administrative decision',
        reviewedAt: Date.now(),
        reviewedBy: currentAdmin ? currentAdmin.uid : 'admin'
    };

    const requestPath = req?.requestPath || `teacher_leave_requests/${req?.schoolId || ''}/${userId}/${requestId}`;
    firebase.database().ref(requestPath).update(updates)
        .then(() => {
            const noticeRef=firebase.database().ref(`notifications/${userId}`).push();
            return noticeRef.set({title:'Leave application declined',message:`Your ${req?.type || 'leave'} application was declined. Reason: ${reason.trim() || 'Administrative decision'}`,type:'warning',category:'Leave request',timestamp:firebase.database.ServerValue.TIMESTAMP}).catch(() => {});
        })
        .then(() => {
            showAlert(`Leave request rejected for ${studentName}`, 'info');
        })
        .catch(err => {
            console.error('Error rejecting leave request:', err);
            showAlert('Failed to reject leave: ' + err.message, 'error');
        });
}

function deleteLeaveRequest(userId, requestId) {
    if (!userId || !requestId) return;
    if (!confirm('Are you sure you want to permanently delete this leave application record?')) {
        return;
    }

    const req=(window.allLeaveRequests||[]).find(r=>r.userId===userId&&r.requestId===requestId);
    const requestPath=req?.requestPath || `teacher_leave_requests/${req?.schoolId || ''}/${userId}/${requestId}`;
    firebase.database().ref(requestPath).remove()
        .then(() => {
            showAlert('Leave application record deleted', 'success');
        })
        .catch(err => {
            console.error('Error deleting leave request:', err);
            showAlert('Failed to delete leave request: ' + err.message, 'error');
        });
}

window.initLeaveRequestsSection = initLeaveRequestsSection;
window.approveLeaveRequest = approveLeaveRequest;
window.rejectLeaveRequest = rejectLeaveRequest;
window.deleteLeaveRequest = deleteLeaveRequest;



// Location matching function for admin panel
function compareLocations(otherLocation) {
    if (!adminLocation) {
        showAlert("Please get your location first", "warning");
        return;
    }

    // Parse coordinates as floats to ensure proper calculation
    const adminLat = parseFloat(adminLocation.lat);
    const adminLon = parseFloat(adminLocation.lon);
    const otherLat = parseFloat(otherLocation.lat);
    const otherLon = parseFloat(otherLocation.lon);

    // Get device info
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const deviceType = isMobile ? "Mobile" : "Desktop";
    const otherDeviceType = otherLocation.deviceType || "Unknown device";

    // Special handling for cross-device comparison
    const isCrossDevice = (isMobile && otherDeviceType.includes("Desktop")) ||
        (!isMobile && otherDeviceType.includes("Mobile"));

    // Calculate distance with the improved formula
    const distance = calculateDistance(adminLat, adminLon, otherLat, otherLon);

    // Calculate adjusted match threshold
    // Base threshold - minimum 20m, maximum 100m
    let matchThreshold = 100;

    // Adjust for cross-device comparison
    if (isCrossDevice) {
        console.log("Cross-device comparison detected. Using more generous threshold.");
        // More generous for cross-device
        matchThreshold = 150;
    }

    // Further adjust based on accuracy if available
    if (adminLocation.accuracy && otherLocation.accuracy) {
        const combinedAccuracy = (adminLocation.accuracy + otherLocation.accuracy) / 2;
        // Ensure threshold is reasonable based on combined accuracy
        // but still maintain minimum and maximum bounds
        matchThreshold = Math.min(200, Math.max(50, combinedAccuracy * 1.5));
    }

    // For very large distances, automatically adjust threshold
    if (distance > 10000) {
        console.log("Very large distance detected. This is likely a GPS error.");
        // For distances over 10km, use a special threshold
        // This helps when there are major GPS errors between devices
        matchThreshold = Math.min(distance * 0.05, 500);
    }

    // Check if coordinates match within threshold
    const matched = distance <= matchThreshold;

    // Log detailed matching information
    console.log("LOCATION COMPARISON:", {
        admin: {
            device: deviceType,
            coordinates: [adminLat, adminLon],
            accuracy: adminLocation.accuracy
        },
        other: {
            device: otherDeviceType,
            coordinates: [otherLat, otherLon],
            accuracy: otherLocation.accuracy
        },
        distance: distance,
        threshold: matchThreshold,
        isCrossDevice: isCrossDevice,
        result: matched ? "MATCH" : "NO MATCH"
    });

    // Show match result
    const resultDiv = document.getElementById('peer-match-result');

    if (matched) {
        resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <strong>Locations Match!</strong>
                    <div class="mt-2">
                        <strong>Distance:</strong> ${Math.round(distance)}m apart
                        <br>
                        <strong>Match Threshold:</strong> ${Math.round(matchThreshold)}m
                        <br>
                        <span class="text-success">The coordinates from both devices are aligned within expected accuracy.</span>
                    </div>
                </div>
            `;

        // Log success details
        console.log("LOCATION MATCH SUCCESS:", {
            distance: distance,
            threshold: matchThreshold,
            admin: { lat: adminLat, lon: adminLon, accuracy: adminLocation.accuracy },
            other: { lat: otherLat, lon: otherLon, accuracy: otherLocation.accuracy }
        });
    } else {
        resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-times-circle"></i> <strong>Locations Don't Match</strong>
                    <div class="mt-2">
                        <strong>Distance:</strong> ${Math.round(distance)}m apart
                        <br>
                        <strong>Match Threshold:</strong> ${Math.round(matchThreshold)}m
                        <br>
                        <span class="text-danger">The coordinates from both devices differ more than expected.</span>
                    </div>
                </div>
            `;

        // Log failure details
        console.log("LOCATION MATCH FAILURE:", {
            distance: distance,
            threshold: matchThreshold,
            admin: { lat: adminLat, lon: adminLon, accuracy: adminLocation.accuracy },
            other: { lat: otherLat, lon: otherLon, accuracy: otherLocation.accuracy }
        });
    }

    // Add detailed comparison
    resultDiv.innerHTML += `
            <div class="comparison-table">
                <table class="table table-sm table-bordered mt-3">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Your Device (${deviceType})</th>
                            <th>Other Device (${otherDeviceType})</th>
                            <th>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Latitude</td>
                            <td>${adminLat.toFixed(6)}</td>
                            <td>${otherLat.toFixed(6)}</td>
                            <td>${Math.abs(adminLat - otherLat).toFixed(6)}</td>
                        </tr>
                        <tr>
                            <td>Longitude</td>
                            <td>${adminLon.toFixed(6)}</td>
                            <td>${otherLon.toFixed(6)}</td>
                            <td>${Math.abs(adminLon - otherLon).toFixed(6)}</td>
                        </tr>
                        <tr>
                            <td>Accuracy</td>
                            <td>±${Math.round(adminLocation.accuracy)}m</td>
                            <td>±${Math.round(otherLocation.accuracy)}m</td>
                            <td>±${Math.round(Math.abs(adminLocation.accuracy - otherLocation.accuracy))}m</td>
                        </tr>
                        <tr>
                            <td>Cross-device?</td>
                            <td colspan="3" class="${isCrossDevice ? 'text-primary' : 'text-secondary'}">
                                ${isCrossDevice ? 'Yes - Using adjusted threshold for cross-device comparison' : 'No - Both devices are same type'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
}





document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const menuToggle = document.getElementById('menu-toggle');
    const headerMenuToggle = document.getElementById('header-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    const adminPanel = document.getElementById('admin-panel');

    // Create overlay element only for mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    if (window.innerWidth < 992) {
        document.body.appendChild(overlay);
    }

    // Function to close sidebar
    function closeSidebar() {
        sidebar.classList.add('sidebar-collapsed');
        contentWrapper.classList.add('expanded');
        if (overlay) overlay.classList.remove('visible');
        if (window.innerWidth < 992) {
            menuToggle.style.visibility = 'visible';
            menuToggle.style.opacity = '1';
        }
    }

    // Function to open sidebar
    function openSidebar() {
        sidebar.classList.remove('sidebar-collapsed');
        contentWrapper.classList.remove('expanded');
        if (window.innerWidth < 992 && overlay) {
            overlay.classList.add('visible');
            menuToggle.style.visibility = 'hidden';
            menuToggle.style.opacity = '0';
        }
    }

    // Toggle sidebar function
    let lastSidebarToggleTime = 0;
    function toggleSidebar(e) {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        const now = Date.now();
        if (now - lastSidebarToggleTime < 250) {
            return;
        }
        lastSidebarToggleTime = now;

        sidebar.classList.toggle('sidebar-collapsed');
        contentWrapper.classList.toggle('expanded');

        const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
        document.body.classList.toggle('sidebar-is-collapsed', isCollapsed);

        const iconHtml = isCollapsed ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-chevron-left"></i>';
        const titleText = isCollapsed ? 'Open Sidebar' : 'Collapse Sidebar';

        if (headerMenuToggle) {
            headerMenuToggle.innerHTML = iconHtml;
            headerMenuToggle.title = titleText;
            headerMenuToggle.setAttribute('aria-label', titleText);
        }

        document.querySelectorAll('.section-menu-btn').forEach(btn => {
            btn.innerHTML = iconHtml;
            btn.title = titleText;
            btn.setAttribute('aria-label', titleText);
        });

        if (isCollapsed) {
            contentWrapper.style.width = '100%';
            contentWrapper.style.marginLeft = '0';
        } else {
            if (window.innerWidth >= 992) {
                contentWrapper.style.width = 'calc(100% - 280px)';
                contentWrapper.style.marginLeft = '280px';
            }
        }

        // Force layout recalculation to ensure smooth transition
        window.getComputedStyle(contentWrapper).getPropertyValue('width');
    }

    // Global delegated toggle listener is managed cleanly by document listener
    // toggleSidebar function is available globally for any callers

    // Make toggleSidebar function available globally for dynamically created elements
    window.toggleSidebar = toggleSidebar;

    // Set initial icon state
    const isInitiallyCollapsed = sidebar.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-is-collapsed', isInitiallyCollapsed);
    const initialIcon = isInitiallyCollapsed ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-chevron-left"></i>';
    const initialTitle = isInitiallyCollapsed ? 'Open Sidebar' : 'Collapse Sidebar';
    if (headerMenuToggle) {
        headerMenuToggle.innerHTML = initialIcon;
        headerMenuToggle.title = initialTitle;
        headerMenuToggle.setAttribute('aria-label', initialTitle);
    }
    document.querySelectorAll('.section-menu-btn').forEach(btn => {
        btn.innerHTML = initialIcon;
        btn.title = initialTitle;
        btn.setAttribute('aria-label', initialTitle);
    });

    // Initialize for mobile devices
    function checkScreenSize() {
        if (window.innerWidth < 992) {
            sidebar.classList.add('sidebar-collapsed');
            contentWrapper.classList.add('expanded');
            document.body.classList.add('sidebar-is-collapsed');
            contentWrapper.style.width = '100%';

            if (headerMenuToggle) {
                headerMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
                headerMenuToggle.title = 'Open Sidebar';
                headerMenuToggle.setAttribute('aria-label', 'Open Sidebar');
            }
            document.querySelectorAll('.section-menu-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-bars"></i>';
                btn.title = 'Open Sidebar';
                btn.setAttribute('aria-label', 'Open Sidebar');
            });
        } else {
            const adminPanelEl = document.getElementById('admin-panel');
            if (sidebar.classList.contains('visible') || (adminPanelEl && !adminPanelEl.classList.contains('hidden'))) {
                sidebar.classList.remove('sidebar-collapsed');
                contentWrapper.classList.remove('expanded');
                document.body.classList.remove('sidebar-is-collapsed');
                contentWrapper.style.width = 'calc(100% - 280px)';

                if (headerMenuToggle) {
                    headerMenuToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                    headerMenuToggle.title = 'Collapse Sidebar';
                    headerMenuToggle.setAttribute('aria-label', 'Collapse Sidebar');
                }
                document.querySelectorAll('.section-menu-btn').forEach(btn => {
                    btn.innerHTML = '<i class="fas fa-chevron-left"></i>';
                    btn.title = 'Collapse Sidebar';
                    btn.setAttribute('aria-label', 'Collapse Sidebar');
                });
            } else {
                contentWrapper.style.width = '100%';
            }
        }
    }

    // Check screen size on load and resize
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    // Sidebar menu navigation
    const sidebarMenuItems = document.querySelectorAll(".sidebar-menu-item, .sidebar-menu-item-modern");
    sidebarMenuItems.forEach(item => {
        item.addEventListener('click', function () {
            const section = this.getAttribute('data-section');

            if (section === 'cbt-portal' && window.currentCbtPlanActive !== true) {
                document.querySelector('[data-section="dashboard"]')?.click();
                return;
            }

            if (erpPortalModeActive && section !== 'manage-account' && section !== 'cbt-portal' && section !== 'logout') {
                document.querySelector('[data-section="manage-account"]')?.click();
                return;
            }
            contentWrapper.classList.toggle('erp-account-visible', erpPortalModeActive && section === 'manage-account');

            if ((section === 'download-limit' || section === 'device-locks') &&
                document.body.classList.contains('admin-school-mode')) {
                return;
            }

            // Handle logout
            if (section === 'logout') {
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) logoutBtn.click();
                return;
            }

            // Database Management has its own PIN-protected navigation handler in admin.html.
            if (section === 'database-management') {
                return;
            }

            // Hide every section template, including Database Management which is
            // moved into the content container after its PIN verification.
            document.querySelectorAll('.section-template').forEach(template => {
                template.classList.add('hidden');
            });
            // Keep the content wrapper as the single vertical scroll owner and
            // start each newly selected panel at its own top edge.
            contentWrapper.scrollTop = 0;

            // Remove active class from all menu items
            sidebarMenuItems.forEach(mi => mi.classList.remove('active'));

            // Add active class to clicked menu item
            this.classList.add('active');

            // Keep mounted panels in the DOM. Switching panels only hides the old
            // panel, preserving loaded data, scroll position, filters, and form state.
            document.querySelectorAll('[id$="-section-active"]').forEach(panel => {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            });

            const currentAdminPanel = document.getElementById('admin-panel') || (typeof adminPanel !== 'undefined' ? adminPanel : null);
            const currentContentWrapper = document.getElementById('content-wrapper') || contentWrapper;

            // Handle dashboard section
            if (section === 'dashboard') {
                window.AdminPanelAPI?.clearLayout();
                if (currentAdminPanel) currentAdminPanel.classList.remove('hidden');
                return;
            }

            // Handle other sections
            if (currentAdminPanel) currentAdminPanel.classList.add('hidden');

            // Reuse the already-mounted panel instead of cloning and reloading it.
            const cachedPanel = document.getElementById(`${section}-section-active`);
            if (cachedPanel && currentContentWrapper) {
                cachedPanel.classList.remove('hidden');
                cachedPanel.style.display = '';
                if (window.innerWidth < 992) sidebar.classList.add('sidebar-collapsed');
                return;
            }

            // Show the selected section template for its first visit.
            const templateToShow = document.getElementById(`${section}-section`);
            if (templateToShow && currentContentWrapper) {
                const clonedTemplate = templateToShow.cloneNode(true);
                clonedTemplate.classList.remove('hidden');
                clonedTemplate.id = `${section}-section-active`;
                templateToShow.remove();
                currentContentWrapper.appendChild(clonedTemplate);
                window.AdminPanelAPI?.mount(section, clonedTemplate);

                // If small screen, collapse sidebar after selection
                if (window.innerWidth < 992) {
                    sidebar.classList.add('sidebar-collapsed');
                }

                // Initialize section-specific functionality only on first load.
                try {
                    if (section === 'manage-account') {
                        initManageAccountSection();
                    } else if (section === 'manage-admins') {
                        initManageAdmins();
                    } else if (section === 'notifications') {
                        initNotifications();
                    } else if (section === 'profile-requests') {
                        initProfileRequests();
                    } else if (section === 'leave-requests') {
                        initLeaveRequestsSection();
                    } else if (section === 'blocked-users') {
                        initBlockedUsers(clonedTemplate);
                    } else if (section === 'download-limit') {
                        initDownloadLimitSection();
                    } else if (section === 'device-locks') {
                        initDeviceLocksSection();
                    } else if (section === 'manage-batches') {
                        if (typeof window.initManageBatchesSection === 'function') window.initManageBatchesSection(clonedTemplate);
                    } else if (section === 'cbt-portal') {
                        if (typeof window.initCbtPortalSection === 'function') window.initCbtPortalSection(clonedTemplate);
                    }
                } catch (initErr) {
                    console.error(`Error initializing section ${section}:`, initErr);
                }
            }
    });
    });
});



document.addEventListener('DOMContentLoaded', function () {
    // Email and password input handling
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');

    emailInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            loginBtn.click();
        }
    });

    // Global click handler for closing dropdowns
    document.addEventListener('click', function (e) {
        // If the clicked element is not inside an action menu or dropdown
        if (!e.target.closest('.action-menu') && !e.target.closest('.action-dropdown')) {
            // Close all open dropdowns
            document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show', 'dropup', 'dropleft');
            });
        }
    });

    // Detect device type
    if (typeof currentDeviceType !== 'undefined') {
        currentDeviceType = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            ? 'mobile'
            : 'desktop';

        console.log("Current device type:", currentDeviceType);
    }
});

// Simple selectStudents function for general use
function selectStudents() {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';

    popup.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;width:500px;max-height:600px;overflow-y:auto">
            <h3>Select Students</h3>
            <div id="students-list">Loading...</div>
            <div style="margin-top:20px;text-align:right">
                <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" style="margin-right:10px">Cancel</button>
                <button onclick="confirmStudentSelection();this.closest('div[style*=\"position:fixed\"]').remove()">Done</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Load students
    firebase.database().ref('users').orderByChild('role').equalTo('student').once('value').then(snapshot => {
        let html = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                html += `<div style="padding:5px"><input type="checkbox" id="s_${child.key}" onchange="updateSelection('${child.key}','${user.name}','${user.email}',this.checked)"> ${user.name} (${user.email})</div>`;
            });
        }
        document.getElementById('students-list').innerHTML = html || 'No students found';
    });
}

function updateSelection(id, name, email, checked) {
    if (!window.selectedStudentsList) window.selectedStudentsList = [];
    if (checked) {
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({ id, name, email });
        }
    } else {
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }
}

function confirmStudentSelection() {
    console.log('Selected students:', window.selectedStudentsList);
}
