// Simple auth fix to ensure login persistence and proper redirection
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the login page
    const loginContainer = document.getElementById('loginContainer');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (!loginContainer) return;
    
    // Force auth check on page load
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // User is signed in, show dashboard
            loginContainer.style.display = 'none';
            sidebar.style.display = 'flex';
            mainContent.style.display = 'block';
        } else {
            // User is not signed in, show login
            loginContainer.style.display = 'block';
            sidebar.style.display = 'none';
            mainContent.style.display = 'none';
        }
    });
    
    // Ensure login form works properly
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Set persistence before login
            firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .then(() => {
                    return firebase.auth().signInWithEmailAndPassword(email, password);
                })
                .catch((error) => {
                    console.error('Login error:', error);
                    const loginAlert = document.getElementById('loginAlert');
                    if (loginAlert) {
                        loginAlert.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + error.message;
                        loginAlert.className = 'alert alert-error';
                        loginAlert.style.display = 'block';
                    }
                });
        });
    }
});