// URL Hash Navigation & Section Switching for Teacher Portal
// Matches the panel URL routing of Admin and Owner portals
(() => {
    const SECTION_ALIASES = {
        '': 'dashboard',
        'dashboard': 'dashboard',
        'attendance': 'attendance',
        'classes': 'classes',
        'students': 'students',
        'students-record': 'students',
        'studentsrecord': 'students',
        'notifications': 'notifications',
        'reports': 'reports',
        'settings': 'settings',
        'timetable': 'timetable',
        'teacherleaverequests': 'teacherLeaveRequests',
        'teacher-leave-requests': 'teacherLeaveRequests',
        'teacher_leave_requests': 'teacherLeaveRequests',
        'leave': 'teacherLeaveRequests',
        'leave-requests': 'teacherLeaveRequests',
        'class-teacher-requests': 'class-teacher-requests',
        'classteacherrequests': 'class-teacher-requests',
        'student-requests': 'class-teacher-requests',
        'studentrequests': 'class-teacher-requests',
        'homework': 'homework',
        'assignments': 'homework',
        'homeworks': 'homework'
    };

    function normalizeSection(raw) {
        if (!raw) return 'dashboard';
        const clean = String(raw).replace(/^#/, '').trim();
        const lower = clean.toLowerCase();
        return SECTION_ALIASES[lower] || clean;
    }

    function isTeacherAuthenticated() {
        const loginContainer = document.getElementById('loginContainer');
        const isLoginVisible = loginContainer && window.getComputedStyle(loginContainer).display !== 'none';
        const hasAuthClass = document.body.classList.contains('teacher-authenticated');
        return hasAuthClass && !isLoginVisible;
    }

    function findTargetElement(sectionName) {
        if (sectionName === 'class-teacher-requests') {
            return document.getElementById('classTeacherRequestsSection') ||
                   document.getElementById('class-teacher-requests');
        }
        if (sectionName === 'teacherLeaveRequests') {
            return document.getElementById('teacherLeaveRequestsSection') ||
                   document.getElementById('teacherLeaveRequests');
        }
        if (sectionName === 'homework') {
            return document.getElementById('homeworkSection') ||
                   document.getElementById('homework');
        }
        if (sectionName === 'test-scores' || sectionName === 'testScores') {
            return document.getElementById('testScoresSection') ||
                   document.getElementById('test-scoresSection');
        }
        return document.getElementById(sectionName + 'Section') ||
               document.getElementById(sectionName);
    }

    function findMenuItem(sectionName) {
        let item = document.querySelector(`.sidebar-menu .menu-item[data-section="${sectionName}"]`);
        if (item) return item;

        if (sectionName === 'homework') {
            item = document.querySelector('.sidebar-menu .menu-item[data-section="homework"]');
            if (item) return item;
        } else if (sectionName === 'test-scores' || sectionName === 'testScores') {
            item = document.querySelector('.sidebar-menu .menu-item[data-section="test-scores"]') ||
                   document.querySelector('.sidebar-menu .menu-item[data-section="testScores"]');
            if (item) return item;
        } else if (sectionName === 'class-teacher-requests') {
            item = document.querySelector('.sidebar-menu .menu-item[data-section="class-teacher-requests"]') ||
                   document.querySelector('.sidebar-menu .menu-item[data-section="classTeacherRequests"]');
        } else if (sectionName === 'teacherLeaveRequests') {
            item = document.querySelector('.sidebar-menu .menu-item[data-section="teacherLeaveRequests"]') ||
                   document.querySelector('.sidebar-menu .menu-item[data-section="leave"]');
        } else if (sectionName === 'students') {
            item = document.querySelector('.sidebar-menu .menu-item[data-section="students"]') ||
                   document.querySelector('.sidebar-menu .menu-item[data-section="students-record"]');
        }
        return item;
    }

    let retryTimer = null;

    function switchTeacherSection(requestedSection, options = {}) {
        const canonical = normalizeSection(requestedSection);

        // Security / UX: If not authenticated, save pending target and do not open panels
        if (!isTeacherAuthenticated()) {
            window._pendingTeacherSection = canonical;
            return false;
        }

        const target = findTargetElement(canonical);
        if (!target) {
            // Dynamic panels may still be mounting (e.g. timetable, teacherLeaveRequests, classTeacherRequests)
            clearTimeout(retryTimer);
            if ((options.retryCount || 0) < 20) {
                retryTimer = setTimeout(() => {
                    switchTeacherSection(canonical, {
                        ...options,
                        retryCount: (options.retryCount || 0) + 1
                    });
                }, 100);
            }
            return false;
        }

        // 1. Show target section and hide others
        document.querySelectorAll('.main-content .section-container').forEach(section => {
            const isActive = section === target;
            section.classList.toggle('active', isActive);
            section.style.display = isActive ? 'block' : 'none';
            section.setAttribute('aria-hidden', String(!isActive));
        });

        // 2. Update active sidebar item
        const matchingItem = options.sourceItem || findMenuItem(canonical);
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            const isActive = matchingItem ? (item === matchingItem) : (item.dataset.section === canonical);
            item.classList.toggle('active', isActive);
            if (isActive) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });

        // 3. Update URL hash without causing page jump
        if (options.updateUrl !== false) {
            const targetHash = '#' + canonical;
            if (window.location.hash !== targetHash) {
                try {
                    if (options.replace) {
                        history.replaceState({ section: canonical }, '', targetHash);
                    } else {
                        history.pushState({ section: canonical }, '', targetHash);
                    }
                } catch (e) {
                    window.location.hash = canonical;
                }
            }
        }

        // 4. Close mobile sidebar on navigation if open
        if (window.innerWidth <= 992 && window.innerWidth > 680) {
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.querySelector('.main-content');
            if (sidebar && !sidebar.classList.contains('sidebar-collapsed')) {
                sidebar.classList.add('sidebar-collapsed');
                mainContent?.classList.add('main-content-expanded');
            }
        } else if (window.innerWidth <= 680) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.remove('sidebar-collapsed');
            document.querySelectorAll('.main-content-expanded').forEach(el => el.classList.remove('main-content-expanded'));
            // Auto close mobile sidebar drawer on navigation (mobile devices only)
            if (typeof window.closeMobileSidebar === 'function') {
                window.closeMobileSidebar();
            } else {
                document.body.classList.remove('mobile-sidebar-open');
                document.body.style.overflow = '';
                const backdrop = document.getElementById('mobileSidebarBackdrop');
                if (backdrop) backdrop.style.display = 'none';
                const toggleBtn = document.getElementById('mobileSidebarToggle');
                if (toggleBtn) {
                    toggleBtn.setAttribute('aria-expanded', 'false');
                    toggleBtn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
                }
            }
        }

        // 5. Load section data once. The section remains mounted and keeps its DOM state
        // when the teacher navigates away, so returning to it does not refetch/reset it.
        const shouldLoadPanel = target.dataset.panelLoaded !== 'true' || options.forceReload === true;
        if (shouldLoadPanel) {
            try {
                if (canonical === 'reports' && typeof window.initializeTeacherReports === 'function') {
                    window.initializeTeacherReports();
                } else if (canonical === 'timetable') {
                    document.getElementById('ctRefresh')?.dispatchEvent(new Event('click'));
                } else if (canonical === 'class-teacher-requests') {
                    document.getElementById('ctprRefresh')?.dispatchEvent(new Event('click'));
                }
                target.dataset.panelLoaded = 'true';
            } catch (hookErr) {
                console.warn('Teacher section hook error:', hookErr);
            }
        }

        return true;
    }

    window.switchTeacherSection = switchTeacherSection;
    window.navigateToSection = switchTeacherSection;
    window.navigateToTeacherSection = switchTeacherSection;

    function handleUrlChange() {
        const hash = window.location.hash.slice(1);
        if (isTeacherAuthenticated()) {
            switchTeacherSection(hash || 'dashboard', { updateUrl: false });
        } else if (hash) {
            window._pendingTeacherSection = normalizeSection(hash);
        }
    }

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    // Capture clicks on sidebar menu items
    document.addEventListener('click', function (event) {
        const item = event.target.closest('.sidebar-menu .menu-item[data-section]');
        if (!item) return;

        const section = item.dataset.section;
        if (!section || section === 'logout') return;

        event.preventDefault();
        event.stopImmediatePropagation();
        switchTeacherSection(section, { updateUrl: true, sourceItem: item });

        // Auto-close mobile sidebar drawer on navigation (mobile devices only)
        if (window.innerWidth <= 680) {
            if (typeof window.closeMobileSidebar === 'function') {
                window.closeMobileSidebar();
            } else {
                document.body.classList.remove('mobile-sidebar-open');
                document.body.style.overflow = '';
                const backdrop = document.getElementById('mobileSidebarBackdrop');
                if (backdrop) backdrop.style.display = 'none';
                const toggleBtn = document.getElementById('mobileSidebarToggle');
                if (toggleBtn) {
                    toggleBtn.setAttribute('aria-expanded', 'false');
                    toggleBtn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
                }
            }
        }
    }, true);

    // Initial check on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        const initialHash = (window.location.hash || '').slice(1);
        if (isTeacherAuthenticated()) {
            switchTeacherSection(initialHash || 'dashboard', { updateUrl: false });
        } else if (initialHash) {
            window._pendingTeacherSection = normalizeSection(initialHash);
        }
    });
})();

