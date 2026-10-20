/* Owner portal core uses the same deployment-configured Firebase app as every RollCall portal. */
(function () {
    const APP_FIREBASE = window.ROLLCALL_FIREBASE_CONFIG;
    let schoolsListener = null;
    let pricingPlans = [];
    let schoolUserUsage = {};
    let currentSchoolFilter = '';
    let connectionLoadForUid = null;

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
              <div><h2><i class="fas fa-tags"></i>Pricing plans & school subscriptions</h2><p class="text-muted mb-0">Create base plans and additive top-ups. Plans define the active period; top-ups only increase capacity for the remaining active-plan period.</p></div>
              <span id="ownerPricingDbBadge" class="badge text-bg-light">Shared RollCall database</span>
            </div>
            <form id="ownerPlanForm" class="row g-2 align-items-end border rounded p-3 mb-4">
              <input id="ownerPlanId" type="hidden">
              <div class="col-md-3"><label class="form-label" for="ownerPlanName">Name</label><input id="ownerPlanName" class="form-control" required maxlength="60" placeholder="e.g. Campus Pro"></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanType">Subscription type</label><select id="ownerPlanType" class="form-select"><option value="plan">Main plan</option><option value="topup">Top-up</option></select></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanPrice">Price</label><input id="ownerPlanPrice" type="number" class="form-control" min="0" step="0.01" required placeholder="0"></div>
              <div class="col-md-2"><label class="form-label" for="ownerPlanCurrency">Currency</label><select id="ownerPlanCurrency" class="form-select"><option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
              <div class="col-md-1" id="ownerPlanMonthsField"><label class="form-label" for="ownerPlanMonths">Months</label><input id="ownerPlanMonths" type="number" class="form-control" min="1" max="120" value="12"></div>
              <div class="col-md-2 d-flex align-items-center" id="ownerPlanAutoRenewField"><div class="form-check mt-3"><input id="ownerPlanAutoRenew" class="form-check-input" type="checkbox"><label class="form-check-label" for="ownerPlanAutoRenew">Auto-renew</label></div></div>
              <div class="col-md-2"><button class="btn btn-primary w-100" type="submit">Save</button></div>
              <div class="col-md-3"><label class="form-label" for="ownerPlanStudentCapacity">Student records</label><input id="ownerPlanStudentCapacity" type="number" class="form-control" min="0" step="1" value="0" required></div>
              <div class="col-md-3"><label class="form-label" for="ownerPlanTeacherCapacity">Teacher records</label><input id="ownerPlanTeacherCapacity" type="number" class="form-control" min="0" step="1" value="0" required></div>
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
            const monthsField = document.getElementById('ownerPlanMonthsField');
            const bonusOfferField = document.getElementById('ownerPlanBonusOfferField');
            const bonusStudentField = document.getElementById('ownerPlanBonusStudentCapacityField');
            const bonusTeacherField = document.getElementById('ownerPlanBonusTeacherCapacityField');
            const bonus = document.getElementById('ownerPlanBonus');
            const bonusStudent = document.getElementById('ownerPlanBonusStudentCapacity');
            const bonusTeacher = document.getElementById('ownerPlanBonusTeacherCapacity');
            const autoRenewField = document.getElementById('ownerPlanAutoRenewField');
            const autoRenew = document.getElementById('ownerPlanAutoRenew');
            if (monthsField) monthsField.hidden = isTopup;
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
                        list.innerHTML = requests.sort((a, b) => b.timestamp - a.timestamp).map(request => `<div class="card mb-3"><div class="card-body"><div class="d-flex justify-content-between gap-3 flex-wrap"><div><h3 class="h6 mb-1">${escapeHtml(request.userName || request.userEmail)}</h3><p class="text-muted mb-2">${escapeHtml(request.userEmail || '')}</p><p class="mb-1"><strong>Name:</strong> ${escapeHtml(request.currentData?.name || 'Not set')} &rarr; ${escapeHtml(request.requestedData?.name || '')}</p><small class="text-muted">${new Date(request.timestamp).toLocaleString()}</small></div><div class="d-flex gap-2 align-items-start"><button type="button" class="btn btn-success approve-admin-request" data-request-id="${request.id}" data-user-id="${request.userId}">Approve</button><button type="button" class="btn btn-outline-danger reject-admin-request" data-request-id="${request.id}">Reject</button></div></div></div></div>`).join('');
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
                list.innerHTML = requests.length ? requests.map(request => `<div class="card mb-3"><div class="card-body d-flex justify-content-between gap-3 flex-wrap"><div><strong>${escapeHtml(request.userName || request.userEmail)}</strong><div>${escapeHtml(request.currentData?.name || 'Not set')} &rarr; ${escapeHtml(request.requestedData?.name || '')}</div><small class="text-muted">${new Date(request.timestamp).toLocaleString()}</small></div><div><button type="button" class="btn btn-success approve-admin-request" data-id="${request.id}">Approve</button> <button type="button" class="btn btn-outline-danger reject-admin-request" data-id="${request.id}">Reject</button></div></div></div>`).join('') : '<div class="alert alert-light">No pending administrator update requests.</div>';
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
                        <p class="text-muted mb-0">Staff requests are listed here. Renew the institution plan separately to restore portal access.</p>
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
                const snapshot = await ownerAuth.database().ref('subscriptionResubscribeRequests').once('value');
                const requests = [];
                snapshot.forEach(schoolSnapshot => {
                    schoolSnapshot.forEach(requestSnapshot => {
                        const request = requestSnapshot.val() || {};
                        if (request.ownerId === ownerUid && request.status === 'pending') {
                            requests.push({
                                schoolId: schoolSnapshot.key,
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
                list.innerHTML = requests.map(request => {
                    const plan = request.requestedPlan;
                    const planSummary = plan?.name
                        ? `${plan.name} · ${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} · ${Number(plan.durationMonths || 0)} months · ${Number(plan.studentCapacity || 0).toLocaleString()} student records · ${Number(plan.teacherCapacity || 0).toLocaleString()} teacher accounts`
                        : 'No plan selected (legacy request)';
                    return `
                        <article class="card mb-3">
                            <div class="card-body d-flex justify-content-between align-items-start gap-3 flex-wrap">
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
                        </article>`;
                }).join('');

                list.querySelectorAll('.open-request-subscription').forEach(button => {
                    button.addEventListener('click', () => switchSection('owner-pricing'));
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
        const password = document.getElementById('ownerTeacherPassword').value;
        const role = document.getElementById('ownerTeacherRole').value === 'classTeacher' ? 'classTeacher' : 'teacher';
        const sections = ownerTeacherSections(document.getElementById('ownerTeacherSections').value);
        const button = document.getElementById('ownerCreateTeacherButton');
        if (!currentUser || !database) return notify('The owner database is not connected. Please reconnect and try again.', 'danger');
        if (!school) return notify('Select a valid school or college.', 'warning');
        if (!name || !email || password.length < 8) return notify('Enter the teacher name, email, and a password with at least 8 characters.', 'warning');
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
        topupSection.innerHTML = '<h6><i class="fas fa-plus-circle me-2"></i>Additional top-ups <span class="text-muted fw-normal">(optional)</span></h6><p class="small text-muted">Select how many times to add each top-up. They use the selected main plan period.</p>';
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
                column.querySelector('.topup-details').textContent = `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} each · ${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers`;
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
        const selected = document.querySelector('#schoolRegistrationForm [name="subscriptionPlan"]:checked');
        const plan = pricingPlans.find(item => item.id === selected?.value || item.name === selected?.value);
        const topupTotals = Array.from(document.querySelectorAll('#schoolRegistrationForm .topup-quantity')).reduce((total, input) => {
            const count = Math.max(0, Number(input.value) || 0);
            const item = pricingPlans.find(candidate => candidate.id === input.closest('[data-plan-id]')?.dataset.planId);
            if (item) {
                total.count += count;
                total.price += count * Number(item.price || 0);
                total.students += count * Number(item.studentCapacity || 0);
                total.teachers += count * Number(item.teacherCapacity || 0);
            }
            return total;
        }, { count: 0, price: 0, students: 0, teachers: 0 });
        const mainPrice = Number(plan?.price || 0);
        const mainStudents = Number(plan?.studentCapacity || 0);
        const mainTeachers = Number(plan?.teacherCapacity || 0);
        summary.textContent = `${plan?.name || 'Select a main plan'} · Total: ${plan?.currency || 'INR'} ${(mainPrice + topupTotals.price).toLocaleString()} · ${mainStudents + topupTotals.students} student records · ${mainTeachers + topupTotals.teachers} teacher records${topupTotals.count ? ` · ${topupTotals.count} top-up${topupTotals.count === 1 ? '' : 's'}` : ''}`;
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
        const durationMonths = type === 'topup' ? 1 : Number(document.getElementById('ownerPlanMonths').value);
        const plan = { name: document.getElementById('ownerPlanName').value.trim(), type, price: Number(document.getElementById('ownerPlanPrice').value), currency: document.getElementById('ownerPlanCurrency').value, durationMonths, autoRenew: type === 'plan' && document.getElementById('ownerPlanAutoRenew').checked, studentCapacity: Number(document.getElementById('ownerPlanStudentCapacity').value), teacherCapacity: Number(document.getElementById('ownerPlanTeacherCapacity').value), bonus, bonusStudentCapacity: bonusStudentInput === '' ? null : Number(bonusStudentInput), bonusTeacherCapacity: bonusTeacherInput === '' ? null : Number(bonusTeacherInput), features: document.getElementById('ownerPlanFeatures').value.split(',').map(value => value.trim()).filter(Boolean), active: existing ? existing.active !== false : true, updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now() };
        if (!plan.name || !Number.isFinite(plan.price) || plan.price < 0 || plan.durationMonths < 1 || !Number.isInteger(plan.studentCapacity) || plan.studentCapacity < 0 || !Number.isInteger(plan.teacherCapacity) || plan.teacherCapacity < 0 || (plan.bonusStudentCapacity !== null && (!Number.isInteger(plan.bonusStudentCapacity) || plan.bonusStudentCapacity < 0)) || (plan.bonusTeacherCapacity !== null && (!Number.isInteger(plan.bonusTeacherCapacity) || plan.bonusTeacherCapacity < 0))) return notify('Enter a name, valid price, term, and non-negative whole-number capacities.', 'warning');
        try { await ownerPath(`pricingPlans/${id}`).set(plan); resetPricingForm(); await loadPricingPlans(); notify('Pricing plan saved.', 'success'); }
        catch (error) { notify(`Could not save pricing plan: ${error.message}`, 'danger'); }
    }

    function resetPricingForm() {
        document.getElementById('ownerPlanForm')?.reset();
        document.getElementById('ownerPlanId').value = '';
        document.getElementById('ownerPlanMonths').value = 12;
        document.getElementById('ownerPlanType').value = 'plan';
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
            row.cells[3].textContent = `${plan.durationMonths || 1} months · ${plan.type === 'plan' && plan.autoRenew ? 'Auto-renew on' : 'Manual renewal'}`;
            row.cells[4].textContent = `${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers${plan.bonus ? ` (bonus: ${plan.bonusStudentCapacity ?? 'default'} · ${plan.bonusTeacherCapacity ?? 'default'})` : ''}`;
            row.cells[5].textContent = Array.isArray(plan.features) ? plan.features.join(', ') : '';
            row.cells[6].innerHTML = `<span class="badge text-bg-${plan.active === false ? 'secondary' : 'success'}">${plan.active === false ? 'Inactive' : 'Active'}</span>`;
            const actions = document.createElement('div'); actions.className = 'd-flex gap-2';
            const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary'; edit.textContent = 'Edit'; edit.onclick = () => { document.getElementById('ownerPlanId').value = plan.id; document.getElementById('ownerPlanName').value = plan.name; document.getElementById('ownerPlanType').value = plan.type === 'topup' ? 'topup' : 'plan'; document.getElementById('ownerPlanPrice').value = plan.price; document.getElementById('ownerPlanCurrency').value = plan.currency || 'INR'; document.getElementById('ownerPlanMonths').value = plan.durationMonths || 1; document.getElementById('ownerPlanAutoRenew').checked = plan.autoRenew === true; document.getElementById('ownerPlanStudentCapacity').value = plan.studentCapacity || 0; document.getElementById('ownerPlanTeacherCapacity').value = plan.teacherCapacity || 0; document.getElementById('ownerPlanBonusStudentCapacity').value = plan.bonusStudentCapacity ?? ''; document.getElementById('ownerPlanBonusTeacherCapacity').value = plan.bonusTeacherCapacity ?? ''; document.getElementById('ownerPlanBonus').checked = plan.bonus === true; document.getElementById('ownerPlanFeatures').value = (plan.features || []).join(', '); document.getElementById('ownerPlanCancel').hidden = false; document.getElementById('ownerPlanType').dispatchEvent(new Event('change')); document.getElementById('ownerPlanBonus').dispatchEvent(new Event('change')); };
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
            const topups = pricingPlans.filter(plan => plan.active !== false && plan.type === 'topup').map(plan => `<option value="${escapeAttr(plan.id)}">${escapeHtml(plan.name)}${plan.bonus ? ' · Bonus' : ` · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}`}</option>`).join('');
            const row = document.createElement('tr');
            const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
            const basePlan = pricingPlans.find(plan => plan.id === planId || plan.name === planId);
            const topupCapacity = (school.subscription?.topups || []).reduce((total, item) => ({ students: total.students + Number(item.studentCapacity || 0), teachers: total.teachers + Number(item.teacherCapacity || 0) }), { students: 0, teachers: 0 });
            const studentCapacity = Number(basePlan?.studentCapacity || school.details?.capacity || 0) + topupCapacity.students;
            const teacherCapacity = Number(basePlan?.teacherCapacity || 0) + topupCapacity.teachers;
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
    function escapeAttr(value) { return escapeHtml(value); }

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
        const startDate = current.startDate ? new Date(current.startDate) : new Date();
        const endDate = dateInput ? new Date(`${dateInput}T23:59:59`) : new Date(startDate);
        if (!dateInput) endDate.setMonth(endDate.getMonth() + (Number(plan?.durationMonths) || 0));
        const topups = Array.isArray(current.topups) ? current.topups.slice() : [];
        if (plan?.bonus && !topups.some(item => item.includedWithPlan && item.planId === plan.id && Date.parse(item.endDate || '') > Date.now())) {
            topups.push(createBonusTopupEntry(plan, startDate, endDate));
        }
        const subscription = { ...current, plan: plan?.name || '', planId: plan?.id || '', price: plan?.price ?? 0, currency: plan?.currency || 'INR', durationMonths: plan?.durationMonths || 0, autoRenew: plan?.type === 'plan' && row.querySelector('.school-auto-renew').checked, studentCapacity: Number(plan?.studentCapacity || 0), teacherCapacity: Number(plan?.teacherCapacity || 0), topups, usage: { students: usage.students, teachers: usage.teachers, updatedAt: Date.now() }, startDate: startDate.toISOString(), endDate: endDate.toISOString(), status: active ? 'active' : 'inactive', updatedAt: Date.now() };
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
        const remainingDays = Math.max(1, Math.ceil((endDate - startDate.getTime()) / 86400000));
        const originalDays = Math.max(1, Number(current.durationMonths || 1) * 30);
        const chargedPrice = topup.bonus ? 0 : Math.round(Number(topup.price || 0) * remainingDays / originalDays * 100) / 100;
        const isBonus = topup.bonus === true;
        const entry = { planId: topup.id, name: topup.name, studentCapacity: isBonus && topup.bonusStudentCapacity !== null && topup.bonusStudentCapacity !== undefined ? Number(topup.bonusStudentCapacity) : Number(topup.studentCapacity || 0), teacherCapacity: isBonus && topup.bonusTeacherCapacity !== null && topup.bonusTeacherCapacity !== undefined ? Number(topup.bonusTeacherCapacity) : Number(topup.teacherCapacity || 0), price: chargedPrice, listPrice: Number(topup.price || 0), currency: topup.currency || 'INR', bonus: isBonus, startDate: startDate.toISOString(), endDate: current.endDate, assignedAt: startDate.toISOString() };
        const topups = Array.isArray(current.topups) ? current.topups.slice() : [];
        topups.push(entry);
        try {
            await database.ref(`schools/${school.id}/subscription`).update({ topups, updatedAt: Date.now() });
            await ownerPath(`schools/${school.id}/subscription`).update({ topups, updatedAt: Date.now() }).catch(() => {});
            notify(`${topup.name} added to ${school.name || 'school'}${topup.bonus ? ' as a bonus.' : ` for ${entry.currency} ${chargedPrice}.`}`, 'success');
            await refreshSchoolData();
        } catch (error) { notify(`Could not add the top-up: ${error.message}`, 'danger'); }
    }

    function escapeCodeForTable(school) { return escapeHtml(school.code || '—'); }

    async function refreshSchoolData() {
        if (!database) return notify('The shared database is still connecting. Please try again in a moment.', 'warning');
        try { const snapshot = await database.ref('schools').once('value'); schools = snapshot.val() ? Object.entries(snapshot.val()).map(([id, value]) => ({ id, ...value })) : []; await loadSchoolUserUsage(); loadSchoolsTable(); updateDashboardStats(); renderSubscriptionRows(); }
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
            const subscriptionExpired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
            const schoolActive = String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && !subscriptionExpired;
            const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-outline-secondary'; toggle.textContent = schoolActive ? 'Deactivate' : 'Activate'; toggle.onclick = () => toggleSchoolStatus(school);
            const plan = document.createElement('button'); plan.className = 'btn btn-sm btn-outline-primary'; plan.textContent = 'Subscription'; plan.onclick = () => { switchSection('owner-pricing'); renderSubscriptionRows(); };
            const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary'; edit.textContent = 'Edit'; edit.onclick = () => openSchoolEdit(school);
            actions.append(edit, toggle, plan); row.cells[6].append(actions); body.append(row);
        });
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
            if (data) {
                const directoryUpdates = {};
                const legacyPasswordRemovals = {};
                Object.entries(data).forEach(([id, school]) => {
                    if (!school || !school.name) return;
                    const subscriptionExpired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
                    const status = String(school.status || 'Active').toLowerCase() === 'inactive' || subscriptionExpired ? 'Inactive' : (school.status || 'Active');
                    directoryUpdates[`publicSchools/${id}`] = { name: school.name, code: school.code || '', type: school.type || '', status, subscriptionEndDate: school.subscription?.endDate || '', updatedAt: Date.now() };
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

    function install() {
        addPricingPanel(); addAdminProfileRequestsPanel(); addSubscriptionResubscribeRequestsPanel(); installSchoolEditModal();
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
