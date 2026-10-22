/* Owner portal core uses the same deployment-configured Firebase app as every RollCall portal. */
(function () {
    const APP_FIREBASE = window.ROLLCALL_FIREBASE_CONFIG;
    let schoolsListener = null;
    let pricingPlans = [];
    let schoolUserUsage = {};
    let currentSchoolFilter = '';
    let connectionLoadForUid = null;
    const SCHOOL_CACHE_DB = 'rollcall-owner-cache';
    const SCHOOL_CACHE_STORE = 'schools';

    function openSchoolCache() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
            const request = window.indexedDB.open(SCHOOL_CACHE_DB, 1);
            request.onupgradeneeded = () => {
                const cacheDb = request.result;
                if (!cacheDb.objectStoreNames.contains(SCHOOL_CACHE_STORE)) {
                    cacheDb.createObjectStore(SCHOOL_CACHE_STORE, { keyPath: 'ownerUid' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Could not open the school cache.'));
            request.onblocked = () => reject(new Error('The school cache is blocked by another tab.'));
        });
    }

    async function readSchoolsCache(ownerUid = currentUser?.uid) {
        if (!ownerUid) return null;
        let cacheDb;
        try {
            cacheDb = await openSchoolCache();
            return await new Promise((resolve, reject) => {
                const request = cacheDb.transaction(SCHOOL_CACHE_STORE, 'readonly')
                    .objectStore(SCHOOL_CACHE_STORE).get(ownerUid);
                request.onsuccess = () => resolve(Array.isArray(request.result?.schools) ? request.result.schools : null);
                request.onerror = () => reject(request.error || new Error('Could not read the school cache.'));
            });
        } catch (error) {
            console.warn('Owner school cache read failed; Firebase will be used.', error);
            return null;
        } finally {
            cacheDb?.close();
        }
    }

    async function writeSchoolsCache(items = schools, ownerUid = currentUser?.uid) {
        if (!ownerUid || !Array.isArray(items)) return;
        let cacheDb;
        try {
            cacheDb = await openSchoolCache();
            await new Promise((resolve, reject) => {
                const transaction = cacheDb.transaction(SCHOOL_CACHE_STORE, 'readwrite');
                transaction.objectStore(SCHOOL_CACHE_STORE).put({ ownerUid, schools: items, cachedAt: Date.now() });
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error || new Error('Could not save the school cache.'));
                transaction.onabort = () => reject(transaction.error || new Error('School cache update was cancelled.'));
            });
        } catch (error) {
            console.warn('Owner school cache write failed.', error);
        } finally {
            cacheDb?.close();
        }
    }

    function ownerPath(path) {
        if (!currentUser?.uid || window.__rollCallOwnerAuthorizedUid !== currentUser.uid) {
            throw new Error('Platform owner access has not been verified for this account.');
        }
        return ownerAuth.database().ref(`owners/${currentUser.uid}/${path}`);
    }

    function notify(message, type = 'info') {
        if (typeof showAlert === 'function') showAlert(message, type);
        else window.alert(message);
    }

    function setConnection(message, kind = 'secondary') {
        const status = document.getElementById('firebaseStatus');
        if (status) status.innerHTML = `<span class="badge bg-${kind}">${message}</span>`;
    }

    async function attachDatabase() {
        try {
            if (!APP_FIREBASE) throw new Error('Shared Firebase config missing. Set FIREBASE_* deployment variables and rebuild the site.');
            if (!ownerAuth?.auth().currentUser) throw new Error('Sign in to the shared RollCall Firebase project first.');
            if (window.__rollCallOwnerAuthorizedUid !== ownerAuth.auth().currentUser.uid) throw new Error('Only an authorized platform owner can connect this workspace.');
            firebaseApp = ownerAuth;
            database = ownerAuth.database();
            isFirebaseConnected = true;
            window.ownerDatabaseMode = 'combined';
            setConnection('Connected to the shared RollCall database', 'info');
            loadSchoolsFromFirebase();
            loadPricingPlans();
            return true;
        } catch (error) {
            console.error('Shared database setup failed', error);
            isFirebaseConnected = false;
            setConnection('Database connection failed', 'danger');
            notify(`Could not connect to the shared database: ${error.message}`, 'danger');
            return false;
        }
    }

    function addPricingPanel() {
        const nav = document.querySelector('.nav-links');
        const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-pricing')) return;
        const item = document.createElement('li');
        item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-pricing"><i class="fas fa-tags"></i>Pricing & Plans</a>';
        nav.appendChild(item);
        const section = document.createElement('section');
        section.id = 'owner-pricing';
        section.className = 'animated-section';
        section.style.display = 'none';
        section.innerHTML = `
          <div class="section-card">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
              <div><h2><i class="fas fa-tags"></i>Pricing plans & school subscriptions</h2><p class="text-muted mb-0">Create base plans, capacity top-ups, or extra-month top-ups that extend a school's current subscription.</p></div>
              <span id="ownerPricingDbBadge" class="badge text-bg-light">Shared RollCall database</span>
            </div>
            <form id="ownerPlanForm" class="row g-2 align-items-end border rounded p-3 mb-4">
              <input id="ownerPlanId" type="hidden">
              <div class="col-md-3"><label class="form-label" for="ownerPlanName">Name</label><input id="ownerPlanName" class="form-control" required maxlength="60" placeholder="e.g. Campus Pro"></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanType">Subscription type</label><select id="ownerPlanType" class="form-select"><option value="plan">Main plan</option><option value="topup">Top-up</option></select></div>
              <div class="col-md-2" id="ownerPlanTopupKindField" hidden><label class="form-label" for="ownerPlanTopupKind">Top-up pattern</label><select id="ownerPlanTopupKind" class="form-select"><option value="capacity">Extra capacity</option><option value="months">Extra months</option></select></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanPrice">Price</label><input id="ownerPlanPrice" type="number" class="form-control" min="0" step="0.01" required placeholder="0"></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanCurrency">Currency</label><select id="ownerPlanCurrency" class="form-select"><option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
              <div class="col-md-1" id="ownerPlanMonthsField"><label class="form-label" for="ownerPlanMonths">Months</label><input id="ownerPlanMonths" type="number" class="form-control" min="1" max="120" value="12"></div>
              <div class="col-md-2 d-flex align-items-center" id="ownerPlanAutoRenewField"><div class="form-check mt-3"><input id="ownerPlanAutoRenew" class="form-check-input" type="checkbox"><label class="form-check-label" for="ownerPlanAutoRenew">Auto-renew</label></div></div>
              <div class="col-md-2"><button class="btn btn-primary w-100" type="submit">Save</button></div>
              <div class="col-md-3" id="ownerPlanStudentCapacityField"><label class="form-label" for="ownerPlanStudentCapacity">Student records</label><input id="ownerPlanStudentCapacity" type="number" class="form-control" min="0" step="1" value="0" required></div>
              <div class="col-md-3" id="ownerPlanTeacherCapacityField"><label class="form-label" for="ownerPlanTeacherCapacity">Teacher records</label><input id="ownerPlanTeacherCapacity" type="number" class="form-control" min="0" step="1" value="0" required></div>
              <div class="col-md-3 d-flex align-items-center" id="ownerPlanBonusOfferField"><div class="form-check mt-3"><input id="ownerPlanBonus" class="form-check-input" type="checkbox"><label class="form-check-label" for="ownerPlanBonus">Include bonus top-up offer</label></div></div>
              <div class="col-md-3" id="ownerPlanBonusStudentCapacityField"><label class="form-label" for="ownerPlanBonusStudentCapacity">Bonus student records <span class="text-muted">(optional)</span></label><input id="ownerPlanBonusStudentCapacity" type="number" class="form-control" min="0" step="1" placeholder="Uses default"></div>
              <div class="col-md-3" id="ownerPlanBonusTeacherCapacityField"><label class="form-label" for="ownerPlanBonusTeacherCapacity">Bonus teacher records <span class="text-muted">(optional)</span></label><input id="ownerPlanBonusTeacherCapacity" type="number" class="form-control" min="0" step="1" placeholder="Uses default"></div>
              <div class="col-12"><label class="form-label" for="ownerPlanFeatures">Included features</label><input id="ownerPlanFeatures" class="form-control" placeholder="Attendance, reports, student directory"></div>
              <div class="col-12"><button class="btn btn-link px-0" id="ownerPlanCancel" type="button" hidden>Cancel editing</button></div>
            </form>
            <div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Term</th><th>Capacity</th><th>Features</th><th>Availability</th><th>Actions</th></tr></thead><tbody id="ownerPlanRows"></tbody></table></div>
            <hr class="my-4"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><h3 class="h5 mb-0">School subscriptions</h3><input id="ownerSubscriptionSearch" class="form-control" style="max-width:320px" placeholder="Search schools"></div>
            <div class="table-responsive mt-3"><table class="table table-hover align-middle"><thead><tr><th>School</th><th>School code</th><th>Main plan</th><th>Usage / capacity</th><th>Top-up</th><th>Renewal date</th><th>School access</th><th>Save</th></tr></thead><tbody id="ownerSubscriptionRows"></tbody></table></div>
          </div>`;
        main.appendChild(section);
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-pricing'); renderSubscriptionRows(); });
        section.querySelector('#ownerPlanForm').addEventListener('submit', savePricingPlan);
        section.querySelector('#ownerPlanCancel').addEventListener('click', resetPricingForm);
        section.querySelector('#ownerSubscriptionSearch').addEventListener('input', renderSubscriptionRows);
        const updateBonusControls = () => {
            const isTopup = document.getElementById('ownerPlanType').value === 'topup';
            const topupKindField = document.getElementById('ownerPlanTopupKindField');
            const isMonthTopup = isTopup && document.getElementById('ownerPlanTopupKind').value === 'months';
            const monthsField = document.getElementById('ownerPlanMonthsField');
            const studentCapacityField = document.getElementById('ownerPlanStudentCapacityField');
            const teacherCapacityField = document.getElementById('ownerPlanTeacherCapacityField');
            const studentCapacity = document.getElementById('ownerPlanStudentCapacity');
            const teacherCapacity = document.getElementById('ownerPlanTeacherCapacity');
            const bonusOfferField = document.getElementById('ownerPlanBonusOfferField');
            const bonusStudentField = document.getElementById('ownerPlanBonusStudentCapacityField');
            const bonusTeacherField = document.getElementById('ownerPlanBonusTeacherCapacityField');
            const bonus = document.getElementById('ownerPlanBonus');
            const bonusStudent = document.getElementById('ownerPlanBonusStudentCapacity');
            const bonusTeacher = document.getElementById('ownerPlanBonusTeacherCapacity');
            const autoRenewField = document.getElementById('ownerPlanAutoRenewField');
            const autoRenew = document.getElementById('ownerPlanAutoRenew');
            if (topupKindField) topupKindField.hidden = !isTopup;
            if (monthsField) monthsField.hidden = isTopup && !isMonthTopup;
            if (monthsField) monthsField.querySelector('label').textContent = isMonthTopup ? 'Months to add' : 'Months';
            if (studentCapacityField) studentCapacityField.hidden = isMonthTopup;
            if (teacherCapacityField) teacherCapacityField.hidden = isMonthTopup;
            if (studentCapacity) studentCapacity.disabled = isMonthTopup;
            if (teacherCapacity) teacherCapacity.disabled = isMonthTopup;
            const showBonusControls = !isTopup;
            if (bonusOfferField) bonusOfferField.hidden = !showBonusControls;
            if (bonusStudentField) bonusStudentField.hidden = !showBonusControls;
            if (bonusTeacherField) bonusTeacherField.hidden = !showBonusControls;
            if (bonus) bonus.disabled = !showBonusControls;
            if (isTopup && bonus) bonus.checked = false;
            if (autoRenewField) autoRenewField.hidden = isTopup;
            if (autoRenew) {
                autoRenew.disabled = isTopup;
                if (isTopup) autoRenew.checked = false;
            }

            function addAdminProfileRequestsPanel() {
                const nav = document.querySelector('.nav-links');
                const main = document.querySelector('.main-content');
                if (!nav || !main || document.getElementById('owner-admin-profile-requests')) return;
                const item = document.createElement('li');
                item.className = 'nav-item';
                item.innerHTML = '<a class="nav-link" href="#owner-admin-profile-requests"><i class="fas fa-user-check"></i>Admin Requests</a>';
                nav.appendChild(item);
                const section = document.createElement('section');
                section.id = 'owner-admin-profile-requests';
                section.className = 'animated-section';
                section.style.display = 'none';
                section.innerHTML = '<div class="section-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><div><h2><i class="fas fa-user-check"></i>Administrator update requests</h2><p class="text-muted">Review administrator profile changes before they are applied.</p></div><button type="button" class="btn btn-outline-secondary" id="refresh-admin-profile-requests"><i class="fas fa-sync"></i> Refresh</button></div><div id="owner-admin-profile-requests-list" class="mt-3"><p class="text-muted">Loading requests...</p></div></div>';
                main.appendChild(section);

                const render = async () => {
                    const list = section.querySelector('#owner-admin-profile-requests-list');
                    list.innerHTML = '<p class="text-muted">Loading requests...</p>';
                    try {
                        const ownerUid = ownerAuth.auth().currentUser?.uid;
                        const snapshot = await ownerAuth.database().ref('profile_update_requests').once('value');
                        const requests = [];
                        snapshot.forEach(child => {
                            const data = child.val() || {};
                            if (data.ownerId === ownerUid && data.requestType === 'Administrator Profile Update' && data.status === 'pending') {
                                requests.push({ id: child.key, ...data });
                            }
                        });
                        if (!requests.length) {
                            list.innerHTML = '<div class="alert alert-light">No pending administrator update requests.</div>';
                            return;
                        }
                        list.innerHTML = requests.sort((a, b) => b.timestamp - a.timestamp).map(request => `<div class="card mb-3"><div class="card-body"><div class="d-flex justify-content-between gap-3 flex-wrap"><div><h3 class="h6 mb-1">${escapeHtml(request.userName || request.userEmail)}</h3><p class="text-muted mb-2">${escapeHtml(request.userEmail || '')}</p>${renderAdminProfileChanges(request)}<small class="text-muted">${new Date(request.timestamp).toLocaleString()}</small></div><div class="d-flex gap-2 align-items-start"><button type="button" class="btn btn-success approve-admin-request" data-request-id="${request.id}" data-user-id="${request.userId}">Approve</button><button type="button" class="btn btn-outline-danger reject-admin-request" data-request-id="${request.id}">Reject</button></div></div></div></div>`).join('');
                        list.querySelectorAll('.approve-admin-request').forEach(button => button.addEventListener('click', () => review(requests.find(request => request.id === button.dataset.requestId), true)));
                        list.querySelectorAll('.reject-admin-request').forEach(button => button.addEventListener('click', () => review(requests.find(request => request.id === button.dataset.requestId), false)));
                    } catch (error) {
                        console.error('Could not load administrator update requests:', error);
                        list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Could not load requests.')}</div>`;
                    }
                };
                const review = async (request, approve) => {
                    if (!request) return;
                    const ownerUid = ownerAuth.auth().currentUser?.uid;
                    const updates = {};
                    updates[`profile_update_requests/${request.id}/status`] = approve ? 'approved' : 'rejected';
                    updates[`profile_update_requests/${request.id}/${approve ? 'approvedBy' : 'rejectedBy'}`] = ownerUid;
                    updates[`profile_update_requests/${request.id}/${approve ? 'approvedAt' : 'rejectedAt'}`] = Date.now();
                    if (approve && request.requestedData) {
                        Object.entries(request.requestedData).forEach(([key, value]) => {
                            updates[`users/${request.userId}/${key}`] = value;
                        });
                        updates[`users/${request.userId}/updatedAt`] = Date.now();
                    }
                    try {
                        await ownerAuth.database().ref().update(updates);
                        notify(approve ? 'Administrator update approved.' : 'Administrator update rejected.', 'success');
                        render();
                    } catch (error) {
                        console.error('Could not review administrator update request:', error);
                        notify(error.message || 'Could not review request.', 'danger');
                    }
                };
                section.querySelector('#refresh-admin-profile-requests').addEventListener('click', render);
                item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-admin-profile-requests'); render(); });
            }
            const bonusEnabled = showBonusControls && bonus?.checked === true;
            if (bonusStudent) bonusStudent.disabled = !bonusEnabled;
            if (bonusTeacher) bonusTeacher.disabled = !bonusEnabled;
            if (!bonusEnabled) {
                if (bonusStudent) bonusStudent.value = '';
                if (bonusTeacher) bonusTeacher.value = '';
            }
        };
        section.querySelector('#ownerPlanType').addEventListener('change', updateBonusControls);
        section.querySelector('#ownerPlanTopupKind').addEventListener('change', updateBonusControls);
        section.querySelector('#ownerPlanBonus').addEventListener('change', updateBonusControls);
        updateBonusControls();
    }

    function addAdminProfileRequestsPanel() {
        const nav = document.querySelector('.nav-links');
        const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-admin-profile-requests')) return;
        const item = document.createElement('li');
        item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-admin-profile-requests"><i class="fas fa-user-check"></i>Admin Requests</a>';
        nav.appendChild(item);
        const section = document.createElement('section');
        section.id = 'owner-admin-profile-requests';
        section.className = 'animated-section';
        section.style.display = 'none';
        section.innerHTML = '<div class="section-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><div><h2><i class="fas fa-user-check"></i>Administrator update requests</h2><p class="text-muted">Review administrator profile changes before they are applied.</p></div><button type="button" class="btn btn-outline-secondary" id="refresh-admin-profile-requests">Refresh</button></div><div id="owner-admin-profile-requests-list" class="mt-3"><p class="text-muted">Loading requests...</p></div></div>';
        main.appendChild(section);
        const render = async () => {
            const list = section.querySelector('#owner-admin-profile-requests-list');
            const ownerUid = ownerAuth.auth().currentUser?.uid;
            try {
                const snapshot = await ownerAuth.database().ref('profile_update_requests').once('value');
                const requests = [];
                snapshot.forEach(child => {
                    const data = child.val() || {};
                    if (data.ownerId === ownerUid && data.requestType === 'Administrator Profile Update' && data.status === 'pending') requests.push({ id: child.key, ...data });
                });
                list.innerHTML = requests.length ? requests.map(request => `<div class="card mb-3"><div class="card-body d-flex justify-content-between gap-3 flex-wrap"><div><strong>${escapeHtml(request.userName || request.userEmail)}</strong><div>${renderAdminProfileChanges(request)}</div><small class="text-muted">${new Date(request.timestamp).toLocaleString()}</small></div><div><button type="button" class="btn btn-success approve-admin-request" data-id="${request.id}">Approve</button> <button type="button" class="btn btn-outline-danger reject-admin-request" data-id="${request.id}">Reject</button></div></div></div>`).join('') : '<div class="alert alert-light">No pending administrator update requests.</div>';
                list.querySelectorAll('.approve-admin-request,.reject-admin-request').forEach(button => button.addEventListener('click', async () => {
                    const request = requests.find(item => item.id === button.dataset.id);
                    if (!request) return;
                    const approve = button.classList.contains('approve-admin-request');
                    const updates = {};
                    updates[`profile_update_requests/${request.id}/status`] = approve ? 'approved' : 'rejected';
                    updates[`profile_update_requests/${request.id}/${approve ? 'approvedBy' : 'rejectedBy'}`] = ownerUid;
                    updates[`profile_update_requests/${request.id}/${approve ? 'approvedAt' : 'rejectedAt'}`] = Date.now();
                    if (approve) Object.entries(request.requestedData || {}).forEach(([key, value]) => { updates[`users/${request.userId}/${key}`] = value; });
                    await ownerAuth.database().ref().update(updates);
                    notify(approve ? 'Administrator update approved.' : 'Administrator update rejected.', 'success');
                    render();
                }));
            } catch (error) {
                console.error('Could not load administrator update requests:', error);
                list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Could not load requests.')}</div>`;
            }
        };
        section.querySelector('#refresh-admin-profile-requests').addEventListener('click', render);
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-admin-profile-requests'); render(); });
    }

    function addSubscriptionResubscribeRequestsPanel() {
        const nav = document.querySelector('.nav-links');
        const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-subscription-requests')) return;

        const item = document.createElement('li');
        item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-subscription-requests"><i class="fas fa-rotate"></i>Re-subscription Requests</a>';
        nav.appendChild(item);

        const section = document.createElement('section');
        section.id = 'owner-subscription-requests';
        section.className = 'animated-section';
        section.style.display = 'none';
        section.innerHTML = `
            <div class="section-card">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <h2><i class="fas fa-rotate"></i> Re-subscription requests</h2>
                        <p class="text-muted mb-0">Choose a main plan, add optional capacity top-ups, and renew the institution from its request.</p>
                    </div>
                    <button type="button" class="btn btn-outline-secondary" id="refresh-subscription-requests"><i class="fas fa-sync"></i> Refresh</button>
                </div>
                <div id="owner-subscription-requests-list" class="mt-3"><p class="text-muted">Loading requests...</p></div>
            </div>`;
        main.appendChild(section);

        const render = async () => {
            const list = section.querySelector('#owner-subscription-requests-list');
            const ownerUid = ownerAuth.auth().currentUser?.uid;
            list.innerHTML = '<p class="text-muted">Loading requests...</p>';
            try {
                const requests = [];
                const ownedSchools = (typeof schools === 'undefined' ? [] : schools || []).filter(school => school.ownerId === ownerUid);
                const requestSnapshots = await Promise.all(ownedSchools.map(school => ownerAuth.database().ref(`subscriptionResubscribeRequests/${school.id}`).once('value')));
                requestSnapshots.forEach((schoolSnapshot, index) => {
                    const schoolId = ownedSchools[index].id;
                    schoolSnapshot.forEach(requestSnapshot => {
                        const request = requestSnapshot.val() || {};
                        if (request.ownerId === ownerUid && request.status === 'pending') {
                            requests.push({
                                schoolId,
                                requesterUid: requestSnapshot.key,
                                ...request
                            });
                        }
                    });
                });
                requests.sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
                if (!requests.length) {
                    list.innerHTML = '<div class="alert alert-light">No pending re-subscription requests.</div>';
                    return;
                }
                const mainPlans = pricingPlans.filter(plan => plan.active !== false && plan.type !== 'topup');
                const topupPlans = pricingPlans.filter(plan => plan.active !== false && plan.type === 'topup');
                list.innerHTML = requests.map((request, index) => {
                    const plan = request.requestedPlan;
                    const planSummary = plan?.name
                        ? `${plan.name} · ${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} · ${Number(plan.durationMonths || 0)} months · ${Number(plan.studentCapacity || 0).toLocaleString()} student records · ${Number(plan.teacherCapacity || 0).toLocaleString()} teacher accounts`
                        : 'No plan selected (legacy request)';
                    const selectedPlanId = mainPlans.some(item => item.id === plan?.id) ? plan.id : mainPlans[0]?.id;
                    const planOptions = mainPlans.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === selectedPlanId ? 'selected' : ''}>${escapeHtml(item.name || 'Plan')} · ${escapeHtml(item.currency || 'INR')} ${Number(item.price || 0).toLocaleString()} · ${Number(item.durationMonths || 0)} months</option>`).join('');
                    const topupOptions = topupPlans.length ? topupPlans.map(item => `<label class="d-flex justify-content-between align-items-center gap-2 border rounded p-2"><span>${escapeHtml(item.name || 'Top-up')} <small class="text-muted">${item.topupKind === 'months' ? `+${Number(item.durationMonths || 0)} months` : `${Number(item.studentCapacity || 0)} students · ${Number(item.teacherCapacity || 0)} teachers`} · ${escapeHtml(item.currency || 'INR')} ${Number(item.price || 0).toLocaleString()} each</small></span><input type="number" class="form-control form-control-sm request-topup-quantity" data-topup-id="${escapeAttr(item.id)}" min="0" max="99" step="1" value="0" aria-label="${escapeAttr(item.name || 'Top-up')} quantity" style="width:88px"></label>`).join('') : '<p class="text-muted mb-0">No active top-ups.</p>';
                    return `
                        <article class="card mb-3" data-request-index="${index}">
                            <div class="card-body">
                              <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                                <div>
                                    <h3 class="h6 mb-1">${escapeHtml(request.schoolName || 'Institution')}</h3>
                                    <p class="text-muted mb-2">${escapeHtml(request.schoolCode || request.schoolId || '')} · ${escapeHtml(request.requesterRole || 'Staff')} · ${escapeHtml(request.requesterName || 'Staff member')} (${escapeHtml(request.requesterEmail || '')})</p>
                                    <p class="mb-1"><strong>Requested plan:</strong> ${escapeHtml(planSummary)}</p>
                                    <small class="text-muted">Requested ${Number(request.requestedAt) ? new Date(Number(request.requestedAt)).toLocaleString() : 'date unavailable'} · Subscription ended ${escapeHtml(request.subscriptionEndDate || 'date unavailable')}</small>
                                </div>
                                <div class="d-flex gap-2 flex-wrap">
                                    <button type="button" class="btn btn-outline-primary open-request-subscription" data-school-id="${escapeHtml(request.schoolId)}">Open subscription</button>
                                    <button type="button" class="btn btn-success mark-subscription-request-reviewed" data-school-id="${escapeHtml(request.schoolId)}" data-requester-uid="${escapeHtml(request.requesterUid)}">Mark reviewed</button>
                                </div>
                              </div>
                              <div class="row g-3 mt-1">
                                <div class="col-12"><label class="form-label" for="request-main-plan-${index}">Main plan</label><select id="request-main-plan-${index}" class="form-select request-main-plan" ${mainPlans.length ? '' : 'disabled'}>${planOptions || '<option value="">No active main plans</option>'}</select></div>
                                <div class="col-12"><div class="small fw-semibold mb-2">Optional top-ups (quantity)</div><div class="d-grid gap-2">${topupOptions}</div></div>
                                <div class="col-12"><button type="button" class="btn btn-primary fulfill-subscription-request" ${mainPlans.length ? '' : 'disabled'}>Apply plan and top-ups</button></div>
                              </div>
                            </div>
                        </article>`;
                }).join('');

                list.querySelectorAll('.open-request-subscription').forEach(button => {
                    button.addEventListener('click', () => switchSection('owner-pricing'));
                });
                list.querySelectorAll('.fulfill-subscription-request').forEach(button => {
                    button.addEventListener('click', async () => {
                        const card = button.closest('[data-request-index]');
                        const request = requests[Number(card?.dataset.requestIndex)];
                        const planId = card?.querySelector('.request-main-plan')?.value;
                        const selectedTopups = Array.from(card?.querySelectorAll('.request-topup-quantity') || []).map(input => ({ id: input.dataset.topupId, quantity: Number(input.value || 0) }));
                        button.disabled = true;
                        try {
                            await fulfillSubscriptionRequest(request, planId, selectedTopups, ownerUid);
                            notify('Subscription renewed and request fulfilled.', 'success');
                            await refreshSchoolData();
                            await render();
                        } catch (error) {
                            console.error('Could not fulfill re-subscription request:', error);
                            notify(error.message || 'Could not renew this subscription.', 'danger');
                            button.disabled = false;
                        }
                    });
                });
                list.querySelectorAll('.mark-subscription-request-reviewed').forEach(button => {
                    button.addEventListener('click', async () => {
                        button.disabled = true;
                        const path = `subscriptionResubscribeRequests/${button.dataset.schoolId}/${button.dataset.requesterUid}`;
                        try {
                            await ownerAuth.database().ref(path).update({
                                status: 'reviewed',
                                reviewedBy: ownerUid,
                                reviewedAt: Date.now()
                            });
                            notify('Request marked as reviewed. Access remains paused until the subscription is renewed.', 'success');
                            await render();
                        } catch (error) {
                            console.error('Could not update re-subscription request:', error);
                            notify(error.message || 'Could not update the request.', 'danger');
                            button.disabled = false;
                        }
                    });
                });
            } catch (error) {
                console.error('Could not load re-subscription requests:', error);
                list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Could not load requests.')}</div>`;
            }
        };

        section.querySelector('#refresh-subscription-requests').addEventListener('click', render);
        section._renderSubscriptionRequests = render;

        async function fulfillSubscriptionRequest(request, planId, selectedTopups, ownerUid) {
            if (!request?.schoolId || !request?.requesterUid || !ownerUid) throw new Error('Request or owner session is missing. Refresh and try again.');
            const selectedPlan = pricingPlans.find(item => item.id === planId && item.active !== false && item.type !== 'topup');
            if (!selectedPlan) throw new Error('Select an active main plan.');
            const startDate = new Date();
            let endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + Number(selectedPlan.durationMonths || 0));
            if (!Number.isFinite(endDate.getTime()) || endDate <= startDate) throw new Error('The selected plan has an invalid duration.');

            const termExtensionMonths = (selectedTopups || []).reduce((total, selection) => {
                const item = pricingPlans.find(plan => plan.id === selection.id && plan.active !== false && plan.type === 'topup' && plan.topupKind === 'months');
                return total + (item ? Number(item.durationMonths || 0) * Number(selection.quantity || 0) : 0);
            }, 0);
            const basePlanEnd = new Date(endDate);
            if (termExtensionMonths) endDate = addCalendarMonths(endDate, termExtensionMonths);

            const topups = [];
            for (const selection of selectedTopups || []) {
                const quantity = Number(selection.quantity);
                if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw new Error('Top-up quantities must be whole numbers from 0 to 99.');
                const topup = pricingPlans.find(item => item.id === selection.id && item.active !== false && item.type === 'topup');
                if (!topup && quantity) throw new Error('A selected top-up is no longer available. Refresh and try again.');
                if (!quantity) continue;
                for (let count = 0; count < quantity; count += 1) {
                    const isTermTopup = topup.topupKind === 'months';
                    const bonus = topup.bonus === true;
                    topups.push({ planId: topup.id, name: topup.name || 'Top-up', topupKind: isTermTopup ? 'months' : 'capacity', monthsAdded: isTermTopup ? Number(topup.durationMonths || 0) : 0, studentCapacity: isTermTopup ? 0 : bonus && topup.bonusStudentCapacity != null ? Number(topup.bonusStudentCapacity) : Number(topup.studentCapacity || 0), teacherCapacity: isTermTopup ? 0 : bonus && topup.bonusTeacherCapacity != null ? Number(topup.bonusTeacherCapacity) : Number(topup.teacherCapacity || 0), price: bonus ? 0 : Number(topup.price || 0), listPrice: Number(topup.price || 0), currency: topup.currency || selectedPlan.currency || 'INR', bonus, startDate: isTermTopup ? basePlanEnd.toISOString() : startDate.toISOString(), endDate: endDate.toISOString(), assignedAt: startDate.toISOString() });
                }
            }
            if (selectedPlan.bonus) topups.push(createBonusTopupEntry(selectedPlan, startDate, endDate));

            const db = ownerAuth.database();
            const requestPath = `subscriptionResubscribeRequests/${request.schoolId}/${request.requesterUid}`;
            const [liveRequestSnapshot, schoolSnapshot] = await Promise.all([
                db.ref(requestPath).once('value'),
                db.ref(`schools/${request.schoolId}`).once('value')
            ]);
            const liveRequest = liveRequestSnapshot.val();
            const school = schoolSnapshot.val();
            if (!liveRequest || liveRequest.status !== 'pending' || liveRequest.ownerId !== ownerUid) throw new Error('This request is no longer pending or is not assigned to your account. Refresh the list.');
            if (!school || school.ownerId !== ownerUid) throw new Error('You do not own this institution.');
            const usage = schoolUserUsage[request.schoolId] || { students: 0, teachers: 0 };
            const oldSubscription = school.subscription || {};
            const retainedTopups = Array.isArray(oldSubscription.topups) ? oldSubscription.topups.filter(item => Date.parse(item.endDate || '') > startDate.getTime() && !item.includedWithPlan) : [];
            const allTopups = [...retainedTopups, ...topups];
            const priceBreakdown = { [selectedPlan.currency || 'INR']: Number(selectedPlan.price || 0) };
            allTopups.forEach(item => { const currency = item.currency || selectedPlan.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const subscription = { ...oldSubscription, plan: selectedPlan.name || '', planId: selectedPlan.id, price: Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(selectedPlan.price || 0), basePlanPrice: Number(selectedPlan.price || 0), priceBreakdown, currency: selectedPlan.currency || 'INR', durationMonths: Number(selectedPlan.durationMonths || 0), termExtensionMonths, autoRenew: Boolean(selectedPlan.autoRenew), studentCapacity: Number(selectedPlan.studentCapacity || 0), teacherCapacity: Number(selectedPlan.teacherCapacity || 0), topups: allTopups, usage: { students: usage.students, teachers: usage.teachers, updatedAt: Date.now() }, startDate: startDate.toISOString(), endDate: endDate.toISOString(), status: 'active', updatedAt: Date.now() };
            const timestamp = Date.now();
            const updates = {
                [`schools/${request.schoolId}/status`]: 'Active',
                [`schools/${request.schoolId}/subscription`]: subscription,
                [`schools/${request.schoolId}/lastUpdated`]: startDate.toISOString(),
                [`publicSchools/${request.schoolId}/status`]: 'Active',
                [`publicSchools/${request.schoolId}/subscriptionEndDate`]: subscription.endDate,
                [`publicSchools/${request.schoolId}/updatedAt`]: timestamp,
                [`subscriptionResubscribeRequests/${request.schoolId}/${request.requesterUid}`]: null,
                [`subscriptionExpiryOverlayCounts/${request.schoolId}`]: null
            };
            await db.ref().update(updates);
            await ownerPath(`schools/${request.schoolId}`).update({ status: 'Active', subscription, lastUpdated: startDate.toISOString() }).catch(() => {});
        }
    }

    function addManageTeachersPanel() {
        const nav = document.querySelector('.nav-links');
        const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-teachers')) return;
        const item = document.createElement('li');
        item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-teachers"><i class="fas fa-chalkboard-teacher"></i>Manage Teachers</a>';
        nav.appendChild(item);

        const section = document.createElement('section');
        section.id = 'owner-teachers';
        section.className = 'animated-section';
        section.style.display = 'none';
        section.innerHTML = `
            <div class="section-card">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                    <div><h2><i class="fas fa-chalkboard-teacher"></i> Manage teachers</h2><p class="text-muted mb-0">Create teacher sign-in accounts, assign them to a school, and manage teacher and class-teacher access.</p></div>
                    <button type="button" class="btn btn-outline-secondary" id="refresh-owner-teachers"><i class="fas fa-sync"></i> Refresh</button>
                </div>
                <form id="owner-create-teacher-form" class="row g-3 border rounded p-3 mb-4">
                    <div class="col-12"><h3 class="h5 mb-0">Create teacher account</h3></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherSchool">School / college</label><select id="ownerTeacherSchool" class="form-select" required><option value="">Select an institution</option></select></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherName">Full name</label><input id="ownerTeacherName" class="form-control" required maxlength="120"></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherEmail">Email address</label><input id="ownerTeacherEmail" type="email" class="form-control" required autocomplete="email"></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherDob">Date of birth (DOB) *</label><input id="ownerTeacherDob" type="date" class="form-control" required><div class="form-text">Used for identity verification and password reset.</div></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherPassword">Temporary password</label><input id="ownerTeacherPassword" type="password" class="form-control" required minlength="8" autocomplete="new-password"><div class="form-text">At least 8 characters. Share it with the teacher securely.</div></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherRole">Teacher role</label><select id="ownerTeacherRole" class="form-select"><option value="teacher">Teacher</option><option value="classTeacher">Class Teacher</option></select></div>
                    <div class="col-md-4"><label class="form-label" for="ownerTeacherSections">Sections</label><input id="ownerTeacherSections" class="form-control" placeholder="e.g. 8-A, 8-B"><div class="form-text">Required for Class Teacher; assigns access to these sections.</div></div>
                    <div class="col-12"><button type="submit" class="btn btn-primary" id="ownerCreateTeacherButton"><i class="fas fa-user-plus"></i> Create account</button></div>
                </form>
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                    <h3 class="h5 mb-0">Teacher accounts <span class="badge text-bg-light" id="ownerTeacherCount">0</span></h3>
                    <input id="ownerTeacherSearch" class="form-control" style="max-width:340px" type="search" placeholder="Search teacher, email, or school">
                </div>
                <div id="ownerTeacherDirectory"><p class="text-muted">Load teacher accounts to manage them.</p></div>
            </div>`;
        main.appendChild(section);

        const roleSelect = section.querySelector('#ownerTeacherRole');
        const sectionsInput = section.querySelector('#ownerTeacherSections');
        roleSelect.addEventListener('change', () => {
            const isClassTeacher = roleSelect.value === 'classTeacher';
            sectionsInput.required = isClassTeacher;
            sectionsInput.disabled = !isClassTeacher;
            if (!isClassTeacher) sectionsInput.value = '';
        });
        roleSelect.dispatchEvent(new Event('change'));
        section.querySelector('#owner-create-teacher-form').addEventListener('submit', createOwnerTeacher);
        section.querySelector('#refresh-owner-teachers').addEventListener('click', loadOwnerTeachers);
        section.querySelector('#ownerTeacherSearch').addEventListener('input', renderOwnerTeachers);
        item.querySelector('a').addEventListener('click', event => {
            event.preventDefault();
            switchSection('owner-teachers');
            loadOwnerTeachers();
        });
        renderOwnerTeacherSchoolOptions();
    }

    function renderOwnerTeacherSchoolOptions() {
        const select = document.getElementById('ownerTeacherSchool');
        if (!select) return;
        const selected = select.value;
        select.replaceChildren(new Option('Select an institution', ''));
        (schools || []).filter(school => school?.id).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => {
            select.appendChild(new Option(`${school.name || 'Unnamed institution'} · ${school.code || school.id}`, school.id));
        });
        if ((schools || []).some(school => school.id === selected)) select.value = selected;
    }

    function ownerTeacherSections(value) {
        return [...new Set(String(value || '').split(',').map(section => section.trim()).filter(Boolean))];
    }

    function ownerSectionKey(value) {
        return Array.from(new TextEncoder().encode(String(value).trim()), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function ownerTeacherRoleProfile(role, sections, actorId) {
        const isClassTeacher = role === 'classTeacher';
        return {
            teacherType: isClassTeacher ? 'classTeacher' : 'teacher',
            classTeacherEnabled: isClassTeacher,
            roles: isClassTeacher ? ['teacher', 'classTeacher'] : ['teacher'],
            classTeacherSection: isClassTeacher ? sections[0] : null,
            classTeacherSections: isClassTeacher ? sections : [],
            sectionsAssignedAt: Date.now(),
            sectionsAssignedBy: actorId
        };
    }

    async function createOwnerTeacher(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const schoolId = document.getElementById('ownerTeacherSchool').value;
        const school = (schools || []).find(item => item.id === schoolId);
        const name = document.getElementById('ownerTeacherName').value.trim();
        const email = document.getElementById('ownerTeacherEmail').value.trim().toLowerCase();
        const dob = document.getElementById('ownerTeacherDob')?.value?.trim() || '';
        const password = document.getElementById('ownerTeacherPassword').value;
        const role = document.getElementById('ownerTeacherRole').value === 'classTeacher' ? 'classTeacher' : 'teacher';
        const sections = ownerTeacherSections(document.getElementById('ownerTeacherSections').value);
        const button = document.getElementById('ownerCreateTeacherButton');
        if (!currentUser || !database) return notify('The owner database is not connected. Please reconnect and try again.', 'danger');
        if (!school) return notify('Select a valid school or college.', 'warning');
        if (!name || !email || !dob || password.length < 8) return notify('Enter the teacher name, email, date of birth, and a password with at least 8 characters.', 'warning');
        if (dob > new Date().toISOString().split('T')[0]) return notify('Date of birth cannot be in the future.', 'warning');
        if (role === 'classTeacher' && !sections.length) return notify('Enter at least one section for a Class Teacher account.', 'warning');

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        let temporaryApp = null;
        let createdUser = null;
        try {
            temporaryApp = firebase.initializeApp(ownerAuth.options, `ownerTeacher-${schoolId}-${Date.now()}`);
            const credential = await temporaryApp.auth().createUserWithEmailAndPassword(email, password);
            createdUser = credential.user;
            await createdUser.updateProfile({ displayName: name });
            const teacherEmail = createdUser.email || email;
            const teacher = {
                uid: createdUser.uid,
                name,
                email: teacherEmail,
                username: email.split('@')[0],
                dob,
                dateOfBirth: dob,
                role: 'teacher',
                schoolId,
                schoolName: school.name || '',
                createdAt: new Date().toISOString(),
                createdBy: currentUser.uid,
                ...ownerTeacherRoleProfile(role, sections, currentUser.uid),
                assignedSections: role === 'classTeacher' ? sections : []
            };
            const updates = { [`users/${createdUser.uid}`]: teacher };
            if (role === 'classTeacher') {
                for (const sectionName of sections) {
                    const key = ownerSectionKey(sectionName);
                    const existing = await database.ref(`classTeacherAssignments/${schoolId}/${key}`).once('value');
                    if (existing.exists() && existing.val()?.teacherId) throw new Error(`${sectionName} already has a class teacher.`);
                    updates[`classTeacherAssignments/${schoolId}/${key}`] = {
                        teacherId: createdUser.uid,
                        teacherName: name,
                        teacherEmail,
                        schoolId,
                        section: sectionName,
                        updatedAt: Date.now(),
                        updatedBy: currentUser.uid
                    };
                }
            }
            await database.ref().update(updates);
            form.reset();
            form.querySelector('#ownerTeacherRole').dispatchEvent(new Event('change'));
            notify(`Teacher account created for ${school.name || 'the selected institution'}. Share the temporary password securely.`, 'success');
            await loadOwnerTeachers();
        } catch (error) {
            console.error('Could not create teacher account from the owner portal:', error);
            if (createdUser) {
                try { await createdUser.delete(); }
                catch (cleanupError) { console.error('Could not remove the unlinked teacher authentication account:', cleanupError); }
            }
            notify(`Could not create the teacher account: ${error.message || 'Unknown error.'}`, 'danger');
        } finally {
            if (temporaryApp) {
                await temporaryApp.auth().signOut().catch(error => console.warn('Temporary teacher session could not be signed out.', error));
                await temporaryApp.delete().catch(error => console.warn('Temporary teacher Firebase app could not be deleted.', error));
            }
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-user-plus"></i> Create account';
        }
    }

    function ownerTeacherRole(teacher) {
        const roles = Array.isArray(teacher.roles)
            ? teacher.roles
            : (teacher.roles && typeof teacher.roles === 'object' ? Object.keys(teacher.roles).filter(role => teacher.roles[role]) : []);
        return teacher.teacherType === 'classTeacher' || teacher.classTeacherEnabled === true || roles.includes('classTeacher') ? 'classTeacher' : 'teacher';
    }

    async function saveOwnerTeacherAccess(button, teacher) {
        const row = button.closest('tr');
        const role = row.querySelector('.owner-teacher-role').value;
        const sections = ownerTeacherSections(row.querySelector('.owner-teacher-sections').value);
        if (role === 'classTeacher' && !sections.length) return notify('Enter at least one section for a Class Teacher.', 'warning');
        button.disabled = true;
        try {
            const schoolId = teacher.schoolId;
            const snapshot = await database.ref(`classTeacherAssignments/${schoolId}`).once('value');
            const updates = {};
            const selected = new Map(sections.map(section => [ownerSectionKey(section), section]));
            snapshot.forEach(child => {
                const assignment = child.val() || {};
                if (assignment.teacherId === teacher.id) updates[`classTeacherAssignments/${schoolId}/${child.key}`] = null;
                else if (role === 'classTeacher' && selected.has(child.key) && assignment.teacherId) {
                    throw new Error(`${assignment.section || selected.get(child.key)} already has a class teacher.`);
                }
            });
            Object.entries(ownerTeacherRoleProfile(role, sections, currentUser.uid)).forEach(([key, value]) => {
                updates[`users/${teacher.id}/${key}`] = value;
            });
            if (role === 'classTeacher') {
                updates[`users/${teacher.id}/assignedSections`] = sections;
                sections.forEach(section => {
                    updates[`classTeacherAssignments/${schoolId}/${ownerSectionKey(section)}`] = {
                        teacherId: teacher.id,
                        teacherName: teacher.name || teacher.email || '',
                        teacherEmail: teacher.email || '',
                        schoolId,
                        section,
                        updatedAt: Date.now(),
                        updatedBy: currentUser.uid
                    };
                });
            }
            await database.ref().update(updates);
            notify(`Access updated for ${teacher.name || teacher.email || 'teacher'}.`, 'success');
            await loadOwnerTeachers();
        } catch (error) {
            console.error('Could not update teacher role or sections:', error);
            notify(`Could not update teacher access: ${error.message || 'Unknown error.'}`, 'danger');
            button.disabled = false;
        }
    }

    function renderOwnerTeachers() {
        const directory = document.getElementById('ownerTeacherDirectory');
        if (!directory) return;
        const allTeachers = window.ownerTeacherRecords || [];
        const search = String(document.getElementById('ownerTeacherSearch')?.value || '').trim().toLowerCase();
        const teachers = allTeachers.filter(teacher => `${teacher.name || ''} ${teacher.email || ''} ${teacher.schoolName || ''} ${teacher.schoolCode || ''}`.toLowerCase().includes(search));
        const count = document.getElementById('ownerTeacherCount');
        if (count) count.textContent = String(allTeachers.length);
        if (!teachers.length) {
            directory.innerHTML = `<div class="alert alert-light">${search ? 'No teacher accounts match your search.' : 'No teacher accounts are registered yet.'}</div>`;
            return;
        }
        directory.innerHTML = `<div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Teacher</th><th>School / college</th><th>Account role</th><th>Class-teacher sections</th><th>Manage</th></tr></thead><tbody>${teachers.map(teacher => `
            <tr data-teacher-id="${escapeAttr(teacher.id)}">
                <td><strong>${escapeHtml(teacher.name || 'Unnamed teacher')}</strong><div class="small text-muted">${escapeHtml(teacher.email || 'No email on account')}</div></td>
                <td>${escapeHtml(teacher.schoolName || teacher.schoolId || 'Unknown institution')}<div class="small text-muted">${escapeHtml(teacher.schoolCode || '')}</div></td>
                <td><select class="form-select form-select-sm owner-teacher-role" aria-label="Role for ${escapeAttr(teacher.name || teacher.email || 'teacher')}"><option value="teacher">Teacher</option><option value="classTeacher">Class Teacher</option></select></td>
                <td><input class="form-control form-control-sm owner-teacher-sections" aria-label="Class-teacher sections for ${escapeAttr(teacher.name || teacher.email || 'teacher')}" placeholder="e.g. 8-A, 8-B"></td>
                <td><button type="button" class="btn btn-sm btn-primary owner-save-teacher-access">Save access</button></td>
            </tr>`).join('')}</tbody></table></div>`;
        teachers.forEach(teacher => {
            const row = directory.querySelector(`tr[data-teacher-id="${CSS.escape(teacher.id)}"]`);
            const roleSelect = row.querySelector('.owner-teacher-role');
            const sectionsInput = row.querySelector('.owner-teacher-sections');
            roleSelect.value = ownerTeacherRole(teacher);
            const sections = Array.isArray(teacher.classTeacherSections)
                ? teacher.classTeacherSections
                : (teacher.classTeacherSections && typeof teacher.classTeacherSections === 'object'
                    ? Object.keys(teacher.classTeacherSections).filter(section => teacher.classTeacherSections[section])
                    : (teacher.classTeacherSection ? [teacher.classTeacherSection] : []));
            sectionsInput.value = sections.join(', ');
            sectionsInput.disabled = roleSelect.value !== 'classTeacher';
            roleSelect.addEventListener('change', () => { sectionsInput.disabled = roleSelect.value !== 'classTeacher'; });
            row.querySelector('.owner-save-teacher-access').addEventListener('click', event => saveOwnerTeacherAccess(event.currentTarget, teacher));
        });
    }

    async function loadOwnerTeachers() {
        const directory = document.getElementById('ownerTeacherDirectory');
        if (!directory) return;
        renderOwnerTeacherSchoolOptions();
        if (!database || !currentUser || window.__rollCallOwnerAuthorizedUid !== currentUser.uid) {
            directory.innerHTML = '<div class="alert alert-warning">Verify owner access and connect the shared database to manage teachers.</div>';
            return;
        }
        directory.innerHTML = '<p class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading teacher accounts...</p>';
        try {
            const [teacherSnapshot, schoolSnapshot] = await Promise.all([
                database.ref('users').orderByChild('role').equalTo('teacher').once('value'),
                database.ref('schools').once('value')
            ]);
            schools = Object.entries(schoolSnapshot.val() || {}).map(([id, value]) => ({ id, ...value }));
            const schoolById = new Map(schools.map(school => [school.id, school]));
            window.ownerTeacherRecords = [];
            teacherSnapshot.forEach(child => {
                const teacher = child.val() || {};
                const schoolId = String(teacher.schoolId || '').trim();
                const school = schoolById.get(schoolId);
                if (!school) return;
                window.ownerTeacherRecords.push({ ...teacher, id: child.key, schoolId, schoolName: teacher.schoolName || school.name || '', schoolCode: school.code || '' });
            });
            window.ownerTeacherRecords.sort((a, b) => String(a.schoolName || '').localeCompare(String(b.schoolName || '')) || String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')));
            renderOwnerTeacherSchoolOptions();
            renderOwnerTeachers();
        } catch (error) {
            console.error('Could not load owner teacher directory:', error);
            directory.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Could not load teacher accounts.')}</div>`;
        }
    }

    function renderSchoolPlanOptions() {
        const grid = document.getElementById('registrationMainPlanOptions');
        const available = pricingPlans.filter(plan => plan.active !== false);
        const mainPlans = available.filter(plan => plan.type !== 'topup');
        const topupPlans = available.filter(plan => plan.type === 'topup');
        if (!grid) return;
        grid.replaceChildren();
        if (!mainPlans.length) {
            const empty = document.createElement('div');
            empty.className = 'col-12';
            empty.innerHTML = '<div class="alert alert-warning mb-0">No active main plans are available. Create a plan in Plans & subscriptions before registering a school.</div>';
            grid.appendChild(empty);
            return;
        }
        mainPlans.forEach((plan, index) => {
            const column = document.createElement('div'); column.className = 'col-md-6';
            const card = document.createElement('div'); card.className = 'card mb-3';
            const body = document.createElement('div'); body.className = 'card-body';
            const title = document.createElement('h5'); title.className = 'card-title'; title.textContent = plan.name;
            const detail = document.createElement('p'); detail.className = 'card-text'; detail.textContent = `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} · ${plan.durationMonths || 1} months · ${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers`;
            const label = document.createElement('label'); label.className = 'form-check-label'; label.htmlFor = `registrationPlan-${plan.id}`; label.textContent = 'Select plan';
            const radio = document.createElement('input'); radio.className = 'form-check-input me-2'; radio.type = 'radio'; radio.name = 'subscriptionPlan'; radio.id = `registrationPlan-${plan.id}`; radio.value = plan.id; radio.checked = index === 0;
            const check = document.createElement('div'); check.className = 'form-check'; check.append(radio, label);
            body.append(title, detail, check); card.append(body); column.append(card); grid.append(column);
        });
        const topupSection = document.createElement('div');
        topupSection.className = 'col-12 mt-2';
            topupSection.innerHTML = '<h6><i class="fas fa-plus-circle me-2"></i>Additional top-ups <span class="text-muted fw-normal">(optional)</span></h6><p class="small text-muted">Capacity top-ups use the main plan period. Extra-month top-ups extend the subscription end date.</p>';
        if (!topupPlans.length) {
            const empty = document.createElement('p');
            empty.className = 'small text-muted';
            empty.textContent = 'No top-up offers are currently available.';
            topupSection.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'row g-2';
            topupPlans.forEach(plan => {
                const column = document.createElement('div');
                column.className = 'col-md-6';
                column.innerHTML = `<div class="border rounded p-3 h-100"><div class="d-flex justify-content-between gap-2"><div><strong class="topup-name"></strong><div class="small text-muted topup-details"></div></div><div class="input-group input-group-sm" style="max-width:130px"><button type="button" class="btn btn-outline-secondary topup-minus" aria-label="Decrease top-up quantity">−</button><input class="form-control text-center topup-quantity" type="number" min="0" max="99" value="0" inputmode="numeric" aria-label="Top-up quantity"><button type="button" class="btn btn-outline-secondary topup-plus" aria-label="Increase top-up quantity">+</button></div></div></div>`;
                column.querySelector('.topup-name').textContent = plan.name;
                column.querySelector('.topup-details').textContent = plan.topupKind === 'months'
                    ? `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} each · adds ${Number(plan.durationMonths || 0)} months`
                    : `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} each · ${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers`;
                column.dataset.planId = plan.id;
                const quantity = column.querySelector('.topup-quantity');
                quantity.name = `topupQuantity-${plan.id}`;
                column.querySelector('.topup-minus').addEventListener('click', () => { quantity.value = String(Math.max(0, Number(quantity.value || 0) - 1)); updateRegistrationPlanSummary(); });
                column.querySelector('.topup-plus').addEventListener('click', () => { quantity.value = String(Math.min(99, Number(quantity.value || 0) + 1)); updateRegistrationPlanSummary(); });
                quantity.addEventListener('input', updateRegistrationPlanSummary);
                list.appendChild(column);
            });
            topupSection.appendChild(list);
        }
        const summary = document.createElement('div');
        summary.id = 'registrationPlanSummary';
        summary.className = 'alert alert-light border mt-3 mb-0';
        topupSection.appendChild(summary);
        grid.appendChild(topupSection);
        document.querySelectorAll('#schoolRegistrationForm [name="subscriptionPlan"]').forEach(radio => radio.addEventListener('change', updateRegistrationPlanSummary));
        updateRegistrationPlanSummary();
    }

    function updateRegistrationPlanSummary() {
        const summary = document.getElementById('registrationPlanSummary');
        if (!summary) return;
        const selected = document.querySelector('#schoolRegistrationForm [name=subscriptionPlan]:checked');
        const plan = pricingPlans.find(item => item.id === selected?.value || item.name === selected?.value);
        const topupTotals = Array.from(document.querySelectorAll('#schoolRegistrationForm .topup-quantity')).reduce((total, input) => {
            const count = Math.max(0, Number(input.value) || 0);
            const item = pricingPlans.find(candidate => candidate.id === input.closest('[data-plan-id]')?.dataset.planId);
            if (item) {
                total.count += count;
                const currency = item.currency || plan?.currency || 'INR';
                total.priceByCurrency[currency] = Number(total.priceByCurrency[currency] || 0) + count * Number(item.price || 0);
                total.months += item.topupKind === 'months' ? count * Number(item.durationMonths || 0) : 0;
                total.students += count * Number(item.studentCapacity || 0);
                total.teachers += count * Number(item.teacherCapacity || 0);
            }
            return total;
        }, { count: 0, months: 0, priceByCurrency: {}, students: 0, teachers: 0 });
        const mainPrice = Number(plan?.price || 0);
        const mainStudents = Number(plan?.studentCapacity || 0);
        const mainTeachers = Number(plan?.teacherCapacity || 0);
        const priceByCurrency = { [plan?.currency || 'INR']: mainPrice };
        Object.entries(topupTotals.priceByCurrency).forEach(([currency, amount]) => { priceByCurrency[currency] = Number(priceByCurrency[currency] || 0) + amount; });
        const priceSummary = Object.entries(priceByCurrency).map(([currency, amount]) => currency + ' ' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })).join(' + ');
        summary.textContent = (plan?.name || 'Select a main plan') + ' · Total: ' + (plan ? priceSummary : '—') + ' · ' + (mainStudents + topupTotals.students) + ' student records · ' + (mainTeachers + topupTotals.teachers) + ' teacher records' + (topupTotals.months ? ' · +' + topupTotals.months + ' months' : '') + (topupTotals.count ? ' · ' + topupTotals.count + ' top-up' + (topupTotals.count === 1 ? '' : 's') : '');
    }

    function installSchoolEditModal() {
        if (document.getElementById('ownerSchoolEditModal')) return;
        const modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = 'ownerSchoolEditModal'; modal.tabIndex = -1;
        modal.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content"><form id="ownerSchoolEditForm"><div class="modal-header"><div><h2 class="modal-title fs-5">Edit school details</h2><div class="small text-muted">School code is fixed because staff use it to connect their accounts.</div></div><button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><input id="ownerEditSchoolId" type="hidden"><div class="row g-3"><div class="col-md-6"><label class="form-label" for="ownerEditName">School name</label><input class="form-control" id="ownerEditName" required></div><div class="col-md-6"><label class="form-label" for="ownerEditType">School type</label><input class="form-control" id="ownerEditType"></div><div class="col-md-6"><label class="form-label" for="ownerEditPhone">Contact phone</label><input class="form-control" id="ownerEditPhone"></div><div class="col-md-6"><label class="form-label" for="ownerEditCity">City</label><input class="form-control" id="ownerEditCity"></div><div class="col-12"><label class="form-label" for="ownerEditAddress">Address</label><textarea class="form-control" id="ownerEditAddress" rows="2"></textarea></div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" type="submit">Save school details</button></div></form></div></div>`;
        document.body.append(modal);
        modal.querySelector('form').addEventListener('submit', saveSchoolDetails);
    }

    function openSchoolEdit(school) {
        installSchoolEditModal();
        document.getElementById('ownerEditSchoolId').value = school.id;
        document.getElementById('ownerEditName').value = school.name || '';
        document.getElementById('ownerEditType').value = school.type || '';
        document.getElementById('ownerEditPhone').value = school.contacts?.phone || school.contact || '';
        document.getElementById('ownerEditCity').value = school.address?.city || '';
        document.getElementById('ownerEditAddress').value = school.address?.complete || school.location || '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('ownerSchoolEditModal')).show();
    }

    async function saveSchoolDetails(event) {
        event.preventDefault();
        const id = document.getElementById('ownerEditSchoolId').value;
        const school = (schools || []).find(item => item.id === id);
        if (!school) return notify('School record could not be found. Refresh the list and retry.', 'danger');
        const updates = { name: document.getElementById('ownerEditName').value.trim(), type: document.getElementById('ownerEditType').value.trim(), 'contacts/phone': document.getElementById('ownerEditPhone').value.trim(), 'address/city': document.getElementById('ownerEditCity').value.trim(), 'address/complete': document.getElementById('ownerEditAddress').value.trim(), lastUpdated: new Date().toISOString() };
        try {
            await database.ref(`schools/${id}`).update(updates);
            await database.ref(`publicSchools/${id}`).update({ name: updates.name, type: updates.type, updatedAt: Date.now() });
            await ownerPath(`schools/${id}`).update(updates).catch(() => {});
            bootstrap.Modal.getInstance(document.getElementById('ownerSchoolEditModal'))?.hide();
            notify('School details updated.', 'success');
        } catch (error) { notify(`Could not update school details: ${error.message}`, 'danger'); }
    }

    async function loadPricingPlans() {
        if (!currentUser || !ownerAuth) return;
        try {
            const snap = await ownerPath('pricingPlans').once('value');
            pricingPlans = snap.val() ? Object.entries(snap.val()).map(([id, value]) => ({ id, ...value })) : [];
            window.ownerPricingPlans = pricingPlans;
            await loadSchoolUserUsage();
            renderPricingPlans();
            renderSchoolPlanOptions();
            renderSubscriptionRows();
            document.getElementById('owner-subscription-requests')?._renderSubscriptionRequests?.();
        } catch (error) { console.error('Unable to load pricing plans', error); }
    }

    async function loadSchoolUserUsage() {
        if (!database) return;
        const snapshot = await database.ref('users').once('value');
        schoolUserUsage = {};
        Object.values(snapshot.val() || {}).forEach(user => {
            const schoolId = String(user?.schoolId || '');
            const role = String(user?.role || '').toLowerCase();
            if (!schoolId || role === 'admin' || (role !== 'student' && role !== 'teacher')) return;
            if (!schoolUserUsage[schoolId]) schoolUserUsage[schoolId] = { students: 0, teachers: 0 };
            schoolUserUsage[schoolId][role === 'student' ? 'students' : 'teachers'] += 1;
        });
    }

    async function savePricingPlan(event) {
        event.preventDefault();
        if (!currentUser) return notify('Sign in to save pricing plans.', 'danger');
        const id = document.getElementById('ownerPlanId').value || ownerPath('pricingPlans').push().key;
        const existing = pricingPlans.find(plan => plan.id === id);
        const type = document.getElementById('ownerPlanType').value === 'topup' ? 'topup' : 'plan';
        const bonus = type === 'plan' && document.getElementById('ownerPlanBonus').checked;
        const bonusStudentInput = bonus ? document.getElementById('ownerPlanBonusStudentCapacity').value.trim() : '';
        const bonusTeacherInput = bonus ? document.getElementById('ownerPlanBonusTeacherCapacity').value.trim() : '';
        const topupKind = type === 'topup' && document.getElementById('ownerPlanTopupKind').value === 'months' ? 'months' : 'capacity';
        const durationMonths = type === 'topup' && topupKind !== 'months' ? 1 : Number(document.getElementById('ownerPlanMonths').value);
        const plan = { name: document.getElementById('ownerPlanName').value.trim(), type, topupKind, price: Number(document.getElementById('ownerPlanPrice').value), currency: document.getElementById('ownerPlanCurrency').value, durationMonths, autoRenew: type === 'plan' && document.getElementById('ownerPlanAutoRenew').checked, studentCapacity: topupKind === 'months' ? 0 : Number(document.getElementById('ownerPlanStudentCapacity').value), teacherCapacity: topupKind === 'months' ? 0 : Number(document.getElementById('ownerPlanTeacherCapacity').value), bonus, bonusStudentCapacity: bonusStudentInput === '' ? null : Number(bonusStudentInput), bonusTeacherCapacity: bonusTeacherInput === '' ? null : Number(bonusTeacherInput), features: document.getElementById('ownerPlanFeatures').value.split(',').map(value => value.trim()).filter(Boolean), active: existing ? existing.active !== false : true, updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now() };
        if (!plan.name || !Number.isFinite(plan.price) || plan.price < 0 || !Number.isInteger(plan.durationMonths) || plan.durationMonths < 1 || !Number.isInteger(plan.studentCapacity) || plan.studentCapacity < 0 || !Number.isInteger(plan.teacherCapacity) || plan.teacherCapacity < 0 || (plan.bonusStudentCapacity !== null && (!Number.isInteger(plan.bonusStudentCapacity) || plan.bonusStudentCapacity < 0)) || (plan.bonusTeacherCapacity !== null && (!Number.isInteger(plan.bonusTeacherCapacity) || plan.bonusTeacherCapacity < 0))) return notify('Enter a name, valid price, whole-number term, and non-negative whole-number capacities.', 'warning');
        try { await ownerPath(`pricingPlans/${id}`).set(plan); resetPricingForm(); await loadPricingPlans(); notify('Pricing plan saved.', 'success'); }
        catch (error) { notify(`Could not save pricing plan: ${error.message}`, 'danger'); }
    }

    function resetPricingForm() {
        document.getElementById('ownerPlanForm')?.reset();
        document.getElementById('ownerPlanId').value = '';
        document.getElementById('ownerPlanMonths').value = 12;
        document.getElementById('ownerPlanType').value = 'plan';
        document.getElementById('ownerPlanTopupKind').value = 'capacity';
        document.getElementById('ownerPlanStudentCapacity').value = 0;
        document.getElementById('ownerPlanTeacherCapacity').value = 0;
        document.getElementById('ownerPlanBonusStudentCapacity').value = '';
        document.getElementById('ownerPlanBonusTeacherCapacity').value = '';
        document.getElementById('ownerPlanBonus').checked = false;
        document.getElementById('ownerPlanAutoRenew').checked = false;
        document.getElementById('ownerPlanBonus').disabled = true;
        document.getElementById('ownerPlanType').dispatchEvent(new Event('change'));
        document.getElementById('ownerPlanCancel').hidden = true;
    }

    function renderPricingPlans() {
        const rows = document.getElementById('ownerPlanRows');
        if (!rows) return;
        rows.innerHTML = pricingPlans.length ? '' : '<tr><td colspan="8" class="text-center text-muted py-4">No pricing plans yet. Add your first plan above.</td></tr>';
        pricingPlans.forEach(plan => {
            const row = document.createElement('tr');
            const amount = `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()}`;
            row.innerHTML = `<td class="fw-semibold"></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="text-nowrap"></td>`;
            row.cells[0].textContent = plan.name;
            row.cells[1].innerHTML = `<span class="badge text-bg-${plan.type === 'topup' ? 'warning' : 'primary'}">${plan.type === 'topup' ? 'Top-up' : 'Main plan'}</span>`;
            row.cells[2].textContent = plan.bonus ? 'Bonus' : amount;
            row.cells[3].textContent = plan.type === 'topup'
                ? plan.topupKind === 'months' ? `+${Number(plan.durationMonths || 0)} months extension` : 'Remaining subscription term'
                : `${plan.durationMonths || 1} months · ${plan.autoRenew ? 'Auto-renew on' : 'Manual renewal'}`;
            row.cells[4].textContent = plan.type === 'topup' && plan.topupKind === 'months' ? 'Extends subscription term' : `${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers${plan.bonus ? ` (bonus: ${plan.bonusStudentCapacity ?? 'default'} · ${plan.bonusTeacherCapacity ?? 'default'})` : ''}`;
            row.cells[5].textContent = Array.isArray(plan.features) ? plan.features.join(', ') : '';
            row.cells[6].innerHTML = `<span class="badge text-bg-${plan.active === false ? 'secondary' : 'success'}">${plan.active === false ? 'Inactive' : 'Active'}</span>`;
            const actions = document.createElement('div'); actions.className = 'd-flex gap-2';
            const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary'; edit.textContent = 'Edit'; edit.onclick = () => { document.getElementById('ownerPlanId').value = plan.id; document.getElementById('ownerPlanName').value = plan.name; document.getElementById('ownerPlanType').value = plan.type === 'topup' ? 'topup' : 'plan'; document.getElementById('ownerPlanTopupKind').value = plan.topupKind === 'months' ? 'months' : 'capacity'; document.getElementById('ownerPlanPrice').value = plan.price; document.getElementById('ownerPlanCurrency').value = plan.currency || 'INR'; document.getElementById('ownerPlanMonths').value = plan.durationMonths || 1; document.getElementById('ownerPlanAutoRenew').checked = plan.autoRenew === true; document.getElementById('ownerPlanStudentCapacity').value = plan.studentCapacity || 0; document.getElementById('ownerPlanTeacherCapacity').value = plan.teacherCapacity || 0; document.getElementById('ownerPlanBonusStudentCapacity').value = plan.bonusStudentCapacity ?? ''; document.getElementById('ownerPlanBonusTeacherCapacity').value = plan.bonusTeacherCapacity ?? ''; document.getElementById('ownerPlanBonus').checked = plan.bonus === true; document.getElementById('ownerPlanFeatures').value = (plan.features || []).join(', '); document.getElementById('ownerPlanCancel').hidden = false; document.getElementById('ownerPlanType').dispatchEvent(new Event('change')); document.getElementById('ownerPlanTopupKind').dispatchEvent(new Event('change')); document.getElementById('ownerPlanBonus').dispatchEvent(new Event('change')); };
            const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-outline-secondary'; toggle.textContent = plan.active === false ? 'Activate' : 'Deactivate'; toggle.onclick = async () => { try { await ownerPath(`pricingPlans/${plan.id}/active`).set(plan.active === false); await loadPricingPlans(); } catch (error) { notify(error.message, 'danger'); } };
            actions.append(edit, toggle); row.cells[7].append(actions); rows.append(row);
        });
    }

    function renderSubscriptionRows() {
        const body = document.getElementById('ownerSubscriptionRows');
        if (!body) return;
        const term = document.getElementById('ownerSubscriptionSearch')?.value.trim().toLowerCase() || '';
        const filtered = (schools || []).filter(school => `${school.name || ''} ${school.code || ''}`.toLowerCase().includes(term));
        body.innerHTML = filtered.length ? '' : '<tr><td colspan="8" class="text-center text-muted py-4">No registered schools match this search.</td></tr>';
        filtered.forEach(school => {
            const planId = school.subscription?.planId || school.subscription?.plan || '';
            const plans = pricingPlans.filter(plan => plan.active !== false && plan.type !== 'topup').map(plan => `<option value="${escapeAttr(plan.id)}" ${plan.id === planId || plan.name === planId ? 'selected' : ''}>${escapeHtml(plan.name)} · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}</option>`).join('');
            const topups = pricingPlans.filter(plan => plan.active !== false && plan.type === 'topup').map(plan => `<option value="${escapeAttr(plan.id)}">${escapeHtml(plan.name)}${plan.topupKind === 'months' ? ` · +${Number(plan.durationMonths || 0)} months · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}` : plan.bonus ? ' · Bonus' : ` · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}`}</option>`).join('');
            const row = document.createElement('tr');
            const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
            const basePlan = pricingPlans.find(plan => plan.id === planId || plan.name === planId);
            const validTopups = (school.subscription?.topups || []).filter(item => !item.endDate || Date.parse(item.endDate) >= Date.now());
            const topupCapacity = validTopups.reduce((total, item) => ({ students: total.students + Number(item.studentCapacity || 0), teachers: total.teachers + Number(item.teacherCapacity || 0) }), { students: 0, teachers: 0 });
            const studentCapacity = Number(school.subscription?.studentCapacity ?? basePlan?.studentCapacity ?? school.details?.capacity ?? 0) + topupCapacity.students;
            const teacherCapacity = Number(school.subscription?.teacherCapacity ?? basePlan?.teacherCapacity ?? 0) + topupCapacity.teachers;
            row.innerHTML = `<td class="fw-semibold">${escapeHtml(school.name || 'School')}</td><td>${escapeHtml(school.code || '—')}</td><td><select class="form-select form-select-sm school-plan" aria-label="Main plan for ${escapeAttr(school.name || 'school')}"><option value="">No plan</option>${plans}</select></td><td><div>${usage.students.toLocaleString()} / ${studentCapacity.toLocaleString()} students</div><div>${usage.teachers.toLocaleString()} / ${teacherCapacity.toLocaleString()} teachers</div></td><td><select class="form-select form-select-sm school-topup" aria-label="Top-up for ${escapeAttr(school.name || 'school')}"><option value="">No top-up</option>${topups}</select><button type="button" class="btn btn-sm btn-outline-warning mt-1 apply-topup">Add top-up</button></td><td><input class="form-control form-control-sm school-renewal" type="date" aria-label="Subscription renewal date"><div class="form-check mt-1"><input class="form-check-input school-auto-renew" type="checkbox" id="autoRenew-${escapeAttr(school.id)}"><label class="form-check-label small" for="autoRenew-${escapeAttr(school.id)}">Auto-renew</label></div></td><td><select class="form-select form-select-sm school-status"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></td><td><button class="btn btn-sm btn-primary">Save</button></td>`;
            const renewal = school.subscription?.endDate || '';
            row.querySelector('.school-renewal').value = renewal ? new Date(renewal).toISOString().slice(0, 10) : '';
            row.querySelector('.school-auto-renew').checked = school.subscription?.autoRenew === true || (school.subscription?.autoRenew === undefined && basePlan?.autoRenew === true);
            const expired = renewal && Date.parse(renewal) < Date.now();
            const status = String(school.status || 'Active').toLowerCase();
            const subscriptionStatus = String(school.subscription?.status || 'active').toLowerCase();
            row.querySelector('.school-status').value = status === 'inactive' || status === 'suspended' || subscriptionStatus === 'inactive' || expired ? 'Inactive' : 'Active';
            row.querySelector('.apply-topup').addEventListener('click', () => addSchoolTopup(school, row));
            row.querySelector('td:last-child button').addEventListener('click', () => saveSchoolSubscription(school, row));
            body.append(row);
        });
    }

    function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
    function renderAdminProfileChanges(request) {
        const labels = { name: 'Name', username: 'Username', dob: 'Date of birth' };
        return Object.entries(request.requestedData || {})
            .filter(([field]) => field !== 'dateOfBirth')
            .map(([field, value]) => {
                const currentValue = request.currentData?.[field] || 'Not set';
                return `<p class="mb-1"><strong>${escapeHtml(labels[field] || field)}:</strong> ${escapeHtml(currentValue)} -&gt; ${escapeHtml(value)}</p>`;
            }).join('');
    }
    function escapeAttr(value) { return escapeHtml(value); }

    function addCalendarMonths(date, months) {
        const result = new Date(date);
        const day = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + Number(months || 0));
        const finalDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(day, finalDay));
        return result;
    }

    function createBonusTopupEntry(plan, startDate, endDate) {
        return {
            planId: plan.id,
            name: `${plan.name} bonus top-up`,
            studentCapacity: plan.bonusStudentCapacity ?? Number(plan.studentCapacity || 0),
            teacherCapacity: plan.bonusTeacherCapacity ?? Number(plan.teacherCapacity || 0),
            price: 0,
            listPrice: Number(plan.price || 0),
            currency: plan.currency || 'INR',
            bonus: true,
            includedWithPlan: true,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            assignedAt: startDate.toISOString()
        };
    }

    function getRegistrationTopups(startDate, endDate) {
        return Array.from(document.querySelectorAll('#schoolRegistrationForm .topup-quantity')).flatMap(input => {
            const quantity = Math.max(0, Math.min(99, Number(input.value) || 0));
            const plan = pricingPlans.find(item => item.id === input.closest('[data-plan-id]')?.dataset.planId && item.type === 'topup');
            if (!plan || quantity === 0) return [];
            return Array.from({ length: quantity }, () => ({
                planId: plan.id,
                name: plan.name,
                studentCapacity: Number(plan.studentCapacity || 0),
                teacherCapacity: Number(plan.teacherCapacity || 0),
                price: Number(plan.price || 0),
                listPrice: Number(plan.price || 0),
                currency: plan.currency || 'INR',
                bonus: false,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                assignedAt: startDate.toISOString()
            }));
        });
    }

    async function saveSchoolSubscription(school, row) {
        const planId = row.querySelector('.school-plan').value;
        const plan = pricingPlans.find(item => item.id === planId);
        const active = row.querySelector('.school-status').value === 'Active';
        const dateInput = row.querySelector('.school-renewal').value;
        const current = school.subscription || {};
        if (plan?.type === 'topup') return notify('A top-up cannot replace the main plan. Add it using the Top-up control.', 'warning');
        const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
        const currentEnd = Date.parse(current.endDate || '');
        const startDate = current.startDate && currentEnd >= Date.now() ? new Date(current.startDate) : new Date();
        const endDate = dateInput ? new Date(`${dateInput}T23:59:59`) : new Date(startDate);
        if (!dateInput) endDate.setMonth(endDate.getMonth() + (Number(plan?.durationMonths) || 0));
        const topups = (Array.isArray(current.topups) ? current.topups : []).filter(item => !item.endDate || Date.parse(item.endDate) >= Date.now());
        if (plan?.bonus && !topups.some(item => item.includedWithPlan && item.planId === plan.id && Date.parse(item.endDate || '') > Date.now())) {
            topups.push(createBonusTopupEntry(plan, startDate, endDate));
        }
        const basePlanPrice = Number(plan?.price || 0);
        const priceBreakdown = { [plan?.currency || 'INR']: basePlanPrice };
        topups.forEach(item => {
            const currency = item.currency || plan?.currency || 'INR';
            priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0);
        });
        const subscription = { ...current, plan: plan?.name || '', planId: plan?.id || '', price: Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : basePlanPrice, basePlanPrice, priceBreakdown, currency: plan?.currency || 'INR', durationMonths: plan?.durationMonths || 0, autoRenew: plan?.type === 'plan' && row.querySelector('.school-auto-renew').checked, studentCapacity: Number(plan?.studentCapacity || 0), teacherCapacity: Number(plan?.teacherCapacity || 0), topups, usage: { students: usage.students, teachers: usage.teachers, updatedAt: Date.now() }, startDate: startDate.toISOString(), endDate: endDate.toISOString(), status: active ? 'active' : 'inactive', updatedAt: Date.now() };
        try {
            await database.ref(`schools/${school.id}`).update({ status: active ? 'Active' : 'Inactive', subscription, lastUpdated: new Date().toISOString() });
            await database.ref(`publicSchools/${school.id}`).update({ status: active ? 'Active' : 'Inactive', subscriptionEndDate: subscription.endDate, updatedAt: Date.now() });
            await ownerPath(`schools/${school.id}`).update({ status: active ? 'Active' : 'Inactive', subscription, lastUpdated: new Date().toISOString() }).catch(() => {});
            notify(`${school.name || 'School'} subscription updated.`, 'success');
        } catch (error) { notify(`Could not update the school record: ${error.message}`, 'danger'); }
    }

    async function addSchoolTopup(school, row) {
        const topup = pricingPlans.find(plan => plan.id === row.querySelector('.school-topup').value && plan.type === 'topup');
        const current = school.subscription || {};
        const endDate = Date.parse(current.endDate || '');
        const active = String(current.status || 'active').toLowerCase() === 'active' && endDate > Date.now();
        if (!topup) return notify('Select a top-up first.', 'warning');
        if (!current.planId && !current.plan) return notify('A main plan is required before adding a top-up.', 'warning');
        if (!active) return notify('Top-ups can only be added while the main plan is active.', 'warning');
        const startDate = new Date();
        if (topup.topupKind === 'months') {
            const monthsAdded = Number(topup.durationMonths || 0);
            if (!Number.isInteger(monthsAdded) || monthsAdded < 1) return notify('This extra-month top-up has an invalid month increment.', 'warning');
            const previousEndDate = new Date(endDate);
            const extendedEndDate = addCalendarMonths(previousEndDate, monthsAdded);
            const entry = { planId: topup.id, name: topup.name || 'Extra months', topupKind: 'months', monthsAdded, studentCapacity: 0, teacherCapacity: 0, price: Number(topup.price || 0), listPrice: Number(topup.price || 0), currency: topup.currency || current.currency || 'INR', startDate: previousEndDate.toISOString(), endDate: extendedEndDate.toISOString(), assignedAt: startDate.toISOString() };
            const topups = [...(Array.isArray(current.topups) ? current.topups : []), entry];
            const priceBreakdown = { [current.currency || 'INR']: Number(current.basePlanPrice ?? current.price ?? 0) };
            topups.forEach(item => { const currency = item.currency || current.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const price = Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(current.basePlanPrice ?? current.price ?? 0);
            const subscription = { ...current, endDate: extendedEndDate.toISOString(), termExtensionMonths: Number(current.termExtensionMonths || 0) + monthsAdded, topups, price, priceBreakdown, updatedAt: Date.now() };
            try {
                const timestamp = Date.now();
                await database.ref().update({
                    [`schools/${school.id}/subscription`]: subscription,
                    [`schools/${school.id}/lastUpdated`]: new Date().toISOString(),
                    [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
                    [`publicSchools/${school.id}/updatedAt`]: timestamp
                });
                await ownerPath(`schools/${school.id}`).update({ subscription, lastUpdated: new Date().toISOString() }).catch(() => {});
                notify(`${topup.name} added. The subscription now ends ${extendedEndDate.toLocaleDateString()}.`, 'success');
                await refreshSchoolData();
            } catch (error) { notify(`Could not add the month top-up: ${error.message}`, 'danger'); }
            return;
        }
        const remainingDays = Math.max(1, Math.ceil((endDate - startDate.getTime()) / 86400000));
        const originalDays = Math.max(1, (Number(current.durationMonths || 1) + Number(current.termExtensionMonths || 0)) * 30);
        const chargedPrice = topup.bonus ? 0 : Math.round(Number(topup.price || 0) * remainingDays / originalDays * 100) / 100;
        const isBonus = topup.bonus === true;
        const entry = { planId: topup.id, name: topup.name, topupKind: 'capacity', studentCapacity: isBonus && topup.bonusStudentCapacity !== null && topup.bonusStudentCapacity !== undefined ? Number(topup.bonusStudentCapacity) : Number(topup.studentCapacity || 0), teacherCapacity: isBonus && topup.bonusTeacherCapacity !== null && topup.bonusTeacherCapacity !== undefined ? Number(topup.bonusTeacherCapacity) : Number(topup.teacherCapacity || 0), price: chargedPrice, listPrice: Number(topup.price || 0), currency: topup.currency || current.currency || 'INR', bonus: isBonus, startDate: startDate.toISOString(), endDate: current.endDate, assignedAt: startDate.toISOString() };
        const topups = Array.isArray(current.topups) ? current.topups.slice() : [];
        topups.push(entry);
        try {
            const priceBreakdown = { [current.currency || 'INR']: Number(current.basePlanPrice ?? current.price ?? 0) };
            topups.forEach(item => { const currency = item.currency || current.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const price = Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(current.basePlanPrice ?? current.price ?? 0);
            await database.ref(`schools/${school.id}/subscription`).update({ topups, price, priceBreakdown, updatedAt: Date.now() });
            await ownerPath(`schools/${school.id}/subscription`).update({ topups, price, priceBreakdown, updatedAt: Date.now() }).catch(() => {});
            notify(`${topup.name} added to ${school.name || 'school'}${topup.bonus ? ' as a bonus.' : ` for ${entry.currency} ${chargedPrice}.`}`, 'success');
            await refreshSchoolData();
        } catch (error) { notify(`Could not add the top-up: ${error.message}`, 'danger'); }
    }

    function escapeCodeForTable(school) { return escapeHtml(school.code || '—'); }

    async function refreshSchoolData() {
        if (!database) return notify('The shared database is still connecting. Please try again in a moment.', 'warning');
        try { const snapshot = await database.ref('schools').once('value'); schools = snapshot.val() ? Object.entries(snapshot.val()).map(([id, value]) => ({ id, ...value })) : []; await writeSchoolsCache(); await loadSchoolUserUsage(); loadSchoolsTable(); updateDashboardStats(); renderSubscriptionRows(); }
        catch (error) { notify(`School data could not be read: ${error.message}`, 'danger'); }
    }

    function loadSchoolsTable() {
        const body = document.getElementById('schoolsTableBody');
        if (!body) return;
        const search = (document.getElementById('schoolSearch')?.value || '').trim().toLowerCase();
        const filtered = (schools || []).filter(school => `${school.name || ''} ${school.code || ''} ${school.type || ''} ${school.address?.city || school.location || ''}`.toLowerCase().includes(search));
        body.innerHTML = filtered.length ? '' : `<tr><td colspan="7" class="text-center text-muted py-4">${search ? 'No schools match this search.' : 'No schools registered yet.'}</td></tr>`;
        filtered.forEach(school => {
            const row = document.createElement('tr');
            const location = school.address?.city || school.location || school.address?.complete || '—';
            const contact = school.contacts?.phone || school.contact || school.contacts?.principal?.email || '—';
            row.innerHTML = `<td class="fw-semibold">${escapeHtml(school.name || 'Unnamed school')}<div class="small text-muted">${escapeCodeForTable(school)}</div></td><td>${escapeHtml(school.type || '—')}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(contact)}</td><td><span class="badge text-bg-${String(school.status).toLowerCase() === 'inactive' ? 'secondary' : 'success'}">${escapeHtml(school.status || 'Active')}</span></td><td>${Number(school.details?.currentStudents || 0)}</td><td class="text-nowrap"></td>`;
            const actions = document.createElement('div'); actions.className = 'd-flex gap-1';
            const details = document.createElement('button'); details.className = 'btn btn-sm btn-outline-info'; details.type = 'button'; details.title = 'View school and subscription details'; details.setAttribute('aria-label', `View details for ${school.name || 'school'}`); details.innerHTML = '<i class="fas fa-info" aria-hidden="true"></i>'; details.onclick = () => showSchoolDetails(school);
            const subscriptionExpired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
            const schoolActive = String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && !subscriptionExpired;
            const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-outline-secondary'; toggle.textContent = schoolActive ? 'Deactivate' : 'Activate'; toggle.onclick = () => toggleSchoolStatus(school);
            const plan = document.createElement('button'); plan.className = 'btn btn-sm btn-outline-primary'; plan.textContent = 'Subscription'; plan.onclick = () => { switchSection('owner-pricing'); renderSubscriptionRows(); };
            const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary'; edit.textContent = 'Edit'; edit.onclick = () => openSchoolEdit(school);
            actions.append(details, edit, toggle, plan); row.cells[6].append(actions); body.append(row);
        });
    }

    function showSchoolDetails(school) {
        const subscription = school.subscription || {};
        const topups = Array.isArray(subscription.topups) ? subscription.topups : [];
        const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
        const mainPlanId = subscription.planId || subscription.plan || '';
        const currentPlan = pricingPlans.find(item => item.id === mainPlanId || item.name === mainPlanId);
        const baseStudents = Number(subscription.studentCapacity ?? currentPlan?.studentCapacity ?? school.details?.capacity ?? 0);
        const baseTeachers = Number(subscription.teacherCapacity ?? currentPlan?.teacherCapacity ?? 0);
        const now = Date.now();
        const validTopups = topups.filter(item => !item.endDate || Date.parse(item.endDate) >= now);
        const hasRecordedBonus = validTopups.some(item => item.includedWithPlan && item.planId === currentPlan?.id);
        const extraStudents = validTopups.reduce((sum, item) => sum + Number(item.studentCapacity || 0), 0) + (currentPlan?.bonus && !hasRecordedBonus ? Number(currentPlan.bonusStudentCapacity ?? currentPlan.studentCapacity ?? 0) : 0);
        const extraTeachers = validTopups.reduce((sum, item) => sum + Number(item.teacherCapacity || 0), 0) + (currentPlan?.bonus && !hasRecordedBonus ? Number(currentPlan.bonusTeacherCapacity ?? currentPlan.teacherCapacity ?? 0) : 0);
        const studentLimit = baseStudents + extraStudents;
        const teacherLimit = baseTeachers + extraTeachers;
        const capacityRow = (label, used, limit) => `<div class="col-md-6"><div class="border rounded p-3 h-100"><div class="small text-muted">${label} usage</div><strong class="fs-5">${Number(used).toLocaleString()} / ${Number(limit).toLocaleString()}</strong><div class="small ${used > limit ? 'text-danger fw-semibold' : 'text-muted'}">${used > limit ? `Over capacity by ${(used - limit).toLocaleString()}` : `${Math.max(0, limit - used).toLocaleString()} available`}</div></div></div>`;
        const baseCurrency = subscription.currency || currentPlan?.currency || 'INR';
        const basePrice = Number(subscription.basePlanPrice ?? currentPlan?.price ?? subscription.price ?? 0);
        const money = (currency, amount) => `${escapeHtml(currency || 'INR')} ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        const topupMarkup = topups.length ? topups.map(item => {
            const expired = item.endDate && Date.parse(item.endDate) < now;
            const title = item.topupKind === 'months' ? `${item.name || 'Extra months'} (+${Number(item.monthsAdded || 0)} months)` : item.name || 'Top-up';
            const students = item.topupKind === 'months' ? '—' : Number(item.studentCapacity || 0).toLocaleString();
            const teachers = item.topupKind === 'months' ? '—' : Number(item.teacherCapacity || 0).toLocaleString();
            return `<tr><td>${escapeHtml(title)}</td><td>${students}</td><td>${teachers}</td><td>${item.bonus || item.includedWithPlan ? '<span class="badge text-bg-success">Included</span>' : money(item.currency || baseCurrency, item.price)}</td><td>${expired ? '<span class="badge text-bg-secondary">Expired</span>' : '<span class="badge text-bg-primary">Active</span>'}</td><td>${escapeHtml(item.endDate ? new Date(item.endDate).toLocaleDateString() : 'Plan end')}</td></tr>`;
        }).join('') : '<tr><td colspan="6" class="text-center text-muted">No top-ups assigned.</td></tr>';
        const bonusMarkup = currentPlan?.bonus && !topups.some(item => item.includedWithPlan && item.planId === currentPlan.id)
            ? `<tr><td>${escapeHtml(currentPlan.name)} bonus top-up</td><td>${Number(currentPlan.bonusStudentCapacity ?? currentPlan.studentCapacity ?? 0).toLocaleString()}</td><td>${Number(currentPlan.bonusTeacherCapacity ?? currentPlan.teacherCapacity ?? 0).toLocaleString()}</td><td><span class="badge text-bg-success">Included</span></td><td><span class="badge text-bg-primary">Active</span></td><td>${escapeHtml(subscription.endDate ? new Date(subscription.endDate).toLocaleDateString() : 'Plan end')}</td></tr>` : '';
        const modal = document.createElement('div');
        modal.className = 'modal fade'; modal.tabIndex = -1; modal.setAttribute('aria-label', `${school.name || 'School'} details`);
        modal.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered"><div class="modal-content"><div class="modal-header"><div><h2 class="modal-title fs-5">${escapeHtml(school.name || 'School details')}</h2><div class="small text-muted">${escapeHtml(school.code || 'No school code')} · ${escapeHtml(school.type || 'Institution')}</div></div><button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><div class="row g-3 mb-4">${capacityRow('Student', usage.students, studentLimit)}${capacityRow('Teacher', usage.teachers, teacherLimit)}</div><div class="row g-3 mb-4"><div class="col-md-6"><h3 class="h6">Base plan</h3><div class="border rounded p-3"><strong>${escapeHtml(subscription.plan || currentPlan?.name || 'No plan assigned')}</strong><div>${money(baseCurrency, basePrice)} · ${Number(baseStudents).toLocaleString()} students · ${Number(baseTeachers).toLocaleString()} teachers</div><div class="small text-muted">${escapeHtml(subscription.startDate ? new Date(subscription.startDate).toLocaleDateString() : 'Start date unavailable')} – ${escapeHtml(subscription.endDate ? new Date(subscription.endDate).toLocaleDateString() : 'Renewal date unavailable')} · ${subscription.autoRenew ? 'Auto-renew on' : 'Manual renewal'}</div></div></div><div class="col-md-6"><h3 class="h6">School details</h3><div class="border rounded p-3 small"><div><strong>Status:</strong> ${escapeHtml(school.status || 'Active')} · ${escapeHtml(subscription.status || 'active')}</div><div><strong>Location:</strong> ${escapeHtml([school.address?.complete, school.address?.city, school.address?.state].filter(Boolean).join(', ') || 'Not set')}</div><div><strong>Principal:</strong> ${escapeHtml(school.contacts?.principal?.name || 'Not set')} · ${escapeHtml(school.contacts?.principal?.email || '')}</div><div><strong>Phone:</strong> ${escapeHtml(school.contacts?.phone || 'Not set')}</div></div></div></div><h3 class="h6">Assigned top-ups</h3><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Top-up</th><th>Students</th><th>Teachers</th><th>Price</th><th>Status</th><th>Valid through</th></tr></thead><tbody>${bonusMarkup}${topupMarkup}</tbody></table></div><div class="border-top pt-3 mt-3"><strong>Subscription price breakdown</strong><div class="small text-muted mt-1">Base plan: ${money(baseCurrency, basePrice)}${Object.entries(subscription.priceBreakdown || {}).filter(([currency]) => currency !== baseCurrency).map(([currency, amount]) => ` · ${money(currency, Number(amount) - topups.filter(item => (item.currency || baseCurrency) === currency).reduce((sum, item) => sum + Number(item.price || 0), 0))}`).join('')}${topups.filter(item => !item.bonus && !item.includedWithPlan).map(item => ` · ${escapeHtml(item.name || 'Top-up')}: ${money(item.currency || baseCurrency, item.price)}`).join('')}</div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
        document.body.appendChild(modal);
        modal.addEventListener('hidden.bs.modal', () => modal.remove(), { once: true });
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    async function toggleSchoolStatus(school) {
        const expired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
        const active = !(String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && !expired);
        const next = active ? 'Active' : 'Inactive';
        try {
            const subscriptionStatus = active ? 'active' : 'inactive';
            await database.ref(`schools/${school.id}`).update({ status: next, 'subscription/status': subscriptionStatus, updatedAt: Date.now() });
            await database.ref(`publicSchools/${school.id}`).update({ status: next, updatedAt: Date.now() });
            await ownerPath(`schools/${school.id}`).update({ status: next, 'subscription/status': subscriptionStatus }).catch(() => {});
            notify(`${school.name || 'School'} is now ${next.toLowerCase()}.`, 'success');
        } catch (error) { notify(`Could not change school status: ${error.message}`, 'danger'); }
    }

    function updateDashboardStats() {
        const all = schools || [];
        const active = all.filter(school => String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && (!school.subscription?.endDate || Date.parse(school.subscription.endDate) >= Date.now()));
        const pending = all.filter(school => String(school.status || '').toLowerCase() === 'pending');
        const studentCapacity = all.reduce((total, school) => total + Number(school.subscription?.studentCapacity || school.details?.capacity || 0) + (school.subscription?.topups || []).reduce((sum, item) => sum + Number(item.studentCapacity || 0), 0), 0);
        const teacherCapacity = all.reduce((total, school) => total + Number(school.subscription?.teacherCapacity || 0) + (school.subscription?.topups || []).reduce((sum, item) => sum + Number(item.teacherCapacity || 0), 0), 0);
        const studentUsage = Object.values(schoolUserUsage).reduce((total, usage) => total + Number(usage.students || 0), 0);
        const expiring = all.filter(school => {
            const end = Date.parse(school.subscription?.endDate || '');
            return end >= Date.now() && end <= Date.now() + 30 * 86400000;
        }).length;
        const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
        set('totalSchoolsCount', all.length); set('activeSchoolsCount', active.length); set('pendingRegistrationsCount', pending.length);
        set('dashboardStudentCapacity', studentCapacity.toLocaleString());
        set('dashboardTeacherCapacity', teacherCapacity.toLocaleString());
        set('dashboardExpiringCount', expiring);
        set('dashboardCapacityUsage', studentCapacity ? `${Math.min(100, Math.round(studentUsage / studentCapacity * 100))}%` : '0%');
        set('dashboardCapacityDetail', `${studentUsage.toLocaleString()} of ${studentCapacity.toLocaleString()} student records used`);
        const renewals = all.filter(school => school.subscription?.endDate).sort((a, b) => Date.parse(a.subscription.endDate) - Date.parse(b.subscription.endDate)).slice(0, 5);
        const renewalNode = document.getElementById('dashboardRenewals');
        if (renewalNode) renewalNode.innerHTML = renewals.length ? renewals.map(school => `<div class="d-flex justify-content-between border-bottom py-2"><span>${escapeHtml(school.name || 'School')}</span><span>${new Date(school.subscription.endDate).toLocaleDateString()}</span></div>`).join('') : 'No renewal data available.';
    }

    function loadFirebaseConfig() {
        if (!currentUser || connectionLoadForUid === currentUser.uid) return;
        connectionLoadForUid = currentUser.uid;
        attachDatabase();
    }

    function loadSchoolsFromFirebase() {
        if (!database) return;
        if (schoolsListener) schoolsListener.off();
        schoolsListener = database.ref('schools');
        schoolsListener.on('value', snapshot => {
            const data = snapshot.val();
            isFirebaseConnected = true;
            setConnection('Connected and school data loaded', 'success');
            schools = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
            writeSchoolsCache();
            if (data) {
                const directoryUpdates = {};
                const legacyPasswordRemovals = {};
                Object.entries(data).forEach(([id, school]) => {
                    if (!school || !school.name) return;
                    const subscriptionExpired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
                    const status = String(school.status || 'Active').toLowerCase() === 'inactive' || subscriptionExpired ? 'Inactive' : (school.status || 'Active');
                    // Publish directory fields as leaf updates so institution
                    // controls such as publicSchools/{id}/registrationLive stay intact.
                    directoryUpdates[`publicSchools/${id}/name`] = school.name;
                    directoryUpdates[`publicSchools/${id}/code`] = school.code || '';
                    directoryUpdates[`publicSchools/${id}/type`] = school.type || '';
                    directoryUpdates[`publicSchools/${id}/status`] = status;
                    directoryUpdates[`publicSchools/${id}/subscriptionEndDate`] = school.subscription?.endDate || '';
                    directoryUpdates[`publicSchools/${id}/updatedAt`] = Date.now();
                    if (school.adminCredentials?.password) legacyPasswordRemovals[`schools/${id}/adminCredentials/password`] = null;
                });
                if (Object.keys(directoryUpdates).length) database.ref().update(directoryUpdates).catch(error => console.warn('Could not synchronize the public registered-school directory.', error));
                if (Object.keys(legacyPasswordRemovals).length) database.ref().update(legacyPasswordRemovals).catch(error => console.warn('Legacy plaintext staff credentials could not be cleared from the school database.', error));
            }
            loadSchoolsTable(); updateDashboardStats(); renderSubscriptionRows();
        }, error => { isFirebaseConnected = false; setConnection('Read access denied', 'danger'); notify(`The shared database rejected the read: ${error.message}`, 'danger'); });
    }

    function switchSection(sectionId, options = {}) {
        const requestedSection = String(sectionId || '').replace(/^#/, '');
        const selectedSection = document.getElementById(requestedSection);
        const activeSection = selectedSection ? requestedSection : 'dashboard';
        document.querySelectorAll('.main-content > section').forEach(section => { section.style.display = section.id === activeSection ? 'block' : 'none'; section.classList.toggle('active', section.id === activeSection); });
        document.querySelectorAll('.nav-links .nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${activeSection}`));
        if (options.updateUrl !== false && window.location.hash !== `#${activeSection}`) history.pushState({ section: activeSection }, '', `#${activeSection}`);
        if (activeSection === 'owner-pricing') { loadPricingPlans(); renderSubscriptionRows(); }
        if (activeSection === 'owner-subscription-requests') document.getElementById('owner-subscription-requests')?._renderSubscriptionRequests?.();
        if (activeSection === 'owner-custom-mail') document.getElementById('owner-custom-mail')?._onCustomMailOpen?.();
        if (activeSection === 'owner-bulk-registrations') document.getElementById('owner-bulk-registrations')?._onBulkRegistrationsOpen?.();
        if (activeSection === 'owner-bulk-profile-photos') document.getElementById('owner-bulk-profile-photos')?._onBulkPhotosOpen?.();
        if (activeSection === 'schools') refreshSchoolData();
        if (activeSection === 'analytics' && typeof initializeAnalyticsCharts === 'function') initializeAnalyticsCharts();
        if (window.innerWidth <= 768) document.querySelector('.sidebar')?.classList.remove('show');
    }

    function saveGeneralSettings(event) {
        event.preventDefault();
        const settings = { systemName: document.getElementById('systemName').value.trim(), adminEmail: document.getElementById('systemAdminEmail')?.value.trim() || currentUser.email, timezone: document.getElementById('timezone').value, dateFormat: document.getElementById('dateFormat').value, updatedAt: Date.now() };
        return ownerPath('settings/general').set(settings).then(() => notify('General settings saved.', 'success')).catch(error => notify(error.message, 'danger'));
    }

    function saveNotificationSettings(event) {
        event.preventDefault();
        const settings = { emailNotifications: document.getElementById('emailNotifications').checked, emailFrequency: document.getElementById('emailFrequency').value, pushNotifications: document.getElementById('pushNotifications').checked, notifyEvents: { newSchool: document.getElementById('notifyNewSchool').checked, subscription: document.getElementById('notifySubscription').checked, system: document.getElementById('notifySystem').checked }, updatedAt: Date.now() };
        return ownerPath('settings/notifications').set(settings).then(() => notify('Notification settings saved.', 'success')).catch(error => notify(error.message, 'danger'));
    }

    function addCustomMailPanel() {
        const nav = document.querySelector('.nav-links');
        const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-custom-mail')) return;
        const navItem = document.createElement('li');
        navItem.className = 'nav-item';
        navItem.innerHTML = '<a class="nav-link" href="#owner-custom-mail"><i class="fas fa-envelope"></i>Custom mail</a>';
        nav.appendChild(navItem);
        const section = document.createElement('section');
        section.id = 'owner-custom-mail';
        section.className = 'animated-section';
        section.style.display = 'none';
        section.innerHTML = `
          <div class="section-card">
            <div class="mb-3"><h2><i class="fas fa-envelope"></i> Send custom mail</h2><p class="text-muted mb-0">Choose school admins, students in a school class, or specific accounts from any school.</p></div>
            <form id="ownerCustomMailForm" class="row g-3">
              <div class="col-md-6"><label class="form-label" for="ownerMailSchool">School</label><select id="ownerMailSchool" class="form-select"><option value="">Choose a school</option></select></div>
              <div class="col-md-6"><label class="form-label" for="ownerMailAudience">Recipients</label><select id="ownerMailAudience" class="form-select"><option value="admins">School admins</option><option value="class">Students in a class</option><option value="individual">Choose individual accounts</option></select></div>
              <div class="col-md-6" id="ownerMailClassField" hidden><label class="form-label" for="ownerMailClass">Class</label><select id="ownerMailClass" class="form-select" disabled><option value="">Choose a school first</option></select></div>
              <div class="col-12" id="ownerMailSearchField" hidden><label class="form-label" for="ownerMailSearch">Find users across all schools</label><input id="ownerMailSearch" class="form-control" type="search" placeholder="Search by name, email, role, or school"></div>
              <div class="col-12"><div class="d-flex flex-wrap align-items-center justify-content-between gap-2"><strong id="ownerMailRecipientHeading">Choose a school to load recipients</strong><span id="ownerMailSelectedCount" class="badge text-bg-primary">0 selected</span></div><div id="ownerMailRecipients" class="border rounded p-2 mt-2" style="max-height:300px;overflow:auto"><p class="text-muted mb-0">Recipients will appear here.</p></div><div id="ownerMailSelectedList" class="d-flex flex-wrap gap-2 mt-2" aria-label="Selected recipients"></div></div>
              <div class="col-12"><label class="form-label" for="ownerMailSubject">Subject</label><input id="ownerMailSubject" class="form-control" maxlength="160" required></div>
              <div class="col-12"><label class="form-label" for="ownerMailMessage">Message</label><textarea id="ownerMailMessage" class="form-control" rows="8" maxlength="10000" required placeholder="Write your message"></textarea><div class="form-text">Messages are sent individually so recipients cannot see each other.</div></div>
              <div class="col-12 d-flex justify-content-end"><button id="ownerMailSend" class="btn btn-primary" type="submit" disabled><i class="fas fa-paper-plane"></i> Send to selected users</button></div>
            </form>
          </div>`;
        main.appendChild(section);

        const schoolSelect = section.querySelector('#ownerMailSchool');
        const audienceSelect = section.querySelector('#ownerMailAudience');
        const classSelect = section.querySelector('#ownerMailClass');
        const recipientsList = section.querySelector('#ownerMailRecipients');
        const searchInput = section.querySelector('#ownerMailSearch');
        const selected = new Map();
        let users = [];
        let userLoad = null;
        let classes = [];
        let classLoadKey = '';

        function updateSelectedCount() {
            section.querySelector('#ownerMailSelectedCount').textContent = `${selected.size} selected`;
            section.querySelector('#ownerMailSend').disabled = selected.size === 0;
            const selectedList = section.querySelector('#ownerMailSelectedList');
            selectedList.replaceChildren();
            selected.forEach((user, uid) => {
                const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'btn btn-sm btn-outline-secondary';
                chip.textContent = `Remove ${user.name || user.fullName || user.email}`;
                chip.addEventListener('click', () => { selected.delete(uid); renderRecipients(); });
                selectedList.append(chip);
            });
        }
        function activeUsers() {
            const schoolId = schoolSelect.value;
            const mode = audienceSelect.value;
            if (mode === 'individual') {
                const term = searchInput.value.trim().toLowerCase();
                return users.filter(user => !term || `${user.name || ''} ${user.fullName || ''} ${user.email || ''} ${user.role || ''} ${user.schoolName || ''} ${user.schoolId || ''}`.toLowerCase().includes(term));
            }
            if (!schoolId) return [];
            if (mode === 'admins') return users.filter(user => String(user.schoolId || '') === schoolId && String(user.role || '').toLowerCase() === 'admin');
            const cls = classes.find(item => item.id === classSelect.value);
            if (!cls) return [];
            return users.filter(user => {
                if (String(user.schoolId || '') !== schoolId || String(user.role || '').toLowerCase() !== 'student') return false;
                const ids = [user.classId, user.enrolledClassId, user.courseId].filter(Boolean).map(String);
                if (ids.includes(cls.id)) return true;
                const className = String(cls.name || '').trim().toLowerCase();
                return Boolean(className && [user.className, user.class, user.courseName].some(value => String(value || '').trim().toLowerCase() === className));
            });
        }
        function renderRecipients() {
            const mode = audienceSelect.value;
            const candidates = activeUsers();
            const valid = candidates.filter(user => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || '').trim()));
            const heading = section.querySelector('#ownerMailRecipientHeading');
            heading.textContent = mode === 'individual' ? 'Choose specific accounts across all schools' : mode === 'admins' ? 'Choose school admins' : 'Choose students in the selected class';
            recipientsList.replaceChildren();
            if (!valid.length) {
                const empty = document.createElement('p'); empty.className = 'text-muted mb-0';
                empty.textContent = mode !== 'individual' && !schoolSelect.value ? 'Choose a school first.' : 'No matching accounts with email addresses.';
                recipientsList.append(empty); updateSelectedCount(); return;
            }
            valid.sort((a, b) => String(a.name || a.fullName || a.email).localeCompare(String(b.name || b.fullName || b.email)));
            valid.forEach(user => {
                const label = document.createElement('label'); label.className = 'd-flex align-items-center gap-2 border-bottom py-2';
                const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'form-check-input mt-0'; checkbox.checked = selected.has(user.uid);
                checkbox.addEventListener('change', () => { if (checkbox.checked) selected.set(user.uid, user); else selected.delete(user.uid); updateSelectedCount(); });
                const detail = document.createElement('span'); detail.className = 'small';
                const school = (schools || []).find(item => String(item.id) === String(user.schoolId));
                detail.textContent = `${user.name || user.fullName || 'Unnamed user'} · ${user.email} · ${user.role || 'user'}${mode === 'individual' ? ` · ${school?.name || user.schoolName || 'Unknown school'}` : ''}`;
                label.append(checkbox, detail); recipientsList.append(label);
            });
            updateSelectedCount();
        }
        async function loadUsers() {
            if (users.length) return;
            if (!database) throw new Error('The shared database is still connecting. Try again in a moment.');
            if (!userLoad) userLoad = database.ref('users').once('value').then(snapshot => {
                users = Object.entries(snapshot.val() || {}).map(([uid, user]) => ({ uid, ...(user || {}) })).filter(user => user.email);
            }).finally(() => { userLoad = null; });
            await userLoad;
        }
        async function loadClasses() {
            const schoolId = schoolSelect.value;
            if (!schoolId || classLoadKey === schoolId) return;
            classLoadKey = schoolId; classes = [];
            classSelect.replaceChildren(new Option('Loading classes…', ''));
            classSelect.disabled = true;
            const [classesSnap, coursesSnap] = await Promise.all([
                database.ref(`schoolClasses/${schoolId}`).once('value'),
                database.ref(`schoolCourses/${schoolId}`).once('value')
            ]);
            const combined = new Map();
            [classesSnap.val(), coursesSnap.val()].forEach(records => Object.entries(records || {}).forEach(([id, value]) => {
                if (!value || typeof value !== 'object') return;
                combined.set(id, { id, name: value.className || value.courseName || value.name || value.title || 'Class' });
            }));
            classes = [...combined.values()].sort((a, b) => a.name.localeCompare(b.name));
            classSelect.replaceChildren(new Option(classes.length ? 'Choose a class' : 'No classes found', ''));
            classes.forEach(item => classSelect.add(new Option(item.name, item.id)));
            classSelect.disabled = !classes.length;
        }
        function renderSchoolOptions() {
            const previousSchool = schoolSelect.value;
            schoolSelect.replaceChildren(new Option('Choose a school', ''));
            (schools || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => schoolSelect.add(new Option(school.name || 'Unnamed school', school.id)));
            if ((schools || []).some(school => String(school.id) === previousSchool)) schoolSelect.value = previousSchool;
        }
        section._onCustomMailOpen = async () => {
            schoolSelect.disabled = true;
            schoolSelect.replaceChildren(new Option('Loading schools…', ''));
            let hasSchoolList = false;
            try {
                const cachedSchools = await readSchoolsCache();
                if (Array.isArray(cachedSchools)) {
                    schools = cachedSchools;
                    hasSchoolList = true;
                    renderSchoolOptions();
                }
            } catch (error) {
                console.warn('Could not load cached schools for custom mail.', error);
            }
            try {
                if (!database) throw new Error('The shared database is still connecting.');
                const schoolSnapshot = await database.ref('schools').once('value');
                schools = Object.entries(schoolSnapshot.val() || {}).map(([id, school]) => ({ id, ...(school || {}) }));
                hasSchoolList = true;
                renderSchoolOptions();
                await writeSchoolsCache();
            } catch (error) {
                if (!hasSchoolList) {
                    schoolSelect.replaceChildren(new Option('Could not load schools', ''));
                    notify(`Could not load schools for custom mail: ${error.message}`, 'danger');
                    schoolSelect.disabled = false;
                    return;
                }
                notify('Showing the saved school list. Firebase could not refresh it right now.', 'warning');
            }
            try {
                if (database) {
                    await loadUsers();
                    renderRecipients();
                }
                if (!schools.length) schoolSelect.replaceChildren(new Option('No schools found', ''));
            } catch (error) {
                notify(`Schools are available, but recipient accounts could not be loaded: ${error.message}`, 'danger');
            } finally {
                schoolSelect.disabled = false;
            }
        };
        schoolSelect.addEventListener('change', async () => {
            classLoadKey = ''; classes = [];
            if (audienceSelect.value === 'class' && schoolSelect.value) {
                try { await loadClasses(); } catch (error) { notify(`Could not load school classes: ${error.message}`, 'danger'); }
            }
            renderRecipients();
        });
        audienceSelect.addEventListener('change', async () => {
            section.querySelector('#ownerMailClassField').hidden = audienceSelect.value !== 'class';
            section.querySelector('#ownerMailSearchField').hidden = audienceSelect.value !== 'individual';
            if (audienceSelect.value === 'class' && schoolSelect.value) {
                try { await loadClasses(); } catch (error) { notify(`Could not load school classes: ${error.message}`, 'danger'); }
            }
            renderRecipients();
        });
        classSelect.addEventListener('change', renderRecipients);
        searchInput.addEventListener('input', renderRecipients);
        section.querySelector('#ownerCustomMailForm').addEventListener('submit', async event => {
            event.preventDefault();
            if (!selected.size) return notify('Select at least one recipient.', 'warning');
            if (selected.size > 100) return notify('Select no more than 100 recipients per message.', 'warning');
            const sendButton = section.querySelector('#ownerMailSend');
            const user = ownerAuth?.auth().currentUser;
            const workerUrl = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || '').trim();
            if (!user || !workerUrl) return notify('Owner sign-in or the secure mail service is unavailable.', 'danger');
            const endpoint = new URL(workerUrl);
            if (endpoint.protocol !== 'https:') return notify('The secure mail service URL is invalid.', 'danger');
            endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/custom-mail`;
            sendButton.disabled = true;
            try {
                const result = await fetch(endpoint.href, {
                    method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                    body: JSON.stringify({ subject: section.querySelector('#ownerMailSubject').value.trim(), message: section.querySelector('#ownerMailMessage').value.trim(), recipientUids: [...selected.keys()] })
                });
                const data = await result.json().catch(() => ({}));
                if (!result.ok) throw new Error(data.error || 'Custom email could not be sent.');
                notify(`Email sent to ${Number(data.sent || 0)} selected user${Number(data.sent) === 1 ? '' : 's'}.`, 'success');
                section.querySelector('#ownerMailSubject').value = '';
                section.querySelector('#ownerMailMessage').value = '';
            } catch (error) {
                notify(error.message || 'Custom email could not be sent.', 'danger');
            } finally { updateSelectedCount(); }
        });
    }

    function parseOwnerCsv(text) {
        const rows = [];
        let row = [], field = '', quoted = false;
        const source = String(text || '').replace(/^\uFEFF/, '');
        for (let index = 0; index < source.length; index += 1) {
            const character = source[index];
            if (quoted) {
                if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
                else if (character === '"') quoted = false;
                else field += character;
            } else if (character === '"') quoted = true;
            else if (character === ',') { row.push(field.trim()); field = ''; }
            else if (character === '\n' || character === '\r') {
                row.push(field.trim()); field = '';
                if (row.some(value => value !== '')) rows.push(row);
                row = [];
                if (character === '\r' && source[index + 1] === '\n') index += 1;
            } else field += character;
        }
        row.push(field.trim());
        if (row.some(value => value !== '')) rows.push(row);
        if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
        if (rows.length < 2) throw new Error('The CSV needs a header row and at least one user row.');
        const headers = rows.shift().map(value => value.trim().toLowerCase());
        if (new Set(headers).size !== headers.length || headers.some(value => !value)) throw new Error('CSV column headings must be non-empty and unique.');
        return rows.map((values, index) => ({ rowNumber: index + 2, data: Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ''])) }));
    }

    function addBulkRegistrationsPanel() {
        const nav = document.querySelector('.nav-links'); const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-bulk-registrations')) return;
        const item = document.createElement('li'); item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-bulk-registrations"><i class="fas fa-file-import"></i>Bulk registrations</a>'; nav.appendChild(item);
        const section = document.createElement('section'); section.id = 'owner-bulk-registrations'; section.className = 'animated-section'; section.style.display = 'none';
        section.innerHTML = `<div class="section-card"><div class="mb-3"><h2><i class="fas fa-file-import"></i> Bulk teacher & student registrations</h2><p class="text-muted mb-0">Create sign-in accounts and school profiles from a CSV file.</p></div>
          <div class="alert alert-warning"><strong>CSV passwords are sensitive.</strong> Use a trusted device and remove the file after importing. Rows are processed individually; failures won’t undo successful accounts.</div>
          <div class="row g-3"><div class="col-md-6"><label class="form-label" for="ownerBulkSchool">School</label><select id="ownerBulkSchool" class="form-select"><option value="">Select school</option></select><div id="ownerBulkSchoolCode" class="form-text">School code: —</div></div>
          <div class="col-md-6"><label class="form-label" for="ownerBulkType">Account type</label><select id="ownerBulkType" class="form-select"><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
          <div class="col-md-6" id="ownerBulkClassField"><label class="form-label" for="ownerBulkClass">Student class</label><select id="ownerBulkClass" class="form-select" disabled><option value="">Select a school first</option></select></div>
          <div class="col-md-6 d-flex align-items-end"><button id="ownerBulkTemplate" type="button" class="btn btn-outline-primary"><i class="fas fa-download"></i> Download CSV template</button></div>
          <div class="col-12"><label class="form-label" for="ownerBulkCsv">CSV file</label><input id="ownerBulkCsv" type="file" class="form-control" accept=".csv,text/csv"><div id="ownerBulkCsvHelp" class="form-text">Student columns: name,email,password,dateOfBirth,mobile,classRoll,section; optional: univRoll. School and class are selected above.</div></div>
          <div class="col-12"><div id="ownerBulkPreview"><p class="text-muted mb-0">Choose a school, account type, class, and CSV file to preview accounts.</p></div></div>
          <div class="col-12 d-flex align-items-center justify-content-between flex-wrap gap-2"><span id="ownerBulkStatus" class="small text-muted" role="status">No CSV loaded.</span><button id="ownerBulkImport" type="button" class="btn btn-primary" disabled><i class="fas fa-user-plus"></i> Create accounts</button></div></div></div>`;
        main.appendChild(section);
        const schoolSelect = section.querySelector('#ownerBulkSchool'); const typeSelect = section.querySelector('#ownerBulkType');
        const classSelect = section.querySelector('#ownerBulkClass'); const csvInput = section.querySelector('#ownerBulkCsv'); const importButton = section.querySelector('#ownerBulkImport');
        let rows = []; let classes = [];
        function renderSchools() {
            const selected = schoolSelect.value; schoolSelect.replaceChildren(new Option('Select school', ''));
            (schools || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => schoolSelect.add(new Option(`${school.name || 'Unnamed school'} · ${school.code || 'No code'}`, school.id)));
            if ((schools || []).some(school => String(school.id) === selected)) schoolSelect.value = selected;
            const school = (schools || []).find(record => String(record.id) === schoolSelect.value);
            section.querySelector('#ownerBulkSchoolCode').textContent = `School code: ${school?.code || '—'}`;
        }
        function previewRows() {
            importButton.disabled = !rows.length || !schoolSelect.value || (typeSelect.value === 'student' && !classSelect.value);
            const preview = section.querySelector('#ownerBulkPreview'); preview.replaceChildren();
            if (!rows.length) { preview.textContent = 'Choose a CSV file to preview accounts.'; preview.className = 'text-muted'; return; }
            preview.className = 'table-responsive';
            const fields = ['name', 'email', 'dateOfBirth', typeSelect.value === 'student' ? 'classRoll' : 'phone', typeSelect.value === 'student' ? 'section' : 'designation'];
            const table = document.createElement('table'); table.className = 'table table-sm table-striped align-middle';
            const head = document.createElement('thead'); const headerRow = document.createElement('tr');
            ['CSV row', ...fields].forEach(value => { const cell = document.createElement('th'); cell.textContent = value; headerRow.append(cell); }); head.append(headerRow); table.append(head);
            const body = document.createElement('tbody'); rows.slice(0, 10).forEach(item => { const line = document.createElement('tr'); const n = document.createElement('td'); n.textContent = String(item.rowNumber); line.append(n); fields.forEach(key => { const cell = document.createElement('td'); cell.textContent = item.data[key.toLowerCase()] || '—'; line.append(cell); }); body.append(line); }); table.append(body); preview.append(table);
            const count = document.createElement('p'); count.className = 'small text-muted mb-0'; count.textContent = `Previewing up to 10 of ${rows.length} rows. Passwords are hidden.`; preview.append(count);
        }
        async function loadClasses() {
            const schoolId = schoolSelect.value; classes = []; classSelect.disabled = true; classSelect.replaceChildren(new Option(schoolId ? 'Loading classes…' : 'Select a school first', ''));
            if (!schoolId) return;
            const [courseSnapshot, classSnapshot] = await Promise.all([database.ref(`schoolCourses/${schoolId}`).once('value'), database.ref(`schoolClasses/${schoolId}`).once('value')]);
            const map = new Map(); [courseSnapshot.val(), classSnapshot.val()].forEach(records => Object.entries(records || {}).forEach(([id, record]) => { if (record && typeof record === 'object') map.set(id, { id, name: record.courseName || record.className || record.name || record.title || 'Class' }); }));
            classes = [...map.values()].sort((a, b) => a.name.localeCompare(b.name)); classSelect.replaceChildren(new Option(classes.length ? 'Select class' : 'No classes found', ''));
            classes.forEach(record => classSelect.add(new Option(record.name, record.id))); classSelect.disabled = !classes.length;
        }
        function downloadTemplate() {
            const teacher = typeSelect.value === 'teacher';
            const header = teacher ? 'name,email,password,dateOfBirth,phone,designation,subjectsTaught' : 'name,email,password,dateOfBirth,mobile,classRoll,section,univRoll,academicYear';
            const sample = teacher ? 'Aarav Sharma,aarav@example.com,ChangeMe123!,2000-05-15,9876543210,Mathematics Teacher,Math|Science' : 'Aarav Sharma,aarav@example.com,ChangeMe123!,2010-05-15,9876543210,01,A,';
            const url = URL.createObjectURL(new Blob([`${header}\r\n${sample}\r\n`], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${teacher ? 'teacher' : 'student'}-registration-template.csv`; anchor.click(); URL.revokeObjectURL(url);
        }
        section._onBulkRegistrationsOpen = async () => {
            const cached = await readSchoolsCache();
            if (Array.isArray(cached)) { schools = cached; renderSchools(); }
            if (database) {
                try {
                    const snapshot = await database.ref('schools').once('value');
                    schools = Object.entries(snapshot.val() || {}).map(([id, school]) => ({ id, ...(school || {}) }));
                    await writeSchoolsCache(); renderSchools();
                } catch (error) {
                    if (!Array.isArray(cached)) notify(`Could not load schools for bulk registration: ${error.message}`, 'danger');
                }
            }
        };
        schoolSelect.addEventListener('change', async () => { renderSchools(); try { await loadClasses(); } catch (error) { notify(`Could not load classes: ${error.message}`, 'danger'); } previewRows(); });
        classSelect.addEventListener('change', previewRows);
        typeSelect.addEventListener('change', () => { const student = typeSelect.value === 'student'; section.querySelector('#ownerBulkClassField').hidden = !student; section.querySelector('#ownerBulkCsvHelp').textContent = student ? 'Student columns: name,email,password,dateOfBirth,mobile,classRoll,section; optional: univRoll. School and class are selected above.' : 'Teacher columns: name,email,password,dateOfBirth,phone,designation,subjectsTaught. Use | between subjects. School and teacher account type are selected above.'; rows = []; previewRows(); });
        section.querySelector('#ownerBulkTemplate').addEventListener('click', downloadTemplate);
        csvInput.addEventListener('change', async () => { rows = []; importButton.disabled = true; const file = csvInput.files?.[0]; if (!file) return previewRows(); try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV files must be smaller than 2 MB.'); rows = parseOwnerCsv(await file.text()); section.querySelector('#ownerBulkStatus').textContent = `${rows.length} CSV rows loaded.`; previewRows(); } catch (error) { section.querySelector('#ownerBulkStatus').textContent = error.message; notify(error.message, 'warning'); } });
        importButton.addEventListener('click', async () => {
            const school = (schools || []).find(record => String(record.id) === schoolSelect.value); const accountType = typeSelect.value; const cls = classes.find(record => record.id === classSelect.value);
            if (!database || !currentUser || !school || (accountType === 'student' && !cls)) return notify('Select a connected school and, for students, a class.', 'warning');
            importButton.disabled = true; const status = section.querySelector('#ownerBulkStatus'); const failures = []; let created = 0; let temporaryApp = null;
            try {
                status.textContent = 'Checking existing accounts and roll numbers…';
                const snapshot = await database.ref('users').once('value'); const existingUsers = snapshot.val() || {};
                const rolls = new Set(Object.values(existingUsers).filter(user => user && String(user.schoolId) === String(school.id)).map(user => `${String(user.courseId || user.classId || user.className || user.courseName || '').toLowerCase()}|${String(user.section || '').toLowerCase()}|${String(user.classRoll || '')}`));
                const emails = new Set(); temporaryApp = firebase.initializeApp(ownerAuth.options, `ownerBulk-${Date.now()}`);
                for (let index = 0; index < rows.length; index += 1) {
                    const { rowNumber, data } = rows[index]; status.textContent = `Creating ${index + 1} of ${rows.length}…`; let account = null;
                    try {
                        const name = String(data.name || '').trim(); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || ''); const dob = String(data.dateofbirth || data.dob || '').trim();
                        if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > new Date().toISOString().slice(0, 10)) throw new Error('Provide a name, valid email, password of 8+ characters, and valid non-future dateOfBirth (YYYY-MM-DD).');
                        if (emails.has(email)) throw new Error('This email is duplicated in the CSV.'); emails.add(email);
                        const profile = { uid: '', name, email, username: email.split('@')[0], dob, dateOfBirth: dob, role: accountType, schoolId: school.id, schoolCode: school.code || '', schoolName: school.name || '', createdAt: new Date().toISOString(), createdBy: currentUser.uid };
                        if (accountType === 'student') {
                            const mobile = String(data.mobile || '').trim(); const classRoll = String(data.classroll || '').trim(); const sectionName = String(data.section || '').trim();
                            if (!/^\d{10}$/.test(mobile) || !/^\d{2}$/.test(classRoll) || !sectionName) throw new Error('Student rows need a 10-digit mobile, 2-digit classRoll, and section.');
                            const schoolType = String(school.type || school.institutionType || '').trim().toLowerCase();
                            const isSchool = !schoolType.includes('college') && !schoolType.includes('university');
                            const univRoll = String(data.univroll || '').trim(); const academicYear = Number(data.academicyear || 1);
                            if (!isSchool && (!/^\d{10}$/.test(univRoll) || !Number.isInteger(academicYear) || academicYear < 1 || academicYear > 10)) throw new Error('College/university students need a 10-digit univRoll and academicYear from 1 to 10.');
                            const rollKey = `${cls.id.toLowerCase()}|${sectionName.toLowerCase()}|${classRoll}`; if (rolls.has(rollKey) || rolls.has(`${cls.name.toLowerCase()}|${sectionName.toLowerCase()}|${classRoll}`)) throw new Error('This class roll already exists for this class and section.');
                            Object.assign(profile, { registrationType: isSchool ? 'school' : 'university', mobile, classRoll, univRoll, courseId: cls.id, classId: cls.id, course: cls.name, courseName: cls.name, className: cls.name, section: sectionName, ...(!isSchool ? { academicYear, year: academicYear } : {}) });
                        } else {
                            const phone = String(data.phone || data.mobile || '').trim(); const designation = String(data.designation || '').trim(); const subjectsTaught = String(data.subjectstaught || '').split('|').map(value => value.trim()).filter(Boolean);
                            if (!/^\d{10}$/.test(phone) || !designation || !subjectsTaught.length) throw new Error('Teacher rows need a 10-digit phone, designation, and at least one subject (separate subjects with |).');
                            Object.assign(profile, { phone, designation, subjectsTaught, teacherType: 'teacher', classTeacherEnabled: false, roles: ['teacher'], assignedSections: [] });
                        }
                        account = (await temporaryApp.auth().createUserWithEmailAndPassword(email, password)).user; profile.uid = account.uid; await account.updateProfile({ displayName: name });
                        await database.ref().update({ [`users/${account.uid}`]: profile, [`schoolUsers/${school.id}/${account.uid}`]: profile });
                        if (accountType === 'student') {
                            rolls.add(`${cls.id.toLowerCase()}|${String(profile.section).toLowerCase()}|${profile.classRoll}`);
                            rolls.add(`${cls.name.toLowerCase()}|${String(profile.section).toLowerCase()}|${profile.classRoll}`);
                        }
                        created += 1;
                    } catch (error) { if (account) await account.delete().catch(cleanup => console.warn('Could not remove incomplete import account.', cleanup)); failures.push({ rowNumber, message: error.message || 'Account creation failed.' }); }
                    finally { await temporaryApp.auth().signOut().catch(() => {}); }
                }
            } catch (error) { failures.push({ rowNumber: '—', message: error.message || 'Import stopped.' }); }
            finally { if (temporaryApp) await temporaryApp.delete().catch(error => console.warn('Bulk import Firebase app cleanup failed.', error)); importButton.disabled = false; }
            status.textContent = `Created ${created} accounts; ${failures.length} rows failed.`;
            if (failures.length) { const list = document.createElement('ul'); list.className = 'small text-danger mt-2'; failures.forEach(failure => { const line = document.createElement('li'); line.textContent = `CSV row ${failure.rowNumber}: ${failure.message}`; list.append(line); }); section.querySelector('#ownerBulkPreview').append(list); }
            if (created) notify(`Created ${created} ${accountType} account${created === 1 ? '' : 's'} for ${school.name}.`, failures.length ? 'warning' : 'success');
        });
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-bulk-registrations'); renderSchools(); });
    }

    function addBulkProfilePhotosPanel() {
        const nav = document.querySelector('.nav-links'); const main = document.querySelector('.main-content');
        if (!nav || !main || document.getElementById('owner-bulk-profile-photos')) return;
        const item = document.createElement('li'); item.className = 'nav-item';
        item.innerHTML = '<a class="nav-link" href="#owner-bulk-profile-photos"><i class="fas fa-images"></i>Bulk profile photos</a>'; nav.appendChild(item);
        const section = document.createElement('section'); section.id = 'owner-bulk-profile-photos'; section.className = 'animated-section'; section.style.display = 'none';
        section.innerHTML = `<div class="section-card"><div class="mb-3"><h2><i class="fas fa-images"></i> Bulk profile photo upload</h2><p class="text-muted mb-0">Upload profile images to R2 and attach them to existing student or teacher accounts.</p></div>
          <div class="alert alert-info">Select a school and optionally a class, then add multiple image files. Filenames must match a class roll number, email/local part, username, or Firebase UID. Class-roll matches are scoped to the selected class.</div>
          <div class="row g-3"><div class="col-md-6"><label class="form-label" for="ownerPhotoSchool">School</label><select id="ownerPhotoSchool" class="form-select"><option value="">Select school</option></select></div>
          <div class="col-md-6"><label class="form-label" for="ownerPhotoClass">Class filter</label><select id="ownerPhotoClass" class="form-select" disabled><option value="">Select school first</option></select></div>
          <div class="col-12"><label class="form-label" for="ownerPhotoFiles">Profile pictures</label><input id="ownerPhotoFiles" class="form-control" type="file" accept="image/png,image/jpeg,image/webp" multiple><div class="form-text">Source images may be up to 10 MB; they are resized before R2 upload.</div></div>
          <div class="col-12"><div id="ownerPhotoMatches"><p class="text-muted mb-0">Select a school and image files to preview matches.</p></div></div>
          <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2"><span id="ownerPhotoStatus" class="small text-muted" role="status">No images selected.</span><button id="ownerPhotoUpload" type="button" class="btn btn-primary" disabled><i class="fas fa-cloud-upload-alt"></i> Upload matched photos</button></div></div></div>`;
        main.appendChild(section);
        const schoolSelect = section.querySelector('#ownerPhotoSchool'); const classSelect = section.querySelector('#ownerPhotoClass');
        const filesInput = section.querySelector('#ownerPhotoFiles'); const matchesElement = section.querySelector('#ownerPhotoMatches'); const uploadButton = section.querySelector('#ownerPhotoUpload');
        let accounts = []; let classes = []; let matches = []; let accountLoad = null;
        function renderPhotoSchools() {
            const previous = schoolSelect.value; schoolSelect.replaceChildren(new Option('Select school', ''));
            (schools || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => schoolSelect.add(new Option(`${school.name || 'Unnamed school'} · ${school.code || 'No code'}`, school.id)));
            if ((schools || []).some(school => String(school.id) === previous)) schoolSelect.value = previous;
        }
        async function loadPhotoClasses() {
            const schoolId = schoolSelect.value; classes = []; classSelect.disabled = true;
            classSelect.replaceChildren(new Option(schoolId ? 'Loading classes…' : 'Select school first', ''));
            if (!schoolId) return;
            const [courses, schoolClasses] = await Promise.all([database.ref(`schoolCourses/${schoolId}`).once('value'), database.ref(`schoolClasses/${schoolId}`).once('value')]);
            const map = new Map(); [courses.val(), schoolClasses.val()].forEach(records => Object.entries(records || {}).forEach(([id, record]) => { if (record && typeof record === 'object') map.set(id, { id, name: record.courseName || record.className || record.name || record.title || 'Class' }); }));
            classes = [...map.values()].sort((a, b) => a.name.localeCompare(b.name)); classSelect.replaceChildren(new Option('All users in school', ''));
            classes.forEach(record => classSelect.add(new Option(record.name, record.id))); classSelect.disabled = false;
        }
        async function loadPhotoAccounts() {
            if (accounts.length) return;
            if (!database) throw new Error('The owner database is not connected.');
            if (!accountLoad) accountLoad = database.ref('users').once('value').then(snapshot => { accounts = Object.entries(snapshot.val() || {}).map(([uid, profile]) => ({ uid, ...(profile || {}) })); }).finally(() => { accountLoad = null; });
            await accountLoad;
        }
        const normalizedRoll = value => String(value || '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
        function matchPhotoFiles(files) {
            const schoolId = schoolSelect.value; const selectedClass = classes.find(record => record.id === classSelect.value);
            const schoolAccounts = accounts.filter(profile => {
                if (String(profile.schoolId || '') !== schoolId || !['student', 'teacher'].includes(String(profile.role || '').toLowerCase())) return false;
                if (!selectedClass) return true;
                const ids = [profile.courseId, profile.classId, profile.enrolledClassId].filter(Boolean).map(String);
                const nameMatch = String(profile.className || profile.courseName || profile.course || '').trim().toLowerCase() === selectedClass.name.toLowerCase();
                return ids.includes(selectedClass.id) || nameMatch;
            });
            const claimed = new Set();
            matches = Array.from(files).map(file => {
                const base = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
                const candidates = schoolAccounts.filter(profile => {
                    const values = [profile.uid, profile.username, profile.email, String(profile.email || '').split('@')[0]].filter(Boolean).map(value => String(value).trim().toLowerCase());
                    return values.includes(base) || Boolean(selectedClass && profile.classRoll && normalizedRoll(profile.classRoll) === normalizedRoll(base));
                });
                const profile = candidates.length === 1 && !claimed.has(candidates[0].uid) ? candidates[0] : null;
                if (profile) claimed.add(profile.uid);
                return { file, profile, status: profile ? 'Ready' : candidates.length > 1 ? 'Filename matches multiple accounts' : 'No matching account' };
            });
            renderPhotoMatches();
        }
        function renderPhotoMatches() {
            matchesElement.replaceChildren();
            if (!matches.length) { const empty = document.createElement('p'); empty.className = 'text-muted mb-0'; empty.textContent = 'Select a school and image files to preview matches.'; matchesElement.append(empty); uploadButton.disabled = true; return; }
            const table = document.createElement('table'); table.className = 'table table-sm table-striped align-middle';
            const head = document.createElement('thead'); const header = document.createElement('tr'); ['Image', 'Matched account', 'Account type', 'Status'].forEach(value => { const cell = document.createElement('th'); cell.textContent = value; header.append(cell); }); head.append(header); table.append(head);
            const body = document.createElement('tbody'); matches.forEach(match => { const row = document.createElement('tr'); [match.file.name, match.profile?.name || match.profile?.email || '—', match.profile?.role || '—', match.status].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }); body.append(row); }); table.append(body); matchesElement.append(table);
            uploadButton.disabled = !matches.some(match => match.profile); section.querySelector('#ownerPhotoStatus').textContent = `${matches.filter(match => match.profile).length} matched of ${matches.length} images.`;
        }
        async function compressPhoto(file) {
            if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: choose an image smaller than 10 MB.`);
            const objectUrl = URL.createObjectURL(file); let image;
            try { image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error(`${file.name}: could not decode image.`)); element.src = objectUrl; }); }
            finally { URL.revokeObjectURL(objectUrl); }
            const scale = Math.min(1, 640 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the selected images.'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
            if (!blob || blob.size > 2 * 1024 * 1024) throw new Error(`${file.name}: prepared image exceeds the 2 MB upload limit.`);
            return blob;
        }
        section._onBulkPhotosOpen = async () => {
            const cached = await readSchoolsCache();
            if (Array.isArray(cached)) schools = cached;
            renderPhotoSchools();
            if (database) {
                try { const snapshot = await database.ref('schools').once('value'); schools = Object.entries(snapshot.val() || {}).map(([id, school]) => ({ id, ...(school || {}) })); await writeSchoolsCache(); renderPhotoSchools(); }
                catch (error) { if (!Array.isArray(cached)) notify(`Could not load schools for profile photos: ${error.message}`, 'danger'); }
            }
            try { await loadPhotoAccounts(); } catch (error) { notify(`Could not load accounts for photo matching: ${error.message}`, 'danger'); }
        };
        schoolSelect.addEventListener('change', async () => { filesInput.value = ''; matches = []; renderPhotoMatches(); try { await loadPhotoAccounts(); await loadPhotoClasses(); } catch (error) { notify(`Could not load school accounts or classes: ${error.message}`, 'danger'); } });
        classSelect.addEventListener('change', () => { if (filesInput.files?.length) matchPhotoFiles(filesInput.files); });
        filesInput.addEventListener('change', async () => { matches = []; uploadButton.disabled = true; if (!schoolSelect.value) { notify('Select a school before choosing profile photos.', 'warning'); filesInput.value = ''; return; } try { await loadPhotoAccounts(); matchPhotoFiles(filesInput.files || []); } catch (error) { notify(error.message, 'danger'); } });
        uploadButton.addEventListener('click', async () => {
            const ready = matches.filter(match => match.profile); const owner = ownerAuth?.auth().currentUser;
            if (!ready.length || !owner || !window.RollCallProfileUpload) return notify('Select matched photos and ensure the secure upload service is ready.', 'warning');
            uploadButton.disabled = true; let uploaded = 0; const failures = []; const status = section.querySelector('#ownerPhotoStatus');
            for (let index = 0; index < ready.length; index += 1) {
                const match = ready[index]; status.textContent = `Uploading ${index + 1} of ${ready.length}: ${match.file.name}`;
                try {
                    const blob = await compressPhoto(match.file);
                    const result = await window.RollCallProfileUpload.upload(blob, { uid: match.profile.uid, getIdToken: () => owner.getIdToken() });
                    const updates = { [`users/${match.profile.uid}/profilePhoto`]: result.publicUrl, [`users/${match.profile.uid}/profilePhotoKey`]: result.key, [`users/${match.profile.uid}/profilePhotoUpdatedAt`]: Date.now() };
                    const linked = await database.ref(`schoolUsers/${match.profile.schoolId}/${match.profile.uid}`).once('value');
                    if (linked.exists()) { updates[`schoolUsers/${match.profile.schoolId}/${match.profile.uid}/profilePhoto`] = result.publicUrl; updates[`schoolUsers/${match.profile.schoolId}/${match.profile.uid}/profilePhotoKey`] = result.key; updates[`schoolUsers/${match.profile.schoolId}/${match.profile.uid}/profilePhotoUpdatedAt`] = Date.now(); }
                    await database.ref().update(updates); match.profile.profilePhoto = result.publicUrl; match.profile.profilePhotoKey = result.key; uploaded += 1;
                } catch (error) { failures.push(`${match.file.name}: ${error.message || 'Upload failed.'}`); }
            }
            renderPhotoMatches(); status.textContent = `Uploaded ${uploaded} photos; ${failures.length} failed.`;
            if (failures.length) notify(failures.slice(0, 5).join(' '), 'warning'); else if (uploaded) notify(`Uploaded ${uploaded} profile photos.`, 'success');
            uploadButton.disabled = !matches.some(match => match.profile);
        });
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-bulk-profile-photos'); renderPhotoSchools(); });
    }

    function install() {
        addPricingPanel(); addAdminProfileRequestsPanel(); addSubscriptionResubscribeRequestsPanel(); addCustomMailPanel(); addBulkRegistrationsPanel(); addBulkProfilePhotosPanel(); installSchoolEditModal();
        document.querySelectorAll('.nav-links .nav-link').forEach(link => link.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); switchSection(link.hash.slice(1)); }, true));
        document.getElementById('schoolSearch')?.addEventListener('input', loadSchoolsTable);
        document.getElementById('previewRegistrationBtn')?.addEventListener('click', event => { event.preventDefault(); if (typeof previewRegistration === 'function') previewRegistration(); });
        document.getElementById('generalSettingsForm')?.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); saveGeneralSettings(event); }, true);
        document.getElementById('notificationSettingsForm')?.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); saveNotificationSettings(event); }, true);
        document.getElementById('sidebarToggleBtn')?.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); document.querySelector('.sidebar')?.classList.toggle(innerWidth <= 768 ? 'show' : 'collapsed'); document.querySelector('.main-content')?.classList.toggle('sidebar-collapsed', innerWidth > 768 && document.querySelector('.sidebar')?.classList.contains('collapsed')); }, true);
        window.loadFirebaseConfig = loadFirebaseConfig; window.loadSchoolsFromFirebase = loadSchoolsFromFirebase; window.loadSchoolsTable = loadSchoolsTable; window.updateDashboardStats = updateDashboardStats; window.refreshSchoolsList = refreshSchoolData; window.switchSection = switchSection;
        window.loadPricingPlans = loadPricingPlans;
        window.addEventListener('popstate', () => switchSection(window.location.hash.slice(1), { updateUrl: false }));
        window.addEventListener('hashchange', () => switchSection(window.location.hash.slice(1), { updateUrl: false }));
        switchSection(window.location.hash.slice(1) || 'dashboard', { updateUrl: false });
        ownerAuth?.auth().onAuthStateChanged(user => {
            if (user) {
                if (typeof window.verifyOwnerAccess !== 'function') {
                    console.error('Owner access verifier is unavailable; ending this session.');
                    ownerAuth.auth().signOut();
                    return;
                }
                window.verifyOwnerAccess(user).then(() => {
                    if (ownerAuth?.auth().currentUser?.uid !== user.uid) return;
                    currentUser = user;
                    loadPricingPlans();
                    loadFirebaseConfig();
                }).catch(error => {
                    currentUser = null;
                    console.warn('Owner core blocked an account without platform-owner access:', error.message);
                    if (ownerAuth?.auth().currentUser?.uid === user.uid) ownerAuth.auth().signOut();
                });
            } else {
                currentUser = null;
                window.__rollCallOwnerAuthorizedUid = null;
                connectionLoadForUid = null;
                if (schoolsListener) schoolsListener.off();
                schoolsListener = null;
                database = null;
                isFirebaseConnected = false;
            }
        });
        if (currentUser && window.__rollCallOwnerAuthorizedUid === currentUser.uid) loadFirebaseConfig();
    }
    document.addEventListener('DOMContentLoaded', install);
})();
