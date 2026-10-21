/**
 * mobile-sidebar.js
 * Handles the mobile sidebar toggle for the teacher portal.
 * On screens ≤680px the sidebar is completely hidden by default and
 * slides in as a full-width drawer when the hamburger button is tapped.
 */
(function () {
    'use strict';

    const MOBILE_BREAKPOINT = 680;
    const OPEN_CLASS = 'mobile-sidebar-open';

    let backdrop = null;
    let toggleBtn = null;
    let initialized = false;

    // ── Helpers ────────────────────────────────────────────────────────────

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function isAuthenticated() {
        return document.body.classList.contains('teacher-authenticated');
    }

    function openSidebar() {
        document.body.classList.add(OPEN_CLASS);
        if (backdrop) backdrop.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        }
        // Prevent body scroll while sidebar is open
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        document.body.classList.remove(OPEN_CLASS);
        if (backdrop) backdrop.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        }
        document.body.style.overflow = '';
    }

    function toggleSidebar() {
        if (document.body.classList.contains(OPEN_CLASS)) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    // ── DOM creation ────────────────────────────────────────────────────────

    function createBackdrop() {
        const el = document.createElement('div');
        el.id = 'mobileSidebarBackdrop';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'display:none;position:fixed;inset:0;z-index:1090;background:rgba(0,0,0,.46);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);transition:opacity .28s ease;';
        el.addEventListener('click', closeSidebar);
        document.body.appendChild(el);
        return el;
    }

    function createToggleButton() {
        const btn = document.createElement('button');
        btn.id = 'mobileSidebarToggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open navigation menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'teacherSidebar');
        btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
        document.body.appendChild(btn);
        btn.addEventListener('click', toggleSidebar);
        return btn;
    }

    // ── Initialise on mobile ─────────────────────────────────────────────────

    function init() {
        if (initialized) return;
        if (!isMobile() || !isAuthenticated()) return;
        initialized = true;

        // Give the sidebar an id for aria reference
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !sidebar.id) sidebar.id = 'teacherSidebar';

        backdrop = createBackdrop();
        toggleBtn = createToggleButton();

        // Close sidebar when a menu item is clicked (navigation)
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            item.addEventListener('click', () => {
                if (isMobile() && document.body.classList.contains(OPEN_CLASS)) {
                    closeSidebar();
                }
            });
        });

        // Escape key closes
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.body.classList.contains(OPEN_CLASS)) {
                closeSidebar();
            }
        });
    }

    // ── Re-evaluate on resize ────────────────────────────────────────────────

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!isMobile()) {
                // Entering desktop — clean up mobile state
                closeSidebar();
                if (toggleBtn) { toggleBtn.style.display = 'none'; }
                if (backdrop) { backdrop.style.display = 'none'; }
            } else {
                if (toggleBtn) toggleBtn.style.display = '';
                if (!initialized && isAuthenticated()) init();
            }
        }, 100);
    });

    // ── Auth observer (sidebar shown after login) ────────────────────────────

    const authObserver = new MutationObserver(() => {
        if (isAuthenticated() && isMobile() && !initialized) {
            // Small delay so sidebar CSS is applied first
            setTimeout(init, 50);
        }
    });
    authObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // ── Bootstrap ────────────────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isAuthenticated() && isMobile()) init();
        });
    } else {
        if (isAuthenticated() && isMobile()) init();
    }
})();
