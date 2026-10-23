// Enhanced login handler
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginAlert = document.getElementById('loginAlert');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    
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
                .then(async (userCredential) => {
                    const uid = userCredential.user.uid;
                    const [profileSnapshot, blockedSnapshot] = await Promise.all([
                        firebase.database().ref(`users/${uid}`).once('value'),
                        firebase.database().ref(`blockedUsers/${uid}`).once('value')
                    ]);
                    const profile = profileSnapshot.val() || {};
                    const blockStatus = await window.RollCallAccountBlockStatus.check(
                        profile,
                        blockedSnapshot,
                        'teacher',
                        async blockerUid => {
                            const blockerSnapshot = await firebase.database().ref(`users/${blockerUid}`).once('value');
                            return blockerSnapshot.val() || {};
                        }
                    );
                    if (blockStatus.blocked) {
                        await firebase.auth().signOut().catch(() => {});
                        const reason = blockStatus.reason;
                        const blockedError = new Error(`This teacher account has been blocked.${reason ? ` Reason: ${reason}` : ''} Contact your school administrator.`);
                        blockedError.code = 'auth/user-disabled';
                        throw blockedError;
                    }

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
                    showAlert(loginAlert, '<i class="fas fa-exclamation-circle"></i> Login failed: ' + escapeHtml(error.message), 'error');
                    if (error.code === 'auth/user-disabled') loginAlert.dataset.persistent = 'true';
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
        if (type !== 'error' || !String(message).includes('blocked.')) element.dataset.persistent = 'false';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            if (element.dataset.persistent !== 'true') element.style.display = 'none';
        }, 5000);
    }
});
