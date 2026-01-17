// Enhanced login handler
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginAlert = document.getElementById('loginAlert');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Show loading state
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
            submitBtn.disabled = true;
            
            // Set persistence and login
            firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .then(() => {
                    return firebase.auth().signInWithEmailAndPassword(email, password);
                })
                .then((userCredential) => {
                    // Login successful
                    showAlert(loginAlert, '<i class="fas fa-check-circle"></i> Login successful!', 'success');
                    
                    // Show dashboard sections
                    const dashboardSection = document.getElementById('dashboardSection');
                    const sidebar = document.querySelector('.sidebar');
                    
                    if (dashboardSection) dashboardSection.style.display = 'block';
                    if (sidebar) sidebar.style.display = 'flex';
                    
                    // Hide login container
                    document.getElementById('loginContainer').style.display = 'none';
                    
                    // Reset form
                    loginForm.reset();
                })
                .catch((error) => {
                    console.error('Login error:', error);
                    showAlert(loginAlert, '<i class="fas fa-exclamation-circle"></i> Login failed: ' + error.message, 'error');
                })
                .finally(() => {
                    // Reset button state
                    submitBtn.innerHTML = originalBtnText;
                    submitBtn.disabled = false;
                });
        });
    }
    
    // Helper function to show alerts
    function showAlert(element, message, type) {
        element.innerHTML = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
});