// ==========================================================================
// Teacher Portal - Test Scores & Assessment Management Module
// School-scoped test creation, scoring with mobile next-key auto-advance,
// local device draft caching, and real-time student synchronization.
// ==========================================================================
(() => {
    function initializeTeacherTestScores() {
        const sidebar = document.querySelector('.sidebar-menu');
        const container = document.querySelector('.main-content .container') || document.querySelector('.main-content');
        if (!sidebar || !container) return;
        if (!window.firebase?.database || !window.firebase?.auth) {
            window.addEventListener('load', initializeTeacherTestScores, { once: true });
            return;
        }

        // Avoid duplicate initialization
        if (document.getElementById('testScoresSection')) return;

        // Ensure sidebar navigation item
        let nav = sidebar.querySelector('[data-section="test-scores"]') || sidebar.querySelector('[data-section="testScores"]');
        if (nav) {
            nav.dataset.section = 'test-scores';
            nav.innerHTML = '<i class="fas fa-file-pen"></i><span>Test Scores</span>';
        } else {
            nav = document.createElement('div');
            nav.className = 'menu-item';
            nav.dataset.section = 'test-scores';
            nav.innerHTML = '<i class="fas fa-file-pen"></i><span>Test Scores</span>';

            // Insert after homework or classes
            const anchor = sidebar.querySelector('[data-section="homework"]') || sidebar.querySelector('[data-section="classes"]');
            if (anchor && anchor.nextSibling) {
                sidebar.insertBefore(nav, anchor.nextSibling);
            } else {
                sidebar.appendChild(nav);
            }
        }

        // Inject Stylesheet (Optimized for Mobile & Minimized UI)
        const style = document.createElement('style');
        style.id = 'teacher-test-scores-styles';
        style.textContent = `
            .tts-shell {
                max-width: 1200px;
                margin: 0 auto;
                color: #0f172a;
                padding-bottom: 70px;
                width: 100%;
                font-family: inherit;
            }

            /* Header Section */
            .tts-header-card {
                background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 16px 20px;
                margin: 6px 0 16px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                position: relative;
                overflow: hidden;
            }
            .tts-header-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 4px;
                height: 100%;
                background: #0284c7;
            }
            .tts-header-left {
                flex: 1;
                min-width: 200px;
            }
            .tts-header-kicker {
                font-size: 0.70rem;
                font-weight: 700;
                color: #0284c7;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-bottom: 2px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .tts-header-title {
                font-size: 1.25rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 2px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tts-header-subtitle {
                margin: 0;
                color: #64748b;
                font-size: 0.82rem;
            }
            .tts-header-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            /* Buttons */
            .tts-btn-primary {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                background: #0284c7;
                color: #ffffff;
                font-size: 0.82rem;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .tts-btn-primary:hover {
                background: #0369a1;
                transform: translateY(-1px);
            }
            .tts-btn-secondary {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 8px 14px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #334155;
                border-radius: 8px;
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .tts-btn-secondary:hover {
                background: #f1f5f9;
                color: #0f172a;
            }

            /* Stats Bar */
            .tts-stats-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                gap: 10px;
                margin-bottom: 16px;
            }
            .tts-stat-chip {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .tts-stat-icon {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.9rem;
                flex-shrink: 0;
            }
            .tts-stat-icon.blue { background: #e0f2fe; color: #0284c7; }
            .tts-stat-icon.green { background: #dcfce7; color: #16a34a; }
            .tts-stat-icon.amber { background: #fef3c7; color: #d97706; }
            .tts-stat-icon.purple { background: #f3e8ff; color: #9333ea; }
            .tts-stat-val {
                font-size: 1.15rem;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.1;
            }
            .tts-stat-lbl {
                font-size: 0.70rem;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            /* Main Card Container */
            .tts-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 16px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
            }

            /* Filter / Configuration Controls (Minimized Grid) */
            .tts-config-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 10px;
                margin-bottom: 12px;
            }
            .tts-field-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .tts-field-group label {
                font-size: 0.74rem;
                font-weight: 700;
                color: #475569;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .tts-field-group select,
            .tts-field-group input {
                padding: 8px 10px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 0.84rem;
                color: #0f172a;
                background: #f8fafc;
                transition: border-color 0.15s, background-color 0.15s;
                width: 100%;
                box-sizing: border-box;
            }
            .tts-field-group select:focus,
            .tts-field-group input:focus {
                outline: none;
                border-color: #0284c7;
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
            }

            /* Date notice badge */
            .tts-date-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 0.72rem;
                font-weight: 700;
                margin-top: 4px;
                width: fit-content;
            }
            .tts-date-badge.future {
                background: #dbeafe;
                color: #1d4ed8;
                border: 1px solid #bfdbfe;
            }
            .tts-date-badge.today {
                background: #dcfce7;
                color: #15803d;
                border: 1px solid #bbf7d0;
            }
            .tts-date-badge.past {
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #e2e8f0;
            }

            /* Draft restore banner */
            .tts-draft-banner {
                background: #eff6ff;
                border: 1px dashed #93c5fd;
                border-radius: 8px;
                padding: 8px 12px;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                font-size: 0.78rem;
                color: #1e40af;
            }
            .tts-draft-btn-clear {
                background: none;
                border: none;
                color: #dc2626;
                font-size: 0.75rem;
                font-weight: 700;
                cursor: pointer;
                text-decoration: underline;
                padding: 0;
            }

            /* Student Roster Grid (Mobile Minimized) */
            .tts-roster-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 8px;
                margin-bottom: 10px;
                border-bottom: 1px solid #e2e8f0;
            }
            .tts-roster-title {
                font-size: 0.88rem;
                font-weight: 700;
                color: #1e293b;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .tts-roster-count {
                font-size: 0.75rem;
                color: #64748b;
                background: #f1f5f9;
                padding: 2px 8px;
                border-radius: 999px;
                font-weight: 600;
            }

            .tts-student-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            /* Minimized Student Row for Mobile */
            .tts-student-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 8px 12px;
                transition: all 0.15s ease;
            }
            .tts-student-row:hover {
                background: #f1f5f9;
                border-color: #cbd5e1;
            }
            .tts-student-row.is-absent {
                background: #fdf4ff;
                border-color: #f0abfc;
                opacity: 0.85;
            }
            .tts-student-row.has-score {
                background: #ffffff;
                border-color: #93c5fd;
            }

            .tts-student-meta {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
                min-width: 0;
            }
            .tts-roll-badge {
                font-size: 0.74rem;
                font-weight: 800;
                color: #0369a1;
                background: #e0f2fe;
                padding: 3px 7px;
                border-radius: 6px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .tts-student-name {
                font-size: 0.84rem;
                font-weight: 700;
                color: #1e293b;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .tts-score-inputs-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
            }
            .tts-score-input-box {
                width: 72px;
                padding: 6px 8px;
                border: 1.5px solid #cbd5e1;
                border-radius: 8px;
                font-size: 0.90rem;
                font-weight: 700;
                text-align: center;
                background: #ffffff;
                color: #0f172a;
                transition: border-color 0.15s, box-shadow 0.15s;
                -moz-appearance: textfield;
            }
            .tts-score-input-box::-webkit-outer-spin-button,
            .tts-score-input-box::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            .tts-score-input-box:focus {
                outline: none;
                border-color: #0284c7;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.2);
            }
            .tts-score-input-box:disabled {
                background: #f1f5f9;
                color: #94a3b8;
                border-color: #e2e8f0;
                cursor: not-allowed;
            }

            .tts-outof-lbl {
                font-size: 0.75rem;
                font-weight: 600;
                color: #64748b;
                white-space: nowrap;
            }

            /* Absent Button */
            .tts-ab-btn {
                padding: 5px 8px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #64748b;
                border-radius: 6px;
                font-size: 0.72rem;
                font-weight: 800;
                cursor: pointer;
                transition: all 0.15s ease;
                letter-spacing: 0.04em;
            }
            .tts-ab-btn:hover {
                border-color: #9333ea;
                color: #9333ea;
            }
            .tts-ab-btn.active {
                background: #9333ea;
                color: #ffffff;
                border-color: #7e22ce;
                box-shadow: 0 1px 3px rgba(147, 51, 234, 0.3);
            }

            /* Live score badge */
            .tts-pct-badge {
                font-size: 0.70rem;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                white-space: nowrap;
                min-width: 32px;
                text-align: center;
            }
            .tts-pct-badge.excellent { background: #dcfce7; color: #15803d; }
            .tts-pct-badge.average { background: #fef3c7; color: #b45309; }
            .tts-pct-badge.low { background: #fee2e2; color: #b91c1c; }
            .tts-pct-badge.absent { background: #f3e8ff; color: #7e22ce; }

            /* Sticky Bottom Action Bar for Mobile */
            .tts-bottom-bar {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: #ffffff;
                border-top: 1px solid #e2e8f0;
                padding: 10px 16px;
                box-shadow: 0 -4px 14px rgba(0,0,0,0.06);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                z-index: 999;
            }
            @media (min-width: 992px) {
                .tts-bottom-bar {
                    left: 260px; /* offset sidebar on desktop */
                }
            }
            .tts-bottom-summary {
                font-size: 0.78rem;
                font-weight: 700;
                color: #334155;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .tts-bottom-progress {
                font-size: 0.70rem;
                font-weight: 600;
                color: #64748b;
            }

            /* Tests History List Grid */
            .tts-history-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 12px;
            }
            .tts-test-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 14px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.03);
                transition: transform 0.15s, box-shadow 0.15s;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                gap: 10px;
            }
            .tts-test-card:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                border-color: #cbd5e1;
            }
            .tts-test-top {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
            }
            .tts-test-title {
                font-size: 0.95rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 3px 0;
            }
            .tts-test-meta {
                font-size: 0.76rem;
                color: #64748b;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .tts-test-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-top: 1px solid #f1f5f9;
                padding-top: 8px;
                margin-top: 4px;
            }

            /* Responsive Tweaks */
            @media (max-width: 600px) {
                .tts-header-card { padding: 12px 14px; }
                .tts-header-title { font-size: 1.1rem; }
                .tts-score-input-box { width: 62px; font-size: 0.85rem; padding: 5px; }
                .tts-student-row { padding: 7px 10px; }
                .tts-roll-badge { font-size: 0.70rem; padding: 2px 5px; }
                .tts-student-name { font-size: 0.80rem; }
            }
        `;
        document.head.appendChild(style);

        // Build the Section HTML
        const panel = document.createElement('section');
        panel.id = 'testScoresSection';
        panel.className = 'section-container';
        panel.setAttribute('aria-label', 'Test Scores Management');
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="tts-shell">
                <!-- Header -->
                <div class="tts-header-card">
                    <div class="tts-header-left">
                        <div class="tts-header-kicker"><i class="fas fa-graduation-cap"></i> Academic Assessments</div>
                        <h1 class="tts-header-title"><i class="fas fa-file-pen"></i> Test Scores &amp; Marks</h1>
                        <p class="tts-header-subtitle">Assign tests for any date (past, today, future), record scores with quick enter auto-advance, and sync directly with students.</p>
                    </div>
                    <div class="tts-header-actions">
                        <button type="button" class="tts-btn-secondary" id="ttsToggleHistoryBtn">
                            <i class="fas fa-history"></i> Test Records
                        </button>
                        <button type="button" class="tts-btn-primary" id="ttsNewTestBtn">
                            <i class="fas fa-plus"></i> Assign New Test
                        </button>
                    </div>
                </div>

                <!-- Stats Bar -->
                <div class="tts-stats-row">
                    <div class="tts-stat-chip">
                        <div class="tts-stat-icon blue"><i class="fas fa-clipboard-list"></i></div>
                        <div>
                            <div class="tts-stat-val" id="ttsStatTotal">0</div>
                            <div class="tts-stat-lbl">Total Tests</div>
                        </div>
                    </div>
                    <div class="tts-stat-chip">
                        <div class="tts-stat-icon green"><i class="fas fa-calendar-check"></i></div>
                        <div>
                            <div class="tts-stat-val" id="ttsStatScored">0</div>
                            <div class="tts-stat-lbl">Scored</div>
                        </div>
                    </div>
                    <div class="tts-stat-chip">
                        <div class="tts-stat-icon purple"><i class="fas fa-clock"></i></div>
                        <div>
                            <div class="tts-stat-val" id="ttsStatUpcoming">0</div>
                            <div class="tts-stat-lbl">Upcoming</div>
                        </div>
                    </div>
                    <div class="tts-stat-chip">
                        <div class="tts-stat-icon amber"><i class="fas fa-users"></i></div>
                        <div>
                            <div class="tts-stat-val" id="ttsStatStudents">0</div>
                            <div class="tts-stat-lbl">Students</div>
                        </div>
                    </div>
                </div>

                <!-- View 1: Test Editor / Scorer Workspace -->
                <div id="ttsEditorView">
                    <div class="tts-card">
                        <!-- Draft notice banner (hidden by default) -->
                        <div id="ttsDraftBanner" class="tts-draft-banner" style="display:none;">
                            <span><i class="fas fa-floppy-disk"></i> Restored unsaved draft scores on this device.</span>
                            <button type="button" class="tts-draft-btn-clear" id="ttsClearDraftBtn">Discard Draft</button>
                        </div>

                        <!-- Test Configuration -->
                        <div class="tts-config-grid">
                            <div class="tts-field-group">
                                <label><i class="fas fa-chalkboard"></i> Class &amp; Section</label>
                                <select id="ttsClassSelect">
                                    <option value="">Select Class & Section...</option>
                                </select>
                            </div>

                            <div class="tts-field-group" id="ttsSubjectGroup">
                                <label><i class="fas fa-book"></i> Subject</label>
                                <select id="ttsSubjectSelect">
                                    <option value="">Select Subject...</option>
                                </select>
                            </div>

                            <div class="tts-field-group">
                                <label><i class="fas fa-calendar-day"></i> Test Date</label>
                                <input type="date" id="ttsTestDateInput">
                                <div id="ttsDateNotice" class="tts-date-badge today"><i class="fas fa-info-circle"></i> Today</div>
                            </div>

                            <div class="tts-field-group">
                                <label><i class="fas fa-award"></i> Total Marks</label>
                                <input type="number" id="ttsTotalMarksInput" min="1" max="1000" value="50" placeholder="e.g. 20, 50, 100">
                            </div>

                            <div class="tts-field-group" style="grid-column: 1 / -1;">
                                <label><i class="fas fa-heading"></i> Test Title / Assessment Name</label>
                                <input type="text" id="ttsTestTitleInput" placeholder="e.g. Unit Test 1 - Algebra & Equations">
                            </div>
                        </div>

                        <!-- Student Roster for Entering Marks -->
                        <div class="tts-roster-header">
                            <div class="tts-roster-title">
                                <i class="fas fa-user-graduate"></i> Student Roster (Sorted by Roll Number)
                            </div>
                            <div class="tts-roster-count" id="ttsRosterCount">0 Students</div>
                        </div>

                        <!-- Tip banner for mobile keyboard -->
                        <div style="font-size:0.73rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-keyboard" style="color:#0284c7;"></i>
                            <span>Enter marks and tap <strong>Next</strong> on mobile keyboard (or press <strong>Enter</strong>) to auto-jump to next student.</span>
                        </div>

                        <!-- Students List Container -->
                        <div id="ttsStudentsList" class="tts-student-list">
                            <div style="text-align:center; padding:32px 16px; color:#64748b;">
                                <i class="fas fa-chalkboard-user" style="font-size:1.8rem; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
                                <p style="margin:0; font-weight:600;">Please select a class &amp; section above to load students.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- View 2: Test Records / History View (Hidden by default) -->
                <div id="ttsHistoryView" style="display:none;">
                    <div class="tts-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:8px; flex-wrap:wrap;">
                            <div style="font-size:0.95rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-layer-group"></i> All Created Tests &amp; Assessments
                            </div>
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="tts-btn-secondary" id="ttsFilterAllTests" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;">All</button>
                                <button type="button" class="tts-btn-secondary" id="ttsFilterUpcomingTests">Upcoming</button>
                                <button type="button" class="tts-btn-secondary" id="ttsFilterPastTests">Scored</button>
                            </div>
                        </div>

                        <div id="ttsHistoryGrid" class="tts-history-grid">
                            <div style="text-align:center; padding:32px; color:#64748b; grid-column:1/-1;">
                                <i class="fas fa-spinner fa-spin" style="font-size:1.4rem; color:#0284c7;"></i>
                                <p style="margin-top:8px;">Loading tests history...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sticky Bottom Action Bar for Mobile and Desktop -->
            <div id="ttsBottomBar" class="tts-bottom-bar" style="display:none;">
                <div class="tts-bottom-summary">
                    <span id="ttsBottomScoreSummary">0 / 0 Entered</span>
                    <span class="tts-bottom-progress" id="ttsBottomStatusText">Unsaved changes auto-saved to device</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="tts-btn-primary" id="ttsSubmitBtn" style="padding:10px 20px;">
                        <i class="fas fa-cloud-arrow-up"></i> Submit &amp; Save Scores
                    </button>
                </div>
            </div>
        `;

        container.appendChild(panel);

        // Sidebar click handler & sync with section-fix
        nav.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.switchTeacherSection === 'function') {
                window.switchTeacherSection('test-scores');
            } else {
                document.querySelectorAll('.main-content .section-container').forEach(s => {
                    s.classList.remove('active');
                    s.style.display = 'none';
                });
                panel.classList.add('active');
                panel.style.display = 'block';
                sidebar.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                nav.classList.add('active');
            }
            updateBottomBarVisibility();
        });

        // App state
        let currentTeacher = null;
        let schoolId = '';
        let myClassesMap = new Map(); // key -> { classId, className, section, year, subjects: Set }
        let teacherAllSubjects = new Set();
        let currentStudents = [];
        let testsList = [];
        let activeEditingTestId = null; // null if creating a new test
        let historyFilter = 'all';

        const db = firebase.database();

        function normSec(sec) {
            return String(sec || '').trim().replace(/^section\s+/i, '').toUpperCase();
        }

        function safeKey(str) {
            return String(str || '').replace(/[.#$\[\]/]/g, '_').trim();
        }

        function getTodayStr() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        // Initialize Date Input with Today
        const dateInput = panel.querySelector('#ttsTestDateInput');
        dateInput.value = getTodayStr();

        function updateDateNotice(val) {
            const notice = panel.querySelector('#ttsDateNotice');
            if (!notice) return;
            const today = getTodayStr();
            if (!val || val === today) {
                notice.className = 'tts-date-badge today';
                notice.innerHTML = '<i class="fas fa-check-circle"></i> Today';
            } else if (val > today) {
                notice.className = 'tts-date-badge future';
                notice.innerHTML = '<i class="fas fa-clock"></i> Future Scheduled Test';
            } else {
                notice.className = 'tts-date-badge past';
                notice.innerHTML = '<i class="fas fa-history"></i> Past Test';
            }
        }
        dateInput.addEventListener('change', () => {
            updateDateNotice(dateInput.value);
            scheduleAutoDraftSave();
        });

        // Toggle Views: Editor vs History
        const editorView = panel.querySelector('#ttsEditorView');
        const historyView = panel.querySelector('#ttsHistoryView');
        const toggleHistoryBtn = panel.querySelector('#ttsToggleHistoryBtn');
        const newTestBtn = panel.querySelector('#ttsNewTestBtn');
        const bottomBar = panel.querySelector('#ttsBottomBar');

        function showEditorView() {
            editorView.style.display = 'block';
            historyView.style.display = 'none';
            toggleHistoryBtn.innerHTML = '<i class="fas fa-history"></i> Test Records';
            updateBottomBarVisibility();
        }

        function showHistoryView() {
            editorView.style.display = 'none';
            historyView.style.display = 'block';
            toggleHistoryBtn.innerHTML = '<i class="fas fa-pen-to-square"></i> Back to Editor';
            bottomBar.style.display = 'none';
            renderHistoryView();
        }

        toggleHistoryBtn.addEventListener('click', () => {
            if (historyView.style.display === 'none') {
                showHistoryView();
            } else {
                showEditorView();
            }
        });

        newTestBtn.addEventListener('click', () => {
            resetEditorForm();
            showEditorView();
        });

        function updateBottomBarVisibility() {
            if (panel.classList.contains('active') && editorView.style.display !== 'none' && currentStudents.length > 0) {
                bottomBar.style.display = 'flex';
            } else {
                bottomBar.style.display = 'none';
            }
        }

        // Teacher Resolution and Class Loading
        async function loadTeacherClasses(user, profile) {
            schoolId = profile.schoolId || '';
            if (!schoolId) return;

            myClassesMap.clear();
            teacherAllSubjects.clear();

            if (profile.subject) teacherAllSubjects.add(profile.subject.trim());
            if (profile.department) teacherAllSubjects.add(profile.department.trim());
            if (Array.isArray(profile.subjectsTaught)) {
                profile.subjectsTaught.forEach(s => s && teacherAllSubjects.add(s.trim()));
            }

            try {
                const [
                    coursesSnap,
                    schoolClassesSnap,
                    subjAssignSnap,
                    classTeacherSnap,
                    timetablesSnap
                ] = await Promise.all([
                    db.ref(`schoolCourses/${schoolId}`).once('value'),
                    db.ref(`schoolClasses/${schoolId}`).once('value'),
                    db.ref(`subjectTeacherAssignments/${schoolId}`).once('value'),
                    db.ref(`classTeacherAssignmentsByClass/${schoolId}`).once('value'),
                    db.ref(`schoolTimetables/${schoolId}`).once('value')
                ]);

                const courses = coursesSnap.val() || {};
                const subjAssignments = subjAssignSnap.val() || {};
                const ctAssignments = classTeacherSnap.val() || {};
                const timetables = timetablesSnap.val() || {};

                // 1. Subject Teacher Assignments
                Object.entries(subjAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, subjects]) => {
                        Object.entries(subjects || {}).forEach(([subKey, item]) => {
                            if (item?.teacherId === user.uid || item?.teacherEmail === user.email) {
                                const className = item.className || courses[clsId]?.courseName || 'Class';
                                const section = normSec(item.section || secKey);
                                const key = `${clsId}_${section}`;
                                if (!myClassesMap.has(key)) {
                                    myClassesMap.set(key, {
                                        classId: clsId,
                                        className,
                                        section,
                                        subjects: new Set()
                                    });
                                }
                                const sub = item.subjectName || item.subject || subKey;
                                if (sub) {
                                    myClassesMap.get(key).subjects.add(sub.trim());
                                    teacherAllSubjects.add(sub.trim());
                                }
                            }
                        });
                    });
                });

                // 2. Class Teacher Assignments
                Object.entries(ctAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, item]) => {
                        if (item?.teacherId === user.uid) {
                            const className = item.className || courses[clsId]?.courseName || 'Class';
                            const section = normSec(item.section || secKey);
                            const key = `${clsId}_${section}`;
                            if (!myClassesMap.has(key)) {
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className,
                                    section,
                                    subjects: new Set()
                                });
                            }
                        }
                    });
                });

                // 3. Timetables
                Object.entries(timetables).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, schedule]) => {
                        const sec = normSec(schedule.section || secKey);
                        const key = `${clsId}_${sec}`;
                        Object.values(schedule?.slots || {}).forEach(periods => {
                            if (Array.isArray(periods)) {
                                periods.forEach(p => {
                                    if (p?.teacherId === user.uid || p?.teacherName === (profile.name || user.displayName)) {
                                        if (!myClassesMap.has(key)) {
                                            myClassesMap.set(key, {
                                                classId: clsId,
                                                className: courses[clsId]?.courseName || 'Class',
                                                section: sec,
                                                subjects: new Set()
                                            });
                                        }
                                        if (p.subject) {
                                            myClassesMap.get(key).subjects.add(p.subject.trim());
                                            teacherAllSubjects.add(p.subject.trim());
                                        }
                                    }
                                });
                            }
                        });
                    });
                });

                // Fallback to profile.assignedSections or classTeacherSections if empty
                if (myClassesMap.size === 0) {
                    const assignedSecs = profile.assignedSections || profile.classTeacherSections || [];
                    (Array.isArray(assignedSecs) ? assignedSecs : [assignedSecs]).forEach(sec => {
                        if (sec) {
                            const s = normSec(sec);
                            const key = `class_${s}`;
                            myClassesMap.set(key, {
                                classId: profile.classId || 'default',
                                className: profile.className || 'Assigned Class',
                                section: s,
                                subjects: new Set(teacherAllSubjects)
                            });
                        }
                    });
                }

                populateClassDropdown();
            } catch (err) {
                console.error('Error loading teacher classes for test scores:', err);
            }
        }

        function populateClassDropdown() {
            const select = panel.querySelector('#ttsClassSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Select Class & Section...</option>';

            const sortedClasses = Array.from(myClassesMap.values()).sort((a, b) => {
                return a.className.localeCompare(b.className) || a.section.localeCompare(b.section);
            });

            sortedClasses.forEach(item => {
                const opt = document.createElement('option');
                opt.value = `${item.classId}:::${item.section}`;
                opt.textContent = `${item.className} - Sec ${item.section}`;
                select.appendChild(opt);
            });

            // Update stats
            panel.querySelector('#ttsStatStudents').textContent = myClassesMap.size > 0 ? `${myClassesMap.size} Cls` : '0';
        }

        // When Class/Section changes, update Subject dropdown and load students
        const classSelect = panel.querySelector('#ttsClassSelect');
        const subjectSelect = panel.querySelector('#ttsSubjectSelect');
        const totalMarksInput = panel.querySelector('#ttsTotalMarksInput');
        const testTitleInput = panel.querySelector('#ttsTestTitleInput');

        classSelect.addEventListener('change', async () => {
            const val = classSelect.value;
            if (!val) {
                currentStudents = [];
                renderStudentsRoster([]);
                updateBottomBarVisibility();
                return;
            }

            const [classId, section] = val.split(':::');
            const key = `${classId}_${normSec(section)}`;
            const clsData = myClassesMap.get(key);

            // Populate subjects
            populateSubjectDropdown(clsData);

            // Load students
            await loadStudentsForClass(classId, section, clsData?.className);

            // Check device draft
            checkForLocalDraft();
        });

        function populateSubjectDropdown(clsData) {
            subjectSelect.innerHTML = '';

            const subjects = new Set();
            if (clsData?.subjects?.size > 0) {
                clsData.subjects.forEach(s => subjects.add(s));
            }
            teacherAllSubjects.forEach(s => subjects.add(s));

            if (subjects.size === 0) {
                subjects.add('General Assessment');
            }

            subjects.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub;
                opt.textContent = sub;
                subjectSelect.appendChild(opt);
            });

            scheduleAutoDraftSave();
        }

        subjectSelect.addEventListener('change', () => {
            checkForLocalDraft();
            scheduleAutoDraftSave();
        });
        totalMarksInput.addEventListener('input', () => {
            updateTotalMarksLabels();
            scheduleAutoDraftSave();
        });
        testTitleInput.addEventListener('input', () => {
            scheduleAutoDraftSave();
        });

        function updateTotalMarksLabels() {
            const max = parseFloat(totalMarksInput.value) || 50;
            panel.querySelectorAll('.tts-outof-lbl').forEach(lbl => {
                lbl.textContent = `/ ${max}`;
            });
            panel.querySelectorAll('.student-score-input').forEach(inp => {
                inp.max = max;
                inp.placeholder = `0-${max}`;
                updateStudentScoreBadge(inp);
            });
            updateSummaryCounters();
        }

        // Student Loading & Numerical Roll Sorting
        async function loadStudentsForClass(classId, section, className) {
            if (!schoolId) return;

            const rosterCount = panel.querySelector('#ttsRosterCount');
            const listEl = panel.querySelector('#ttsStudentsList');
            listEl.innerHTML = `
                <div style="text-align:center; padding:28px; color:#64748b;">
                    <i class="fas fa-spinner fa-spin" style="font-size:1.4rem; color:#0284c7;"></i>
                    <p style="margin-top:8px; font-size:0.84rem;">Loading students sorted by roll number...</p>
                </div>
            `;

            let students = [];
            const snap = await db.ref(`schoolUsers/${schoolId}`).once('value');
            if (snap.exists()) {
                snap.forEach(child => {
                    const st = child.val() || {};
                    st.id = child.key;
                    if (st.role && st.role !== 'student') return;
                    if (isStudentInClass(st, classId, section, className)) {
                        students.push(st);
                    }
                });
            }

            if (students.length === 0) {
                const uSnap = await db.ref('users').orderByChild('schoolId').equalTo(schoolId).once('value');
                if (uSnap.exists()) {
                    uSnap.forEach(child => {
                        const st = child.val() || {};
                        st.id = child.key;
                        if (st.role && st.role !== 'student') return;
                        if (isStudentInClass(st, classId, section, className)) {
                            students.push(st);
                        }
                    });
                }
            }

            // Strictly sort Roll Numbers numerically: 1, 2, 3... 10...
            students.sort((a, b) => {
                const rollA = parseInt(a.classRoll || a.univRoll || a.rollNo || a.rollNumber, 10);
                const rollB = parseInt(b.classRoll || b.univRoll || b.rollNo || b.rollNumber, 10);
                if (!isNaN(rollA) && !isNaN(rollB)) return rollA - rollB;
                if (!isNaN(rollA)) return -1;
                if (!isNaN(rollB)) return 1;
                return String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''));
            });

            currentStudents = students;
            rosterCount.textContent = `${students.length} Students`;
            renderStudentsRoster(students);
            updateBottomBarVisibility();
        }

        function isStudentInClass(st, classId, section, className) {
            if (!st) return false;
            const targetSec = normSec(section);
            const stSec = normSec(st.section || st.classSection || st.assignedSection);
            if (targetSec && stSec && targetSec !== 'ALL' && targetSec !== stSec) {
                return false;
            }

            const stClassId = String(st.classId || st.enrolledClassId || st.courseId || '').toLowerCase().trim();
            const targetClassId = String(classId || '').toLowerCase().trim();
            if (stClassId && targetClassId && stClassId === targetClassId) return true;

            const stNames = [st.className, st.courseName, st.course, st.class].filter(Boolean).map(x => String(x).toLowerCase().trim());
            const targetName = String(className || '').toLowerCase().trim();

            if (targetName && stNames.length > 0) {
                if (stNames.some(name => name === targetName || name.includes(targetName) || targetName.includes(name))) {
                    return true;
                }
            }

            if (targetSec && stSec && targetSec === stSec) return true;
            return false;
        }

        // Render Student Roster with Minimized UI & Enter-Key Auto-Advance
        function renderStudentsRoster(students) {
            const listEl = panel.querySelector('#ttsStudentsList');
            if (students.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center; padding:32px 16px; color:#64748b;">
                        <i class="fas fa-user-slash" style="font-size:1.8rem; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
                        <p style="margin:0; font-weight:600;">No students found enrolled in this class and section.</p>
                    </div>
                `;
                return;
            }

            const maxMarks = parseFloat(totalMarksInput.value) || 50;

            let html = '';
            students.forEach((st, idx) => {
                const roll = st.classRoll || st.univRoll || st.rollNo || (idx + 1);
                const name = st.name || st.displayName || 'Student';
                html += `
                    <div class="tts-student-row" id="ttsRow_${st.id}" data-uid="${st.id}">
                        <div class="tts-student-meta">
                            <span class="tts-roll-badge">#${roll}</span>
                            <span class="tts-student-name" title="${name}">${name}</span>
                        </div>
                        <div class="tts-score-inputs-wrap">
                            <span class="tts-pct-badge" id="ttsPct_${st.id}">--</span>
                            <input type="number" 
                                   class="student-score-input tts-score-input-box" 
                                   id="ttsScoreInp_${st.id}"
                                   data-uid="${st.id}" 
                                   data-index="${idx}" 
                                   min="0" 
                                   max="${maxMarks}" 
                                   step="any" 
                                   inputmode="decimal" 
                                   enterkeyhint="next" 
                                   placeholder="0-${maxMarks}">
                            <span class="tts-outof-lbl">/ ${maxMarks}</span>
                            <button type="button" class="tts-ab-btn" data-uid="${st.id}" id="ttsAbBtn_${st.id}" title="Toggle Absent">AB</button>
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;

            // Attach Mobile Keyboard Enter / Next Auto-Advance Listeners
            const inputs = listEl.querySelectorAll('.student-score-input');
            inputs.forEach((inp, idx) => {
                // Keydown listener for Enter / Next key
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const nextInput = listEl.querySelector(`.student-score-input[data-index="${idx + 1}"]`);
                        if (nextInput) {
                            nextInput.focus();
                            nextInput.select();
                        } else {
                            // Last student, blur to close keyboard or focus submit
                            inp.blur();
                            panel.querySelector('#ttsSubmitBtn')?.focus();
                        }
                    }
                });

                // Input listener for live feedback & auto caching
                inp.addEventListener('input', () => {
                    // Validate max bounds
                    const max = parseFloat(totalMarksInput.value) || 100;
                    const val = parseFloat(inp.value);
                    if (!isNaN(val) && val > max) {
                        inp.value = max;
                    }
                    if (!isNaN(val) && val < 0) {
                        inp.value = 0;
                    }
                    updateStudentScoreBadge(inp);
                    updateSummaryCounters();
                    scheduleAutoDraftSave();
                });
            });

            // Attach Absent (AB) toggles
            listEl.querySelectorAll('.tts-ab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const uid = btn.dataset.uid;
                    const inp = listEl.querySelector(`#ttsScoreInp_${uid}`);
                    const row = listEl.querySelector(`#ttsRow_${uid}`);
                    const isNowAbsent = !btn.classList.contains('active');

                    btn.classList.toggle('active', isNowAbsent);
                    row.classList.toggle('is-absent', isNowAbsent);

                    if (isNowAbsent) {
                        inp.value = '';
                        inp.disabled = true;
                    } else {
                        inp.disabled = false;
                        inp.focus();
                    }

                    updateStudentScoreBadge(inp);
                    updateSummaryCounters();
                    scheduleAutoDraftSave();
                });
            });

            updateSummaryCounters();
        }

        function updateStudentScoreBadge(inp) {
            const uid = inp.dataset.uid;
            const badge = panel.querySelector(`#ttsPct_${uid}`);
            const abBtn = panel.querySelector(`#ttsAbBtn_${uid}`);
            const row = panel.querySelector(`#ttsRow_${uid}`);
            if (!badge) return;

            if (abBtn && abBtn.classList.contains('active')) {
                badge.className = 'tts-pct-badge absent';
                badge.textContent = 'AB';
                row?.classList.remove('has-score');
                return;
            }

            const val = parseFloat(inp.value);
            const max = parseFloat(totalMarksInput.value) || 50;

            if (isNaN(val) || inp.value.trim() === '') {
                badge.className = 'tts-pct-badge';
                badge.textContent = '--';
                row?.classList.remove('has-score');
                return;
            }

            row?.classList.add('has-score');
            const pct = Math.round((val / max) * 100);

            if (pct >= 75) {
                badge.className = 'tts-pct-badge excellent';
                badge.textContent = `${pct}%`;
            } else if (pct >= 40) {
                badge.className = 'tts-pct-badge average';
                badge.textContent = `${pct}%`;
            } else {
                badge.className = 'tts-pct-badge low';
                badge.textContent = `${pct}%`;
            }
        }

        function updateSummaryCounters() {
            let entered = 0;
            let absent = 0;
            currentStudents.forEach(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                if (abBtn && abBtn.classList.contains('active')) {
                    absent++;
                    entered++;
                } else if (inp && inp.value.trim() !== '' && !isNaN(parseFloat(inp.value))) {
                    entered++;
                }
            });

            const total = currentStudents.length;
            const summaryText = panel.querySelector('#ttsBottomScoreSummary');
            if (summaryText) {
                summaryText.innerHTML = `<strong>${entered} of ${total} Scored</strong> (${absent} Absent)`;
            }
        }

        // ======================================================================
        // Device Local Caching (Auto-Restore & Draft Save)
        // ======================================================================
        let draftSaveTimer = null;

        function getDraftStorageKey() {
            const classVal = classSelect.value || 'none';
            const subject = subjectSelect.value || 'default';
            const testId = activeEditingTestId || 'new';
            return `rollapp_tts_draft_${schoolId}_${safeKey(classVal)}_${safeKey(subject)}_${testId}`;
        }

        function scheduleAutoDraftSave() {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(saveDraftToLocalStorage, 300);
        }

        function saveDraftToLocalStorage() {
            if (!schoolId || currentStudents.length === 0) return;

            const draftKey = getDraftStorageKey();
            const scores = {};
            currentStudents.forEach(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                const isAbsent = abBtn?.classList.contains('active') || false;
                const marks = inp?.value.trim() || '';
                if (isAbsent || marks !== '') {
                    scores[st.id] = { marks, isAbsent };
                }
            });

            const draftData = {
                title: testTitleInput.value,
                date: dateInput.value,
                maxMarks: totalMarksInput.value,
                classVal: classSelect.value,
                subject: subjectSelect.value,
                scores: scores,
                updatedAt: Date.now()
            };

            try {
                localStorage.setItem(draftKey, JSON.stringify(draftData));
                const statusText = panel.querySelector('#ttsBottomStatusText');
                if (statusText) statusText.textContent = `Auto-saved to device at ${new Date().toLocaleTimeString()}`;
            } catch (e) {
                console.warn('LocalStorage draft save error:', e);
            }
        }

        function checkForLocalDraft() {
            if (!schoolId) return;
            const draftKey = getDraftStorageKey();
            const raw = localStorage.getItem(draftKey);
            const banner = panel.querySelector('#ttsDraftBanner');

            if (!raw) {
                if (banner) banner.style.display = 'none';
                return;
            }

            try {
                const draft = JSON.parse(raw);
                if (draft.scores && Object.keys(draft.scores).length > 0) {
                    if (draft.title && !testTitleInput.value) testTitleInput.value = draft.title;
                    if (draft.date) {
                        dateInput.value = draft.date;
                        updateDateNotice(draft.date);
                    }
                    if (draft.maxMarks) {
                        totalMarksInput.value = draft.maxMarks;
                        updateTotalMarksLabels();
                    }

                    // Pre-fill student scores
                    Object.entries(draft.scores).forEach(([uid, data]) => {
                        const inp = panel.querySelector(`#ttsScoreInp_${uid}`);
                        const abBtn = panel.querySelector(`#ttsAbBtn_${uid}`);
                        const row = panel.querySelector(`#ttsRow_${uid}`);
                        if (data.isAbsent) {
                            if (abBtn) abBtn.classList.add('active');
                            if (row) row.classList.add('is-absent');
                            if (inp) {
                                inp.value = '';
                                inp.disabled = true;
                            }
                        } else if (data.marks !== undefined && data.marks !== '') {
                            if (inp) {
                                inp.value = data.marks;
                                inp.disabled = false;
                            }
                            if (abBtn) abBtn.classList.remove('active');
                            if (row) row.classList.remove('is-absent');
                        }
                        if (inp) updateStudentScoreBadge(inp);
                    });

                    updateSummaryCounters();
                    if (banner) banner.style.display = 'flex';
                } else {
                    if (banner) banner.style.display = 'none';
                }
            } catch (e) {
                console.warn('Error reading draft:', e);
            }
        }

        panel.querySelector('#ttsClearDraftBtn')?.addEventListener('click', () => {
            const draftKey = getDraftStorageKey();
            localStorage.removeItem(draftKey);
            panel.querySelector('#ttsDraftBanner').style.display = 'none';
            // Clear inputs
            currentStudents.forEach(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                const row = panel.querySelector(`#ttsRow_${uid}`);
                if (inp) {
                    inp.value = '';
                    inp.disabled = false;
                }
                if (abBtn) abBtn.classList.remove('active');
                if (row) {
                    row.classList.remove('is-absent');
                    row.classList.remove('has-score');
                }
                if (inp) updateStudentScoreBadge(inp);
            });
            updateSummaryCounters();
        });

        function clearDeviceDraft() {
            const draftKey = getDraftStorageKey();
            localStorage.removeItem(draftKey);
            const banner = panel.querySelector('#ttsDraftBanner');
            if (banner) banner.style.display = 'none';
        }

        // ======================================================================
        // Submitting & Saving Test Scores (School-Scoped Isolation)
        // ======================================================================
        const submitBtn = panel.querySelector('#ttsSubmitBtn');
        submitBtn.addEventListener('click', handleSubmitScores);

        async function handleSubmitScores() {
            if (!schoolId || !currentTeacher) {
                alert('Teacher session not verified. Please log in again.');
                return;
            }

            const classVal = classSelect.value;
            if (!classVal) {
                alert('Please select a Class & Section first.');
                classSelect.focus();
                return;
            }

            const [classId, section] = classVal.split(':::');
            const key = `${classId}_${normSec(section)}`;
            const clsData = myClassesMap.get(key);
            const className = clsData?.className || 'Class';

            const subject = subjectSelect.value || 'General Assessment';
            const testDate = dateInput.value || getTodayStr();
            const maxMarks = parseFloat(totalMarksInput.value);
            const title = (testTitleInput.value || '').trim() || `${subject} Test (${testDate})`;

            if (isNaN(maxMarks) || maxMarks <= 0) {
                alert('Please enter a valid Total Marks number (greater than 0).');
                totalMarksInput.focus();
                return;
            }

            // Gather student scores
            const scoresMap = {};
            let scoredCount = 0;
            let invalidScore = false;

            currentStudents.forEach(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                const isAbsent = abBtn?.classList.contains('active') || false;
                const rollNo = st.classRoll || st.univRoll || st.rollNo || '';

                if (isAbsent) {
                    scoresMap[st.id] = {
                        studentUid: st.id,
                        studentName: st.name || st.displayName || 'Student',
                        rollNo: rollNo,
                        marksObtained: null,
                        maxMarks: maxMarks,
                        isAbsent: true
                    };
                    scoredCount++;
                } else if (inp && inp.value.trim() !== '') {
                    const marks = parseFloat(inp.value);
                    if (isNaN(marks) || marks < 0 || marks > maxMarks) {
                        invalidScore = true;
                        inp.style.borderColor = '#dc2626';
                    } else {
                        scoresMap[st.id] = {
                            studentUid: st.id,
                            studentName: st.name || st.displayName || 'Student',
                            rollNo: rollNo,
                            marksObtained: marks,
                            maxMarks: maxMarks,
                            isAbsent: false
                        };
                        scoredCount++;
                    }
                }
            });

            if (invalidScore) {
                alert(`Some scores are invalid or exceed total marks (${maxMarks}). Please check inputs highlighted in red.`);
                return;
            }

            // Confirm submission
            const isFuture = testDate > getTodayStr();
            const confirmMsg = isFuture
                ? `Assign this scheduled test on ${testDate} for ${className} Sec ${section}? Students will see this as an upcoming test.`
                : `Submit test scores for ${scoredCount} students (${className} Sec ${section})?`;

            if (!confirm(confirmMsg)) return;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const testId = activeEditingTestId || db.ref(`schoolTests/${schoolId}`).push().key;

                const testPayload = {
                    id: testId,
                    title: title,
                    classId: classId,
                    className: className,
                    section: normSec(section),
                    subject: subject,
                    maxMarks: maxMarks,
                    testDate: testDate,
                    teacherId: currentTeacher.uid,
                    teacherName: currentTeacher.name || currentTeacher.displayName || 'Teacher',
                    createdAt: activeEditingTestId ? (testsList.find(t => t.id === testId)?.createdAt || Date.now()) : Date.now(),
                    updatedAt: Date.now(),
                    studentCount: currentStudents.length,
                    scoredCount: scoredCount,
                    status: isFuture ? 'scheduled' : 'completed',
                    isFuture: isFuture
                };

                // 1. Write Test Meta: schoolTests/${schoolId}/${testId}
                await db.ref(`schoolTests/${schoolId}/${testId}`).set(testPayload);

                // 2. Batch update Student Scores in schoolTestScores and schoolStudentScores
                const updates = {};
                Object.entries(scoresMap).forEach(([studentUid, item]) => {
                    // Score record in test
                    updates[`schoolTestScores/${schoolId}/${testId}/${studentUid}`] = {
                        ...item,
                        testId: testId,
                        updatedAt: Date.now(),
                        updatedBy: currentTeacher.uid
                    };

                    // Index for student quick portal display
                    updates[`schoolStudentScores/${schoolId}/${studentUid}/${testId}`] = {
                        testId: testId,
                        title: title,
                        classId: classId,
                        className: className,
                        section: normSec(section),
                        subject: subject,
                        maxMarks: maxMarks,
                        marksObtained: item.marksObtained,
                        isAbsent: item.isAbsent,
                        testDate: testDate,
                        teacherName: testPayload.teacherName,
                        isFuture: isFuture,
                        updatedAt: Date.now()
                    };
                });

                if (Object.keys(updates).length > 0) {
                    await db.ref().update(updates);
                }

                // Clear device cache
                clearDeviceDraft();

                alert('Test and student scores successfully saved and synced!');

                // Refresh history & dashboard
                loadSchoolTests();
                showHistoryView();
            } catch (err) {
                console.error('Error submitting test scores:', err);
                alert('Failed to save test scores: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Submit &amp; Save Scores';
            }
        }

        // ======================================================================
        // Test Records & History View
        // ======================================================================
        function loadSchoolTests() {
            if (!schoolId || !currentTeacher) return;

            db.ref(`schoolTests/${schoolId}`).on('value', snapshot => {
                const data = snapshot.val() || {};
                testsList = Object.values(data).filter(t => t.teacherId === currentTeacher.uid);

                // Sort descending by testDate then createdAt
                testsList.sort((a, b) => {
                    const dateDiff = String(b.testDate || '').localeCompare(String(a.testDate || ''));
                    if (dateDiff !== 0) return dateDiff;
                    return (b.createdAt || 0) - (a.createdAt || 0);
                });

                updateTeacherStats();
                renderHistoryView();
                renderTeacherDashboardWidget();
            });
        }

        function updateTeacherStats() {
            const today = getTodayStr();
            const total = testsList.length;
            const upcoming = testsList.filter(t => (t.testDate > today) || t.status === 'scheduled').length;
            const scored = testsList.filter(t => (t.testDate <= today) && t.status !== 'scheduled').length;

            panel.querySelector('#ttsStatTotal').textContent = total;
            panel.querySelector('#ttsStatUpcoming').textContent = upcoming;
            panel.querySelector('#ttsStatScored').textContent = scored;
        }

        function renderHistoryView() {
            const grid = panel.querySelector('#ttsHistoryGrid');
            if (!grid) return;

            const today = getTodayStr();
            let filtered = testsList;
            if (historyFilter === 'upcoming') {
                filtered = testsList.filter(t => t.testDate > today || t.status === 'scheduled');
            } else if (historyFilter === 'past') {
                filtered = testsList.filter(t => t.testDate <= today && t.status !== 'scheduled');
            }

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div style="text-align:center; padding:36px; color:#64748b; grid-column:1/-1;">
                        <i class="fas fa-folder-open" style="font-size:2rem; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
                        <h4 style="margin:0 0 6px 0; color:#334155;">No tests found</h4>
                        <p style="margin:0; font-size:0.84rem;">Click "Assign New Test" to create a test for your classes.</p>
                    </div>
                `;
                return;
            }

            let html = '';
            filtered.forEach(test => {
                const isFuture = test.testDate > today || test.status === 'scheduled';
                const statusBadge = isFuture
                    ? '<span class="tts-date-badge future"><i class="fas fa-clock"></i> Upcoming</span>'
                    : '<span class="tts-date-badge today"><i class="fas fa-check-circle"></i> Completed</span>';

                html += `
                    <div class="tts-test-card" id="ttsTestCard_${test.id}">
                        <div>
                            <div class="tts-test-top">
                                <h3 class="tts-test-title">${escapeHtml(test.title)}</h3>
                                ${statusBadge}
                            </div>
                            <div class="tts-test-meta">
                                <div><i class="fas fa-chalkboard" style="color:#0284c7; width:14px;"></i> <strong>${escapeHtml(test.className)} - Sec ${escapeHtml(test.section)}</strong></div>
                                <div><i class="fas fa-book" style="color:#16a34a; width:14px;"></i> ${escapeHtml(test.subject)}</div>
                                <div><i class="fas fa-calendar" style="color:#d97706; width:14px;"></i> Date: <strong>${escapeHtml(test.testDate)}</strong></div>
                                <div><i class="fas fa-award" style="color:#9333ea; width:14px;"></i> Total: <strong>${test.maxMarks} Marks</strong></div>
                            </div>
                        </div>
                        <div class="tts-test-footer">
                            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">
                                ${test.scoredCount || 0} / ${test.studentCount || 0} Scored
                            </span>
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="tts-btn-secondary" onclick="window.editTeacherTest('${test.id}')" style="padding:4px 8px; font-size:0.75rem;">
                                    <i class="fas fa-pen-to-square"></i> Edit
                                </button>
                                <button type="button" class="tts-btn-secondary" onclick="window.deleteTeacherTest('${test.id}')" style="padding:4px 8px; font-size:0.75rem; color:#dc2626;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            grid.innerHTML = html;
        }

        // History Filters
        const fAll = panel.querySelector('#ttsFilterAllTests');
        const fUpcoming = panel.querySelector('#ttsFilterUpcomingTests');
        const fPast = panel.querySelector('#ttsFilterPastTests');

        function setHistoryFilter(f, btn) {
            historyFilter = f;
            [fAll, fUpcoming, fPast].forEach(b => {
                b.style.background = '#ffffff';
                b.style.color = '#334155';
                b.style.borderColor = '#cbd5e1';
            });
            btn.style.background = '#e0f2fe';
            btn.style.color = '#0369a1';
            btn.style.borderColor = '#bae6fd';
            renderHistoryView();
        }

        fAll.addEventListener('click', () => setHistoryFilter('all', fAll));
        fUpcoming.addEventListener('click', () => setHistoryFilter('upcoming', fUpcoming));
        fPast.addEventListener('click', () => setHistoryFilter('past', fPast));

        // Edit Test Handler
        window.editTeacherTest = async function(testId) {
            const test = testsList.find(t => t.id === testId);
            if (!test) return;

            activeEditingTestId = test.id;
            testTitleInput.value = test.title || '';
            dateInput.value = test.testDate || getTodayStr();
            updateDateNotice(dateInput.value);
            totalMarksInput.value = test.maxMarks || 50;

            // Select Class
            const classVal = `${test.classId}:::${test.section}`;
            classSelect.value = classVal;

            const key = `${test.classId}_${normSec(test.section)}`;
            const clsData = myClassesMap.get(key);
            populateSubjectDropdown(clsData);
            if (test.subject) subjectSelect.value = test.subject;

            // Load students
            await loadStudentsForClass(test.classId, test.section, test.className);

            // Fetch saved scores from Firebase: schoolTestScores/${schoolId}/${testId}
            const snap = await db.ref(`schoolTestScores/${schoolId}/${testId}`).once('value');
            if (snap.exists()) {
                const scores = snap.val() || {};
                Object.entries(scores).forEach(([uid, data]) => {
                    const inp = panel.querySelector(`#ttsScoreInp_${uid}`);
                    const abBtn = panel.querySelector(`#ttsAbBtn_${uid}`);
                    const row = panel.querySelector(`#ttsRow_${uid}`);
                    if (data.isAbsent) {
                        if (abBtn) abBtn.classList.add('active');
                        if (row) row.classList.add('is-absent');
                        if (inp) {
                            inp.value = '';
                            inp.disabled = true;
                        }
                    } else if (data.marksObtained !== null && data.marksObtained !== undefined) {
                        if (inp) {
                            inp.value = data.marksObtained;
                            inp.disabled = false;
                        }
                        if (abBtn) abBtn.classList.remove('active');
                        if (row) row.classList.remove('is-absent');
                    }
                    if (inp) updateStudentScoreBadge(inp);
                });
                updateSummaryCounters();
            }

            showEditorView();
        };

        // Delete Test Handler
        window.deleteTeacherTest = async function(testId) {
            const test = testsList.find(t => t.id === testId);
            if (!test) return;
            if (!confirm(`Are you sure you want to delete test "${test.title}"? This will remove all student scores recorded for this test.`)) {
                return;
            }

            try {
                // Delete from schoolTests
                await db.ref(`schoolTests/${schoolId}/${testId}`).remove();

                // Delete from schoolTestScores
                const scoresSnap = await db.ref(`schoolTestScores/${schoolId}/${testId}`).once('value');
                if (scoresSnap.exists()) {
                    const studentsUids = Object.keys(scoresSnap.val() || {});
                    const delUpdates = {};
                    studentsUids.forEach(uid => {
                        delUpdates[`schoolStudentScores/${schoolId}/${uid}/${testId}`] = null;
                    });
                    delUpdates[`schoolTestScores/${schoolId}/${testId}`] = null;
                    await db.ref().update(delUpdates);
                }

                alert('Test deleted successfully.');
            } catch (err) {
                console.error('Error deleting test:', err);
                alert('Failed to delete test: ' + err.message);
            }
        };

        function resetEditorForm() {
            activeEditingTestId = null;
            testTitleInput.value = '';
            dateInput.value = getTodayStr();
            updateDateNotice(dateInput.value);
            totalMarksInput.value = '50';
            currentStudents = [];
            renderStudentsRoster([]);
            updateBottomBarVisibility();
        }

        // ======================================================================
        // Dashboard Integration: Show Upcoming Tests in Teacher Dashboard
        // ======================================================================
        function renderTeacherDashboardWidget() {
            const dashboard = document.getElementById('dashboardSection');
            if (!dashboard) return;

            let widget = document.getElementById('ttsTeacherDashboardWidget');
            if (!widget) {
                widget = document.createElement('div');
                widget.id = 'ttsTeacherDashboardWidget';
                widget.className = 'tts-dashboard-tests-box';
                widget.style.cssText = 'background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px 20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.03);';
                
                // Insert before upcoming-classes or recent-activity
                const target = dashboard.querySelector('.upcoming-classes') || dashboard.querySelector('.recent-activity');
                if (target) {
                    dashboard.insertBefore(widget, target);
                } else {
                    dashboard.appendChild(widget);
                }
            }

            const today = getTodayStr();
            const upcomingTests = testsList.filter(t => t.testDate >= today);

            widget.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                    <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-pen" style="color:#0284c7;"></i> Scheduled &amp; Upcoming Tests
                    </h3>
                    <button type="button" class="tts-btn-secondary" style="font-size:0.75rem; padding:4px 10px;" onclick="window.switchTeacherSection('test-scores')">
                        Open Portal <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
                ${upcomingTests.length === 0 ? `
                    <div style="text-align:center; padding:18px; color:#64748b; font-size:0.84rem;">
                        <i class="fas fa-calendar-check" style="color:#94a3b8; font-size:1.3rem; margin-bottom:6px; display:block;"></i>
                        No tests scheduled for today or future dates. Click "Open Portal" to assign a test.
                    </div>
                ` : `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${upcomingTests.slice(0, 4).map(t => `
                            <div style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px;">
                                <div>
                                    <div style="font-size:0.86rem; font-weight:700; color:#1e293b;">${escapeHtml(t.title)}</div>
                                    <div style="font-size:0.75rem; color:#64748b;">
                                        <i class="fas fa-chalkboard"></i> ${escapeHtml(t.className)} - Sec ${escapeHtml(t.section)} • <i class="fas fa-book"></i> ${escapeHtml(t.subject)}
                                    </div>
                                </div>
                                <div style="text-align:right;">
                                    <span class="tts-date-badge ${t.testDate > today ? 'future' : 'today'}">${t.testDate === today ? 'Today' : t.testDate}</span>
                                    <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">Total: ${t.maxMarks} Marks</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            `;
        }

        function escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // Listen for Auth changes
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                currentTeacher = null;
                return;
            }

            try {
                // Fetch teacher record
                const [uSnap, schSnap] = await Promise.all([
                    db.ref(`users/${user.uid}`).once('value'),
                    db.ref(`teachers/${user.uid}`).once('value')
                ]);

                const profile = { ...(uSnap.val() || {}), ...(schSnap.val() || {}) };
                currentTeacher = {
                    uid: user.uid,
                    email: user.email,
                    name: profile.name || user.displayName || 'Teacher',
                    ...profile
                };

                await loadTeacherClasses(user, profile);
                loadSchoolTests();
            } catch (e) {
                console.error('Error fetching teacher data in test scores module:', e);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTeacherTestScores);
    } else {
        initializeTeacherTestScores();
    }
})();
