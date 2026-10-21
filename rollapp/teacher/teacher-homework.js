// ==========================================================================
// Teacher Portal - Homework & Assignments Management Module
// Allows subject teachers to assign and manage homework for their classes.
// ==========================================================================
(() => {
    function initializeTeacherHomework() {
        const sidebar = document.querySelector('.sidebar-menu');
        const container = document.querySelector('.main-content .container') || document.querySelector('.main-content');
        if (!sidebar || !container) return;
        if (!window.firebase?.database || !window.firebase?.auth) {
            window.addEventListener('load', initializeTeacherHomework, { once: true });
            return;
        }

        // Avoid duplicate initialization
        if (document.getElementById('homeworkSection')) return;

        // Inject Modern Styles
        const style = document.createElement('style');
        style.id = 'teacher-homework-styles';
        style.textContent = `
            .thm-shell {
                max-width: 1200px;
                margin: 0 auto;
                color: #1e293b;
                padding-bottom: 40px;
            }
            .thm-hero {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 20px;
                margin: 16px 0 20px;
                padding: 24px 28px;
                border: 1px solid #dcebe0;
                border-radius: 20px;
                background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
                box-shadow: 0 10px 28px rgba(22, 101, 52, 0.06);
            }
            .thm-hero-title h2 {
                margin: 0 0 6px 0;
                color: #14532d;
                font-size: 1.55rem;
                font-weight: 800;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .thm-hero-title p {
                margin: 0;
                color: #4b5563;
                font-size: 0.90rem;
                line-height: 1.5;
            }
            .thm-btn-primary {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 11px 20px;
                border: none;
                border-radius: 10px;
                background: #166534;
                color: #ffffff;
                font-size: 0.88rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 12px rgba(22, 101, 52, 0.25);
                white-space: nowrap;
            }
            .thm-btn-primary:hover {
                background: #14532d;
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(22, 101, 52, 0.35);
            }
            .thm-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 14px;
                margin-bottom: 20px;
            }
            .thm-stat-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.03);
            }
            .thm-stat-icon {
                width: 44px;
                height: 44px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
                flex-shrink: 0;
            }
            .thm-stat-icon.green { background: #dcfce7; color: #166534; }
            .thm-stat-icon.amber { background: #fef3c7; color: #b45309; }
            .thm-stat-icon.blue { background: #e0f2fe; color: #0369a1; }
            .thm-stat-icon.purple { background: #f3e8ff; color: #7e22ce; }
            .thm-stat-meta .thm-stat-val {
                font-size: 1.45rem;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.1;
            }
            .thm-stat-meta .thm-stat-lbl {
                font-size: 0.74rem;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-top: 2px;
            }
            .thm-toolbar {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 14px 18px;
                margin-bottom: 20px;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
            }
            .thm-filter-group {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
                flex: 1;
            }
            .thm-select, .thm-input {
                height: 38px;
                padding: 0 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                background: #ffffff;
                color: #1e293b;
                font-size: 0.84rem;
                outline: none;
                transition: border-color 0.2s ease;
            }
            .thm-select:focus, .thm-input:focus {
                border-color: #166534;
                box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
            }
            .thm-search-wrap {
                position: relative;
                min-width: 220px;
            }
            .thm-search-wrap i {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #94a3b8;
                font-size: 0.82rem;
            }
            .thm-search-wrap input {
                padding-left: 34px;
                width: 100%;
            }
            .thm-status-tabs {
                display: inline-flex;
                background: #f1f5f9;
                border-radius: 8px;
                padding: 3px;
                gap: 4px;
            }
            .thm-tab-btn {
                padding: 6px 12px;
                border: none;
                background: transparent;
                border-radius: 6px;
                font-size: 0.78rem;
                font-weight: 600;
                color: #64748b;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .thm-tab-btn.active {
                background: #ffffff;
                color: #166534;
                box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            }
            .thm-cards-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                gap: 16px;
            }
            .thm-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 18px 20px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-shadow: 0 4px 14px rgba(0,0,0,0.04);
                transition: all 0.2s ease;
                position: relative;
                border-top: 4px solid #166534;
            }
            .thm-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 22px rgba(0,0,0,0.08);
            }
            .thm-card-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 12px;
            }
            .thm-badge-class {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 3px 9px;
                border-radius: 6px;
                font-size: 0.74rem;
                font-weight: 700;
                background: #f1f5f9;
                color: #334155;
            }
            .thm-badge-subject {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 3px 9px;
                border-radius: 6px;
                font-size: 0.74rem;
                font-weight: 700;
                background: #e0f2fe;
                color: #0369a1;
            }
            .thm-badge-status {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.70rem;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 999px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }
            .thm-badge-status.active { background: #dcfce7; color: #166534; }
            .thm-badge-status.today { background: #fef3c7; color: #b45309; }
            .thm-badge-status.past { background: #fee2e2; color: #b91c1c; }
            .thm-card-title {
                font-size: 1.05rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 8px 0;
                line-height: 1.35;
            }
            .thm-card-desc {
                font-size: 0.84rem;
                color: #475569;
                line-height: 1.5;
                margin: 0 0 14px 0;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                white-space: pre-wrap;
            }
            .thm-card-due-box {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 9px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.78rem;
                margin-bottom: 14px;
            }
            .thm-due-label {
                color: #64748b;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .thm-due-val {
                font-weight: 700;
                color: #0f172a;
            }
            .thm-card-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                border-top: 1px dashed #e2e8f0;
                padding-top: 12px;
            }
            .thm-action-btn {
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 7px 12px;
                font-size: 0.78rem;
                font-weight: 600;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #334155;
            }
            .thm-action-btn:hover {
                border-color: #166534;
                color: #166534;
                background: #f0fdf4;
            }
            .thm-action-btn.delete {
                flex: 0 0 auto;
                color: #dc2626;
                border-color: #fecaca;
            }
            .thm-action-btn.delete:hover {
                background: #fee2e2;
                border-color: #ef4444;
            }
            .thm-empty {
                grid-column: 1 / -1;
                background: #ffffff;
                border: 2px dashed #cbd5e1;
                border-radius: 16px;
                padding: 48px 20px;
                text-align: center;
            }
            .thm-empty-icon {
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: #dcfce7;
                color: #166534;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
                margin-bottom: 14px;
            }
            .thm-empty h3 {
                margin: 0 0 6px 0;
                color: #0f172a;
                font-size: 1.15rem;
                font-weight: 800;
            }
            .thm-empty p {
                margin: 0 0 16px 0;
                color: #64748b;
                font-size: 0.88rem;
            }
            /* Modal Styles */
            .thm-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(4px);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 16px;
            }
            .thm-modal-overlay.active { display: flex; }
            .thm-modal-card {
                background: #ffffff;
                border-radius: 18px;
                max-width: 580px;
                width: 100%;
                max-height: 92vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                display: flex;
                flex-direction: column;
            }
            .thm-modal-header {
                padding: 18px 24px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #f8fafc;
                border-radius: 18px 18px 0 0;
            }
            .thm-modal-header h3 {
                margin: 0;
                color: #14532d;
                font-size: 1.12rem;
                font-weight: 800;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .thm-modal-close {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                cursor: pointer;
                color: #64748b;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .thm-modal-close:hover {
                background: #fee2e2;
                color: #dc2626;
                border-color: #ef4444;
            }
            .thm-modal-body {
                padding: 22px 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .thm-form-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .thm-form-group label {
                font-size: 0.78rem;
                font-weight: 700;
                color: #334155;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }
            .thm-form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            .thm-textarea {
                min-height: 100px;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-family: inherit;
                font-size: 0.85rem;
                outline: none;
                resize: vertical;
            }
            .thm-textarea:focus {
                border-color: #166534;
                box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
            }
            .thm-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                background: #f8fafc;
                border-radius: 0 0 18px 18px;
            }
            .thm-btn-cancel {
                padding: 9px 16px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                border-radius: 8px;
                font-size: 0.84rem;
                font-weight: 600;
                color: #475569;
                cursor: pointer;
            }
            .thm-btn-cancel:hover {
                background: #f1f5f9;
            }
            @media (max-width: 640px) {
                .thm-hero {
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 18px;
                }
                .thm-btn-primary {
                    width: 100%;
                    justify-content: center;
                }
                .thm-toolbar {
                    flex-direction: column;
                    align-items: stretch;
                }
                .thm-filter-group {
                    flex-direction: column;
                }
                .thm-search-wrap, .thm-select {
                    width: 100%;
                }
                .thm-form-row {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);

        // Add menu item in sidebar if missing
        let nav = sidebar.querySelector('[data-section="homework"]');
        if (!nav) {
            nav = document.createElement('div');
            nav.className = 'menu-item';
            nav.dataset.section = 'homework';
            nav.innerHTML = '<i class="fas fa-book-bookmark"></i><span>Homework</span>';
            
            // Insert right after classes or timetable
            const anchor = sidebar.querySelector('[data-section="timetable"]') ||
                           sidebar.querySelector('[data-section="classes"]') ||
                           sidebar.querySelector('[data-section="settings"]');
            if (anchor && anchor.nextSibling) {
                sidebar.insertBefore(nav, anchor.nextSibling);
            } else if (anchor) {
                sidebar.insertBefore(nav, anchor);
            } else {
                sidebar.appendChild(nav);
            }
        }

        // Add Section Panel Container
        const panel = document.createElement('section');
        panel.id = 'homeworkSection';
        panel.className = 'section-container';
        panel.setAttribute('aria-label', 'Homework Management');
        panel.innerHTML = `
            <div class="thm-shell">
                <div class="thm-hero">
                    <div class="thm-hero-title">
                        <h2><i class="fas fa-book-bookmark"></i> Class Homework & Assignments</h2>
                        <p>Assign homework to your classes and track student tasks in real-time.</p>
                    </div>
                    <button type="button" class="thm-btn-primary" id="thmCreateBtn">
                        <i class="fas fa-plus"></i> Assign New Homework
                    </button>
                </div>

                <div class="thm-stats-grid">
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon green"><i class="fas fa-list-check"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatActive">0</div>
                            <div class="thm-stat-lbl">Active Homework</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon amber"><i class="fas fa-clock"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatToday">0</div>
                            <div class="thm-stat-lbl">Due Today</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon blue"><i class="fas fa-chalkboard-user"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatClasses">0</div>
                            <div class="thm-stat-lbl">Classes Covered</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon purple"><i class="fas fa-layer-group"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatTotal">0</div>
                            <div class="thm-stat-lbl">Total Assigned</div>
                        </div>
                    </div>
                </div>

                <div class="thm-toolbar">
                    <div class="thm-filter-group">
                        <select class="thm-select" id="thmFilterClass">
                            <option value="">All My Classes</option>
                        </select>
                        <select class="thm-select" id="thmFilterSubject">
                            <option value="">All Subjects</option>
                        </select>
                        <div class="thm-status-tabs">
                            <button type="button" class="thm-tab-btn active" data-status="all">All</button>
                            <button type="button" class="thm-tab-btn" data-status="active">Active</button>
                            <button type="button" class="thm-tab-btn" data-status="past">Past Due</button>
                        </div>
                    </div>
                    <div class="thm-search-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" class="thm-input" id="thmSearchInput" placeholder="Search homework...">
                    </div>
                </div>

                <div class="thm-cards-grid" id="thmCardsGrid">
                    <div class="thm-empty">
                        <div class="thm-empty-icon"><i class="fas fa-spinner fa-spin"></i></div>
                        <h3>Loading assignments...</h3>
                    </div>
                </div>
            </div>

            <!-- Create / Edit Homework Modal -->
            <div class="thm-modal-overlay" id="thmModal">
                <div class="thm-modal-card">
                    <div class="thm-modal-header">
                        <h3 id="thmModalTitle"><i class="fas fa-pencil"></i> Assign New Homework</h3>
                        <button type="button" class="thm-modal-close" id="thmModalCloseBtn">&times;</button>
                    </div>
                    <form id="thmForm">
                        <input type="hidden" id="thmEditId" value="">
                        <div class="thm-modal-body">
                            <div class="thm-form-row">
                                <div class="thm-form-group">
                                    <label for="thmFormClass"><i class="fas fa-chalkboard"></i> Target Class & Section *</label>
                                    <select class="thm-select" id="thmFormClass" required>
                                        <option value="">Select Class & Section</option>
                                    </select>
                                </div>
                                <div class="thm-form-group">
                                    <label for="thmFormSubject"><i class="fas fa-book"></i> Subject *</label>
                                    <input type="text" class="thm-input" id="thmFormSubject" required placeholder="e.g. Mathematics, Physics">
                                </div>
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormTitle"><i class="fas fa-heading"></i> Homework Title / Topic *</label>
                                <input type="text" class="thm-input" id="thmFormTitle" required placeholder="e.g. Chapter 4: Calculus Practice Problems">
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormDesc"><i class="fas fa-align-left"></i> Assignment Details & Instructions *</label>
                                <textarea class="thm-textarea" id="thmFormDesc" required placeholder="Specify question numbers, exercises, reading materials, or instructions for the students..."></textarea>
                            </div>

                            <div class="thm-form-row">
                                <div class="thm-form-group">
                                    <label for="thmFormDueDate"><i class="fas fa-calendar-day"></i> Due Date *</label>
                                    <input type="date" class="thm-input" id="thmFormDueDate" required>
                                </div>
                                <div class="thm-form-group">
                                    <label for="thmFormDueTime"><i class="fas fa-clock"></i> Due Time *</label>
                                    <input type="time" class="thm-input" id="thmFormDueTime" value="23:59" required>
                                </div>
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormNote"><i class="fas fa-note-sticky"></i> Submission Note / Instructions (Optional)</label>
                                <input type="text" class="thm-input" id="thmFormNote" placeholder="e.g. Submit in assignment notebook in next period">
                            </div>
                        </div>
                        <div class="thm-modal-footer">
                            <button type="button" class="thm-btn-cancel" id="thmModalCancelBtn">Cancel</button>
                            <button type="submit" class="thm-btn-primary" id="thmModalSubmitBtn">
                                <i class="fas fa-paper-plane"></i> Publish Homework
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        container.appendChild(panel);

        // Sidebar click handler
        nav.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.switchTeacherSection === 'function') {
                window.switchTeacherSection('homework');
            } else {
                document.querySelectorAll('.main-content .section-container').forEach(s => s.classList.remove('active'));
                panel.classList.add('active');
                sidebar.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                nav.classList.add('active');
            }
        });

        // App state
        let currentTeacher = null;
        let schoolId = '';
        let myClassesMap = new Map(); // key -> { classId, className, section, year, subject }
        let homeworkList = [];
        let activeStatusFilter = 'all';

        const db = firebase.database();

        function safeKey(str) {
            return String(str || '').replace(/[.#$\[\]/]/g, '_').trim();
        }

        function normSec(sec) {
            return String(sec || '').trim().replace(/^section\s+/i, '').toUpperCase();
        }

        function formatDisplayDate(dateStr, timeStr) {
            if (!dateStr) return '';
            const dt = new Date(`${dateStr}T${timeStr || '23:59'}`);
            if (isNaN(dt.getTime())) return dateStr;
            return dt.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }) + (timeStr ? ` at ${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '');
        }

        function getDueStatus(dateStr, timeStr) {
            if (!dateStr) return { status: 'active', label: 'Active', cls: 'active' };
            const due = new Date(`${dateStr}T${timeStr || '23:59'}`);
            const now = new Date();
            const diffHours = (due - now) / (1000 * 60 * 60);

            if (diffHours < 0) {
                return { status: 'past', label: 'Past Due', cls: 'past' };
            }
            if (due.toDateString() === now.toDateString() || (diffHours >= 0 && diffHours <= 18)) {
                return { status: 'today', label: 'Due Today', cls: 'today' };
            }
            return { status: 'active', label: 'Active', cls: 'active' };
        }

        // Resolves teacher's classes across all RTDB assignments
        async function loadTeacherClasses(user, profile) {
            schoolId = profile.schoolId || '';
            if (!schoolId) return;

            myClassesMap.clear();

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
                const schoolClasses = schoolClassesSnap.val() || {};
                const subjAssignments = subjAssignSnap.val() || {};
                const ctAssignments = classTeacherSnap.val() || {};
                const timetables = timetablesSnap.val() || {};

                const teacherDefaultSubject = profile.subject || profile.department || '';

                // 1. Subject Teacher Assignments
                Object.entries(subjAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, subjects]) => {
                        Object.entries(subjects || {}).forEach(([subKey, item]) => {
                            if (item?.teacherId === user.uid || item?.teacherEmail === user.email) {
                                const className = item.className || courses[clsId]?.courseName || 'Class';
                                const section = item.section || secKey;
                                const key = `${clsId}_${normSec(section)}`;
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className,
                                    section: normSec(section),
                                    year: item.year || '',
                                    subject: item.subjectName || item.subject || teacherDefaultSubject
                                });
                            }
                        });
                    });
                });

                // 2. Class Teacher Assignments
                Object.entries(ctAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, item]) => {
                        if (item?.teacherId === user.uid) {
                            const className = item.className || courses[clsId]?.courseName || 'Class';
                            const section = item.section || secKey;
                            const key = `${clsId}_${normSec(section)}`;
                            if (!myClassesMap.has(key)) {
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className,
                                    section: normSec(section),
                                    year: item.year || '',
                                    subject: teacherDefaultSubject
                                });
                            }
                        }
                    });
                });

                // 3. Timetable Slots
                Object.entries(timetables).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, schedule]) => {
                        const sec = schedule.section || secKey;
                        const key = `${clsId}_${normSec(sec)}`;
                        Object.values(schedule?.slots || {}).forEach(periods => {
                            Object.values(periods || {}).forEach(slot => {
                                if (slot?.teacherId === user.uid) {
                                    const className = schedule.className || courses[clsId]?.courseName || 'Class';
                                    const existing = myClassesMap.get(key) || {
                                        classId: clsId,
                                        className,
                                        section: normSec(sec),
                                        year: schedule.year || '',
                                        subject: slot.subject || teacherDefaultSubject
                                    };
                                    if (slot.subject && !existing.subject) {
                                        existing.subject = slot.subject;
                                    }
                                    myClassesMap.set(key, existing);
                                }
                            });
                        });
                    });
                });

                // 4. Fallback from SchoolClasses or Courses if empty
                if (myClassesMap.size === 0) {
                    Object.entries(schoolClasses).forEach(([clsId, clsData]) => {
                        if (clsData.teacherId === user.uid || clsData.teacherEmail === user.email || !clsData.teacherId) {
                            const secs = Array.isArray(clsData.sections) ? clsData.sections : (clsData.section ? [clsData.section] : ['A']);
                            secs.forEach(s => {
                                const key = `${clsId}_${normSec(s)}`;
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className: clsData.className || clsData.name || 'Class',
                                    section: normSec(s),
                                    year: '',
                                    subject: clsData.subject || teacherDefaultSubject
                                });
                            });
                        }
                    });
                }

                // If still empty, add default assigned class from profile
                if (myClassesMap.size === 0 && (profile.assignedClass || profile.className)) {
                    const assignedSecs = Array.isArray(profile.assignedSections) ? profile.assignedSections : (profile.section ? [profile.section] : ['A']);
                    assignedSecs.forEach(s => {
                        const key = `class_${normSec(s)}`;
                        myClassesMap.set(key, {
                            classId: profile.classId || '',
                            className: profile.assignedClass || profile.className || 'Class',
                            section: normSec(s),
                            year: '',
                            subject: teacherDefaultSubject
                        });
                    });
                }
            } catch (err) {
                console.warn('Could not populate teacher classes fully:', err);
            }

            // Populate Dropdowns in UI
            populateClassDropdowns();
        }

        function populateClassDropdowns() {
            const formSelect = panel.querySelector('#thmFormClass');
            const filterSelect = panel.querySelector('#thmFilterClass');
            const filterSubject = panel.querySelector('#thmFilterSubject');

            if (!formSelect || !filterSelect) return;

            // Clear options
            formSelect.innerHTML = '<option value="">-- Select Class & Section --</option>';
            filterSelect.innerHTML = '<option value="">All My Classes</option>';

            const subjectsSet = new Set();

            Array.from(myClassesMap.entries()).forEach(([key, cls]) => {
                const label = `${cls.className} • Sec ${cls.section}${cls.subject ? ` (${cls.subject})` : ''}`;
                
                // Form select
                const opt1 = document.createElement('option');
                opt1.value = key;
                opt1.textContent = label;
                formSelect.appendChild(opt1);

                // Filter select
                const opt2 = document.createElement('option');
                opt2.value = key;
                opt2.textContent = label;
                filterSelect.appendChild(opt2);

                if (cls.subject) subjectsSet.add(cls.subject);
            });

            // Populate subjects filter
            if (filterSubject) {
                filterSubject.innerHTML = '<option value="">All Subjects</option>';
                subjectsSet.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.textContent = sub;
                    filterSubject.appendChild(opt);
                });
            }
        }

        // Realtime sync of homework items for this teacher & school
        function listenToHomework() {
            if (!schoolId || !currentTeacher) return;

            db.ref(`schoolHomework/${schoolId}`).on('value', snapshot => {
                const val = snapshot.val() || {};
                homeworkList = Object.entries(val)
                    .map(([id, item]) => ({ id, ...item }))
                    .filter(item => item.teacherId === currentTeacher.uid || item.teacherEmail === currentTeacher.email)
                    .sort((a, b) => {
                        const dateA = new Date(`${a.dueDate}T${a.dueTime || '23:59'}`).getTime() || 0;
                        const dateB = new Date(`${b.dueDate}T${b.dueTime || '23:59'}`).getTime() || 0;
                        return dateB - dateA;
                    });

                renderCards();
                updateStats();
            });
        }

        function updateStats() {
            const total = homeworkList.length;
            let active = 0;
            let dueToday = 0;
            const uniqueClasses = new Set();

            homeworkList.forEach(hw => {
                const status = getDueStatus(hw.dueDate, hw.dueTime);
                if (status.status === 'active' || status.status === 'today') active++;
                if (status.status === 'today') dueToday++;
                uniqueClasses.add(`${hw.className}_${hw.section}`);
            });

            panel.querySelector('#thmStatTotal').textContent = total;
            panel.querySelector('#thmStatActive').textContent = active;
            panel.querySelector('#thmStatToday').textContent = dueToday;
            panel.querySelector('#thmStatClasses').textContent = uniqueClasses.size;
        }

        function renderCards() {
            const grid = panel.querySelector('#thmCardsGrid');
            if (!grid) return;

            const selectedClass = panel.querySelector('#thmFilterClass')?.value || '';
            const selectedSubject = panel.querySelector('#thmFilterSubject')?.value || '';
            const query = (panel.querySelector('#thmSearchInput')?.value || '').trim().toLowerCase();

            const filtered = homeworkList.filter(item => {
                // Class filter
                if (selectedClass) {
                    const itemKey = `${item.classId || item.className}_${normSec(item.section)}`;
                    if (itemKey !== selectedClass && `${item.className}_${normSec(item.section)}` !== selectedClass) {
                        return false;
                    }
                }
                // Subject filter
                if (selectedSubject && item.subject.toLowerCase() !== selectedSubject.toLowerCase()) {
                    return false;
                }
                // Status tab filter
                const dueInfo = getDueStatus(item.dueDate, item.dueTime);
                if (activeStatusFilter === 'active' && dueInfo.status === 'past') return false;
                if (activeStatusFilter === 'past' && dueInfo.status !== 'past') return false;

                // Search query
                if (query) {
                    const matchText = `${item.title} ${item.description} ${item.subject} ${item.className} ${item.section}`.toLowerCase();
                    if (!matchText.includes(query)) return false;
                }

                return true;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="thm-empty">
                        <div class="thm-empty-icon"><i class="fas fa-clipboard-check"></i></div>
                        <h3>No homework found</h3>
                        <p>${homeworkList.length === 0 ? "You haven't assigned any homework yet." : "No assignments match your search or filter."}</p>
                        <button type="button" class="thm-btn-primary" id="thmEmptyAddBtn">
                            <i class="fas fa-plus"></i> Assign New Homework
                        </button>
                    </div>
                `;
                grid.querySelector('#thmEmptyAddBtn')?.addEventListener('click', openCreateModal);
                return;
            }

            grid.innerHTML = filtered.map(hw => {
                const dueInfo = getDueStatus(hw.dueDate, hw.dueTime);
                const displayDue = formatDisplayDate(hw.dueDate, hw.dueTime);

                return `
                    <div class="thm-card" data-id="${hw.id}">
                        <div>
                            <div class="thm-card-head">
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    <span class="thm-badge-class">
                                        <i class="fas fa-users"></i> ${escapeHtml(hw.className || 'Class')} • Sec ${escapeHtml(hw.section || 'All')}
                                    </span>
                                    <span class="thm-badge-subject">
                                        <i class="fas fa-book"></i> ${escapeHtml(hw.subject || 'General')}
                                    </span>
                                </div>
                                <span class="thm-badge-status ${dueInfo.cls}">
                                    ${dueInfo.label}
                                </span>
                            </div>

                            <h3 class="thm-card-title">${escapeHtml(hw.title)}</h3>
                            <p class="thm-card-desc">${escapeHtml(hw.description)}</p>
                        </div>

                        <div>
                            <div class="thm-card-due-box">
                                <span class="thm-due-label">
                                    <i class="fas fa-calendar-check"></i> Due Date:
                                </span>
                                <span class="thm-due-val">${displayDue}</span>
                            </div>

                            ${hw.note ? `
                                <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 12px; display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-circle-info"></i> ${escapeHtml(hw.note)}
                                </div>
                            ` : ''}

                            <div class="thm-card-actions">
                                <button type="button" class="thm-action-btn edit-btn" data-id="${hw.id}">
                                    <i class="fas fa-pen-to-square"></i> Edit
                                </button>
                                <button type="button" class="thm-action-btn delete-btn delete" data-id="${hw.id}" title="Delete Homework">
                                    <i class="fas fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind card buttons
            grid.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const item = homeworkList.find(x => x.id === id);
                    if (item) openEditModal(item);
                });
            });

            grid.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this homework assignment?')) {
                        try {
                            await db.ref(`schoolHomework/${schoolId}/${id}`).remove();
                            if (window.showToast) window.showToast('Homework deleted successfully.', 'info');
                        } catch (e) {
                            alert('Failed to delete homework: ' + e.message);
                        }
                    }
                });
            });
        }

        function escapeHtml(str) {
            return String(str || '').replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // Modal Management
        const modal = panel.querySelector('#thmModal');
        const form = panel.querySelector('#thmForm');

        function openCreateModal() {
            form.reset();
            panel.querySelector('#thmEditId').value = '';
            panel.querySelector('#thmModalTitle').innerHTML = '<i class="fas fa-pencil"></i> Assign New Homework';
            panel.querySelector('#thmModalSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Publish Homework';

            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            panel.querySelector('#thmFormDueDate').value = dateStr;
            panel.querySelector('#thmFormDueDate').min = new Date().toISOString().split('T')[0];
            panel.querySelector('#thmFormDueTime').value = '23:59';

            // Auto-fill subject if class selected
            const classSelect = panel.querySelector('#thmFormClass');
            classSelect.dispatchEvent(new Event('change'));

            modal.classList.add('active');
        }

        function openEditModal(item) {
            panel.querySelector('#thmEditId').value = item.id;
            panel.querySelector('#thmModalTitle').innerHTML = '<i class="fas fa-pen-to-square"></i> Edit Homework';
            panel.querySelector('#thmModalSubmitBtn').innerHTML = '<i class="fas fa-check"></i> Save Changes';

            const classSelect = panel.querySelector('#thmFormClass');
            const targetKey = `${item.classId || item.className}_${normSec(item.section)}`;
            classSelect.value = targetKey;

            panel.querySelector('#thmFormSubject').value = item.subject || '';
            panel.querySelector('#thmFormTitle').value = item.title || '';
            panel.querySelector('#thmFormDesc').value = item.description || '';
            panel.querySelector('#thmFormDueDate').value = item.dueDate || '';
            panel.querySelector('#thmFormDueTime').value = item.dueTime || '23:59';
            panel.querySelector('#thmFormNote').value = item.note || '';

            modal.classList.add('active');
        }

        function closeModal() {
            modal.classList.remove('active');
        }

        // Event Listeners for UI
        panel.querySelector('#thmCreateBtn')?.addEventListener('click', openCreateModal);
        panel.querySelector('#thmModalCloseBtn')?.addEventListener('click', closeModal);
        panel.querySelector('#thmModalCancelBtn')?.addEventListener('click', closeModal);

        // When Class selection changes in form, prefill subject if mapped
        panel.querySelector('#thmFormClass')?.addEventListener('change', (e) => {
            const key = e.target.value;
            const cls = myClassesMap.get(key);
            const subInput = panel.querySelector('#thmFormSubject');
            if (cls && cls.subject && !subInput.value) {
                subInput.value = cls.subject;
            }
        });

        // Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = panel.querySelector('#thmModalSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const editId = panel.querySelector('#thmEditId').value;
                const classKey = panel.querySelector('#thmFormClass').value;
                const selectedCls = myClassesMap.get(classKey) || {};

                const title = panel.querySelector('#thmFormTitle').value.trim();
                const subject = panel.querySelector('#thmFormSubject').value.trim();
                const description = panel.querySelector('#thmFormDesc').value.trim();
                const dueDate = panel.querySelector('#thmFormDueDate').value;
                const dueTime = panel.querySelector('#thmFormDueTime').value || '23:59';
                const note = panel.querySelector('#thmFormNote').value.trim();

                const homeworkId = editId || db.ref(`schoolHomework/${schoolId}`).push().key;

                const payload = {
                    id: homeworkId,
                    schoolId: schoolId,
                    teacherId: currentTeacher.uid,
                    teacherName: currentTeacher.name || currentTeacher.displayName || 'Subject Teacher',
                    teacherEmail: currentTeacher.email || '',
                    classId: selectedCls.classId || '',
                    className: selectedCls.className || 'Class',
                    section: selectedCls.section || 'A',
                    normSection: normSec(selectedCls.section || 'A'),
                    subject: subject,
                    title: title,
                    description: description,
                    dueDate: dueDate,
                    dueTime: dueTime,
                    note: note,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };

                if (!editId) {
                    payload.createdAt = firebase.database.ServerValue.TIMESTAMP;
                }

                // Save to canonical schoolHomework node
                await db.ref(`schoolHomework/${schoolId}/${homeworkId}`).update(payload);

                // Index by class
                const indexKey = `${selectedCls.classId || selectedCls.className}_${normSec(selectedCls.section || 'A')}`;
                await db.ref(`schoolClassHomework/${schoolId}/${safeKey(indexKey)}/${homeworkId}`).set(true);

                closeModal();
                if (window.showToast) {
                    window.showToast(editId ? 'Homework updated successfully!' : 'Homework published to student portal!', 'success');
                } else {
                    alert(editId ? 'Homework updated!' : 'Homework published successfully!');
                }
            } catch (err) {
                console.error('Failed to save homework:', err);
                alert('Error: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Homework';
            }
        });

        // Search & Filter listeners
        panel.querySelector('#thmFilterClass')?.addEventListener('change', renderCards);
        panel.querySelector('#thmFilterSubject')?.addEventListener('change', renderCards);
        panel.querySelector('#thmSearchInput')?.addEventListener('input', renderCards);

        panel.querySelectorAll('.thm-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.thm-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeStatusFilter = btn.getAttribute('data-status');
                renderCards();
            });
        });

        // Auth state handler
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                nav.style.display = 'none';
                return;
            }
            try {
                const snap = await db.ref(`users/${user.uid}`).once('value');
                const profile = snap.val() || {};
                if (profile.role !== 'teacher') {
                    nav.style.display = 'none';
                    return;
                }
                currentTeacher = { uid: user.uid, ...profile };
                nav.style.display = 'flex';

                await loadTeacherClasses(user, profile);
                listenToHomework();
            } catch (e) {
                console.error('Teacher homework initialization error:', e);
            }
        });
    }

    // Auto boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTeacherHomework);
    } else {
        initializeTeacherHomework();
    }
})();
