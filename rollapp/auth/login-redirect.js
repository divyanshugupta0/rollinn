// Direct login redirect script - runs immediately
(function() {
    // Check if Firebase is initialized
    if (typeof firebase !== 'undefined' && firebase.auth) {
        // Force immediate auth check
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                // User is signed in, redirect to teacher page if on index
                if (window.location.pathname.endsWith('index.html') || 
                    window.location.pathname.endsWith('/')) {
                    window.location.href = 'teacher.html';
                }
            } else {
                // No user is signed in, redirect to index if on teacher page
                if (window.location.pathname.endsWith('teacher.html')) {
                    window.location.href = 'index.html';
                }
            }
        });
    }
})();