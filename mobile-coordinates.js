// Mobile Coordinates Functionality
function fetchMobileCoordinates() {
    const modal = document.getElementById('location-email-modal');
    if (modal) {
        modal.classList.add('visible');
    } else {
        // Create modal if it doesn't exist
        createLocationModal();
    }
}

function createLocationModal() {
    const modalHTML = `
    <div id="location-email-modal" class="modal-overlay visible">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Send Location Verification</h3>
                <button class="modal-close" onclick="closeLocationEmailModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="target-email">Enter email address:</label>
                    <input type="email" id="target-email" placeholder="user@example.com" required>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="closeLocationEmailModal()">Cancel</button>
                <button onclick="sendLocationEmail()" class="fetch-btn">Send Email</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeLocationEmailModal() {
    const modal = document.getElementById('location-email-modal');
    if (modal) {
        modal.classList.remove('visible');
        document.getElementById('target-email').value = '';
    }
}

function sendLocationEmail() {
    const email = document.getElementById('target-email').value.trim();
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }

    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    const token = generateToken();
    const locationRequest = {
        email: email,
        token: token,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        status: 'pending',
        adminUid: firebase.auth().currentUser?.uid
    };

    firebase.database().ref('locationRequests/' + token).set(locationRequest)
        .then(() => {
            showStatus('admin-status', 'Location verification email sent successfully to ' + email, 'success');
            closeLocationEmailModal();
            monitorLocationRequest(token);
        })
        .catch((error) => {
            console.error('Error sending location email:', error);
            showStatus('admin-status', 'Failed to send email: ' + error.message, 'error');
        });
}

function monitorLocationRequest(token) {
    const locationRef = firebase.database().ref('locationRequests/' + token);
    locationRef.on('value', (snapshot) => {
        const request = snapshot.val();
        if (request && request.status === 'completed' && request.location) {
            const coordinates = `${request.location.latitude.toFixed(6)}, ${request.location.longitude.toFixed(6)}`;
            document.getElementById('mobile-coordinates').value = coordinates;
            showStatus('admin-status', 'Mobile coordinates received successfully!', 'success');
            locationRef.off();
        }
    });
}

function generateToken() {
    return 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showStatus(elementId, message, type) {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status-indicator ' + type;
        statusElement.classList.remove('hidden');
    }
}