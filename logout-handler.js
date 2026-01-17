// Enhanced logout handler
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
    
    // Global logout function
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
        
        // Sign out from Firebase
        firebase.auth().signOut()
            .then(() => {
                // Show login form
                const loginContainer = document.getElementById('loginContainer');
                if (loginContainer) loginContainer.style.display = 'block';
                
                // Hide dashboard sections
                const dashboardSection = document.getElementById('dashboardSection');
                const attendanceSection = document.getElementById('attendanceSection');
                const classesSection = document.getElementById('classesSection');
                const reportsSection = document.getElementById('reportsSection');
                const settingsSection = document.getElementById('settingsSection');
                const sidebar = document.querySelector('.sidebar');
                
                if (dashboardSection) dashboardSection.style.display = 'none';
                if (attendanceSection) attendanceSection.style.display = 'none';
                if (classesSection) classesSection.style.display = 'none';
                if (reportsSection) reportsSection.style.display = 'none';
                if (settingsSection) settingsSection.style.display = 'none';
                if (sidebar) sidebar.style.display = 'none';
                
                // Remove loading overlay
                document.body.removeChild(loadingOverlay);
            })
            .catch((error) => {
                console.error('Logout error:', error);
                
                // Remove loading overlay
                document.body.removeChild(loadingOverlay);
                
                // Show error alert
                const attendanceAlert = document.getElementById('attendanceAlert');
                if (attendanceAlert) {
                    attendanceAlert.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error logging out';
                    attendanceAlert.className = 'alert alert-error';
                    attendanceAlert.style.display = 'block';
                    
                    setTimeout(() => {
                        attendanceAlert.style.display = 'none';
                    }, 5000);
                }
            });
    };
});