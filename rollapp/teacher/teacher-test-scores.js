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
            nav.innerHTML = '<i class="fas fa-clipboard-list"></i><span>Test Scores</span>';
        } else {
            nav = document.createElement('div');
            nav.className = 'menu-item';
            nav.dataset.section = 'test-scores';
            nav.innerHTML = '<i class="fas fa-clipboard-list"></i><span>Test Scores</span>';

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
            #testScoresSection {
                width: 100%;
                box-sizing: border-box;
            }
            #testScoresSection button {
                width: auto !important;
                box-sizing: border-box;
            }

            .tts-shell {
                max-width: 100%;
                width: 100%;
                margin: 0;
                color: #0f172a;
                padding: 0 0 95px;
                box-sizing: border-box;
                font-family: inherit;
            }

            /* Header Section */
            .tts-header-card {
                background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 20px 24px;
                margin: 0 0 16px;
                box-shadow: 0 3px 12px rgba(15, 23, 42, 0.04);
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                position: relative;
                overflow: hidden;
            }
            .tts-header-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 5px;
                height: 100%;
                background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%);
            }
            .tts-header-left {
                flex: 1;
                min-width: 240px;
            }
            .tts-header-kicker {
                font-size: 0.72rem;
                font-weight: 800;
                color: #0284c7;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .tts-header-title {
                font-size: 1.40rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 4px 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tts-header-subtitle {
                margin: 0;
                color: #64748b;
                font-size: 0.85rem;
                line-height: 1.45;
            }
            .tts-header-actions {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                align-items: center;
            }
            .tts-header-actions button,
            .tts-header-actions #teacherCbtStudio {
                width: auto !important;
                flex: 0 0 auto;
            }

            /* Buttons */
            .tts-btn-primary {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 9px 18px;
                border: none;
                border-radius: 9px;
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                color: #ffffff;
                font-size: 0.84rem;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(2, 132, 199, 0.28);
                transition: all 0.15s ease;
                white-space: nowrap;
                min-height: 40px;
                width: auto !important;
                box-sizing: border-box;
            }
            .tts-btn-primary:hover {
                background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
            }
            .tts-btn-secondary {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 14px;
                border: 1.5px solid #cbd5e1;
                background: #ffffff;
                color: #334155;
                border-radius: 9px;
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
                min-height: 40px;
                width: auto !important;
                box-sizing: border-box;
            }
            .tts-btn-secondary:hover {
                background: #f1f5f9;
                border-color: #94a3b8;
                color: #0f172a;
            }

            /* Top Segmented Navigation Tabs */
            .tts-nav-tabs {
                display: flex;
                gap: 6px;
                padding: 5px;
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                margin-bottom: 16px;
            }
            .tts-nav-tab {
                flex: 1;
                min-height: 44px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 14px;
                border: none;
                border-radius: 9px;
                background: transparent;
                color: #64748b;
                font-size: 0.84rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .tts-nav-tab:hover {
                background: rgba(255, 255, 255, 0.6);
                color: #0f172a;
            }
            .tts-nav-tab.active {
                background: #ffffff;
                color: #0284c7;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            }
            .tts-tab-pill {
                font-size: 0.68rem;
                font-weight: 800;
                padding: 2px 7px;
                border-radius: 999px;
                background: #e0f2fe;
                color: #0369a1;
                border: 1px solid #bae6fd;
            }
            .tts-tab-pill.count {
                background: #f1f5f9;
                color: #475569;
                border-color: #cbd5e1;
            }

            /* Stats Bar */
            .tts-stats-row {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
                margin-bottom: 16px;
            }
            .tts-stat-chip {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 12px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.02);
                transition: transform 0.15s ease;
            }
            .tts-stat-chip:hover {
                transform: translateY(-1px);
            }
            .tts-stat-icon {
                width: 36px;
                height: 36px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.95rem;
                flex-shrink: 0;
            }
            .tts-stat-icon.blue { background: #e0f2fe; color: #0284c7; }
            .tts-stat-icon.green { background: #dcfce7; color: #16a34a; }
            .tts-stat-icon.amber { background: #fef3c7; color: #d97706; }
            .tts-stat-icon.purple { background: #f3e8ff; color: #9333ea; }
            .tts-stat-val {
                font-size: 1.25rem;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.1;
            }
            .tts-stat-lbl {
                font-size: 0.70rem;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-top: 2px;
            }

            /* Workspace Intro Cards */
            .tts-workspace-intro {
                display: grid;
                grid-template-columns: 1.3fr 1fr;
                gap: 12px;
                margin-bottom: 16px;
            }
            .tts-intro-card {
                border: 1px solid #dbeafe;
                border-radius: 14px;
                padding: 14px 16px;
                background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .tts-intro-card.cbt {
                border-color: #ddd6fe;
                background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%);
            }
            .tts-intro-icon {
                width: 40px;
                height: 40px;
                border-radius: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #dbeafe;
                color: #2563eb;
                flex: 0 0 auto;
                font-size: 1.05rem;
            }
            .tts-intro-card.cbt .tts-intro-icon { background: #ede9fe; color: #7c3aed; }
            .tts-intro-card strong { display: block; color: #0f172a; font-size: 0.90rem; }
            .tts-intro-card span { display: block; color: #64748b; font-size: 0.76rem; margin-top: 2px; line-height: 1.35; }

            /* Main Card Container */
            .tts-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 18px 20px;
                margin-bottom: 16px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
            }

            /* Filter / Configuration Controls Grid */
            .tts-config-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
                gap: 14px;
                margin-bottom: 16px;
            }
            .tts-field-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .tts-field-group label {
                font-size: 0.73rem;
                font-weight: 700;
                color: #475569;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .tts-field-group select,
            .tts-field-group input,
            .tts-field-group textarea {
                padding: 9px 12px;
                border: 1.5px solid #cbd5e1;
                border-radius: 9px;
                font-size: 0.86rem;
                color: #0f172a;
                background: #f8fafc;
                transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
                width: 100%;
                box-sizing: border-box;
                font-family: inherit;
            }
            .tts-field-group select:focus,
            .tts-field-group input:focus,
            .tts-field-group textarea:focus {
                outline: none;
                border-color: #0284c7;
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
            }

            /* Dedicated Exam Settings Card */
            .tts-exam-settings-card {
                background: #fcfdfe;
                border: 1.5px solid #bfdbfe;
                border-radius: 14px;
                padding: 16px;
                margin: 10px 0 16px;
                box-shadow: 0 2px 8px rgba(2, 132, 199, 0.04);
            }
            .tts-settings-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 10px;
                margin-bottom: 12px;
                border-bottom: 1px solid #e0f2fe;
                flex-wrap: wrap;
                gap: 8px;
            }
            .tts-settings-title {
                font-size: 0.90rem;
                font-weight: 800;
                color: #0369a1;
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .tts-settings-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 11px;
            }
            .tts-cutoff-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 0.72rem;
                font-weight: 800;
                padding: 3px 8px;
                border-radius: 6px;
                background: #dcfce7;
                color: #15803d;
                border: 1px solid #bbf7d0;
                margin-top: 4px;
                width: fit-content;
            }
            .tts-duration-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 4px;
            }
            .tts-duration-chip {
                padding: 3px 8px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                background: #ffffff;
                color: #475569;
                font-size: 0.72rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.12s ease;
            }
            .tts-duration-chip:hover {
                border-color: #0284c7;
                color: #0284c7;
                background: #f0f9ff;
            }
            .tts-duration-chip.active {
                background: #0284c7;
                border-color: #0284c7;
                color: #ffffff;
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
                border-radius: 9px;
                padding: 9px 14px;
                margin-bottom: 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                font-size: 0.80rem;
                color: #1e40af;
            }
            .tts-draft-btn-clear {
                background: none;
                border: none;
                color: #dc2626;
                font-size: 0.76rem;
                font-weight: 700;
                cursor: pointer;
                text-decoration: underline;
                padding: 0;
            }

            /* Student Roster Header & Controls */
            .tts-roster-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 10px;
                margin-bottom: 12px;
                border-bottom: 1px solid #e2e8f0;
                flex-wrap: wrap;
                gap: 10px;
            }
            .tts-roster-title {
                font-size: 0.92rem;
                font-weight: 800;
                color: #1e293b;
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .tts-roster-count {
                font-size: 0.76rem;
                color: #0369a1;
                background: #e0f2fe;
                padding: 3px 10px;
                border-radius: 999px;
                font-weight: 700;
                border: 1px solid #bae6fd;
            }

            /* Roster Search & Filter Controls */
            .tts-roster-controls {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }
            .tts-search-box {
                position: relative;
                flex: 1;
                min-width: 200px;
            }
            .tts-search-box i {
                position: absolute;
                left: 11px;
                top: 50%;
                transform: translateY(-50%);
                color: #94a3b8;
                font-size: 0.85rem;
                pointer-events: none;
            }
            .tts-search-input {
                width: 100%;
                padding: 8px 12px 8px 32px;
                border: 1.5px solid #cbd5e1;
                border-radius: 9px;
                font-size: 0.84rem;
                background: #ffffff;
                color: #0f172a;
                box-sizing: border-box;
                transition: border-color 0.15s, box-shadow 0.15s;
            }
            .tts-search-input:focus {
                outline: none;
                border-color: #0284c7;
                box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
            }
            .tts-filter-pills {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .tts-filter-pill {
                padding: 6px 11px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                background: #ffffff;
                color: #475569;
                font-size: 0.74rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.12s ease;
                white-space: nowrap;
            }
            .tts-filter-pill:hover {
                border-color: #0284c7;
                color: #0284c7;
            }
            .tts-filter-pill.active {
                background: #0284c7;
                border-color: #0284c7;
                color: #ffffff;
            }

            .tts-student-list {
                display: flex;
                flex-direction: column;
                gap: 7px;
            }

            /* Responsive Student Row */
            .tts-student-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 9px 14px;
                transition: all 0.15s ease;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .tts-student-row:hover {
                background: #f8fafc;
                border-color: #cbd5e1;
            }
            .tts-student-row.has-score {
                background: #f8fbff;
                border-color: #93c5fd;
            }
            .tts-student-row.below-cutoff {
                background: #fff5f5;
                border-color: #fca5a5;
            }
            .tts-student-row.is-absent {
                background: #faf5ff;
                border-color: #d8b4fe;
                opacity: 0.88;
            }

            .tts-student-meta {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
                min-width: 0;
            }

            /* Student Avatar with Photo Zoom */
            .tts-avatar-wrap {
                position: relative;
                width: 42px;
                height: 42px;
                flex: 0 0 42px;
                border-radius: 50%;
                cursor: zoom-in;
            }
            .tts-student-avatar {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid #e2e8f0;
                background: #f1f5f9;
                transition: transform 0.15s ease, border-color 0.15s ease;
                display: block;
            }
            .tts-avatar-wrap:hover .tts-student-avatar {
                transform: scale(1.08);
                border-color: #0284c7;
            }
            .tts-avatar-zoom-badge {
                position: absolute;
                bottom: -2px;
                right: -2px;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #0284c7;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8px;
                border: 1.5px solid #ffffff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            .tts-student-avatar-fallback {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
                color: #0369a1;
                font-weight: 800;
                font-size: 0.90rem;
                border: 2px solid #bae6fd;
            }

            .tts-roll-badge {
                font-size: 0.74rem;
                font-weight: 800;
                color: #0369a1;
                background: #e0f2fe;
                padding: 3px 8px;
                border-radius: 6px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .tts-student-name {
                font-size: 0.86rem;
                font-weight: 700;
                color: #1e293b;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .tts-score-inputs-wrap {
                display: flex;
                align-items: center;
                gap: 7px;
                flex-shrink: 0;
            }
            .tts-score-input-box {
                width: 72px;
                height: 42px;
                padding: 6px 8px;
                border: 1.5px solid #cbd5e1;
                border-radius: 8px;
                font-size: 0.95rem;
                font-weight: 800;
                text-align: center;
                background: #ffffff;
                color: #0f172a;
                transition: border-color 0.15s, box-shadow 0.15s;
                -moz-appearance: textfield;
                box-sizing: border-box;
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
                font-size: 0.76rem;
                font-weight: 700;
                color: #64748b;
                white-space: nowrap;
            }

            /* Absent Button */
            .tts-ab-btn {
                height: 42px;
                min-width: 42px;
                padding: 0 10px;
                border: 1.5px solid #cbd5e1;
                background: #ffffff;
                color: #64748b;
                border-radius: 8px;
                font-size: 0.74rem;
                font-weight: 800;
                cursor: pointer;
                transition: all 0.15s ease;
                letter-spacing: 0.04em;
                box-sizing: border-box;
            }
            .tts-ab-btn:hover {
                border-color: #9333ea;
                color: #9333ea;
                background: #faf5ff;
            }
            .tts-ab-btn.active {
                background: #9333ea;
                color: #ffffff;
                border-color: #7e22ce;
                box-shadow: 0 2px 6px rgba(147, 51, 234, 0.3);
            }

            /* Live score / Grade badge */
            .tts-pct-badge {
                min-width: 44px;
                height: 26px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 0.72rem;
                font-weight: 800;
                padding: 2px 6px;
                border-radius: 6px;
                white-space: nowrap;
                text-align: center;
                box-sizing: border-box;
            }
            .tts-pct-badge.excellent { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
            .tts-pct-badge.average { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
            .tts-pct-badge.low { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
            .tts-pct-badge.absent { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }

            /* Sticky Bottom Action Bar with Mobile Safe-Area */
            .tts-bottom-bar {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                border-top: 1px solid #cbd5e1;
                padding: 12px 20px;
                padding-bottom: max(14px, env(safe-area-inset-bottom, 14px));
                box-shadow: 0 -4px 20px rgba(15, 23, 42, 0.08);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                z-index: 999;
                box-sizing: border-box;
            }
            @media (min-width: 992px) {
                .tts-bottom-bar {
                    left: 260px; /* offset sidebar on desktop */
                }
            }
            .tts-bottom-summary {
                font-size: 0.82rem;
                font-weight: 800;
                color: #1e293b;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .tts-bottom-progress {
                font-size: 0.72rem;
                font-weight: 600;
                color: #64748b;
            }

            /* Tests History List Grid */
            .tts-history-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
                gap: 14px;
            }
            .tts-test-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 16px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.03);
                transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                gap: 12px;
            }
            .tts-test-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
                border-color: #cbd5e1;
            }
            .tts-test-top {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
            }
            .tts-test-title {
                font-size: 0.98rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 4px 0;
            }
            .tts-test-meta {
                font-size: 0.78rem;
                color: #64748b;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .tts-test-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-top: 1px solid #f1f5f9;
                padding-top: 10px;
                margin-top: 4px;
            }

            .cbt-exam-settings {
                margin: 16px 0;
                padding: 16px 18px;
                border: 1.5px solid #bae6fd;
                border-radius: 14px;
                background: #f0f9ff;
                width: 100%;
                box-sizing: border-box;
            }
            .cbt-settings-heading {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #0369a1;
                font-weight: 800;
                font-size: 0.92rem;
                margin-bottom: 12px;
            }
            .cbt-settings-heading small {
                color: #64748b;
                font-weight: 500;
                margin-left: auto;
                font-size: 0.78rem;
            }
            .cbt-settings-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
                gap: 10px;
                width: 100%;
                box-sizing: border-box;
            }
            .cbt-settings-grid label {
                display: flex;
                align-items: center;
                gap: 9px;
                min-height: 42px;
                padding: 9px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 9px;
                background: #ffffff;
                color: #334155;
                font-size: 0.82rem;
                font-weight: 600;
                box-sizing: border-box;
                cursor: pointer;
            }

            /* ========================================================== */
            /* Mobile UI First-Class Ergonomics & Layout Optimization    */
            /* ========================================================== */
            @media (max-width: 768px) {
                .tts-shell {
                    padding: 0 2px 105px;
                }
                .tts-header-card {
                    padding: 14px 14px;
                    border-radius: 12px;
                }
                .tts-header-title {
                    font-size: 1.15rem;
                }
                .tts-header-actions {
                    width: 100%;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }
                .tts-header-actions button {
                    width: 100%;
                    font-size: 0.78rem;
                    padding: 8px 10px;
                    justify-content: center;
                }
                .tts-workspace-intro {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }
                .tts-stats-row {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .tts-stat-chip {
                    padding: 9px 11px;
                    gap: 9px;
                }
                .tts-stat-icon {
                    width: 32px;
                    height: 32px;
                    font-size: 0.85rem;
                }
                .tts-stat-val {
                    font-size: 1.10rem;
                }
                .tts-nav-tabs {
                    gap: 4px;
                    padding: 4px;
                    border-radius: 10px;
                }
                .tts-nav-tab {
                    min-height: 40px;
                    padding: 8px 6px;
                    font-size: 0.78rem;
                    gap: 4px;
                }
                .tts-config-grid {
                    grid-template-columns: 1fr;
                    gap: 10px;
                }
                .tts-settings-grid {
                    grid-template-columns: 1fr;
                    gap: 10px;
                }
                .cbt-settings-grid {
                    grid-template-columns: 1fr;
                }
                .tts-roster-controls {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                }
                .tts-search-box {
                    width: 100%;
                }
                .tts-filter-pills {
                    width: 100%;
                    overflow-x: auto;
                    padding-bottom: 4px;
                    -webkit-overflow-scrolling: touch;
                }
                .tts-filter-pill {
                    white-space: nowrap;
                    font-size: 0.72rem;
                    padding: 6px 10px;
                }
                .tts-student-row {
                    padding: 8px 10px;
                    gap: 8px;
                    border-radius: 10px;
                }
                .tts-student-meta {
                    gap: 8px;
                }
                .tts-avatar-wrap {
                    width: 38px;
                    height: 38px;
                    flex: 0 0 38px;
                }
                .tts-student-name {
                    font-size: 0.82rem;
                }
                .tts-roll-badge {
                    font-size: 0.70rem;
                    padding: 2px 6px;
                }
                .tts-score-inputs-wrap {
                    gap: 5px;
                }
                .tts-score-input-box {
                    width: 62px;
                    height: 40px;
                    font-size: 16px; /* Prevents auto-zoom in mobile Safari / Chrome */
                    padding: 4px;
                }
                .tts-ab-btn {
                    height: 40px;
                    min-width: 40px;
                    padding: 0 6px;
                    font-size: 0.72rem;
                    touch-action: manipulation;
                }
                .tts-outof-lbl {
                    font-size: 0.70rem;
                }
                .tts-pct-badge {
                    min-width: 38px;
                    font-size: 0.68rem;
                    padding: 2px 4px;
                }
                .tts-bottom-bar {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                    padding: 10px 14px;
                    padding-bottom: max(14px, env(safe-area-inset-bottom, 14px));
                }
                .tts-bottom-bar .tts-btn-primary {
                    width: 100%;
                    justify-content: center;
                    font-size: 0.92rem;
                    padding: 12px;
                    touch-action: manipulation;
                }
                .tts-bottom-summary {
                    text-align: center;
                }
            }

            @media (max-width: 480px) {
                .tts-header-card {
                    padding: 12px 12px;
                }
                .tts-header-title {
                    font-size: 1.10rem;
                }
                .tts-header-subtitle {
                    font-size: 0.75rem;
                }
                .tts-nav-tab span {
                    font-size: 0.72rem;
                }
                .tts-tab-pill {
                    display: none;
                }
                .tts-stat-chip {
                    padding: 8px 10px;
                    gap: 8px;
                }
                .tts-stat-val {
                    font-size: 1.05rem;
                }
                .tts-stat-lbl {
                    font-size: 0.66rem;
                }
            }

            /* Continuous CBT QR Scanner Overlay Styles */
            .tts-scanner-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(15, 23, 42, 0.88);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px;
                box-sizing: border-box;
            }
            .tts-scanner-dialog {
                background: #ffffff;
                width: min(560px, 98vw);
                max-height: 94vh;
                border-radius: 18px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.35);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .tts-scanner-header {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                color: #ffffff;
                padding: 14px 18px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .tts-scanner-title {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 0.98rem;
                font-weight: 800;
            }
            .tts-scanner-live-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 0.68rem;
                font-weight: 800;
                background: rgba(239, 68, 68, 0.2);
                color: #fca5a5;
                border: 1px solid rgba(239, 68, 68, 0.4);
                padding: 2px 7px;
                border-radius: 999px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .tts-scanner-live-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #ef4444;
                animation: ttsPulse 1.2s infinite ease-in-out;
            }
            @keyframes ttsPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.4; transform: scale(0.7); }
            }
            .tts-scanner-viewport-wrap {
                position: relative;
                width: 100%;
                height: 290px;
                background: #000000;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .tts-scanner-video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .tts-scanner-viewfinder {
                position: absolute;
                width: 200px;
                height: 200px;
                border: 2px solid rgba(255, 255, 255, 0.4);
                border-radius: 16px;
                box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.5);
                pointer-events: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .tts-scanner-viewfinder.flash-success {
                border-color: #22c55e !important;
                box-shadow: 0 0 25px rgba(34, 197, 94, 0.8), 0 0 0 4000px rgba(0, 0, 0, 0.45) !important;
            }
            .tts-scanner-laser {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: linear-gradient(90deg, transparent, #38bdf8, #60a5fa, transparent);
                box-shadow: 0 0 8px #38bdf8;
                animation: ttsLaserScan 2s infinite ease-in-out;
            }
            @keyframes ttsLaserScan {
                0% { top: 4px; }
                50% { top: calc(100% - 6px); }
                100% { top: 4px; }
            }
            .tts-scanner-hint-pill {
                position: absolute;
                bottom: 12px;
                background: rgba(15, 23, 42, 0.85);
                color: #ffffff;
                font-size: 0.74rem;
                padding: 5px 12px;
                border-radius: 999px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(4px);
                pointer-events: none;
                max-width: 90%;
                text-align: center;
            }
            .tts-scanner-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 16px;
                background: #f8fafc;
                border-bottom: 1px solid #e2e8f0;
                gap: 8px;
                flex-wrap: wrap;
            }
            .tts-scanner-tool-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 7px 12px;
                background: #ffffff;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 0.78rem;
                font-weight: 700;
                color: #334155;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .tts-scanner-tool-btn:hover {
                background: #f1f5f9;
                border-color: #94a3b8;
            }
            .tts-scanner-tool-btn.active {
                background: #e0f2fe;
                color: #0369a1;
                border-color: #38bdf8;
            }
            .tts-scanner-log-section {
                flex: 1;
                max-height: 180px;
                overflow-y: auto;
                padding: 10px 16px;
                background: #ffffff;
            }
            .tts-scanner-log-title {
                font-size: 0.74rem;
                font-weight: 800;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tts-scanner-log-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 10px;
                margin-bottom: 4px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                font-size: 0.78rem;
                animation: ttsSlideIn 0.2s ease-out;
            }
            @keyframes ttsSlideIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .tts-scanner-footer {
                padding: 12px 18px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }

            /* Keep the scanner usable on narrow phones and short landscape screens. */
            @media (max-width: 640px) {
                .tts-scanner-modal-overlay {
                    align-items: stretch;
                    padding: 0;
                }
                .tts-scanner-dialog {
                    width: 100%;
                    max-width: none;
                    height: 100dvh;
                    max-height: 100dvh;
                    border-radius: 0;
                }
                .tts-scanner-header {
                    flex: 0 0 auto;
                    padding: 11px 12px;
                    gap: 7px;
                }
                .tts-scanner-title {
                    min-width: 0;
                    gap: 7px;
                    font-size: 0.82rem;
                }
                .tts-scanner-title > span:not(.tts-scanner-live-badge) {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .tts-scanner-live-badge {
                    flex: 0 0 auto;
                    font-size: 0.6rem;
                    padding: 2px 5px;
                }
                .tts-scanner-header button {
                    flex: 0 0 auto;
                    padding: 6px 8px !important;
                    font-size: 0.76rem !important;
                }
                .tts-scanner-viewport-wrap {
                    flex: 0 0 clamp(220px, 43dvh, 360px);
                    height: auto;
                    min-height: 220px;
                    max-height: 43dvh;
                }
                .tts-scanner-viewfinder {
                    width: min(64vw, 220px);
                    height: min(64vw, 220px);
                }
                .tts-scanner-toolbar {
                    flex: 0 0 auto;
                    padding: 8px 10px;
                    gap: 6px;
                }
                .tts-scanner-tool-btn {
                    padding: 7px 9px;
                    font-size: 0.74rem;
                }
                .tts-scanner-toolbar > div:first-child {
                    gap: 5px !important;
                }
                .tts-scanner-toolbar > div:last-child {
                    font-size: 0.7rem !important;
                    padding: 4px 7px !important;
                }
                .tts-scanner-log-section {
                    flex: 1 1 auto;
                    min-height: 76px;
                    max-height: none;
                    min-width: 0;
                    overflow-y: auto;
                    padding: 8px 10px;
                }
                .tts-scanner-log-title {
                    font-size: 0.68rem;
                }
                .tts-scanner-log-title span:last-child {
                    display: none;
                }
                .tts-scanner-footer {
                    flex: 0 0 auto;
                    padding: 9px 10px calc(9px + env(safe-area-inset-bottom));
                    gap: 7px;
                    flex-wrap: wrap;
                }
                .tts-scanner-footer > span {
                    font-size: 0.68rem !important;
                }
                .tts-scanner-footer button {
                    flex: 1 1 100%;
                    width: 100%;
                    padding: 8px 12px !important;
                }
            }

            @media (max-height: 520px) and (orientation: landscape) {
                .tts-scanner-viewport-wrap {
                    flex-basis: 190px;
                    min-height: 190px;
                }
                .tts-scanner-log-section {
                    min-height: 55px;
                }
                .tts-scanner-footer {
                    padding-top: 6px;
                    padding-bottom: 6px;
                }
            }
            .tts-score-just-scanned {
                animation: ttsHighlightRow 1.6s ease-out;
            }
            @keyframes ttsHighlightRow {
                0% { background: #dcfce7 !important; border-color: #22c55e !important; }
                100% { background: transparent; }
            }

            /* Test Workspace Banner inside Editor */
            .tts-workspace-banner {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                border: 1.5px solid #cbd5e1;
                border-radius: 14px;
                padding: 12px 16px;
                margin-bottom: 16px;
                flex-wrap: wrap;
            }
            .tts-workspace-banner-left {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .tts-btn-back {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #ffffff;
                border: 1.5px solid #cbd5e1;
                color: #0369a1;
                font-size: 0.80rem;
                font-weight: 800;
                padding: 7px 13px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .tts-btn-back:hover {
                background: #e0f2fe;
                border-color: #38bdf8;
                color: #0284c7;
                transform: translateX(-2px);
            }
            .tts-workspace-title-box {
                display: flex;
                flex-direction: column;
            }
            .tts-workspace-title {
                font-size: 1.05rem;
                font-weight: 800;
                color: #0f172a;
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .tts-workspace-subtitle {
                font-size: 0.76rem;
                color: #64748b;
                font-weight: 600;
                margin-top: 2px;
            }
            .tts-workspace-banner-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tts-status-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 0.74rem;
                font-weight: 800;
                padding: 4px 10px;
                border-radius: 999px;
                background: #e0f2fe;
                color: #0369a1;
                border: 1px solid #bae6fd;
            }
            .tts-status-pill.scheduled {
                background: #f3e8ff;
                color: #7e22ce;
                border-color: #e9d5ff;
            }
            .tts-status-pill.completed {
                background: #dcfce7;
                color: #15803d;
                border-color: #bbf7d0;
            }
            .tts-test-card {
                cursor: pointer;
                position: relative;
                overflow: hidden;
                border: 1.5px solid #e2e8f0;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
            }
            .tts-test-card:hover {
                transform: translateY(-3px);
                border-color: #38bdf8;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
            }
            .tts-test-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #0284c7, #38bdf8);
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            .tts-test-card:hover::before {
                opacity: 1;
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
                <div class="tts-header-card" id="ttsMainHeader">
                    <div class="tts-header-left">
                        <div class="tts-header-kicker"><i class="fas fa-graduation-cap"></i> Academic Assessments</div>
                        <h1 class="tts-header-title"><i class="fas fa-file-pen"></i> Test Scores &amp; Exam Records</h1>
                        <p class="tts-header-subtitle">Select any test card below to record student scores, or create a new test.</p>
                    </div>
                    <div class="tts-header-actions">
                        <button type="button" class="tts-btn-primary" id="ttsNewTestBtn">
                            <i class="fas fa-plus"></i> Create Test
                        </button>
                    </div>
                </div>

                <!-- Top Segmented Navigation Tabs (Mobile & Desktop) -->
                <div class="tts-nav-tabs" role="tablist" id="ttsNavTabs" style="display:none;">
                    <button type="button" class="tts-nav-tab active" id="ttsTabHistory" role="tab" aria-selected="true">
                        <i class="fas fa-layer-group"></i> <span>Scheduled Tests</span>
                        <span class="tts-tab-pill count" id="ttsHistoryCountBadge">0</span>
                    </button>
                    <button type="button" class="tts-nav-tab" id="ttsTabMarks" role="tab" aria-selected="false">
                        <i class="fas fa-pen-to-square"></i> <span id="ttsTabMarksLabel">Test Workspace &amp; Scores</span>
                    </button>
                    <button type="button" class="tts-nav-tab" id="ttsTabSettings" role="tab" aria-selected="false">
                        <i class="fas fa-sliders"></i> <span>Exam Settings</span>
                        <span class="tts-tab-pill" id="ttsSettingsTabBadge">Pass: 40%</span>
                    </button>
                </div>

                <!-- Stats Bar (2x2 on Mobile, 4-col on Desktop) -->
                <div class="tts-stats-row" id="ttsStatsRow">
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
                            <div class="tts-stat-lbl">Classes</div>
                        </div>
                    </div>
                </div>

                <!-- View 1: Test Editor / Scorer Workspace (Hidden by default until an exam tile is opened or new test assigned) -->
                <div id="ttsEditorView" style="display:none;">
                    <div class="tts-card">
                        <!-- Active Exam Workspace Breadcrumb / Navigation Banner -->
                        <div class="tts-workspace-banner" id="ttsWorkspaceBanner">
                            <div class="tts-workspace-banner-left">
                                <button type="button" class="tts-btn-back" id="ttsBackToTestsBtn" title="Return to All Tests">
                                    <i class="fas fa-arrow-left"></i> <span>All Tests</span>
                                </button>
                                <div class="tts-workspace-title-box">
                                    <div class="tts-workspace-title" id="ttsWorkspaceTitle">
                                        <i class="fas fa-file-pen" style="color:#0284c7;"></i> <span id="ttsWorkspaceTitleText">Create &amp; Schedule New Assessment</span>
                                    </div>
                                    <div class="tts-workspace-subtitle" id="ttsWorkspaceSubtitle">Select class, section, subject, test date, rules, and enter student marks</div>
                                </div>
                            </div>
                            <div class="tts-workspace-banner-actions">
                                <span class="tts-status-pill scheduled" id="ttsWorkspaceStatusPill"><i class="fas fa-sparkles"></i> New Assessment</span>
                                <button type="button" class="tts-btn-primary" id="ttsOpenQrScannerBtn" style="display:none; background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); border-color: #4338ca; padding: 6px 14px; font-size: 0.80rem;" title="Continuous QR Scanner for CBT Student Scores">
                                    <i class="fas fa-qrcode"></i> Scan CBT Scores
                                </button>
                            </div>
                        </div>

                        <!-- Draft notice banner (hidden by default) -->
                        <div id="ttsDraftBanner" class="tts-draft-banner" style="display:none;">
                            <span><i class="fas fa-floppy-disk"></i> Restored unsaved draft scores on this device.</span>
                            <button type="button" class="tts-draft-btn-clear" id="ttsClearDraftBtn">Discard Draft</button>
                        </div>

                        <!-- Test Basic Configuration -->
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
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <label><i class="fas fa-heading"></i> Test Title / Assessment Name</label>
                                    <button type="button" class="tts-btn-secondary" id="ttsQuickToggleSettingsBtn" style="padding:3px 8px; font-size:0.72rem; min-height:auto;">
                                        <i class="fas fa-sliders"></i> <span id="ttsQuickToggleSettingsText">Show Exam Settings</span>
                                    </button>
                                </div>
                                <input type="text" id="ttsTestTitleInput" placeholder="e.g. Unit Test 1 - Algebra & Equations">
                            </div>
                        </div>

                        <!-- Dedicated Collapsible Exam Settings Section -->
                        <div id="ttsExamSettingsCard" class="tts-exam-settings-card" style="display:none;">
                            <div class="tts-settings-header">
                                <div class="tts-settings-title">
                                    <i class="fas fa-gear"></i> Exam Settings &amp; Assessment Rules
                                </div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <span class="tts-tab-pill" id="ttsExamRulesSummary">40% Pass Cutoff</span>
                                    <button type="button" class="tts-btn-secondary" id="ttsCloseSettingsBtn" style="padding:4px 9px; font-size:0.74rem; min-height:auto;">
                                        <i class="fas fa-xmark"></i> Close
                                    </button>
                                </div>
                            </div>

                            <div class="tts-settings-grid">
                                <!-- 1. Exam Category / Type -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-tags"></i> Exam Category / Type</label>
                                    <select id="ttsExamType">
                                        <option value="Unit Test" selected>Unit Test</option>
                                        <option value="Periodic Assessment">Periodic Assessment</option>
                                        <option value="Mid-Term Exam">Mid-Term Exam</option>
                                        <option value="Final Term Exam">Final Term Exam</option>
                                        <option value="Class Quiz">Class Quiz</option>
                                        <option value="Mock CBT Test">Mock CBT Test</option>
                                        <option value="Practical / Viva">Practical / Viva</option>
                                    </select>
                                </div>

                                <!-- 2. Passing Marks / Cutoff -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-bullseye"></i> Passing Cutoff Marks</label>
                                    <input type="number" id="ttsPassingMarks" min="0" max="1000" step="any" value="20" placeholder="e.g. 20">
                                    <div class="tts-cutoff-pill" id="ttsPassingCutoffBadge">
                                        <i class="fas fa-check-circle"></i> Pass Cutoff: 40% (20 / 50 Marks)
                                    </div>
                                </div>

                                <!-- 3. Duration in Minutes & Preset Chips -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-stopwatch"></i> Exam Duration (Mins)</label>
                                    <input type="number" id="ttsExamDuration" min="5" max="360" value="60" placeholder="e.g. 60">
                                    <div class="tts-duration-chips" id="ttsDurationChips">
                                        <button type="button" class="tts-duration-chip" data-mins="15">15m</button>
                                        <button type="button" class="tts-duration-chip" data-mins="30">30m</button>
                                        <button type="button" class="tts-duration-chip" data-mins="45">45m</button>
                                        <button type="button" class="tts-duration-chip active" data-mins="60">60m</button>
                                        <button type="button" class="tts-duration-chip" data-mins="90">90m</button>
                                        <button type="button" class="tts-duration-chip" data-mins="120">120m</button>
                                    </div>
                                </div>

                                <!-- 4. Grading Scale Mode -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-chart-line"></i> Grading Scale</label>
                                    <select id="ttsGradingScale">
                                        <option value="percentage" selected>Percentage (0 - 100%)</option>
                                        <option value="letter">Letter Grades (A+, A, B, C, D, Fail)</option>
                                        <option value="gpa">GPA Scale (10.0 Scale)</option>
                                        <option value="pass_fail">Pass / Fail Only</option>
                                    </select>
                                </div>

                                <!-- 5. Student Portal Visibility -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-eye"></i> Result Visibility to Students</label>
                                    <select id="ttsPublishResults">
                                        <option value="immediate" selected>Immediate (Publish on Save)</option>
                                        <option value="hidden">Hidden / Draft (Teacher Review Only)</option>
                                        <option value="scheduled">Scheduled (On Exam Date)</option>
                                    </select>
                                </div>

                                <!-- 6. Negative Marking Penalty -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-minus-circle"></i> Negative Marking (per wrong answer)</label>
                                    <select id="ttsNegativeMarking">
                                        <option value="0" selected>None (0)</option>
                                        <option value="0.25">-0.25 (1/4 mark)</option>
                                        <option value="0.33">-0.33 (1/3 mark)</option>
                                        <option value="0.50">-0.50 (1/2 mark)</option>
                                        <option value="1.00">-1.00 (1 full mark)</option>
                                    </select>
                                </div>

                                <!-- 7. Assessment Component -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-layer-group"></i> Assessment Component</label>
                                    <select id="ttsAssessmentComponent">
                                        <option value="Theory" selected>Theory Exam</option>
                                        <option value="Practical">Practical / Laboratory</option>
                                        <option value="Internal">Internal Assessment / Term Work</option>
                                        <option value="Project">Project / Assignment</option>
                                        <option value="Viva">Viva Voce / Oral Examination</option>
                                    </select>
                                </div>

                                <!-- 8. Semester Weightage % -->
                                <div class="tts-field-group">
                                    <label><i class="fas fa-percent"></i> Semester Weightage %</label>
                                    <input type="number" id="ttsWeightage" min="0" max="100" value="20" placeholder="e.g. 20">
                                </div>

                                <!-- 9. Exam Instructions -->
                                <div class="tts-field-group" style="grid-column: 1 / -1;">
                                    <label><i class="fas fa-file-lines"></i> Exam Instructions &amp; Guidelines (Shown to Students)</label>
                                    <textarea id="ttsExamInstructions" rows="2" placeholder="e.g. Attempt all questions. Passing cutoff is 40%. Non-programmable scientific calculator permitted."></textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Student Roster Header -->
                        <div class="tts-roster-header">
                            <div class="tts-roster-title">
                                <i class="fas fa-user-graduate"></i> Student Roster (Sorted by Roll Number)
                            </div>
                            <div class="tts-roster-count" id="ttsRosterCount">0 Students</div>
                        </div>

                        <!-- Real-time Student Search & Status Filter Controls -->
                        <div class="tts-roster-controls">
                            <div class="tts-search-box">
                                <i class="fas fa-magnifying-glass"></i>
                                <input type="text" id="ttsStudentSearchInput" class="tts-search-input" placeholder="Search student by name or roll number...">
                            </div>
                            <div class="tts-filter-pills" id="ttsFilterPills">
                                <button type="button" class="tts-filter-pill active" data-filter="all">All (<span id="ttsFilterAllCount">0</span>)</button>
                                <button type="button" class="tts-filter-pill" data-filter="scored">Scored (<span id="ttsFilterScoredCount">0</span>)</button>
                                <button type="button" class="tts-filter-pill" data-filter="unscored">Unscored (<span id="ttsFilterUnscoredCount">0</span>)</button>
                                <button type="button" class="tts-filter-pill" data-filter="absent">Absent (<span id="ttsFilterAbsentCount">0</span>)</button>
                                <button type="button" class="tts-filter-pill" id="ttsRosterScanQrBtn" style="display:none; background:#eef2ff; color:#4338ca; border-color:#c7d2fe; align-items:center; gap:5px;" title="Scan CBT scores directly into this roster">
                                    <i class="fas fa-qrcode"></i> Scan CBT QR
                                </button>
                                <button type="button" class="tts-filter-pill" id="ttsMarkUnscoredAbsentBtn" style="display:none; background:#fef2f2; color:#b91c1c; border-color:#fecaca; align-items:center; gap:5px;" title="Mark all students who have no scanned score as Absent">
                                    <i class="fas fa-user-slash"></i> Mark Unscanned as Absent
                                </button>
                            </div>
                        </div>

                        <!-- Tip banner for mobile keyboard -->
                        <div id="ttsTipBanner" style="font-size:0.74rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:7px 12px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-keyboard" style="color:#0284c7; font-size:0.92rem;"></i>
                            <span>Enter marks and tap <strong>Next</strong> on mobile keyboard (or press <strong>Enter</strong>) to auto-jump to next student. Tap student photo to zoom.</span>
                        </div>

                        <!-- Students List Container -->
                        <div id="ttsStudentsList" class="tts-student-list">
                            <div style="text-align:center; padding:36px 16px; color:#64748b;">
                                <i class="fas fa-chalkboard-user" style="font-size:2rem; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
                                <p style="margin:0; font-weight:700; color:#334155;">Please select a class &amp; section above to load students.</p>
                                <p style="margin:4px 0 0; font-size:0.78rem;">Students will be listed with photos, roll numbers, and quick score inputs.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- View 2: Scheduled Tests & Assessments Tiles View (Primary Landing View) -->
                <div id="ttsHistoryView" style="display:block;">
                    <div class="tts-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
                            <div>
                                <div style="font-size:1.05rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;">
                                    <i class="fas fa-calendar-check" style="color:#0284c7;"></i> Scheduled Tests &amp; Active Assessments
                                </div>
                                <p style="margin:2px 0 0; font-size:0.78rem; color:#64748b;">Click on any exam tile below to open class details, student roster, and enter marks.</p>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                <div class="tts-filter-pills" style="margin:0;">
                                    <button type="button" class="tts-filter-pill active" id="ttsFilterAllTests"><i class="fas fa-border-all"></i> All Tests</button>
                                    <button type="button" class="tts-filter-pill" id="ttsFilterUpcomingTests"><i class="fas fa-clock"></i> Scheduled</button>
                                    <button type="button" class="tts-filter-pill" id="ttsFilterPastTests"><i class="fas fa-check-circle"></i> Completed</button>
                                </div>
                            </div>
                        </div>

                        <div id="ttsHistoryGrid" class="tts-history-grid">
                            <div style="text-align:center; padding:36px; color:#64748b; grid-column:1/-1;">
                                <i class="fas fa-spinner fa-spin" style="font-size:1.6rem; color:#0284c7;"></i>
                                <p style="margin-top:10px; font-weight:600;">Loading scheduled tests...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sticky Bottom Action Bar with Mobile Safe-Area -->
            <div id="ttsBottomBar" class="tts-bottom-bar" style="display:none;">
                <div class="tts-bottom-summary">
                    <span id="ttsBottomScoreSummary">0 / 0 Entered</span>
                    <span class="tts-bottom-progress" id="ttsBottomStatusText">Unsaved changes auto-saved to device</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="tts-btn-primary" id="ttsSubmitBtn" style="padding:11px 22px;">
                        <i class="fas fa-cloud-arrow-up"></i> Submit &amp; Save Scores
                    </button>
                </div>
            </div>

            <!-- Continuous CBT Score QR Scanner Overlay Modal -->
            <div id="ttsScannerModal" class="tts-scanner-modal-overlay" style="display:none;">
                <div class="tts-scanner-dialog">
                    <div class="tts-scanner-header">
                        <div class="tts-scanner-title">
                            <i class="fas fa-qrcode" style="color:#60a5fa;"></i>
                            <span>Continuous CBT Score Scanner</span>
                            <span class="tts-scanner-live-badge"><span class="tts-scanner-live-dot"></span> LIVE</span>
                        </div>
                        <button type="button" id="ttsCloseQrScannerBtn" style="color:#ffffff; background:rgba(255,255,255,0.15); border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:0.82rem; font-weight:700;" title="Close Scanner">
                            <i class="fas fa-xmark"></i> Close
                        </button>
                    </div>

                    <div class="tts-scanner-viewport-wrap">
                        <video id="ttsQrVideo" class="tts-scanner-video" playsinline muted autoplay></video>
                        <div class="tts-scanner-viewfinder" id="ttsViewfinder">
                            <div class="tts-scanner-laser"></div>
                        </div>
                        <div class="tts-scanner-hint-pill" id="ttsScannerHint">
                            <i class="fas fa-camera"></i> Point camera at RollCall CBT student score QR
                        </div>
                    </div>

                    <div class="tts-scanner-toolbar">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button type="button" class="tts-scanner-tool-btn" id="ttsFlipCameraBtn" title="Switch between front and back camera">
                                <i class="fas fa-camera-rotate"></i> <span>Flip Camera</span>
                            </button>
                            <button type="button" class="tts-scanner-tool-btn" id="ttsTorchBtn" title="Toggle Flashlight / Torch">
                                <i class="fas fa-bolt"></i> <span>Torch</span>
                            </button>
                            <button type="button" class="tts-scanner-tool-btn" id="ttsUploadQrBtn" title="Upload QR image file if camera is unavailable">
                                <i class="fas fa-image"></i> <span>Upload Image</span>
                            </button>
                            <input type="file" id="ttsQrFileInput" accept="image/*" style="display:none;">
                            <button type="button" class="tts-scanner-tool-btn" id="ttsMuteScanBtn" title="Toggle Scan Sound Chime">
                                <i class="fas fa-volume-high"></i>
                            </button>
                        </div>
                        <div style="font-size:0.78rem; font-weight:800; color:#0369a1; background:#e0f2fe; padding:4px 10px; border-radius:999px;">
                            <i class="fas fa-check-double"></i> Ingested: <span id="ttsQrScanCount">0</span>
                        </div>
                    </div>

                    <div class="tts-scanner-log-section">
                        <div class="tts-scanner-log-title">
                            <span><i class="fas fa-list-check"></i> Live Session Ingestion Feed</span>
                            <span style="font-size:0.70rem; color:#94a3b8; font-weight:500;">Continuous scan active</span>
                        </div>
                        <div id="ttsScannerLogList">
                            <div style="text-align:center; padding:16px; color:#94a3b8; font-size:0.78rem;" id="ttsScannerLogEmpty">
                                Waiting for CBT exam barcodes... No scans yet this session.
                            </div>
                        </div>
                    </div>

                    <div class="tts-scanner-footer">
                        <span style="font-size:0.75rem; color:#64748b;">
                            <i class="fas fa-shield-halved" style="color:#0284c7;"></i> Encrypted AES-256 ingestion
                        </span>
                        <button type="button" class="tts-btn-primary" id="ttsFinishScanBtn" style="padding:8px 18px; font-size:0.84rem;">
                            <i class="fas fa-check"></i> Done &amp; Return to Scores
                        </button>
                    </div>
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
            if (!sec) return '';
            let s = String(sec).trim().toUpperCase();
            s = s.replace(/^(SECTION|SEC\.?)\s*[-:]?\s*/i, '').trim();
            const m = s.match(/^[A-Z0-9]+/);
            return m ? m[0] : s;
        }

        function extractStudentSection(st) {
            if (!st) return '';
            const direct = [st.section, st.classSection, st.assignedSection, st.sec, st.studentSection, st.batch];
            for (const f of direct) {
                const val = normSec(f);
                if (val) return val;
            }
            const nameFields = [st.className, st.courseName, st.class, st.course, st.assignedClass, st.fullClass];
            for (const name of nameFields) {
                if (!name) continue;
                const str = String(name).trim();
                const mSec = str.match(/(?:section|sec)[\s.:_-]*([a-z0-9]+)/i);
                if (mSec && mSec[1]) return normSec(mSec[1]);
                const mParen = str.match(/[\(\[\{]([a-z0-9]+)[\)\]\}]/i);
                if (mParen && mParen[1]) return normSec(mParen[1]);
                const mDash = str.match(/(?:\d+|[a-z]+)\s*[-_]\s*([a-z0-9])\b/i);
                if (mDash && mDash[1]) return normSec(mDash[1]);
                const mGradeLetter = str.match(/\b(?:\d+|x|xi|xii|ix|viii|vii|vi|v|iv|iii|ii|i)\s+([a-z])\b/i);
                if (mGradeLetter && mGradeLetter[1]) return normSec(mGradeLetter[1]);
            }
            return '';
        }

        function extractGradeNum(str) {
            if (!str) return null;
            const s = String(str).toLowerCase().trim();
            if (/\b(xii|12th|12)\b/i.test(s)) return '12';
            if (/\b(xi|11th|11)\b/i.test(s)) return '11';
            if (/\b(x|10th|10)\b/i.test(s)) return '10';
            if (/\b(ix|9th|9)\b/i.test(s)) return '9';
            if (/\b(viii|8th|8)\b/i.test(s)) return '8';
            if (/\b(vii|7th|7)\b/i.test(s)) return '7';
            if (/\b(vi|6th|6)\b/i.test(s)) return '6';
            if (/\b(v|5th|5)\b/i.test(s)) return '5';
            if (/\b(iv|4th|4)\b/i.test(s)) return '4';
            if (/\b(iii|3rd|3)\b/i.test(s)) return '3';
            if (/\b(ii|2nd|2)\b/i.test(s)) return '2';
            if (/\b(i|1st|1)\b/i.test(s)) return '1';
            const m = s.match(/\d+/);
            return m ? m[0] : null;
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

        function handleDateChange() {
            updateDateNotice(dateInput.value);
            renderStudentsRoster(currentStudents);
            updateSummaryCounters();
            scheduleAutoDraftSave();
        }
        dateInput.addEventListener('change', handleDateChange);
        dateInput.addEventListener('input', handleDateChange);

        // Toggle Views: Editor vs History
        const mainHeader = panel.querySelector('#ttsMainHeader');
        const statsRow = panel.querySelector('#ttsStatsRow');
        const navTabs = panel.querySelector('#ttsNavTabs');
        const editorView = panel.querySelector('#ttsEditorView');
        const historyView = panel.querySelector('#ttsHistoryView');
        const toggleHistoryBtn = panel.querySelector('#ttsToggleHistoryBtn');
        const newTestBtn = panel.querySelector('#ttsNewTestBtn');
        const bottomBar = panel.querySelector('#ttsBottomBar');
        const tabMarks = panel.querySelector('#ttsTabMarks');
        const tabMarksLabel = panel.querySelector('#ttsTabMarksLabel');
        const tabSettings = panel.querySelector('#ttsTabSettings');
        const tabHistory = panel.querySelector('#ttsTabHistory');
        const backToTestsBtn = panel.querySelector('#ttsBackToTestsBtn');
        const createTestFromTilesBtn = panel.querySelector('#ttsCreateTestFromTilesBtn');
        const openQrScannerBtn = panel.querySelector('#ttsOpenQrScannerBtn');
        const rosterScanQrBtn = panel.querySelector('#ttsRosterScanQrBtn');
        const markUnscoredAbsentBtn = panel.querySelector('#ttsMarkUnscoredAbsentBtn');
        const workspaceTitleText = panel.querySelector('#ttsWorkspaceTitleText');
        const workspaceSubtitle = panel.querySelector('#ttsWorkspaceSubtitle');
        const workspaceStatusPill = panel.querySelector('#ttsWorkspaceStatusPill');
        const examSettingsCard = panel.querySelector('#ttsExamSettingsCard');
        const quickToggleSettingsBtn = panel.querySelector('#ttsQuickToggleSettingsBtn');
        const quickToggleSettingsText = panel.querySelector('#ttsQuickToggleSettingsText');
        const closeSettingsBtn = panel.querySelector('#ttsCloseSettingsBtn');

        // Helper: Toggle CBT QR Scanner buttons (only visible when a CBT exam is actively opened)
        function setCbtScanButtonsVisibility(visible) {
            const displayVal = visible ? 'inline-flex' : 'none';
            if (openQrScannerBtn) openQrScannerBtn.style.display = displayVal;
            if (rosterScanQrBtn) rosterScanQrBtn.style.display = displayVal;
            if (markUnscoredAbsentBtn) markUnscoredAbsentBtn.style.display = displayVal;
        }

        function setActiveTab(tab) {
            [tabMarks, tabSettings, tabHistory].forEach(t => {
                if (t) {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                }
            });

            if (tab === 'history') {
                showHistoryView();
            } else if (tab === 'marks') {
                showEditorView();
            } else if (tab === 'settings') {
                showEditorView();
                toggleExamSettings(true);
            }
        }

        tabMarks?.addEventListener('click', () => setActiveTab('marks'));
        tabSettings?.addEventListener('click', () => setActiveTab('settings'));
        tabHistory?.addEventListener('click', () => setActiveTab('history'));

        backToTestsBtn?.addEventListener('click', () => {
            showHistoryView();
        });

        createTestFromTilesBtn?.addEventListener('click', () => {
            resetEditorForm();
            showEditorView();
        });

        function toggleExamSettings(forceOpen) {
            if (!examSettingsCard) return;
            const isCurrentlyOpen = examSettingsCard.style.display !== 'none';
            const willOpen = forceOpen !== undefined ? forceOpen : !isCurrentlyOpen;
            examSettingsCard.style.display = willOpen ? 'block' : 'none';
            if (quickToggleSettingsText) {
                quickToggleSettingsText.textContent = willOpen ? 'Hide Exam Settings' : 'Show Exam Settings';
            }
            if (willOpen) {
                examSettingsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        quickToggleSettingsBtn?.addEventListener('click', () => toggleExamSettings());
        closeSettingsBtn?.addEventListener('click', () => toggleExamSettings(false));

        // When a test tile is opened or new test created: Hide header, stats, and tabs for clean Google-like focus
        function showEditorView() {
            if (mainHeader) mainHeader.style.display = 'none';
            if (statsRow) statsRow.style.display = 'none';
            if (navTabs) navTabs.style.display = 'none';
            if (tabMarks) {
                tabMarks.classList.add('active');
                tabMarks.setAttribute('aria-selected', 'true');
            }
            if (tabHistory) {
                tabHistory.classList.remove('active');
                tabHistory.setAttribute('aria-selected', 'false');
            }
            editorView.style.display = 'block';
            historyView.style.display = 'none';
            updateBottomBarVisibility();
        }

        // When viewing all tests tiles: Restore clean dashboard header and stats
        function showHistoryView() {
            if (mainHeader) mainHeader.style.display = 'flex';
            if (statsRow) statsRow.style.display = 'grid';
            if (navTabs) navTabs.style.display = 'none';
            if (tabHistory) {
                tabHistory.classList.add('active');
                tabHistory.setAttribute('aria-selected', 'true');
            }
            if (tabMarks) {
                tabMarks.classList.remove('active');
                tabMarks.setAttribute('aria-selected', 'false');
            }
            editorView.style.display = 'none';
            historyView.style.display = 'block';
            bottomBar.style.display = 'none';
            renderHistoryView();
        }

        window.ttsStartNewTest = function() {
            resetEditorForm();
            showEditorView();
        };

        toggleHistoryBtn?.addEventListener('click', () => {
            if (historyView.style.display === 'none') {
                showHistoryView();
            } else {
                resetEditorForm();
                showEditorView();
            }
        });

        newTestBtn?.addEventListener('click', () => {
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
            schoolId = profile.schoolId || user.schoolId || window.currentTeacher?.schoolId || window.rollCallAdminMode?.schoolId || '';
            if (!schoolId) return;

            // The CBT app signs result packages with schools/{schoolId}.code. The
            // teacher profile can be older and may not contain that field, so load
            // the authoritative school code once when the portal session starts.
            try {
                const schoolSnapshot = await db.ref(`schools/${schoolId}`).once('value');
                const schoolRecord = schoolSnapshot.val() || {};
                const schoolCode = schoolRecord.code || schoolRecord.schoolCode || '';
                if (schoolCode && currentTeacher) currentTeacher.schoolRecordCode = schoolCode;
            } catch (error) {
                console.warn('[CBT QR] Could not load the school code for QR verification.', error);
            }

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

            // If teacher teaches only 1 class, automatically select it and load students on first open
            if (sortedClasses.length === 1 && !activeEditingTestId) {
                const single = sortedClasses[0];
                select.value = `${single.classId}:::${single.section}`;
                handleClassSelectionChange();
            }

            // Update stats
            panel.querySelector('#ttsStatStudents').textContent = myClassesMap.size > 0 ? `${myClassesMap.size} Cls` : '0';
        }

        // When Class/Section changes, update Subject dropdown and load students
        const classSelect = panel.querySelector('#ttsClassSelect');
        const subjectSelect = panel.querySelector('#ttsSubjectSelect');
        const totalMarksInput = panel.querySelector('#ttsTotalMarksInput');
        const testTitleInput = panel.querySelector('#ttsTestTitleInput');

        // Exam Settings Controls
        const examTypeSelect = panel.querySelector('#ttsExamType');
        const passingMarksInput = panel.querySelector('#ttsPassingMarks');
        const passingCutoffBadge = panel.querySelector('#ttsPassingCutoffBadge');
        const examDurationInput = panel.querySelector('#ttsExamDuration');
        const durationChips = panel.querySelectorAll('.tts-duration-chip');
        const gradingScaleSelect = panel.querySelector('#ttsGradingScale');
        const publishResultsSelect = panel.querySelector('#ttsPublishResults');
        const negativeMarkingSelect = panel.querySelector('#ttsNegativeMarking');
        const assessmentComponentSelect = panel.querySelector('#ttsAssessmentComponent');
        const weightageInput = panel.querySelector('#ttsWeightage');
        const examInstructionsInput = panel.querySelector('#ttsExamInstructions');

        // Student Search & Filter Controls
        const searchInput = panel.querySelector('#ttsStudentSearchInput');
        const filterPills = panel.querySelectorAll('.tts-filter-pill');
        let studentSearchQuery = '';
        let studentFilterStatus = 'all';

        // Duration Presets
        durationChips.forEach(chip => {
            chip.addEventListener('click', () => {
                durationChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                if (examDurationInput) {
                    examDurationInput.value = chip.dataset.mins;
                }
                scheduleAutoDraftSave();
            });
        });

        examDurationInput?.addEventListener('input', () => {
            const val = examDurationInput.value;
            durationChips.forEach(chip => {
                chip.classList.toggle('active', chip.dataset.mins === val);
            });
            scheduleAutoDraftSave();
        });

        // Live Passing Cutoff Calculator
        function updatePassingCutoffBadge() {
            const max = parseFloat(totalMarksInput?.value) || 50;
            let passing = parseFloat(passingMarksInput?.value);
            if (isNaN(passing) || passing < 0) {
                passing = Math.round(max * 0.4);
                if (passingMarksInput) passingMarksInput.value = passing;
            }
            const pct = max > 0 ? Math.round((passing / max) * 100) : 40;
            if (passingCutoffBadge) {
                passingCutoffBadge.innerHTML = `<i class="fas fa-check-circle"></i> Pass Cutoff: ${pct}% (${passing} / ${max} Marks)`;
            }
            const tabBadge = panel.querySelector('#ttsSettingsTabBadge');
            if (tabBadge) tabBadge.textContent = `Pass: ${pct}%`;
            const summaryBadge = panel.querySelector('#ttsExamRulesSummary');
            if (summaryBadge) summaryBadge.textContent = `${pct}% Pass Cutoff (${passing}/${max})`;

            panel.querySelectorAll('.student-score-input').forEach(inp => {
                updateStudentScoreBadge(inp);
            });
        }

        passingMarksInput?.addEventListener('input', () => {
            updatePassingCutoffBadge();
            scheduleAutoDraftSave();
        });

        gradingScaleSelect?.addEventListener('change', () => {
            panel.querySelectorAll('.student-score-input').forEach(inp => {
                updateStudentScoreBadge(inp);
            });
            scheduleAutoDraftSave();
        });

        [examTypeSelect, publishResultsSelect, negativeMarkingSelect, assessmentComponentSelect, weightageInput, examInstructionsInput].forEach(el => {
            el?.addEventListener('change', scheduleAutoDraftSave);
            el?.addEventListener('input', scheduleAutoDraftSave);
        });

        examTypeSelect?.addEventListener('change', () => {
            const isCbt = examTypeSelect.value === 'Mock CBT Test';
            setCbtScanButtonsVisibility(isCbt);
        });

        // Search & Filter Events
        searchInput?.addEventListener('input', () => {
            studentSearchQuery = (searchInput.value || '').trim();
            applyStudentFiltering();
        });

        filterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                studentFilterStatus = pill.dataset.filter || 'all';
                applyStudentFiltering();
            });
        });

        function applyStudentFiltering() {
            const rows = panel.querySelectorAll('.tts-student-row');
            let visibleCount = 0;
            let scoredCount = 0;
            let unscoredCount = 0;
            let absentCount = 0;

            rows.forEach(row => {
                const uid = row.dataset.uid;
                const st = currentStudents.find(s => s.id === uid);
                const inp = row.querySelector('.student-score-input');
                const abBtn = row.querySelector('.tts-ab-btn');
                const isAbsent = abBtn?.classList.contains('active') || false;
                const hasScore = inp && inp.value.trim() !== '' && !isNaN(parseFloat(inp.value));

                if (isAbsent) absentCount++;
                else if (hasScore) scoredCount++;
                else unscoredCount++;

                let matchesSearch = true;
                if (studentSearchQuery && st) {
                    const q = studentSearchQuery.toLowerCase();
                    const name = String(st.name || st.displayName || '').toLowerCase();
                    const roll = String(st.classRoll || st.univRoll || st.rollNo || '').toLowerCase();
                    matchesSearch = name.includes(q) || roll.includes(q);
                }

                let matchesStatus = true;
                if (studentFilterStatus === 'scored') matchesStatus = hasScore;
                else if (studentFilterStatus === 'unscored') matchesStatus = !hasScore && !isAbsent;
                else if (studentFilterStatus === 'absent') matchesStatus = isAbsent;

                const show = matchesSearch && matchesStatus;
                row.style.display = show ? 'flex' : 'none';
                if (show) visibleCount++;
            });

            // Update pill counts
            const allCountEl = panel.querySelector('#ttsFilterAllCount');
            const scoredCountEl = panel.querySelector('#ttsFilterScoredCount');
            const unscoredCountEl = panel.querySelector('#ttsFilterUnscoredCount');
            const absentCountEl = panel.querySelector('#ttsFilterAbsentCount');
            if (allCountEl) allCountEl.textContent = currentStudents.length;
            if (scoredCountEl) scoredCountEl.textContent = scoredCount;
            if (unscoredCountEl) unscoredCountEl.textContent = unscoredCount;
            if (absentCountEl) absentCountEl.textContent = absentCount;

            const rosterCountEl = panel.querySelector('#ttsRosterCount');
            if (rosterCountEl) {
                rosterCountEl.textContent = (visibleCount === currentStudents.length)
                    ? `${currentStudents.length} Students`
                    : `${visibleCount} of ${currentStudents.length} Students`;
            }
        }

        async function handleClassSelectionChange() {
            const val = classSelect.value;
            if (!val) {
                currentStudents = [];
                subjectSelect.innerHTML = '<option value="">Select Subject...</option>';
                renderStudentsRoster([]);
                updateBottomBarVisibility();
                return;
            }

            const [classId, section] = val.split(':::');
            const key = `${classId}_${normSec(section)}`;
            const clsData = myClassesMap.get(key);

            // Populate subjects
            populateSubjectDropdown(clsData);

            // Load students immediately on single selection
            await loadStudentsForClass(classId, section, clsData?.className);

            // Check device draft
            checkForLocalDraft();
        }

        classSelect.addEventListener('change', handleClassSelectionChange);
        classSelect.addEventListener('input', handleClassSelectionChange);

        async function ensureStudentsLoaded() {
            if (!classSelect.value) return;
            if (currentStudents.length === 0) {
                const [classId, section] = classSelect.value.split(':::');
                const key = `${classId}_${normSec(section)}`;
                const clsData = myClassesMap.get(key);
                await loadStudentsForClass(classId, section, clsData?.className);
                checkForLocalDraft();
            }
        }

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
            ensureStudentsLoaded();
            checkForLocalDraft();
            scheduleAutoDraftSave();
        });
        subjectSelect.addEventListener('focus', () => {
            ensureStudentsLoaded();
        });
        totalMarksInput.addEventListener('input', () => {
            ensureStudentsLoaded();
            updateTotalMarksLabels();
            scheduleAutoDraftSave();
        });
        testTitleInput.addEventListener('input', () => {
            ensureStudentsLoaded();
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
            updatePassingCutoffBadge();
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
            const stSec = extractStudentSection(st);

            // 1. Strict Section Isolation
            if (targetSec && targetSec !== 'ALL') {
                if (stSec && stSec !== targetSec) {
                    return false;
                }
                if (!stSec) {
                    const stNames = [st.className, st.courseName, st.course, st.class, st.assignedClass].filter(Boolean).map(x => String(x).toLowerCase());
                    const otherSecFound = stNames.some(n => {
                        const m = n.match(/(?:sec|section)[\s.:_-]*([a-z0-9]+)/i);
                        return m && normSec(m[1]) !== targetSec;
                    });
                    if (otherSecFound) return false;
                }
            } else if (stSec && targetSec && targetSec !== 'ALL' && stSec !== targetSec) {
                return false;
            }

            // 2. Class ID matching
            const stClassId = String(st.classId || st.enrolledClassId || st.courseId || '').toLowerCase().trim();
            const targetClassId = String(classId || '').toLowerCase().trim();
            if (stClassId && targetClassId && stClassId === targetClassId) return true;

            // 3. Class Name & Grade matching
            const stNames = [st.className, st.courseName, st.course, st.class, st.assignedClass].filter(Boolean).map(x => String(x).toLowerCase().trim());
            const targetName = String(className || '').toLowerCase().trim();

            if (targetName && stNames.length > 0) {
                const targetGrade = extractGradeNum(targetName);
                for (const name of stNames) {
                    if (name === targetName || name.includes(targetName) || targetName.includes(name)) {
                        return true;
                    }
                    if (targetGrade) {
                        const stGrade = extractGradeNum(name);
                        if (stGrade && stGrade === targetGrade) {
                            return true;
                        }
                    }
                }
            }

            if (targetSec && stSec && targetSec === stSec) return true;
            return false;
        }

        // Render Student Roster with Student Photos, Zoom Preview, and Mobile Keyboard Auto-Advance
        function renderStudentsRoster(students) {
            const listEl = panel.querySelector('#ttsStudentsList');
            // Only treat as scheduled/future if creating a brand new test with no active editing test open
            const isFuture = (dateInput.value || '') > getTodayStr() && !activeEditingTestId;

            if (students.length === 0) {
                const hasClass = !!classSelect.value;
                listEl.innerHTML = `
                    <div style="text-align:center; padding:36px 16px; color:#64748b;">
                        <i class="fas ${hasClass ? 'fa-user-slash' : 'fa-chalkboard-user'}" style="font-size:2rem; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
                        <p style="margin:0; font-weight:700; color:#334155;">${hasClass ? 'No students found enrolled in this class and section.' : 'Please select a class &amp; section above to load students.'}</p>
                        ${hasClass ? '<button type="button" class="tts-btn-secondary" style="margin-top:12px; font-size:0.78rem;" id="ttsRetryLoadStudents"><i class="fas fa-rotate"></i> Reload Students</button>' : ''}
                    </div>
                `;
                if (hasClass) {
                    listEl.querySelector('#ttsRetryLoadStudents')?.addEventListener('click', () => {
                        handleClassSelectionChange();
                    });
                }
                applyStudentFiltering();
                updateSummaryCounters();
                return;
            }

            const maxMarks = parseFloat(totalMarksInput.value) || 50;
            const tipBanner = panel.querySelector('#ttsTipBanner');
            if (tipBanner) {
                if (isFuture) {
                    tipBanner.style.background = '#f0f9ff';
                    tipBanner.style.borderColor = '#bae6fd';
                    tipBanner.style.color = '#0369a1';
                    tipBanner.innerHTML = `
                        <i class="fas fa-calendar-check" style="color:#0284c7; font-size:0.95rem;"></i>
                        <span><strong>Upcoming Test:</strong> Scheduled for <strong>${escapeHtml(dateInput.value)}</strong>. Scores and attendance are not required now; students will see this scheduled test in their portal.</span>
                    `;
                } else {
                    tipBanner.style.background = '#f8fafc';
                    tipBanner.style.borderColor = '#e2e8f0';
                    tipBanner.style.color = '#64748b';
                    tipBanner.innerHTML = `
                        <i class="fas fa-keyboard" style="color:#0284c7;"></i>
                        <span>Enter marks and tap <strong>Next</strong> on mobile keyboard (or press <strong>Enter</strong>) to auto-jump to next student. Tap student photo to zoom.</span>
                    `;
                }
            }

            const selectedClassLabel = classSelect.options[classSelect.selectedIndex]?.textContent || 'Class';

            let html = '';
            students.forEach((st, idx) => {
                const roll = st.classRoll || st.univRoll || st.rollNo || (idx + 1);
                const name = st.name || st.displayName || 'Student';
                const photo = st.profilePhoto || st.profilePic || st.photoURL || st.photoUrl || st.profilePicture || st.imageUrl || '';
                const avatar = photo
                    ? `<img class="tts-student-avatar" src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" loading="lazy">`
                    : `<span class="tts-student-avatar-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</span>`;

                const avatarWrap = `
                    <div class="tts-avatar-wrap" data-uid="${st.id}" data-photo="${escapeHtml(photo)}" data-name="${escapeHtml(name)}" data-roll="${escapeHtml(roll)}" title="Click to preview student photo" tabindex="0" role="button" aria-label="Preview photo of ${escapeHtml(name)}">
                        ${avatar}
                        <span class="tts-avatar-zoom-badge"><i class="fas fa-magnifying-glass-plus"></i></span>
                    </div>
                `;

                if (isFuture) {
                    html += `
                        <div class="tts-student-row" id="ttsRow_${st.id}" data-uid="${st.id}">
                            <div class="tts-student-meta">
                                ${avatarWrap}
                                <span class="tts-roll-badge">#${roll}</span>
                                <span class="tts-student-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                            </div>
                            <div class="tts-score-inputs-wrap">
                                <span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700; font-size:0.76rem; padding:4px 10px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
                                    <i class="fas fa-clock"></i> Scheduled
                                </span>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="tts-student-row" id="ttsRow_${st.id}" data-uid="${st.id}">
                            <div class="tts-student-meta">
                                ${avatarWrap}
                                <span class="tts-roll-badge">#${roll}</span>
                                <span class="tts-student-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
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
                }
            });

            listEl.innerHTML = html;

            // Wire up Student Photo Preview Click & Accessibility Events
            listEl.querySelectorAll('.tts-avatar-wrap').forEach(wrap => {
                const openPreview = () => {
                    const photoSrc = wrap.dataset.photo;
                    const stName = wrap.dataset.name || 'Student';
                    const stRoll = wrap.dataset.roll || '';
                    if (photoSrc && window.TeacherStudentPhotoPreview) {
                        window.TeacherStudentPhotoPreview.open({
                            src: photoSrc,
                            name: stName,
                            details: `${selectedClassLabel} · Roll #${stRoll}`
                        });
                    }
                };

                wrap.addEventListener('click', openPreview);
                wrap.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPreview();
                    }
                });

                // Graceful fallback for broken image URLs
                const img = wrap.querySelector('img');
                if (img) {
                    img.addEventListener('error', () => {
                        const fallback = document.createElement('span');
                        fallback.className = 'tts-student-avatar-fallback';
                        fallback.textContent = (wrap.dataset.name || 'S').trim().charAt(0).toUpperCase();
                        img.replaceWith(fallback);
                    }, { once: true });
                }
            });

            if (!isFuture) {
                // Attach Mobile Keyboard Enter / Next Auto-Advance Listeners
                const inputs = Array.from(listEl.querySelectorAll('.student-score-input'));
                inputs.forEach((inp, idx) => {
                    // Keydown listener for Enter / Next key
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            // Find next enabled input
                            const nextInput = inputs.slice(idx + 1).find(i => !i.disabled);
                            if (nextInput) {
                                nextInput.focus();
                                nextInput.select();
                                nextInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            } else {
                                // Last student, dismiss keyboard and focus submit button
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
                        applyStudentFiltering();
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
                        applyStudentFiltering();
                        updateSummaryCounters();
                        scheduleAutoDraftSave();
                    });
                });
            }

            applyStudentFiltering();
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
                row?.classList.remove('below-cutoff');
                return;
            }

            const val = parseFloat(inp.value);
            const max = parseFloat(totalMarksInput.value) || 50;
            const passing = parseFloat(panel.querySelector('#ttsPassingMarks')?.value) || Math.round(max * 0.4);

            if (isNaN(val) || inp.value.trim() === '') {
                badge.className = 'tts-pct-badge';
                badge.textContent = '--';
                row?.classList.remove('has-score');
                row?.classList.remove('below-cutoff');
                return;
            }

            row?.classList.add('has-score');
            const pct = Math.round((val / max) * 100);
            const isBelowCutoff = val < passing;

            if (isBelowCutoff) {
                row?.classList.add('below-cutoff');
            } else {
                row?.classList.remove('below-cutoff');
            }

            const gradingScale = panel.querySelector('#ttsGradingScale')?.value || 'percentage';
            let label = `${pct}%`;

            if (gradingScale === 'letter') {
                if (pct >= 90) label = 'A+';
                else if (pct >= 80) label = 'A';
                else if (pct >= 70) label = 'B+';
                else if (pct >= 60) label = 'B';
                else if (pct >= 50) label = 'C';
                else if (pct >= 40) label = 'D';
                else label = 'F';
            } else if (gradingScale === 'gpa') {
                label = (pct / 10).toFixed(1);
            } else if (gradingScale === 'pass_fail') {
                label = isBelowCutoff ? 'FAIL' : 'PASS';
            }

            if (isBelowCutoff) {
                badge.className = 'tts-pct-badge low';
            } else if (pct >= 75) {
                badge.className = 'tts-pct-badge excellent';
            } else if (pct >= 50) {
                badge.className = 'tts-pct-badge average';
            } else {
                badge.className = 'tts-pct-badge low';
            }

            badge.textContent = label;
        }

        function updateSummaryCounters() {
            const isFuture = (dateInput.value || '') > getTodayStr();
            const total = currentStudents.length;
            const summaryText = panel.querySelector('#ttsBottomScoreSummary');
            const submitBtn = panel.querySelector('#ttsSubmitBtn');

            if (isFuture) {
                if (summaryText) {
                    summaryText.innerHTML = `<strong>${total} Students Enrolled</strong> (Upcoming Scheduled Test)`;
                }
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-calendar-plus"></i> Assign &amp; Schedule Test';
                }
                return;
            }

            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Submit &amp; Save Scores';
            }

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
                examType: examTypeSelect?.value || 'Unit Test',
                passingMarks: passingMarksInput?.value || '',
                duration: examDurationInput?.value || '60',
                gradingScale: gradingScaleSelect?.value || 'percentage',
                publishResults: publishResultsSelect?.value || 'immediate',
                negativeMarking: negativeMarkingSelect?.value || '0',
                assessmentComponent: assessmentComponentSelect?.value || 'Theory',
                weightage: weightageInput?.value || '20',
                instructions: examInstructionsInput?.value || '',
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

                    // Restore Exam Settings from Draft
                    if (draft.examType && examTypeSelect) examTypeSelect.value = draft.examType;
                    if (draft.passingMarks && passingMarksInput) passingMarksInput.value = draft.passingMarks;
                    if (draft.duration && examDurationInput) {
                        examDurationInput.value = draft.duration;
                        durationChips.forEach(chip => chip.classList.toggle('active', chip.dataset.mins === draft.duration));
                    }
                    if (draft.gradingScale && gradingScaleSelect) gradingScaleSelect.value = draft.gradingScale;
                    if (draft.publishResults && publishResultsSelect) publishResultsSelect.value = draft.publishResults;
                    if (draft.negativeMarking && negativeMarkingSelect) negativeMarkingSelect.value = draft.negativeMarking;
                    if (draft.assessmentComponent && assessmentComponentSelect) assessmentComponentSelect.value = draft.assessmentComponent;
                    if (draft.weightage && weightageInput) weightageInput.value = draft.weightage;
                    if (draft.instructions && examInstructionsInput) examInstructionsInput.value = draft.instructions;
                    updatePassingCutoffBadge();

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
                const row = panel.querySelector(`#ttsRow_${st.id}`);
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
        // Helper: Mark all students without scanned/entered scores as Absent
        function markUnscannedAsAbsent() {
            let markedCount = 0;
            currentStudents.forEach(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                const row = panel.querySelector(`#ttsRow_${st.id}`);
                const hasScore = inp && inp.value.trim() !== '';
                const isAbsent = abBtn && abBtn.classList.contains('active');
                if (!hasScore && !isAbsent) {
                    if (abBtn) abBtn.classList.add('active');
                    if (row) row.classList.add('is-absent');
                    if (inp) {
                        inp.value = '';
                        inp.disabled = true;
                        updateStudentScoreBadge(inp);
                    }
                    markedCount++;
                }
            });
            updateSummaryCounters();
            scheduleAutoDraftSave();
            return markedCount;
        }

        markUnscoredAbsentBtn?.addEventListener('click', () => {
            const marked = markUnscannedAsAbsent();
            alert(`Marked ${marked} unscanned student(s) without device scores as Absent.`);
        });

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

            // Confirm submission
            const isFuture = testDate > getTodayStr();

            // Gather student scores
            const scoresMap = {};
            let scoredCount = 0;
            let invalidScore = false;
            let presentCount = 0;
            let absentCount = 0;

            // Check if any student has a score entered or was marked absent
            const hasAnyScoreData = currentStudents.some(st => {
                const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                return (inp && inp.value.trim() !== '') || (abBtn && abBtn.classList.contains('active'));
            });

            // Only treat as scheduled future test if creating a test from scratch with no scores entered yet
            const isSchedulingFutureTest = isFuture && !hasAnyScoreData && !activeEditingTestId;

            if (isSchedulingFutureTest) {
                // Future test: do not ask for scores or absent
                currentStudents.forEach(st => {
                    const rollNo = st.classRoll || st.univRoll || st.rollNo || '';
                    scoresMap[st.id] = {
                        studentUid: st.id,
                        studentName: st.name || st.displayName || 'Student',
                        rollNo: rollNo,
                        marksObtained: null,
                        maxMarks: maxMarks,
                        isAbsent: false
                    };
                });
            } else {
                currentStudents.forEach(st => {
                    const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                    const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                    const row = panel.querySelector(`#ttsRow_${st.id}`);
                    const isExplicitAbsent = abBtn?.classList.contains('active') || false;
                    const rollNo = st.classRoll || st.univRoll || st.rollNo || '';
                    const hasScore = inp && inp.value.trim() !== '';

                    if (hasScore && !isExplicitAbsent) {
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
                            presentCount++;
                        }
                    } else {
                        // NO data scanned from device OR marked absent: MUST be saved as Absent!
                        scoresMap[st.id] = {
                            studentUid: st.id,
                            studentName: st.name || st.displayName || 'Student',
                            rollNo: rollNo,
                            marksObtained: null,
                            maxMarks: maxMarks,
                            isAbsent: true
                        };
                        scoredCount++;
                        absentCount++;

                        // Reflect absent state in UI
                        if (abBtn && !abBtn.classList.contains('active')) abBtn.classList.add('active');
                        if (row && !row.classList.contains('is-absent')) row.classList.add('is-absent');
                        if (inp) {
                            inp.value = '';
                            inp.disabled = true;
                        }
                    }
                });

                if (invalidScore) {
                    alert(`Some scores are invalid or exceed total marks (${maxMarks}). Please check inputs highlighted in red.`);
                    return;
                }
            }

            const confirmMsg = isSchedulingFutureTest
                ? `Assign and schedule this test on ${testDate} for ${className} Sec ${section}? All ${currentStudents.length} students will see this as an upcoming test in their dashboard.`
                : `Save test scores for ${currentStudents.length} students (${className} Sec ${section})?\n• Present (Scored): ${presentCount}\n• Absent (No Data Scanned): ${absentCount}`;

            if (!confirm(confirmMsg)) return;

            submitBtn.disabled = true;
            submitBtn.innerHTML = isSchedulingFutureTest
                ? '<i class="fas fa-spinner fa-spin"></i> Scheduling Test...'
                : '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const testId = activeEditingTestId || db.ref(`schoolTests/${schoolId}`).push().key;

                const passingMarksVal = parseFloat(passingMarksInput?.value) || Math.round(maxMarks * 0.4);
                const passingPct = maxMarks > 0 ? Math.round((passingMarksVal / maxMarks) * 100) : 40;
                const examDurationVal = parseInt(examDurationInput?.value, 10) || 60;
                const examTypeVal = examTypeSelect?.value || 'Unit Test';
                const gradingScaleVal = gradingScaleSelect?.value || 'percentage';
                const publishResultsVal = publishResultsSelect?.value || 'immediate';
                const negativeMarkingVal = parseFloat(negativeMarkingSelect?.value) || 0;
                const assessmentComponentVal = assessmentComponentSelect?.value || 'Theory';
                const weightageVal = parseFloat(weightageInput?.value) || 20;
                const examInstructionsVal = (examInstructionsInput?.value || '').trim();

                const existingTest = activeEditingTestId ? testsList.find(t => t.id === activeEditingTestId) : null;
                const isCbt = !!(
                    existingTest?.isCbtExam || 
                    existingTest?.cbtCode || 
                    examTypeVal === 'Mock CBT Test' || 
                    examTypeVal === 'CBT' ||
                    (existingTest?.title && /cbt/i.test(existingTest.title)) ||
                    (testId && String(testId).startsWith('EXAM-')) ||
                    (testId && /cbt/i.test(String(testId)))
                );

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
                    scoredCount: isSchedulingFutureTest ? 0 : scoredCount,
                    status: isSchedulingFutureTest ? 'scheduled' : 'completed',
                    isFuture: isSchedulingFutureTest,
                    isCbtExam: isCbt,
                    cbtCode: existingTest?.cbtCode || (isCbt ? (existingTest?.id || testId) : null),
                    examType: isCbt && examTypeVal !== 'Mock CBT Test' ? 'Mock CBT Test' : examTypeVal,
                    passingMarks: passingMarksVal,
                    passingPct: passingPct,
                    durationMinutes: examDurationVal,
                    gradingScale: gradingScaleVal,
                    publishResults: publishResultsVal,
                    negativeMarking: negativeMarkingVal,
                    assessmentComponent: assessmentComponentVal,
                    weightage: weightageVal,
                    instructions: examInstructionsVal
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
                        examType: examTypeVal,
                        passingMarks: passingMarksVal,
                        passingPct: passingPct,
                        durationMinutes: examDurationVal,
                        gradingScale: gradingScaleVal,
                        assessmentComponent: assessmentComponentVal,
                        updatedAt: Date.now()
                    };
                });

                if (Object.keys(updates).length > 0) {
                    await db.ref().update(updates);
                }

                // Clear device cache
                clearDeviceDraft();

                alert(isFuture ? 'Test successfully scheduled and assigned to students!' : 'Test and student scores successfully saved and synced!');

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
                testsList = Object.values(data).filter(t => {
                    if (!t) return false;
                    if (t.teacherId && t.teacherId === currentTeacher.uid) return true;
                    if (t.createdBy && t.createdBy === currentTeacher.uid) return true;
                    if (t.teacherName && (t.teacherName === currentTeacher.name || t.teacherName === currentTeacher.displayName)) return true;
                    if (t.isCbtExam || t.examType === 'Mock CBT Test') {
                        if (!t.teacherId || t.teacherId === '') {
                            const hasClass = Array.from(myClassesMap.values()).some(c => c.classId === t.classId || c.className === t.className);
                            if (hasClass) return true;
                        }
                    }
                    return false;
                });

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

                const examType = test.examType || 'Assessment';
                const component = test.assessmentComponent || 'Theory';
                const duration = test.durationMinutes || 60;
                const passingMarks = test.passingMarks !== undefined ? test.passingMarks : Math.round(test.maxMarks * 0.4);
                const totalStudents = Number(test.studentCount || 0);
                const scoredCount = Number(test.scoredCount || 0);
                const progressPct = totalStudents > 0 ? Math.min(100, Math.round((scoredCount / totalStudents) * 100)) : 0;

                html += `
                    <div class="tts-test-card" id="ttsTestCard_${test.id}" onclick="window.editTeacherTest('${test.id}')" title="Click to open exam details, student roster, and score entry">
                        <div>
                            <div class="tts-test-top">
                                <div style="flex:1; min-width:0; padding-right:8px;">
                                    <h3 class="tts-test-title">${escapeHtml(test.title)}</h3>
                                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">
                                        <span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:0.68rem; padding:2px 7px; border-radius:5px; font-weight:700;">
                                            <i class="fas fa-tag"></i> ${escapeHtml(examType)}
                                        </span>
                                        <span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; font-size:0.68rem; padding:2px 7px; border-radius:5px; font-weight:600;">
                                            <i class="fas fa-layer-group"></i> ${escapeHtml(component)}
                                        </span>
                                        <span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:0.68rem; padding:2px 7px; border-radius:5px; font-weight:600;">
                                            <i class="fas fa-stopwatch"></i> ${duration}m
                                        </span>
                                    </div>
                                </div>
                                <div>${statusBadge}</div>
                            </div>

                            <div class="tts-test-meta" style="margin-top:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                                <div style="font-weight:700; color:#0f172a;"><i class="fas fa-chalkboard" style="color:#0284c7; width:16px;"></i> <strong>${escapeHtml(test.className)} - Sec ${escapeHtml(test.section)}</strong></div>
                                <div><i class="fas fa-book" style="color:#16a34a; width:16px;"></i> ${escapeHtml(test.subject)}</div>
                                <div><i class="fas fa-calendar-day" style="color:#d97706; width:16px;"></i> Scheduled Date: <strong>${escapeHtml(test.testDate)}</strong></div>
                                <div><i class="fas fa-award" style="color:#9333ea; width:16px;"></i> Total: <strong>${test.maxMarks} Marks</strong> <span style="color:#64748b;">(Pass: ${passingMarks})</span></div>
                            </div>

                            <div style="margin-top:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem; font-weight:700; color:#475569; margin-bottom:4px;">
                                    <span><i class="fas fa-chart-simple" style="color:#0284c7;"></i> Scoring Progress</span>
                                    <span>${scoredCount} / ${totalStudents} (${progressPct}%)</span>
                                </div>
                                <div style="height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
                                    <div style="height:100%; width:${progressPct}%; background:${progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #0284c7, #38bdf8)'}; border-radius:999px; transition:width 0.3s;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="tts-test-footer">
                            <span style="font-size:0.76rem; font-weight:800; color:#0284c7; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-folder-open"></i> Open Details &amp; Scores &rarr;
                            </span>
                            <div style="display:flex; gap:6px;" onclick="event.stopPropagation();">
                                <button type="button" class="tts-btn-secondary" onclick="window.deleteTeacherTest('${test.id}')" style="padding:6px 10px; font-size:0.75rem; color:#dc2626; min-height:32px; touch-action:manipulation;" title="Delete this test">
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

        // Edit / Drill Down into Test Workspace Handler
        window.editTeacherTest = async function(testId) {
            const test = testsList.find(t => t.id === testId);
            if (!test) return;

            activeEditingTestId = test.id;
            testTitleInput.value = test.title || '';
            dateInput.value = test.testDate || getTodayStr();
            updateDateNotice(dateInput.value);
            totalMarksInput.value = test.maxMarks || 50;

            // Robust CBT detection: show scan button even if results are already scanned!
            let isCbt = !!(
                test.isCbtExam || 
                test.cbtCode || 
                test.examType === 'Mock CBT Test' || 
                test.examType === 'CBT' ||
                (test.title && /cbt/i.test(test.title)) ||
                (test.id && String(test.id).startsWith('EXAM-')) ||
                (test.id && /cbt/i.test(String(test.id)))
            );

            if (!isCbt && schoolId && test.id) {
                try {
                    const cbtSnap = await db.ref(`cbtTeacherExams/${schoolId}/${test.id}`).once('value');
                    if (cbtSnap.exists()) {
                        isCbt = true;
                        test.isCbtExam = true;
                    }
                } catch (_) {}
            }

            setCbtScanButtonsVisibility(isCbt);

            const isFuture = (test.testDate > getTodayStr()) || test.status === 'scheduled';
            if (workspaceTitleText) workspaceTitleText.textContent = test.title || 'Scheduled Assessment';
            if (workspaceSubtitle) workspaceSubtitle.textContent = `${test.className} - Sec ${test.section} · ${test.subject} · Date: ${test.testDate} · Total: ${test.maxMarks} Marks`;
            if (workspaceStatusPill) {
                workspaceStatusPill.className = `tts-status-pill ${isFuture ? 'scheduled' : 'completed'}`;
                workspaceStatusPill.innerHTML = isFuture
                    ? `<i class="fas fa-clock"></i> Scheduled (${test.testDate})`
                    : `<i class="fas fa-check-circle"></i> Active / Completed`;
            }
            if (tabMarksLabel) {
                const shortTitle = (test.title || 'Test').length > 18 ? (test.title || 'Test').substring(0, 16) + '...' : (test.title || 'Test');
                tabMarksLabel.textContent = `Test: ${shortTitle}`;
            }

            // Restore Exam Settings
            if (examTypeSelect) examTypeSelect.value = test.examType || 'Unit Test';
            if (passingMarksInput) passingMarksInput.value = test.passingMarks !== undefined ? test.passingMarks : Math.round((test.maxMarks || 50) * 0.4);
            if (examDurationInput) {
                examDurationInput.value = test.durationMinutes || '60';
                durationChips.forEach(chip => chip.classList.toggle('active', chip.dataset.mins == (test.durationMinutes || '60')));
            }
            if (gradingScaleSelect) gradingScaleSelect.value = test.gradingScale || 'percentage';
            if (publishResultsSelect) publishResultsSelect.value = test.publishResults || 'immediate';
            if (negativeMarkingSelect) negativeMarkingSelect.value = test.negativeMarking !== undefined ? String(test.negativeMarking) : '0';
            if (assessmentComponentSelect) assessmentComponentSelect.value = test.assessmentComponent || 'Theory';
            if (weightageInput) weightageInput.value = test.weightage !== undefined ? test.weightage : '20';
            if (examInstructionsInput) examInstructionsInput.value = test.instructions || '';
            updatePassingCutoffBadge();

            // Select Class & Section
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
            editorView.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            setCbtScanButtonsVisibility(false);
            if (workspaceTitleText) workspaceTitleText.textContent = 'Create & Schedule New Assessment';
            if (workspaceSubtitle) workspaceSubtitle.textContent = 'Select class, section, subject, test date, rules, and enter student marks';
            if (workspaceStatusPill) {
                workspaceStatusPill.className = 'tts-status-pill';
                workspaceStatusPill.innerHTML = '<i class="fas fa-sparkles"></i> New Assessment';
            }
            if (tabMarksLabel) tabMarksLabel.textContent = 'Marks Entry';

            testTitleInput.value = '';
            dateInput.value = getTodayStr();
            updateDateNotice(dateInput.value);
            totalMarksInput.value = '50';

            // Reset exam settings
            if (examTypeSelect) examTypeSelect.value = 'Unit Test';
            if (passingMarksInput) passingMarksInput.value = '20';
            if (examDurationInput) {
                examDurationInput.value = '60';
                durationChips.forEach(chip => chip.classList.toggle('active', chip.dataset.mins === '60'));
            }
            if (gradingScaleSelect) gradingScaleSelect.value = 'percentage';
            if (publishResultsSelect) publishResultsSelect.value = 'immediate';
            if (negativeMarkingSelect) negativeMarkingSelect.value = '0';
            if (assessmentComponentSelect) assessmentComponentSelect.value = 'Theory';
            if (weightageInput) weightageInput.value = '20';
            if (examInstructionsInput) examInstructionsInput.value = '';
            if (searchInput) searchInput.value = '';
            studentSearchQuery = '';
            studentFilterStatus = 'all';
            filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
            updatePassingCutoffBadge();

            currentStudents = [];
            const sortedClasses = Array.from(myClassesMap.values());
            if (sortedClasses.length === 1) {
                const single = sortedClasses[0];
                classSelect.value = `${single.classId}:::${single.section}`;
                handleClassSelectionChange();
            } else {
                classSelect.value = '';
                subjectSelect.innerHTML = '<option value="">Select Subject...</option>';
                renderStudentsRoster([]);
                updateBottomBarVisibility();
            }
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

        // =========================================================================
        // CONTINUOUS CBT EXAM RESULTS QR SCANNER (BACKGROUND INGESTION ENGINE)
        // =========================================================================
        const CBT_QR_SYNC_SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';

        const scannerModal = panel.querySelector('#ttsScannerModal');
        const closeQrScannerBtn = panel.querySelector('#ttsCloseQrScannerBtn');
        const finishScanBtn = panel.querySelector('#ttsFinishScanBtn');
        const videoEl = panel.querySelector('#ttsQrVideo');
        const viewfinderEl = panel.querySelector('#ttsViewfinder');
        const flipCameraBtn = panel.querySelector('#ttsFlipCameraBtn');
        const torchBtn = panel.querySelector('#ttsTorchBtn');
        const uploadQrBtn = panel.querySelector('#ttsUploadQrBtn');
        const qrFileInput = panel.querySelector('#ttsQrFileInput');
        const muteScanBtn = panel.querySelector('#ttsMuteScanBtn');
        const scanCountEl = panel.querySelector('#ttsQrScanCount');
        const scannerLogList = panel.querySelector('#ttsScannerLogList');
        const scannerHint = panel.querySelector('#ttsScannerHint');

        let scannerActive = false;
        let cameraStream = null;
        let currentFacingMode = 'environment';
        let torchActive = false;
        let scanSoundMuted = false;
        let sessionScannedCount = 0;
        let scanAnimFrameId = null;
        let isProcessingFrame = false;
        const scannedCooldowns = new Map();

        const scanCanvas = document.createElement('canvas');
        const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
        let barcodeDetector = null;
        if ('BarcodeDetector' in window) {
            try {
                barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
            } catch (_) { barcodeDetector = null; }
        }

        let audioCtx = null;
        function playScanBeep(success = true) {
            if (scanSoundMuted) return;
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                if (success) {
                    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
                    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.12);
                } else {
                    osc.frequency.setValueAtTime(280, audioCtx.currentTime);
                    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.2);
                }
            } catch (_) {}
        }

        async function decryptSyncPayload(rawQrText) {
            if (!rawQrText || !rawQrText.startsWith('ROLLCALL_SYNC_V1:')) {
                throw new Error('QR code is not in RollCall CBT encrypted format.');
            }
            const b64 = rawQrText.substring('ROLLCALL_SYNC_V1:'.length).trim();
            const binaryStr = atob(b64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            if (bytes.length < 17) {
                throw new Error('Encrypted payload too short.');
            }
            const iv = bytes.slice(0, 16);
            const ciphertext = bytes.slice(16);

            const enc = new TextEncoder();
            const saltBytes = enc.encode(CBT_QR_SYNC_SALT);
            const keyHash = await crypto.subtle.digest('SHA-256', saltBytes);
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                keyHash,
                { name: 'AES-CBC' },
                false,
                ['decrypt']
            );

            const decryptedBuf = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: iv },
                cryptoKey,
                ciphertext
            );

            if (typeof window.fflate === 'undefined' || typeof window.fflate.decompressSync !== 'function') {
                throw new Error('fflate decompression library not loaded.');
            }

            const decompressed = window.fflate.decompressSync(new Uint8Array(decryptedBuf));
            const jsonStr = new TextDecoder('utf-8').decode(decompressed);
            return JSON.parse(jsonStr);
        }

        function appendScannerLog(itemHtml) {
            const emptyNotice = scannerLogList.querySelector('#ttsScannerLogEmpty');
            if (emptyNotice) emptyNotice.remove();
            const el = document.createElement('div');
            el.className = 'tts-scanner-log-item';
            el.innerHTML = itemHtml;
            scannerLogList.insertBefore(el, scannerLogList.firstChild);
            while (scannerLogList.children.length > 50) {
                scannerLogList.removeChild(scannerLogList.lastChild);
            }
        }

        async function processDecryptedPayload(payload) {
            const records = Array.isArray(payload.records) ? payload.records : [];
            if (!records.length) {
                appendScannerLog(`
                    <div><i class="fas fa-triangle-exclamation" style="color:#eab308;"></i> <strong>Empty Package</strong>: No student test records found.</div>
                    <small style="color:#94a3b8;">${new Date().toLocaleTimeString()}</small>
                `);
                return;
            }

            // 1. Strict School Code Verification. CBT stores the license school code,
            // while the teacher portal may identify the same school by its Firebase
            // schoolId or institutionCode. Treat only known session identifiers as
            // aliases; never disable the school boundary check.
            const normalizeSchoolCode = value => String(value ?? '')
                .trim()
                .toUpperCase()
                .replace(/\s+/g, '');
            const activeSchoolCodes = [
                currentTeacher?.schoolCode,
                currentTeacher?.institutionCode,
                currentTeacher?.schoolId,
                currentTeacher?.schoolRecordCode,
                window.currentTeacher?.schoolCode,
                window.currentTeacher?.institutionCode,
                window.currentTeacher?.schoolId,
                window.currentTeacher?.schoolRecordCode,
                window.currentSchoolCode,
                window.currentSchoolId,
                window.currentSchool?.schoolCode,
                window.currentSchool?.institutionCode,
                window.currentSchool?.id,
                window.rollCallAdminMode?.schoolCode,
                window.rollCallAdminMode?.institutionCode,
                window.rollCallAdminMode?.schoolId,
                schoolId
            ].map(normalizeSchoolCode).filter(Boolean);
            const uniqueActiveSchoolCodes = [...new Set(activeSchoolCodes)];
            const incomingSchoolCode = normalizeSchoolCode(payload.schoolCode);
            const isMatch = !incomingSchoolCode ||
                !uniqueActiveSchoolCodes.length ||
                uniqueActiveSchoolCodes.includes(incomingSchoolCode);

            console.info('[CBT QR] school verification', {
                incomingSchoolCode: incomingSchoolCode || '(missing)',
                activeSchoolCodes: uniqueActiveSchoolCodes,
                schoolId: normalizeSchoolCode(schoolId),
                examId: payload.examId || '',
                examCode: payload.examCode || ''
            });

            if (incomingSchoolCode && uniqueActiveSchoolCodes.length && !isMatch) {
                playScanBeep(false);
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-shield-xmark" style="color:#ef4444;"></i> <strong>Security Error:</strong> School code mismatch!`;
                }
                appendScannerLog(`
                    <div style="color:#dc2626; font-weight:700;">
                        <i class="fas fa-ban"></i> <strong>School Code Mismatch</strong>: Barcode issued for "${escapeHtml(incomingSchoolCode)}", but current school session has no matching school identifier. Ingestion rejected.
                    </div>
                    <small style="color:#94a3b8;">${new Date().toLocaleTimeString()}</small>
                `);
                alert(`Security Verification Failed:\n\nThis QR barcode was generated for school code "${incomingSchoolCode}".\n\nThe active teacher session has no matching school identifier. Ingestion has been rejected.`);
                return;
            }

            // Visual flash & sound chime
            viewfinderEl?.classList.add('flash-success');
            setTimeout(() => viewfinderEl?.classList.remove('flash-success'), 650);
            playScanBeep(true);

            let matchedCount = 0;
            let unmatchedCount = 0;

            records.forEach(rec => {
                const recRoll = String(rec.roll || '').trim().toLowerCase();
                const recName = String(rec.name || '').trim().toLowerCase();

                let student = null;
                let conflictReason = '';

                // Strategy 1: Match by Roll Number first
                if (recRoll) {
                    const rollMatches = currentStudents.filter(s => {
                        const sRoll = String(s.classRoll || s.univRoll || s.rollNo || '').trim().toLowerCase();
                        return sRoll && sRoll === recRoll;
                    });

                    if (rollMatches.length === 1) {
                        const cand = rollMatches[0];
                        const candName = String(cand.name || cand.displayName || '').trim().toLowerCase();
                        // Cross-verify with candidate name if provided in QR
                        if (recName && candName) {
                            const recTokens = recName.split(/\s+/).filter(t => t.length > 2);
                            const candTokens = candName.split(/\s+/).filter(t => t.length > 2);
                            const hasOverlap = recTokens.some(t => candTokens.includes(t)) || candName.includes(recName) || recName.includes(candName);
                            if (!hasOverlap && recTokens.length > 0 && candTokens.length > 0) {
                                conflictReason = `Roll #${rec.roll} is enrolled as "${cand.name || candName}", but QR barcode name is "${rec.name}".`;
                            } else {
                                student = cand;
                            }
                        } else {
                            student = cand;
                        }
                    } else if (rollMatches.length > 1) {
                        // Multiple students share same roll number - must match name to disambiguate!
                        if (recName) {
                            student = rollMatches.find(s => {
                                const sName = String(s.name || s.displayName || '').trim().toLowerCase();
                                return sName && (sName === recName || sName.includes(recName) || recName.includes(sName));
                            });
                        }
                        if (!student) {
                            conflictReason = `Multiple students found with Roll #${rec.roll}. Name verification could not disambiguate.`;
                        }
                    }
                }

                // Strategy 2: If no roll matched or roll missing, attempt matching by Name
                if (!student && !conflictReason && recName) {
                    const nameMatches = currentStudents.filter(s => {
                        const sName = String(s.name || s.displayName || '').trim().toLowerCase();
                        return sName && (sName === recName || sName.includes(recName) || recName.includes(sName));
                    });

                    if (nameMatches.length === 1) {
                        student = nameMatches[0];
                    } else if (nameMatches.length > 1) {
                        // CRITICAL: Multiple students have identical/duplicate names in this class!
                        // Do NOT guess! Block match to protect student grades!
                        conflictReason = `Ambiguous Match: ${nameMatches.length} students named "${rec.name}" found in this class. Roll number is required to disambiguate.`;
                    }
                }

                if (conflictReason) {
                    unmatchedCount++;
                    appendScannerLog(`
                        <div>
                            <span style="color:#dc2626; font-weight:700;"><i class="fas fa-triangle-exclamation"></i> Verification Conflict</span>
                            <div style="font-size:0.74rem; color:#475569; margin-top:2px;">${escapeHtml(conflictReason)}</div>
                            <span style="display:inline-block; margin-top:3px; background:#fee2e2; color:#b91c1c; font-size:0.70rem; padding:1px 6px; border-radius:4px; font-weight:600;">Score (${rec.score}) Skipped</span>
                        </div>
                        <small style="color:#ef4444;">Verification Failed</small>
                    `);
                    return;
                }

                if (student) {
                    matchedCount++;
                    const uid = student.id;
                    const inp = panel.querySelector(`#ttsScoreInp_${uid}`);
                    const row = panel.querySelector(`#ttsRow_${uid}`);
                    const abBtn = panel.querySelector(`#ttsAbBtn_${uid}`);

                    if (abBtn && abBtn.classList.contains('active')) {
                        abBtn.classList.remove('active');
                        row?.classList.remove('is-absent');
                        if (inp) inp.disabled = false;
                    }

                    if (inp) {
                        inp.value = rec.score;
                        updateStudentScoreBadge(inp);
                    }

                    if (row) {
                        row.classList.add('tts-score-just-scanned');
                        setTimeout(() => row.classList.remove('tts-score-just-scanned'), 1600);
                    }

                    sessionScannedCount++;
                    if (scanCountEl) scanCountEl.textContent = sessionScannedCount;

                    const studentRoll = student.classRoll || student.univRoll || student.rollNo || rec.roll || 'N/A';
                    appendScannerLog(`
                        <div>
                            <span style="color:#15803d; font-weight:700;"><i class="fas fa-circle-check"></i> Roll #${escapeHtml(studentRoll)}</span>
                            <span style="color:#0f172a; margin-left:6px; font-weight:600;">${escapeHtml(student.name || rec.name)}</span>
                            <span style="margin-left:6px; background:#dcfce7; color:#15803d; padding:1px 6px; border-radius:4px; font-weight:700;">${rec.score} Marks</span>
                        </div>
                        <small style="color:#64748b; font-family:monospace;">${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</small>
                    `);
                } else {
                    unmatchedCount++;
                    appendScannerLog(`
                        <div>
                            <span style="color:#b45309; font-weight:700;"><i class="fas fa-triangle-exclamation"></i> Roll #${escapeHtml(rec.roll || 'N/A')}</span>
                            <span style="color:#475569; margin-left:6px;">${escapeHtml(rec.name || 'Candidate')}</span>
                            <span style="margin-left:6px; background:#fef3c7; color:#b45309; padding:1px 6px; border-radius:4px; font-weight:600;">${rec.score} Marks (Unmatched)</span>
                        </div>
                        <small style="color:#94a3b8;">Not in roster</small>
                    `);
                }
            });

            if (scannerHint) {
                scannerHint.innerHTML = `<i class="fas fa-circle-check" style="color:#4ade80;"></i> Ingested <strong>${matchedCount}</strong> score${matchedCount === 1 ? '' : 's'}${unmatchedCount > 0 ? ` (${unmatchedCount} unmatched/conflict)` : ''}. Keep scanning...`;
            }

            // Real-time roster calculation & draft update
            applyStudentFiltering();
            updateSummaryCounters();
            scheduleAutoDraftSave();

            // Live sync to test tile / card
            if (activeEditingTestId) {
                const activeTest = testsList.find(t => t.id === activeEditingTestId);
                if (activeTest) {
                    let count = 0;
                    currentStudents.forEach(st => {
                        const inp = panel.querySelector(`#ttsScoreInp_${st.id}`);
                        const abBtn = panel.querySelector(`#ttsAbBtn_${st.id}`);
                        if (abBtn && abBtn.classList.contains('active')) count++;
                        else if (inp && inp.value.trim() !== '' && !isNaN(parseFloat(inp.value))) count++;
                    });
                    activeTest.scoredCount = count;
                    if (schoolId) {
                        db.ref(`schoolTests/${schoolId}/${activeEditingTestId}/scoredCount`).set(count).catch(() => {});
                    }
                    renderHistoryView();
                    updateTeacherStats();
                }
            }
        }

        async function handleScannedString(rawText) {
            if (!rawText) return;
            const now = Date.now();
            if (scannedCooldowns.has(rawText) && (now - scannedCooldowns.get(rawText) < 3200)) {
                return;
            }
            scannedCooldowns.set(rawText, now);

            if (!rawText.startsWith('ROLLCALL_SYNC_V1:')) {
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-shield-xmark" style="color:#f87171;"></i> Scanned standard QR. Only RollCall CBT encrypted barcodes are accepted.`;
                }
                playScanBeep(false);
                return;
            }

            try {
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:#60a5fa;"></i> Decrypting AES-256 payload...`;
                }
                const payload = await decryptSyncPayload(rawText);
                await processDecryptedPayload(payload);
            } catch (err) {
                console.warn('Decryption error:', err);
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#f87171;"></i> Failed to decrypt CBT QR: ${escapeHtml(err.message)}`;
                }
                playScanBeep(false);
            }
        }

        function scanNextFrame() {
            if (!scannerActive) return;

            if (videoEl && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && !isProcessingFrame) {
                scanCanvas.width = videoEl.videoWidth;
                scanCanvas.height = videoEl.videoHeight;
                scanCtx.drawImage(videoEl, 0, 0, scanCanvas.width, scanCanvas.height);

                if (barcodeDetector) {
                    isProcessingFrame = true;
                    barcodeDetector.detect(scanCanvas).then(barcodes => {
                        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                            handleScannedString(barcodes[0].rawValue);
                        }
                    }).catch(() => {}).finally(() => {
                        isProcessingFrame = false;
                    });
                } else if (typeof window.jsQR === 'function') {
                    try {
                        const imgData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
                        const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
                            inversionAttempts: 'dontInvert'
                        });
                        if (code && code.data) {
                            handleScannedString(code.data);
                        }
                    } catch (_) {}
                }
            }

            scanAnimFrameId = requestAnimationFrame(scanNextFrame);
        }

        async function startContinuousScanner() {
            if (!classSelect.value) {
                alert('Please select a Class & Section first so scanned scores can be matched to enrolled students.');
                classSelect.focus();
                return;
            }

            if (currentStudents.length === 0) {
                await ensureStudentsLoaded();
            }

            scannerModal.style.display = 'flex';
            if (scannerHint) {
                scannerHint.innerHTML = `<i class="fas fa-camera"></i> Starting camera... Point at CBT result QR.`;
            }

            const constraints = {
                video: {
                    facingMode: currentFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            try {
                if (cameraStream) {
                    cameraStream.getTracks().forEach(t => t.stop());
                }
                cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                videoEl.srcObject = cameraStream;
                await videoEl.play();
                scannerActive = true;
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-camera"></i> Camera active. Scanning continuously in background...`;
                }
                scanNextFrame();
            } catch (err) {
                console.error('Camera access error:', err);
                scannerActive = false;
                if (scannerHint) {
                    scannerHint.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i> Camera unavailable (${escapeHtml(err.message)}). Use "Upload Image" below.`;
                }
            }
        }

        function stopContinuousScanner() {
            scannerActive = false;
            if (scanAnimFrameId) {
                cancelAnimationFrame(scanAnimFrameId);
                scanAnimFrameId = null;
            }
            if (cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
                cameraStream = null;
            }
            if (videoEl) {
                videoEl.srcObject = null;
            }
            torchActive = false;
            torchBtn?.classList.remove('active');
            scannerModal.style.display = 'none';
        }

        // Scanner Event Listeners
        openQrScannerBtn?.addEventListener('click', () => startContinuousScanner());
        rosterScanQrBtn?.addEventListener('click', () => startContinuousScanner());
        closeQrScannerBtn?.addEventListener('click', () => stopContinuousScanner());
        finishScanBtn?.addEventListener('click', () => {
            stopContinuousScanner();
            markUnscannedAsAbsent();
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && scannerModal.style.display === 'flex') {
                stopContinuousScanner();
            }
        });

        // Flip Camera (Front / Back)
        flipCameraBtn?.addEventListener('click', async () => {
            currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
            if (scannerActive) {
                await startContinuousScanner();
            }
        });

        // Torch / Flashlight toggle
        torchBtn?.addEventListener('click', async () => {
            const track = cameraStream?.getVideoTracks()?.[0];
            if (!track) return;
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            if (!capabilities.torch) {
                alert('Flashlight / torch is not supported on this camera.');
                return;
            }
            try {
                torchActive = !torchActive;
                await track.applyConstraints({
                    advanced: [{ torch: torchActive }]
                });
                torchBtn.classList.toggle('active', torchActive);
            } catch (err) {
                console.warn('Torch toggle failed:', err);
            }
        });

        // Sound Mute Toggle
        muteScanBtn?.addEventListener('click', () => {
            scanSoundMuted = !scanSoundMuted;
            muteScanBtn.innerHTML = scanSoundMuted
                ? '<i class="fas fa-volume-xmark" style="color:#ef4444;"></i>'
                : '<i class="fas fa-volume-high"></i>';
        });

        // Upload Image Fallback
        uploadQrBtn?.addEventListener('click', () => {
            qrFileInput?.click();
        });

        qrFileInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = '';

            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = async () => {
                    scanCanvas.width = img.naturalWidth || img.width;
                    scanCanvas.height = img.naturalHeight || img.height;
                    scanCtx.drawImage(img, 0, 0, scanCanvas.width, scanCanvas.height);

                    let detectedText = null;
                    if (barcodeDetector) {
                        try {
                            const codes = await barcodeDetector.detect(scanCanvas);
                            if (codes && codes.length > 0) detectedText = codes[0].rawValue;
                        } catch (_) {}
                    }
                    if (!detectedText && typeof window.jsQR === 'function') {
                        try {
                            const imgData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
                            const qr = window.jsQR(imgData.data, imgData.width, imgData.height);
                            if (qr && qr.data) detectedText = qr.data;
                        } catch (_) {}
                    }

                    if (detectedText) {
                        scannedCooldowns.delete(detectedText);
                        await handleScannedString(detectedText);
                    } else {
                        if (scannerHint) {
                            scannerHint.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i> Could not find a clear QR barcode in the uploaded image.`;
                        }
                        playScanBeep(false);
                    }
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

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
