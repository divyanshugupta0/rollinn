// Enhanced Firebase Authentication Helper Functions

// Check if user is already logged in and redirect accordingly
function checkAuthState() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // User is signed in, redirect to dashboard
            console.log('User is already signed in:', user.email);
            showDashboard();
        } else {
            // User is signed out, show login form
            console.log('No user is signed in');
            showLoginForm();
        }
    });
}

// Show login form and hide dashboard
function showLoginForm() {
    document.getElementById('loginContainer').style.display = 'block';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
}

// Show dashboard and hide login form
function showDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.display = 'block';
}

// Initialize authentication state check on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
});

// Enhanced login function with proper error handling
function enhancedLogin(email, password) {
    // Show loading state
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    submitBtn.disabled = true;
    
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Signed in successfully
            console.log('Login successful:', userCredential.user.email);
            
            // Reset form
            document.getElementById('loginForm').reset();
            
            // Show success message
            const loginAlert = document.getElementById('loginAlert');
            loginAlert.innerHTML = '<i class="fas fa-check-circle"></i> Login successful!';
            loginAlert.className = 'alert alert-success';
            loginAlert.style.display = 'block';
            
            // Hide alert after 2 seconds
            setTimeout(() => {
                loginAlert.style.display = 'none';
            }, 2000);
            
            // Show dashboard
            showDashboard();
            
            // Reset button state
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        })
        .catch((error) => {
            console.error('Login error:', error);
            
            // Show error message
            const loginAlert = document.getElementById('loginAlert');
            loginAlert.innerHTML = `<i class="fas fa-exclamation-circle"></i> Login failed: ${error.message}`;
            loginAlert.className = 'alert alert-error';
            loginAlert.style.display = 'block';
            
            // Hide alert after 5 seconds
            setTimeout(() => {
                loginAlert.style.display = 'none';
            }, 5000);
            
            // Reset button state
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        });
}

// Attach enhanced login to form submission
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            enhancedLogin(email, password);
        });
    }
});