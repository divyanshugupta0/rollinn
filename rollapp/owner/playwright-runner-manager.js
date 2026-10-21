/**
 * Playwright Automation Studio - Owner Portal Manager
 * --------------------------------------------------------------------------
 * Author, manage, deploy, and trigger Playwright automation scripts for
 * Student, Teacher, and Admin portals — with support for:
 *  1. All Schools (Global platform-wide broadcast)
 *  2. School-Specific targeting (Selected registered school)
 *  3. Interactive Execute Popup Form Modal (Connects to Firebase, HTML/CSS injector)
 */

(function () {
    'use strict';

    let currentScripts = {};
    let currentExecutions = {};
    let currentSchools = [];
    let isDbInitialized = false;

    // Built-in starter templates for Playwright
    const TEMPLATES = {
        click_and_assert: `// 1. Wait for element, click it, and assert outcome
await page.waitForSelector('button', { timeout: 8000 });
runner.log('Found button on page, clicking...');
await page.click('button');
await page.waitForTimeout(800);

const currentUrl = page.url();
console.log('Current URL after click:', currentUrl);
expect(currentUrl).toBeTruthy();
runner.log('Click & assertion passed successfully!');`,

        fill_form: `// 2. Fill form inputs and test input reactivity
await page.waitForSelector('input[type="text"], input[type="search"]');
await page.fill('input[type="text"], input[type="search"]', 'Playwright Automated Test');
await page.waitForTimeout(600);

runner.log('Form field populated');
const pageTitle = page.title();
console.log('Page Title:', pageTitle);
expect(pageTitle).toBeTruthy();`,

        student_flow: `// 3. Student Portal Automation & Attendance Probe
runner.log('Starting Student Portal automated probe...');
await page.waitForTimeout(1000);

// Check if page loaded properly
const title = page.title();
console.log('Portal Title:', title);
expect(title).toContain('RollCall');

// Look for student navigation or dashboard sections
const hasSections = await page.isVisible('main, .main-content, #app');
console.log('Main content visible:', hasSections);

runner.log('Student diagnostic verified successfully.');`,

        teacher_flow: `// 4. Teacher Portal Automation & Timetable Check
runner.log('Executing Teacher Portal automation...');
await page.waitForTimeout(1200);

const greeting = await page.textContent('h1, h2, #teacherWelcome');
console.log('Header text:', greeting);

// Verify current URL belongs to teacher workspace
const url = page.url();
expect(url).toContain('teacher');
runner.log('Teacher workspace verified and active.');`,

        admin_flow: `// 5. Admin Portal Diagnostics & Stats Probe
runner.log('Admin Portal Automated Health Probe');
await page.waitForTimeout(1000);

const isAdminUrl = page.url().includes('admin');
expect(isAdminUrl).toBe(true);

console.log('Admin portal loaded. Current URL:', page.url());
runner.log('Admin diagnostics completed.');`,

        custom_eval: `// 6. Custom Browser Evaluation
runner.log('Running custom browser evaluation...');
const windowMetrics = await page.evaluate(() => {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        userAgent: navigator.userAgent,
        cookiesEnabled: navigator.cookieEnabled
    };
});

console.log('Client Metrics:', JSON.stringify(windowMetrics, null, 2));
expect(windowMetrics.width).toBeGreaterThan(0);
runner.log('Metrics successfully collected!');`,

        popup_form: `// 7. Interactive Popup Form (HTML + CSS + Direct Firebase Save)
runner.log('Displaying interactive popup form on portal...');
const response = await page.showPopupForm({
    title: 'Instant Attendance Verification & Survey',
    html: \`
        <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#1e293b;">Full Name / Identity</label>
            <input type="text" id="respondent_name" class="form-control" placeholder="Enter your name..." style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
        </div>
        <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#1e293b;">Attendance / System Feedback</label>
            <textarea id="feedback_notes" class="form-control" rows="2" placeholder="System works smoothly..." style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;"></textarea>
        </div>
    \`,
    css: \`
        .pw-client-popup-card { border: 2px solid #3b82f6 !important; }
    \`,
    submitText: 'Submit & Save to Firebase',
    cancelText: 'Dismiss',
    firebasePath: 'playwrightFormSubmissions', // Saves responses straight to Firebase Realtime DB
    timeout: 60000
});

console.log('Popup form outcome:', JSON.stringify(response));
expect(response.submitted).toBe(true);
runner.log('Interactive form completed and synced to Firebase!');`,

        parent_details_popup: `// 8. Parent Details Popup (HTML + CSS + Auto-Open + Firebase Save)
// 1. Injected custom CSS
await page.injectCSS(\`
    .popup-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.65);
      z-index: 10000;
    }
    .popup-overlay.active {
      display: flex;
    }
    .popup {
      position: relative;
      width: 100%;
      max-width: 420px;
      padding: 28px;
      border-radius: 16px;
      background: white;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .close-btn {
      position: absolute;
      top: 14px;
      right: 16px;
      border: none;
      background: none;
      font-size: 25px;
      cursor: pointer;
      color: #64748b;
    }
    .popup h2 { margin: 0 0 8px; color: #111827; font-size: 22px; font-weight: 700; }
    .popup .description { margin-bottom: 20px; color: #64748b; font-size: 13.5px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 6px; color: #374151; font-size: 13px; font-weight: 600; }
    .form-group input, .form-group select {
      width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;
    }
    .submit-btn {
      width: 100%; padding: 12px; border: none; border-radius: 8px; background: #2563eb; color: white; font-size: 14.5px; font-weight: 600; cursor: pointer;
    }
    .submit-btn:hover { background: #1d4ed8; }
\`);

// 2. Injected HTML
await page.injectHTML(\`
  <div class="popup-overlay active" id="popupOverlay">
    <div class="popup" role="dialog" aria-modal="true">
      <button class="close-btn" id="closePopup" type="button">&times;</button>
      <h2>Parent Details</h2>
      <p class="description">Please provide your parent's occupation and contact number.</p>
      <form id="parentForm">
        <div class="form-group">
          <label for="occupation">Parent Occupation</label>
          <select id="occupation" name="parentOccupation" required>
            <option value="">Select occupation</option>
            <option value="Government Employee">Government Employee</option>
            <option value="Private Employee">Private Employee</option>
            <option value="Business">Business / Self-employed</option>
            <option value="Farmer">Farmer</option>
            <option value="Teacher">Teacher</option>
            <option value="Doctor">Doctor</option>
            <option value="Retired">Retired</option>
            <option value="Homemaker">Homemaker</option>
            <option value="Daily Wage Worker">Daily Wage Worker</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="parentPhone">Parent Phone Number</label>
          <input type="tel" id="parentPhone" name="parentPhone" placeholder="Enter 10-digit mobile number" inputmode="numeric" pattern="[6-9][0-9]{9}" maxlength="10" required />
        </div>
        <button class="submit-btn" type="submit">Submit Details</button>
        <p class="message" id="message" style="margin-top:12px; text-align:center; font-size:13px;"></p>
      </form>
    </div>
  </div>
\`);

// 3. Attach interactive JS logic with direct Firebase save
const overlay = document.getElementById("popupOverlay");
const closeBtn = document.getElementById("closePopup");
const form = document.getElementById("parentForm");
const phoneInput = document.getElementById("parentPhone");
const message = document.getElementById("message");

function closePopup() {
    if (overlay) overlay.classList.remove("active");
}
closeBtn?.addEventListener("click", closePopup);
overlay?.addEventListener("click", (e) => { if (e.target === overlay) closePopup(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopup(); });

phoneInput?.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\\D/g, "").slice(0, 10);
});

form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const parentDetails = {
        parentOccupation: document.getElementById("occupation").value,
        parentPhone: phoneInput.value
    };

    console.log("Saving Parent details to Firebase:", parentDetails);
    message.style.color = "#2563eb";
    message.textContent = "Connecting to Firebase & saving...";

    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            await firebase.database().ref('parentDetails').push({
                ...parentDetails,
                submittedAt: Date.now(),
                url: window.location.href
            });
            message.style.color = "#15803d";
            message.textContent = "Saved to Firebase successfully! ✓";
            setTimeout(closePopup, 1400);
        } else {
            message.textContent = "Saved locally! ✓";
        }
    } catch(err) {
        message.style.color = "#ef4444";
        message.textContent = "Error saving: " + err.message;
    }
});

runner.log("Parent details popup displayed successfully on portal screen!");`
    };

    function getDb() {
        if (typeof ownerAuth !== 'undefined' && ownerAuth && ownerAuth.database) {
            return ownerAuth.database();
        }
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            return firebase.database();
        }
        return null;
    }

    function initStudio() {
        addSidebarLink();
        injectStudioSection();
        bindUIEvents();
        setupFirebaseListeners();
    }

    function addSidebarLink() {
        const nav = document.querySelector('.sidebar .nav-links');
        if (!nav || document.getElementById('pw-runner-nav-link')) return;

        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `
            <a class="nav-link" id="pw-runner-nav-link" href="#playwright-runner">
                <i class="fas fa-terminal"></i>Playwright Runner
            </a>
        `;
        nav.appendChild(li);

        li.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.switchSection === 'function') {
                window.switchSection('playwright-runner');
            } else {
                document.querySelectorAll('.main-content > section').forEach(s => s.style.display = 'none');
                const sec = document.getElementById('playwright-runner');
                if (sec) sec.style.display = 'block';
            }
        });
    }

    function injectStudioSection() {
        const main = document.querySelector('.main-content');
        if (!main || document.getElementById('playwright-runner')) return;

        const section = document.createElement('section');
        section.id = 'playwright-runner';
        section.className = 'animated-section';
        section.style.display = 'none';

        section.innerHTML = `
            <div class="section-card playwright-studio-container">
                <!-- Header -->
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                    <div>
                        <span class="badge text-bg-primary mb-2"><i class="fas fa-robot me-1"></i>Browser Automation</span>
                        <h2 class="mb-1"><i class="fas fa-play me-2 text-primary"></i>Playwright Automation Studio</h2>
                        <p class="text-muted mb-0">Write Playwright scripts in Owner Portal. Target <strong>All Schools</strong> or a <strong>Specific School</strong>, and pick target portal (Student, Teacher, Admin).</p>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-secondary" id="pwRefreshBtn">
                            <i class="fas fa-sync-alt me-1"></i>Refresh
                        </button>
                        <button class="btn btn-warning text-dark fw-bold" id="pwQuickExecuteBtn">
                            <i class="fas fa-bolt me-1"></i>Execute Popup Form
                        </button>
                        <button class="btn btn-primary" id="pwCreateNewBtn">
                            <i class="fas fa-plus-circle me-1"></i>New Automation Script
                        </button>
                    </div>
                </div>

                <!-- KPI Stats -->
                <div class="row g-3 mb-4">
                    <div class="col-sm-6 col-xl-3">
                        <div class="pw-stat-card">
                            <div class="pw-stat-icon primary"><i class="fas fa-file-code"></i></div>
                            <div>
                                <small class="text-muted fw-semibold">Active Scripts</small>
                                <h3 class="mb-0 fw-bold" id="pwStatActiveScripts">0</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="pw-stat-card">
                            <div class="pw-stat-icon purple"><i class="fas fa-globe"></i></div>
                            <div>
                                <small class="text-muted fw-semibold">All-Schools Scope</small>
                                <h3 class="mb-0 fw-bold" id="pwStatAllSchools">0</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="pw-stat-card">
                            <div class="pw-stat-icon success"><i class="fas fa-school"></i></div>
                            <div>
                                <small class="text-muted fw-semibold">School-Specific</small>
                                <h3 class="mb-0 fw-bold" id="pwStatSpecificSchools">0</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="pw-stat-card">
                            <div class="pw-stat-icon warning"><i class="fas fa-satellite-dish"></i></div>
                            <div>
                                <small class="text-muted fw-semibold">Total Runs Logged</small>
                                <h3 class="mb-0 fw-bold" id="pwStatExecutions">0</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Editor Form Card (Collapsible) -->
                <div class="card border-0 shadow-sm rounded-3 mb-4" id="pwEditorCard" style="display: none; background: #ffffff;">
                    <div class="card-header bg-light d-flex justify-content-between align-items-center py-3">
                        <h5 class="mb-0 fw-bold text-dark" id="pwEditorTitle">
                            <i class="fas fa-edit me-2 text-primary"></i>Create Playwright Script
                        </h5>
                        <button class="btn btn-sm btn-outline-secondary" id="pwCancelEditBtn">✕ Close</button>
                    </div>
                    <div class="card-body p-4">
                        <form id="pwScriptForm">
                            <input type="hidden" id="pwScriptId">
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-semibold" for="pwScriptName">Script Name <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="pwScriptName" required placeholder="e.g. Verify Student Timetable Flow">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-semibold" for="pwScriptTarget">Target Portal <span class="text-danger">*</span></label>
                                    <select class="form-select" id="pwScriptTarget" required>
                                        <option value="student">Student Portal</option>
                                        <option value="teacher">Teacher Portal</option>
                                        <option value="admin">Admin Portal</option>
                                        <option value="all">All Portals (Student, Teacher, Admin)</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-semibold" for="pwScriptMode">Execution Mode</label>
                                    <select class="form-select" id="pwScriptMode">
                                        <option value="realtime_trigger">Realtime Trigger (Runs instantly)</option>
                                        <option value="on_page_load">Auto on Page Load (On open/refresh)</option>
                                        <option value="once_per_device">Once per Device (Single run)</option>
                                    </select>
                                </div>

                                <!-- Target School Scope: All vs Specific -->
                                <div class="col-md-4">
                                    <label class="form-label fw-semibold" for="pwScriptSchoolScope">School Scope <span class="text-danger">*</span></label>
                                    <select class="form-select" id="pwScriptSchoolScope" required>
                                        <option value="all">🌐 All Schools (Global broadcast)</option>
                                        <option value="specific">🏫 Specific School (Target one school)</option>
                                    </select>
                                </div>
                                <div class="col-md-8" id="pwSpecificSchoolGroup" style="display: none;">
                                    <label class="form-label fw-semibold" for="pwScriptSchoolSelect">Choose School <span class="text-danger">*</span></label>
                                    <select class="form-select" id="pwScriptSchoolSelect">
                                        <option value="">-- Select a registered school --</option>
                                    </select>
                                </div>

                                <div class="col-12">
                                    <label class="form-label fw-semibold" for="pwScriptDesc">Description / Purpose</label>
                                    <input type="text" class="form-control" id="pwScriptDesc" placeholder="e.g. Verifies attendance button responsiveness and asserts DOM updates">
                                </div>
                            </div>

                            <!-- Template Selector & Editor Header -->
                            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                                <div class="d-flex align-items-center gap-2">
                                    <label class="form-label fw-semibold mb-0" for="pwTemplateSelect">
                                        <i class="fas fa-magic text-warning me-1"></i>Load Template:
                                    </label>
                                    <select class="form-select form-select-sm" id="pwTemplateSelect" style="width: auto;">
                                        <option value="">-- Choose a template --</option>
                                        <option value="click_and_assert">1. Click Element & Assert Result</option>
                                        <option value="fill_form">2. Fill Form Field & Verify</option>
                                        <option value="student_flow">3. Student Portal Attendance Check</option>
                                        <option value="teacher_flow">4. Teacher Portal Workspace Check</option>
                                        <option value="admin_flow">5. Admin Portal Diagnostics</option>
                                        <option value="custom_eval">6. Client Metrics Evaluation</option>
                                        <option value="popup_form">7. Interactive Popup Form (HTML/CSS + Firebase)</option>
                                        <option value="parent_details_popup">8. Parent Details Popup (Auto-Open + Firebase)</option>
                                    </select>
                                </div>
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" id="pwScriptActive" checked>
                                    <label class="form-check-label fw-semibold" for="pwScriptActive">Script Active</label>
                                </div>
                            </div>

                            <!-- Code Editor -->
                            <div class="pw-code-editor-wrapper mb-3">
                                <div class="pw-code-editor-header">
                                    <span><i class="fas fa-code me-2 text-primary"></i>Playwright Async Code (injected: page, expect, console, runner)</span>
                                    <span class="badge bg-secondary">JavaScript</span>
                                </div>
                                <textarea class="pw-code-editor-textarea" id="pwScriptCode" required spellcheck="false" placeholder="// Write standard Playwright code here...&#10;await page.waitForSelector('button');&#10;await page.click('button');&#10;expect(page.url()).toBeTruthy();"></textarea>
                            </div>

                            <!-- API Reference Cheatsheet Accordion -->
                            <div class="pw-cheatsheet-card mb-3">
                                <div class="d-flex align-items-center justify-content-between">
                                    <span class="fw-semibold text-secondary"><i class="fas fa-info-circle me-1 text-primary"></i>Supported Playwright Browser APIs:</span>
                                    <span class="text-muted small">Runs directly in the target browser window</span>
                                </div>
                                <div class="mt-2 d-flex flex-wrap gap-2">
                                    <code>await page.click(selector)</code>
                                    <code>await page.fill(selector, val)</code>
                                    <code>await page.waitForSelector(selector, {timeout: 8000})</code>
                                    <code>await page.waitForTimeout(ms)</code>
                                    <code>await page.showPopupForm({title, html, css, firebasePath})</code>
                                    <code>await page.injectHTML(html)</code>
                                    <code>await page.injectCSS(css)</code>
                                    <code>expect(val).toBe(expected)</code>
                                    <code>runner.log('custom log')</code>
                                </div>
                            </div>

                            <!-- Submit Buttons -->
                            <div class="d-flex justify-content-end gap-2">
                                <button type="button" class="btn btn-outline-secondary" id="pwCancelBtnBottom">Cancel</button>
                                <button type="submit" class="btn btn-primary" id="pwSaveBtn">
                                    <i class="fas fa-save me-1"></i>Save Script to Firebase
                                </button>
                                <button type="button" class="btn btn-success" id="pwSaveAndTriggerBtn">
                                    <i class="fas fa-bolt me-1"></i>Save & Trigger Now 🚀
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Navigation Tabs: Scripts vs Execution Telemetry -->
                <ul class="nav nav-pills mb-3" id="pwStudioTabs">
                    <li class="nav-item">
                        <button class="nav-link active" id="pwTabScriptsBtn" type="button">
                            <i class="fas fa-list me-1"></i>Saved Scripts (<span id="pwScriptsCountBadge">0</span>)
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="pwTabTelemetryBtn" type="button">
                            <i class="fas fa-stream me-1"></i>Live Telemetry & Logs (<span id="pwLogsCountBadge">0</span>)
                        </button>
                    </li>
                </ul>

                <!-- TAB 1: Scripts List -->
                <div id="pwTabScripts">
                    <div class="table-responsive bg-white rounded-3 border">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 25%;">Script Name</th>
                                    <th>Target Portal</th>
                                    <th>School Scope</th>
                                    <th>Execution Mode</th>
                                    <th>Status</th>
                                    <th>Last Run</th>
                                    <th class="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="pwScriptsTableBody">
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        <i class="fas fa-spinner fa-spin me-2"></i>Loading automation scripts from Firebase...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- TAB 2: Live Telemetry Stream -->
                <div id="pwTabTelemetry" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <select class="form-select form-select-sm" id="pwTelemetryFilterPortal" style="width: 150px;">
                                <option value="all">All Portals</option>
                                <option value="student">Student Portal</option>
                                <option value="teacher">Teacher Portal</option>
                                <option value="admin">Admin Portal</option>
                            </select>
                            <select class="form-select form-select-sm" id="pwTelemetryFilterSchool" style="width: 180px;">
                                <option value="all">All Schools</option>
                            </select>
                            <select class="form-select form-select-sm" id="pwTelemetryFilterStatus" style="width: 130px;">
                                <option value="all">All Statuses</option>
                                <option value="success">Success only</option>
                                <option value="error">Error only</option>
                            </select>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" id="pwClearTelemetryBtn">
                            <i class="fas fa-trash-alt me-1"></i>Clear History
                        </button>
                    </div>

                    <div id="pwTelemetryList">
                        <div class="text-center py-5 text-muted">
                            <i class="fas fa-satellite me-2"></i>Waiting for live execution telemetry from portals...
                        </div>
                    </div>
                </div>
            </div>

            <!-- EXECUTE POPUP FORM MODAL -->
            <div class="pw-popup-modal-backdrop" id="pwQuickExecuteModal">
                <div class="pw-popup-modal-card">
                    <div class="pw-popup-modal-header">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-warning text-dark"><i class="fas fa-bolt me-1"></i>Quick Execute</span>
                            <h5 class="mb-0 fw-bold">Execute Popup Form / Script</h5>
                            <span class="badge bg-success ms-2" id="pwModalFbBadge"><i class="fas fa-check-circle me-1"></i>Firebase Live</span>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-light" id="pwCloseModalX">✕</button>
                    </div>

                    <div class="pw-popup-modal-body">
                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <label class="form-label fw-semibold small text-muted">Load From Existing Script</label>
                                <select class="form-select form-select-sm" id="pwModalScriptPicker">
                                    <option value="">-- Or author ad-hoc script below --</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label fw-semibold small text-muted">Target Portal</label>
                                <select class="form-select form-select-sm" id="pwModalTargetPortal">
                                    <option value="student">Student Portal</option>
                                    <option value="teacher">Teacher Portal</option>
                                    <option value="admin">Admin Portal</option>
                                    <option value="all">All Portals</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label fw-semibold small text-muted">Target School</label>
                                <select class="form-select form-select-sm" id="pwModalTargetSchool">
                                    <option value="all">🌐 All Schools</option>
                                </select>
                            </div>
                        </div>

                        <!-- Sub-tabs: Script Code vs Injected HTML/CSS -->
                        <ul class="nav nav-tabs mb-2" id="pwModalEditorTabs">
                            <li class="nav-item">
                                <button class="nav-link active py-1 px-3 small" id="pwModalTabCodeBtn" type="button"><i class="fas fa-code me-1"></i>Playwright Code</button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link py-1 px-3 small" id="pwModalTabHtmlBtn" type="button"><i class="fab fa-html5 me-1 text-danger"></i>Popup HTML & CSS</button>
                            </li>
                        </ul>

                        <!-- Tab 1: Code -->
                        <div id="pwModalTabCode">
                            <div class="pw-code-editor-wrapper mb-2">
                                <div class="pw-code-editor-header py-1">
                                    <small><i class="fas fa-terminal me-1 text-primary"></i>Async Execution Code</small>
                                    <small class="text-muted">Injected: page, expect, console, runner</small>
                                </div>
                                <textarea class="pw-code-editor-textarea" id="pwModalCode" rows="8" style="min-height: 180px;"></textarea>
                            </div>
                        </div>

                        <!-- Tab 2: Custom HTML & CSS -->
                        <div id="pwModalTabHtml" style="display: none;">
                            <div class="row g-2 mb-2">
                                <div class="col-md-7">
                                    <label class="form-label fw-semibold small text-muted mb-1">Custom Popup HTML</label>
                                    <textarea class="form-control font-monospace" id="pwModalCustomHtml" rows="6" style="font-size: 12px;" placeholder="<div class='custom-box'><h3>Notice</h3><p>Verify attendance...</p></div>"></textarea>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label fw-semibold small text-muted mb-1">Custom Popup CSS</label>
                                    <textarea class="form-control font-monospace" id="pwModalCustomCss" rows="6" style="font-size: 12px;" placeholder=".custom-box { background: #f0fdf4; border-radius: 8px; padding: 12px; }"></textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Live Console Output for Modal -->
                        <div class="mt-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <small class="fw-semibold text-secondary"><i class="fas fa-satellite-dish me-1 text-primary"></i>Live Execution Status</small>
                                <span class="badge text-bg-light" id="pwModalStatusBadge">Idle</span>
                            </div>
                            <div class="pw-log-terminal" id="pwModalLogTerminal" style="max-height: 110px; font-size: 11px;">
                                Ready to execute. Click "Execute Now on Target Portals" to trigger live execution via Firebase.
                            </div>
                        </div>
                    </div>

                    <div class="pw-popup-modal-footer">
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="pwTestFbConnBtn">
                            <i class="fas fa-plug me-1"></i>Test Firebase Connection
                        </button>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-outline-secondary btn-sm" id="pwCloseModalBtn">Close</button>
                            <button type="button" class="btn btn-warning btn-sm text-dark fw-bold" id="pwModalExecuteBtn">
                                <i class="fas fa-bolt me-1"></i>Execute Now on Target Portals 🚀
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        main.appendChild(section);
    }

    function bindUIEvents() {
        const createBtn = document.getElementById('pwCreateNewBtn');
        const refreshBtn = document.getElementById('pwRefreshBtn');
        const cancelBtn = document.getElementById('pwCancelEditBtn');
        const cancelBtnBottom = document.getElementById('pwCancelBtnBottom');
        const editorCard = document.getElementById('pwEditorCard');
        const scriptForm = document.getElementById('pwScriptForm');
        const templateSelect = document.getElementById('pwTemplateSelect');
        const saveAndTriggerBtn = document.getElementById('pwSaveAndTriggerBtn');

        const tabScriptsBtn = document.getElementById('pwTabScriptsBtn');
        const tabTelemetryBtn = document.getElementById('pwTabTelemetryBtn');
        const tabScripts = document.getElementById('pwTabScripts');
        const tabTelemetry = document.getElementById('pwTabTelemetry');

        const schoolScopeSelect = document.getElementById('pwScriptSchoolScope');
        const specificSchoolGroup = document.getElementById('pwSpecificSchoolGroup');

        const filterPortal = document.getElementById('pwTelemetryFilterPortal');
        const filterSchool = document.getElementById('pwTelemetryFilterSchool');
        const filterStatus = document.getElementById('pwTelemetryFilterStatus');
        const clearTelemetryBtn = document.getElementById('pwClearTelemetryBtn');

        // Modal Elements
        const quickExecuteBtn = document.getElementById('pwQuickExecuteBtn');
        const modalBackdrop = document.getElementById('pwQuickExecuteModal');
        const closeModalX = document.getElementById('pwCloseModalX');
        const closeModalBtn = document.getElementById('pwCloseModalBtn');
        const testFbConnBtn = document.getElementById('pwTestFbConnBtn');
        const modalExecuteBtn = document.getElementById('pwModalExecuteBtn');
        const modalScriptPicker = document.getElementById('pwModalScriptPicker');
        const modalTabCodeBtn = document.getElementById('pwModalTabCodeBtn');
        const modalTabHtmlBtn = document.getElementById('pwModalTabHtmlBtn');
        const modalTabCode = document.getElementById('pwModalTabCode');
        const modalTabHtml = document.getElementById('pwModalTabHtml');

        // Quick Execute Modal Open/Close
        quickExecuteBtn?.addEventListener('click', () => {
            openQuickExecuteModal();
        });

        closeModalX?.addEventListener('click', () => {
            modalBackdrop.classList.remove('show');
        });

        closeModalBtn?.addEventListener('click', () => {
            modalBackdrop.classList.remove('show');
        });

        modalBackdrop?.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
                modalBackdrop.classList.remove('show');
            }
        });

        // Modal Sub-tabs
        modalTabCodeBtn?.addEventListener('click', () => {
            modalTabCodeBtn.classList.add('active');
            modalTabHtmlBtn.classList.remove('active');
            modalTabCode.style.display = 'block';
            modalTabHtml.style.display = 'none';
        });

        modalTabHtmlBtn?.addEventListener('click', () => {
            modalTabHtmlBtn.classList.add('active');
            modalTabCodeBtn.classList.remove('active');
            modalTabCode.style.display = 'none';
            modalTabHtml.style.display = 'block';
        });

        // Script Picker inside Modal
        modalScriptPicker?.addEventListener('change', () => {
            const chosenId = modalScriptPicker.value;
            if (chosenId && currentScripts[chosenId]) {
                const s = currentScripts[chosenId];
                document.getElementById('pwModalCode').value = s.code || '';
                document.getElementById('pwModalTargetPortal').value = s.targetPortal || 'student';
                document.getElementById('pwModalTargetSchool').value = s.targetSchool || 'all';
            }
        });

        // Test Firebase Connection in Modal
        testFbConnBtn?.addEventListener('click', async () => {
            const db = getDb();
            const badge = document.getElementById('pwModalFbBadge');
            const term = document.getElementById('pwModalLogTerminal');
            if (!db) {
                if (badge) { badge.className = 'badge bg-danger'; badge.textContent = 'Firebase Offline'; }
                showNotification('Firebase Realtime Database is not connected.', 'danger');
                return;
            }

            try {
                const testRef = db.ref('playwrightPing').push();
                await testRef.set({ ping: Date.now() });
                await testRef.remove();
                if (badge) { badge.className = 'badge bg-success'; badge.textContent = 'Firebase Connected ✓'; }
                if (term) term.textContent = `[${new Date().toLocaleTimeString()}] Firebase connection ping verified successfully (read/write OK).`;
                showNotification('Firebase connection active and responding!', 'success');
            } catch (err) {
                if (badge) { badge.className = 'badge bg-danger'; badge.textContent = 'Firebase Error'; }
                if (term) term.textContent = `[ERROR] Firebase ping failed: ${err.message}`;
                showNotification(`Firebase connection failed: ${err.message}`, 'danger');
            }
        });

        // Execute Modal Script Live
        modalExecuteBtn?.addEventListener('click', async () => {
            await executeFromModal();
        });

        // Toggle Specific School input
        schoolScopeSelect?.addEventListener('change', () => {
            const isSpecific = schoolScopeSelect.value === 'specific';
            if (specificSchoolGroup) {
                specificSchoolGroup.style.display = isSpecific ? 'block' : 'none';
            }
        });

        // Tab Switching
        tabScriptsBtn?.addEventListener('click', () => {
            tabScriptsBtn.classList.add('active');
            tabTelemetryBtn.classList.remove('active');
            tabScripts.style.display = 'block';
            tabTelemetry.style.display = 'none';
        });

        tabTelemetryBtn?.addEventListener('click', () => {
            tabTelemetryBtn.classList.add('active');
            tabScriptsBtn.classList.remove('active');
            tabScripts.style.display = 'none';
            tabTelemetry.style.display = 'block';
        });

        // Open/Close Editor
        createBtn?.addEventListener('click', () => {
            openEditorForNew();
        });

        cancelBtn?.addEventListener('click', () => {
            editorCard.style.display = 'none';
        });

        cancelBtnBottom?.addEventListener('click', () => {
            editorCard.style.display = 'none';
        });

        // Refresh
        refreshBtn?.addEventListener('click', () => {
            setupFirebaseListeners();
            showNotification('Refreshed scripts, schools & telemetry from Firebase', 'info');
        });

        // Template selector
        templateSelect?.addEventListener('change', () => {
            const val = templateSelect.value;
            if (val && TEMPLATES[val]) {
                document.getElementById('pwScriptCode').value = TEMPLATES[val];
            }
        });

        // Form Submit
        scriptForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveScript(false);
        });

        // Save & Trigger
        saveAndTriggerBtn?.addEventListener('click', async () => {
            await saveScript(true);
        });

        // Telemetry filters
        filterPortal?.addEventListener('change', renderTelemetryList);
        filterSchool?.addEventListener('change', renderTelemetryList);
        filterStatus?.addEventListener('change', renderTelemetryList);

        // Clear telemetry
        clearTelemetryBtn?.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to clear all execution history?')) return;
            const db = getDb();
            if (db) {
                await db.ref('playwrightExecutions').remove();
                currentExecutions = {};
                renderTelemetryList();
                showNotification('Execution telemetry cleared', 'success');
            }
        });
    }

    function openQuickExecuteModal() {
        const modalBackdrop = document.getElementById('pwQuickExecuteModal');
        if (!modalBackdrop) return;

        // Populate scripts in modal picker
        const picker = document.getElementById('pwModalScriptPicker');
        if (picker) {
            picker.innerHTML = '<option value="">-- Or author ad-hoc script below --</option>' +
                Object.values(currentScripts).map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.targetPortal)})</option>`).join('');
        }

        // Set default template if empty
        const codeInput = document.getElementById('pwModalCode');
        if (codeInput && !codeInput.value.trim()) {
            codeInput.value = TEMPLATES.popup_form;
        }

        modalBackdrop.classList.add('show');
    }

    async function executeFromModal() {
        const db = getDb();
        if (!db) {
            alert('Firebase Database is not connected.');
            return;
        }

        let code = document.getElementById('pwModalCode').value.trim();
        const targetPortal = document.getElementById('pwModalTargetPortal').value;
        const targetSchool = document.getElementById('pwModalTargetSchool').value;
        const customHtml = document.getElementById('pwModalCustomHtml').value.trim();
        const customCss = document.getElementById('pwModalCustomCss').value.trim();

        if (!code) {
            alert('Please provide code to execute.');
            return;
        }

        // If custom HTML / CSS was specified, prepend injection calls
        if (customCss) {
            code = `await page.injectCSS(${JSON.stringify(customCss)});\n` + code;
        }
        if (customHtml) {
            code = `await page.injectHTML(${JSON.stringify(customHtml)});\n` + code;
        }

        const scriptId = `quick_run_${Date.now()}`;
        const schoolObj = currentSchools.find(s => s.id === targetSchool);
        const targetSchoolName = targetSchool === 'all' ? 'All Schools' : (schoolObj?.name || targetSchool);

        const payload = {
            id: scriptId,
            name: `⚡ Popup Quick Run (${new Date().toLocaleTimeString()})`,
            description: 'Triggered via Quick Execute Popup Form',
            targetPortal,
            targetSchool,
            targetSchoolName,
            executionMode: 'realtime_trigger',
            triggerId: Date.now(),
            isActive: true,
            code,
            updatedAt: Date.now()
        };

        const statusBadge = document.getElementById('pwModalStatusBadge');
        const term = document.getElementById('pwModalLogTerminal');

        if (statusBadge) { statusBadge.className = 'badge bg-warning text-dark'; statusBadge.textContent = 'Broadcasting...'; }
        if (term) term.textContent = `[${new Date().toLocaleTimeString()}] Pushing execution trigger to Firebase for [Portal: ${targetPortal}, School: ${targetSchoolName}]...`;

        try {
            await db.ref(`playwrightScripts/${scriptId}`).set(payload);

            if (statusBadge) { statusBadge.className = 'badge bg-success'; statusBadge.textContent = 'Trigger Dispatched ✓'; }
            if (term) term.textContent += `\n[SUCCESS] Trigger broadcasted via Firebase! Connected ${targetPortal} portal browsers will execute instantly.`;
            showNotification(`🚀 Trigger dispatched to ${targetPortal} portals!`, 'success');

            // Listen for quick execution telemetry response
            const listenerRef = db.ref(`playwrightExecutions/${scriptId}`);
            listenerRef.on('child_added', snap => {
                const res = snap.val();
                if (res && term) {
                    term.textContent += `\n[CLIENT FEEDBACK] Status: ${res.status.toUpperCase()} in ${res.durationMs || 0}ms from URL: ${res.url}`;
                    if (res.logs && Array.isArray(res.logs)) {
                        term.textContent += `\n` + res.logs.slice(-3).join('\n');
                    }
                }
            });

        } catch (err) {
            if (statusBadge) { statusBadge.className = 'badge bg-danger'; statusBadge.textContent = 'Dispatch Failed'; }
            if (term) term.textContent += `\n[ERROR] ${err.message}`;
            alert(`Execution failed: ${err.message}`);
        }
    }

    function populateSchoolDropdowns() {
        const formSchoolSelect = document.getElementById('pwScriptSchoolSelect');
        const filterSchoolSelect = document.getElementById('pwTelemetryFilterSchool');
        const modalTargetSchool = document.getElementById('pwModalTargetSchool');

        const optionsHtml = currentSchools.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}${s.code ? ' [' + escapeHtml(s.code) + ']' : ''}</option>`).join('');

        if (formSchoolSelect) {
            const currentSelected = formSchoolSelect.value;
            formSchoolSelect.innerHTML = '<option value="">-- Select a registered school --</option>' + optionsHtml;
            if (currentSelected) formSchoolSelect.value = currentSelected;
        }

        if (filterSchoolSelect) {
            const currentFilter = filterSchoolSelect.value;
            filterSchoolSelect.innerHTML = '<option value="all">All Schools</option>' + optionsHtml;
            if (currentFilter) filterSchoolSelect.value = currentFilter;
        }

        if (modalTargetSchool) {
            const currentModalVal = modalTargetSchool.value;
            modalTargetSchool.innerHTML = '<option value="all">🌐 All Schools</option>' + optionsHtml;
            if (currentModalVal) modalTargetSchool.value = currentModalVal;
        }
    }

    function openEditorForNew() {
        const editorCard = document.getElementById('pwEditorCard');
        document.getElementById('pwEditorTitle').innerHTML = '<i class="fas fa-plus-circle me-2 text-primary"></i>Create Playwright Script';
        document.getElementById('pwScriptId').value = '';
        document.getElementById('pwScriptName').value = '';
        document.getElementById('pwScriptDesc').value = '';
        document.getElementById('pwScriptTarget').value = 'student';
        document.getElementById('pwScriptMode').value = 'realtime_trigger';

        // Reset School Scope
        document.getElementById('pwScriptSchoolScope').value = 'all';
        const specificGroup = document.getElementById('pwSpecificSchoolGroup');
        if (specificGroup) specificGroup.style.display = 'none';
        document.getElementById('pwScriptSchoolSelect').value = '';

        document.getElementById('pwScriptActive').checked = true;
        document.getElementById('pwTemplateSelect').value = 'click_and_assert';
        document.getElementById('pwScriptCode').value = TEMPLATES.click_and_assert;

        editorCard.style.display = 'block';
        editorCard.scrollIntoView({ behavior: 'smooth' });
    }

    function openEditorForEdit(script) {
        const editorCard = document.getElementById('pwEditorCard');
        document.getElementById('pwEditorTitle').innerHTML = `<i class="fas fa-edit me-2 text-primary"></i>Edit Script: ${escapeHtml(script.name)}`;
        document.getElementById('pwScriptId').value = script.id;
        document.getElementById('pwScriptName').value = script.name || '';
        document.getElementById('pwScriptDesc').value = script.description || '';
        document.getElementById('pwScriptTarget').value = script.targetPortal || 'student';
        document.getElementById('pwScriptMode').value = script.executionMode || 'realtime_trigger';

        // Set School Scope
        const isSpecific = script.targetSchool && script.targetSchool !== 'all';
        document.getElementById('pwScriptSchoolScope').value = isSpecific ? 'specific' : 'all';
        const specificGroup = document.getElementById('pwSpecificSchoolGroup');
        if (specificGroup) specificGroup.style.display = isSpecific ? 'block' : 'none';
        document.getElementById('pwScriptSchoolSelect').value = isSpecific ? script.targetSchool : '';

        document.getElementById('pwScriptActive').checked = script.isActive !== false;
        document.getElementById('pwTemplateSelect').value = '';
        document.getElementById('pwScriptCode').value = script.code || '';

        editorCard.style.display = 'block';
        editorCard.scrollIntoView({ behavior: 'smooth' });
    }

    async function saveScript(triggerNow = false) {
        const db = getDb();
        if (!db) {
            alert('Firebase Database is not connected.');
            return;
        }

        const id = document.getElementById('pwScriptId').value.trim() || `script_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const name = document.getElementById('pwScriptName').value.trim();
        const description = document.getElementById('pwScriptDesc').value.trim();
        const targetPortal = document.getElementById('pwScriptTarget').value;
        const executionMode = document.getElementById('pwScriptMode').value;
        const isActive = document.getElementById('pwScriptActive').checked;
        const code = document.getElementById('pwScriptCode').value.trim();

        // School Scope logic
        const schoolScope = document.getElementById('pwScriptSchoolScope').value;
        let targetSchool = 'all';
        let targetSchoolName = 'All Schools';
        let targetSchoolCode = '';

        if (schoolScope === 'specific') {
            const selectedSchoolId = document.getElementById('pwScriptSchoolSelect').value;
            if (!selectedSchoolId) {
                alert('Please select a specific school from the dropdown, or change the scope to "All Schools".');
                return;
            }
            targetSchool = selectedSchoolId;
            const schoolObj = currentSchools.find(s => s.id === selectedSchoolId);
            targetSchoolName = schoolObj?.name || selectedSchoolId;
            targetSchoolCode = schoolObj?.code || '';
        }

        if (!name || !code) {
            alert('Please provide a script name and code.');
            return;
        }

        const payload = {
            id,
            name,
            description,
            targetPortal,
            targetSchool,
            targetSchoolName,
            targetSchoolCode,
            executionMode,
            isActive,
            code,
            updatedAt: Date.now()
        };

        if (triggerNow) {
            payload.triggerId = Date.now();
        }

        try {
            await db.ref(`playwrightScripts/${id}`).update(payload);
            document.getElementById('pwEditorCard').style.display = 'none';
            const scopeLabel = targetSchool === 'all' ? 'All Schools' : targetSchoolName;
            showNotification(triggerNow ? `Script "${name}" saved & triggered for [${targetPortal} @ ${scopeLabel}]! 🚀` : `Script "${name}" saved to Firebase.`, 'success');
        } catch (e) {
            alert(`Error saving script: ${e.message}`);
        }
    }

    async function triggerScriptNow(scriptId) {
        const db = getDb();
        if (!db) return;
        const script = currentScripts[scriptId];
        if (!script) return;

        const triggerId = Date.now();
        await db.ref(`playwrightScripts/${scriptId}`).update({
            triggerId,
            isActive: true,
            updatedAt: triggerId
        });

        const scopeLabel = script.targetSchool === 'all' ? 'all schools' : (script.targetSchoolName || script.targetSchool);
        showNotification(`🚀 Triggered script "${script.name}"! Open ${script.targetPortal} portals in ${scopeLabel} will execute it automatically.`, 'success');
    }

    async function toggleScriptActive(scriptId, newStatus) {
        const db = getDb();
        if (!db) return;
        await db.ref(`playwrightScripts/${scriptId}`).update({
            isActive: newStatus,
            updatedAt: Date.now()
        });
        showNotification(`Script marked ${newStatus ? 'Active' : 'Disabled'}`, 'info');
    }

    async function deleteScript(scriptId) {
        if (!confirm('Are you sure you want to delete this script?')) return;
        const db = getDb();
        if (!db) return;

        await db.ref(`playwrightScripts/${scriptId}`).remove();
        await db.ref(`playwrightExecutions/${scriptId}`).remove().catch(() => {});
        showNotification('Script deleted', 'warning');
    }

    function setupFirebaseListeners() {
        const db = getDb();
        if (!db) {
            setTimeout(setupFirebaseListeners, 1500);
            return;
        }

        if (isDbInitialized) return;
        isDbInitialized = true;

        // Listen to schools
        db.ref('schools').on('value', snapshot => {
            const val = snapshot.val();
            currentSchools = val ? Object.entries(val).map(([id, s]) => ({ id, ...s })) : [];
            populateSchoolDropdowns();
            renderScriptsTable();
            updateStats();
        });

        // Listen to scripts
        db.ref('playwrightScripts').on('value', snapshot => {
            currentScripts = snapshot.val() || {};
            renderScriptsTable();
            updateStats();
        });

        // Listen to executions telemetry
        db.ref('playwrightExecutions').on('value', snapshot => {
            currentExecutions = snapshot.val() || {};
            renderTelemetryList();
            updateStats();
        });
    }

    function renderScriptsTable() {
        const tbody = document.getElementById('pwScriptsTableBody');
        if (!tbody) return;

        const scripts = Object.values(currentScripts);
        document.getElementById('pwScriptsCountBadge').textContent = scripts.length;

        if (scripts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-muted">
                        <i class="fas fa-code fa-2x mb-3 d-block text-secondary opacity-50"></i>
                        No Playwright scripts added yet.<br>
                        <button class="btn btn-sm btn-primary mt-2" onclick="document.getElementById('pwCreateNewBtn').click()">
                            <i class="fas fa-plus me-1"></i>Create your first script
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        // Sort by updatedAt descending
        scripts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        tbody.innerHTML = scripts.map(s => {
            const targetPortal = s.targetPortal || 'student';
            const targetPortalBadgeClass = targetPortal === 'student' ? 'student' : targetPortal === 'teacher' ? 'teacher' : targetPortal === 'admin' ? 'admin' : 'all';
            const targetPortalIcon = targetPortal === 'student' ? 'user-graduate' : targetPortal === 'teacher' ? 'chalkboard-teacher' : targetPortal === 'admin' ? 'user-shield' : 'users';

            // School Scope Badge
            const isAllSchools = !s.targetSchool || s.targetSchool === 'all';
            const schoolBadgeHtml = isAllSchools
                ? `<span class="badge text-bg-light border text-secondary" style="font-size: 11px;"><i class="fas fa-globe me-1 text-primary"></i>All Schools</span>`
                : `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" style="font-size: 11px;" title="${escapeHtml(s.targetSchool)}"><i class="fas fa-school me-1"></i>${escapeHtml(s.targetSchoolName || s.targetSchool)}</span>`;

            const isActive = s.isActive !== false;
            const lastRun = s.lastRun;
            let lastRunHtml = '<span class="text-muted small">Never</span>';
            if (lastRun && lastRun.timestamp) {
                const timeAgo = formatTimeAgo(lastRun.timestamp);
                const statusDot = lastRun.status === 'success' ? '<span class="pw-pulse-dot success me-1"></span>' : '<span class="pw-pulse-dot error me-1"></span>';
                lastRunHtml = `<div>${statusDot}<small class="fw-semibold">${timeAgo}</small><br><span class="text-muted" style="font-size:10px;">on ${lastRun.portal || 'portal'} (${lastRun.durationMs || 0}ms)</span></div>`;
            }

            return `
                <tr>
                    <td>
                        <strong class="d-block text-dark">${escapeHtml(s.name)}</strong>
                        <small class="text-muted">${escapeHtml(s.description || 'No description')}</small>
                    </td>
                    <td>
                        <span class="pw-target-badge ${targetPortalBadgeClass}">
                            <i class="fas fa-${targetPortalIcon}"></i> ${targetPortal}
                        </span>
                    </td>
                    <td>${schoolBadgeHtml}</td>
                    <td>
                        <small class="text-secondary fw-semibold">
                            ${s.executionMode === 'on_page_load' ? '⚡ On Page Load' : s.executionMode === 'once_per_device' ? '🔒 Once per Device' : '🚀 Realtime Trigger'}
                        </small>
                    </td>
                    <td>
                        <div class="form-check form-switch">
                            <input class="form-check-input pw-toggle-switch" type="checkbox" data-id="${s.id}" ${isActive ? 'checked' : ''} title="Toggle active">
                            <label class="form-check-label small">${isActive ? 'Active' : 'Disabled'}</label>
                        </div>
                    </td>
                    <td>${lastRunHtml}</td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-success pw-trigger-btn" data-id="${s.id}" title="Trigger run now on ${targetPortal} portal">
                                <i class="fas fa-play me-1"></i>Run
                            </button>
                            <button class="btn btn-outline-secondary pw-edit-btn" data-id="${s.id}" title="Edit script">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button class="btn btn-outline-danger pw-delete-btn" data-id="${s.id}" title="Delete script">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind table action buttons
        tbody.querySelectorAll('.pw-trigger-btn').forEach(btn => {
            btn.addEventListener('click', () => triggerScriptNow(btn.dataset.id));
        });
        tbody.querySelectorAll('.pw-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const s = currentScripts[btn.dataset.id];
                if (s) openEditorForEdit(s);
            });
        });
        tbody.querySelectorAll('.pw-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteScript(btn.dataset.id));
        });
        tbody.querySelectorAll('.pw-toggle-switch').forEach(sw => {
            sw.addEventListener('change', () => toggleScriptActive(sw.dataset.id, sw.checked));
        });
    }

    function renderTelemetryList() {
        const container = document.getElementById('pwTelemetryList');
        if (!container) return;

        const filterPortalVal = document.getElementById('pwTelemetryFilterPortal')?.value || 'all';
        const filterSchoolVal = document.getElementById('pwTelemetryFilterSchool')?.value || 'all';
        const filterStatusVal = document.getElementById('pwTelemetryFilterStatus')?.value || 'all';

        // Flatten all executions from currentExecutions tree
        const allExecs = [];
        Object.entries(currentExecutions).forEach(([scriptId, runs]) => {
            if (typeof runs === 'object' && runs !== null) {
                Object.values(runs).forEach(run => {
                    if (run && typeof run === 'object') {
                        allExecs.push(run);
                    }
                });
            }
        });

        document.getElementById('pwLogsCountBadge').textContent = allExecs.length;

        // Apply filters
        const filtered = allExecs.filter(e => {
            if (filterPortalVal !== 'all' && e.portal !== filterPortalVal) return false;
            if (filterSchoolVal !== 'all' && e.schoolId !== filterSchoolVal) return false;
            if (filterStatusVal !== 'all' && e.status !== filterStatusVal) return false;
            return true;
        });

        // Sort descending by timestamp
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted bg-white rounded-3 border">
                    <i class="fas fa-satellite fa-2x mb-3 d-block text-secondary opacity-50"></i>
                    No execution results recorded matching filters.<br>
                    <small>When a student, teacher, or admin portal runs your script, the results and logs appear here live!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((e, index) => {
            const isSuccess = e.status === 'success';
            const statusClass = isSuccess ? 'success' : 'danger';
            const statusText = isSuccess ? 'SUCCESS' : 'FAILED';
            const timeFormatted = new Date(e.timestamp || Date.now()).toLocaleString();
            const logsText = Array.isArray(e.logs) ? e.logs.join('\n') : (e.logs || 'No logs recorded');
            const errorTrace = e.error ? `\n[ERROR MESSAGE]: ${e.error.message || e.error}\n${e.error.stack || ''}` : '';

            // Find matching school name if possible
            const schoolName = currentSchools.find(s => s.id === e.schoolId)?.name || e.schoolId || 'Platform-wide';

            return `
                <div class="pw-execution-row">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                        <div>
                            <span class="badge bg-${statusClass} me-2">${statusText}</span>
                            <strong class="text-dark">${escapeHtml(e.scriptName || 'Script')}</strong>
                            <span class="text-muted ms-2 small">on <strong>${escapeHtml(e.portal || 'portal')}</strong> portal</span>
                            <span class="badge bg-light border text-secondary ms-2"><i class="fas fa-school me-1 text-primary"></i>${escapeHtml(schoolName)}</span>
                        </div>
                        <div class="text-end">
                            <span class="badge text-bg-light me-1"><i class="fas fa-clock me-1"></i>${e.durationMs || 0}ms</span>
                            <small class="text-muted">${timeFormatted}</small>
                        </div>
                    </div>

                    <div class="small text-muted mb-2">
                        <span><i class="fas fa-link me-1"></i>URL: <code>${escapeHtml(e.url || 'N/A')}</code></span>
                        ${e.user?.email ? `<span class="ms-3"><i class="fas fa-user me-1"></i>User: ${escapeHtml(e.user.email)}</span>` : ''}
                    </div>

                    <!-- Collapsible Terminal Output -->
                    <button class="btn btn-sm btn-link text-decoration-none p-0 pw-view-logs-toggle" data-target="log-block-${index}">
                        <i class="fas fa-terminal me-1"></i>View Execution Trace (${(e.logs || []).length} lines)
                    </button>
                    <div id="log-block-${index}" class="pw-log-terminal" style="display: none;">${escapeHtml(logsText + errorTrace)}</div>
                </div>
            `;
        }).join('');

        // Bind toggle log viewer
        container.querySelectorAll('.pw-view-logs-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.dataset.target);
                if (target) {
                    target.style.display = target.style.display === 'none' ? 'block' : 'none';
                }
            });
        });
    }

    function updateStats() {
        const scripts = Object.values(currentScripts);
        const activeCount = scripts.filter(s => s.isActive !== false).length;
        const allSchoolsCount = scripts.filter(s => !s.targetSchool || s.targetSchool === 'all').length;
        const specificSchoolsCount = scripts.filter(s => s.targetSchool && s.targetSchool !== 'all').length;

        let totalExecs = 0;
        Object.values(currentExecutions).forEach(runs => {
            if (runs && typeof runs === 'object') {
                totalExecs += Object.keys(runs).length;
            }
        });

        const activeEl = document.getElementById('pwStatActiveScripts');
        const allSchoolsEl = document.getElementById('pwStatAllSchools');
        const specSchoolsEl = document.getElementById('pwStatSpecificSchools');
        const execEl = document.getElementById('pwStatExecutions');

        if (activeEl) activeEl.textContent = activeCount;
        if (allSchoolsEl) allSchoolsEl.textContent = allSchoolsCount;
        if (specSchoolsEl) specSchoolsEl.textContent = specificSchoolsCount;
        if (execEl) execEl.textContent = totalExecs;
    }

    function showNotification(msg, type = 'info') {
        if (typeof window.notify === 'function') {
            window.notify(msg, type);
            return;
        }
        const banner = document.createElement('div');
        banner.className = `alert alert-${type} shadow-lg`;
        banner.style.position = 'fixed';
        banner.style.top = '20px';
        banner.style.right = '20px';
        banner.style.zIndex = '9999999';
        banner.style.borderRadius = '10px';
        banner.style.padding = '12px 20px';
        banner.textContent = msg;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 4000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTimeAgo(timestamp) {
        const diff = Math.floor((Date.now() - timestamp) / 1000);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    // Bootstrap manager
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStudio);
    } else {
        initStudio();
    }

    window.RollCallPlaywrightStudio = {
        init: initStudio,
        trigger: triggerScriptNow,
        openModal: openQuickExecuteModal,
        templates: TEMPLATES
    };

})();
