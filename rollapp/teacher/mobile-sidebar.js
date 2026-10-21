/**
 * mobile-sidebar.js  –  Teacher portal mobile drawer toggle
 * On ≤680px the sidebar slides in from the left as a full drawer.
 * A floating hamburger button is injected into the page.
 */
(function () {
    'use strict';

    const MOBILE_BREAKPOINT = 680;
    const OPEN_CLASS = 'mobile-sidebar-open';

    let backdrop = null;
    let toggleBtn = null;
    let initialized = false;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function isAuthenticated() {
        return document.body.classList.contains('teacher-authenticated');
    }

    /** Strip any inline margin/width set by the desktop sidebar-toggle JS */
    function resetMainContentLayout() {
        document.querySelectorAll('.main-content, .main-content-expanded').forEach(el => {
            el.style.marginLeft = '';
            el.style.width = '';
        });
    }

    // ── Sidebar state ──────────────────────────────────────────────────────────

    function openSidebar() {
        document.body.classList.add(OPEN_CLASS);
        document.body.style.overflow = 'hidden';
        if (backdrop) backdrop.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        }
    }

    function closeSidebar() {
        document.body.classList.remove(OPEN_CLASS);
        document.body.style.overflow = '';
        if (backdrop) backdrop.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        }
        // Ensure main content is always full-width when drawer is closed
        resetMainContentLayout();
    }

    function toggleSidebar() {
        document.body.classList.contains(OPEN_CLASS) ? closeSidebar() : openSidebar();
    }

    // ── DOM injection ──────────────────────────────────────────────────────────

    function createBackdrop() {
        // Re-use if already exists
        let el = document.getElementById('mobileSidebarBackdrop');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'mobileSidebarBackdrop';
        el.setAttribute('aria-hidden', 'true');
        Object.assign(el.style, {
            display: 'none',
            position: 'fixed',
            inset: '0',
            zIndex: '1090',
            background: 'rgba(0,0,0,.5)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
        });
        el.addEventListener('click', closeSidebar);
        document.body.appendChild(el);
        return el;
    }

    function createToggleButton() {
        // Re-use if already exists
        let btn = document.getElementById('mobileSidebarToggle');
        if (btn) {
            btn.removeEventListener('click', toggleSidebar); // avoid double bind
            btn.addEventListener('click', toggleSidebar);
            return btn;
        }

        btn = document.createElement('button');
        btn.id = 'mobileSidebarToggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle navigation');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'teacherSidebar');
        btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        btn.addEventListener('click', toggleSidebar);
        document.body.appendChild(btn);
        return btn;
    }

    // ── Wire up menu items ─────────────────────────────────────────────────────

    function bindMenuItems() {
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            // Use capturing to run before other handlers
            item.addEventListener('click', () => {
                if (isMobile() && document.body.classList.contains(OPEN_CLASS)) {
                    closeSidebar();
                }
            }, { capture: true });
        });
    }

    // ── Initialise ─────────────────────────────────────────────────────────────

    function init() {
        if (initialized) return;
        if (!isMobile() || !isAuthenticated()) return;
        initialized = true;

        // Give sidebar an id for ARIA
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !sidebar.id) sidebar.id = 'teacherSidebar';

        backdrop = createBackdrop();
        toggleBtn = createToggleButton();
        bindMenuItems();

        // Reset any inline margin/width from the desktop sidebar-toggle JS
        resetMainContentLayout();

        // Escape key closes drawer
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.body.classList.contains(OPEN_CLASS)) {
                closeSidebar();
            }
        });
    }

    // ── Responsive: clean up when going desktop ────────────────────────────────

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!isMobile()) {
                closeSidebar();
                if (toggleBtn) toggleBtn.style.display = 'none';
                if (backdrop) backdrop.style.display = 'none';
            } else {
                if (toggleBtn) toggleBtn.style.display = '';
                // Reset any inline styles desktop JS may have set
                resetMainContentLayout();
                if (!initialized && isAuthenticated()) init();
            }
        }, 80);
    });

    // ── Watch for body class changes (Firebase adds teacher-authenticated async) ─

    const bodyObserver = new MutationObserver(() => {
        if (isAuthenticated() && isMobile() && !initialized) {
            setTimeout(init, 80);
        }
        // Hide toggle on logout
        if (!isAuthenticated()) {
            closeSidebar();
            initialized = false;
            if (toggleBtn) toggleBtn.style.display = 'none';
        }
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    function tryInit() {
        if (isAuthenticated() && isMobile()) init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }

    // Also try after full page load in case Firebase auth resolves late
    window.addEventListener('load', () => {
        if (!initialized) tryInit();
    });

})();
