// Authentication visibility control
document.addEventListener('DOMContentLoaded', function() {
    const loginContainer = document.getElementById('loginContainer');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // Initially hide all content except login
    function hideAllContent() {
        if (sidebar) sidebar.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'block';
    }
    
    // Show authenticated content
    function showAuthenticatedContent() {
        if (sidebar) sidebar.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'block';
        if (loginContainer) loginContainer.style.display = 'none';
    }
    
    // Hide content initially
    hideAllContent();
    
    // Listen for auth state changes
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // User is signed in - show content
            showAuthenticatedContent();
        } else {
            // User is signed out - hide content
            hideAllContent();
        }
    });
});