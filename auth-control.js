// Auth control script - Show dashboard only after successful login
document.addEventListener('DOMContentLoaded', function() {
    // Get main elements
    const loginContainer = document.getElementById('loginContainer');
    const dashboardSection = document.getElementById('dashboardSection');
    const attendanceSection = document.getElementById('attendanceSection');
    const classesSection = document.getElementById('classesSection');
    const reportsSection = document.getElementById('reportsSection');
    const settingsSection = document.getElementById('settingsSection');
    const sidebar = document.querySelector('.sidebar');
    
    // Function to hide all dashboard content
    function hideDashboardContent() {
        if (dashboardSection) dashboardSection.style.display = 'none';
        if (attendanceSection) attendanceSection.style.display = 'none';
        if (classesSection) classesSection.style.display = 'none';
        if (reportsSection) reportsSection.style.display = 'none';
        if (settingsSection) settingsSection.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';
    }
    
    // Function to show dashboard content
    function showDashboardContent() {
        if (dashboardSection) dashboardSection.style.display = 'block';
        if (sidebar) sidebar.style.display = 'flex';
    }
    
    // Check auth state and update UI
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            // User is logged in
            if (loginContainer) loginContainer.style.display = 'none';
            showDashboardContent();
        } else {
            // User is not logged in
            if (loginContainer) loginContainer.style.display = 'block';
            hideDashboardContent();
        }
    });
    
    // Initial state - hide dashboard until auth check completes
    hideDashboardContent();
});