// Enhanced logout functionality for teacher portal

// Ensure this script runs after the main page is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get all logout buttons
    const logoutButtons = document.querySelectorAll('.logout-btn, #sidebarLogoutBtn, #headerLogoutBtn, .header-logout-btn');
    
    // Add event listener to each logout button
    logoutButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                performLogout();
            });
        }
    });
    
    // Global logout function that can be called from anywhere
    window.performLogout = function() {
        document.querySelectorAll('.loading-overlay, #rollcallLogoutOverlay').forEach(el => el.remove());
        
        document.body.classList.remove('teacher-authenticated', 'teacher-school-mode', 'mobile-sidebar-open');
        document.body.style.overflow = '';
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'none';
        document.querySelectorAll('.section-container').forEach(el => el.style.display = 'none');
        
        const loginContainer = document.getElementById('loginContainer');
        if (loginContainer) loginContainer.style.display = 'grid';
        
        // Clear stored data
        if (window.currentTeacher) window.currentTeacher = null;
        if (window.students) window.students = [];
        if (window.attendanceData) window.attendanceData = {};
        if (window.activeClasses) window.activeClasses = [];
        if (window.currentClassData) window.currentClassData = null;
        if (window.submittedAttendances) window.submittedAttendances = {};
        
        try {
            sessionStorage.clear();
            localStorage.removeItem('rollcall_remember_teacher');
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname);
            }
        } catch (e) {}

        let redirected = false;
        const redirect = () => {
            if (redirected) return;
            redirected = true;
            document.querySelectorAll('.loading-overlay, #rollcallLogoutOverlay').forEach(el => el.remove());
            try {
                window.location.replace('teacher.html');
            } catch (e) {
                window.location.reload();
            }
        };

        const timer = setTimeout(redirect, 400);

        if (window.firebase && firebase.auth) {
            firebase.auth().signOut()
                .catch(err => console.warn('Logout error:', err))
                .finally(() => {
                    clearTimeout(timer);
                    redirect();
                });
        } else {
            clearTimeout(timer);
            redirect();
        }
    };
});