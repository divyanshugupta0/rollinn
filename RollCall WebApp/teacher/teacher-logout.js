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
        // Show loading indicator
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="loading-text">Logging out...</div>
        `;
        document.body.appendChild(loadingOverlay);
        
        // Clear any stored data
        if (window.currentTeacher) window.currentTeacher = null;
        if (window.students) window.students = [];
        if (window.attendanceData) window.attendanceData = {};
        if (window.activeClasses) window.activeClasses = [];
        if (window.currentClassData) window.currentClassData = null;
        if (window.submittedAttendances) window.submittedAttendances = {};
        
        // Sign out from Firebase
        firebase.auth().signOut()
            .then(() => {
                // Sign-out successful
                const loginContainer = document.getElementById('loginContainer');
                if (loginContainer) loginContainer.style.display = 'block';
                
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.style.display = 'none';
                
                const mainContent = document.querySelector('.main-content');
                if (mainContent) mainContent.style.display = 'none';
                
                // Reset UI elements
                const containers = [
                    'attendanceContainer',
                    'classSelectionContainer',
                    'attendanceMarkingContainer',
                    'viewSubmittedContainer',
                    'attendancePopup'
                ];
                
                containers.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'none';
                });
                
                // Remove loading overlay
                document.body.removeChild(loadingOverlay);
                
                console.log('User signed out successfully');
            })
            .catch((error) => {
                console.error('Logout error:', error);
                
                // Show error alert if possible
                const attendanceAlert = document.getElementById('attendanceAlert');
                if (attendanceAlert) {
                    attendanceAlert.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error logging out';
                    attendanceAlert.className = 'alert alert-error';
                    attendanceAlert.style.display = 'block';
                    
                    setTimeout(() => {
                        attendanceAlert.style.display = 'none';
                    }, 5000);
                }
                
                // Remove loading overlay
                document.body.removeChild(loadingOverlay);
            });
    };
});