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

    let currentPlanCatalogFilter = 'all';
    let currentSubscriptionStatusFilter = 'all';

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
          <div class="pricing-panel-wrapper">
            <!-- Hero Header -->
            <div class="pricing-hero mb-4 p-4 rounded-4 bg-white border shadow-sm">
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div class="d-flex align-items-center gap-3">
                  <div class="rounded-4 d-flex align-items-center justify-content-center text-white shadow-sm" style="width: 52px; height: 52px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); font-size: 22px;">
                    <i class="fas fa-tags"></i>
                  </div>
                  <div>
                    <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <h2 class="h4 mb-0 fw-bold text-dark">Pricing &amp; Subscription Engine</h2>
                      <span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1 small"><i class="fas fa-shield-alt me-1"></i>Tier Manager</span>
                    </div>
                    <p class="text-muted mb-0 small">Configure tiered base plans, capacity packages, and day-wise or month-wise term extenders.</p>
                  </div>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span id="ownerPricingDbBadge" class="badge bg-light text-secondary border px-3 py-2 rounded-pill"><i class="fas fa-database me-1 text-primary"></i>Shared RollCall DB</span>
                  <button type="button" class="btn btn-outline-primary btn-sm rounded-pill px-3" id="ownerPricingRefreshBtn"><i class="fas fa-sync-alt me-1"></i>Refresh</button>
                  <button type="button" class="btn btn-primary btn-sm rounded-pill px-3" id="ownerPricingScrollCreateBtn"><i class="fas fa-plus me-1"></i>New Plan</button>
                </div>
              </div>

              <!-- Live KPI Summary Metric Cards -->
              <div class="row g-3 mt-2" id="ownerPricingKpis">
                <div class="col-6 col-lg-3">
                  <div class="p-3 rounded-3 border bg-light-subtle h-100 kpi-card" style="border-left: 4px solid #4f46e5 !important;">
                    <div class="text-muted small fw-medium d-flex justify-content-between align-items-center">
                      <span>Base Plans</span>
                      <i class="fas fa-layer-group text-primary"></i>
                    </div>
                    <div class="h3 mb-1 fw-bold text-dark mt-1" id="kpiMainPlansCount">0</div>
                    <div class="small text-muted text-truncate" id="kpiMainPlansBreakdown">School · College · ERP</div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="p-3 rounded-3 border bg-light-subtle h-100 kpi-card" style="border-left: 4px solid #06b6d4 !important;">
                    <div class="text-muted small fw-medium d-flex justify-content-between align-items-center">
                      <span>Top-up Offers</span>
                      <i class="fas fa-calendar-plus text-info"></i>
                    </div>
                    <div class="h3 mb-1 fw-bold text-dark mt-1" id="kpiTopupsCount">0</div>
                    <div class="small text-muted text-truncate" id="kpiTopupsBreakdown">Days · Months · Capacity</div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="p-3 rounded-3 border bg-light-subtle h-100 kpi-card" style="border-left: 4px solid #10b981 !important;">
                    <div class="text-muted small fw-medium d-flex justify-content-between align-items-center">
                      <span>Active Subscriptions</span>
                      <i class="fas fa-building text-success"></i>
                    </div>
                    <div class="h3 mb-1 fw-bold text-dark mt-1" id="kpiActiveSubsCount">0</div>
                    <div class="small text-muted">Institutions covered</div>
                  </div>
                </div>
                <div class="col-6 col-lg-3">
                  <div class="p-3 rounded-3 border bg-light-subtle h-100 kpi-card" style="border-left: 4px solid #f59e0b !important;">
                    <div class="text-muted small fw-medium d-flex justify-content-between align-items-center">
                      <span>Needs Attention</span>
                      <i class="fas fa-exclamation-circle text-warning"></i>
                    </div>
                    <div class="h3 mb-1 fw-bold text-dark mt-1" id="kpiExpiringSubsCount">0</div>
                    <div class="small text-muted">Expiring in ≤14d or expired</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Plan Creation / Edit Suite Card -->
            <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden" id="planEditorCard" style="border-top: 4px solid #4f46e5 !important;">
              <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div class="d-flex align-items-center gap-2">
                  <span class="rounded-circle bg-primary-subtle text-primary p-2 d-inline-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                    <i class="fas fa-sliders-h"></i>
                  </span>
                  <div>
                    <h5 class="mb-0 fw-bold" id="ownerPlanFormTitle">Plan Configuration Suite</h5>
                    <small class="text-muted" id="ownerPlanFormSubtitle">Configure plan details, pricing tiers, and capacity constraints</small>
                  </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span id="ownerPlanFormBadge" class="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-1">New Plan</span>
                  <button class="btn btn-sm btn-outline-secondary rounded-pill px-3" id="ownerPlanCancel" type="button" hidden><i class="fas fa-times me-1"></i>Cancel editing</button>
                </div>
              </div>
              <div class="card-body p-4">
                <form id="ownerPlanForm">
                  <input id="ownerPlanId" type="hidden">
                  
                  <div class="row g-3">
                    <!-- Column 1: Identity & Role -->
                    <div class="col-lg-4">
                      <div class="p-3 rounded-3 border bg-light-subtle h-100">
                        <h6 class="fw-bold text-primary mb-3"><i class="fas fa-id-card me-2"></i>1. Plan Identity</h6>
                        <div class="mb-3">
                          <label class="form-label fw-semibold small" for="ownerPlanName">Plan Name *</label>
                          <input id="ownerPlanName" class="form-control" required maxlength="60" placeholder="e.g. Standard Campus Plan">
                        </div>
                        <div class="mb-3">
                          <label class="form-label fw-semibold small" for="ownerPlanType">Subscription Type</label>
                          <select id="ownerPlanType" class="form-select">
                            <option value="plan">Main Plan (Base)</option>
                            <option value="topup">Top-up Add-on</option>
                          </select>
                        </div>
                        <div class="mb-3" id="ownerPlanCategoryContainer">
                          <label class="form-label fw-semibold small" for="ownerPlanCategory">Institution Target</label>
                          <select id="ownerPlanCategory" class="form-select">
                            <option value="school">School</option>
                            <option value="college">College / University</option>
                            <option value="erp">RollCall ERP</option>
                          </select>
                        </div>
                        <div class="mb-3" id="ownerPlanTopupKindField" hidden>
                          <label class="form-label fw-semibold small text-info" for="ownerPlanTopupKind"><i class="fas fa-puzzle-piece me-1"></i>Top-up Pattern</label>
                          <select id="ownerPlanTopupKind" class="form-select border-info">
                            <option value="capacity">Extra Capacity (Students / Teachers)</option>
                            <option value="months">Extra Months (Term Extension)</option>
                            <option value="days">Extra Days (Quick Day Extension)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <!-- Column 2: Pricing & Term -->
                    <div class="col-lg-4">
                      <div class="p-3 rounded-3 border bg-light-subtle h-100">
                        <h6 class="fw-bold text-primary mb-3"><i class="fas fa-coins me-2"></i>2. Pricing &amp; Billing Term</h6>
                        <div class="row g-2 mb-3">
                          <div class="col-7">
                            <label class="form-label fw-semibold small" for="ownerPlanPrice">Price *</label>
                            <div class="input-group">
                              <span class="input-group-text bg-white"><i class="fas fa-tag text-muted"></i></span>
                              <input id="ownerPlanPrice" type="number" class="form-control" min="0" step="0.01" required placeholder="0">
                            </div>
                          </div>
                          <div class="col-5">
                            <label class="form-label fw-semibold small" for="ownerPlanCurrency">Currency</label>
                            <select id="ownerPlanCurrency" class="form-select">
                              <option value="INR">INR (₹)</option>
                              <option value="USD">USD ($)</option>
                              <option value="EUR">EUR (€)</option>
                            </select>
                          </div>
                        </div>
                        
                        <div class="mb-3" id="ownerPlanMonthsField">
                          <label class="form-label fw-semibold small" for="ownerPlanMonths">Term Duration (Months)</label>
                          <div class="input-group">
                            <input id="ownerPlanMonths" type="number" class="form-control" min="1" max="120" value="12">
                            <span class="input-group-text bg-white">months</span>
                          </div>
                          <div class="d-flex gap-1 mt-1">
                            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-2 small plan-term-preset" data-term-months="1">1 mo</button>
                            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-2 small plan-term-preset" data-term-months="3">3 mos</button>
                            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-2 small plan-term-preset" data-term-months="6">6 mos</button>
                            <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-2 small plan-term-preset" data-term-months="12">1 year</button>
                          </div>
                        </div>

                        <div class="mb-3" id="ownerPlanDaysField" hidden>
                          <label class="form-label fw-semibold small text-info" for="ownerPlanDays"><i class="fas fa-calendar-day me-1"></i>Term Extension (Days)</label>
                          <div class="input-group">
                            <input id="ownerPlanDays" type="number" class="form-control border-info" min="1" max="365" value="7">
                            <span class="input-group-text bg-info-subtle border-info text-info">days</span>
                          </div>
                          <div class="d-flex gap-1 mt-1">
                            <button type="button" class="btn btn-xs btn-outline-info py-0 px-2 small plan-days-preset" data-days="1">+1d</button>
                            <button type="button" class="btn btn-xs btn-outline-info py-0 px-2 small plan-days-preset" data-days="3">+3d</button>
                            <button type="button" class="btn btn-xs btn-outline-info py-0 px-2 small plan-days-preset" data-days="7">+7d</button>
                            <button type="button" class="btn btn-xs btn-outline-info py-0 px-2 small plan-days-preset" data-days="15">+15d</button>
                            <button type="button" class="btn btn-xs btn-outline-info py-0 px-2 small plan-days-preset" data-days="30">+30d</button>
                          </div>
                        </div>

                        <div class="form-check form-switch mt-3 pt-2 border-top" id="ownerPlanAutoRenewField">
                          <input id="ownerPlanAutoRenew" class="form-check-input" type="checkbox" role="switch">
                          <label class="form-check-label fw-semibold small ms-1" for="ownerPlanAutoRenew">Enable Auto-Renewal</label>
                          <div class="text-muted" style="font-size: 11px;">Automatically renews on expiry if supported</div>
                        </div>
                      </div>
                    </div>

                    <!-- Column 3: Capacity & Features -->
                    <div class="col-lg-4">
                      <div class="p-3 rounded-3 border bg-light-subtle h-100">
                        <h6 class="fw-bold text-primary mb-3"><i class="fas fa-users-cog me-2"></i>3. Capacity &amp; Features</h6>
                        <div class="row g-2 mb-3">
                          <div class="col-6" id="ownerPlanStudentCapacityField">
                            <label class="form-label fw-semibold small" for="ownerPlanStudentCapacity">Student Limit</label>
                            <div class="input-group">
                              <span class="input-group-text bg-white"><i class="fas fa-user-graduate text-muted"></i></span>
                              <input id="ownerPlanStudentCapacity" type="number" class="form-control" min="0" step="1" value="0" required>
                            </div>
                          </div>
                          <div class="col-6" id="ownerPlanTeacherCapacityField">
                            <label class="form-label fw-semibold small" for="ownerPlanTeacherCapacity">Teacher Limit</label>
                            <div class="input-group">
                              <span class="input-group-text bg-white"><i class="fas fa-chalkboard-teacher text-muted"></i></span>
                              <input id="ownerPlanTeacherCapacity" type="number" class="form-control" min="0" step="1" value="0" required>
                            </div>
                          </div>
                        </div>

                        <div class="mb-3">
                          <label class="form-label fw-semibold small" for="ownerPlanFeatures">Included Features</label>
                          <input id="ownerPlanFeatures" class="form-control" placeholder="Attendance, Reports, SMS Alerts">
                          <div class="text-muted" style="font-size: 11px;">Comma-separated list of capabilities</div>
                        </div>

                        <div class="p-2 rounded border bg-white mt-2" id="ownerPlanBonusOfferField">
                          <div class="form-check form-switch mb-2">
                            <input id="ownerPlanBonus" class="form-check-input" type="checkbox" role="switch">
                            <label class="form-check-label fw-semibold small" for="ownerPlanBonus">Include Bonus Top-up Offer</label>
                          </div>
                          <div class="row g-2" id="ownerPlanBonusInputs">
                            <div class="col-6" id="ownerPlanBonusStudentCapacityField">
                              <input id="ownerPlanBonusStudentCapacity" type="number" class="form-control form-control-sm" min="0" placeholder="Bonus students">
                            </div>
                            <div class="col-6" id="ownerPlanBonusTeacherCapacityField">
                              <input id="ownerPlanBonusTeacherCapacity" type="number" class="form-control form-control-sm" min="0" placeholder="Bonus teachers">
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="d-flex justify-content-end align-items-center gap-2 mt-3 pt-3 border-top">
                    <button type="button" class="btn btn-outline-secondary px-3" onclick="resetPricingForm()">Reset</button>
                    <button class="btn btn-primary px-4 fw-semibold shadow-sm" type="submit" id="ownerPlanSubmitBtn">
                      <i class="fas fa-save me-2"></i>Save Pricing Plan
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <!-- Pricing Plans Explorer -->
            <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
              <div class="card-header bg-white py-3 px-4 border-bottom">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div class="d-flex align-items-center gap-2">
                    <span class="rounded-circle bg-success-subtle text-success p-2 d-inline-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                      <i class="fas fa-th-list"></i>
                    </span>
                    <h5 class="mb-0 fw-bold">Active Pricing Catalog</h5>
                  </div>
                  
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <ul class="nav nav-pills nav-fill bg-light p-1 rounded-pill small" id="pricingCatalogFilterTabs">
                      <li class="nav-item"><a class="nav-link active rounded-pill py-1 px-3" href="#" data-plan-filter="all">All (<span id="tabCountAll">0</span>)</a></li>
                      <li class="nav-item"><a class="nav-link rounded-pill py-1 px-3" href="#" data-plan-filter="school">School (<span id="tabCountSchool">0</span>)</a></li>
                      <li class="nav-item"><a class="nav-link rounded-pill py-1 px-3" href="#" data-plan-filter="college">College (<span id="tabCountCollege">0</span>)</a></li>
                      <li class="nav-item"><a class="nav-link rounded-pill py-1 px-3" href="#" data-plan-filter="erp">ERP (<span id="tabCountErp">0</span>)</a></li>
                      <li class="nav-item"><a class="nav-link rounded-pill py-1 px-3" href="#" data-plan-filter="topup">Top-ups (<span id="tabCountTopup">0</span>)</a></li>
                    </ul>
                    <input id="ownerPlanSearch" class="form-control form-control-sm rounded-pill" style="width: 180px;" placeholder="Search catalog...">
                  </div>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" id="ownerPricingTable">
                  <thead class="table-light text-muted small text-uppercase">
                    <tr>
                      <th class="ps-4">Plan Name</th>
                      <th>Target &amp; Type</th>
                      <th>Pricing</th>
                      <th>Term Duration</th>
                      <th>Capacity / Add-on</th>
                      <th>Included Features</th>
                      <th>Status</th>
                      <th class="pe-4 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="ownerPlanRows"></tbody>
                </table>
              </div>
            </div>

            <!-- School Subscriptions Section -->
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
              <div class="card-header bg-white py-3 px-4 border-bottom">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div class="d-flex align-items-center gap-2">
                    <span class="rounded-circle bg-info-subtle text-info p-2 d-inline-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                      <i class="fas fa-university"></i>
                    </span>
                    <div>
                      <h5 class="mb-0 fw-bold">School Subscriptions Management</h5>
                      <small class="text-muted">Monitor school usage, apply top-ups or +Days extensions, and manage renewals</small>
                    </div>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <div class="btn-group btn-group-sm" id="subscriptionStatusFilterGroup">
                      <button type="button" class="btn btn-outline-secondary active" data-sub-filter="all">All</button>
                      <button type="button" class="btn btn-outline-secondary" data-sub-filter="active">Active</button>
                      <button type="button" class="btn btn-outline-secondary" data-sub-filter="expiring">Expiring Soon</button>
                      <button type="button" class="btn btn-outline-secondary" data-sub-filter="expired">Expired</button>
                    </div>
                    <div class="input-group input-group-sm" style="max-width:240px">
                      <span class="input-group-text bg-light"><i class="fas fa-search text-muted"></i></span>
                      <input id="ownerSubscriptionSearch" class="form-control" placeholder="Search school or code...">
                    </div>
                  </div>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead class="table-light text-muted small text-uppercase">
                    <tr>
                      <th class="ps-4">School</th>
                      <th>Main Plan</th>
                      <th style="min-width: 200px;">Usage &amp; Capacity</th>
                      <th style="min-width: 210px;">Add Top-Up / Extend</th>
                      <th style="min-width: 170px;">Renewal Date &amp; Status</th>
                      <th>Access</th>
                      <th class="pe-4 text-end">Save</th>
                    </tr>
                  </thead>
                  <tbody id="ownerSubscriptionRows"></tbody>
                </table>
              </div>
            </div>
          </div>`;
        main.appendChild(section);
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-pricing'); renderSubscriptionRows(); });
        section.querySelector('#ownerPlanForm').addEventListener('submit', savePricingPlan);
        section.querySelector('#ownerPlanCancel').addEventListener('click', resetPricingForm);
        section.querySelector('#ownerSubscriptionSearch').addEventListener('input', renderSubscriptionRows);
        section.querySelector('#ownerPlanSearch')?.addEventListener('input', renderPricingPlans);
        section.querySelector('#ownerPricingRefreshBtn')?.addEventListener('click', async () => {
            await loadPricingPlans();
            await refreshSchoolData();
            notify('Pricing catalog and school subscriptions refreshed.', 'info');
        });
        section.querySelector('#ownerPricingScrollCreateBtn')?.addEventListener('click', () => {
            resetPricingForm();
            document.getElementById('planEditorCard')?.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('ownerPlanName')?.focus();
        });

        // Term presets
        section.querySelectorAll('.plan-term-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const months = btn.dataset.termMonths;
                const field = document.getElementById('ownerPlanMonths');
                if (field && months) {
                    field.value = months;
                    field.dispatchEvent(new Event('input'));
                }
            });
        });

        // Days presets
        section.querySelectorAll('.plan-days-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = btn.dataset.days;
                const field = document.getElementById('ownerPlanDays');
                if (field && days) {
                    field.value = days;
                    field.dispatchEvent(new Event('input'));
                }
            });
        });

        // Plan Catalog Filter Tabs
        section.querySelectorAll('#pricingCatalogFilterTabs [data-plan-filter]').forEach(tab => {
            tab.addEventListener('click', event => {
                event.preventDefault();
                section.querySelectorAll('#pricingCatalogFilterTabs .nav-link').forEach(link => link.classList.remove('active'));
                tab.classList.add('active');
                currentPlanCatalogFilter = tab.dataset.planFilter || 'all';
                renderPricingPlans();
            });
        });

        // Subscription Status Filter Group
        section.querySelectorAll('#subscriptionStatusFilterGroup [data-sub-filter]').forEach(btn => {
            btn.addEventListener('click', event => {
                event.preventDefault();
                section.querySelectorAll('#subscriptionStatusFilterGroup button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSubscriptionStatusFilter = btn.dataset.subFilter || 'all';
                renderSubscriptionRows();
            });
        });

        const updateBonusControls = () => {
            const isTopup = document.getElementById('ownerPlanType').value === 'topup';
            const topupKindField = document.getElementById('ownerPlanTopupKindField');
            const topupKind = isTopup ? document.getElementById('ownerPlanTopupKind').value : '';
            const isMonthTopup = isTopup && topupKind === 'months';
            const isDayTopup = isTopup && topupKind === 'days';
            const isTermTopup = isMonthTopup || isDayTopup;
            const monthsField = document.getElementById('ownerPlanMonthsField');
            const daysField = document.getElementById('ownerPlanDaysField');
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
            const categoryContainer = document.getElementById('ownerPlanCategoryContainer');
            const categoryField = document.getElementById('ownerPlanCategory');

            if (topupKindField) topupKindField.hidden = !isTopup;
            if (categoryContainer) categoryContainer.hidden = isTopup;
            if (categoryField) {
                categoryField.disabled = isTopup;
                if (isTopup) categoryField.value = 'school';
            }
            if (monthsField) {
                monthsField.hidden = isTopup && !isMonthTopup;
                const label = monthsField.querySelector('label');
                if (label) label.textContent = isMonthTopup ? 'Months to add (Extension)' : 'Term Duration (Months)';
            }
            if (daysField) daysField.hidden = !isDayTopup;
            if (studentCapacityField) studentCapacityField.hidden = isTermTopup;
            if (teacherCapacityField) teacherCapacityField.hidden = isTermTopup;
            if (studentCapacity) studentCapacity.disabled = isTermTopup;
            if (teacherCapacity) teacherCapacity.disabled = isTermTopup;
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
                    const topupOptions = topupPlans.length ? topupPlans.map(item => `<label class="d-flex justify-content-between align-items-center gap-2 border rounded p-2"><span>${escapeHtml(item.name || 'Top-up')} <small class="text-muted">${item.topupKind === 'days' ? `+${Number(item.durationDays || item.daysAdded || 0)} days` : item.topupKind === 'months' ? `+${Number(item.durationMonths || 0)} months` : `${Number(item.studentCapacity || 0)} students · ${Number(item.teacherCapacity || 0)} teachers`} · ${escapeHtml(item.currency || 'INR')} ${Number(item.price || 0).toLocaleString()} each</small></span><input type="number" class="form-control form-control-sm request-topup-quantity" data-topup-id="${escapeAttr(item.id)}" min="0" max="99" step="1" value="0" aria-label="${escapeAttr(item.name || 'Top-up')} quantity" style="width:88px"></label>`).join('') : '<p class="text-muted mb-0">No active top-ups.</p>';
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
                                <div class="col-md-6"><label class="form-label" for="request-main-plan-${index}">Main plan</label><select id="request-main-plan-${index}" class="form-select request-main-plan" ${mainPlans.length ? '' : 'disabled'}>${planOptions || '<option value="">No active main plans</option>'}</select></div>
                                <div class="col-md-6"><label class="form-label" for="request-end-date-${index}"><i class="fas fa-calendar-alt text-primary me-1"></i>Subscription End Date</label><input type="date" id="request-end-date-${index}" class="form-control request-end-date" value="${(() => { const p = mainPlans.find(item => item.id === selectedPlanId) || mainPlans[0]; return p ? addCalendarMonths(new Date(), Number(p.durationMonths || 1)).toISOString().slice(0, 10) : ''; })()}"><div class="form-text small" style="font-size:11px;">Calculated from plan duration. You can adjust this to set an exact custom end date.</div></div>
                                <div class="col-12"><div class="small fw-semibold mb-2">Optional top-ups (quantity)</div><div class="d-grid gap-2">${topupOptions}</div></div>
                                <div class="col-12"><button type="button" class="btn btn-primary fulfill-subscription-request" ${mainPlans.length ? '' : 'disabled'}>Apply plan and top-ups</button></div>
                              </div>
                            </div>
                        </article>`;
                }).join('');

                list.querySelectorAll('.open-request-subscription').forEach(button => {
                    button.addEventListener('click', () => switchSection('owner-pricing'));
                });
                list.querySelectorAll('.request-main-plan').forEach(select => {
                    select.addEventListener('change', () => {
                        const card = select.closest('[data-request-index]');
                        const chosenPlan = mainPlans.find(item => item.id === select.value);
                        const dateInput = card?.querySelector('.request-end-date');
                        if (chosenPlan && dateInput) {
                            dateInput.value = addCalendarMonths(new Date(), Number(chosenPlan.durationMonths || 1)).toISOString().slice(0, 10);
                        }
                    });
                });
                list.querySelectorAll('.fulfill-subscription-request').forEach(button => {
                    button.addEventListener('click', async () => {
                        const card = button.closest('[data-request-index]');
                        const request = requests[Number(card?.dataset.requestIndex)];
                        const planId = card?.querySelector('.request-main-plan')?.value;
                        const customEndDate = card?.querySelector('.request-end-date')?.value || null;
                        const selectedTopups = Array.from(card?.querySelectorAll('.request-topup-quantity') || []).map(input => ({ id: input.dataset.topupId, quantity: Number(input.value || 0) }));
                        button.disabled = true;
                        try {
                            await fulfillSubscriptionRequest(request, planId, selectedTopups, ownerUid, customEndDate);
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

        async function fulfillSubscriptionRequest(request, planId, selectedTopups, ownerUid, customEndDate) {
            if (!request?.schoolId || !request?.requesterUid || !ownerUid) throw new Error('Request or owner session is missing. Refresh and try again.');
            const selectedPlan = pricingPlans.find(item => item.id === planId && item.active !== false && item.type !== 'topup');
            if (!selectedPlan) throw new Error('Select an active main plan.');
            const startDate = new Date();
            let endDate = customEndDate ? new Date(`${customEndDate}T23:59:59`) : new Date(startDate);
            if (!customEndDate) {
                endDate.setMonth(endDate.getMonth() + Number(selectedPlan.durationMonths || 0));
            }
            if (!Number.isFinite(endDate.getTime()) || endDate <= startDate) throw new Error('The subscription end date is invalid.');

            const termExtensionMonths = (selectedTopups || []).reduce((total, selection) => {
                const item = pricingPlans.find(plan => plan.id === selection.id && plan.active !== false && plan.type === 'topup' && plan.topupKind === 'months');
                return total + (item ? Number(item.durationMonths || 0) * Number(selection.quantity || 0) : 0);
            }, 0);
            const termExtensionDays = (selectedTopups || []).reduce((total, selection) => {
                const item = pricingPlans.find(plan => plan.id === selection.id && plan.active !== false && plan.type === 'topup' && plan.topupKind === 'days');
                return total + (item ? Number(item.durationDays || item.daysAdded || 0) * Number(selection.quantity || 0) : 0);
            }, 0);
            const basePlanEnd = new Date(endDate);
            if (termExtensionMonths) endDate = addCalendarMonths(endDate, termExtensionMonths);
            if (termExtensionDays) endDate = new Date(endDate.getTime() + termExtensionDays * 86400000);

            const topups = [];
            for (const selection of selectedTopups || []) {
                const quantity = Number(selection.quantity);
                if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw new Error('Top-up quantities must be whole numbers from 0 to 99.');
                const topup = pricingPlans.find(item => item.id === selection.id && item.active !== false && item.type === 'topup');
                if (!topup && quantity) throw new Error('A selected top-up is no longer available. Refresh and try again.');
                if (!quantity) continue;
                for (let count = 0; count < quantity; count += 1) {
                    const isDaysTopup = topup.topupKind === 'days';
                    const isMonthTopup = topup.topupKind === 'months';
                    const isTermTopup = isMonthTopup || isDaysTopup;
                    const bonus = topup.bonus === true;
                    topups.push({
                        planId: topup.id,
                        name: topup.name || 'Top-up',
                        topupKind: topup.topupKind || (isTermTopup ? (isDaysTopup ? 'days' : 'months') : 'capacity'),
                        monthsAdded: isMonthTopup ? Number(topup.durationMonths || 0) : 0,
                        daysAdded: isDaysTopup ? Number(topup.durationDays || topup.daysAdded || 0) : 0,
                        studentCapacity: isTermTopup ? 0 : bonus && topup.bonusStudentCapacity != null ? Number(topup.bonusStudentCapacity) : Number(topup.studentCapacity || 0),
                        teacherCapacity: isTermTopup ? 0 : bonus && topup.bonusTeacherCapacity != null ? Number(topup.bonusTeacherCapacity) : Number(topup.teacherCapacity || 0),
                        price: bonus ? 0 : Number(topup.price || 0),
                        listPrice: Number(topup.price || 0),
                        currency: topup.currency || selectedPlan.currency || 'INR',
                        bonus,
                        startDate: isTermTopup ? basePlanEnd.toISOString() : startDate.toISOString(),
                        endDate: endDate.toISOString(),
                        assignedAt: startDate.toISOString()
                    });
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
            const subscription = { ...oldSubscription, plan: selectedPlan.name || '', planId: selectedPlan.id, price: Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(selectedPlan.price || 0), basePlanPrice: Number(selectedPlan.price || 0), priceBreakdown, currency: selectedPlan.currency || 'INR', durationMonths: Number(selectedPlan.durationMonths || 0), termExtensionMonths, termExtensionDays, autoRenew: Boolean(selectedPlan.autoRenew), studentCapacity: Number(selectedPlan.studentCapacity || 0), teacherCapacity: Number(selectedPlan.teacherCapacity || 0), topups: allTopups, usage: { students: usage.students, teachers: usage.teachers, updatedAt: Date.now() }, startDate: startDate.toISOString(), endDate: endDate.toISOString(), status: 'active', updatedAt: Date.now() };
            const timestamp = Date.now();
            const updates = {
                [`schools/${request.schoolId}/status`]: 'Active',
                [`schools/${request.schoolId}/subscription`]: subscription,
                [`schools/${request.schoolId}/lastUpdated`]: startDate.toISOString(),
                [`owners/${ownerUid}/schools/${request.schoolId}/status`]: 'Active',
                [`owners/${ownerUid}/schools/${request.schoolId}/subscription`]: subscription,
                [`owners/${ownerUid}/schools/${request.schoolId}/lastUpdated`]: startDate.toISOString(),
                [`publicSchools/${request.schoolId}/status`]: 'Active',
                [`publicSchools/${request.schoolId}/subscriptionEndDate`]: subscription.endDate,
                [`publicSchools/${request.schoolId}/updatedAt`]: timestamp,
                [`subscriptionResubscribeRequests/${request.schoolId}/${request.requesterUid}`]: null,
                [`subscriptionExpiryOverlayCounts/${request.schoolId}`]: null
            };
            await db.ref().update(updates);
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

    function schoolPlanCapacity(school, key) {
        const subscription = school.subscription || {};
        const planId = subscription.planId || subscription.plan || '';
        const plan = pricingPlans.find(item => item.id === planId || item.name === planId);
        return Number(plan?.[key] ?? subscription[key] ?? 0);
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
        if (!grid) return;
        const available = pricingPlans.filter(plan => plan.active !== false);
        const mainPlans = available.filter(plan => plan.type !== 'topup');
        const topupPlans = available.filter(plan => plan.type === 'topup');

        const rawType = String(document.getElementById('schoolType')?.value || '').trim().toLowerCase();
        const institutionCategory = rawType.includes('college') || rawType.includes('university')
            ? 'college'
            : rawType.includes('erp')
            ? 'erp'
            : rawType ? 'school' : '';
        const categoryTitle = institutionCategory === 'college'
            ? 'College'
            : institutionCategory === 'erp'
            ? 'RollCall ERP'
            : institutionCategory === 'school'
            ? 'School'
            : '';

        const filteredMainPlans = mainPlans.filter(plan => {
            if (!institutionCategory) return true;
            const planCat = (plan.productType || (plan.erpPlan === true ? 'erp' : 'school')).toLowerCase();
            return planCat === institutionCategory;
        });

        const filteredTopupPlans = topupPlans.filter(plan => {
            if (!plan.productType || !institutionCategory) return true;
            return plan.productType.toLowerCase() === institutionCategory;
        });

        const previousSelected = document.querySelector('#schoolRegistrationForm [name="subscriptionPlan"]:checked')?.value;
        const willSelectNone = !previousSelected || previousSelected === 'none' || !filteredMainPlans.some(plan => plan.id === previousSelected);

        grid.replaceChildren();

        const filterNotice = document.createElement('div');
        filterNotice.className = 'col-12 mb-2';
        if (institutionCategory) {
            filterNotice.innerHTML = filteredMainPlans.length
                ? `<div class="alert alert-light border py-2 px-3 small d-flex justify-content-between align-items-center mb-0"><span><i class="fas fa-filter text-primary me-2"></i>Showing plans for: <strong>${escapeHtml(categoryTitle)}</strong></span><span class="badge text-bg-primary">${filteredMainPlans.length} plan${filteredMainPlans.length === 1 ? '' : 's'} available</span></div>`
                : `<div class="alert alert-warning py-2 px-3 small mb-0"><i class="fas fa-exclamation-triangle me-2"></i>No subscription plans are currently configured for <strong>${escapeHtml(categoryTitle)}</strong>. You can proceed with <strong>Continue without a plan</strong>, or create a ${escapeHtml(categoryTitle)} plan under <strong>Pricing plans</strong>.</div>`;
        } else {
            filterNotice.innerHTML = '<div class="alert alert-info py-2 px-3 small mb-0"><i class="fas fa-info-circle me-2"></i>Select an <strong>Institution Type</strong> in Step 1 to show plans tailored for your institution, or choose from all available plans below.</div>';
        }
        grid.appendChild(filterNotice);

        const noPlanColumn = document.createElement('div');
        noPlanColumn.className = 'col-md-6';
        noPlanColumn.innerHTML = `<div class="card mb-3 h-100"><div class="card-body"><h5 class="card-title">No subscription</h5><p class="card-text">Register this institution without an active plan. The owner can assign a plan later.</p><div class="form-check"><input class="form-check-input me-2" type="radio" name="subscriptionPlan" id="registrationPlan-none" value="none"${willSelectNone ? ' checked' : ''}><label class="form-check-label" for="registrationPlan-none">Continue without a plan</label></div></div></div>`;
        grid.appendChild(noPlanColumn);

        filteredMainPlans.forEach(plan => {
            const column = document.createElement('div'); column.className = 'col-md-6';
            const card = document.createElement('div'); card.className = 'card mb-3';
            const body = document.createElement('div'); body.className = 'card-body';
            const title = document.createElement('h5'); title.className = 'card-title'; title.textContent = plan.name;
            const productType = plan.productType || (plan.erpPlan === true ? 'erp' : 'school');
            const categoryLabel = productType === 'erp' ? 'RollCall ERP' : productType === 'college' ? 'College' : 'School';
            const detail = document.createElement('p'); detail.className = 'card-text'; detail.textContent = `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} · ${plan.durationMonths || 1} months · ${categoryLabel} · ${Number(plan.studentCapacity || 0).toLocaleString()} students · ${Number(plan.teacherCapacity || 0).toLocaleString()} teachers`;
            const label = document.createElement('label'); label.className = 'form-check-label'; label.htmlFor = `registrationPlan-${plan.id}`; label.textContent = 'Select plan';
            const radio = document.createElement('input'); radio.className = 'form-check-input me-2'; radio.type = 'radio'; radio.name = 'subscriptionPlan'; radio.id = `registrationPlan-${plan.id}`; radio.value = plan.id;
            if (!willSelectNone && previousSelected === plan.id) radio.checked = true;
            const check = document.createElement('div'); check.className = 'form-check'; check.append(radio, label);
            body.append(title, detail, check); card.append(body); column.append(card); grid.append(column);
        });
        const topupSection = document.createElement('div');
        topupSection.className = 'col-12 mt-2';
        topupSection.innerHTML = '<h6><i class="fas fa-plus-circle me-2"></i>Additional top-ups <span class="text-muted fw-normal">(optional)</span></h6><p class="small text-muted">Capacity top-ups use the main plan period. Extra-month and day-wise top-ups extend the subscription end date.</p>';
        if (!filteredTopupPlans.length) {
            const empty = document.createElement('p');
            empty.className = 'small text-muted';
            empty.textContent = 'No top-up offers are currently available.';
            topupSection.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'row g-2';
            filteredTopupPlans.forEach(plan => {
                const column = document.createElement('div');
                column.className = 'col-md-6';
                column.innerHTML = `<div class="border rounded p-3 h-100"><div class="d-flex justify-content-between gap-2"><div><strong class="topup-name"></strong><div class="small text-muted topup-details"></div></div><div class="input-group input-group-sm" style="max-width:130px"><button type="button" class="btn btn-outline-secondary topup-minus" aria-label="Decrease top-up quantity">−</button><input class="form-control text-center topup-quantity" type="number" min="0" max="99" value="0" inputmode="numeric" aria-label="Top-up quantity"><button type="button" class="btn btn-outline-secondary topup-plus" aria-label="Increase top-up quantity">+</button></div></div></div>`;
                column.querySelector('.topup-name').textContent = plan.name;
                column.querySelector('.topup-details').textContent = plan.topupKind === 'days'
                    ? `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()} each · adds ${Number(plan.durationDays || plan.daysAdded || 0)} days`
                    : plan.topupKind === 'months'
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
    window.renderSchoolPlanOptions = renderSchoolPlanOptions;

    function updateRegistrationPlanSummary() {
        const summary = document.getElementById('registrationPlanSummary');
        if (!summary) return;
        const selected = document.querySelector('#schoolRegistrationForm [name=subscriptionPlan]:checked');
        const plan = pricingPlans.find(item => item.id === selected?.value || item.name === selected?.value);
        const hasPlan = Boolean(plan && plan.type !== 'topup' && plan.active !== false);
        document.querySelectorAll('#schoolRegistrationForm .topup-quantity').forEach(input => {
            input.disabled = !hasPlan;
            const controls = input.closest('.input-group');
            controls?.querySelectorAll('button').forEach(button => { button.disabled = !hasPlan; });
            if (!hasPlan) input.value = '0';
        });
        const topupTotals = Array.from(document.querySelectorAll('#schoolRegistrationForm .topup-quantity')).reduce((total, input) => {
            if (!hasPlan) return total;
            const count = Math.max(0, Number(input.value) || 0);
            const item = pricingPlans.find(candidate => candidate.id === input.closest('[data-plan-id]')?.dataset.planId);
            if (item) {
                total.count += count;
                const currency = item.currency || plan?.currency || 'INR';
                total.priceByCurrency[currency] = Number(total.priceByCurrency[currency] || 0) + count * Number(item.price || 0);
                total.months += item.topupKind === 'months' ? count * Number(item.durationMonths || 0) : 0;
                total.days += item.topupKind === 'days' ? count * Number(item.durationDays || item.daysAdded || 0) : 0;
                total.students += count * Number(item.studentCapacity || 0);
                total.teachers += count * Number(item.teacherCapacity || 0);
            }
            return total;
        }, { count: 0, months: 0, days: 0, priceByCurrency: {}, students: 0, teachers: 0 });
        const mainPrice = Number(plan?.price || 0);
        const mainStudents = Number(plan?.studentCapacity || 0);
        const mainTeachers = Number(plan?.teacherCapacity || 0);
        const priceByCurrency = { [plan?.currency || 'INR']: mainPrice };
        Object.entries(topupTotals.priceByCurrency).forEach(([currency, amount]) => { priceByCurrency[currency] = Number(priceByCurrency[currency] || 0) + amount; });
        const priceSummary = Object.entries(priceByCurrency).map(([currency, amount]) => currency + ' ' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })).join(' + ');
        summary.textContent = hasPlan
            ? `${plan.name} · Total: ${priceSummary} · Profile limits: ${mainStudents + topupTotals.students} students, ${mainTeachers + topupTotals.teachers} teachers${topupTotals.months ? ` · +${topupTotals.months} months` : ''}${topupTotals.days ? ` · +${topupTotals.days} days` : ''}${topupTotals.count ? ` · ${topupTotals.count} top-up${topupTotals.count === 1 ? '' : 's'}` : ''}`
            : 'No subscription plan selected. Optional top-ups are unavailable until a main plan is selected.';

        const dateInput = document.getElementById('schoolRegistrationEndDate');
        const container = document.getElementById('registrationPlanEndDateContainer');
        const preview = document.getElementById('registrationEndDatePreview');
        if (container) container.style.display = hasPlan ? 'block' : 'none';
        if (hasPlan) {
            if (dateInput) {
                if (!dateInput.dataset.userModified || !dateInput.value) {
                    const start = new Date();
                    let end = addCalendarMonths(start, Number(plan.durationMonths || 1) + (topupTotals.months || 0));
                    if (topupTotals.days) end = new Date(end.getTime() + topupTotals.days * 86400000);
                    dateInput.value = end.toISOString().slice(0, 10);
                }
                if (preview) {
                    try {
                        const val = dateInput.value ? new Date(`${dateInput.value}T23:59:59`) : null;
                        preview.textContent = val && !isNaN(val.getTime())
                            ? `Ends on: ${val.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
                            : 'No date set';
                    } catch (e) {
                        preview.textContent = 'Invalid date';
                    }
                }
            }
        } else {
            if (dateInput) {
                dateInput.value = '';
                delete dateInput.dataset.userModified;
            }
            if (preview) preview.textContent = 'No date set';
        }

        if (dateInput && !dateInput._presetBound) {
            dateInput._presetBound = true;
            dateInput.addEventListener('input', () => {
                dateInput.dataset.userModified = 'true';
                if (preview) {
                    const val = dateInput.value ? new Date(`${dateInput.value}T23:59:59`) : null;
                    preview.textContent = val && !isNaN(val.getTime())
                        ? `Ends on: ${val.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
                        : 'No date set';
                }
            });
            document.querySelectorAll('.reg-preset-date').forEach(btn => {
                btn.addEventListener('click', () => {
                    const months = Number(btn.dataset.months || 1);
                    const now = new Date();
                    const newEnd = addCalendarMonths(now, months);
                    dateInput.value = newEnd.toISOString().slice(0, 10);
                    dateInput.dataset.userModified = 'true';
                    if (preview) {
                        preview.textContent = `Ends on: ${newEnd.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
                    }
                });
            });
        }
    }

    function installSchoolEditModal() {
        if (document.getElementById('ownerSchoolEditModal')) return;
        const modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = 'ownerSchoolEditModal'; modal.tabIndex = -1;
        modal.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered"><form class="modal-content" id="ownerSchoolEditForm"><div class="modal-header"><div><h2 class="modal-title fs-5">Edit school details</h2><div class="small text-muted">Update school information, contacts, reported totals, and facilities. School code, administrator credentials, and subscription are managed separately.</div></div><button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><input id="ownerEditSchoolId" type="hidden"><h3 class="h6 mb-3">School information</h3><div class="row g-3 mb-4"><div class="col-md-6"><label class="form-label" for="ownerEditName">School name *</label><input class="form-control" id="ownerEditName" required></div><div class="col-md-6"><label class="form-label" for="ownerEditType">Institution type *</label><select class="form-select" id="ownerEditType" required><option value="School">School</option><option value="College">College</option><option value="ERP">RollCall ERP</option></select></div><div class="col-md-6"><label class="form-label" for="ownerEditEstablishedYear">Established year</label><input class="form-control" id="ownerEditEstablishedYear" type="number" min="1800"></div><div class="col-12"><label class="form-label" for="ownerEditAddress">Complete address *</label><textarea class="form-control" id="ownerEditAddress" rows="2" required></textarea></div><div class="col-md-4"><label class="form-label" for="ownerEditCity">City *</label><input class="form-control" id="ownerEditCity" required></div><div class="col-md-4"><label class="form-label" for="ownerEditState">State *</label><input class="form-control" id="ownerEditState" required></div><div class="col-md-4"><label class="form-label" for="ownerEditZipCode">ZIP code *</label><input class="form-control" id="ownerEditZipCode" required></div></div><h3 class="h6 mb-3">Contact information</h3><div class="row g-3 mb-4"><div class="col-md-6"><label class="form-label" for="ownerEditPrincipalName">Principal name *</label><input class="form-control" id="ownerEditPrincipalName" required></div><div class="col-md-6"><label class="form-label" for="ownerEditPrincipalEmail">Principal email *</label><input class="form-control" id="ownerEditPrincipalEmail" type="email" required></div><div class="col-md-6"><label class="form-label" for="ownerEditPhone">School phone *</label><input class="form-control" id="ownerEditPhone" type="tel" required></div><div class="col-md-6"><label class="form-label" for="ownerEditAlternatePhone">Alternate phone</label><input class="form-control" id="ownerEditAlternatePhone" type="tel"></div></div><h3 class="h6 mb-1">School details</h3><p class="small text-muted mb-3">Reported figures are informational and do not change subscription profile limits.</p><div class="row g-3 mb-4"><div class="col-md-4"><label class="form-label" for="ownerEditCapacity">School student capacity</label><input class="form-control" id="ownerEditCapacity" type="number" min="0"></div><div class="col-md-4"><label class="form-label" for="ownerEditCurrentStudents">Current students (reported)</label><input class="form-control" id="ownerEditCurrentStudents" type="number" min="0"></div><div class="col-md-4"><label class="form-label" for="ownerEditTeacherCount">Teachers (reported)</label><input class="form-control" id="ownerEditTeacherCount" type="number" min="0"></div><div class="col-md-6"><label class="form-label" for="ownerEditAccreditation">Accreditation body</label><input class="form-control" id="ownerEditAccreditation"></div><div class="col-md-6"><label class="form-label" for="ownerEditWebsite">School website</label><input class="form-control" id="ownerEditWebsite" type="url" placeholder="https://"></div></div><h3 class="h6 mb-3">Facilities</h3><div class="row g-3"><div class="col-sm-6 col-lg-3"><div class="form-check"><input class="form-check-input" id="ownerEditLibrary" type="checkbox"><label class="form-check-label" for="ownerEditLibrary">Library</label></div></div><div class="col-sm-6 col-lg-3"><div class="form-check"><input class="form-check-input" id="ownerEditComputerLab" type="checkbox"><label class="form-check-label" for="ownerEditComputerLab">Computer lab</label></div></div><div class="col-sm-6 col-lg-3"><div class="form-check"><input class="form-check-input" id="ownerEditSports" type="checkbox"><label class="form-check-label" for="ownerEditSports">Sports facility</label></div></div><div class="col-sm-6 col-lg-3"><div class="form-check"><input class="form-check-input" id="ownerEditTransportation" type="checkbox"><label class="form-check-label" for="ownerEditTransportation">Transportation</label></div></div></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="ownerEditSaveButton" type="submit">Save school details</button></div></form></div>`;
        document.body.append(modal);
        modal.querySelector('form').addEventListener('submit', saveSchoolDetails);
    }

    function openSchoolEdit(school) {
        installSchoolEditModal();
        const modal = document.getElementById('ownerSchoolEditModal');
        const details = school.details || {};
        const facilities = school.facilities || {};
        const fields = {
            ownerEditSchoolId: school.id,
            ownerEditName: school.name || '',
            ownerEditType: school.type || school.institutionType || 'School',
            ownerEditEstablishedYear: school.establishedYear || '',
            ownerEditAddress: school.address?.complete || school.location || '',
            ownerEditCity: school.address?.city || '',
            ownerEditState: school.address?.state || '',
            ownerEditZipCode: school.address?.zipCode || '',
            ownerEditPrincipalName: school.contacts?.principal?.name || '',
            ownerEditPrincipalEmail: school.contacts?.principal?.email || '',
            ownerEditPhone: school.contacts?.phone || school.contact || '',
            ownerEditAlternatePhone: school.contacts?.alternatePhone || '',
            ownerEditCapacity: details.capacity ?? '',
            ownerEditCurrentStudents: details.currentStudents ?? '',
            ownerEditTeacherCount: details.teacherCount ?? '',
            ownerEditAccreditation: details.accreditation || '',
            ownerEditWebsite: details.website || ''
        };
        Object.entries(fields).forEach(([id, value]) => { document.getElementById(id).value = String(value); });
        document.getElementById('ownerEditLibrary').checked = facilities.library === true;
        document.getElementById('ownerEditComputerLab').checked = facilities.computerLab === true;
        document.getElementById('ownerEditSports').checked = facilities.sports === true;
        document.getElementById('ownerEditTransportation').checked = facilities.transportation === true;
        const establishedYear = document.getElementById('ownerEditEstablishedYear');
        establishedYear.max = String(new Date().getFullYear());
        modal.querySelector('#ownerSchoolEditForm').classList.remove('was-validated');
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    async function saveSchoolDetails(event) {
        event.preventDefault();
        const form = event.currentTarget;
        form.classList.add('was-validated');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const id = document.getElementById('ownerEditSchoolId').value;
        const school = (schools || []).find(item => item.id === id);
        if (!school) return notify('School record could not be found. Refresh the list and retry.', 'danger');
        const fieldValue = id => document.getElementById(id).value.trim();
        const schoolDetails = {
            ...school,
            name: fieldValue('ownerEditName'),
            type: fieldValue('ownerEditType'),
            institutionType: fieldValue('ownerEditType').toLowerCase(),
            establishedYear: fieldValue('ownerEditEstablishedYear'),
            address: {
                ...(school.address || {}),
                complete: fieldValue('ownerEditAddress'),
                city: fieldValue('ownerEditCity'),
                state: fieldValue('ownerEditState'),
                zipCode: fieldValue('ownerEditZipCode')
            },
            contacts: {
                ...(school.contacts || {}),
                principal: {
                    ...(school.contacts?.principal || {}),
                    name: fieldValue('ownerEditPrincipalName'),
                    email: fieldValue('ownerEditPrincipalEmail')
                },
                phone: fieldValue('ownerEditPhone'),
                alternatePhone: fieldValue('ownerEditAlternatePhone')
            },
            details: {
                ...(school.details || {}),
                capacity: Number(fieldValue('ownerEditCapacity')) || 0,
                currentStudents: Number(fieldValue('ownerEditCurrentStudents')) || 0,
                teacherCount: Number(fieldValue('ownerEditTeacherCount')) || 0,
                accreditation: fieldValue('ownerEditAccreditation'),
                website: fieldValue('ownerEditWebsite')
            },
            facilities: {
                ...(school.facilities || {}),
                library: document.getElementById('ownerEditLibrary').checked,
                computerLab: document.getElementById('ownerEditComputerLab').checked,
                sports: document.getElementById('ownerEditSports').checked,
                transportation: document.getElementById('ownerEditTransportation').checked
            },
            lastUpdated: new Date().toISOString()
        };
        const updates = {};
        for (const [key, value] of Object.entries(schoolDetails)) {
            updates[`schools/${id}/${key}`] = value;
            updates[`owners/${currentUser.uid}/schools/${id}/${key}`] = value;
        }
        updates[`publicSchools/${id}/name`] = schoolDetails.name;
        updates[`publicSchools/${id}/type`] = schoolDetails.type;
        updates[`publicSchools/${id}/institutionType`] = schoolDetails.institutionType;
        updates[`publicSchools/${id}/updatedAt`] = Date.now();
        const saveButton = document.getElementById('ownerEditSaveButton');
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        try {
            await database.ref().update(updates);
            Object.assign(school, schoolDetails);
            bootstrap.Modal.getInstance(document.getElementById('ownerSchoolEditModal'))?.hide();
            loadSchoolsTable();
            notify('School details updated.', 'success');
        } catch (error) {
            console.error('Could not update school details:', error);
            notify(`Could not update school details: ${error.message}`, 'danger');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save school details';
        }
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
        const selectedKind = document.getElementById('ownerPlanTopupKind').value;
        const topupKind = type === 'topup' ? (selectedKind === 'days' ? 'days' : selectedKind === 'months' ? 'months' : 'capacity') : 'capacity';
        const durationMonths = type === 'topup' && topupKind !== 'months' ? 1 : Number(document.getElementById('ownerPlanMonths').value);
        const durationDays = type === 'topup' && topupKind === 'days' ? Number(document.getElementById('ownerPlanDays')?.value || 7) : 0;
        const productType = type === 'plan' ? document.getElementById('ownerPlanCategory').value : '';
        const isTermTopup = topupKind === 'months' || topupKind === 'days';
        const plan = { name: document.getElementById('ownerPlanName').value.trim(), type, productType, topupKind, price: Number(document.getElementById('ownerPlanPrice').value), currency: document.getElementById('ownerPlanCurrency').value, durationMonths, durationDays, autoRenew: type === 'plan' && document.getElementById('ownerPlanAutoRenew').checked, studentCapacity: isTermTopup ? 0 : Number(document.getElementById('ownerPlanStudentCapacity').value), teacherCapacity: isTermTopup ? 0 : Number(document.getElementById('ownerPlanTeacherCapacity').value), bonus, bonusStudentCapacity: bonusStudentInput === '' ? null : Number(bonusStudentInput), bonusTeacherCapacity: bonusTeacherInput === '' ? null : Number(bonusTeacherInput), features: document.getElementById('ownerPlanFeatures').value.split(',').map(value => value.trim()).filter(Boolean), active: existing ? existing.active !== false : true, updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now() };
        if (!plan.name || !Number.isFinite(plan.price) || plan.price < 0 || (!Number.isInteger(plan.durationMonths) || plan.durationMonths < 1) || (topupKind === 'days' && (!Number.isInteger(plan.durationDays) || plan.durationDays < 1)) || !Number.isInteger(plan.studentCapacity) || plan.studentCapacity < 0 || !Number.isInteger(plan.teacherCapacity) || plan.teacherCapacity < 0 || (plan.bonusStudentCapacity !== null && (!Number.isInteger(plan.bonusStudentCapacity) || plan.bonusStudentCapacity < 0)) || (plan.bonusTeacherCapacity !== null && (!Number.isInteger(plan.bonusTeacherCapacity) || plan.bonusTeacherCapacity < 0))) return notify('Enter a name, valid price, whole-number term/days, and non-negative whole-number capacities.', 'warning');
        try { await ownerPath(`pricingPlans/${id}`).set(plan); resetPricingForm(); await loadPricingPlans(); notify('Pricing plan saved.', 'success'); }
        catch (error) { notify(`Could not save pricing plan: ${error.message}`, 'danger'); }
    }

    function resetPricingForm() {
        document.getElementById('ownerPlanForm')?.reset();
        document.getElementById('ownerPlanId').value = '';
        document.getElementById('ownerPlanMonths').value = 12;
        if (document.getElementById('ownerPlanDays')) document.getElementById('ownerPlanDays').value = 7;
        document.getElementById('ownerPlanType').value = 'plan';
        document.getElementById('ownerPlanTopupKind').value = 'capacity';
        document.getElementById('ownerPlanStudentCapacity').value = 0;
        document.getElementById('ownerPlanTeacherCapacity').value = 0;
        document.getElementById('ownerPlanBonusStudentCapacity').value = '';
        document.getElementById('ownerPlanBonusTeacherCapacity').value = '';
        document.getElementById('ownerPlanBonus').checked = false;
        document.getElementById('ownerPlanAutoRenew').checked = false;
        document.getElementById('ownerPlanCategory').value = 'school';
        document.getElementById('ownerPlanBonus').disabled = true;
        document.getElementById('ownerPlanType').dispatchEvent(new Event('change'));
        document.getElementById('ownerPlanCancel').hidden = true;
        const title = document.getElementById('ownerPlanFormTitle');
        if (title) title.textContent = 'Plan Configuration Suite';
        const subtitle = document.getElementById('ownerPlanFormSubtitle');
        if (subtitle) subtitle.textContent = 'Configure plan details, pricing tiers, and capacity constraints';
        const badge = document.getElementById('ownerPlanFormBadge');
        if (badge) {
            badge.textContent = 'New Plan';
            badge.className = 'badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-1';
        }
    }

    function updatePricingKpis() {
        const activeMain = pricingPlans.filter(p => p.active !== false && p.type !== 'topup');
        const activeTopups = pricingPlans.filter(p => p.active !== false && p.type === 'topup');

        const schoolMain = activeMain.filter(p => (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'school').length;
        const collegeMain = activeMain.filter(p => (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'college').length;
        const erpMain = activeMain.filter(p => (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'erp').length;

        const dayTopups = activeTopups.filter(p => p.topupKind === 'days').length;
        const monthTopups = activeTopups.filter(p => p.topupKind === 'months').length;
        const capTopups = activeTopups.filter(p => p.topupKind !== 'days' && p.topupKind !== 'months').length;

        const now = Date.now();
        let activeSubsCount = 0;
        let expiringSubsCount = 0;

        (schools || []).forEach(school => {
            const current = school.subscription || {};
            const end = Date.parse(current.endDate || '');
            const hasPlan = Boolean(current.planId || current.plan);
            const isExpired = !end || isNaN(end) || end < now;
            const status = String(school.status || 'Active').toLowerCase();
            const subStatus = String(current.status || 'active').toLowerCase();

            if (hasPlan && !isExpired && status === 'active' && subStatus === 'active') {
                activeSubsCount += 1;
            }
            if (hasPlan) {
                const daysLeft = end ? Math.ceil((end - now) / 86400000) : null;
                if (isExpired || (daysLeft !== null && daysLeft <= 14)) {
                    expiringSubsCount += 1;
                }
            }
        });

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
        setVal('kpiMainPlansCount', activeMain.length);
        setVal('kpiMainPlansBreakdown', `${schoolMain} School · ${collegeMain} College · ${erpMain} ERP`);
        setVal('kpiTopupsCount', activeTopups.length);
        setVal('kpiTopupsBreakdown', `${dayTopups} Days · ${monthTopups} Months · ${capTopups} Cap`);
        setVal('kpiActiveSubsCount', activeSubsCount);
        setVal('kpiExpiringSubsCount', expiringSubsCount);
    }

    function renderPricingPlans() {
        const rows = document.getElementById('ownerPlanRows');
        if (!rows) return;

        // Update tab count badges
        const allCount = pricingPlans.length;
        const schoolCount = pricingPlans.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'school').length;
        const collegeCount = pricingPlans.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'college').length;
        const erpCount = pricingPlans.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'erp').length;
        const topupCount = pricingPlans.filter(p => p.type === 'topup').length;

        const setBadgeText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = String(text); };
        setBadgeText('tabCountAll', allCount);
        setBadgeText('tabCountSchool', schoolCount);
        setBadgeText('tabCountCollege', collegeCount);
        setBadgeText('tabCountErp', erpCount);
        setBadgeText('tabCountTopup', topupCount);

        // Filter by catalog tab
        let filtered = pricingPlans.slice();
        if (currentPlanCatalogFilter === 'school') {
            filtered = filtered.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'school');
        } else if (currentPlanCatalogFilter === 'college') {
            filtered = filtered.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'college');
        } else if (currentPlanCatalogFilter === 'erp') {
            filtered = filtered.filter(p => p.type !== 'topup' && (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'erp');
        } else if (currentPlanCatalogFilter === 'topup') {
            filtered = filtered.filter(p => p.type === 'topup');
        }

        // Filter by search query
        const query = (document.getElementById('ownerPlanSearch')?.value || '').trim().toLowerCase();
        if (query) {
            filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(query) || (p.productType || '').toLowerCase().includes(query) || (p.currency || '').toLowerCase().includes(query));
        }

        rows.innerHTML = filtered.length ? '' : `<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-search me-1"></i>No pricing plans found matching "${escapeHtml(query || currentPlanCatalogFilter)}".</td></tr>`;

        filtered.forEach(plan => {
            const row = document.createElement('tr');
            const amount = `${plan.currency || 'INR'} ${Number(plan.price || 0).toLocaleString()}`;
            const productType = plan.productType || (plan.erpPlan === true ? 'erp' : 'school');
            const categoryBadge = plan.type === 'topup'
                ? (plan.topupKind === 'days'
                    ? '<span class="badge rounded-pill bg-info-subtle text-info border border-info-subtle px-2 py-1"><i class="fas fa-calendar-plus me-1"></i>Day Extender</span>'
                    : plan.topupKind === 'months'
                    ? '<span class="badge rounded-pill bg-warning-subtle text-warning border border-warning-subtle px-2 py-1"><i class="fas fa-calendar-alt me-1"></i>Month Extender</span>'
                    : '<span class="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2 py-1"><i class="fas fa-layer-group me-1"></i>Capacity Top-up</span>')
                : (productType === 'college'
                    ? '<span class="badge rounded-pill border px-2 py-1" style="background:#f3e8ff; color:#7e22ce; border-color:#d8b4fe !important;"><i class="fas fa-graduation-cap me-1"></i>College</span>'
                    : productType === 'erp'
                    ? '<span class="badge rounded-pill bg-primary text-white px-2 py-1"><i class="fas fa-cogs me-1"></i>RollCall ERP</span>'
                    : '<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="fas fa-school me-1"></i>School</span>');

            const typePill = plan.type === 'topup'
                ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1">Top-up</span>'
                : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">Base Plan</span>';

            const termText = plan.type === 'topup'
                ? (plan.topupKind === 'days'
                    ? `<span class="fw-semibold text-info">+${Number(plan.durationDays || plan.daysAdded || 0)} days</span>`
                    : plan.topupKind === 'months'
                    ? `<span class="fw-semibold text-warning">+${Number(plan.durationMonths || 0)} months</span>`
                    : '<span class="text-muted small">Subscription term</span>')
                : `<span class="fw-semibold">${plan.durationMonths || 1} months</span>${plan.autoRenew ? ' <small class="text-success"><i class="fas fa-sync-alt" title="Auto-renew enabled"></i></small>' : ''}`;

            const capacityText = plan.type === 'topup' && (plan.topupKind === 'months' || plan.topupKind === 'days')
                ? '<span class="badge bg-light text-secondary border"><i class="fas fa-clock me-1"></i>Term Extender</span>'
                : `<div><span class="small fw-semibold text-dark"><i class="fas fa-user-graduate text-primary me-1"></i>${Number(plan.studentCapacity || 0).toLocaleString()}</span> <span class="text-muted small">students</span></div><div><span class="small fw-semibold text-dark"><i class="fas fa-chalkboard-teacher text-info me-1"></i>${Number(plan.teacherCapacity || 0).toLocaleString()}</span> <span class="text-muted small">teachers</span>${plan.bonus ? ' <span class="badge bg-success-subtle text-success ms-1 small" style="font-size:10px">Bonus</span>' : ''}</div>`;

            const featuresMarkup = Array.isArray(plan.features) && plan.features.length
                ? plan.features.map(f => `<span class="badge bg-light text-dark border me-1 mb-1" style="font-size:11px">${escapeHtml(f)}</span>`).join('')
                : '<span class="text-muted small">—</span>';

            const statusToggle = `<button type="button" class="btn btn-sm ${plan.active === false ? 'btn-outline-secondary' : 'btn-outline-success'} plan-toggle-status" style="border-radius:20px; font-size:12px; padding:2px 10px;">${plan.active === false ? '<i class="fas fa-pause-circle me-1"></i>Inactive' : '<i class="fas fa-check-circle me-1"></i>Active'}</button>`;

            row.innerHTML = `
                <td class="ps-4">
                  <div class="fw-bold text-dark">${escapeHtml(plan.name)}</div>
                  <div class="extra-small text-muted" style="font-size:11px;">ID: ${escapeHtml(plan.id)}</div>
                </td>
                <td>
                  <div class="d-flex align-items-center gap-1 flex-wrap">${categoryBadge} ${typePill}</div>
                </td>
                <td>
                  <div class="fw-bold fs-6 text-dark">${plan.bonus ? '<span class="badge bg-success">Bonus Free</span>' : escapeHtml(amount)}</div>
                </td>
                <td>${termText}</td>
                <td>${capacityText}</td>
                <td style="max-width:200px;">${featuresMarkup}</td>
                <td>${statusToggle}</td>
                <td class="pe-4 text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-primary plan-edit-btn px-3 rounded-pill">
                    <i class="fas fa-pencil-alt me-1"></i>Edit
                  </button>
                </td>
            `;

            row.querySelector('.plan-edit-btn').addEventListener('click', () => {
                document.getElementById('ownerPlanId').value = plan.id;
                document.getElementById('ownerPlanName').value = plan.name;
                document.getElementById('ownerPlanType').value = plan.type === 'topup' ? 'topup' : 'plan';
                document.getElementById('ownerPlanCategory').value = plan.productType || (plan.erpPlan === true ? 'erp' : 'school');
                document.getElementById('ownerPlanTopupKind').value = plan.topupKind === 'days' ? 'days' : plan.topupKind === 'months' ? 'months' : 'capacity';
                if (document.getElementById('ownerPlanDays')) document.getElementById('ownerPlanDays').value = plan.durationDays || plan.daysAdded || 7;
                document.getElementById('ownerPlanPrice').value = plan.price;
                document.getElementById('ownerPlanCurrency').value = plan.currency || 'INR';
                document.getElementById('ownerPlanMonths').value = plan.durationMonths || 1;
                document.getElementById('ownerPlanAutoRenew').checked = plan.autoRenew === true;
                document.getElementById('ownerPlanStudentCapacity').value = plan.studentCapacity || 0;
                document.getElementById('ownerPlanTeacherCapacity').value = plan.teacherCapacity || 0;
                document.getElementById('ownerPlanBonusStudentCapacity').value = plan.bonusStudentCapacity ?? '';
                document.getElementById('ownerPlanBonusTeacherCapacity').value = plan.bonusTeacherCapacity ?? '';
                document.getElementById('ownerPlanBonus').checked = plan.bonus === true;
                document.getElementById('ownerPlanFeatures').value = (plan.features || []).join(', ');
                document.getElementById('ownerPlanCancel').hidden = false;

                const formTitle = document.getElementById('ownerPlanFormTitle');
                if (formTitle) formTitle.textContent = `Editing: ${plan.name}`;
                const formSubtitle = document.getElementById('ownerPlanFormSubtitle');
                if (formSubtitle) formSubtitle.textContent = `Modifying plan configuration (ID: ${plan.id})`;
                const formBadge = document.getElementById('ownerPlanFormBadge');
                if (formBadge) {
                    formBadge.textContent = 'Editing Mode';
                    formBadge.className = 'badge rounded-pill bg-warning-subtle text-warning border border-warning-subtle px-3 py-1';
                }

                document.getElementById('ownerPlanType').dispatchEvent(new Event('change'));
                document.getElementById('ownerPlanTopupKind').dispatchEvent(new Event('change'));
                document.getElementById('ownerPlanBonus').dispatchEvent(new Event('change'));

                document.getElementById('planEditorCard')?.scrollIntoView({ behavior: 'smooth' });
            });

            row.querySelector('.plan-toggle-status').addEventListener('click', async () => {
                try {
                    await ownerPath(`pricingPlans/${plan.id}/active`).set(plan.active === false);
                    await loadPricingPlans();
                    notify(`Plan "${plan.name}" is now ${plan.active === false ? 'Active' : 'Inactive'}.`, 'success');
                } catch (error) {
                    notify(error.message, 'danger');
                }
            });

            rows.append(row);
        });

        updatePricingKpis();
    }

    function renderSubscriptionRows() {
        const body = document.getElementById('ownerSubscriptionRows');
        if (!body) return;

        updatePricingKpis();

        const term = (document.getElementById('ownerSubscriptionSearch')?.value || '').trim().toLowerCase();
        const now = Date.now();

        let filtered = (schools || []).filter(school => `${school.name || ''} ${school.code || ''}`.toLowerCase().includes(term));

        if (currentSubscriptionStatusFilter === 'active') {
            filtered = filtered.filter(school => {
                const end = Date.parse(school.subscription?.endDate || '');
                return school.subscription?.plan && (!end || end >= now) && String(school.status || 'Active').toLowerCase() === 'active';
            });
        } else if (currentSubscriptionStatusFilter === 'expiring') {
            filtered = filtered.filter(school => {
                const end = Date.parse(school.subscription?.endDate || '');
                if (!end) return false;
                const days = Math.ceil((end - now) / 86400000);
                return days >= 0 && days <= 14;
            });
        } else if (currentSubscriptionStatusFilter === 'expired') {
            filtered = filtered.filter(school => {
                const end = Date.parse(school.subscription?.endDate || '');
                return Boolean(end && end < now);
            });
        }

        body.innerHTML = filtered.length ? '' : '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fas fa-search me-1"></i>No registered schools match this search or filter.</td></tr>';

        filtered.forEach(school => {
            const planId = school.subscription?.planId || school.subscription?.plan || '';
            const plans = pricingPlans.filter(plan => plan.active !== false && plan.type !== 'topup').map(plan => `<option value="${escapeAttr(plan.id)}" ${plan.id === planId || plan.name === planId ? 'selected' : ''}>${escapeHtml(plan.name)}${(plan.productType || (plan.erpPlan === true ? 'erp' : 'school')) === 'erp' ? ' · ERP' : ''} · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}</option>`).join('');
            const topups = pricingPlans.filter(plan => plan.active !== false && plan.type === 'topup').map(plan => `<option value="${escapeAttr(plan.id)}">${escapeHtml(plan.name)}${plan.topupKind === 'days' ? ` · +${Number(plan.durationDays || plan.daysAdded || 0)} days · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}` : plan.topupKind === 'months' ? ` · +${Number(plan.durationMonths || 0)} months · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}` : plan.bonus ? ' · Bonus' : ` · ${escapeHtml(plan.currency || 'INR')} ${Number(plan.price || 0)}`}</option>`).join('');

            const row = document.createElement('tr');
            const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
            const basePlan = pricingPlans.find(plan => plan.id === planId || plan.name === planId);
            const validTopups = (school.subscription?.topups || []).filter(item => !item.endDate || Date.parse(item.endDate) >= now);
            const topupCapacity = validTopups.reduce((total, item) => ({ students: total.students + Number(item.studentCapacity || 0), teachers: total.teachers + Number(item.teacherCapacity || 0) }), { students: 0, teachers: 0 });
            const studentCapacity = schoolPlanCapacity(school, 'studentCapacity') + topupCapacity.students;
            const teacherCapacity = schoolPlanCapacity(school, 'teacherCapacity') + topupCapacity.teachers;

            const studentPct = studentCapacity > 0 ? Math.min(100, Math.round((usage.students / studentCapacity) * 100)) : 0;
            const studentOver = usage.students > studentCapacity;
            const teacherPct = teacherCapacity > 0 ? Math.min(100, Math.round((usage.teachers / teacherCapacity) * 100)) : 0;
            const teacherOver = usage.teachers > teacherCapacity;

            const renewal = school.subscription?.endDate || '';
            const renewalDate = renewal ? new Date(renewal) : null;
            const daysLeft = renewalDate ? Math.ceil((renewalDate.getTime() - now) / 86400000) : null;

            let expiryBadge = '';
            if (!renewalDate) {
                expiryBadge = '<span class="badge bg-secondary-subtle text-secondary small">No renewal date</span>';
            } else if (daysLeft < 0) {
                expiryBadge = `<span class="badge bg-danger-subtle text-danger small"><i class="fas fa-exclamation-triangle me-1"></i>Expired (${Math.abs(daysLeft)}d ago)</span>`;
            } else if (daysLeft <= 14) {
                expiryBadge = `<span class="badge bg-warning-subtle text-warning small"><i class="fas fa-clock me-1"></i>Expiring in ${daysLeft}d</span>`;
            } else {
                expiryBadge = `<span class="badge bg-success-subtle text-success small"><i class="fas fa-check-circle me-1"></i>${daysLeft}d remaining</span>`;
            }

            row.innerHTML = `
                <td class="ps-4">
                  <div class="fw-bold text-dark">${escapeHtml(school.name || 'Unnamed School')}</div>
                  <div class="d-flex align-items-center gap-1 mt-1">
                    <span class="badge bg-light text-secondary border font-monospace" style="font-size:11px;">${escapeHtml(school.code || '—')}</span>
                    <span class="badge bg-secondary-subtle text-secondary" style="font-size:11px;">${escapeHtml(school.type || 'School')}</span>
                  </div>
                </td>
                <td>
                  <select class="form-select form-select-sm school-plan rounded-3" aria-label="Main plan for ${escapeAttr(school.name || 'school')}">
                    <option value="">No plan assigned</option>
                    ${plans}
                  </select>
                </td>
                <td>
                  <div class="p-2 rounded bg-light-subtle border">
                    <div class="d-flex justify-content-between align-items-center mb-1" style="font-size:11px;">
                      <span><i class="fas fa-user-graduate text-primary me-1"></i>Students: <strong>${usage.students.toLocaleString()}</strong> / ${studentCapacity.toLocaleString()}</span>
                      <span class="badge ${studentOver ? 'bg-danger text-white' : 'bg-light text-muted'}">${studentPct}%</span>
                    </div>
                    <div class="progress mb-2" style="height: 4px;">
                      <div class="progress-bar ${studentOver ? 'bg-danger' : studentPct > 85 ? 'bg-warning' : 'bg-primary'}" role="progressbar" style="width: ${studentPct}%;"></div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-1" style="font-size:11px;">
                      <span><i class="fas fa-chalkboard-teacher text-info me-1"></i>Teachers: <strong>${usage.teachers.toLocaleString()}</strong> / ${teacherCapacity.toLocaleString()}</span>
                      <span class="badge ${teacherOver ? 'bg-danger text-white' : 'bg-light text-muted'}">${teacherPct}%</span>
                    </div>
                    <div class="progress" style="height: 4px;">
                      <div class="progress-bar ${teacherOver ? 'bg-danger' : teacherPct > 85 ? 'bg-warning' : 'bg-info'}" role="progressbar" style="width: ${teacherPct}%;"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <select class="form-select form-select-sm school-topup rounded-3" aria-label="Top-up for ${escapeAttr(school.name || 'school')}">
                    <option value="">Select add-on...</option>
                    ${topups}
                  </select>
                  <div class="d-flex gap-1 mt-2">
                    <button type="button" class="btn btn-sm btn-outline-warning apply-topup rounded-pill px-2" style="font-size:11px;"><i class="fas fa-plus me-1"></i>Apply Top-up</button>
                    <button type="button" class="btn btn-sm btn-outline-info quick-extend-days rounded-pill px-2" style="font-size:11px;" title="Quick day-wise plan extender"><i class="fas fa-calendar-plus me-1"></i>+ Days</button>
                  </div>
                </td>
                <td>
                  <input class="form-control form-control-sm school-renewal rounded-3" type="date" aria-label="Subscription renewal date" title="Subscription end date">
                  <div class="d-flex align-items-center justify-content-between gap-1 mt-1">
                    <div class="school-expiry-badge-container">${expiryBadge}</div>
                    <div class="form-check form-switch mb-0" style="min-height:auto;">
                      <input class="form-check-input school-auto-renew" type="checkbox" id="autoRenew-${escapeAttr(school.id)}" role="switch" title="Auto-renew toggle">
                    </div>
                  </div>
                  <div class="btn-group btn-group-sm mt-1 w-100" role="group" aria-label="End date quick presets">
                    <button type="button" class="btn btn-outline-secondary py-0 px-1 table-preset-date" data-months="1" style="font-size:10px;" title="Set end date to 1 month from now">+1M</button>
                    <button type="button" class="btn btn-outline-secondary py-0 px-1 table-preset-date" data-months="3" style="font-size:10px;" title="Set end date to 3 months from now">+3M</button>
                    <button type="button" class="btn btn-outline-secondary py-0 px-1 table-preset-date" data-months="6" style="font-size:10px;" title="Set end date to 6 months from now">+6M</button>
                    <button type="button" class="btn btn-outline-secondary py-0 px-1 table-preset-date" data-months="12" style="font-size:10px;" title="Set end date to 1 year from now">+1Y</button>
                  </div>
                </td>
                <td>
                  <select class="form-select form-select-sm school-status rounded-3">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </td>
                <td class="pe-4 text-end">
                  <div class="d-flex align-items-center justify-content-end gap-1">
                    <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-2 open-set-plan-end-date" title="Set plan & custom end date">
                      <i class="fas fa-calendar-alt me-1"></i>Set End Date
                    </button>
                    <button class="btn btn-sm btn-primary rounded-pill px-3 shadow-sm save-subscription-btn">
                      <i class="fas fa-save me-1"></i>Save
                    </button>
                  </div>
                </td>
            `;

            const renewalInput = row.querySelector('.school-renewal');
            const badgeContainer = row.querySelector('.school-expiry-badge-container');
            const planSelect = row.querySelector('.school-plan');
            const statusSelect = row.querySelector('.school-status');

            renewalInput.value = renewal ? new Date(renewal).toISOString().slice(0, 10) : '';
            row.querySelector('.school-auto-renew').checked = school.subscription?.autoRenew === true || (school.subscription?.autoRenew === undefined && basePlan?.autoRenew === true);
            const expired = renewal && Date.parse(renewal) < now;
            const status = String(school.status || 'Active').toLowerCase();
            const subscriptionStatus = String(school.subscription?.status || 'active').toLowerCase();
            statusSelect.value = status === 'inactive' || status === 'suspended' || subscriptionStatus === 'inactive' || expired ? 'Inactive' : 'Active';

            function updateRowBadge(targetDateStr) {
                if (!badgeContainer) return;
                const d = targetDateStr ? new Date(`${targetDateStr}T23:59:59`) : null;
                if (!d || isNaN(d.getTime())) {
                    badgeContainer.innerHTML = '<span class="badge bg-secondary-subtle text-secondary small">No renewal date</span>';
                    return;
                }
                const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
                if (days < 0) {
                    badgeContainer.innerHTML = `<span class="badge bg-danger-subtle text-danger small"><i class="fas fa-exclamation-triangle me-1"></i>Expired (${Math.abs(days)}d ago)</span>`;
                } else if (days <= 14) {
                    badgeContainer.innerHTML = `<span class="badge bg-warning-subtle text-warning small"><i class="fas fa-clock me-1"></i>Expiring in ${days}d</span>`;
                } else {
                    badgeContainer.innerHTML = `<span class="badge bg-success-subtle text-success small"><i class="fas fa-check-circle me-1"></i>${days}d remaining</span>`;
                }
            }

            renewalInput.addEventListener('input', () => {
                updateRowBadge(renewalInput.value);
            });

            planSelect.addEventListener('change', () => {
                const chosen = pricingPlans.find(item => item.id === planSelect.value);
                if (chosen) {
                    const newEnd = addCalendarMonths(new Date(), Number(chosen.durationMonths || 1));
                    renewalInput.value = newEnd.toISOString().slice(0, 10);
                    statusSelect.value = 'Active';
                    updateRowBadge(renewalInput.value);
                }
            });

            row.querySelectorAll('.table-preset-date').forEach(btn => {
                btn.addEventListener('click', () => {
                    const m = Number(btn.dataset.months || 1);
                    const newEnd = addCalendarMonths(new Date(), m);
                    renewalInput.value = newEnd.toISOString().slice(0, 10);
                    statusSelect.value = 'Active';
                    updateRowBadge(renewalInput.value);
                });
            });

            row.querySelector('.apply-topup').addEventListener('click', () => addSchoolTopup(school, row));
            row.querySelector('.quick-extend-days').addEventListener('click', () => promptQuickDayExtender(school));
            row.querySelector('.open-set-plan-end-date').addEventListener('click', () => promptSetPlanEndDate(school));
            row.querySelector('.save-subscription-btn').addEventListener('click', () => saveSchoolSubscription(school, row));
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
            const isDays = plan.topupKind === 'days';
            const isMonths = plan.topupKind === 'months';
            const isTerm = isDays || isMonths;
            return Array.from({ length: quantity }, () => ({
                planId: plan.id,
                name: plan.name,
                topupKind: plan.topupKind || (isTerm ? (isDays ? 'days' : 'months') : 'capacity'),
                monthsAdded: isMonths ? Number(plan.durationMonths || 0) : 0,
                daysAdded: isDays ? Number(plan.durationDays || plan.daysAdded || 0) : 0,
                studentCapacity: isTerm ? 0 : Number(plan.studentCapacity || 0),
                teacherCapacity: isTerm ? 0 : Number(plan.teacherCapacity || 0),
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
            const lastUpdated = new Date().toISOString();
            const timestamp = Date.now();
            await database.ref().update({
                [`schools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                [`schools/${school.id}/subscription`]: subscription,
                [`schools/${school.id}/lastUpdated`]: lastUpdated,
                [`owners/${currentUser.uid}/schools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                [`owners/${currentUser.uid}/schools/${school.id}/subscription`]: subscription,
                [`owners/${currentUser.uid}/schools/${school.id}/lastUpdated`]: lastUpdated,
                [`publicSchools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
                [`publicSchools/${school.id}/updatedAt`]: timestamp,
                [`subscriptionExpiryOverlayCounts/${school.id}`]: null
            });
            notify(`${school.name || 'School'} subscription updated.`, 'success');
            await refreshSchoolData();
        } catch (error) { notify(`Could not update the school record: ${error.message}`, 'danger'); }
    }

    async function addSchoolTopup(school, row) {
        const topup = pricingPlans.find(plan => plan.id === row.querySelector('.school-topup').value && plan.type === 'topup');
        const current = school.subscription || {};
        const endDateParsed = Date.parse(current.endDate || '');
        const isExpired = !endDateParsed || isNaN(endDateParsed) || endDateParsed < Date.now();
        const active = String(current.status || 'active').toLowerCase() === 'active' && !isExpired;
        const isTermTopup = topup?.topupKind === 'months' || topup?.topupKind === 'days';
        if (!topup) return notify('Select a top-up first.', 'warning');
        if (!current.planId && !current.plan) return notify('A main plan is required before adding a top-up.', 'warning');
        if (!active && !isTermTopup) return notify('Capacity top-ups can only be added while the main plan is active.', 'warning');
        const startDate = new Date();
        const baseStart = isExpired ? startDate : new Date(endDateParsed);

        if (topup.topupKind === 'days') {
            const daysAdded = Number(topup.durationDays || topup.daysAdded || 0);
            if (!Number.isInteger(daysAdded) || daysAdded < 1) return notify('This day-wise top-up has an invalid day increment.', 'warning');
            const extendedEndDate = new Date(baseStart.getTime() + daysAdded * 86400000);
            const entry = {
                planId: topup.id,
                name: topup.name || 'Extra days',
                topupKind: 'days',
                daysAdded,
                monthsAdded: 0,
                studentCapacity: 0,
                teacherCapacity: 0,
                price: Number(topup.price || 0),
                listPrice: Number(topup.price || 0),
                currency: topup.currency || current.currency || 'INR',
                startDate: baseStart.toISOString(),
                endDate: extendedEndDate.toISOString(),
                assignedAt: startDate.toISOString()
            };
            const topups = [...(Array.isArray(current.topups) ? current.topups : []), entry];
            const priceBreakdown = { [current.currency || 'INR']: Number(current.basePlanPrice ?? current.price ?? 0) };
            topups.forEach(item => { const currency = item.currency || current.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const price = Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(current.basePlanPrice ?? current.price ?? 0);
            const subscription = {
                ...current,
                status: 'active',
                endDate: extendedEndDate.toISOString(),
                termExtensionDays: Number(current.termExtensionDays || 0) + daysAdded,
                topups,
                price,
                priceBreakdown,
                updatedAt: Date.now()
            };
            try {
                const timestamp = Date.now();
                await database.ref().update({
                    [`schools/${school.id}/status`]: 'Active',
                    [`schools/${school.id}/subscription`]: subscription,
                    [`schools/${school.id}/lastUpdated`]: startDate.toISOString(),
                    [`owners/${currentUser.uid}/schools/${school.id}/status`]: 'Active',
                    [`owners/${currentUser.uid}/schools/${school.id}/subscription`]: subscription,
                    [`owners/${currentUser.uid}/schools/${school.id}/lastUpdated`]: startDate.toISOString(),
                    [`publicSchools/${school.id}/status`]: 'Active',
                    [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
                    [`publicSchools/${school.id}/updatedAt`]: timestamp,
                    [`subscriptionExpiryOverlayCounts/${school.id}`]: null
                });
                notify(`${topup.name} added (+${daysAdded} days). The subscription now ends ${extendedEndDate.toLocaleDateString()}.`, 'success');
                await refreshSchoolData();
            } catch (error) { notify(`Could not add the day-wise top-up: ${error.message}`, 'danger'); }
            return;
        }

        if (topup.topupKind === 'months') {
            const monthsAdded = Number(topup.durationMonths || 0);
            if (!Number.isInteger(monthsAdded) || monthsAdded < 1) return notify('This extra-month top-up has an invalid month increment.', 'warning');
            const extendedEndDate = addCalendarMonths(baseStart, monthsAdded);
            const entry = {
                planId: topup.id,
                name: topup.name || 'Extra months',
                topupKind: 'months',
                monthsAdded,
                daysAdded: 0,
                studentCapacity: 0,
                teacherCapacity: 0,
                price: Number(topup.price || 0),
                listPrice: Number(topup.price || 0),
                currency: topup.currency || current.currency || 'INR',
                startDate: baseStart.toISOString(),
                endDate: extendedEndDate.toISOString(),
                assignedAt: startDate.toISOString()
            };
            const topups = [...(Array.isArray(current.topups) ? current.topups : []), entry];
            const priceBreakdown = { [current.currency || 'INR']: Number(current.basePlanPrice ?? current.price ?? 0) };
            topups.forEach(item => { const currency = item.currency || current.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const price = Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(current.basePlanPrice ?? current.price ?? 0);
            const subscription = {
                ...current,
                status: 'active',
                endDate: extendedEndDate.toISOString(),
                termExtensionMonths: Number(current.termExtensionMonths || 0) + monthsAdded,
                topups,
                price,
                priceBreakdown,
                updatedAt: Date.now()
            };
            try {
                const timestamp = Date.now();
                await database.ref().update({
                    [`schools/${school.id}/status`]: 'Active',
                    [`schools/${school.id}/subscription`]: subscription,
                    [`schools/${school.id}/lastUpdated`]: startDate.toISOString(),
                    [`owners/${currentUser.uid}/schools/${school.id}/status`]: 'Active',
                    [`owners/${currentUser.uid}/schools/${school.id}/subscription`]: subscription,
                    [`owners/${currentUser.uid}/schools/${school.id}/lastUpdated`]: startDate.toISOString(),
                    [`publicSchools/${school.id}/status`]: 'Active',
                    [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
                    [`publicSchools/${school.id}/updatedAt`]: timestamp,
                    [`subscriptionExpiryOverlayCounts/${school.id}`]: null
                });
                notify(`${topup.name} added. The subscription now ends ${extendedEndDate.toLocaleDateString()}.`, 'success');
                await refreshSchoolData();
            } catch (error) { notify(`Could not add the month top-up: ${error.message}`, 'danger'); }
            return;
        }

        const remainingDays = Math.max(1, Math.ceil((endDateParsed - startDate.getTime()) / 86400000));
        const originalDays = Math.max(1, (Number(current.durationMonths || 1) + Number(current.termExtensionMonths || 0)) * 30 + Number(current.termExtensionDays || 0));
        const chargedPrice = topup.bonus ? 0 : Math.round(Number(topup.price || 0) * remainingDays / originalDays * 100) / 100;
        const isBonus = topup.bonus === true;
        const entry = { planId: topup.id, name: topup.name, topupKind: 'capacity', studentCapacity: isBonus && topup.bonusStudentCapacity !== null && topup.bonusStudentCapacity !== undefined ? Number(topup.bonusStudentCapacity) : Number(topup.studentCapacity || 0), teacherCapacity: isBonus && topup.bonusTeacherCapacity !== null && topup.bonusTeacherCapacity !== undefined ? Number(topup.bonusTeacherCapacity) : Number(topup.teacherCapacity || 0), price: chargedPrice, listPrice: Number(topup.price || 0), currency: topup.currency || current.currency || 'INR', bonus: isBonus, startDate: startDate.toISOString(), endDate: current.endDate, assignedAt: startDate.toISOString() };
        const topups = Array.isArray(current.topups) ? current.topups.slice() : [];
        topups.push(entry);
        try {
            const priceBreakdown = { [current.currency || 'INR']: Number(current.basePlanPrice ?? current.price ?? 0) };
            topups.forEach(item => { const currency = item.currency || current.currency || 'INR'; priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0); });
            const price = Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : Number(current.basePlanPrice ?? current.price ?? 0);
            await database.ref().update({
                [`schools/${school.id}/subscription/topups`]: topups,
                [`schools/${school.id}/subscription/price`]: price,
                [`schools/${school.id}/subscription/priceBreakdown`]: priceBreakdown,
                [`schools/${school.id}/subscription/updatedAt`]: Date.now(),
                [`owners/${currentUser.uid}/schools/${school.id}/subscription/topups`]: topups,
                [`owners/${currentUser.uid}/schools/${school.id}/subscription/price`]: price,
                [`owners/${currentUser.uid}/schools/${school.id}/subscription/priceBreakdown`]: priceBreakdown,
                [`owners/${currentUser.uid}/schools/${school.id}/subscription/updatedAt`]: Date.now()
            });
            notify(`${topup.name} added to ${school.name || 'school'}${topup.bonus ? ' as a bonus.' : ` for ${entry.currency} ${chargedPrice}.`}`, 'success');
            await refreshSchoolData();
        } catch (error) { notify(`Could not add the top-up: ${error.message}`, 'danger'); }
    }

    function promptSetPlanEndDate(school) {
        const current = school.subscription || {};
        const endDateParsed = Date.parse(current.endDate || '');
        const isExpired = !endDateParsed || isNaN(endDateParsed) || endDateParsed < Date.now();
        const modalId = 'setSchoolPlanEndDateModal';
        document.getElementById(modalId)?.remove();

        const activeMainPlans = pricingPlans.filter(p => p.active !== false && p.type !== 'topup');
        const currentPlanId = current.planId || current.plan || '';
        const selectedPlan = activeMainPlans.find(p => p.id === currentPlanId || p.name === currentPlanId) || activeMainPlans[0];

        const defaultEndDate = current.endDate
            ? new Date(current.endDate).toISOString().slice(0, 10)
            : (selectedPlan ? addCalendarMonths(new Date(), Number(selectedPlan.durationMonths || 1)).toISOString().slice(0, 10) : '');

        const planOptionsHtml = activeMainPlans.map(p => {
            const isSel = selectedPlan && p.id === selectedPlan.id;
            const typeLabel = (p.productType || (p.erpPlan === true ? 'erp' : 'school')) === 'erp' ? ' · RollCall ERP' : '';
            return `<option value="${escapeAttr(p.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(p.name)}${typeLabel} (${p.durationMonths || 1} mo · ${p.currency || 'INR'} ${Number(p.price || 0).toLocaleString()})</option>`;
        }).join('');

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.setAttribute('aria-label', `Set subscription plan and end date for ${school.name || 'school'}`);
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered" style="max-width: 520px;">
                <div class="modal-content shadow-lg border-0" style="border-radius: 14px;">
                    <div class="modal-header border-bottom pb-3">
                        <div>
                            <h5 class="modal-title fw-bold text-primary"><i class="fas fa-calendar-check me-2"></i>Set School Plan &amp; End Date</h5>
                            <div class="small text-muted">${escapeHtml(school.name || 'School')} · <span class="font-monospace">${escapeHtml(school.code || '—')}</span></div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body py-3">
                        <div class="mb-3">
                            <label class="form-label fw-semibold small" for="modalPlanSelect"><i class="fas fa-tag text-primary me-1"></i>Subscription Plan</label>
                            <select id="modalPlanSelect" class="form-select rounded-3">
                                ${planOptionsHtml || '<option value="">No active plans</option>'}
                            </select>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold small d-flex justify-content-between">
                                <span><i class="fas fa-calendar-day text-primary me-1"></i>Subscription End Date</span>
                                <span id="modalDateDiffBadge" class="badge bg-light text-primary border"></span>
                            </label>
                            <input type="date" id="modalEndDateInput" class="form-control rounded-3" value="${defaultEndDate}">
                            <div class="form-text small mt-1">Pick an exact calendar end date or use quick duration presets below.</div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold small text-muted">Quick Duration Presets</label>
                            <div class="d-flex flex-wrap gap-1 mb-2">
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-days="15">+15 Days</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-months="1">+1 Month</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-months="3">+3 Months</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-months="6">+6 Months</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-months="12">+1 Year</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-preset-btn" data-months="24">+2 Years</button>
                            </div>
                            <div class="d-flex align-items-center gap-3 small text-muted">
                                <span>Calculate preset from:</span>
                                <div class="form-check form-check-inline mb-0">
                                    <input class="form-check-input" type="radio" name="modalCalcOrigin" id="modalCalcToday" value="today" checked>
                                    <label class="form-check-label" for="modalCalcToday">Today</label>
                                </div>
                                <div class="form-check form-check-inline mb-0">
                                    <input class="form-check-input" type="radio" name="modalCalcOrigin" id="modalCalcCurrentEnd" value="currentEnd" ${!isExpired && endDateParsed ? '' : 'disabled'}>
                                    <label class="form-check-label" for="modalCalcCurrentEnd">Current End Date</label>
                                </div>
                            </div>
                        </div>

                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label fw-semibold small" for="modalStatusSelect">Account Status</label>
                                <select id="modalStatusSelect" class="form-select form-select-sm rounded-3">
                                    <option value="Active" selected>Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div class="col-6 d-flex align-items-end">
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" role="switch" id="modalAutoRenewSwitch" ${current.autoRenew === true ? 'checked' : ''}>
                                    <label class="form-check-label small" for="modalAutoRenewSwitch">Auto-renew</label>
                                </div>
                            </div>
                        </div>

                        <div id="modalSummaryAlert" class="alert alert-light border small mb-0">
                            Loading summary...
                        </div>
                    </div>
                    <div class="modal-footer border-top pt-2">
                        <button type="button" class="btn btn-outline-secondary rounded-pill px-3" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary rounded-pill px-4" id="modalSaveEndDateBtn"><i class="fas fa-save me-1"></i>Save Subscription</button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        const modalPlanSelect = modal.querySelector('#modalPlanSelect');
        const modalDateInput = modal.querySelector('#modalEndDateInput');
        const diffBadge = modal.querySelector('#modalDateDiffBadge');
        const summaryAlert = modal.querySelector('#modalSummaryAlert');
        const modalStatusSelect = modal.querySelector('#modalStatusSelect');
        const autoRenewSwitch = modal.querySelector('#modalAutoRenewSwitch');
        const saveBtn = modal.querySelector('#modalSaveEndDateBtn');

        function updateModalSummary() {
            const chosenPlan = activeMainPlans.find(p => p.id === modalPlanSelect.value);
            const val = modalDateInput.value ? new Date(`${modalDateInput.value}T23:59:59`) : null;
            if (!val || isNaN(val.getTime())) {
                diffBadge.className = 'badge bg-danger text-white';
                diffBadge.textContent = 'Invalid date';
                summaryAlert.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle me-1"></i>Please choose a valid end date.</span>';
                saveBtn.disabled = true;
                return;
            }
            saveBtn.disabled = false;
            const days = Math.ceil((val.getTime() - Date.now()) / 86400000);
            if (days < 0) {
                diffBadge.className = 'badge bg-danger text-white';
                diffBadge.textContent = `Expired (${Math.abs(days)}d ago)`;
            } else if (days <= 14) {
                diffBadge.className = 'badge bg-warning text-dark';
                diffBadge.textContent = `Expiring in ${days}d`;
            } else {
                diffBadge.className = 'badge bg-success text-white';
                diffBadge.textContent = `${days} days active`;
            }

            const formattedDate = val.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            summaryAlert.innerHTML = `
                <div class="d-flex justify-content-between mb-1">
                    <span>Plan:</span>
                    <strong>${escapeHtml(chosenPlan?.name || 'Custom plan')}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1">
                    <span>Valid until:</span>
                    <strong class="text-primary">${formattedDate}</strong>
                </div>
                <div class="d-flex justify-content-between">
                    <span>Duration:</span>
                    <span>${days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'Expired'}</span>
                </div>`;
        }

        modalPlanSelect.addEventListener('change', () => {
            const chosen = activeMainPlans.find(p => p.id === modalPlanSelect.value);
            if (chosen) {
                modalDateInput.value = addCalendarMonths(new Date(), Number(chosen.durationMonths || 1)).toISOString().slice(0, 10);
            }
            updateModalSummary();
        });

        modalDateInput.addEventListener('input', updateModalSummary);

        modal.querySelectorAll('.modal-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const originRadio = modal.querySelector('input[name="modalCalcOrigin"]:checked');
                const originMode = originRadio ? originRadio.value : 'today';
                const base = (originMode === 'currentEnd' && !isExpired && endDateParsed) ? new Date(endDateParsed) : new Date();
                let next;
                if (btn.dataset.days) {
                    next = new Date(base.getTime() + Number(btn.dataset.days) * 86400000);
                } else if (btn.dataset.months) {
                    next = addCalendarMonths(base, Number(btn.dataset.months));
                }
                if (next) {
                    modalDateInput.value = next.toISOString().slice(0, 10);
                    updateModalSummary();
                }
            });
        });

        updateModalSummary();

        saveBtn.addEventListener('click', async () => {
            const chosenPlan = activeMainPlans.find(p => p.id === modalPlanSelect.value);
            if (!chosenPlan) return notify('Please select a subscription plan.', 'warning');
            const endVal = modalDateInput.value;
            if (!endVal) return notify('Please specify an end date.', 'warning');
            const targetEndDate = new Date(`${endVal}T23:59:59`);
            if (isNaN(targetEndDate.getTime())) return notify('Invalid end date.', 'danger');

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

            try {
                const active = modalStatusSelect.value === 'Active';
                const currentEnd = Date.parse(current.endDate || '');
                const startDate = current.startDate && currentEnd >= Date.now() ? new Date(current.startDate) : new Date();
                const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
                const topups = (Array.isArray(current.topups) ? current.topups : []).filter(item => !item.endDate || Date.parse(item.endDate) >= Date.now());
                if (chosenPlan?.bonus && !topups.some(item => item.includedWithPlan && item.planId === chosenPlan.id && Date.parse(item.endDate || '') > Date.now())) {
                    topups.push(createBonusTopupEntry(chosenPlan, startDate, targetEndDate));
                }
                const basePlanPrice = Number(chosenPlan?.price || 0);
                const priceBreakdown = { [chosenPlan?.currency || 'INR']: basePlanPrice };
                topups.forEach(item => {
                    const currency = item.currency || chosenPlan?.currency || 'INR';
                    priceBreakdown[currency] = Number(priceBreakdown[currency] || 0) + Number(item.price || 0);
                });
                const subscription = {
                    ...current,
                    plan: chosenPlan?.name || '',
                    planId: chosenPlan?.id || '',
                    price: Object.keys(priceBreakdown).length === 1 ? Object.values(priceBreakdown)[0] : basePlanPrice,
                    basePlanPrice,
                    priceBreakdown,
                    currency: chosenPlan?.currency || 'INR',
                    durationMonths: chosenPlan?.durationMonths || 0,
                    autoRenew: autoRenewSwitch.checked,
                    studentCapacity: Number(chosenPlan?.studentCapacity || 0),
                    teacherCapacity: Number(chosenPlan?.teacherCapacity || 0),
                    topups,
                    usage: { students: usage.students, teachers: usage.teachers, updatedAt: Date.now() },
                    startDate: startDate.toISOString(),
                    endDate: targetEndDate.toISOString(),
                    status: active ? 'active' : 'inactive',
                    updatedAt: Date.now()
                };

                const lastUpdated = new Date().toISOString();
                const timestamp = Date.now();
                await database.ref().update({
                    [`schools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                    [`schools/${school.id}/subscription`]: subscription,
                    [`schools/${school.id}/lastUpdated`]: lastUpdated,
                    [`owners/${currentUser.uid}/schools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                    [`owners/${currentUser.uid}/schools/${school.id}/subscription`]: subscription,
                    [`owners/${currentUser.uid}/schools/${school.id}/lastUpdated`]: lastUpdated,
                    [`publicSchools/${school.id}/status`]: active ? 'Active' : 'Inactive',
                    [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
                    [`publicSchools/${school.id}/updatedAt`]: timestamp,
                    [`subscriptionExpiryOverlayCounts/${school.id}`]: null
                });

                notify(`Subscription and end date updated for ${school.name || 'school'}.`, 'success');
                bsModal.hide();
                await refreshSchoolData();
            } catch (err) {
                console.error('Error saving plan end date:', err);
                notify(`Failed to save: ${err.message}`, 'danger');
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Save Subscription';
            }
        });
    }

    function promptQuickDayExtender(school) {
        const current = school.subscription || {};
        const endDateParsed = Date.parse(current.endDate || '');
        const isExpired = !endDateParsed || isNaN(endDateParsed) || endDateParsed < Date.now();
        const baseStart = isExpired ? new Date() : new Date(endDateParsed);
        const modalId = 'quickDayExtenderModal';
        document.getElementById(modalId)?.remove();

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.setAttribute('aria-label', `Extend subscription for ${school.name || 'school'}`);
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
                <div class="modal-content shadow-lg border-0" style="border-radius: 14px;">
                    <div class="modal-header border-bottom pb-3">
                        <div>
                            <h5 class="modal-title fw-bold text-primary"><i class="fas fa-calendar-plus me-2"></i>Day-wise Plan Extender</h5>
                            <div class="small text-muted">${escapeHtml(school.name || 'School')} · ${escapeHtml(school.code || '—')}</div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body py-3">
                        <div class="alert alert-light border small mb-3">
                            <div class="d-flex justify-content-between mb-1">
                                <span>Current Plan:</span>
                                <strong>${escapeHtml(current.plan || 'Main plan')}</strong>
                            </div>
                            <div class="d-flex justify-content-between mb-1">
                                <span>Current End Date:</span>
                                <span class="${isExpired ? 'badge text-bg-danger' : 'fw-semibold'}">${current.endDate ? new Date(current.endDate).toLocaleDateString() : 'None'}${isExpired ? ' (Expired)' : ''}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Extension Starts From:</span>
                                <span class="fw-semibold text-primary">${baseStart.toLocaleDateString()}</span>
                            </div>
                        </div>
                        <label class="form-label fw-semibold small">Quick preset:</label>
                        <div class="d-flex gap-2 flex-wrap mb-3">
                            <button type="button" class="btn btn-sm btn-outline-primary preset-day-btn" data-days="1">+1 Day</button>
                            <button type="button" class="btn btn-sm btn-outline-primary preset-day-btn" data-days="3">+3 Days</button>
                            <button type="button" class="btn btn-sm btn-outline-primary preset-day-btn active" data-days="7">+7 Days</button>
                            <button type="button" class="btn btn-sm btn-outline-primary preset-day-btn" data-days="15">+15 Days</button>
                            <button type="button" class="btn btn-sm btn-outline-primary preset-day-btn" data-days="30">+30 Days</button>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-semibold small" for="customExtenderDays">Days to add:</label>
                            <div class="input-group">
                                <input type="number" id="customExtenderDays" class="form-control" min="1" max="365" step="1" value="7" required>
                                <span class="input-group-text">days</span>
                            </div>
                        </div>
                        <div class="p-2 bg-light rounded text-center small mb-1 border">
                            <span class="text-muted">New Subscription Expiry: </span>
                            <strong id="newExpiryPreview" class="text-success fs-6"></strong>
                        </div>
                    </div>
                    <div class="modal-footer border-top pt-2">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirmExtendDaysBtn"><i class="fas fa-check-circle me-1"></i>Apply Day Extender</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
        const daysInput = modal.querySelector('#customExtenderDays');
        const preview = modal.querySelector('#newExpiryPreview');
        const presetButtons = modal.querySelectorAll('.preset-day-btn');
        const confirmBtn = modal.querySelector('#confirmExtendDaysBtn');

        const updatePreview = () => {
            const count = Math.max(1, Math.min(365, parseInt(daysInput.value, 10) || 1));
            const newDate = new Date(baseStart.getTime() + count * 86400000);
            preview.textContent = newDate.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        };
        updatePreview();

        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                presetButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                daysInput.value = btn.dataset.days;
                updatePreview();
            });
        });

        daysInput.addEventListener('input', () => {
            presetButtons.forEach(b => b.classList.toggle('active', b.dataset.days === daysInput.value));
            updatePreview();
        });

        confirmBtn.addEventListener('click', async () => {
            const daysToAdd = parseInt(daysInput.value, 10);
            if (!Number.isInteger(daysToAdd) || daysToAdd < 1) {
                notify('Please enter a valid number of days (1 to 365).', 'warning');
                return;
            }
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Extending...';
            try {
                await applyDirectDayExtension(school, daysToAdd);
                bsModal.hide();
            } catch (err) {
                notify(`Could not extend subscription: ${err.message}`, 'danger');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check-circle me-1"></i>Apply Day Extender';
            }
        });

        modal.addEventListener('hidden.bs.modal', () => modal.remove(), { once: true });
        bsModal.show();
    }

    async function applyDirectDayExtension(school, daysToAdd) {
        const current = school.subscription || {};
        const endDateParsed = Date.parse(current.endDate || '');
        const isExpired = !endDateParsed || isNaN(endDateParsed) || endDateParsed < Date.now();
        const startDate = new Date();
        const baseStart = isExpired ? startDate : new Date(endDateParsed);
        const extendedEndDate = new Date(baseStart.getTime() + daysToAdd * 86400000);

        const entry = {
            planId: 'day-extender',
            name: `Day Extender (+${daysToAdd} days)`,
            topupKind: 'days',
            daysAdded: daysToAdd,
            monthsAdded: 0,
            studentCapacity: 0,
            teacherCapacity: 0,
            price: 0,
            listPrice: 0,
            currency: current.currency || 'INR',
            bonus: false,
            startDate: baseStart.toISOString(),
            endDate: extendedEndDate.toISOString(),
            assignedAt: startDate.toISOString()
        };

        const topups = [...(Array.isArray(current.topups) ? current.topups : []), entry];
        const subscription = {
            ...current,
            status: 'active',
            endDate: extendedEndDate.toISOString(),
            termExtensionDays: Number(current.termExtensionDays || 0) + daysToAdd,
            topups,
            updatedAt: Date.now()
        };

        const timestamp = Date.now();
        await database.ref().update({
            [`schools/${school.id}/status`]: 'Active',
            [`schools/${school.id}/subscription`]: subscription,
            [`schools/${school.id}/lastUpdated`]: startDate.toISOString(),
            [`owners/${currentUser.uid}/schools/${school.id}/status`]: 'Active',
            [`owners/${currentUser.uid}/schools/${school.id}/subscription`]: subscription,
            [`owners/${currentUser.uid}/schools/${school.id}/lastUpdated`]: startDate.toISOString(),
            [`publicSchools/${school.id}/status`]: 'Active',
            [`publicSchools/${school.id}/subscriptionEndDate`]: subscription.endDate,
            [`publicSchools/${school.id}/updatedAt`]: timestamp,
            [`subscriptionExpiryOverlayCounts/${school.id}`]: null
        });

        notify(`${school.name || 'School'} subscription extended by ${daysToAdd} days (until ${extendedEndDate.toLocaleDateString()}).`, 'success');
        await refreshSchoolData();
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
            row.innerHTML = `<td class="owner-school-name fw-semibold">${escapeHtml(school.name || 'Unnamed school')}<div class="small text-muted">${escapeCodeForTable(school)}</div></td><td>${escapeHtml(school.type || '—')}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(contact)}</td><td><span class="badge text-bg-${String(school.status).toLowerCase() === 'inactive' ? 'secondary' : 'success'}">${escapeHtml(school.status || 'Active')}</span></td><td>${Number(school.details?.currentStudents || 0)}</td><td class="text-nowrap"></td>`;
            const actions = document.createElement('div'); actions.className = 'owner-school-actions';
            const details = document.createElement('button'); details.className = 'btn btn-sm btn-outline-info owner-school-action'; details.type = 'button'; details.title = 'View school and subscription details'; details.setAttribute('aria-label', `View details for ${school.name || 'school'}`); details.innerHTML = '<i class="fas fa-info" aria-hidden="true"></i>'; details.onclick = () => showSchoolDetails(school);
            const subscriptionExpired = school.subscription?.endDate && Date.parse(school.subscription.endDate) < Date.now();
            const schoolActive = String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && !subscriptionExpired;
            const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-outline-secondary owner-school-action'; toggle.textContent = schoolActive ? 'Deactivate' : 'Activate'; toggle.setAttribute('aria-label', `${schoolActive ? 'Deactivate' : 'Activate'} ${school.name || 'school'}`); toggle.onclick = () => toggleSchoolStatus(school);
            const plan = document.createElement('button'); plan.className = 'btn btn-sm btn-outline-primary owner-school-action'; plan.textContent = 'Plan'; plan.title = 'Manage school subscription'; plan.onclick = () => { switchSection('owner-pricing'); renderSubscriptionRows(); };
            const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary owner-school-action'; edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i> Edit'; edit.onclick = () => openSchoolEdit(school);
            const deleteSchoolButton = document.createElement('button');
            deleteSchoolButton.className = 'btn btn-sm btn-outline-danger owner-school-action';
            deleteSchoolButton.type = 'button';
            deleteSchoolButton.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> Delete';
            deleteSchoolButton.title = 'Email the school report to its administrator, then permanently delete the school and linked accounts';
            deleteSchoolButton.setAttribute('aria-label', `Email report and delete ${school.name || 'school'}`);
            deleteSchoolButton.onclick = () => deleteSchoolAfterReport(school, deleteSchoolButton);
            actions.append(details, edit, toggle, plan, deleteSchoolButton); row.cells[6].append(actions); body.append(row);
        });
    }

    async function deleteSchoolAfterReport(school, button) {
        const schoolCode = String(school.code || '').trim();
        if (!schoolCode) return notify('This school has no confirmation code, so it cannot be safely deleted.', 'danger');
        const enteredCode = window.prompt(
            `This permanently deletes ${school.name || 'this school'}, all linked student, teacher, and administrator accounts, and all school-scoped records. A simplified Excel-compatible summary report (CSV) will be generated and a backup copy will be downloaded. Passwords and secrets are not included.\n\nType the school code ${schoolCode} to continue:`
        );
        if (enteredCode === null) return;
        if (enteredCode.trim() !== schoolCode) return notify('The school code did not match. Nothing was deleted.', 'warning');
        if (!window.confirm(`Permanently delete ${school.name || schoolCode} and all associated accounts? A simplified data export will be sent to the administrator (if email delivery is accepted) and downloaded to this device.`)) return;

        const owner = ownerAuth?.auth?.().currentUser;
        if (!owner) return notify('Sign in to the owner portal before deleting a school.', 'danger');
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = 'Preparing report...';
        try {
            const idToken = await owner.getIdToken();
            const workerBase = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || 'https://rollcall-worker.divyanshugupta415.workers.dev/').replace(/\/?$/, '/');
            const response = await fetch(new URL('owner/delete-school', workerBase), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ schoolId: school.id, confirmationCode: enteredCode.trim() })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.ok !== true) {
                throw new Error(result.error || `School deletion service returned HTTP ${response.status}.`);
            }
            if (result.exportData) {
                downloadSchoolExportFile(result.exportFileName || `${String(school.name || 'school').replace(/[^A-Za-z0-9_-]+/g, '_')}-summary-report.csv`, result.exportData);
            }
            const isWarning = result.emailAccepted === false || Boolean(result.profilePhotoCleanupFailures);
            notify(
                `${result.message} Recipient: ${result.recipient}. Deleted ${Number(result.deletedAuthenticationAccounts || 0)} authentication accounts.`,
                isWarning ? 'warning' : 'success'
            );
            await refreshSchoolData();
        } catch (error) {
            console.error('School export and deletion failed:', error);
            notify(error.message || 'School export and deletion failed. Check the school record before retrying.', 'danger');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function downloadSchoolExportFile(filename, content) {
        try {
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                a.remove();
                URL.revokeObjectURL(url);
            }, 1000);
        } catch (err) {
            console.warn('Could not trigger automatic export download:', err);
        }
    }

    function showSchoolDetails(school) {
        const subscription = school.subscription || {};
        const topups = Array.isArray(subscription.topups) ? subscription.topups : [];
        const usage = schoolUserUsage[school.id] || { students: 0, teachers: 0 };
        const mainPlanId = subscription.planId || subscription.plan || '';
        const currentPlan = pricingPlans.find(item => item.id === mainPlanId || item.name === mainPlanId);
        const baseStudents = schoolPlanCapacity(school, 'studentCapacity');
        const baseTeachers = schoolPlanCapacity(school, 'teacherCapacity');
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
            const isDays = item.topupKind === 'days';
            const isMonths = item.topupKind === 'months';
            const isTerm = isDays || isMonths;
            const title = isDays
                ? `${item.name || 'Extra days'} (+${Number(item.daysAdded || 0)} days)`
                : isMonths
                ? `${item.name || 'Extra months'} (+${Number(item.monthsAdded || 0)} months)`
                : item.name || 'Top-up';
            const students = isTerm ? '—' : Number(item.studentCapacity || 0).toLocaleString();
            const teachers = isTerm ? '—' : Number(item.teacherCapacity || 0).toLocaleString();
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
            await database.ref().update({
                [`schools/${school.id}/status`]: next,
                [`schools/${school.id}/subscription/status`]: subscriptionStatus,
                [`schools/${school.id}/updatedAt`]: Date.now(),
                [`owners/${currentUser.uid}/schools/${school.id}/status`]: next,
                [`owners/${currentUser.uid}/schools/${school.id}/subscription/status`]: subscriptionStatus,
                [`owners/${currentUser.uid}/schools/${school.id}/updatedAt`]: Date.now()
            });
            await database.ref(`publicSchools/${school.id}`).update({ status: next, updatedAt: Date.now() });
            notify(`${school.name || 'School'} is now ${next.toLowerCase()}.`, 'success');
        } catch (error) { notify(`Could not change school status: ${error.message}`, 'danger'); }
    }

    function updateDashboardStats() {
        const all = schools || [];
        const active = all.filter(school => String(school.status || 'Active').toLowerCase() === 'active' && String(school.subscription?.status || 'active').toLowerCase() !== 'inactive' && (!school.subscription?.endDate || Date.parse(school.subscription.endDate) >= Date.now()));
        const pending = all.filter(school => String(school.status || '').toLowerCase() === 'pending');
        const studentCapacity = all.reduce((total, school) => total + schoolPlanCapacity(school, 'studentCapacity') + (school.subscription?.topups || []).reduce((sum, item) => sum + Number(item.studentCapacity || 0), 0), 0);
        const teacherCapacity = all.reduce((total, school) => total + schoolPlanCapacity(school, 'teacherCapacity') + (school.subscription?.topups || []).reduce((sum, item) => sum + Number(item.teacherCapacity || 0), 0), 0);
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
        else document.getElementById('owner-bulk-profile-photos')?._onBulkPhotosClose?.();
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

    function normalizeOwnerDateOfBirth(value) {
        const input = String(value || '').trim();
        let year, month, day;
        let match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) [, year, month, day] = match;
        else {
            match = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
            if (!match) return '';
            [, day, month, year] = match;
        }
        year = Number(year); month = Number(month); day = Number(day);
        if (year < 1 || month < 1 || month > 12) return '';
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
        if (day < 1 || day > daysInMonth) return '';
        const normalized = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return normalized <= new Date().toISOString().slice(0, 10) ? normalized : '';
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
          <div class="col-md-6" id="ownerBulkSectionField"><label class="form-label" for="ownerBulkSection">Student section</label><select id="ownerBulkSection" class="form-select" disabled><option value="">Select a class first</option></select></div>
          <div class="col-md-6 d-flex align-items-end"><button id="ownerBulkTemplate" type="button" class="btn btn-outline-primary"><i class="fas fa-download"></i> Download CSV template</button></div>
          <div class="col-12"><label class="form-label" for="ownerBulkCsv">CSV file</label><input id="ownerBulkCsv" type="file" class="form-control" accept=".csv,text/csv"><div id="ownerBulkCsvHelp" class="form-text">Required CSV columns are listed below. Student email is required; password defaults to that student's mobile number.</div><div id="ownerBulkRequiredColumns" class="mt-2 p-3 border rounded bg-light" aria-live="polite"></div></div>
          <div class="col-12"><div id="ownerBulkPreview"><p class="text-muted mb-0">Choose a school, account type, class, section, and CSV file to preview accounts.</p></div></div>
          <div class="col-12"><div id="ownerBulkProgressWrap" hidden><div class="d-flex justify-content-between small mb-1"><span id="ownerBulkProgressLabel">Registration progress</span><span id="ownerBulkProgressCount">0 / 0</span></div><div class="progress" role="progressbar" aria-label="Registration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="ownerBulkProgressBar" class="progress-bar" style="width:0%"></div></div></div></div>
          <div class="col-12 d-flex align-items-center justify-content-between flex-wrap gap-2"><span id="ownerBulkStatus" class="small text-muted" role="status">No CSV loaded.</span><button id="ownerBulkImport" type="button" class="btn btn-primary" disabled><i class="fas fa-user-plus"></i> Create accounts one by one</button></div></div></div>`;
        main.appendChild(section);
        const schoolSelect = section.querySelector('#ownerBulkSchool'); const typeSelect = section.querySelector('#ownerBulkType');
        const classSelect = section.querySelector('#ownerBulkClass'); const sectionSelect = section.querySelector('#ownerBulkSection'); const csvInput = section.querySelector('#ownerBulkCsv'); const importButton = section.querySelector('#ownerBulkImport');
        let rows = []; let classes = []; let rowsContext = ''; const mailRetryQueue = new Map();
        function restoreNumericLeadingZeros(value, width) {
            const digits = String(value || '').trim();
            return /^\d+$/.test(digits) && digits.length <= width ? digits.padStart(width, '0') : digits;
        }
        function renderSchools() {
            const selected = schoolSelect.value; schoolSelect.replaceChildren(new Option('Select school', ''));
            (schools || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => schoolSelect.add(new Option(`${school.name || 'Unnamed school'} · ${school.code || 'No code'}`, school.id)));
            if ((schools || []).some(school => String(school.id) === selected)) schoolSelect.value = selected;
            const school = (schools || []).find(record => String(record.id) === schoolSelect.value);
            section.querySelector('#ownerBulkSchoolCode').textContent = `School code: ${school?.code || '—'}`;
        }
        function isCollegeSchool(school = (schools || []).find(record => String(record.id) === schoolSelect.value)) {
            const schoolType = String(school?.type || school?.institutionType || '').trim().toLowerCase();
            return schoolType.includes('college') || schoolType.includes('university');
        }
        function registrationContext() { return `${schoolSelect.value}|${typeSelect.value}|${classSelect.value}|${sectionSelect.value}|${isCollegeSchool() ? 'college' : 'school'}`; }
        function clearRowsForContextChange() {
            if (!rows.length || rowsContext === registrationContext()) return;
            rows = []; rowsContext = ''; section.querySelector('#ownerBulkStatus').textContent = 'CSV table cleared because the school, account type, class, or section changed.'; previewRows();
        }
        function loadClassSections() {
            const selectedClass = classes.find(record => String(record.id) === String(classSelect.value));
            const sectionNames = [];
            const addSection = value => {
                if (typeof value === 'string' && value.trim()) sectionNames.push(value.trim());
            };
            Object.values(selectedClass?.sectionsByYear || {}).forEach(values => {
                if (Array.isArray(values)) values.forEach(addSection);
                else if (values && typeof values === 'object') Object.values(values).forEach(addSection);
            });
            if (Array.isArray(selectedClass?.sections)) selectedClass.sections.forEach(addSection);
            if (Array.isArray(selectedClass?.sectionNames)) selectedClass.sectionNames.forEach(addSection);
            const uniqueSections = [...new Map(sectionNames.map(value => [value.toLowerCase(), value])).values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            sectionSelect.replaceChildren(new Option(uniqueSections.length ? 'Select section' : 'No sections configured for this class', ''));
            uniqueSections.forEach(name => sectionSelect.add(new Option(name, name)));
            sectionSelect.disabled = uniqueSections.length === 0;
        }
        function updateCsvHelp() {
            const student = typeSelect.value === 'student';
            const schoolSelected = (schools || []).find(record => String(record.id) === schoolSelect.value);
            const selectedClass = classes.find(record => String(record.id) === classSelect.value);
            const selectedSection = sectionSelect.value;
            const college = isCollegeSchool(schoolSelected);
            const schoolClassNumber = selectedClass?.name.match(/\d+/)?.[0] || (/^\d+$/.test(String(selectedClass?.id || '')) ? String(selectedClass.id) : '10');
            const classColumnFormat = college ? 'Selected course/class name or class ID; rows for other classes are skipped.' : 'Enter digits only. The importer adds the Class label and matches the selected class.';
            const classColumnExample = college ? (selectedClass?.name || selectedClass?.id || 'Grade 1') : schoolClassNumber;
            const columns = section.querySelector('#ownerBulkRequiredColumns');
            const teacherColumns = [
                ['name', 'Required', 'Full name; max 120 characters.', 'Aarav Sharma'],
                ['email', 'Required', 'Valid email address; must not already be registered.', 'aarav@example.com'],
                ['password', 'Required', 'At least 8 characters.', 'ChangeMe123!'],
                ['dateOfBirth', 'Required', 'DD-MM-YYYY or YYYY-MM-DD; real date, not in the future.', '15-05-2000'],
                ['phone', 'Required', '10 digits; Excel-stripped leading zeros are restored.', '0987654321'],
                ['designation', 'Required', 'Job title or role.', 'Mathematics Teacher'],
                ['subjectsTaught', 'Required', 'Subject names separated with |.', 'Math|Science']
            ];
            const studentColumns = [
                ['name', 'Required', 'Full name; max 120 characters.', 'Aarav Sharma'],
                ['email', 'Required', 'Valid email address; must not already be registered.', 'aarav@example.com'],
                ['dateOfBirth', 'Required', 'DD-MM-YYYY or YYYY-MM-DD; real date, not in the future.', '15-05-2010'],
                ['mobile', 'Required', '10 digits; Excel-stripped leading zeros are restored and this becomes the password.', '0987654321'],
                ['class', 'Required', classColumnFormat, classColumnExample],
                ['classRoll', 'Required', '2 digits; Excel-stripped leading zeros are restored.', '01'],
                ['section', 'Required', `Must match the selected section (${selectedSection || 'choose a section above'}).`, selectedSection || 'A'],
                ...(college ? [
                    ['univRoll', 'Required', '10 digits; Excel-stripped leading zeros are restored.', '0123456789'],
                    ['academicYear', 'Required', 'Whole number from 1 to 10.', '1']
                ] : []),
                ['fatherName', 'Optional', 'Father or guardian name.', 'Ramesh Sharma']
            ];
            const fields = student ? studentColumns : teacherColumns;
            const csvEscape = value => `"${String(value).replace(/"/g, '""')}"`;
            const exampleCsv = [fields.map(([name]) => name), fields.map(([, , , example]) => example)]
                .map(row => row.map(csvEscape).join(','))
                .join('\n');
            columns.innerHTML = `<strong>CSV columns and required formats</strong><div class="table-responsive mt-2"><table class="table table-sm table-bordered align-middle mb-2"><thead><tr><th>Column</th><th>Required</th><th>Format</th><th>Example</th></tr></thead><tbody>${fields.map(([name, required, format, example]) => `<tr><td><code>${escapeHtml(name)}</code></td><td>${required}</td><td>${escapeHtml(format)}</td><td>${escapeHtml(example)}</td></tr>`).join('')}</tbody></table></div><div class="small"><strong>Example CSV</strong><pre class="bg-white border rounded p-2 mt-1 mb-0" style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(exampleCsv)}</pre></div><div class="small text-muted mt-2">Use one account per row. Column names are case-insensitive. Quote any cell containing a comma. ${student ? `Student password is automatically set to the mobile number. ${college ? '' : schoolSelected ? '' : 'College or university students also need univRoll and academicYear.'} ${schoolSelected && classSelect.value && selectedSection ? 'Only rows matching the selected class and section are added. School class numbers are converted to Class N.' : 'Select a school, class, and section before uploading student rows.'} Each account is created separately and credentials are emailed.` : 'Each account is created separately and credentials are emailed.'}</div>`;
            section.querySelector('#ownerBulkCsvHelp').textContent = student
                ? 'Include every required column shown below. Excel-stripped leading zeros are restored for fixed-width numeric fields; the padded mobile number becomes the student password.'
                : 'Include every required column shown below. Separate multiple subjects with |. Excel-stripped leading zeros are restored to the 10-digit phone number.';
        }
        async function sendRegistrationCredentialsEmail({ uid, name, email, password, profile, school, accountType }) {
            const ownerUser = ownerAuth?.auth().currentUser;
            const workerUrl = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || '').trim();
            if (!ownerUser || !workerUrl) throw new Error('Owner sign-in or secure mail service is unavailable.');
            const endpoint = new URL(workerUrl);
            if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Secure mail service URL is invalid.');
            endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/custom-mail`;
            const classLine = accountType === 'student' ? `Class: ${profile.className}\nSection: ${profile.section}\nRoll number: ${profile.classRoll}${profile.univRoll ? `\nUniversity roll: ${profile.univRoll}` : ''}` : `Designation: ${profile.designation}\nSubjects: ${profile.subjectsTaught.join(', ')}`;
            const message = `Hello ${name},\n\nYour ${accountType} account for ${school.name || 'your school'} has been created.\n\nSign-in details\nEmail: ${email}\nPassword: ${password}\nSchool: ${school.name || 'your school'}${school.code ? ` (${school.code})` : ''}\n${classLine}\n\nPlease sign in and change your password after your first login.`;
            const result = await fetch(endpoint.href, { method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await ownerUser.getIdToken()}` }, body: JSON.stringify({ subject: 'Your RollCall account credentials', message, recipientUids: [uid] }) });
            const data = await result.json().catch(() => ({}));
            if (!result.ok) throw new Error(data.error || 'Credentials email could not be delivered.');
        }
        function previewRows() {
            importButton.disabled = !rows.length || !schoolSelect.value || (typeSelect.value === 'student' && (!classSelect.value || !sectionSelect.value));
            const preview = section.querySelector('#ownerBulkPreview'); preview.replaceChildren();
            if (!rows.length) { preview.textContent = 'Choose a CSV file to preview accounts.'; preview.className = 'text-muted'; return; }
            preview.className = 'table-responsive';
            const college = isCollegeSchool();
            const fields = typeSelect.value === 'student'
                ? ['class', 'name', 'email', 'password', 'dateOfBirth', 'mobile', 'classRoll', 'section', ...(college ? ['univRoll', 'academicYear'] : []), 'fatherName']
                : ['name', 'email', 'password', 'dateOfBirth', 'phone', 'designation', 'subjectsTaught'];
            const table = document.createElement('table'); table.className = 'table table-sm table-striped align-middle';
            const head = document.createElement('thead'); const headerRow = document.createElement('tr');
            ['CSV row', ...fields].forEach(value => { const cell = document.createElement('th'); cell.textContent = value; headerRow.append(cell); }); head.append(headerRow); table.append(head);
            const body = document.createElement('tbody'); rows.forEach((item, index) => { const line = document.createElement('tr'); const n = document.createElement('td'); n.textContent = `${item.fileName || 'CSV'} · ${item.rowNumber || index + 1}`; line.append(n); fields.forEach(key => { const cell = document.createElement('td'); const value = key.toLowerCase() === 'password' && typeSelect.value === 'student' ? String(item.data.mobile || '').trim() : item.data[key.toLowerCase()]; cell.textContent = value || '—'; line.append(cell); }); body.append(line); }); table.append(body); preview.append(table);
            const count = document.createElement('p'); count.className = 'small text-muted mb-0'; count.textContent = `${rows.length} matching row${rows.length === 1 ? '' : 's'} in the table. Student passwords are each student's mobile number.`; preview.append(count);
        }
        async function loadClasses() {
            const schoolId = schoolSelect.value; classes = []; classSelect.disabled = true; classSelect.replaceChildren(new Option(schoolId ? 'Loading classes…' : 'Select a school first', ''));
            if (!schoolId) return;
            const [courseSnapshot, classSnapshot] = await Promise.all([database.ref(`schoolCourses/${schoolId}`).once('value'), database.ref(`schoolClasses/${schoolId}`).once('value')]);
            const map = new Map(); [courseSnapshot.val(), classSnapshot.val()].forEach(records => Object.entries(records || {}).forEach(([id, record]) => { if (record && typeof record === 'object') { const previous = map.get(id) || {}; map.set(id, { ...previous, ...record, id, name: record.courseName || record.className || record.name || record.title || previous.name || 'Class' }); } }));
            classes = [...map.values()].sort((a, b) => a.name.localeCompare(b.name)); classSelect.replaceChildren(new Option(classes.length ? 'Select class' : 'No classes found', ''));
            classes.forEach(record => classSelect.add(new Option(record.name, record.id))); classSelect.disabled = !classes.length;
        }
        function downloadTemplate() {
            const teacher = typeSelect.value === 'teacher';
            const selectedSchool = (schools || []).find(record => String(record.id) === schoolSelect.value);
            if (!teacher && (!selectedSchool || !classSelect.value || !sectionSelect.value)) return notify('Select the school, class, and section before downloading a student template.', 'warning');
            const selectedClass = classes.find(record => record.id === classSelect.value);
            const college = isCollegeSchool(selectedSchool);
            const header = teacher ? ['name', 'email', 'password', 'dateOfBirth', 'phone', 'designation', 'subjectsTaught'] : ['name', 'email', 'dateOfBirth', 'mobile', 'class', 'classRoll', 'section', ...(college ? ['univRoll', 'academicYear'] : []), 'fatherName'];
            const schoolClassNumber = selectedClass?.name.match(/\d+/)?.[0] || (/^\d+$/.test(String(selectedClass?.id || '')) ? String(selectedClass.id) : '10');
            const classExample = college ? (selectedClass?.name || selectedClass?.id || '') : schoolClassNumber;
            const sample = teacher ? ['Aarav Sharma', 'aarav@example.com', 'ChangeMe123!', '15-05-2000', '9876543210', 'Mathematics Teacher', 'Math|Science'] : ['Aarav Sharma', 'aarav@example.com', '15-05-2010', '9876543210', classExample, '01', sectionSelect.value || 'A', ...(college ? ['1234567890', '1'] : []), 'Ramesh Sharma'];
            const csv = [header, sample].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n';
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${teacher ? 'teacher' : `${college ? 'college' : 'school'}-student`}-registration-template.csv`; anchor.click(); URL.revokeObjectURL(url);
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
        schoolSelect.addEventListener('change', async () => { clearRowsForContextChange(); renderSchools(); updateCsvHelp(); try { await loadClasses(); loadClassSections(); } catch (error) { notify(`Could not load classes: ${error.message}`, 'danger'); } updateCsvHelp(); previewRows(); });
        classSelect.addEventListener('change', () => { clearRowsForContextChange(); loadClassSections(); updateCsvHelp(); previewRows(); });
        typeSelect.addEventListener('change', () => { section.querySelector('#ownerBulkClassField').hidden = typeSelect.value !== 'student'; section.querySelector('#ownerBulkSectionField').hidden = typeSelect.value !== 'student'; clearRowsForContextChange(); updateCsvHelp(); previewRows(); });
        section.querySelector('#ownerBulkSectionField').hidden = typeSelect.value !== 'student';
        updateCsvHelp();
        section.querySelector('#ownerBulkTemplate').addEventListener('click', downloadTemplate);
        sectionSelect.addEventListener('change', () => { clearRowsForContextChange(); updateCsvHelp(); previewRows(); });
        csvInput.addEventListener('change', async () => {
            importButton.disabled = true; const file = csvInput.files?.[0]; if (!file) return previewRows();
            try {
                if (file.size > 2 * 1024 * 1024) throw new Error('CSV files must be smaller than 2 MB.');
                const context = registrationContext();
                if (typeSelect.value === 'student' && (!schoolSelect.value || !classSelect.value || !sectionSelect.value)) throw new Error('Select the school, class, and section before adding student CSV rows.');
                if (rows.length && rowsContext !== context) { rows = []; rowsContext = ''; }
                const parsed = parseOwnerCsv(await file.text()); const emailSet = new Set(rows.map(row => String(row.data.email || '').trim().toLowerCase()).filter(Boolean));
                let missingEmail = 0; let differentClass = 0; let differentSection = 0; let duplicateEmail = 0; let appended = 0;
                const selectedClass = classes.find(record => record.id === classSelect.value);
                for (const row of parsed) {
                    const email = String(row.data.email || '').trim().toLowerCase();
                    if (!email) { missingEmail += 1; continue; }
                    if (typeSelect.value === 'student') {
                        const classValues = [row.data.class, row.data.classname, row.data.classid, row.data.course, row.data.coursename, row.data.courseid].map(value => String(value || '').trim()).filter(Boolean);
                        if (!selectedClass) { differentClass += 1; continue; }
                        if (isCollegeSchool()) {
                            const collegeValues = classValues.map(value => value.toLowerCase());
                            if (!collegeValues.some(value => value === selectedClass.id.toLowerCase() || value === selectedClass.name.trim().toLowerCase())) { differentClass += 1; continue; }
                        } else {
                            const numericClass = String(row.data.class || '').trim();
                            const selectedNumber = selectedClass.name.match(/\d+/)?.[0] || (/^\d+$/.test(String(selectedClass.id)) ? String(selectedClass.id) : '');
                            if (!numericClass || !/^\d+$/.test(numericClass) || !selectedNumber || Number(numericClass) !== Number(selectedNumber)) { differentClass += 1; continue; }
                            row.data.class = `Class ${Number(numericClass)}`;
                        }
                        const csvSection = String(row.data.section || '').trim();
                        if (!csvSection || csvSection.toLowerCase() !== sectionSelect.value.trim().toLowerCase()) { differentSection += 1; continue; }
                        row.data.section = sectionSelect.value;
                    }
                    if (emailSet.has(email)) { duplicateEmail += 1; continue; }
                    emailSet.add(email);
                    row.data.email = email;
                    if (typeSelect.value === 'student') {
                        row.data.mobile = restoreNumericLeadingZeros(row.data.mobile, 10);
                        row.data.classRoll = restoreNumericLeadingZeros(row.data.classRoll, 2);
                        if (isCollegeSchool()) row.data.univroll = restoreNumericLeadingZeros(row.data.univroll, 10);
                        row.data.password = row.data.mobile;
                    } else {
                        row.data.phone = restoreNumericLeadingZeros(row.data.phone || row.data.mobile, 10);
                    }
                    row.fileName = file.name; rows.push(row); appended += 1;
                }
                if (appended) rowsContext = context;
                section.querySelector('#ownerBulkStatus').textContent = `Added ${appended}; skipped ${missingEmail} without email, ${differentClass} with an invalid or different class, ${differentSection} for another section, ${duplicateEmail} duplicate email${duplicateEmail === 1 ? '' : 's'}. ${rows.length} rows now in the table.`;
                previewRows();
            } catch (error) { section.querySelector('#ownerBulkStatus').textContent = error.message; notify(error.message, 'warning'); }
            finally { csvInput.value = ''; }
        });
        importButton.addEventListener('click', async () => {
            const school = (schools || []).find(record => String(record.id) === schoolSelect.value); const accountType = typeSelect.value; const cls = classes.find(record => record.id === classSelect.value);
            if (!database || !currentUser || !school || (accountType === 'student' && (!cls || !sectionSelect.value))) return notify('Select a connected school and, for students, a class and section.', 'warning');
            importButton.disabled = true; const status = section.querySelector('#ownerBulkStatus'); const failures = []; let created = 0; let emailsSent = 0; let temporaryApp = null;
            const progressWrap = section.querySelector('#ownerBulkProgressWrap'); const progressBar = section.querySelector('#ownerBulkProgressBar'); const progressCount = section.querySelector('#ownerBulkProgressCount'); const progressLabel = section.querySelector('#ownerBulkProgressLabel');
            progressWrap.hidden = false; progressBar.style.width = '0%'; progressBar.parentElement.setAttribute('aria-valuenow', '0'); progressCount.textContent = `0 / ${rows.length}`;
            try {
                status.textContent = 'Checking existing accounts and roll numbers…';
                const snapshot = await database.ref('users').once('value'); const existingUsers = snapshot.val() || {}; const existingUserList = Object.values(existingUsers).filter(user => user && typeof user === 'object');
                const existingEmails = new Set(existingUserList.map(user => String(user.email || '').trim().toLowerCase()).filter(Boolean));
                const existingUnivRolls = new Set(existingUserList.map(user => String(user.univRoll || '').trim()).filter(Boolean));
                const schoolType = String(school.type || school.institutionType || '').trim().toLowerCase(); const schoolRegistration = !schoolType.includes('college') && !schoolType.includes('university');
                const rolls = new Set(existingUserList.filter(user => String(user.schoolId) === String(school.id) && user.classRoll).map(user => {
                    const courseKey = String(user.courseId || user.classId || user.className || user.courseName || '').toLowerCase(); const year = Number(user.academicYear || user.year || 0);
                    return `${courseKey}|${String(user.section || '').toLowerCase()}|${String(user.classRoll)}|${schoolRegistration ? 'school' : (year || '*')}`;
                }));
                const emails = new Set(); const univRolls = new Set(); temporaryApp = firebase.initializeApp(ownerAuth.options, `ownerBulk-${Date.now()}`);
                for (let index = 0; index < rows.length; index += 1) {
                    const { rowNumber, data } = rows[index]; status.textContent = `Creating ${index + 1} of ${rows.length}…`; let account = null; let profileSaved = false; let accountCreated = false;
                    try {
                        if (accountType === 'student') {
                            data.mobile = restoreNumericLeadingZeros(data.mobile, 10);
                            data.classroll = restoreNumericLeadingZeros(data.classroll, 2);
                            if (!schoolRegistration) data.univroll = restoreNumericLeadingZeros(data.univroll, 10);
                        } else {
                            data.phone = restoreNumericLeadingZeros(data.phone || data.mobile, 10);
                        }
                        const name = String(data.name || '').trim(); const email = String(data.email || '').trim().toLowerCase(); const dob = normalizeOwnerDateOfBirth(data.dateofbirth || data.dob);
                        const mobileValue = String(data.mobile || '').trim(); const password = accountType === 'student' ? mobileValue : String(data.password || '');
                        if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8) throw new Error('Provide a name, valid email, and password of 8+ characters.');
                        if (!dob) throw new Error('dateOfBirth must be a real, non-future date in DD-MM-YYYY or YYYY-MM-DD format.');
                        if (existingEmails.has(email) || emails.has(email)) throw new Error('This email is already registered or duplicated in the CSV.'); emails.add(email);
                        const profile = { uid: '', email, name, role: accountType, dateOfBirth: dob, schoolId: school.id, schoolCode: school.code || '', schoolName: school.schoolName || school.name || '', createdAt: new Date().toISOString(), createdBy: currentUser.uid };
                        if (accountType === 'student') {
                            const mobile = mobileValue; const classRoll = String(data.classroll || '').trim(); const sectionName = String(data.section || '').trim();
                            if (!/^\d{10}$/.test(mobile) || !/^\d{2}$/.test(classRoll) || !sectionName) throw new Error('Student rows need a 10-digit mobile, 2-digit classRoll, and section.');
                            const schoolType = String(school.type || school.institutionType || '').trim().toLowerCase();
                            const isSchool = !schoolType.includes('college') && !schoolType.includes('university');
                            const univRoll = String(data.univroll || '').trim(); const academicYearValue = String(data.academicyear || '').trim(); const academicYear = Number(academicYearValue);
                            if (!isSchool && (!/^\d{10}$/.test(univRoll) || !academicYearValue || !Number.isInteger(academicYear) || academicYear < 1 || academicYear > 10)) throw new Error('College/university students need a 10-digit univRoll and academicYear from 1 to 10.');
                            if (cls.active === false) throw new Error('The selected class or course is inactive.');
                            const validSections = cls.sectionsByYear?.[String(isSchool ? 1 : academicYear)];
                            if (Array.isArray(validSections) && !validSections.includes(sectionName)) throw new Error('The student section is not active for the selected class and academic year.');
                            if (!isSchool && (existingUnivRolls.has(univRoll) || univRolls.has(univRoll))) throw new Error('This university roll number is already registered or duplicated in the CSV.');
                            if (!isSchool) univRolls.add(univRoll);
                            const yearKey = isSchool ? 'school' : String(academicYear); const rollKeys = [`${cls.id.toLowerCase()}|${sectionName.toLowerCase()}|${classRoll}|${yearKey}`, `${cls.name.toLowerCase()}|${sectionName.toLowerCase()}|${classRoll}|${yearKey}`]; const wildcardRollKeys = isSchool ? [] : rollKeys.map(key => key.replace(/\|[^|]+$/, '|*'));
                            if (rollKeys.some(key => rolls.has(key)) || wildcardRollKeys.some(key => rolls.has(key))) throw new Error('This class roll already exists for this class, year, and section.');
                            rollKeys.forEach(key => rolls.add(key));
                            Object.assign(profile, { registrationType: isSchool ? 'school' : 'university', classRoll, univRoll, mobile, dateOfBirth: dob, schoolName: school.schoolName || school.name || '', courseId: cls.id, course: cls.name, courseName: cls.name, courseNickname: cls.courseNickname || '', batch: cls.batch || '', section: sectionName, ...(isSchool ? { className: cls.name } : { academicYear, year: academicYear }), ...(String(data.fathername || '').trim() ? { fatherName: String(data.fathername).trim() } : {}) });
                        } else {
                            const phone = String(data.phone || data.mobile || '').trim(); const designation = String(data.designation || '').trim(); const subjectsTaught = String(data.subjectstaught || '').split('|').map(value => value.trim()).filter(Boolean);
                            if (!/^\d{10}$/.test(phone) || !designation || !subjectsTaught.length) throw new Error('Teacher rows need a 10-digit phone, designation, and at least one subject (separate subjects with |).');
                            Object.assign(profile, { phone, designation, subjectsTaught, teacherType: 'teacher', classTeacherEnabled: false, roles: ['teacher'], assignedSections: [] });
                        }
                        account = (await temporaryApp.auth().createUserWithEmailAndPassword(email, password)).user; profile.uid = account.uid; await account.updateProfile({ displayName: name });
                        await database.ref().update({ [`users/${account.uid}`]: profile, [`schoolUsers/${school.id}/${account.uid}`]: profile });
                        profileSaved = true; accountCreated = true; created += 1;
                        progressLabel.textContent = `CSV row ${rowNumber}: sending credentials email`;
                        try {
                            await sendRegistrationCredentialsEmail({ uid: account.uid, name, email, password, profile, school, accountType });
                            emailsSent += 1;
                        } catch (mailError) {
                            mailRetryQueue.set(account.uid, { uid: account.uid, rowNumber, name, email, password, profile, school, accountType });
                            failures.push({ rowNumber, retryUid: account.uid, message: `Account created, but credentials email failed: ${mailError.message || 'delivery failed'}` });
                        }
                    } catch (error) {
                        if (account && !profileSaved) await account.delete().catch(cleanup => console.warn('Could not remove incomplete import account.', cleanup));
                        if (!accountCreated) failures.push({ rowNumber, message: error.message || 'Account creation failed.' });
                    } finally {
                        await temporaryApp.auth().signOut().catch(() => {});
                        const completed = index + 1; const percent = Math.round(completed / rows.length * 100); progressBar.style.width = `${percent}%`; progressBar.parentElement.setAttribute('aria-valuenow', String(percent)); progressCount.textContent = `${completed} / ${rows.length}`;
                    }
                }
            } catch (error) { failures.push({ rowNumber: '—', message: error.message || 'Import stopped.' }); }
            finally { if (temporaryApp) await temporaryApp.delete().catch(error => console.warn('Bulk import Firebase app cleanup failed.', error)); importButton.disabled = false; }
            status.textContent = `Created ${created} accounts one by one; ${emailsSent} credentials emails sent; ${failures.length} account/email issues.`;
            progressLabel.textContent = 'Registration finished';
            if (failures.length) {
                const list = document.createElement('ul'); list.className = 'small text-danger mt-2';
                failures.forEach(failure => {
                    const line = document.createElement('li'); const message = document.createElement('span'); message.textContent = `CSV row ${failure.rowNumber}: ${failure.message}`; line.append(message);
                    if (failure.retryUid) {
                        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-sm btn-outline-primary ms-2'; retry.textContent = 'Retry email'; retry.setAttribute('aria-label', `Retry credentials email for CSV row ${failure.rowNumber}`);
                        retry.addEventListener('click', async () => {
                            const retryData = mailRetryQueue.get(failure.retryUid); if (!retryData || retry.disabled) return;
                            retry.disabled = true; retry.textContent = 'Sending?'; status.textContent = `Retrying credentials email for CSV row ${failure.rowNumber}?`;
                            try {
                                await sendRegistrationCredentialsEmail(retryData);
                                mailRetryQueue.delete(failure.retryUid); emailsSent += 1; retry.remove(); message.textContent = `CSV row ${failure.rowNumber}: credentials email sent successfully.`; line.classList.remove('text-danger'); line.classList.add('text-success');
                                status.textContent = `Created ${created} accounts; ${emailsSent} credentials emails sent; ${mailRetryQueue.size} email retries remaining.`;
                            } catch (error) {
                                retry.disabled = false; retry.textContent = 'Retry email'; message.textContent = `CSV row ${failure.rowNumber}: credentials email retry failed: ${error.message || 'delivery failed'}`;
                                status.textContent = 'Email retry failed. You can try again.';
                            }
                        });
                        line.append(retry);
                    }
                    list.append(line);
                });
                section.querySelector('#ownerBulkPreview').append(list);
            }
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
        section.innerHTML = `<div class="section-card"><div class="mb-3"><h2><i class="fas fa-camera"></i> Student profile photo capture</h2><p class="text-muted mb-0">Choose and lock a school, class, and section. The portal loads that school's student roster once, then filters it locally as you capture.</p></div>
          <div class="alert alert-info">The roster is read from this school's schoolUsers record in one Firebase request and kept in memory while this page is open. Selecting a class and section does not download the roster again.</div>
          <div class="row g-3"><div class="col-md-4"><label class="form-label" for="ownerPhotoSchool">School</label><select id="ownerPhotoSchool" class="form-select"><option value="">Select school</option></select></div>
          <div class="col-md-4"><label class="form-label" for="ownerPhotoClass">Class</label><select id="ownerPhotoClass" class="form-select" disabled><option value="">Select school first</option></select></div>
          <div class="col-md-4"><label class="form-label" for="ownerPhotoSection">Section</label><select id="ownerPhotoSection" class="form-select" disabled><option value="">Select class first</option></select></div>
          <div class="col-12 d-flex align-items-center gap-3 flex-wrap"><button id="ownerPhotoLock" type="button" class="btn btn-primary" disabled><i class="fas fa-lock"></i> Lock selection &amp; open camera</button><span id="ownerPhotoStatus" class="small text-muted" role="status">Select a school, class, and section.</span></div>
          <div class="col-12"><div id="ownerPhotoRoster" class="small text-muted">Student details will appear here after selecting a section.</div></div></div></div>
          <div id="ownerPhotoCameraModal" hidden role="dialog" aria-modal="true" aria-labelledby="ownerPhotoModalTitle" style="position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.72);padding:16px;overflow:auto;">
            <div style="max-width:760px;margin:4vh auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.3);">
              <div class="d-flex justify-content-between align-items-center gap-2 mb-3"><div><h2 id="ownerPhotoModalTitle" class="h5 mb-1">Capture student profile photo</h2><div id="ownerPhotoProgress" class="small text-muted"></div></div><button id="ownerPhotoClose" type="button" class="btn btn-sm btn-outline-secondary"><i class="fas fa-unlock"></i> Unlock &amp; change details</button></div>
              <div class="row g-3"><div class="col-md-7"><div id="ownerPhotoStudentDetails" class="row g-2 border rounded p-3 mb-3"></div>
                <style>
                  .owner-photo-camera-container .camera-face-guide { position: absolute; inset: 0; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 4; }
                  .owner-photo-camera-container .face-oval { width: min(68%, 230px); aspect-ratio: 3 / 4; border-radius: 50% 50% 48% 48% / 55% 55% 45% 45%; border: 2.5px dashed rgba(255, 255, 255, 0.9); box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.38), 0 0 25px rgba(56, 189, 248, 0.35); }
                  .owner-photo-camera-container .face-guide-hint { margin-top: 12px; font-size: 12px; font-weight: 600; color: #f8fafc; background: rgba(15, 23, 42, 0.75); padding: 3px 12px; border-radius: 9999px; letter-spacing: 0.02em; backdrop-filter: blur(4px); border: 1px solid rgba(255, 255, 255, 0.15); }
                </style>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div class="form-check form-switch mb-0">
                    <input id="ownerPhotoAutoUpload" class="form-check-input" type="checkbox">
                    <label class="form-check-label small" for="ownerPhotoAutoUpload">Auto upload after capture</label>
                  </div>
                </div>
                <div class="owner-photo-camera-container position-relative overflow-hidden rounded-3 mb-2" style="background:#0f172a; aspect-ratio:3/4; max-height:48vh; display:flex; align-items:center; justify-content:center;">
                  <video id="ownerPhotoVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover; display:block;"></video>
                  <img id="ownerPhotoSnapshot" alt="Snapshot preview" hidden style="width:100%; height:100%; object-fit:cover; display:block;">
                  <div id="ownerPhotoFaceGuide" class="camera-face-guide" aria-hidden="true">
                    <div class="face-oval"></div>
                    <div class="face-guide-hint">Center face in circle</div>
                  </div>
                </div>
                <div id="ownerPhotoCameraStatus" class="small text-muted mt-2" role="status">Allow camera access to begin capturing.</div>
                <div id="ownerPhotoRemotePanel" class="border rounded p-3 mt-3" hidden>
                  <div class="d-flex justify-content-between align-items-center gap-2">
                    <strong><i class="fas fa-mobile-alt me-1"></i> Connected phone / second device</strong>
                    <button id="ownerPhotoRemoteDisconnect" type="button" class="btn btn-sm btn-outline-danger">Disconnect</button>
                  </div>
                  <div class="row g-3 align-items-center mt-1">
                    <div class="col-sm-auto"><div id="ownerPhotoRemoteQr" aria-label="Remote camera pairing QR code"></div></div>
                    <div class="col">
                      <p id="ownerPhotoRemoteStatus" class="small mb-2" role="status">Preparing a secure camera session…</p>
                      <div id="ownerPhotoRemoteApproval" hidden>
                        <p class="small mb-2">Approve only if this code matches the code on that phone: <strong id="ownerPhotoRemoteCode" class="fs-5 text-primary"></strong></p>
                        <button id="ownerPhotoRemoteApprove" type="button" class="btn btn-sm btn-success"><i class="fas fa-check"></i> Approve &amp; Split List</button>
                        <button id="ownerPhotoRemoteReject" type="button" class="btn btn-sm btn-outline-danger ms-2">Reject</button>
                      </div>
                      <div id="ownerPhotoRemoteProgress" class="mt-2" hidden>
                        <div id="ownerPhotoRemoteBadge" class="badge bg-info text-dark text-wrap mb-1">Remote device active</div>
                        <div id="ownerPhotoRemoteCount" class="small text-muted mb-2"></div>
                        <div id="ownerPhotoTransferControls" class="d-flex flex-wrap gap-2" hidden>
                          <button id="ownerPhotoSendStudents" type="button" class="btn btn-sm btn-outline-primary"><i class="fas fa-arrow-right"></i> Send remaining students to phone</button>
                          <button id="ownerPhotoTakeStudents" type="button" class="btn btn-sm btn-outline-warning"><i class="fas fa-arrow-left"></i> Take list from phone</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="d-flex justify-content-between align-items-center gap-2 mt-3 flex-wrap">
                  <button id="ownerPhotoSkip" type="button" class="btn btn-outline-secondary">Skip student</button>
                  <div class="d-flex gap-2 flex-wrap justify-content-end">
                    <button id="ownerPhotoRemoteConnect" type="button" class="btn btn-outline-primary"><i class="fas fa-mobile-alt"></i> Divide list with 2nd device</button>
                    <button id="ownerPhotoCapture" type="button" class="btn btn-primary" disabled><i class="fas fa-camera"></i> Capture</button>
                    <button id="ownerPhotoDoUpload" type="button" class="btn btn-success" hidden><i class="fas fa-cloud-upload-alt"></i> Upload photo</button>
                    <button id="ownerPhotoStopUpload" type="button" class="btn btn-danger" hidden><i class="fas fa-stop-circle"></i> Stop upload</button>
                    <button id="ownerPhotoRetake" type="button" class="btn btn-outline-secondary" hidden><i class="fas fa-redo"></i> Retake</button>
                    <button id="ownerPhotoFinish" type="button" class="btn btn-success" hidden>Finish</button>
                  </div>
                </div>
              </div><aside class="col-md-5"><h3 class="h6">Student sequence</h3><p class="small text-muted">Students with saved photos are marked complete. Skipped students will be captured at the end.</p><ol id="ownerPhotoPendingList" class="small ps-4 mb-0" style="max-height:60vh;overflow:auto;"></ol></aside></div>
            </div>
          </div>`;
        main.appendChild(section);
        const schoolSelect = section.querySelector('#ownerPhotoSchool'); const classSelect = section.querySelector('#ownerPhotoClass'); const sectionSelect = section.querySelector('#ownerPhotoSection');
        const lockButton = section.querySelector('#ownerPhotoLock'); const rosterElement = section.querySelector('#ownerPhotoRoster'); const modal = section.querySelector('#ownerPhotoCameraModal');
        const video = section.querySelector('#ownerPhotoVideo'); const snapshot = section.querySelector('#ownerPhotoSnapshot'); const faceGuide = section.querySelector('#ownerPhotoFaceGuide'); const details = section.querySelector('#ownerPhotoStudentDetails');
        const captureButton = section.querySelector('#ownerPhotoCapture'); const doUploadButton = section.querySelector('#ownerPhotoDoUpload'); const stopUploadButton = section.querySelector('#ownerPhotoStopUpload');
        const retakeButton = section.querySelector('#ownerPhotoRetake'); const skipButton = section.querySelector('#ownerPhotoSkip'); const finishButton = section.querySelector('#ownerPhotoFinish');
        const cameraStatus = section.querySelector('#ownerPhotoCameraStatus'); const autoUploadToggle = section.querySelector('#ownerPhotoAutoUpload'); const pendingList = section.querySelector('#ownerPhotoPendingList');
        const remoteConnectButton = section.querySelector('#ownerPhotoRemoteConnect'); const remotePanel = section.querySelector('#ownerPhotoRemotePanel'); const remoteQr = section.querySelector('#ownerPhotoRemoteQr');
        const remoteStatus = section.querySelector('#ownerPhotoRemoteStatus'); const remoteApproval = section.querySelector('#ownerPhotoRemoteApproval'); const remoteProgressBox = section.querySelector('#ownerPhotoRemoteProgress');
        const remoteBadge = section.querySelector('#ownerPhotoRemoteBadge'); const remoteCount = section.querySelector('#ownerPhotoRemoteCount'); const transferControls = section.querySelector('#ownerPhotoTransferControls');
        const sendStudentsButton = section.querySelector('#ownerPhotoSendStudents'); const takeStudentsButton = section.querySelector('#ownerPhotoTakeStudents');
        const accountCacheBySchool = new Map(); const classCacheBySchool = new Map();
        let accounts = []; let classes = []; let selectedStudents = []; let pendingStudents = []; let skippedStudents = []; let captureIndex = 0; let cameraStream = null; let selectionLocked = false;
        let remoteCaptureSession = null; let remoteCaptureTimer = null; let remoteCaptureBusy = false; let remotePairingCode = ''; let currentRemoteAssigned = [];
        let currentSnapshotBlob = null; let uploadAbortController = null; let isUploading = false;
        function renderPhotoSchools() {
            const previous = schoolSelect.value; schoolSelect.replaceChildren(new Option('Select school', ''));
            (schools || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(school => schoolSelect.add(new Option(`${school.name || 'Unnamed school'} · ${school.code || 'No code'}`, school.id)));
            if ((schools || []).some(school => String(school.id) === previous)) schoolSelect.value = previous;
        }
        async function loadPhotoClasses() {
            const schoolId = schoolSelect.value; classSelect.disabled = true;
            classSelect.replaceChildren(new Option(schoolId ? 'Loading classes…' : 'Select school first', ''));
            if (!schoolId) return [];
            if (classCacheBySchool.has(schoolId)) return classCacheBySchool.get(schoolId);
            const [courses, schoolClasses] = await Promise.all([database.ref(`schoolCourses/${schoolId}`).once('value'), database.ref(`schoolClasses/${schoolId}`).once('value')]);
            const map = new Map(); [courses.val(), schoolClasses.val()].forEach(records => Object.entries(records || {}).forEach(([id, record]) => { if (record && typeof record === 'object') map.set(id, { id, name: record.courseName || record.className || record.name || record.title || 'Class' }); }));
            const loadedClasses = [...map.values()].sort((a, b) => a.name.localeCompare(b.name)); classCacheBySchool.set(schoolId, loadedClasses); return loadedClasses;
        }
        function renderClassOptions() {
            classSelect.replaceChildren(new Option(classes.length ? 'Select class' : 'No classes found', ''));
            classes.forEach(record => classSelect.add(new Option(record.name, record.id)));
            classSelect.disabled = !classes.length || selectionLocked;
        }
        async function loadPhotoAccounts(schoolId = schoolSelect.value) {
            if (accountCacheBySchool.has(schoolId)) return accountCacheBySchool.get(schoolId);
            if (!database) throw new Error('The owner database is not connected.');
            const snapshot = await database.ref(`schoolUsers/${schoolId}`).once('value');
            const loadedAccounts = Object.entries(snapshot.val() || {}).map(([uid, profile]) => ({ uid, ...(profile || {}), schoolId, _schoolUserLinked: true }));
            accountCacheBySchool.set(schoolId, loadedAccounts); return loadedAccounts;
        }
        const normalizedRoll = value => String(value || '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
        const profilePhotoValue = profile => profile?.profilePhoto || profile?.profilePhotoKey || profile?.profilePic || profile?.profileImage || profile?.photoURL || profile?.profile_photo || '';
        const profileClassMatches = (profile, selectedClass) => {
                const ids = [profile.courseId, profile.classId, profile.enrolledClassId].filter(Boolean).map(String);
                const nameMatch = String(profile.className || profile.courseName || profile.course || '').trim().toLowerCase() === selectedClass.name.toLowerCase();
                return ids.includes(selectedClass.id) || nameMatch;
        };
        function filteredStudents() {
            const selectedClass = classes.find(record => record.id === classSelect.value);
            if (!selectedClass || !sectionSelect.value) return [];
            return accounts.filter(profile => {
                const role = String(profile.role || profile.accountType || '').trim().toLowerCase();
                const isStudent = role === 'student' || (!role && !!profile.classRoll);
                return isStudent && profileClassMatches(profile, selectedClass) && String(profile.section || '').trim().toLowerCase() === sectionSelect.value.toLowerCase();
            }).sort((a, b) => Number(a.classRoll || 0) - Number(b.classRoll || 0) || String(a.name || '').localeCompare(String(b.name || '')));
        }
        function refreshRoster() {
            const students = filteredStudents();
            lockButton.disabled = selectionLocked || !schoolSelect.value || !classSelect.value || !sectionSelect.value || !students.length;
            if (!schoolSelect.value || !classSelect.value || !sectionSelect.value) {
                rosterElement.textContent = 'Select a school, class, and section to view the student count.';
                return;
            }
            const alreadyHasPhoto = students.filter(profilePhotoValue).length;
            rosterElement.textContent = students.length ? `${students.length} students loaded; ${students.length - alreadyHasPhoto} need a photo and ${alreadyHasPhoto} already have one. Roster and photo status are cached in memory; no per-student fetch is needed.` : 'No students with matching class and section details were found.';
        }
        function renderPendingStudents() {
            pendingList.replaceChildren();
            selectedStudents.forEach((student, index) => {
                const item = document.createElement('li'); item.className = 'mb-2';
                const name = document.createElement('span'); name.textContent = `${student.name || student.email || 'Unnamed student'}${student.classRoll ? ` · Roll ${student.classRoll}` : ''}`;
                const status = document.createElement('span'); status.className = 'd-block text-muted';
                status.textContent = profilePhotoValue(student) ? 'Photo already set' : student._photoCaptureStatus || 'Pending photo';
                if (pendingStudents[captureIndex]?.uid === student.uid) { item.classList.add('fw-bold'); item.setAttribute('aria-current', 'step'); }
                const sequence = document.createElement('span'); sequence.className = 'me-1'; sequence.textContent = `${index + 1}.`;
                item.append(sequence, name, status); pendingList.append(item);
            });
        }
        function populateSections() {
            const selectedClass = classes.find(record => record.id === classSelect.value);
            const sectionNames = new Map();
            if (selectedClass) {
                accounts.filter(profile => profileClassMatches(profile, selectedClass)).forEach(profile => {
                    const value = String(profile.section || '').trim();
                    if (value) sectionNames.set(value.toLowerCase(), value);
                });
            }
            sectionSelect.replaceChildren(new Option(sectionNames.size ? 'Select section' : 'No sections found', ''));
            [...sectionNames.values()].sort((a, b) => a.localeCompare(b)).forEach(value => sectionSelect.add(new Option(value, value)));
            sectionSelect.disabled = !sectionNames.size || selectionLocked;
            refreshRoster();
        }
        function stopCamera() {
            if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null; video.srcObject = null; captureButton.disabled = true;
        }
        function resetSnapshotView() {
            currentSnapshotBlob = null;
            snapshot.hidden = true;
            snapshot.removeAttribute('src');
            video.hidden = false;
            if (faceGuide) faceGuide.hidden = false;
            captureButton.hidden = false;
            captureButton.disabled = !cameraStream || !pendingStudents[captureIndex];
            doUploadButton.hidden = true;
            stopUploadButton.hidden = true;
            retakeButton.hidden = true;
            skipButton.hidden = false;
        }
        function remoteCaptureUrl(action) {
            const endpoint = String(APP_FIREBASE?.profileUploadWorkerUrl || '').trim();
            const base = new URL(endpoint);
            if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Secure remote capture requires a valid HTTPS Worker URL.');
            return new URL(`owner/remote-photo-capture/${action}`, base);
        }
        async function ownerRemoteCaptureRequest(action, payload = {}, responseType = 'json') {
            const owner = ownerAuth?.auth().currentUser;
            if (!owner || !remoteCaptureSession) throw new Error('The owner session or remote camera session is unavailable.');
            const token = await owner.getIdToken();
            const response = await fetch(remoteCaptureUrl(action), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: remoteCaptureSession.sessionId, ...payload }),
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer'
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                const error = new Error(result.error || 'Remote camera request failed.');
                error.status = response.status;
                throw error;
            }
            return responseType === 'blob' ? response.blob() : response.json();
        }
        async function pollRemoteCaptureStatus() {
            if (!remoteCaptureSession || remoteCaptureBusy) return;
            remoteCaptureBusy = true;
            try {
                const result = await ownerRemoteCaptureRequest('status');
                if (!remoteCaptureSession) return;
                currentRemoteAssigned = Array.isArray(result.remoteStudents) ? result.remoteStudents : [];
                if (result.pairExpired) {
                    remoteApproval.hidden = true;
                    remoteStatus.textContent = 'This QR code expired. Disconnect and try again.';
                } else if (result.status === 'pairing') {
                    remotePairingCode = result.pairingCode;
                    section.querySelector('#ownerPhotoRemoteCode').textContent = remotePairingCode;
                    remoteApproval.hidden = false;
                    remoteStatus.textContent = `A device named “${result.deviceName || 'Camera device'}” is requesting connection. Confirm code:`;
                } else if (result.status === 'approved') {
                    remoteApproval.hidden = true;
                    remoteProgressBox.hidden = false;
                    transferControls.hidden = false;
                    const completed = Number(result.completedCount) || 0;
                    const total = Number(result.totalCount) || remoteCaptureSession.totalAssigned || 0;
                    if (completed >= total && total > 0) {
                        remoteBadge.textContent = 'Remote device finished!';
                        remoteBadge.className = 'badge bg-success text-wrap mb-1';
                        remoteCount.textContent = `All ${total} assigned photos uploaded directly.`;
                        remoteStatus.textContent = 'Remote device completed all its assigned photos.';
                    } else {
                        remoteBadge.textContent = `Remote device: ${completed} / ${total} uploaded`;
                        remoteBadge.className = 'badge bg-info text-dark text-wrap mb-1';
                        remoteCount.textContent = `${total - completed} students remaining on remote device.`;
                        remoteStatus.textContent = `Connected to ${result.deviceName || 'phone'}. Capturing & uploading in parallel.`;
                    }
                } else {
                    remoteApproval.hidden = true;
                    remoteStatus.textContent = 'Waiting for second device to scan the QR code.';
                }
            } catch (error) {
                if (error.status === 410) {
                    clearInterval(remoteCaptureTimer); remoteCaptureTimer = null;
                    remoteStatus.textContent = 'This remote camera session expired.';
                }
            } finally { remoteCaptureBusy = false; }
        }
        async function startRemoteCapture() {
            if (typeof window.QRCode !== 'function') throw new Error('QR code support did not load. Reload the owner portal and try again.');
            if (pendingStudents.length < 2) throw new Error('You need at least 2 pending students to divide the list between two devices.');

            const remaining = pendingStudents.slice(captureIndex + 1);
            if (remaining.length === 0) throw new Error('No upcoming students remaining to assign to a remote device.');
            const halfRemaining = Math.ceil(remaining.length / 2);
            const remoteList = remaining.slice(halfRemaining);
            const keepRemaining = remaining.slice(0, halfRemaining);
            const ownerList = [...pendingStudents.slice(0, captureIndex + 1), ...keepRemaining];

            remoteConnectButton.disabled = true;
            remotePanel.hidden = false;
            remoteQr.replaceChildren();
            remoteStatus.textContent = `Divided list (${ownerList.length} for this device, ${remoteList.length} for second device). Creating pairing code…`;
            remoteApproval.hidden = true;
            remoteProgressBox.hidden = true;
            transferControls.hidden = true;

            const owner = ownerAuth?.auth().currentUser;
            if (!owner) throw new Error('Sign in again before connecting a camera device.');
            const token = await owner.getIdToken();
            const response = await fetch(remoteCaptureUrl('create'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolId: schoolSelect.value,
                    assignedStudents: remoteList.map(s => ({
                        uid: s.uid,
                        name: s.name || '',
                        classRoll: s.classRoll || '',
                        section: s.section || '',
                        fatherName: s.fatherName || s.father_name || s.father || ''
                    }))
                }),
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer'
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Could not start remote capture.');
            remoteCaptureSession = { sessionId: result.sessionId, totalAssigned: remoteList.length };

            pendingStudents = ownerList;
            captureIndex = Math.min(captureIndex, Math.max(0, pendingStudents.length - 1));
            renderCurrentStudent();

            const captureUrl = new URL('../remote-photo-capture.html', window.location.href);
            captureUrl.hash = new URLSearchParams({ session: result.sessionId, token: result.qrToken }).toString();
            new window.QRCode(remoteQr, { text: captureUrl.href, width: 180, height: 180, colorDark: '#17243a', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
            remoteStatus.textContent = `Scan QR code with the second device to assign ${remoteList.length} students to it.`;
            remoteCaptureTimer = window.setInterval(pollRemoteCaptureStatus, 2500);
            await pollRemoteCaptureStatus();
        }
        async function closeRemoteCapture() {
            if (remoteCaptureTimer) window.clearInterval(remoteCaptureTimer);
            remoteCaptureTimer = null;
            const session = remoteCaptureSession;
            if (session) {
                try { await ownerRemoteCaptureRequest('revoke'); }
                catch (error) {}
            }
            remoteCaptureSession = null;
            remotePairingCode = '';
            currentRemoteAssigned = [];
            remoteApproval.hidden = true;
            remotePanel.hidden = true;
            transferControls.hidden = true;
            remoteQr.replaceChildren();
            remoteConnectButton.hidden = false;
            remoteConnectButton.disabled = false;
        }
        function unlockSelection() {
            if (remoteCaptureSession) {
                closeRemoteCapture().then(() => unlockSelection()).catch(error => {
                    cameraStatus.textContent = `Could not revoke remote camera access: ${error.message}. Try Finish again.`;
                });
                return;
            }
            selectionLocked = false; stopCamera(); resetSnapshotView(); modal.hidden = true;
            schoolSelect.disabled = false; classSelect.disabled = !schoolSelect.value || !classes.length; sectionSelect.disabled = !classSelect.value || !sectionSelect.value;
            lockButton.innerHTML = '<i class="fas fa-lock"></i> Lock selection &amp; open camera';
            lockButton.classList.remove('btn-outline-secondary'); lockButton.classList.add('btn-primary'); refreshRoster();
        }
        function renderCurrentStudent() {
            resetSnapshotView();
            const student = pendingStudents[captureIndex];
            details.replaceChildren();
            if (!student) {
                if (skippedStudents.length > 0) {
                    pendingStudents = skippedStudents;
                    skippedStudents = [];
                    captureIndex = 0;
                    notify('Regular student queue finished! Now capturing skipped students.', 'info');
                    renderCurrentStudent();
                    return;
                }
                section.querySelector('#ownerPhotoProgress').textContent = pendingStudents.length ? `Complete: all ${pendingStudents.length} assigned photos processed on this device.` : `${selectedStudents.length} students selected; no photos are pending.`;
                cameraStatus.textContent = 'All assigned students on this device have been processed.';
                captureButton.hidden = true; skipButton.hidden = true; finishButton.hidden = false;
                renderPendingStudents();
                return;
            }
            const isSkippedRound = student._isSkippedRound;
            const rosterIndex = selectedStudents.findIndex(record => record.uid === student.uid);
            section.querySelector('#ownerPhotoProgress').textContent = `Photo ${captureIndex + 1} of ${pendingStudents.length} (This device)${isSkippedRound ? ' · Skipped queue' : ''} · Roll #${student.classRoll || 'N/A'}`;
            const fatherName = student.fatherName || student.father_name || student.fathersName || student.father || student.guardianName || student.parentName || student.parent_name || 'Not provided';
            const fatherMobile = student.fatherMobile || student.fatherMobileNumber || student.fatherPhone || student.guardianMobile || student.guardianPhone || student.parentMobile || student.parentPhone || student.emergencyContact || 'Not provided';
            const values = [
                ['Student name', student.name || 'Not provided'], ['Father / guardian name', fatherName],
                ['Student mobile', student.mobile || student.phone || 'Not provided'], ['Father / guardian mobile', fatherMobile],
                ['Class / section', `${classes.find(record => record.id === classSelect.value)?.name || ''} / ${student.section || ''}`],
                ['Roll number', student.classRoll || 'Not provided']
            ];
            values.forEach(([label, value]) => {
                const cell = document.createElement('div'); cell.className = 'col-sm-6 small';
                const strong = document.createElement('strong'); strong.textContent = `${label}: `; cell.append(strong, document.createTextNode(String(value))); details.append(cell);
            });
            cameraStatus.textContent = 'Check student details, position student in frame, then capture.';
            captureButton.hidden = false; skipButton.hidden = false; finishButton.hidden = true;
            captureButton.disabled = !cameraStream;
            renderPendingStudents();
        }
        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported here. Open the owner portal over HTTPS in a supported browser.');
            cameraStatus.textContent = 'Waiting for camera permission…';
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 }
                    },
                    audio: false
                });
            } catch (e) {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            }
            video.srcObject = cameraStream;
            await video.play(); captureButton.disabled = false; cameraStatus.textContent = 'Camera is ready.';
        }
        async function takeSnapshot() {
            const student = pendingStudents[captureIndex];
            if (!student || !video.videoWidth) return notify('Position the student in frame before capturing.', 'warning');
            try {
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                const stageRect = video.getBoundingClientRect();
                const targetAspect = (stageRect.width && stageRect.height) ? (stageRect.width / stageRect.height) : (3 / 4);
                const videoAspect = vw / vh;

                let sx = 0, sy = 0, sWidth = vw, sHeight = vh;
                if (videoAspect > targetAspect) {
                    sWidth = Math.round(vh * targetAspect);
                    sx = Math.round((vw - sWidth) / 2);
                } else {
                    sHeight = Math.round(vw / targetAspect);
                    sy = Math.round((vh - sHeight) / 2);
                }

                const outHeight = Math.min(Math.round(sHeight), 1280);
                const outWidth = Math.round(outHeight * targetAspect);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, outWidth);
                canvas.height = Math.max(1, outHeight);

                const context = canvas.getContext('2d', { alpha: false });
                if (!context) throw new Error('Could not prepare the captured photo.');
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
                context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, outWidth, outHeight);

                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.90));
                if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('The captured photo exceeds 2 MB.');
                currentSnapshotBlob = blob;
                snapshot.src = URL.createObjectURL(blob);
                snapshot.hidden = false;
                video.hidden = true;
                if (faceGuide) faceGuide.hidden = true;
                if (autoUploadToggle.checked) {
                    await startUploadCurrentSnapshot();
                } else {
                    captureButton.hidden = true;
                    skipButton.hidden = true;
                    doUploadButton.hidden = false;
                    retakeButton.hidden = false;
                    cameraStatus.textContent = 'Preview ready. Tap Upload photo or Retake.';
                }
            } catch (error) {
                notify(error.message || 'Capture failed.', 'danger');
            }
        }
        async function startUploadCurrentSnapshot() {
            const student = pendingStudents[captureIndex];
            const owner = ownerAuth?.auth().currentUser;
            if (!student || !owner || !window.RollCallProfileUpload || !currentSnapshotBlob) {
                return notify('No captured photo is ready to upload.', 'warning');
            }
            isUploading = true;
            captureButton.hidden = true;
            doUploadButton.hidden = true;
            retakeButton.hidden = true;
            skipButton.hidden = true;
            stopUploadButton.hidden = false;
            cameraStatus.textContent = 'Uploading photo to R2… Click Stop upload to cancel.';
            uploadAbortController = new AbortController();

            try {
                const blob = currentSnapshotBlob;
                const result = await window.RollCallProfileUpload.upload(blob, {
                    uid: student.uid,
                    getIdToken: () => owner.getIdToken(),
                    signal: uploadAbortController.signal
                });
                if (!isUploading) return;
                const timestamp = Date.now();
                const updates = {
                    [`users/${student.uid}/profilePhoto`]: result.publicUrl,
                    [`users/${student.uid}/profilePhotoKey`]: result.key,
                    [`users/${student.uid}/profilePhotoUpdatedAt`]: timestamp
                };
                if (student._schoolUserLinked) {
                    updates[`schoolUsers/${student.schoolId}/${student.uid}/profilePhoto`] = result.publicUrl;
                    updates[`schoolUsers/${student.schoolId}/${student.uid}/profilePhotoKey`] = result.key;
                    updates[`schoolUsers/${student.schoolId}/${student.uid}/profilePhotoUpdatedAt`] = timestamp;
                }
                await database.ref().update(updates);
                student.profilePhoto = result.publicUrl; student.profilePhotoKey = result.key; student.profilePhotoUpdatedAt = timestamp; student._photoCaptureStatus = 'Uploaded';
                isUploading = false;
                stopUploadButton.hidden = true;
                cameraIndexNext('Photo uploaded directly.');
            } catch (error) {
                isUploading = false;
                stopUploadButton.hidden = true;
                doUploadButton.hidden = false;
                retakeButton.hidden = false;
                cameraStatus.textContent = error.message || 'Photo upload failed. You can Retake or click Upload photo to retry.';
            }
        }
        function stopCurrentUpload() {
            if (!isUploading) return;
            isUploading = false;
            if (uploadAbortController) uploadAbortController.abort();
            stopUploadButton.hidden = true;
            doUploadButton.hidden = false;
            retakeButton.hidden = false;
            cameraStatus.textContent = 'Upload stopped. Tap Retake or Upload photo to retry.';
            notify('Upload cancelled.', 'info');
        }
        function cameraIndexNext(message) {
            resetSnapshotView();
            captureIndex += 1; cameraStatus.textContent = message; renderCurrentStudent();
            if (pendingStudents[captureIndex]) captureButton.disabled = !cameraStream;
        }
        async function sendRemainingStudentsToPhone() {
            if (!remoteCaptureSession) return notify('No remote device is connected.', 'warning');
            const availableToSend = pendingStudents.slice(captureIndex + 1);
            if (!availableToSend.length) return notify('You have no remaining upcoming students to send.', 'warning');

            let count = availableToSend.length;
            if (availableToSend.length > 1) {
                const answer = window.prompt(`How many upcoming students to send to remote device? (1 to ${availableToSend.length}, or press OK for all ${availableToSend.length}):`, String(availableToSend.length));
                if (answer === null) return;
                const parsed = parseInt(String(answer).trim(), 10);
                if (!isNaN(parsed) && parsed >= 1 && parsed <= availableToSend.length) {
                    count = parsed;
                }
            }
            const toSend = availableToSend.slice(0, count);
            const toKeep = availableToSend.slice(count);

            try {
                sendStudentsButton.disabled = true;
                const existingUncompleted = currentRemoteAssigned.filter(s => !s.completed);
                const existingCompleted = currentRemoteAssigned.filter(s => s.completed);
                const updatedList = [
                    ...existingCompleted,
                    ...existingUncompleted,
                    ...toSend.map(s => ({
                        uid: s.uid,
                        name: s.name || '',
                        classRoll: s.classRoll || '',
                        section: s.section || '',
                        fatherName: s.fatherName || s.father || ''
                    }))
                ];
                await ownerRemoteCaptureRequest('sync-students', { assignedStudents: updatedList });
                pendingStudents = [...pendingStudents.slice(0, captureIndex + 1), ...toKeep];
                notify(`Transferred ${toSend.length} student(s) to the remote phone!`, 'success');
                renderCurrentStudent();
                await pollRemoteCaptureStatus();
            } catch (error) {
                notify(error.message || 'Could not transfer students to phone.', 'danger');
            } finally {
                sendStudentsButton.disabled = false;
            }
        }
        async function takeRemainingStudentsFromPhone() {
            if (!remoteCaptureSession) return notify('No remote device is connected.', 'warning');
            try {
                takeStudentsButton.disabled = true;
                await pollRemoteCaptureStatus();
                const uncompleted = currentRemoteAssigned.filter(s => !s.completed);
                if (!uncompleted.length) return notify('Remote phone has no uncompleted students to take.', 'warning');

                let count = uncompleted.length;
                if (uncompleted.length > 1) {
                    const answer = window.prompt(`How many uncompleted students to reclaim from remote phone? (1 to ${uncompleted.length}, or press OK for all ${uncompleted.length}):`, String(uncompleted.length));
                    if (answer === null) return;
                    const parsed = parseInt(String(answer).trim(), 10);
                    if (!isNaN(parsed) && parsed >= 1 && parsed <= uncompleted.length) {
                        count = parsed;
                    }
                }

                // Reclaim from the tail of remote uncompleted to safeguard whichever student is currently active on the phone
                const toReclaim = uncompleted.slice(uncompleted.length - count);
                const remainingUncompletedOnPhone = uncompleted.slice(0, uncompleted.length - count);
                const completedOnly = currentRemoteAssigned.filter(s => s.completed);

                const updatedList = [...completedOnly, ...remainingUncompletedOnPhone];
                await ownerRemoteCaptureRequest('sync-students', { assignedStudents: updatedList });

                toReclaim.forEach(s => {
                    const fullRecord = selectedStudents.find(r => r.uid === s.uid) || s;
                    pendingStudents.push(fullRecord);
                });
                notify(`Reclaimed ${toReclaim.length} student(s) from the phone to this device!`, 'success');
                renderCurrentStudent();
                await pollRemoteCaptureStatus();
            } catch (error) {
                notify(error.message || 'Could not reclaim students from phone.', 'danger');
            } finally {
                takeStudentsButton.disabled = false;
            }
        }
        section._onBulkPhotosOpen = async () => {
            const cached = await readSchoolsCache();
            if (Array.isArray(cached)) schools = cached;
            renderPhotoSchools();
            if (database) {
                try { const snapshot = await database.ref('schools').once('value'); schools = Object.entries(snapshot.val() || {}).map(([id, school]) => ({ id, ...(school || {}) })); await writeSchoolsCache(); renderPhotoSchools(); }
                catch (error) { if (!Array.isArray(cached)) notify(`Could not load schools for profile photos: ${error.message}`, 'danger'); }
            }
        };
        schoolSelect.addEventListener('change', async () => {
            classes = []; accounts = []; classSelect.replaceChildren(new Option('Loading…', '')); classSelect.disabled = true;
            sectionSelect.replaceChildren(new Option('Select class first', '')); sectionSelect.disabled = true; refreshRoster();
            if (!schoolSelect.value) return;
            const selectedSchoolId = schoolSelect.value;
            try {
                const [loadedAccounts, loadedClasses] = await Promise.all([loadPhotoAccounts(selectedSchoolId), loadPhotoClasses()]);
                if (schoolSelect.value !== selectedSchoolId) return;
                accounts = loadedAccounts; classes = loadedClasses; renderClassOptions(); populateSections();
            }
            catch (error) { notify(`Could not load this school's roster or classes: ${error.message}`, 'danger'); }
        });
        classSelect.addEventListener('change', populateSections);
        sectionSelect.addEventListener('change', refreshRoster);
        lockButton.addEventListener('click', async () => {
            if (selectionLocked) { unlockSelection(); return; }
            selectedStudents = filteredStudents();
            if (!schoolSelect.value || !classSelect.value || !sectionSelect.value || !selectedStudents.length) return notify('Select a school, class, and section with students before locking.', 'warning');
            selectedStudents.forEach(student => { if (!profilePhotoValue(student)) delete student._photoCaptureStatus; });
            pendingStudents = selectedStudents.filter(student => !profilePhotoValue(student));
            skippedStudents = [];
            selectionLocked = true; captureIndex = 0; schoolSelect.disabled = true; classSelect.disabled = true; sectionSelect.disabled = true;
            lockButton.innerHTML = '<i class="fas fa-unlock"></i> Unlock to change selection'; lockButton.classList.remove('btn-primary'); lockButton.classList.add('btn-outline-secondary');
            modal.hidden = false; renderCurrentStudent();
            if (!pendingStudents.length) return;
            try { await startCamera(); }
            catch (error) { stopCamera(); cameraStatus.textContent = error.message; captureButton.disabled = true; notify(error.message, 'warning'); }
        });
        captureButton.addEventListener('click', takeSnapshot);
        doUploadButton.addEventListener('click', startUploadCurrentSnapshot);
        stopUploadButton.addEventListener('click', stopCurrentUpload);
        retakeButton.addEventListener('click', resetSnapshotView);
        sendStudentsButton.addEventListener('click', sendRemainingStudentsToPhone);
        takeStudentsButton.addEventListener('click', takeRemainingStudentsFromPhone);
        remoteConnectButton.addEventListener('click', async () => {
            try { await startRemoteCapture(); }
            catch (error) {
                remoteStatus.textContent = error.message;
                remoteConnectButton.disabled = false;
                notify(error.message, 'warning');
            }
        });
        section.querySelector('#ownerPhotoRemoteApprove').addEventListener('click', async event => {
            const button = event.currentTarget; button.disabled = true;
            try {
                await ownerRemoteCaptureRequest('approve', { pairingCode: remotePairingCode });
                remotePairingCode = '';
                await pollRemoteCaptureStatus();
                notify('Second device approved! Students are divided and both devices can now capture photos simultaneously.', 'success');
            } catch (error) { remoteStatus.textContent = error.message; }
            finally { button.disabled = false; }
        });
        section.querySelector('#ownerPhotoRemoteReject').addEventListener('click', async () => {
            try { await ownerRemoteCaptureRequest('reject', { pairingCode: remotePairingCode }); await closeRemoteCapture(); }
            catch (error) { remoteStatus.textContent = error.message; }
        });
        section.querySelector('#ownerPhotoRemoteDisconnect').addEventListener('click', async () => {
            try { await closeRemoteCapture(); }
            catch (error) { remoteStatus.textContent = error.message; }
        });
        skipButton.addEventListener('click', () => {
            const currentStudent = pendingStudents[captureIndex];
            if (currentStudent) {
                currentStudent._photoCaptureStatus = 'Skipped (queued for later)';
                currentStudent._isSkippedRound = true;
                skippedStudents.push(currentStudent);
            }
            cameraIndexNext('Student moved to skipped queue (will be captured later).');
        });
        finishButton.addEventListener('click', () => { void unlockSelection(); });
        section.querySelector('#ownerPhotoClose').addEventListener('click', () => { void unlockSelection(); });
        section._onBulkPhotosClose = () => { if (selectionLocked) unlockSelection(); };
        item.querySelector('a').addEventListener('click', event => { event.preventDefault(); switchSection('owner-bulk-profile-photos'); renderPhotoSchools(); });
    }

    function install() {
        addPricingPanel(); addAdminProfileRequestsPanel(); addSubscriptionResubscribeRequestsPanel(); addCustomMailPanel(); addBulkRegistrationsPanel(); addBulkProfilePhotosPanel(); installSchoolEditModal();
        document.querySelectorAll('.nav-links .nav-link').forEach(link => link.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); switchSection(link.hash.slice(1)); }, true));
        document.getElementById('schoolSearch')?.addEventListener('input', loadSchoolsTable);
        document.getElementById('previewRegistrationBtn')?.addEventListener('click', event => { event.preventDefault(); if (typeof previewRegistration === 'function') previewRegistration(); });
        document.getElementById('schoolType')?.addEventListener('change', renderSchoolPlanOptions);
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
