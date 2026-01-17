// Firebase Authentication Helper Functions

// Send OTP via Firebase for login verification
function sendLoginOTP(user) {
    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in database for verification
    ownerAuth.database().ref('owners/' + user.uid + '/otpVerification').set({
        otp: otp,
        timestamp: Date.now(),
        expires: Date.now() + 600000 // 10 minutes expiry
    }).then(() => {
        console.log("OTP saved to database");
        
        // Send OTP via Web3Forms API
        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                access_key: '2def5933-b1c7-4028-8655-c2c6b2bf08e2',
                subject: 'Your Login Verification Code',
                from_name: 'RollCall Security',
                to_email: user.email,
                message: `Your login verification code is: ${otp}. This code will expire in 10 minutes.`
            })
        });
        
        // Show OTP verification form
        const loginForm = document.getElementById('loginForm');
        loginForm.innerHTML = `
            <div id="otpVerificationForm" data-uid="${user.uid}" data-email="${user.email}">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    A verification code has been sent to your email: ${user.email}
                </div>
                <div class="mb-4">
                    <label for="otpCode" class="form-label">Verification Code</label>
                    <div class="input-group">
                        <span class="input-group-text"><i class="fas fa-key"></i></span>
                        <input type="text" class="form-control" id="otpCode" placeholder="Enter 6-digit code" required>
                    </div>
                </div>
                <button type="button" class="btn btn-primary w-100 mb-3" onclick="verifyLoginOTP()">
                    <i class="fas fa-shield-alt me-2"></i>Verify & Login
                </button>
                <div class="d-flex justify-content-between">
                    <a href="#" onclick="resendOTP('${user.uid}', '${user.email}')">Resend verification code</a>
                    <a href="#" onclick="cancelOTPVerification()">Cancel</a>
                </div>
            </div>
        `;
    }).catch(error => {
        console.error("Error saving OTP to database:", error);
        showAlert('Error setting up verification', 'danger');
    });
}

// Resend OTP
function resendOTP(uid, email) {
    if (!uid || !email) {
        // Try to get from form if not provided as parameters
        const otpForm = document.getElementById('otpVerificationForm');
        if (otpForm) {
            uid = otpForm.getAttribute('data-uid');
            email = otpForm.getAttribute('data-email');
        }
        
        if (!uid || !email) {
            showAlert('Unable to resend verification code', 'danger');
            return;
        }
    }
    
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Update OTP in database
    ownerAuth.database().ref('owners/' + uid + '/otpVerification').set({
        otp: otp,
        timestamp: Date.now(),
        expires: Date.now() + 600000 // 10 minutes expiry
    }).then(() => {
        // Send new OTP
        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                access_key: '2def5933-b1c7-4028-8655-c2c6b2bf08e2',
                subject: `Your Login Verification Code`,
                from_name: 'RollCall Security',
                to_email: email,
                message: `Your login verification code is: ${otp}. This code will expire in 10 minutes.`
            })
        });
        
        showAlert('New verification code sent', 'info');
    }).catch(error => {
        console.error("Error resending OTP:", error);
        showAlert('Error sending verification code', 'danger');
    });
}

// Verify login OTP
function verifyLoginOTP() {
    const otpCode = document.getElementById('otpCode').value;
    const otpForm = document.getElementById('otpVerificationForm');
    
    if (!otpForm) {
        showAlert('Verification form not found', 'danger');
        return;
    }
    
    const userUid = otpForm.getAttribute('data-uid');
    const userEmail = otpForm.getAttribute('data-email');
    
    if (!otpCode || otpCode.length !== 6 || !/^\d+$/.test(otpCode)) {
        showAlert('Please enter a valid 6-digit code', 'danger');
        return;
    }
    
    if (!userUid) {
        showAlert('Verification session expired', 'danger');
        return;
    }
    
    // Get OTP from database
    ownerAuth.database().ref('owners/' + userUid + '/otpVerification').once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                const otpData = snapshot.val();
                const now = Date.now();
                
                // Check if OTP is expired
                if (now > otpData.expires) {
                    showAlert('Verification code expired', 'danger');
                    return;
                }
                
                // Check if OTP matches
                if (otpCode === otpData.otp) {
                    // OTP is valid, complete login
                    
                    // Clear OTP data from database
                    ownerAuth.database().ref('owners/' + userUid + '/otpVerification').remove();
                    
                    // Complete login
                    showAlert('Verification successful!', 'success');
                    showApp({ uid: userUid, email: userEmail });
                } else {
                    showAlert('Invalid verification code', 'danger');
                }
            } else {
                showAlert('Verification session expired', 'danger');
            }
        })
        .catch(error => {
            console.error("Error verifying OTP:", error);
            showAlert('Error verifying code', 'danger');
        });
}

// Cancel OTP verification
function cancelOTPVerification() {
    const loginForm = document.getElementById('loginForm');
    const otpForm = document.getElementById('otpVerificationForm');
    
    // Get user ID from form if available
    let userUid = null;
    if (otpForm) {
        userUid = otpForm.getAttribute('data-uid');
    }
    
    // Reset login form
    loginForm.innerHTML = `
        <div class="mb-4">
            <label for="email" class="form-label">Email</label>
            <div class="input-group">
                <span class="input-group-text"><i class="fas fa-envelope"></i></span>
                <input type="email" class="form-control" id="email" placeholder="Enter your email" required>
            </div>
        </div>
        <div class="mb-4">
            <label for="password" class="form-label">Password</label>
            <div class="input-group">
                <span class="input-group-text"><i class="fas fa-lock"></i></span>
                <input type="password" class="form-control" id="password" placeholder="Enter your password" required>
            </div>
        </div>
        <div class="mb-4 form-check">
            <input type="checkbox" class="form-check-input" id="rememberMe">
            <label class="form-check-label" for="rememberMe">Remember me</label>
            <a href="#" class="float-end text-decoration-none">Forgot password?</a>
        </div>
        <button type="submit" class="btn btn-primary w-100">
            <i class="fas fa-sign-in-alt me-2"></i>Login
        </button>
    `;
    
    // Clear OTP data from database if we have a user ID
    if (userUid) {
        ownerAuth.database().ref('owners/' + userUid + '/otpVerification').remove();
    }
    
    // Sign out
    ownerAuth.auth().signOut();
}