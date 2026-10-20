// Simple redirect script to ensure users are logged in before accessing dashboard
(function() {
    // Check if user is logged in
    const currentUser = firebase.auth().currentUser;
    
    // If not on login page and not logged in, redirect to login
    if (!currentUser && !window.location.href.includes('index.html')) {
        window.location.href = 'index.html';
    }
    
    // If on login page and logged in, redirect to teacher dashboard
    if (currentUser && window.location.href.includes('index.html')) {
        window.location.href = 'teacher.html';
    }
})();