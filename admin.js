
// Initialize attendance modification section
function initAttendanceModification() {
    console.log("Initializing attendance modification section");

    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    // Get references to Firebase services
    const db = firebase.database();

    // Find the correct section - could be original template or active clone
    const originalSection = document.getElementById('attendance-modification-section');
    const activeSection = document.getElementById('attendance-modification-section-active');

    // Pick which section is currently visible
    const section = activeSection || originalSection;

    if (!section) {
        console.error('Attendance modification section not found in DOM');
        return;
    }

    // Find the list container inside the correct section
    const requestsList = section.querySelector('#modification-requests-list');

    if (!requestsList) {
        console.error('Modification requests list element not found');
        console.log('Section HTML:', section.innerHTML);
        return;
    }

    console.log('Found modification requests list:', requestsList);

    // Find template for request cards
    const template = document.getElementById('modification-request-template');
    if (!template) {
        console.error('Modification request template not found');
        return;
    }

    // Show loading indicator
    requestsList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading modification requests...</div>';

    // Listen for modification requests
    db.ref('modificationRequests').on('value', (snapshot) => {
        try {
            const requests = snapshot.val() || {};
            console.log('Loaded modification requests:', Object.keys(requests).length);

            // Clear previous content
            requestsList.innerHTML = '';

            if (!requests || Object.keys(requests).length === 0) {
                requestsList.innerHTML = `
                    <div class="status-indicator info">
                        <p>No modification requests found.</p>
                    </div>
                `;
                return;
            }

            // Sort requests by timestamp (newest first)
            const sortedRequests = Object.entries(requests)
                .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));

            console.log('Processing sorted requests:', sortedRequests.length);

            sortedRequests.forEach(([requestId, request]) => {
                try {
                    console.log('Creating card for request:', requestId);
                    const card = template.content.cloneNode(true);

                    // Set request details with error handling
                    try { card.querySelector('.teacher-name').textContent = request.teacherName || 'Unknown'; } catch (e) { }
                    try { card.querySelector('.date').textContent = new Date(request.timestamp || Date.now()).toLocaleString(); } catch (e) { }
                    try { card.querySelector('.class-name').textContent = request.className || 'Unknown'; } catch (e) { }
                    try { card.querySelector('.student-name').textContent = request.studentName || 'Unknown'; } catch (e) { }
                    try { card.querySelector('.status').textContent = request.status || 'pending'; } catch (e) { }
                    try { card.querySelector('.old-status').textContent = request.oldStatus || 'Unknown'; } catch (e) { }
                    try { card.querySelector('.new-status').textContent = request.newStatus || 'Unknown'; } catch (e) { }
                    try { card.querySelector('.reason').textContent = request.reason || 'No reason provided'; } catch (e) { }

                    // Add status-specific styling
                    const statusBadge = card.querySelector('.status-badge');
                    if (statusBadge) {
                        statusBadge.classList.remove('pending', 'approved', 'rejected');
                        switch (request.status) {
                            case 'pending':
                                statusBadge.classList.add('pending');
                                break;
                            case 'approved':
                                statusBadge.classList.add('approved');
                                break;
                            case 'rejected':
                                statusBadge.classList.add('rejected');
                                break;
                            default:
                                statusBadge.classList.add('pending');
                        }
                    }

                    // Handle approve button
                    const approveBtn = card.querySelector('.approve-btn');
                    if (approveBtn) {
                        approveBtn.addEventListener('click', () => {
                            if (confirm('Are you sure you want to approve this modification request?')) {
                                approveModificationRequest(requestId, request);
                            }
                        });
                    }

                    // Handle reject button
                    const rejectBtn = card.querySelector('.reject-btn');
                    if (rejectBtn) {
                        rejectBtn.addEventListener('click', () => {
                            const reason = prompt('Please provide a reason for rejection:');
                            if (reason !== null) {
                                rejectModificationRequest(requestId, request, reason);
                            }
                        });
                    }

                    // Only show action buttons for pending requests
                    const actions = card.querySelector('.request-actions');
                    if (request.status !== 'pending' && actions) {
                        actions.style.display = 'none';
                    }

                    requestsList.appendChild(card);
                    console.log('Card appended for request:', requestId);
                } catch (cardError) {
                    console.error('Error creating request card:', cardError);
                }
            });
        } catch (error) {
            console.error('Error processing modification requests:', error);
            requestsList.innerHTML = `
                <div class="status-indicator error">
                    <p>Error loading modification requests. Please try refreshing.</p>
                    <p>Error: ${error.message}</p>
                </div>
            `;
        }
    }, (error) => {
        console.error('Firebase error when loading modification requests:', error);
        requestsList.innerHTML = `
            <div class="status-indicator error">
                <p>Error connecting to database. Please check your connection and try again.</p>
                <p>Error: ${error ? error.message : 'Unknown error'}</p>
            </div>
        `;
    });
}

// Handle modification request approval
function approveModificationRequest(requestId, request) {
    const { date, classId, studentId, newStatus } = request;

    // Update attendance record
    firebase.database().ref(`attendance/${classId}/${date}/${studentId}`).update({
        status: newStatus,
        lastModified: Date.now(),
        modifiedBy: 'admin',
        modificationReason: request.reason
    })
        .then(() => {
            // Update request status
            return firebase.database().ref(`modificationRequests/${requestId}`).update({
                status: 'approved',
                approvedAt: Date.now(),
                approvedBy: firebase.auth().currentUser.uid
            });
        })
        .then(() => {
            // Notify teacher
            return firebase.database().ref(`notifications/${request.teacherId}`).push({
                type: 'modification_approved',
                message: `Your attendance modification request for ${request.studentName} has been approved.`,
                timestamp: Date.now(),
                read: false
            });
        })
        .then(() => {
            showAlert('Modification request approved successfully', 'success');
        })
        .catch((error) => {
            console.error('Error approving modification:', error);
            showAlert('Error approving modification request', 'error');
        });
}

// Handle modification request rejection
function rejectModificationRequest(requestId, request, reason) {
    firebase.database().ref(`modificationRequests/${requestId}`).update({
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: firebase.auth().currentUser.uid,
        rejectionReason: reason
    })
        .then(() => {
            // Notify teacher
            return firebase.database().ref(`notifications/${request.teacherId}`).push({
                type: 'modification_rejected',
                message: `Your attendance modification request for ${request.studentName} has been rejected. Reason: ${reason}`,
                timestamp: Date.now(),
                read: false
            });
        })
        .then(() => {
            showAlert('Modification request rejected', 'success');
        })
        .catch((error) => {
            console.error('Error rejecting modification:', error);
            showAlert('Error rejecting modification request', 'error');
        });
}

let sidebarBadgesInitialized = false;
const SIDEBAR_BADGE_KEYS = {
    notifications: 'adminNotificationsLastSeen',
    profile: 'adminProfileRequestsLastSeen'
};

function getLastSeen(key) {
    try {
        const raw = localStorage.getItem(key);
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    } catch (e) {
        return 0;
    }
}

function setLastSeen(key, value) {
    try {
        const nextValue = Number.isFinite(value) ? value : Date.now();
        localStorage.setItem(key, String(nextValue));
    } catch (e) {
        // Ignore storage errors (e.g., privacy mode)
    }
}

function setSidebarBadge(badgeEl, count) {
    if (!badgeEl) return;
    const value = Number(count) || 0;
    if (value <= 0) {
        badgeEl.textContent = '';
        badgeEl.classList.add('is-hidden');
        return;
    }
    badgeEl.textContent = value > 99 ? '99+' : String(value);
    badgeEl.classList.remove('is-hidden');
}

function markNotificationsSeen() {
    setLastSeen(SIDEBAR_BADGE_KEYS.notifications, Date.now());
    setSidebarBadge(document.getElementById('notification-badge'), 0);
}

function markProfileRequestsSeen() {
    setLastSeen(SIDEBAR_BADGE_KEYS.profile, Date.now());
    setSidebarBadge(document.getElementById('profile-badge'), 0);
}

function initSidebarBadges() {
    if (sidebarBadgesInitialized) return;
    sidebarBadgesInitialized = true;

    const notificationBadge = document.getElementById('notification-badge');
    const profileBadge = document.getElementById('profile-badge');
    if (!notificationBadge && !profileBadge) return;

    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();

    // Notifications badge (unread)
    const notificationsRef = db.ref('notifications').orderByChild('timestamp').limitToLast(200);
    notificationsRef.on('value', (snapshot) => {
        const lastSeen = getLastSeen(SIDEBAR_BADGE_KEYS.notifications);
        let unreadCount = 0;
        snapshot.forEach(child => {
            const notif = child.val() || {};
            const timestamp = Number(notif.timestamp) || 0;
            if (timestamp > lastSeen && notif.read !== true) {
                unreadCount += 1;
            }
        });
        setSidebarBadge(notificationBadge, unreadCount);
    }, () => {
        setSidebarBadge(notificationBadge, 0);
    });

    // Profile requests badge (pending)
    let profileRequestsCount = 0;
    let profileUpdateCount = 0;

    const updateProfileBadge = () => {
        setSidebarBadge(profileBadge, profileRequestsCount + profileUpdateCount);
    };

    db.ref('profileRequests').on('value', (snapshot) => {
        const lastSeen = getLastSeen(SIDEBAR_BADGE_KEYS.profile);
        let count = 0;
        snapshot.forEach(child => {
            const data = child.val() || {};
            const status = String(data.status || 'pending').toLowerCase();
            const timestamp = Number(data.timestamp) || 0;
            if (status === 'pending' && timestamp > lastSeen) {
                count += 1;
            }
        });
        profileRequestsCount = count;
        updateProfileBadge();
    }, () => {
        profileRequestsCount = 0;
        updateProfileBadge();
    });

    db.ref('profile_update_requests').on('value', (snapshot) => {
        const lastSeen = getLastSeen(SIDEBAR_BADGE_KEYS.profile);
        let count = 0;
        snapshot.forEach(child => {
            const data = child.val() || {};
            const status = String(data.status || 'pending').toLowerCase();
            const timestamp = Number(data.timestamp) || 0;
            if (status === 'pending' && timestamp > lastSeen) {
                count += 1;
            }
        });
        profileUpdateCount = count;
        updateProfileBadge();
    }, () => {
        profileUpdateCount = 0;
        updateProfileBadge();
    });
}

// Add refresh button functionality
function setupRefreshButton() {
    // Add refresh button functionality to both template and active sections
    const refreshBtns = document.querySelectorAll('#refresh-modification-requests');
    refreshBtns.forEach(btn => {
        if (btn) {
            console.log('Found refresh button, attaching listener');
            btn.addEventListener('click', () => {
                console.log('Refresh button clicked');
                initAttendanceModification();
            });
        }
    });
}

// Initialize the section when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // First initialization
    initAttendanceModification();

    // Setup refresh button
    setupRefreshButton();

    // Initialize sidebar badges
    initSidebarBadges();

    // Add global click handler for dynamically added buttons
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'refresh-modification-requests' ||
            (e.target.closest('button') && e.target.closest('button').id === 'refresh-modification-requests')) {
            initAttendanceModification();
            showAlert('Modification requests refreshed', 'success');
        }
    });
});



function initBlockedUsers() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    // Get references to Firebase services
    const db = firebase.database();

    // Create blocked users section if it doesn't exist
    if (!document.getElementById('blocked-users-section')) {
        const section = document.createElement('div');
        section.id = 'blocked-users-section';
        section.className = 'section-template';
        section.innerHTML = `
                    <div class="card">
                        <div class="header">
                            <div class="header-content">
                                <button class="section-menu-btn">
                                    <i class="fas fa-bars"></i>
                                </button>
                                <h2><i class="fas fa-ban"></i> Blocked Users</h2>
                            </div>
                            <button id="add-blocked-user-btn" class="primary-btn" style="padding: 8px 16px;">
                                <i class="fas fa-plus"></i> Add User
                            </button>
                            <button id="refresh-blocked-users-btn" class="primary-btn" style="padding: 8px 16px;">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                        </div>
                        <div class="card-body">
                            <div id="blocked-users-container">
                                <div class="status-indicator info">
                                    <p>This section shows blocked users. These users cannot log in to the system.</p>
                                </div>
                                <table class="attendance-list">
                                    <thead>
                                        <tr>
                                            <th>Email</th>
                                            <th>Name</th>
                                            <th>Blocked Date</th>
                                            <th>Reason</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="blocked-users-list">
                                        <!-- Blocked users will be listed here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                </div>
            `;
        document.body.appendChild(section);
    }

    // Create popup for adding blocked users
    if (!document.getElementById('block-user-popup')) {
        const popup = document.createElement('div');
        popup.id = 'block-user-popup';
        popup.className = 'popup-overlay hidden';
        popup.innerHTML = `
                    <div class="popup-content">
                        <div class="popup-header">
                            <h3>Block User</h3>
                            <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="popup-body">
                            <p>Select a student to block from the system:</p>
                            <div class="form-group">
                                <label for="student-select">Student:</label>
                                <select id="student-select" class="form-control">
                                    <option value="">Loading students...</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="block-reason">Reason (optional):</label>
                                <textarea id="block-reason" class="form-control" rows="3"></textarea>
                            </div>
                        </div>
                        <div class="popup-footer">
                            <button id="confirm-block-btn" class="primary-btn">Block User</button>
                            <button class="cancel-btn close-popup-btn">Cancel</button>
                        </div>
            </div>
                `;
        document.body.appendChild(popup);
    }

    // Function to load blocked users
    function loadBlockedUsers() {
        const blockedUsersList = document.getElementById('blocked-users-list');
        blockedUsersList.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center;">
                            <i class="fas fa-spinner fa-spin"></i> Loading blocked users...
                        </td>
                    </tr>`;

        db.ref('blockedUsers').once('value')
            .then(snapshot => {
                if (snapshot.exists()) {
                    let html = '';
                    snapshot.forEach(childSnapshot => {
                        const userId = childSnapshot.key;
                        const userData = childSnapshot.val();
                        html += `
                                    <tr>
                                        <td>${userData.email || 'N/A'}</td>
                                        <td>${userData.name || 'N/A'}</td>
                                        <td>${userData.reason || 'No reason provided'}</td>
                                        <td>${new Date(userData.blockedDate).toLocaleString()}</td>
                                        <td>
                                            <button class="unblock-user-btn small-btn" data-id="${userId}" data-name="${userData.name || 'Unknown'}" data-email="${userData.email || 'No email'}">
                                                <i class="fas fa-unlock"></i> Unblock
                                                </button>
                                        </td>
                                    </tr>
        `;
                    });

                    if (html === '') {
                        blockedUsersList.innerHTML = `
                                    <tr>
                                        <td colspan="5" style="text-align: center;">No blocked users found</td>
                                    </tr>`;
                    } else {
                        blockedUsersList.innerHTML = html;

                        // Add event listeners to unblock buttons
                        document.querySelectorAll('.unblock-user-btn').forEach(btn => {
                            btn.addEventListener('click', function () {
                                const userId = this.getAttribute('data-id');
                                const userName = this.getAttribute('data-name');
                                const userEmail = this.getAttribute('data-email');

                                // Show unblock confirmation popup
                                document.getElementById('unblock-user-name').textContent = userName;
                                document.getElementById('unblock-user-email').textContent = userEmail;
                                document.getElementById('unblock-confirm-popup').classList.remove('hidden');

                                // Store the user ID for the confirm button
                                document.getElementById('confirm-unblock-btn').setAttribute('data-id', userId);
                            });
                        });
                    }
                } else {
                    blockedUsersList.innerHTML = `
                                <tr>
                                    <td colspan="5" style="text-align: center;">No blocked users found</td>
                                </tr>`;
                }
            })
            .catch(error => {
                blockedUsersList.innerHTML = `
                            <tr>
                                <td colspan="5" style="text-align: center;">Error loading blocked users: ${error.message}</td>
                            </tr>`;
            });
    }

    // Function to load students for the dropdown
    function loadStudents() {
        const studentSelect = document.getElementById('student-select');
        studentSelect.innerHTML = '<option value="">Loading students...</option>';

        db.ref('users').orderByChild('role').equalTo('student').once('value')
            .then(snapshot => {
                let options = '<option value="">Select a student</option>';
                if (snapshot.exists()) {
                    snapshot.forEach(childSnapshot => {
                        const userId = childSnapshot.key;
                        const userData = childSnapshot.val();
                        // Skip already blocked users
                        if (!userData.blocked) {
                            options += `<option value="${userId}" data-name="${userData.name}" data-email="${userData.email}">${userData.name} (${userData.email})</option>`;
                        }
                    });
                }
                studentSelect.innerHTML = options;
            })
            .catch(error => {
                studentSelect.innerHTML = '<option value="">Error loading students</option>';
                console.error('Error loading students:', error);
            });
    }

    // Add event listeners
    document.getElementById('refresh-blocked-users-btn').addEventListener('click', loadBlockedUsers);

    document.getElementById('add-blocked-user-btn').addEventListener('click', function () {
        loadStudents();
        document.getElementById('block-user-popup').classList.remove('hidden');
    });

    document.querySelectorAll('.close-popup-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            // Hide all popups
            document.querySelectorAll('.popup-container').forEach(popup => {
                popup.classList.add('hidden');
            });
        });
    });

    document.getElementById('confirm-block-btn').addEventListener('click', function () {
        const studentSelect = document.getElementById('student-select');
        const studentId = studentSelect.value;
        const reason = document.getElementById('block-reason').value;

        if (!studentId) {
            alert('Please select a student to block');
            return;
        }

        // Get selected student details
        const selectedOption = studentSelect.options[studentSelect.selectedIndex];
        const studentName = selectedOption.getAttribute('data-name');
        const studentEmail = selectedOption.getAttribute('data-email');

        // Show block confirmation popup
        document.getElementById('block-confirm-user-name').textContent = studentName;
        document.getElementById('block-confirm-user-email').textContent = studentEmail;
        document.getElementById('block-confirm-popup').classList.remove('hidden');
        document.getElementById('block-user-popup').classList.add('hidden');

        // Store data for final confirmation
        document.getElementById('final-confirm-block-btn').setAttribute('data-id', studentId);
        document.getElementById('final-confirm-block-btn').setAttribute('data-reason', reason);
    });

    // Handle final block confirmation
    document.getElementById('final-confirm-block-btn').addEventListener('click', function () {
        const studentId = this.getAttribute('data-id');
        const reason = this.getAttribute('data-reason');

        db.ref(`users/${studentId}`).once('value')
            .then(snapshot => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();

                    // Add to blocked users list
                    db.ref(`blockedUsers/${studentId}`).set({
                        email: userData.email,
                        name: userData.name,
                        reason: reason,
                        blockedDate: Date.now()
                    })
                        .then(() => {
                            // Update user record
                            return db.ref(`users/${studentId}`).update({
                                blocked: true
                            });
                        })
                        .then(() => {
                            document.getElementById('block-confirm-popup').classList.add('hidden');
                            loadBlockedUsers();
                        })
                        .catch(error => {
                            alert('Error blocking user: ' + error.message);
                        });
                } else {
                    alert('Selected student not found');
                }
            })
            .catch(error => {
                alert('Error blocking user: ' + error.message);
            });
    });

    // Handle unblock confirmation
    document.getElementById('confirm-unblock-btn').addEventListener('click', function () {
        const userId = this.getAttribute('data-id');

        db.ref(`blockedUsers/${userId}`).remove()
            .then(() => {
                // Update user record
                return db.ref(`users/${userId}`).update({
                    blocked: false
                });
            })
            .then(() => {
                document.getElementById('unblock-confirm-popup').classList.add('hidden');
                loadBlockedUsers();
            })
            .catch(error => {
                alert('Error unblocking user: ' + error.message);
            });
    });

    // Load blocked users on initialization
    loadBlockedUsers();
}

function initDownloadLimitSection() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const originalSection = document.getElementById('download-limit-section');
    const activeSection = document.getElementById('download-limit-section-active');
    const section = activeSection || originalSection;

    if (!section) {
        console.error('Download limit section not found in DOM');
        return;
    }

    const listEl = section.querySelector('#download-limit-list');
    const summaryEl = section.querySelector('#download-limit-summary');
    const refreshBtn = section.querySelector('#refresh-download-limit-btn');
    const downloadLimit = 1;

    if (!listEl) {
        console.error('Download limit list element not found');
        return;
    }

    const renderSummary = (count) => {
        if (!summaryEl) return;
        summaryEl.innerHTML = `
            <p>Android app download limit: <strong>${downloadLimit}</strong>. Users at or above limit: <strong>${count}</strong>.</p>
        `;
    };

    const loadDownloadLimitUsers = () => {
        listEl.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center;">
                    <i class="fas fa-spinner fa-spin"></i> Loading download limits...
                </td>
            </tr>`;

        db.ref('users').orderByChild('appDownloadUsed').startAt(downloadLimit).once('value')
            .then(snapshot => {
                const users = [];
                snapshot.forEach(childSnapshot => {
                    const userData = childSnapshot.val() || {};
                    const used = Number(userData.appDownloadUsed || 0);
                    if (used < downloadLimit) return;
                    users.push({
                        id: childSnapshot.key,
                        name: userData.name || userData.displayName || 'Unknown',
                        email: userData.email || 'N/A',
                        role: userData.role || 'N/A',
                        used,
                        classRoll: userData.classRoll,
                        univRoll: userData.univRoll
                    });
                });

                users.sort((a, b) => {
                    if (b.used !== a.used) return b.used - a.used;
                    return (a.name || '').localeCompare(b.name || '');
                });

                if (!users.length) {
                    listEl.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center;">No users have reached the download limit.</td>
                        </tr>`;
                    renderSummary(0);
                    return;
                }

                listEl.innerHTML = users.map(user => {
                    const rollBits = [];
                    if (user.classRoll) rollBits.push(`Class: ${user.classRoll}`);
                    if (user.univRoll) rollBits.push(`Univ: ${user.univRoll}`);
                    const rollHtml = rollBits.length
                        ? `<div style="font-size: 0.8rem; color: #6b7280;">${rollBits.join(' | ')}</div>`
                        : '';
                    const status = user.used > downloadLimit
                        ? `Exceeded by ${user.used - downloadLimit}`
                        : 'Limit reached';
                    return `
                        <tr>
                            <td>${user.name}${rollHtml}</td>
                            <td>${user.email}</td>
                            <td>${user.role}</td>
                            <td>${user.used}</td>
                            <td>${status}</td>
                            <td>
                                <button class="small-btn revive-download-credit-btn" data-id="${user.id}" data-name="${user.name || 'User'}" data-email="${user.email || ''}">
                                    <i class="fas fa-undo"></i> Revive
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');

                renderSummary(users.length);

                section.querySelectorAll('.revive-download-credit-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const userId = btn.getAttribute('data-id');
                        const userName = btn.getAttribute('data-name') || 'User';
                        const userEmail = btn.getAttribute('data-email') || '';
                        const label = userEmail ? `${userName} (${userEmail})` : userName;
                        const confirmReset = confirm(`Reset download credits for ${label}?`);
                        if (!confirmReset) return;

                        db.ref(`users/${userId}/appDownloadUsed`).set(0)
                            .then(() => {
                                if (typeof showAlert === 'function') {
                                    showAlert('Download credits revived successfully', 'success');
                                }
                                loadDownloadLimitUsers();
                            })
                            .catch(error => {
                                if (typeof showAlert === 'function') {
                                    showAlert(`Error reviving credits: ${error.message}`, 'error');
                                } else {
                                    alert(`Error reviving credits: ${error.message}`);
                                }
                            });
                    });
                });
            })
            .catch(error => {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center;">Error loading download limits: ${error.message}</td>
                    </tr>`;
                if (summaryEl) {
                    summaryEl.innerHTML = `<p>Error loading download limit users: ${error.message}</p>`;
                }
            });
    };

    if (refreshBtn) {
        refreshBtn.onclick = loadDownloadLimitUsers;
    }

    loadDownloadLimitUsers();
}

function initDeviceLocksSection() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const originalSection = document.getElementById('device-locks-section');
    const activeSection = document.getElementById('device-locks-section-active');
    const section = activeSection || originalSection;

    if (!section) {
        console.error('Device locks section not found in DOM');
        return;
    }

    const listEl = section.querySelector('#device-locks-list');
    const countEl = section.querySelector('#device-locks-count');
    const refreshBtn = section.querySelector('#refresh-device-locks-btn');
    const infoEl = section.querySelector('.status-indicator');
    const LOCK_WINDOW_MS = 30 * 60 * 1000;

    if (!listEl) {
        console.error('Device locks list element not found');
        return;
    }

    const formatDate = (value) => {
        if (!value || isNaN(value)) return 'Unknown';
        const date = new Date(Number(value));
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    };

    const formatRemaining = (remainingMs) => {
        if (remainingMs === null) return 'Unknown';
        const minutes = Math.ceil(remainingMs / 60000);
        return minutes > 0 ? `${minutes} min` : 'Expired';
    };

    const loadDeviceLocks = () => {
        listEl.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center;">
                    <i class="fas fa-spinner fa-spin"></i> Loading device locks...
                </td>
            </tr>`;

        db.ref('userLocks').once('value')
            .then(snapshot => {
                if (!snapshot.exists()) {
                    listEl.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center;">No active device locks.</td>
                        </tr>`;
                    if (infoEl) {
                        infoEl.innerHTML = '<p>No active device locks found.</p>';
                    }
                    if (countEl) {
                        countEl.textContent = '0';
                    }
                    return;
                }

                const locks = [];
                const userPromises = [];
                const userDataMap = {};
                let expiredCount = 0;

                snapshot.forEach(childSnapshot => {
                    const lock = childSnapshot.val() || {};
                    const userId = childSnapshot.key;
                    const attendanceTime = Number(lock.attendanceTime || 0);
                    const elapsed = attendanceTime ? Date.now() - attendanceTime : 0;
                    const remaining = attendanceTime ? Math.max(LOCK_WINDOW_MS - elapsed, 0) : null;
                    const isActive = attendanceTime ? remaining > 0 : true;

                    if (!isActive) {
                        expiredCount += 1;
                        return;
                    }

                    if (userId) {
                        userPromises.push(
                            db.ref(`users/${userId}`).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    locks.push({
                        userId,
                        lock,
                        attendanceTime,
                        remaining
                    });
                });

                Promise.all(userPromises).then(() => {
                    locks.forEach(item => {
                        const userData = userDataMap[item.userId] || {};
                        item.userName = userData.name || userData.displayName || item.lock.userName || 'Unknown User';
                        item.userEmail = userData.email || item.lock.userEmail || 'No email';
                    });

                    if (countEl) {
                        countEl.textContent = String(locks.length);
                    }

                    if (!locks.length) {
                        listEl.innerHTML = `
                            <tr>
                                <td colspan="6" style="text-align: center;">No active device locks.</td>
                            </tr>`;
                        if (infoEl) {
                            infoEl.innerHTML = `<p>No active device locks found.${expiredCount ? ` ${expiredCount} expired lock(s) hidden.` : ''}</p>`;
                        }
                        if (countEl) {
                            countEl.textContent = '0';
                        }
                        return;
                    }

                    locks.sort((a, b) => b.attendanceTime - a.attendanceTime);

                    listEl.innerHTML = locks.map(item => {
                        const deviceId = item.lock.deviceId || '';
                        const fingerprint = item.lock.deviceFingerprint || '';
                        const deviceLabel = deviceId ? deviceId.slice(0, 10) : 'N/A';
                        const fingerprintLabel = fingerprint ? fingerprint.slice(0, 10) : 'N/A';
                        return `
                            <tr>
                                <td>
                                    <div style="font-weight: 600;">${item.userName}</div>
                                    <div style="font-size: 0.85rem; color: #6b7280;">${item.userEmail}</div>
                                </td>
                                <td>${item.lock.locationName || 'Unknown'}</td>
                                <td>${formatDate(item.attendanceTime)}</td>
                                <td>${formatRemaining(item.remaining)}</td>
                                <td>
                                    <div style="font-size: 0.85rem; color: #64748b;">Device: ${deviceLabel}</div>
                                    <div style="font-size: 0.85rem; color: #94a3b8;">Fingerprint: ${fingerprintLabel}</div>
                                </td>
                                <td>
                                    <button class="small-btn clear-device-lock-btn" data-user-id="${item.userId}" data-device-id="${deviceId}" data-device-fingerprint="${fingerprint}">
                                        <i class="fas fa-unlock"></i> Clear
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('');

                    if (infoEl) {
                        infoEl.innerHTML = `<p>${locks.length} active lock(s).${expiredCount ? ` ${expiredCount} expired lock(s) hidden.` : ''}</p>`;
                    }

                    section.querySelectorAll('.clear-device-lock-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const userId = btn.getAttribute('data-user-id');
                            const deviceId = btn.getAttribute('data-device-id');
                            const deviceFingerprint = btn.getAttribute('data-device-fingerprint');
                            if (!userId) return;
                            if (!confirm('Clear this user device lock?')) return;

                            const removals = [
                                db.ref(`userLocks/${userId}`).remove()
                            ];
                            if (deviceId) {
                                removals.push(db.ref(`deviceLocks/${deviceId}`).remove());
                            }
                            if (deviceFingerprint) {
                                removals.push(db.ref(`deviceFingerprintLocks/${deviceFingerprint}`).remove());
                            }

                            Promise.all(removals)
                                .then(() => {
                                    if (typeof showAlert === 'function') {
                                        showAlert('Device lock cleared', 'success');
                                    }
                                    loadDeviceLocks();
                                })
                                .catch(error => {
                                    if (typeof showAlert === 'function') {
                                        showAlert(`Error clearing lock: ${error.message}`, 'error');
                                    } else {
                                        alert(`Error clearing lock: ${error.message}`);
                                    }
                                });
                        });
                    });
                });
            })
            .catch(error => {
                listEl.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center;">Error loading device locks: ${error.message}</td>
                    </tr>`;
                if (infoEl) {
                    infoEl.innerHTML = `<p>Error loading device locks.</p>`;
                }
                if (countEl) {
                    countEl.textContent = '0';
                }
            });
    };

    if (refreshBtn) {
        refreshBtn.onclick = loadDeviceLocks;
    }

    loadDeviceLocks();
}
function initDatabaseManagement() {
    // Initialize Firebase if not already initialized
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        const firebaseConfig = {
            apiKey: "AIzaSyD_An-qb0XTLpaLdrOftAEOqsshGpPbv1w",
            authDomain: "firefly-64eef.firebaseapp.com",
            databaseURL: "https://firefly-64eef-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "firefly-64eef",
            storageBucket: "firefly-64eef.firebasestorage.app",
            messagingSenderId: "563239732954",
            appId: "1:563239732954:web:1774bfd1f7aceedeb707e3",
            measurementId: "G-RKL3BV2H03"
        };
        firebase.initializeApp(firebaseConfig);
    }

    // Get references to Firebase services
    const db = firebase.database();

    // Create delete all confirmation popup if it doesn't exist
    if (!document.getElementById('delete-all-db-popup')) {
        const popup = document.createElement('div');
        popup.id = 'delete-all-db-popup';
        popup.className = 'popup-container hidden';
        popup.innerHTML = `
                    <div class="popup">
                        <div class="popup-header">
                            <h3>Confirm Delete All Database</h3>
                            <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="popup-body">
                            <div class="confirmation-message">
                                <i class="fas fa-exclamation-triangle confirmation-icon"></i>
                                <p>Are you sure you want to delete the entire database?</p>
                                <p><strong>This action cannot be undone and will delete ALL data!</strong></p>
                                <div class="section-details">
                                    <p>To confirm, type <strong>DELETE</strong> in the box below:</p>
                                    <input type="text" id="delete-confirmation-input" class="reason-input" placeholder="Type DELETE here" style="min-height: 40px;">
                                </div>
                            </div>
                            <div class="popup-actions">
                                <button id="confirm-delete-all-btn" class="primary-btn" style="background-color: var(--danger-color);" disabled>Delete Entire Database</button>
                                <button class="close-popup-btn secondary-btn">Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
        document.body.appendChild(popup);
    }

    // Add CSS for popups if not already present
    if (!document.getElementById('popup-styles')) {
        const style = document.createElement('style');
        style.id = 'popup-styles';
        style.textContent = `
                    .popup-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.5);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 1000;
                    }
                    .popup-container.hidden {
                        display: none;
                    }
                    .popup {
                        background-color: white;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        width: 90%;
                        max-width: 500px;
                        max-height: 90vh;
                        overflow-y: auto;
                    }
                    .popup-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        border-bottom: 1px solid #eee;
                    }
                    .popup-body {
                        padding: 20px;
                    }
                    .confirmation-message {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .confirmation-icon {
                        font-size: 48px;
                        color: var(--warning-color);
                        margin-bottom: 15px;
                    }
                    .popup-actions {
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 20px;
                    }
                    .section-details {
                        margin: 15px 0;
                        padding: 10px;
                        background-color: #f9f9f9;
                        border-radius: 4px;
                    }
                `;
        document.head.appendChild(style);
    }

    // Require PIN verification before showing database management section
    const dbSection = document.getElementById('database-management-section');
    if (dbSection) {
        dbSection.classList.add('hidden');

        // Show PIN verification popup
        const verificationPopup = document.getElementById('password-verification-popup');
        if (verificationPopup) {
            verificationPopup.classList.remove('hidden');

            // Focus on first PIN input
            const firstPinInput = verificationPopup.querySelector('.pin-input');
            if (firstPinInput) {
                firstPinInput.focus();
            }

            // Set up PIN input behavior
            setupPinInputs();

            // Add event listener for verify button
            const verifyBtn = document.getElementById('verify-pin-btn');
            if (verifyBtn) {
                verifyBtn.addEventListener('click', verifyAdminPin);
            }
        }
    }

    // Function to set up PIN input behavior
    function setupPinInputs() {
        const pinInputs = document.querySelectorAll('.pin-input');

        pinInputs.forEach((input, index) => {
            // Auto-focus next input when a digit is entered
            input.addEventListener('input', function () {
                if (this.value.length === 1) {
                    if (index < pinInputs.length - 1) {
                        pinInputs[index + 1].focus();
                    } else {
                        // If last input, trigger verify
                        document.getElementById('verify-pin-btn').click();
                    }
                }
            });

            // Handle backspace to go to previous input
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && this.value.length === 0 && index > 0) {
                    pinInputs[index - 1].focus();
                }
            });
        });
    }

    // Function to verify admin PIN
    function verifyAdminPin() {
        const pinInputs = document.querySelectorAll('.pin-input');
        let pin = '';

        // Collect PIN from inputs
        pinInputs.forEach(input => {
            pin += input.value;
        });

        // Check if PIN is correct
        db.ref('adminSettings/dbManagementPassword').once('value')
            .then(snapshot => {
                const correctPin = snapshot.val();

                if (pin === correctPin) {
                    // PIN is correct, hide verification popup and show database section
                    document.getElementById('password-verification-popup').classList.add('hidden');
                    document.getElementById('database-management-section').classList.remove('hidden');

                    // Clear PIN inputs
                    pinInputs.forEach(input => {
                        input.value = '';
                    });

                    // Hide error message if visible
                    const errorMsg = document.getElementById('pin-error-message');
                    if (errorMsg) {
                        errorMsg.style.display = 'none';
                    }

                    // Initialize database management functionality
                    initDatabaseManagementFunctionality();
                } else {
                    // PIN is incorrect, show error message
                    const errorMsg = document.getElementById('pin-error-message');
                    if (errorMsg) {
                        errorMsg.style.display = 'block';
                    }

                    // Clear PIN inputs and focus on first input
                    pinInputs.forEach(input => {
                        input.value = '';
                    });
                    pinInputs[0].focus();
                }
            })
            .catch(error => {
                console.error('Error verifying PIN:', error);
                alert('Error verifying PIN: ' + error.message);
            });
    }

    // Add event listener for close popup buttons
    document.querySelectorAll('.close-popup-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const popup = this.closest('.popup-container');
            if (popup) {
                popup.classList.add('hidden');
            }
        });
    });

    // Function to initialize database management functionality
    function initDatabaseManagementFunctionality() {
        // Make sure we're using the same database reference
        const db = firebase.database();

        // Load database sections
        loadDatabaseSections();

        // Add event listeners after all elements are created
        setTimeout(() => {
            // Add event listener for refresh button
            const refreshBtn = document.getElementById('refresh-db-sections-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    loadDatabaseSections();
                });
            }

            // Add event listener for delete all button
            const deleteAllBtn = document.getElementById('database-delete-all');
            if (deleteAllBtn) {
                deleteAllBtn.addEventListener('click', function () {
                    showDeleteAllConfirmation();
                });
            }

            // Add event listener for delete confirmation input
            const confirmInput = document.getElementById('delete-confirmation-input');
            if (confirmInput) {
                confirmInput.addEventListener('input', function () {
                    const confirmBtn = document.getElementById('confirm-delete-all-btn');
                    if (this.value === 'DELETE') {
                        confirmBtn.removeAttribute('disabled');
                    } else {
                        confirmBtn.setAttribute('disabled', 'disabled');
                    }
                });
            }

            // Add event listener for confirm delete all button
            const confirmDeleteAllBtn = document.getElementById('confirm-delete-all-btn');
            if (confirmDeleteAllBtn) {
                confirmDeleteAllBtn.addEventListener('click', function () {
                    const confirmInput = document.getElementById('delete-confirmation-input');
                    if (confirmInput && confirmInput.value === 'DELETE') {
                        deleteAllDatabase();
                    }
                });
            }

            // Add event listener for confirm delete section button
            const confirmDeleteSectionBtn = document.getElementById('confirm-delete-section-btn');
            if (confirmDeleteSectionBtn) {
                confirmDeleteSectionBtn.addEventListener('click', function () {
                    const sectionPath = this.getAttribute('data-path');
                    if (sectionPath) {
                        deleteSection(sectionPath);
                    }
                });
            }

            // Close popup buttons
            document.querySelectorAll('.close-popup-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const popup = this.closest('.popup-container');
                    if (popup) {
                        popup.classList.add('hidden');
                    } else {
                        // Fallback for buttons that might not be inside a direct parent popup container
                        const deleteDbSectionPopup = document.getElementById('delete-db-section-popup');
                        const deleteAllDbPopup = document.getElementById('delete-all-db-popup');

                        if (deleteDbSectionPopup) deleteDbSectionPopup.classList.add('hidden');
                        if (deleteAllDbPopup) deleteAllDbPopup.classList.add('hidden');
                    }
                });
            });

            // Add event listener for cancel delete button specifically
            const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
            if (cancelDeleteBtn) {
                cancelDeleteBtn.addEventListener('click', function () {
                    const popup = document.getElementById('delete-all-db-popup');
                    if (popup) popup.classList.add('hidden');
                });
            }
        }, 100); // Small delay to ensure DOM is ready
    }

    // Function to load database sections
    function loadDatabaseSections() {
        const sectionsContainer = document.getElementById('db-sections-list');
        if (!sectionsContainer) return;

        sectionsContainer.innerHTML = '<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading database sections...</div>';

        firebase.database().ref().once('value')
            .then(snapshot => {
                sectionsContainer.innerHTML = '';
                const data = snapshot.val();

                if (!data) {
                    sectionsContainer.innerHTML = '<div class="no-sections-message">No database sections found.</div>';
                    return;
                }

                Object.keys(data).forEach(key => {
                    if (typeof data[key] === 'object') {
                        const itemCount = countItems(data[key]);
                        const sectionCard = createSectionCard(key, itemCount);
                        sectionsContainer.appendChild(sectionCard);
                    }
                });
            })
            .catch(error => {
                sectionsContainer.innerHTML = `<div class="status-indicator error"><p>Error loading database sections: ${error.message}</p></div>`;
            });
    }

    // Function to count items in a section
    function countItems(obj) {
        if (!obj) return 0;
        return Object.keys(obj).length;
    }

    // Function to create a section card
    function createSectionCard(sectionName, itemCount) {
        const card = document.createElement('div');
        card.className = 'db-section-card';

        // Choose icon based on section name
        let iconClass = 'fa-database';
        if (sectionName.toLowerCase().includes('user')) iconClass = 'fa-users';
        else if (sectionName.toLowerCase().includes('attend')) iconClass = 'fa-calendar-check';
        else if (sectionName.toLowerCase().includes('locat')) iconClass = 'fa-map-marker-alt';
        else if (sectionName.toLowerCase().includes('modif')) iconClass = 'fa-edit';
        else if (sectionName.toLowerCase().includes('device')) iconClass = 'fa-mobile-alt';
        else if (sectionName.toLowerCase().includes('admin')) iconClass = 'fa-user-shield';

        card.innerHTML = `
            <div class="db-section-header">
                <div class="db-title-wrapper">
                    <div class="db-icon-box">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div>
                        <h4 class="db-section-title">${sectionName}</h4>
                        <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 2px;">Firebase Root Collection</div>
                    </div>
                </div>
            </div>
            <div class="db-section-content">
                <div class="db-stats-grid">
                    <div class="db-stat-row">
                        <span class="db-stat-label">Total Records</span>
                        <span class="db-stat-value">${itemCount}</span>
                    </div>
                </div>
            </div>
            <div class="db-section-actions">
                <button class="delete-section-btn" data-section="${sectionName}" data-count="${itemCount}">
                    <i class="fas fa-trash-alt"></i> Delete Section
                </button>
            </div>
        `;

        // Add event listener for delete button
        const deleteBtn = card.querySelector('.delete-section-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                const section = this.getAttribute('data-section');
                const count = this.getAttribute('data-count');
                showDeleteConfirmation(section, count);
            });
        }

        return card;
    }

    // Function to show delete confirmation
    function showDeleteConfirmation(section, count) {
        const popup = document.getElementById('delete-db-section-popup');
        if (!popup) return;

        const sectionNameEl = document.getElementById('delete-section-name');
        const sectionCountEl = document.getElementById('delete-section-count');
        const confirmBtn = document.getElementById('confirm-delete-section-btn');

        if (sectionNameEl) sectionNameEl.textContent = section;
        if (sectionCountEl) sectionCountEl.textContent = count;
        if (confirmBtn) confirmBtn.setAttribute('data-path', section);

        popup.classList.remove('hidden');
    }

    // Function to show delete all confirmation
    function showDeleteAllConfirmation() {
        const popup = document.getElementById('delete-all-db-popup');
        if (!popup) return;

        const confirmInput = document.getElementById('delete-confirmation-input');
        const confirmBtn = document.getElementById('confirm-delete-all-btn');

        if (confirmInput) confirmInput.value = '';
        if (confirmBtn) confirmBtn.setAttribute('disabled', 'disabled');

        popup.classList.remove('hidden');
    }

    // Function to delete a section
    function deleteSection(path) {
        firebase.database().ref(path).remove()
            .then(() => {
                const popup = document.getElementById('delete-db-section-popup');
                if (popup) popup.classList.add('hidden');

                loadDatabaseSections();
                showAlert(`Section "${path}" has been deleted successfully`, 'success');
            })
            .catch(error => {
                showAlert(`Error deleting section: ${error.message}`, 'error');
            });
    }

    // Function to delete entire database
    function deleteAllDatabase() {
        firebase.database().ref().remove()
            .then(() => {
                const popup = document.getElementById('delete-all-db-popup');
                const confirmInput = document.getElementById('delete-confirmation-input');

                if (popup) popup.classList.add('hidden');
                if (confirmInput) confirmInput.value = '';

                loadDatabaseSections();
                showAlert('Entire database has been deleted successfully', 'success');
            })
            .catch(error => {
                showAlert(`Error deleting database: ${error.message}`, 'error');
            });
    }

    // Helper function to show alerts
    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = message;
        document.body.appendChild(alertDiv);

        setTimeout(() => {
            alertDiv.classList.add('show');
        }, 10);

        setTimeout(() => {
            alertDiv.classList.remove('show');
            setTimeout(() => {
                alertDiv.remove();
            }, 300);
        }, 3000);
    }
}

// Function to initialize the recent logins section
function initRecentLoginsSection() {
    console.log("Initializing recent logins section");

    // Reference to the active devices list container
    const activeDevicesList = document.getElementById('active-devices-list');
    const refreshBtn = document.getElementById('refresh-recent-logins-btn');
    if (refreshBtn) {
        refreshBtn.onclick = () => initRecentLoginsSection();
    }

    // Clear existing content
    if (activeDevicesList) {
        activeDevicesList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading active devices...</div>';

        // Get current user
        const user = firebase.auth().currentUser;

        if (user) {
            console.log("Current user found:", user.uid);
            // Reference to all user sessions in the database
            const allSessionsRef = firebase.database().ref('userSessions');

            // Fetch all sessions
            allSessionsRef.once('value')
                .then((snapshot) => {
                    // Clear loading spinner
                    activeDevicesList.innerHTML = '';

                    if (snapshot.exists()) {
                        console.log("Sessions data found");
                        const allSessions = snapshot.val();
                        let sessionsFound = false;

                        // Get current device ID for highlighting
                        const currentDeviceId = localStorage.getItem('deviceId') || 'unknown';
                        console.log("Current device ID:", currentDeviceId);

                        activeDevicesList.innerHTML = `
                            <div class="recent-logins-wrapper">
                                <div class="recent-logins-stats">
                                    <div class="recent-logins-stat">
                                        <span class="stat-label">Active Devices</span>
                                        <span class="stat-value" id="recent-active-count">0</span>
                                    </div>
                                    <div class="recent-logins-stat">
                                        <span class="stat-label">This Device</span>
                                        <span class="stat-value" id="recent-current-device">—</span>
                                    </div>
                                    <div class="recent-logins-stat">
                                        <span class="stat-label">Last Active</span>
                                        <span class="stat-value" id="recent-current-active">—</span>
                                    </div>
                                </div>
                                <div class="recent-logins-grid">
                                    <div class="recent-logins-panel">
                                        <h3>Current Device</h3>
                                        <div id="current-device-card" class="device-card-list"></div>
                                    </div>
                                    <div class="recent-logins-panel">
                                        <h3>Other Devices</h3>
                                        <div id="other-devices-list" class="device-card-list"></div>
                                    </div>
                                </div>
                            </div>
                        `;

                        // Find current user's sessions
                        const userSessions = allSessions[user.uid] || {};

                        const currentCardContainer = document.getElementById('current-device-card');
                        const otherDevicesContainer = document.getElementById('other-devices-list');
                        const activeCountEl = document.getElementById('recent-active-count');
                        const currentDeviceNameEl = document.getElementById('recent-current-device');
                        const currentDeviceActiveEl = document.getElementById('recent-current-active');

                        const formatKeyLabel = (key) => {
                            return key
                                .replace(/_/g, ' ')
                                .replace(/([A-Z])/g, ' $1')
                                .replace(/\s+/g, ' ')
                                .trim()
                                .replace(/\b\w/g, (char) => char.toUpperCase());
                        };

                        const formatValue = (key, value) => {
                            if (value === null || value === undefined || value === '') return 'N/A';
                            if (key === 'lastActive' || key === 'loginTime' || key.includes('Time') || key.includes('Date')) {
                                if (!isNaN(value)) {
                                    const date = new Date(value);
                                    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                                }
                            }
                            if (typeof value === 'object') {
                                const json = JSON.stringify(value);
                                return json.length > 80 ? `${json.slice(0, 77)}...` : json;
                            }
                            const str = String(value);
                            return str.length > 80 ? `${str.slice(0, 77)}...` : str;
                        };

                        const getDeviceIcon = (deviceType) => {
                            if (deviceType === 'mobile') return 'fas fa-mobile-alt';
                            if (deviceType === 'tablet') return 'fas fa-tablet-alt';
                            return 'fas fa-desktop';
                        };

                        const renderDeviceCard = (session, options = {}) => {
                            if (!session) return '';
                            const deviceIcon = getDeviceIcon(session.deviceType);
                            const deviceName = session.deviceName || options.fallbackName || 'Unknown Device';
                            const chips = [];
                            if (session.deviceType) chips.push(session.deviceType);
                            if (session.ipAddress) chips.push(session.ipAddress);
                            if (session.browser) chips.push(session.browser);
                            const chipHtml = chips.map(chip => `<span class="device-card__chip">${chip}</span>`).join('');

                            const detailsHtml = Object.entries(session).map(([key, value]) => {
                                const formattedValue = formatValue(key, value);
                                return `
                                    <div class="device-info-item">
                                        <span class="label">${formatKeyLabel(key)}</span>
                                        <span class="value">${formattedValue}</span>
                                    </div>
                                `;
                            }).join('');

                            return `
                                <div class="device-card ${options.isCurrent ? 'is-current' : ''}">
                                    <div class="device-card__header">
                                        <div class="device-card__identity">
                                            <div class="device-card__icon"><i class="${deviceIcon}"></i></div>
                                            <div>
                                                <div class="device-card__title">${deviceName}</div>
                                                <div class="device-card__subtitle">${session.email || ''}</div>
                                            </div>
                                        </div>
                                        ${options.isCurrent ? '<span class="device-card__badge">Current</span>' : ''}
                                    </div>
                                    ${chipHtml ? `<div class="device-card__chips">${chipHtml}</div>` : ''}
                                    <div class="device-card__grid">${detailsHtml}</div>
                                    ${options.showLogout ? `
                                        <div class="device-card__actions">
                                            <button class="logout-device-btn" data-user-id="${options.userId}" data-device-id="${options.deviceId}">
                                                <i class="fas fa-sign-out-alt"></i> Log Out
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        };

                        // Add current device info if available
                        const currentSession = userSessions[currentDeviceId] || null;
                        if (currentSession) {
                            sessionsFound = true;
                            if (currentCardContainer) {
                                currentCardContainer.innerHTML = renderDeviceCard(currentSession, {
                                    isCurrent: true,
                                    fallbackName: 'This Device',
                                    showLogout: false
                                });
                            }
                            if (currentDeviceNameEl) {
                                currentDeviceNameEl.textContent = currentSession.deviceName || 'This Device';
                            }
                            if (currentDeviceActiveEl) {
                                currentDeviceActiveEl.textContent = currentSession.lastActive
                                    ? formatValue('lastActive', currentSession.lastActive)
                                    : 'Unknown';
                            }
                        } else if (currentCardContainer) {
                            currentCardContainer.innerHTML = '<div class="device-empty">Current device information not available.</div>';
                        }

                        let otherDevicesFound = false;
                        const otherDevicesHtml = [];

                        // Loop through all user sessions to find devices with same login ID
                        Object.keys(allSessions).forEach(userId => {
                            const sessions = allSessions[userId];

                            Object.keys(sessions).forEach(deviceId => {
                                const session = sessions[deviceId];

                                // Skip if this is the current device
                                if (userId === user.uid && deviceId === currentDeviceId) {
                                    return;
                                }

                                // Check if session is still valid (not expired)
                                const isValid = session.lastActive && (Date.now() - session.lastActive < 30 * 24 * 60 * 60 * 1000);

                                // Check if this session has the same email as current user
                                const isSameUser = session.email === user.email;

                                if (isValid && isSameUser) {
                                    otherDevicesFound = true;
                                    sessionsFound = true;
                                    otherDevicesHtml.push(renderDeviceCard(session, {
                                        isCurrent: false,
                                        showLogout: true,
                                        userId,
                                        deviceId
                                    }));
                                }
                            });
                        });

                        // If no other devices found
                        if (otherDevicesContainer) {
                            if (!otherDevicesFound) {
                                otherDevicesContainer.innerHTML = '<div class="device-empty">No other active devices found.</div>';
                            } else {
                                otherDevicesContainer.innerHTML = otherDevicesHtml.join('');
                            }
                        }

                        if (activeCountEl) {
                            const activeCount = (currentSession ? 1 : 0) + (otherDevicesFound ? otherDevicesHtml.length : 0);
                            activeCountEl.textContent = String(activeCount);
                        }

                        // If no valid sessions found at all
                        if (!sessionsFound) {
                            console.log("No active devices found at all");
                            activeDevicesList.innerHTML = '<p class="no-data">No active devices found.</p>';
                        }

                        // Add event listeners to logout buttons
                        document.querySelectorAll('.logout-device-btn').forEach(button => {
                            button.addEventListener('click', function () {
                                const userId = this.getAttribute('data-user-id');
                                const deviceId = this.getAttribute('data-device-id');
                                if (confirm('Are you sure you want to log out this device?')) {
                                    firebase.database().ref(`userSessions/${userId}/${deviceId}`).remove()
                                        .then(() => {
                                            showAlert('Device logged out successfully', 'success');
                                            initRecentLoginsSection(); // Refresh the list
                                        })
                                        .catch(error => {
                                            console.error('Error logging out device:', error);
                                            showAlert('Error logging out device', 'error');
                                        });
                                }
                            });
                        });
                    } else {
                        console.log("No sessions data found in snapshot");
                        activeDevicesList.innerHTML = '<p class="no-data">No active devices found.</p>';
                    }
                })
                .catch((error) => {
                    console.error('Error fetching active devices:', error);
                    activeDevicesList.innerHTML = '<p class="error-message">Error loading active devices. Please try again.</p>';
                });
        } else {
            console.log("No user is currently logged in");
            activeDevicesList.innerHTML = '<p class="error-message">You must be logged in to view active devices.</p>';
        }
    } else {
        console.error("Could not find active-devices-list element");
    }
}

// Alias function to fix the reference error
function initRecentLogins() {
    initRecentLoginsSection();
}
// Function to initialize the Manage Administrators section
function initManageAdminsSection() {
    const adminUsersList = document.getElementById('admin-users-list');

    if (!adminUsersList) {
        console.error("Could not find admin-users-list element");
        return;
    }

    // Show loading state
    adminUsersList.innerHTML = '<p class="loading">Loading administrators...</p>';

    // Get all users with admin role
    const usersRef = firebase.database().ref('users');

    usersRef.get()
        .then((snapshot) => {
            if (snapshot.exists()) {
                const users = snapshot.val();
                let adminUsers = [];

                // Filter for admin users
                for (const userId in users) {
                    const user = users[userId];
                    if (user.role === 'admin') {
                        adminUsers.push({
                            id: userId,
                            ...user
                        });
                    }
                }

                if (adminUsers.length > 0) {
                    // Sort admins by name
                    adminUsers.sort((a, b) => a.name.localeCompare(b.name));

                    // Clear loading message
                    adminUsersList.innerHTML = '';

                    // Get current user ID from Firebase Auth
                    const currentUserId = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;

                    // Create admin user cards
                    adminUsers.forEach(admin => {
                        const adminCard = document.createElement('div');
                        adminCard.className = 'admin-card';
                        adminCard.style.display = 'flex';
                        adminCard.style.justifyContent = 'space-between';
                        adminCard.style.alignItems = 'center';
                        adminCard.style.marginBottom = '20px'; // Add margin between admin cards
                        adminCard.style.padding = '15px';      // Add padding inside cards
                        adminCard.style.borderBottom = '1px solid #eee'; // Add separator line

                        // Format last login date if available
                        let lastLoginText = 'Never logged in';

                        // If this is the current user and showing "Never logged in", show "Currently logged in" instead
                        if (admin.id === currentUserId) {
                            lastLoginText = 'Currently logged in';
                        } else if (admin.lastLogin) {
                            const lastLogin = new Date(admin.lastLogin);
                            lastLoginText = `Last login: ${lastLogin.toLocaleDateString()} at ${lastLogin.toLocaleTimeString()}`;
                        }

                        adminCard.innerHTML = `
                                <div class="admin-info" style="display: flex; align-items: center;">
                                    <div class="admin-avatar" style="margin-right: 15px;">
                                        <i class="fas fa-user-shield"></i>
                                    </div>
                                    <div class="admin-details">
                                        <h4>${admin.name}</h4>
                                        <p>${admin.email}</p>
                                        <p class="last-login"><i class="fas fa-clock"></i> ${lastLoginText}</p>
                                    </div>
                                </div>
                                <div class="admin-actions" style="display: flex; gap: 10px;">
                                    <button class="action-btn view-admin-btn" data-admin-id="${admin.id}">
                                        <i class="fas fa-eye"></i> View
                                    </button>
                                    ${admin.id !== currentUserId ?
                                `<button class="action-btn reset-password-btn" data-admin-id="${admin.id}">
                                            <i class="fas fa-key"></i> Reset Password
                                        </button>
                                        <button class="action-btn delete-btn remove-admin-btn" data-admin-id="${admin.id}">
                                            <i class="fas fa-user-minus"></i> Remove Admin
                                        </button>` :
                                '<span class="current-user-badge">Current User</span>'}
                                </div>
                            `;

                        adminUsersList.appendChild(adminCard);
                    });

                    // Add event listeners to admin action buttons
                    document.querySelectorAll('.view-admin-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');
                            // Show admin details in a popup
                            const admin = adminUsers.find(a => a.id === adminId);

                            // Create popup container
                            const popupContainer = document.createElement('div');
                            popupContainer.className = 'popup-container';

                            // Adjust last login text for popup
                            let popupLastLoginText = admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never logged in';
                            if (admin.id === currentUserId && !admin.lastLogin) {
                                popupLastLoginText = 'Currently logged in';
                            }

                            // Create popup content
                            popupContainer.innerHTML = `
                                    <div class="popup">
                                        <div class="popup-header">
                                            <h3>Admin Details</h3>
                                            <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                        </div>
                                        <div class="popup-body" style="padding: 20px;">
                                            <div style="margin-bottom: 15px;">
                                                <strong>Name:</strong> ${admin.name}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Email:</strong> ${admin.email}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Admin ID:</strong> ${admin.id}
                                            </div>
                                            <div style="margin-bottom: 15px;">
                                                <strong>Last Login:</strong> ${popupLastLoginText}
                                            </div>
                                        </div>
                                    </div>
                                `;

                            // Add popup to body
                            document.body.appendChild(popupContainer);

                            // Add close button functionality
                            popupContainer.querySelector('.close-popup-btn').addEventListener('click', function () {
                                document.body.removeChild(popupContainer);
                            });

                            // Close popup when clicking outside
                            popupContainer.addEventListener('click', function (e) {
                                if (e.target === popupContainer) {
                                    document.body.removeChild(popupContainer);
                                }
                            });
                        });
                    });

                    document.querySelectorAll('.reset-password-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');
                            const admin = adminUsers.find(a => a.id === adminId);
                            if (admin && confirm(`Are you sure you want to send a password reset email to ${admin.email}?`)) {
                                // Send password reset email using Firebase Auth
                                firebase.auth().sendPasswordResetEmail(admin.email)
                                    .then(() => {
                                        showAlert(`Password reset email sent to ${admin.email}`, 'success');
                                    })
                                    .catch((error) => {
                                        console.error('Error sending password reset email:', error);
                                        showAlert(`Error: ${error.message}`, 'error');
                                    });
                            }
                        });
                    });

                    document.querySelectorAll('.remove-admin-btn').forEach(button => {
                        button.addEventListener('click', function () {
                            const adminId = this.getAttribute('data-admin-id');

                            // Check if this is the last admin
                            if (adminUsers.length <= 1) {
                                // Create custom popup for last admin warning
                                const popupContainer = document.createElement('div');
                                popupContainer.className = 'popup-container';

                                popupContainer.innerHTML = `
                                        <div class="popup">
                                            <div class="popup-header">
                                                <h3>Cannot Remove Last Admin</h3>
                                                <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                            </div>
                                            <div class="popup-body" style="padding: 20px;">
                                                <div style="margin-bottom: 15px; text-align: center;">
                                                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f39c12; margin-bottom: 15px;"></i>
                                                    <p>You cannot remove the last administrator account.</p>
                                                    <p>Please add another admin before removing this one.</p>
                                                </div>
                                                <div style="text-align: center; margin-top: 20px;">
                                                    <button class="action-btn close-warning-btn">OK</button>
                                                </div>
                                            </div>
                                        </div>
                                    `;

                                // Add popup to body
                                document.body.appendChild(popupContainer);

                                // Add close button functionality
                                const closeButtons = popupContainer.querySelectorAll('.close-popup-btn, .close-warning-btn');
                                closeButtons.forEach(btn => {
                                    btn.addEventListener('click', function () {
                                        document.body.removeChild(popupContainer);
                                    });
                                });

                                // Close popup when clicking outside
                                popupContainer.addEventListener('click', function (e) {
                                    if (e.target === popupContainer) {
                                        document.body.removeChild(popupContainer);
                                    }
                                });
                            } else {
                                // Create custom confirmation popup
                                const popupContainer = document.createElement('div');
                                popupContainer.className = 'popup-container';

                                // Find the admin to be removed
                                const adminToRemove = adminUsers.find(a => a.id === adminId);

                                popupContainer.innerHTML = `
                                        <div class="popup">
                                            <div class="popup-header">
                                                <h3>Confirm Admin Removal</h3>
                                                <button class="close-popup-btn"><i class="fas fa-times"></i></button>
                                            </div>
                                            <div class="popup-body" style="padding: 20px;">
                                                <div style="margin-bottom: 15px; text-align: center;">
                                                    <i class="fas fa-user-minus" style="font-size: 48px; color: #e74c3c; margin-bottom: 15px;"></i>
                                                    <p>Are you sure you want to remove admin privileges from:</p>
                                                    <p><strong>${adminToRemove.name}</strong> (${adminToRemove.email})?</p>
                                                    <p>This user will be converted to a student account.</p>
                                                </div>
                                                <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                                                    <button class="action-btn cancel-remove-btn">Cancel</button>
                                                    <button class="action-btn delete-btn confirm-remove-btn">Remove Admin</button>
                                                </div>
                                            </div>
                                        </div>
                                    `;

                                // Add popup to body
                                document.body.appendChild(popupContainer);

                                // Add close button functionality
                                popupContainer.querySelector('.close-popup-btn').addEventListener('click', function () {
                                    document.body.removeChild(popupContainer);
                                });

                                // Add cancel button functionality
                                popupContainer.querySelector('.cancel-remove-btn').addEventListener('click', function () {
                                    document.body.removeChild(popupContainer);
                                });

                                // Add confirm button functionality
                                popupContainer.querySelector('.confirm-remove-btn').addEventListener('click', function () {
                                    // Update user role to 'student'
                                    firebase.database().ref(`users/${adminId}`).update({
                                        role: 'student'
                                    })
                                        .then(() => {
                                            document.body.removeChild(popupContainer);
                                            showAlert('Admin privileges removed successfully', 'success');
                                            initManageAdminsSection(); // Refresh the list
                                        })
                                        .catch(error => {
                                            console.error('Error removing admin privileges:', error);
                                            showAlert('Error removing admin privileges', 'error');
                                            document.body.removeChild(popupContainer);
                                        });
                                });

                                // Close popup when clicking outside
                                popupContainer.addEventListener('click', function (e) {
                                    if (e.target === popupContainer) {
                                        document.body.removeChild(popupContainer);
                                    }
                                });
                            }
                        });
                    });
                } else {
                    adminUsersList.innerHTML = '<p class="no-data">No administrators found.</p>';
                }
            } else {
                adminUsersList.innerHTML = '<p class="no-data">No users found in the system.</p>';
            }
        })
        .catch((error) => {
            console.error('Error fetching admin users:', error);
            adminUsersList.innerHTML = '<p class="error-message">Error loading administrators. Please try again.</p>';
        });

    // Set up refresh button event listener - remove previous listener first to avoid duplicates
    const refreshAdminsBtn = document.getElementById('refresh-admins-btn');
    if (refreshAdminsBtn) {
        // Remove existing event listeners by cloning and replacing the button
        const newRefreshBtn = refreshAdminsBtn.cloneNode(true);
        refreshAdminsBtn.parentNode.replaceChild(newRefreshBtn, refreshAdminsBtn);

        // Add new event listener
        newRefreshBtn.addEventListener('click', function () {
            showAlert('Refreshing administrators list...', 'info');
            initManageAdminsSection();
        });
    }
}

// Alias function to maintain naming consistency
function initManageAdmins() {
    initManageAdminsSection();
}


// Redesigned Notification Section with Styling and Rich Text
function initNotificationsSection() {
    const notificationsList = document.getElementById('notifications-list');
    if (!notificationsList) return;

    markNotificationsSeen();

    addNotificationStyles();

    const db = firebase.database();
    const notificationsRef = db.ref('notifications');

    // Show loading
    notificationsList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading notifications...</div>';

    // Load notifications
    notificationsRef.orderByChild('timestamp').limitToLast(50).once('value')
        .then(snapshot => {
            const notifications = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    notifications.push({ id: child.key, ...child.val() });
                });
            }

            notifications.sort((a, b) => b.timestamp - a.timestamp);
            displayNotifications(notifications);
        })
        .catch(error => {
            notificationsList.innerHTML = '<div class="error"><i class="fas fa-exclamation-triangle"></i> Error loading notifications</div>';
        });

    // Display notifications
    function displayNotifications(notifications) {
        if (notifications.length === 0) {
            notificationsList.innerHTML = '<div class="no-data"><i class="fas fa-inbox"></i> No notifications found</div>';
            return;
        }

        const getTypeIcon = (type) => {
            switch (type) {
                case 'success': return 'fa-check-circle';
                case 'warning': return 'fa-exclamation-triangle';
                case 'error': return 'fa-exclamation-circle';
                default: return 'fa-info-circle';
            }
        };

        notificationsList.innerHTML = notifications.map(notif => `
            <div class="notification-item ${notif.type || 'info'}" onclick="viewNotification('${notif.id}')">
                <div class="notification-icon">
                    <i class="fas ${getTypeIcon(notif.type)}"></i>
                </div>
                <div class="notification-content">
                    <h4>${notif.header || 'Notification'}</h4>
                    <p>${(notif.body || '').replace(/<[^>]*>/g, '').substring(0, 100)}...</p>
                    <small><i class="fas fa-clock"></i> ${new Date(notif.timestamp).toLocaleString()}</small>
                </div>
                <button onclick="deleteNotification('${notif.id}', event)" class="delete-btn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    // Setup buttons
    setupNotificationButtons();
}

// View notification details
function viewNotification(id) {
    hideSidebar();

    firebase.database().ref(`notifications/${id}`).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) return;
            const notif = snapshot.val();

            const getTypeIcon = (type) => {
                switch (type) {
                    case 'success': return 'fa-check-circle';
                    case 'warning': return 'fa-exclamation-triangle';
                    case 'error': return 'fa-exclamation-circle';
                    default: return 'fa-info-circle';
                }
            };

            const popup = document.createElement('div');
            popup.className = 'popup-overlay';
            popup.innerHTML = `
                <div class="popup-content notification-view">
                    <div class="popup-header ${notif.type || 'info'}">
                        <h3><i class="fas ${getTypeIcon(notif.type)}"></i> ${notif.header || 'Notification'}</h3>
                        <button onclick="closePopup(this)" class="close-btn">&times;</button>
                    </div>
                    <div class="popup-body">
                        <div class="notification-message">${notif.body || 'No content'}</div>
                        ${notif.recipientType === 'specific' && notif.recipients ? `
                            <div class="recipients-info">
                                <h4><i class="fas fa-users"></i> Recipients (${notif.recipients.length}):</h4>
                                <div class="recipients-list">${notif.recipients.map(r => r.name || r.email).join(', ')}</div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="popup-footer">
                        <div class="notification-meta">
                            <small><i class="fas fa-clock"></i> ${new Date(notif.timestamp).toLocaleString()}</small>
                            ${notif.sentByEmail ? `<small><i class="fas fa-user"></i> ${notif.sentByEmail}</small>` : ''}
                        </div>
                        <button onclick="closePopup(this)" class="btn-close"><i class="fas fa-times"></i> Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);
            popup.addEventListener('click', e => {
                if (e.target === popup) closePopup(popup);
            });
        });
}

// Delete notification
function deleteNotification(id, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this notification?')) {
        firebase.database().ref(`notifications/${id}`).remove()
            .then(() => {
                initNotificationsSection();
                showAlert('Notification deleted successfully', 'success');
            })
            .catch(() => showAlert('Error deleting notification', 'error'));
    }
}

// Create new notification with rich text editor
function createNotification() {
    // Remove any existing popup first
    const existingPopup = document.querySelector('.popup-overlay');
    if (existingPopup) existingPopup.remove();

    hideSidebar();
    window.selectedStudentsList = [];

    const popup = document.createElement('div');
    popup.className = 'popup-overlay';
    popup.innerHTML = `
        <div class="popup-content notification-popup">
            <div class="popup-header">
                <h3><i class="fas fa-plus-circle"></i> Create Notification</h3>
                <button onclick="closePopup(this)" class="close-btn">&times;</button>
            </div>
            <div class="popup-body">
                <div class="form-group">
                    <label><i class="fas fa-heading"></i> Header:</label>
                    <input type="text" id="notif-header" placeholder="Enter notification header">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-edit"></i> Message:</label>
                    <div class="editor-toolbar">
                        <button type="button" onclick="formatText('bold')" title="Bold"><i class="fas fa-bold"></i></button>
                        <button type="button" onclick="formatText('italic')" title="Italic"><i class="fas fa-italic"></i></button>
                        <button type="button" onclick="formatText('underline')" title="Underline"><i class="fas fa-underline"></i></button>
                        <button type="button" onclick="formatText('insertUnorderedList')" title="Bullet List"><i class="fas fa-list-ul"></i></button>
                        <button type="button" onclick="formatText('insertOrderedList')" title="Numbered List"><i class="fas fa-list-ol"></i></button>
                        <button type="button" onclick="insertLink()" title="Insert Link"><i class="fas fa-link"></i></button>
                    </div>
                    <div id="notif-body" contenteditable="true" class="rich-editor" placeholder="Enter your message here..."></div>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-users"></i> Recipients:</label>
                    <select id="recipient-type" onchange="toggleStudentSelection()">
                        <option value="all">All Students</option>
                        <option value="specific">Specific Students</option>
                    </select>
                    <div id="student-selection" style="display: none; margin-top: 10px;">
                        <div id="students-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">Loading students...</div>
                        <div id="selected-students-display" style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; min-height: 40px;">
                            <small style="color: #666;">Selected: <span id="selected-count">0</span> students</small>
                            <div id="selected-tags" style="margin-top: 5px;"></div>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Type:</label>
                    <select id="notif-type">
                        <option value="info">📢 Information</option>
                        <option value="success">✅ Success</option>
                        <option value="warning">⚠️ Warning</option>
                        <option value="error">❌ Error</option>
                    </select>
                </div>
            </div>
            <div class="popup-actions">
                <button onclick="closePopup(this)" class="btn-cancel"><i class="fas fa-times"></i> Cancel</button>
                <button onclick="sendNotification()" class="btn-send"><i class="fas fa-paper-plane"></i> Send</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);
    popup.addEventListener('click', e => {
        if (e.target === popup) closePopup(popup);
    });

    // Focus on header input
    setTimeout(() => document.getElementById('notif-header').focus(), 100);
}

// Send notification
function sendNotification() {
    const header = document.getElementById('notif-header')?.value.trim();
    const bodyElement = document.getElementById('notif-body');
    const body = bodyElement?.innerHTML.trim();
    const type = document.getElementById('notif-type')?.value;
    const recipientType = document.getElementById('recipient-type')?.value;

    if (!header) {
        showAlert('Please enter a header', 'warning');
        document.getElementById('notif-header')?.focus();
        return;
    }

    if (!body || bodyElement?.textContent.trim() === '') {
        showAlert('Please enter a message', 'warning');
        bodyElement?.focus();
        return;
    }

    const sendBtn = document.querySelector('.popup-overlay .btn-send');
    if (!sendBtn) return;

    const originalContent = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    const currentUser = firebase.auth().currentUser;
    const notification = {
        header,
        body,
        type,
        timestamp: Date.now(),
        sentBy: currentUser ? currentUser.uid : 'admin',
        sentByEmail: currentUser ? currentUser.email : 'admin@system.com',
        recipientType
    };

    // Add selected students if specific recipients
    if (recipientType === 'specific' && window.selectedStudentsList) {
        notification.recipients = window.selectedStudentsList;
    }

    firebase.database().ref('notifications').push(notification)
        .then(() => {
            const popup = document.querySelector('.popup-overlay');
            if (popup) popup.remove();
            window.selectedStudentsList = [];
            initNotificationsSection();
            showAlert('Notification sent successfully', 'success');
            showSidebar();
        })
        .catch(error => {
            console.error('Send error:', error);
            showAlert('Error sending notification', 'error');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalContent;
            }
        });
}

// Setup notification buttons
function setupNotificationButtons() {
    const refreshBtn = document.getElementById('refresh-notifications-btn');
    const newBtn = document.getElementById('new-notification-btn');
    const clearBtn = document.getElementById('clear-all-notifications-btn');

    if (refreshBtn) {
        refreshBtn.onclick = () => initNotificationsSection();
    }

    if (newBtn) {
        newBtn.onclick = () => createNotification();
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm('Delete ALL notifications? This cannot be undone.')) {
                firebase.database().ref('notifications').remove()
                    .then(() => initNotificationsSection())
                    .catch(() => alert('Error clearing notifications'));
            }
        };
    }
}

// Text formatting functions
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('notif-body').focus();
}

function insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
        document.execCommand('createLink', false, url);
        document.getElementById('notif-body').focus();
    }
}

// Alert utility
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(alert);

    setTimeout(() => alert.classList.add('show'), 10);
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// Student selection functions
window.selectedStudentsList = [];

function toggleStudentSelection() {
    const recipientType = document.getElementById('recipient-type').value;
    const studentSelection = document.getElementById('student-selection');
    studentSelection.style.display = recipientType === 'specific' ? 'block' : 'none';

    if (recipientType === 'specific') {
        setTimeout(loadStudentsInline, 100);
    } else {
        window.selectedStudentsList = [];
    }
}

function loadStudentsInline() {
    const studentsContainer = document.getElementById('students-list');
    if (!studentsContainer) return;

    studentsContainer.innerHTML = 'Loading...';

    firebase.database().ref('users').orderByChild('role').equalTo('student').once('value')
        .then(snapshot => {
            let html = '';
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const user = child.val();
                    const id = child.key;
                    const selected = window.selectedStudentsList.some(s => s.id === id);
                    html += `<div style="padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick="toggleStudentInline('${id}','${user.name}','${user.email}')">
                        <input type="checkbox" id="student-${id}" ${selected ? 'checked' : ''}>
                        <label style="margin-left:8px;cursor:pointer">${user.name} (${user.email})</label>
                    </div>`;
                });
            }
            studentsContainer.innerHTML = html || 'No students found';
            updateSelectedDisplay();
        })
        .catch(() => {
            studentsContainer.innerHTML = 'Error loading students';
        });
}

function toggleStudentInline(id, name, email) {
    const checkbox = document.getElementById(`student-${id}`);
    if (!checkbox) return;

    checkbox.checked = !checkbox.checked;

    if (!window.selectedStudentsList) window.selectedStudentsList = [];

    if (checkbox.checked) {
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({
                id: id,
                name: name.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                email: email.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            });
        }
    } else {
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }

    updateSelectedDisplay();
}

function updateSelectedDisplay() {
    const countEl = document.getElementById('selected-count');
    const tagsEl = document.getElementById('selected-tags');

    if (!countEl || !tagsEl) return;

    countEl.textContent = window.selectedStudentsList.length;

    if (window.selectedStudentsList.length === 0) {
        tagsEl.innerHTML = '<span style="color: #999; font-style: italic;">No students selected</span>';
        return;
    }

    tagsEl.innerHTML = window.selectedStudentsList.map(student => `
        <span style="display: inline-block; background: #e9f5fe; border: 1px solid #c2e0ff; border-radius: 12px; padding: 2px 8px; margin: 2px; font-size: 12px;">
            ${student.name || student.email}
            <button onclick="removeStudent('${student.id}')" style="background: none; border: none; color: #666; margin-left: 4px; cursor: pointer;">&times;</button>
        </span>
    `).join('');
}

function removeStudent(id) {
    window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    const checkbox = document.getElementById(`student-${id}`);
    if (checkbox) checkbox.checked = false;
    updateSelectedDisplay();
}



function toggleStudent(id, name, email) {
    const checkbox = document.getElementById(`student-${id}`);
    if (!checkbox) return;

    checkbox.checked = !checkbox.checked;

    // Update the selected students list
    if (checkbox.checked) {
        // Add to selection if not already present
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({
                id: id,
                name: name.replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                email: email.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            });
        }
    } else {
        // Remove from selection
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }
}

function confirmStudentSelection() {
    // The selectedStudentsList is already updated by toggleStudent function
    // Just need to update the display and close popup
    updateSelectedStudentsDisplay();
    closePopup(document.querySelector('.student-popup'));
    console.log(`Selected ${window.selectedStudentsList.length} students:`, window.selectedStudentsList);
}

function updateSelectedStudentsDisplay() {
    const container = document.getElementById('selected-students');
    if (!container) return;

    if (window.selectedStudentsList.length === 0) {
        container.innerHTML = '<div class="no-selection">No students selected</div>';
    } else {
        container.innerHTML = window.selectedStudentsList.map(student => `
            <span class="student-tag">
                ${student.name}
                <button onclick="removeStudent('${student.id}')">&times;</button>
            </span>
        `).join('');
    }
}

function removeStudent(id) {
    window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    updateSelectedStudentsDisplay();
}

// Sidebar control functions
function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    if (sidebar && contentWrapper) {
        sidebar.classList.add('sidebar-collapsed');
        contentWrapper.classList.add('expanded');
        contentWrapper.style.width = '100%';
        contentWrapper.style.marginLeft = '0';
    }
}

function showSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    if (sidebar && contentWrapper) {
        sidebar.classList.remove('sidebar-collapsed');
        contentWrapper.classList.remove('expanded');
        if (window.innerWidth >= 992) {
            contentWrapper.style.width = 'calc(100% - 280px)';
            contentWrapper.style.marginLeft = '280px';
        }
    }
}

// Close popup utility
function closePopup(element) {
    const popup = element.closest('.popup-overlay') || element;
    if (popup && popup.parentNode) {
        popup.parentNode.removeChild(popup);
        showSidebar();
    }
}

// Add notification styles
function addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        .notification-item { display: flex; align-items: center; padding: 15px; margin-bottom: 10px; border-radius: 8px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.3s; }
        .notification-item:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
        .notification-item.info { border-left: 4px solid #17a2b8; }
        .notification-item.success { border-left: 4px solid #28a745; }
        .notification-item.warning { border-left: 4px solid #ffc107; }
        .notification-item.error { border-left: 4px solid #dc3545; }
        .notification-icon { margin-right: 15px; font-size: 20px; }
        .notification-icon .fa-info-circle { color: #17a2b8; }
        .notification-icon .fa-check-circle { color: #28a745; }
        .notification-icon .fa-exclamation-triangle { color: #ffc107; }
        .notification-icon .fa-exclamation-circle { color: #dc3545; }
        .notification-content { flex: 1; }
        .notification-content h4 { margin: 0 0 5px 0; color: #333; }
        .notification-content p { margin: 0 0 5px 0; color: #666; }
        .notification-content small { color: #999; }
        .delete-btn { background: none; border: none; color: #dc3545; padding: 8px; border-radius: 4px; cursor: pointer; }
        .delete-btn:hover { background: #f8d7da; }
        .popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .popup-content { background: #fff; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .popup-content::-webkit-scrollbar { width: 6px; }
        .popup-content::-webkit-scrollbar-track { background: transparent; }
        .popup-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .popup-content::-webkit-scrollbar-thumb:hover { background: #999; }
        .popup-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .popup-header.info { background: linear-gradient(135deg, #17a2b8, #138496); color: white; }
        .popup-header.success { background: linear-gradient(135deg, #28a745, #1e7e34); color: white; }
        .popup-header.warning { background: linear-gradient(135deg, #ffc107, #e0a800); color: #212529; }
        .popup-header.error { background: linear-gradient(135deg, #dc3545, #c82333); color: white; }
        .popup-header h3 { margin: 0; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: inherit; opacity: 0.7; }
        .close-btn:hover { opacity: 1; }
        .popup-body { padding: 20px; }
        .popup-footer { padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: #007bff; box-shadow: 0 0 0 2px rgba(0,123,255,0.25); }
        .editor-toolbar { display: flex; gap: 5px; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px 4px 0 0; }
        .editor-toolbar button { background: #fff; border: 1px solid #ddd; padding: 8px 10px; border-radius: 4px; cursor: pointer; color: #333; }
        .editor-toolbar button:hover { background: #e9ecef; color: #000; }
        .rich-editor { min-height: 120px; padding: 10px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; outline: none; }
        .rich-editor::-webkit-scrollbar { width: 6px; }
        .rich-editor::-webkit-scrollbar-track { background: transparent; }
        .rich-editor::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .rich-editor::-webkit-scrollbar-thumb:hover { background: #999; }
        .rich-editor:empty:before { content: attr(placeholder); color: #999; }
        .popup-actions { display: flex; gap: 10px; justify-content: flex-end; margin: 20px 0; }
        .btn-cancel, .btn-send, .btn-close { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn-cancel, .btn-close { background: #6c757d; color: white; }
        .btn-send { background: #28a745; color: white; }
        .btn-cancel:hover, .btn-close:hover { background: #5a6268; }
        .btn-send:hover { background: #218838; }
        .loading, .error, .no-data { text-align: center; padding: 40px; color: #666; }
        .error { color: #dc3545; }
        .alert { position: fixed; top: 20px; right: 20px; padding: 15px 20px; border-radius: 4px; color: white; z-index: 1001; transform: translateX(400px); transition: transform 0.3s; }
        .alert.show { transform: translateX(0); }
        .alert-success { background: #28a745; }
        .alert-warning { background: #ffc107; color: #212529; }
        .alert-error { background: #dc3545; }
        .notification-meta { display: flex; flex-direction: column; gap: 5px; }
        .notification-message { line-height: 1.6; }
        .recipients-info { margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
        .recipients-info h4 { margin: 0 0 8px 0; color: #495057; }
        .recipients-list { font-size: 14px; color: #6c757d; }
        .btn-select { background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
        .btn-select:hover { background: #0056b3; }
        .selected-list { margin-top: 10px; }
        .student-tag { display: inline-block; background: #e9ecef; padding: 4px 8px; margin: 2px; border-radius: 12px; font-size: 12px; }
        .student-tag button { background: none; border: none; margin-left: 5px; cursor: pointer; }
        .no-selection { color: #6c757d; font-style: italic; }
        .students-container { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; }
        .students-container::-webkit-scrollbar { width: 6px; }
        .students-container::-webkit-scrollbar-track { background: transparent; }
        .students-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .students-container::-webkit-scrollbar-thumb:hover { background: #999; }
        .student-item { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; }
        .student-item:hover { background: #f8f9fa; }
        .student-item input { margin-right: 10px; }
        .search-input { width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .no-students { padding: 20px; text-align: center; color: #6c757d; font-style: italic; }
        .error { padding: 20px; text-align: center; color: #dc3545; }
    `;
    document.head.appendChild(style);
}

// Alias function to maintain naming consistency
function initNotifications() {
    initNotificationsSection();
}


// Function to initialize the Profile Requests section
function initProfileRequestsSection() {
    const profileRequestsList = document.getElementById('profile-requests-list');

    if (!profileRequestsList) {
        console.error("Could not find profile-requests-list element");
        return;
    }

    markProfileRequestsSeen();

    // Show loading state
    profileRequestsList.innerHTML = '<div class="profile-requests-loading"><i class="fas fa-spinner fa-spin"></i> Loading profile requests...</div>';

    // Reference to profile requests in Firebase
    const profileRequestsRef = firebase.database().ref('profileRequests');

    // Also check profile_update_requests
    const profileUpdateRequestsRef = firebase.database().ref('profile_update_requests');

    // Get both types of requests
    Promise.all([
        profileRequestsRef.orderByChild('timestamp').once('value'),
        profileUpdateRequestsRef.orderByChild('timestamp').once('value')
    ])
        .then(([profileSnapshot, updateSnapshot]) => {
            const requests = [];
            const userPromises = [];
            const userDataMap = {};

            // Process profile requests
            if (profileSnapshot.exists() && profileSnapshot.val() !== null) {
                profileSnapshot.forEach((childSnapshot) => {
                    const data = childSnapshot.val();
                    const userId = data.userId;

                    if (userId) {
                        // Add promise to fetch user data
                        userPromises.push(
                            firebase.database().ref('users/' + userId).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    requests.push({
                        id: childSnapshot.key,
                        source: 'profileRequests',
                        userId: userId,
                        userName: data.userName || data.name || 'No Name Provided',
                        userEmail: data.userEmail || data.email || 'No Email Provided',
                        userPhoto: data.profilePhoto || null,
                        userPhotoKey: data.profilePhotoKey || null,
                        ...data
                    });
                });
            }

            // Process profile update requests
            if (updateSnapshot.exists() && updateSnapshot.val() !== null) {
                updateSnapshot.forEach((childSnapshot) => {
                    const data = childSnapshot.val();
                    const userId = data.userId;

                    if (userId) {
                        // Add promise to fetch user data
                        userPromises.push(
                            firebase.database().ref('users/' + userId).once('value')
                                .then(userSnapshot => {
                                    if (userSnapshot.exists()) {
                                        userDataMap[userId] = userSnapshot.val();
                                    }
                                })
                        );
                    }

                    requests.push({
                        id: childSnapshot.key,
                        source: 'profile_update_requests',
                        userId: userId,
                        userName: data.userName || data.name || 'No Name Provided',
                        userEmail: data.userEmail || data.email || 'No Email Provided',
                        userPhoto: data.profilePhoto || null,
                        userPhotoKey: data.profilePhotoKey || null,
                        requestType: 'Profile Update',
                        changes: data.requestedData || {},
                        currentData: data.currentData || {},
                        timestamp: data.timestamp || Date.now(),
                        status: data.status || 'pending',
                        ...data
                    });
                });
            }

            // Wait for all user data to be fetched
            Promise.all(userPromises)
                .then(() => {
                    // Update requests with user data from database
                    requests.forEach(request => {
                        if (request.userId && userDataMap[request.userId]) {
                            const userData = userDataMap[request.userId];
                            request.userName = userData.name || userData.displayName || request.userName;
                            request.userEmail = userData.email || request.userEmail;
                            request.userPhoto = userData.profilePhoto || request.userPhoto || null;
                            request.userPhotoKey = userData.profilePhotoKey || request.userPhotoKey || null;
                        }
                    });

                    // Sort by timestamp descending (newest first)
                    requests.sort((a, b) => b.timestamp - a.timestamp);

                    if (requests.length > 0) {
                        // Clear loading message
                        profileRequestsList.innerHTML = '';

                        // Create table with styling
                        const table = document.createElement('table');
                        table.className = 'profile-requests-table';

                        // Create table header
                        const tableHeader = document.createElement('thead');
                        tableHeader.innerHTML = `
                                <tr>
                                    <th>User</th>
                                    <th>Request</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            `;
                        table.appendChild(tableHeader);

                        // Create table body
                        const tableBody = document.createElement('tbody');

                        // Create request items
                        requests.forEach((request, index) => {
                            const requestItem = document.createElement('tr');
                            requestItem.style.borderBottom = '1px solid #eee';
                            requestItem.style.transition = 'background-color 0.2s';

                            // Add alternating row colors
                            if (index % 2 === 0) {
                                requestItem.style.backgroundColor = '#ffffff';
                            } else {
                                requestItem.style.backgroundColor = '#f9f9f9';
                            }

                            // Add hover effect
                            requestItem.onmouseover = function () {
                                this.style.backgroundColor = '#f0f0f0';
                            };
                            requestItem.onmouseout = function () {
                                this.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
                            };

                            // Format date
                            const date = new Date(request.timestamp);
                            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

                            // Determine status class
                            let statusClass = 'status-pending';
                            let statusStyle = 'background-color: #fff3cd; color: #856404;';
                            if (request.status === 'approved') {
                                statusClass = 'status-approved';
                                statusStyle = 'background-color: #d4edda; color: #155724;';
                            } else if (request.status === 'rejected') {
                                statusClass = 'status-rejected';
                                statusStyle = 'background-color: #f8d7da; color: #721c24;';
                            }

                            // Get the first updated field to display (if any)
                            let updatedField = '';
                            if (request.source === 'profile_update_requests' && request.requestedData) {
                                const fields = Object.keys(request.requestedData);
                                if (fields.length > 0) {
                                    const field = fields[0];
                                    updatedField = `${field}: ${request.requestedData[field]}`;
                                    if (fields.length > 1) {
                                        updatedField += ` (+${fields.length - 1} more)`;
                                    }
                                }
                            } else if (request.changes) {
                                const fields = Object.keys(request.changes);
                                if (fields.length > 0) {
                                    const field = fields[0];
                                    updatedField = `${field}: ${request.changes[field]}`;
                                    if (fields.length > 1) {
                                        updatedField += ` (+${fields.length - 1} more)`;
                                    }
                                }
                            }

                            // Format user display
                            const initials = (request.userName || request.userEmail || 'U')
                                .split(' ')
                                .map(part => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase();
                            const photoUrl = request.userPhoto || '';
                            const photoKey = request.userPhotoKey || request.userId || photoUrl;
                            const avatarInner = photoUrl
                                ? `<span class="request-avatar-text">${initials}</span>
                                   <img class="request-avatar-img" src="/api/placeholder/60/60" data-photo-url="${photoUrl}" data-cache-key="${photoKey}" alt="${request.userName || 'User'}">`
                                : `<span class="request-avatar-text">${initials}</span>`;
                            const userDisplay = `
                                <div class="request-user">
                                    <div class="request-avatar">${avatarInner}</div>
                                    <div class="request-user-meta">
                                        <div class="request-user-name">${request.userName || 'Unknown User'}</div>
                                        <div class="request-user-email">${request.userEmail || 'No email'}</div>
                                    </div>
                                </div>
                            `;

                            const requestLabel = updatedField || request.requestType || 'Profile Update';
                            const requestDetails = request.source === 'profile_update_requests'
                                ? 'Profile update request'
                                : 'Profile change request';

                            requestItem.innerHTML = `
                                    <td>${userDisplay}</td>
                                    <td>
                                        <div class="request-summary">
                                            <div class="request-type">${requestLabel}</div>
                                            <div class="request-detail">${requestDetails}</div>
                                        </div>
                                    </td>
                                    <td><div class="request-date">${formattedDate}</div></td>
                                    <td>
                                        <span class="status-pill ${statusClass}">
                                            ${request.status || 'pending'}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="request-actions">
                                            <button class="view-request-btn action-btn-ghost" data-request-id="${request.id}" data-source="${request.source}">
                                                <i class="fas fa-eye"></i> View
                                            </button>
                                            ${request.status === 'pending' ? `
                                                <button class="approve-request-btn action-btn-approve" data-request-id="${request.id}" data-source="${request.source}">
                                                    <i class="fas fa-check"></i> Approve
                                                </button>
                                                <button class="reject-request-btn action-btn-reject" data-request-id="${request.id}" data-source="${request.source}">
                                                    <i class="fas fa-times"></i> Reject
                                                </button>
                                            ` : ''}
                                            ${(request.source === 'profile_update_requests' && request.userId) ? `
                                                <div class="request-more-wrap">
                                                    <button class="more-actions-btn" data-user-id="${request.userId}" data-request-id="${request.id}" aria-label="More actions">
                                                        <i class="fas fa-ellipsis-v"></i>
                                                    </button>
                                                    <div class="more-actions-menu">
                                                        <button class="revive-credit-btn" data-user-id="${request.userId}" data-request-id="${request.id}">
                                                            <i class="fas fa-undo"></i> Revive 1 Credit
                                                        </button>
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </td>
                                `;

                            tableBody.appendChild(requestItem);
                        });

                        table.appendChild(tableBody);
                        profileRequestsList.appendChild(table);
                        hydrateProfileRequestAvatars(table);

                        // Add event listeners to buttons
                        addProfileRequestEventListeners();
                    } else {
                        profileRequestsList.innerHTML = '<div class="profile-requests-empty"><i class="fas fa-inbox"></i><p>No profile requests found.</p></div>';
                    }
                });
        })
        .catch((error) => {
            console.error('Error fetching profile requests:', error);
            profileRequestsList.innerHTML = '<div class="profile-requests-error">Error loading profile requests. Please try again.</div>';
        });

    // Set up refresh button event listener
    const refreshRequestsBtn = document.getElementById('refresh-profile-requests-btn');
    if (refreshRequestsBtn) {
        // Remove existing event listeners by cloning and replacing the button
        const newRefreshBtn = refreshRequestsBtn.cloneNode(true);
        refreshRequestsBtn.parentNode.replaceChild(newRefreshBtn, refreshRequestsBtn);

        // Add new event listener
        newRefreshBtn.addEventListener('click', function () {
            showAlert('Refreshing profile requests...', 'info');
            initProfileRequestsSection();
        });
    }
}


function hydrateProfileRequestAvatars(container) {
    if (!container) return;
    const images = container.querySelectorAll('img[data-photo-url]');
    images.forEach(img => {
        if (img.dataset.photoHydrated === 'true') return;
        img.dataset.photoHydrated = 'true';
        const photoUrl = img.dataset.photoUrl;
        const cacheKey = img.dataset.cacheKey || photoUrl;
        const avatar = img.closest('.request-avatar');

        img.addEventListener('load', () => {
            if (avatar) avatar.classList.add('has-photo');
        });
        img.addEventListener('error', () => {
            if (avatar) avatar.classList.remove('has-photo');
        });

        if (!photoUrl) return;
        if (typeof window.applyEncryptedPhotoToImg === 'function') {
            window.applyEncryptedPhotoToImg(img, photoUrl, cacheKey);
        } else {
            img.src = photoUrl;
        }

        if (!img.dataset.previewBound) {
            img.dataset.previewBound = 'true';
            img.classList.add('request-avatar-img');
            img.style.cursor = 'pointer';
            img.addEventListener('click', (event) => {
                event.stopPropagation();
                showProfilePhotoPreview(photoUrl, cacheKey, img.getAttribute('alt') || 'Profile photo');
            });
        }
    });
}

function showProfilePhotoPreview(photoUrl, cacheKey, altText) {
    if (!photoUrl) return;
    const popupContainer = document.createElement('div');
    popupContainer.className = 'popup-container';
    popupContainer.style.position = 'fixed';
    popupContainer.style.top = '0';
    popupContainer.style.left = '0';
    popupContainer.style.width = '100%';
    popupContainer.style.height = '100%';
    popupContainer.style.backgroundColor = 'rgba(15, 23, 42, 0.75)';
    popupContainer.style.display = 'flex';
    popupContainer.style.justifyContent = 'center';
    popupContainer.style.alignItems = 'center';
    popupContainer.style.zIndex = '1200';

    popupContainer.innerHTML = `
        <div class="photo-preview-modal">
            <button class="photo-preview-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
            <div class="photo-preview-frame">
                <img class="photo-preview-img" src="/api/placeholder/600/600" alt="${altText || 'Profile photo'}">
            </div>
        </div>
    `;

    document.body.appendChild(popupContainer);

    const imgEl = popupContainer.querySelector('.photo-preview-img');
    if (imgEl) {
        if (typeof window.applyEncryptedPhotoToImg === 'function') {
            window.applyEncryptedPhotoToImg(imgEl, photoUrl, cacheKey || photoUrl);
        } else {
            imgEl.src = photoUrl;
        }
    }

    const close = () => {
        if (popupContainer.parentNode) {
            popupContainer.parentNode.removeChild(popupContainer);
        }
    };

    popupContainer.querySelectorAll('.photo-preview-close').forEach(btn => {
        btn.addEventListener('click', close);
    });

    popupContainer.addEventListener('click', (event) => {
        if (event.target === popupContainer) {
            close();
        }
    });
}


// Function to add event listeners to profile request buttons
function addProfileRequestEventListeners() {
    // View request buttons
    document.querySelectorAll('.view-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            viewProfileRequest(requestId, source);
        });
    });

    // Approve request buttons
    document.querySelectorAll('.approve-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            if (confirm('Are you sure you want to approve this request?')) {
                approveProfileRequest(requestId, source);
            }
        });
    });

    // Reject request buttons
    document.querySelectorAll('.reject-request-btn').forEach(button => {
        button.addEventListener('click', function () {
            const requestId = this.getAttribute('data-request-id');
            const source = this.getAttribute('data-source');
            if (confirm('Are you sure you want to reject this request?')) {
                rejectProfileRequest(requestId, source);
            }
        });
    });

    const closeAllProfileRequestMenus = (exceptMenu) => {
        document.querySelectorAll('.more-actions-menu').forEach(menu => {
            if (menu !== exceptMenu) {
                menu.style.display = 'none';
            }
        });
    };

    document.querySelectorAll('.more-actions-btn').forEach(button => {
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            const menu = this.parentElement ? this.parentElement.querySelector('.more-actions-menu') : null;
            if (!menu) return;
            const isOpen = menu.style.display === 'block';
            closeAllProfileRequestMenus(menu);
            menu.style.display = isOpen ? 'none' : 'block';
        });
    });

    document.querySelectorAll('.revive-credit-btn').forEach(button => {
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            if (!userId) {
                showAlert('User ID missing for credit revive', 'error');
                return;
            }
            const confirmReset = confirm('Revive 1 profile update credit for this user?');
            if (!confirmReset) return;

            const db = firebase.database();
            const usedRef = db.ref(`users/${userId}/profileUpdateUsed`);
            usedRef.transaction(current => {
                const used = Number(current || 0);
                if (used <= 0) {
                    return;
                }
                return used - 1;
            }).then(result => {
                if (!result.committed) {
                    showAlert('No credits to revive', 'info');
                    return;
                }
                showAlert('Revived 1 profile update credit', 'success');
            }).catch(error => {
                showAlert(`Error reviving credit: ${error.message}`, 'error');
            });

            const menu = this.closest('.more-actions-menu');
            if (menu) menu.style.display = 'none';
        });
    });

    if (!window.profileRequestMenuListenerAttached) {
        window.profileRequestMenuListenerAttached = true;
        document.addEventListener('click', () => {
            closeAllProfileRequestMenus();
        });
    }
}

// Function to view profile request details
function viewProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                showAlert('Request not found', 'error');
                return;
            }

            const request = snapshot.val();

            // Create popup container
            const popupContainer = document.createElement('div');
            popupContainer.className = 'popup-container';
            popupContainer.style.position = 'fixed';
            popupContainer.style.top = '0';
            popupContainer.style.left = '0';
            popupContainer.style.width = '100%';
            popupContainer.style.height = '100%';
            popupContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            popupContainer.style.display = 'flex';
            popupContainer.style.justifyContent = 'center';
            popupContainer.style.alignItems = 'center';
            popupContainer.style.zIndex = '1000';

            // Format date
            const date = new Date(request.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

            const changeItems = [];
            if (source === 'profile_update_requests' && request.requestedData) {
                for (const field in request.requestedData) {
                    const currentValue = request.currentData && request.currentData[field] ? request.currentData[field] : 'Not set';
                    if (currentValue !== request.requestedData[field]) {
                        changeItems.push({ field, from: currentValue, to: request.requestedData[field] });
                    }
                }
            } else if (request.changes) {
                for (const field in request.changes) {
                    const currentValue = request.currentData && request.currentData[field] ? request.currentData[field] : 'Not set';
                    if (currentValue !== request.changes[field]) {
                        changeItems.push({ field, from: currentValue, to: request.changes[field] });
                    }
                }
            }

            let changesHtml = '';
            if (changeItems.length) {
                const rows = changeItems.map(change => `
                    <li>
                        <span class="change-field">${change.field}</span>
                        <span class="change-from">${change.from}</span>
                        <span class="change-arrow">-&gt;</span>
                        <span class="change-to">${change.to}</span>
                    </li>
                `).join('');
                changesHtml = `
                    <div class="profile-request-popup__changes">
                        <div class="profile-request-popup__section-title">Requested Changes</div>
                        <ul>${rows}</ul>
                    </div>
                `;
            }

            const userName = request.userName || request.name || '';
            const userEmail = request.userEmail || request.email || '';
            const fallbackName = request.userId ? `User ${request.userId.slice(0, 6)}` : 'User';
            const displayName = userName || fallbackName;
            const displayEmail = userEmail || 'Email unavailable';
            const initials = (userName || userEmail || request.userId || 'U')
                .split(' ')
                .map(part => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

            const userDisplay = `
                <div class="profile-request-popup__user-card">
                    <div class="profile-request-popup__avatar">${initials}</div>
                    <div>
                        <div class="profile-request-popup__user-name">${displayName}</div>
                        <div class="profile-request-popup__user-email">${displayEmail}</div>
                    </div>
                </div>
            `;

            let statusClass = 'status-pending';
            if (request.status === 'approved') {
                statusClass = 'status-approved';
            } else if (request.status === 'rejected') {
                statusClass = 'status-rejected';
            }

            const statusText = request.status || 'pending';
            const requestType = request.requestType || (source === 'profile_update_requests' ? 'Profile Update' : 'Other Request');

            // Create popup content - redesigned layout
            popupContainer.innerHTML = `
                <div class="profile-request-popup">
                    <div class="profile-request-popup__header">
                        <div>
                            <div class="profile-request-popup__title">Profile Request Details</div>
                            <div class="profile-request-popup__subtitle">${requestType}</div>
                        </div>
                        <button class="close-popup-btn profile-request-popup__close" aria-label="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="profile-request-popup__meta">
                        <div class="profile-request-popup__user">
                            ${userDisplay}
                        </div>
                        <div class="profile-request-popup__chips">
                            <span class="status-pill ${statusClass}">${statusText}</span>
                            <span class="profile-request-popup__chip"><i class="fas fa-calendar"></i> ${formattedDate}</span>
                        </div>
                    </div>
                    <div class="profile-request-popup__body">
                        ${changesHtml || '<div class="profile-request-popup__empty">No changes were detected.</div>'}
                    </div>
                    <div class="profile-request-popup__footer">
                        <button class="see-details-btn action-btn-ghost">
                            <i class="fas fa-user"></i> See Details
                        </button>
                        <div class="profile-request-popup__actions">
                            <button class="close-popup-btn action-btn-ghost">Close</button>
                            ${request.status === 'pending' ? `
                                <button class="approve-popup-btn action-btn-approve"><i class="fas fa-check"></i> Approve</button>
                                <button class="reject-popup-btn action-btn-reject"><i class="fas fa-times"></i> Reject</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;

            // Add popup to body
            document.body.appendChild(popupContainer);

            if ((!userName || !userEmail) && request.userId) {
                firebase.database().ref(`users/${request.userId}`).once('value')
                    .then(userSnapshot => {
                        if (!userSnapshot.exists()) return;
                        const data = userSnapshot.val() || {};
                        const resolvedName = userName || data.name || data.displayName || (data.email ? data.email.split('@')[0] : '');
                        const resolvedEmail = userEmail || data.email || '';

                        if (resolvedName) {
                            const nameEl = popupContainer.querySelector('.profile-request-popup__user-name');
                            if (nameEl) nameEl.textContent = resolvedName;
                        }
                        if (resolvedEmail) {
                            const emailEl = popupContainer.querySelector('.profile-request-popup__user-email');
                            if (emailEl) emailEl.textContent = resolvedEmail;
                        }
                        if (resolvedName || resolvedEmail) {
                            const initialsBase = resolvedName || resolvedEmail || request.userId || 'U';
                            const initialsUpdate = initialsBase.split(' ')
                                .map(part => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase();
                            const avatarEl = popupContainer.querySelector('.profile-request-popup__avatar');
                            if (avatarEl) avatarEl.textContent = initialsUpdate;
                        }
                    })
                    .catch(() => { });
            }

            // Close popup buttons
            popupContainer.querySelectorAll('.close-popup-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    document.body.removeChild(popupContainer);
                });
            });

            // See details button
            const seeDetailsBtn = popupContainer.querySelector('.see-details-btn');
            if (seeDetailsBtn) {
                seeDetailsBtn.addEventListener('click', function () {
                    showUserDetails(request.userId);
                });
            }

            // Approve button in popup
            const approveBtn = popupContainer.querySelector('.approve-popup-btn');
            if (approveBtn) {
                approveBtn.addEventListener('click', function () {
                    if (confirm('Are you sure you want to approve this request?')) {
                        approveProfileRequest(requestId, source);
                        document.body.removeChild(popupContainer);
                    }
                });
            }

            // Reject button in popup
            const rejectBtn = popupContainer.querySelector('.reject-popup-btn');
            if (rejectBtn) {
                rejectBtn.addEventListener('click', function () {
                    if (confirm('Are you sure you want to reject this request?')) {
                        rejectProfileRequest(requestId, source);
                        document.body.removeChild(popupContainer);
                    }
                });
            }

            // Close popup when clicking outside
            popupContainer.addEventListener('click', function (e) {
                if (e.target === popupContainer) {
                    document.body.removeChild(popupContainer);
                }
            });
        })
        .catch((error) => {
            console.error('Error fetching request details:', error);
            showAlert('Error loading request details', 'error');
        });
}

// Function to approve profile request
function approveProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const request = snapshot.val();

                // Update request status
                requestRef.update({
                    status: 'approved',
                    approvedAt: Date.now(),
                    approvedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
                })
                    .then(() => {
                        // Apply changes to user profile if needed
                        if (source === 'profile_update_requests' && request.userId && request.requestedData) {
                            const userRef = firebase.database().ref('users/' + request.userId);
                            userRef.update(request.requestedData)
                                .then(() => {
                                    showAlert('Request approved and profile updated', 'success');
                                    initProfileRequestsSection(); // Refresh the list
                                })
                                .catch((error) => {
                                    console.error('Error updating user profile:', error);
                                    showAlert('Request approved but error updating profile', 'warning');
                                    initProfileRequestsSection(); // Refresh the list
                                });
                        } else if (request.userId && request.changes) {
                            const userRef = firebase.database().ref('users/' + request.userId);
                            userRef.update(request.changes)
                                .then(() => {
                                    showAlert('Request approved and profile updated', 'success');
                                    initProfileRequestsSection(); // Refresh the list
                                })
                                .catch((error) => {
                                    console.error('Error updating user profile:', error);
                                    showAlert('Request approved but error updating profile', 'warning');
                                    initProfileRequestsSection(); // Refresh the list
                                });
                        } else {
                            showAlert('Request approved successfully', 'success');
                            initProfileRequestsSection(); // Refresh the list
                        }
                    })
                    .catch((error) => {
                        console.error('Error approving request:', error);
                        showAlert('Error approving request', 'error');
                    });
            } else {
                showAlert('Request not found', 'error');
            }
        })
        .catch((error) => {
            console.error('Error fetching request:', error);
            showAlert('Error approving request', 'error');
        });
}

// Function to reject profile request
function rejectProfileRequest(requestId, source) {
    const requestRef = firebase.database().ref(`${source}/${requestId}`);

    requestRef.update({
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
    })
        .then(() => {
            showAlert('Request rejected successfully', 'success');
            initProfileRequestsSection(); // Refresh the list
        })
        .catch((error) => {
            console.error('Error rejecting request:', error);
            showAlert('Error rejecting request', 'error');
        });
}

// Function to show complete user details
function showUserDetails(userId) {
    if (!userId) return;

    firebase.database().ref(`users/${userId}`).once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();

                const detailsPopup = document.createElement('div');
                detailsPopup.className = 'popup-container';
                detailsPopup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:1001';

                let detailsHtml = '<h3>Complete User Details</h3><div style="max-height:400px;overflow-y:auto;margin:15px 0">';
                for (const [key, value] of Object.entries(userData)) {
                    detailsHtml += `<p style="margin:8px 0;padding:8px;background:#f9f9f9;border-radius:4px"><strong>${key}:</strong> ${value}</p>`;
                }
                detailsHtml += '</div>';

                detailsPopup.innerHTML = `
                        <div style="background:white;padding:20px;border-radius:8px;width:90%;max-width:600px;box-shadow:0 4px 8px rgba(0,0,0,0.2)">
                            ${detailsHtml}
                            <div style="text-align:right;margin-top:20px">
                                <button class="close-details-btn primary-btn" style="padding:8px 16px;border-radius:4px">Close</button>
                            </div>
                        </div>
                    `;

                document.body.appendChild(detailsPopup);

                detailsPopup.querySelector('.close-details-btn').addEventListener('click', function () {
                    document.body.removeChild(detailsPopup);
                });

                detailsPopup.addEventListener('click', function (e) {
                    if (e.target === detailsPopup) {
                        document.body.removeChild(detailsPopup);
                    }
                });
            }
        })
        .catch((error) => {
            console.error('Error fetching user details:', error);
        });
}

// Alias function to maintain naming consistency
function initProfileRequests() {
    initProfileRequestsSection();
}



// Location matching function for admin panel
function compareLocations(otherLocation) {
    if (!adminLocation) {
        showAlert("Please get your location first", "warning");
        return;
    }

    // Parse coordinates as floats to ensure proper calculation
    const adminLat = parseFloat(adminLocation.lat);
    const adminLon = parseFloat(adminLocation.lon);
    const otherLat = parseFloat(otherLocation.lat);
    const otherLon = parseFloat(otherLocation.lon);

    // Get device info
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const deviceType = isMobile ? "Mobile" : "Desktop";
    const otherDeviceType = otherLocation.deviceType || "Unknown device";

    // Special handling for cross-device comparison
    const isCrossDevice = (isMobile && otherDeviceType.includes("Desktop")) ||
        (!isMobile && otherDeviceType.includes("Mobile"));

    // Calculate distance with the improved formula
    const distance = calculateDistance(adminLat, adminLon, otherLat, otherLon);

    // Calculate adjusted match threshold
    // Base threshold - minimum 20m, maximum 100m
    let matchThreshold = 100;

    // Adjust for cross-device comparison
    if (isCrossDevice) {
        console.log("Cross-device comparison detected. Using more generous threshold.");
        // More generous for cross-device
        matchThreshold = 150;
    }

    // Further adjust based on accuracy if available
    if (adminLocation.accuracy && otherLocation.accuracy) {
        const combinedAccuracy = (adminLocation.accuracy + otherLocation.accuracy) / 2;
        // Ensure threshold is reasonable based on combined accuracy
        // but still maintain minimum and maximum bounds
        matchThreshold = Math.min(200, Math.max(50, combinedAccuracy * 1.5));
    }

    // For very large distances, automatically adjust threshold
    if (distance > 10000) {
        console.log("Very large distance detected. This is likely a GPS error.");
        // For distances over 10km, use a special threshold
        // This helps when there are major GPS errors between devices
        matchThreshold = Math.min(distance * 0.05, 500);
    }

    // Check if coordinates match within threshold
    const matched = distance <= matchThreshold;

    // Log detailed matching information
    console.log("LOCATION COMPARISON:", {
        admin: {
            device: deviceType,
            coordinates: [adminLat, adminLon],
            accuracy: adminLocation.accuracy
        },
        other: {
            device: otherDeviceType,
            coordinates: [otherLat, otherLon],
            accuracy: otherLocation.accuracy
        },
        distance: distance,
        threshold: matchThreshold,
        isCrossDevice: isCrossDevice,
        result: matched ? "MATCH" : "NO MATCH"
    });

    // Show match result
    const resultDiv = document.getElementById('peer-match-result');

    if (matched) {
        resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <strong>Locations Match!</strong>
                    <div class="mt-2">
                        <strong>Distance:</strong> ${Math.round(distance)}m apart
                        <br>
                        <strong>Match Threshold:</strong> ${Math.round(matchThreshold)}m
                        <br>
                        <span class="text-success">The coordinates from both devices are aligned within expected accuracy.</span>
                    </div>
                </div>
            `;

        // Log success details
        console.log("LOCATION MATCH SUCCESS:", {
            distance: distance,
            threshold: matchThreshold,
            admin: { lat: adminLat, lon: adminLon, accuracy: adminLocation.accuracy },
            other: { lat: otherLat, lon: otherLon, accuracy: otherLocation.accuracy }
        });
    } else {
        resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-times-circle"></i> <strong>Locations Don't Match</strong>
                    <div class="mt-2">
                        <strong>Distance:</strong> ${Math.round(distance)}m apart
                        <br>
                        <strong>Match Threshold:</strong> ${Math.round(matchThreshold)}m
                        <br>
                        <span class="text-danger">The coordinates from both devices differ more than expected.</span>
                    </div>
                </div>
            `;

        // Log failure details
        console.log("LOCATION MATCH FAILURE:", {
            distance: distance,
            threshold: matchThreshold,
            admin: { lat: adminLat, lon: adminLon, accuracy: adminLocation.accuracy },
            other: { lat: otherLat, lon: otherLon, accuracy: otherLocation.accuracy }
        });
    }

    // Add detailed comparison
    resultDiv.innerHTML += `
            <div class="comparison-table">
                <table class="table table-sm table-bordered mt-3">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Your Device (${deviceType})</th>
                            <th>Other Device (${otherDeviceType})</th>
                            <th>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Latitude</td>
                            <td>${adminLat.toFixed(6)}</td>
                            <td>${otherLat.toFixed(6)}</td>
                            <td>${Math.abs(adminLat - otherLat).toFixed(6)}</td>
                        </tr>
                        <tr>
                            <td>Longitude</td>
                            <td>${adminLon.toFixed(6)}</td>
                            <td>${otherLon.toFixed(6)}</td>
                            <td>${Math.abs(adminLon - otherLon).toFixed(6)}</td>
                        </tr>
                        <tr>
                            <td>Accuracy</td>
                            <td>±${Math.round(adminLocation.accuracy)}m</td>
                            <td>±${Math.round(otherLocation.accuracy)}m</td>
                            <td>±${Math.round(Math.abs(adminLocation.accuracy - otherLocation.accuracy))}m</td>
                        </tr>
                        <tr>
                            <td>Cross-device?</td>
                            <td colspan="3" class="${isCrossDevice ? 'text-primary' : 'text-secondary'}">
                                ${isCrossDevice ? 'Yes - Using adjusted threshold for cross-device comparison' : 'No - Both devices are same type'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
}





document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const menuToggle = document.getElementById('menu-toggle');
    const headerMenuToggle = document.getElementById('header-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');

    // Create overlay element only for mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    if (window.innerWidth < 992) {
        document.body.appendChild(overlay);
    }

    // Function to close sidebar
    function closeSidebar() {
        sidebar.classList.add('sidebar-collapsed');
        contentWrapper.classList.add('expanded');
        if (overlay) overlay.classList.remove('visible');
        if (window.innerWidth < 992) {
            menuToggle.style.visibility = 'visible';
            menuToggle.style.opacity = '1';
        }
    }

    // Function to open sidebar
    function openSidebar() {
        sidebar.classList.remove('sidebar-collapsed');
        contentWrapper.classList.remove('expanded');
        if (window.innerWidth < 992 && overlay) {
            overlay.classList.add('visible');
            menuToggle.style.visibility = 'hidden';
            menuToggle.style.opacity = '0';
        }
    }

    // Toggle sidebar function
    function toggleSidebar() {
        if (sidebar.classList.contains('sidebar-collapsed')) {
            openSidebar();
        } else {
            closeSidebar();
        }
    }

    // Add click event listeners
    menuToggle.addEventListener('click', openSidebar);
    headerMenuToggle.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Close sidebar when clicking menu items on mobile
    const menuItems = document.querySelectorAll('.sidebar-menu-item-modern');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                closeSidebar();
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', function () {
        if (window.innerWidth >= 992) {
            sidebar.classList.remove('sidebar-collapsed');
            contentWrapper.classList.remove('expanded');
            if (overlay) overlay.classList.remove('visible');
            menuToggle.style.visibility = 'hidden';
        } else {
            closeSidebar();
        }
    });

    // Initialize sidebar state based on screen size
    if (window.innerWidth < 992) {
        closeSidebar();
    }

    // Make toggleSidebar function available globally
    window.toggleSidebar = toggleSidebar;

    // Sidebar search functionality
    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', function () {
            const searchTerm = this.value.toLowerCase().trim();
            const menuItems = document.querySelectorAll('.sidebar-menu-item-modern:not(.logout)');
            const sections = document.querySelectorAll('.sidebar-section');

            if (!searchTerm) {
                // Show all items when search is empty
                menuItems.forEach(item => {
                    item.style.display = 'flex';
                });
                sections.forEach(section => {
                    section.style.display = 'block';
                });
                return;
            }

            // Filter menu items
            sections.forEach(section => {
                let hasVisibleItems = false;
                const sectionItems = section.querySelectorAll('.sidebar-menu-item-modern');

                sectionItems.forEach(item => {
                    const itemText = item.querySelector('.menu-item-text');
                    if (itemText) {
                        const text = itemText.textContent.toLowerCase();
                        if (text.includes(searchTerm)) {
                            item.style.display = 'flex';
                            hasVisibleItems = true;
                        } else {
                            item.style.display = 'none';
                        }
                    }
                });

                // Hide section if no visible items
                section.style.display = hasVisibleItems ? 'block' : 'none';
            });
        });
    }
});


//Sidebar and Menu Functionality 

document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const menuToggle = document.getElementById('menu-toggle');
    const headerMenuToggle = document.getElementById('header-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('content-wrapper');
    const sidebarMenuItems = document.querySelectorAll('.sidebar-menu-item-modern');
    const sectionTemplates = document.querySelectorAll('.section-template');
    const adminPanel = document.getElementById('admin-panel');

    // Toggle sidebar function
    function toggleSidebar() {
        sidebar.classList.toggle('sidebar-collapsed');
        contentWrapper.classList.toggle('expanded');

        // Update content width based on sidebar state
        if (sidebar.classList.contains('sidebar-collapsed')) {
            contentWrapper.style.width = '100%';
            headerMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';

            // Update all section menu buttons to show bars icon
            document.querySelectorAll('.section-menu-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-bars"></i>';
            });

            // On mobile, we also update menu toggle visibility directly
            if (window.innerWidth < 992) {
                menuToggle.style.visibility = 'visible';
                menuToggle.style.opacity = '1';
            }
        } else {
            contentWrapper.style.width = 'calc(100% - 280px)';
            headerMenuToggle.innerHTML = '<i class="fas fa-times"></i>';

            // Update all section menu buttons to show times icon
            document.querySelectorAll('.section-menu-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-times"></i>';
            });

            // On mobile, hide the menu toggle when sidebar is open
            if (window.innerWidth < 992) {
                menuToggle.style.visibility = 'hidden';
                menuToggle.style.opacity = '0';
            }
        }

        // Force layout recalculation to ensure smooth transition
        window.getComputedStyle(contentWrapper).getPropertyValue('width');
    }

    // Add click event listeners to both menu toggles
    menuToggle.addEventListener('click', toggleSidebar);
    headerMenuToggle.addEventListener('click', toggleSidebar);

    // Add click event listeners to all section menu buttons
    document.querySelectorAll('.section-menu-btn').forEach(btn => {
        btn.addEventListener('click', toggleSidebar);
    });

    // Make toggleSidebar function available globally for dynamically created elements
    window.toggleSidebar = toggleSidebar;

    // Set initial icon state
    if (sidebar.classList.contains('sidebar-collapsed')) {
        headerMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        // Initialize section menu buttons
        document.querySelectorAll('.section-menu-btn').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-bars"></i>';
        });
    } else {
        headerMenuToggle.innerHTML = '<i class="fas fa-times"></i>';
        // Initialize section menu buttons
        document.querySelectorAll('.section-menu-btn').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-times"></i>';
        });
    }

    // Initialize for mobile devices
    function checkScreenSize() {
        if (window.innerWidth < 992) {
            sidebar.classList.add('sidebar-collapsed');
            contentWrapper.classList.add('expanded');

            // Update content width for mobile
            contentWrapper.style.width = '100%';

            // Update header icon
            headerMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';

            // Update all section menu buttons to show bars icon
            document.querySelectorAll('.section-menu-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-bars"></i>';
            });

            // Show the mobile menu toggle (since sidebar is collapsed)
            menuToggle.style.visibility = 'visible';
            menuToggle.style.opacity = '1';
        } else {
            // Only adjust layout if the sidebar is visible (user is logged in)
            if (sidebar.classList.contains('visible')) {
                sidebar.classList.remove('sidebar-collapsed');
                contentWrapper.classList.remove('expanded');

                // Update content width for desktop with visible sidebar
                contentWrapper.style.width = 'calc(100% - 280px)';

                // Update header icon
                headerMenuToggle.innerHTML = '<i class="fas fa-times"></i>';

                // Update all section menu buttons to show times icon
                document.querySelectorAll('.section-menu-btn').forEach(btn => {
                    btn.innerHTML = '<i class="fas fa-times"></i>';
                });
            } else {
                // If sidebar is not visible (user not logged in), keep content at full width
                contentWrapper.style.width = '100%';
            }
        }
    }

    // Check screen size on load and resize
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    // Sidebar menu navigation
    sidebarMenuItems.forEach(item => {
        item.addEventListener('click', function () {
            const section = this.getAttribute('data-section');

            // Handle logout
            if (section === 'logout') {
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) logoutBtn.click();
                return;
            }

            // Remove active class from all menu items
            sidebarMenuItems.forEach(mi => mi.classList.remove('active'));

            // Add active class to clicked menu item
            this.classList.add('active');

            // Remove any existing active sections first
            const existingActiveSections = document.querySelectorAll('[id$="-section-active"]');
            existingActiveSections.forEach(activeSection => {
                if (activeSection.parentNode === contentWrapper) {
                    contentWrapper.removeChild(activeSection);
                }
            });

            // Handle dashboard section
            if (section === 'dashboard') {
                adminPanel.classList.remove('hidden');
                return;
            }

            // Handle other sections
            adminPanel.classList.add('hidden');

            // Show the selected section template
            const templateToShow = document.getElementById(`${section}-section`);
            if (templateToShow) {
                const clonedTemplate = templateToShow.cloneNode(true);
                clonedTemplate.classList.remove('hidden');
                clonedTemplate.id = `${section}-section-active`;
                contentWrapper.appendChild(clonedTemplate);

                // If small screen, collapse sidebar after selection
                if (window.innerWidth < 992) {
                    sidebar.classList.add('sidebar-collapsed');
                }

                // Initialize section specific functionality
                if (section === 'recent-logins') {
                    initRecentLogins();
                } else if (section === 'manage-admins') {
                    initManageAdmins();
                } else if (section === 'notifications') {
                    initNotifications();
                } else if (section === 'profile-requests') {
                    initProfileRequests();
                } else if (section === 'blocked-users') {
                    initBlockedUsers();
                } else if (section === 'download-limit') {
                    initDownloadLimitSection();
                } else if (section === 'device-locks') {
                    initDeviceLocksSection();
                } else if (section === 'database-management') {
                    initDatabaseManagement();
                } else if (section === 'attendance-modification-section') {
                    // Initialize attendance modification section
                    setTimeout(() => {
                        initAttendanceModification();
                    }, 100);
                } else if (section === 'student-details') {
                    // Initialize student details section with a delay to ensure DOM is ready
                    setTimeout(() => {
                        const searchInput = document.querySelector('#student-details-section-active #student-search-input');
                        const searchButton = document.querySelector('#student-details-section-active #search-student-btn');
                        const detailsContainer = document.querySelector('#student-details-section-active #student-details-container');
                        const suggestionsContainer = document.querySelector('#student-details-section-active #search-suggestions');

                        if (!searchInput || !searchButton || !detailsContainer || !suggestionsContainer) {
                            console.error("Required elements not found for student details section");
                            return;
                        }

                        let allStudents = [];

                        // Show loading state
                        detailsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading students data...</div>';

                        // Load all students
                        const db = firebase.database();
                        const usersRef = db.ref('users');

                        usersRef.orderByChild('role').equalTo('student').once('value')
                            .then((snapshot) => {
                                if (snapshot.exists()) {
                                    snapshot.forEach((childSnapshot) => {
                                        const student = childSnapshot.val();
                                        student.id = childSnapshot.key;
                                        allStudents.push(student);
                                    });
                                    console.log(`Loaded ${allStudents.length} students`);
                                    detailsContainer.innerHTML = '<div class="empty-state">Enter a search term to find students</div>';

                                    // Add search functionality
                                    searchInput.addEventListener('input', () => {
                                        const searchTerm = searchInput.value.toLowerCase().trim();
                                        if (!searchTerm) {
                                            suggestionsContainer.style.display = 'none';
                                            return;
                                        }

                                        const matches = allStudents.filter(student => {
                                            return (
                                                (student.name && student.name.toLowerCase().includes(searchTerm)) ||
                                                (student.email && student.email.toLowerCase().includes(searchTerm)) ||
                                                (student.classRoll && student.classRoll.toString().includes(searchTerm)) ||
                                                (student.univRoll && student.univRoll.toString().includes(searchTerm))
                                            );
                                        }).slice(0, 5);

                                        if (matches.length === 0) {
                                            suggestionsContainer.style.display = 'none';
                                            return;
                                        }

                                        const html = matches.map(student => `
                                                <div class="suggestion-item" data-student-id="${student.id}">
                                                    <div class="suggestion-details">
                                                        <div class="suggestion-name">${student.name || 'Unknown Name'}</div>
                                                        <div class="suggestion-roll">
                                                            ${student.classRoll ? `Roll: ${student.classRoll}` : ''}
                            </div>
                            </div>
                                                    <div class="suggestion-email">${student.email}</div>
                        </div>
                                            `).join('');

                                        suggestionsContainer.innerHTML = html;
                                        suggestionsContainer.style.display = 'block';
                                    });

                                    // Handle search button click
                                    searchButton.addEventListener('click', () => {
                                        const searchTerm = searchInput.value.toLowerCase().trim();
                                        if (!searchTerm) {
                                            showMessage('Please enter a search term', 'warning');
                                            return;
                                        }

                                        const matches = allStudents.filter(student => {
                                            return (
                                                (student.name && student.name.toLowerCase().includes(searchTerm)) ||
                                                (student.email && student.email.toLowerCase().includes(searchTerm)) ||
                                                (student.classRoll && student.classRoll.toString().includes(searchTerm)) ||
                                                (student.univRoll && student.univRoll.toString().includes(searchTerm))
                                            );
                                        });

                                        if (matches.length === 0) {
                                            detailsContainer.innerHTML = '<div class="empty-state">No students found matching your search</div>';
                                            return;
                                        }

                                        displayStudentDetails(matches[0]);
                                        suggestionsContainer.style.display = 'none';
                                    });

                                    // Handle suggestion clicks
                                    suggestionsContainer.addEventListener('click', (e) => {
                                        const suggestionItem = e.target.closest('.suggestion-item');
                                        if (suggestionItem) {
                                            const studentId = suggestionItem.dataset.studentId;
                                            const student = allStudents.find(s => s.id === studentId);
                                            if (student) {
                                                searchInput.value = student.name || student.email;
                                                displayStudentDetails(student);
                                                suggestionsContainer.style.display = 'none';
                                            }
                                        }
                                    });

                                    // Handle Enter key
                                    searchInput.addEventListener('keyup', (e) => {
                                        if (e.key === 'Enter') {
                                            searchButton.click();
                                        }
                                    });
                                } else {
                                    detailsContainer.innerHTML = '<div class="empty-state">No students found in the database</div>';
                                }
                            })
                            .catch((error) => {
                                console.error('Error loading students:', error);
                                detailsContainer.innerHTML = `<div class="error-message">Error loading students: ${error.message}</div>`;
                            });
                    }, 100);
                }
            }
        });
    });
});



document.addEventListener('DOMContentLoaded', function () {
    // Email and password input handling
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');

    emailInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            loginBtn.click();
        }
    });

    // Global click handler for closing dropdowns
    document.addEventListener('click', function (e) {
        // If the clicked element is not an action button or its icon
        if (!e.target.matches('.action-button') && !e.target.matches('.fa-ellipsis-v')) {
            // Close all open dropdowns
            document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });

    // Detect device type
    if (typeof currentDeviceType !== 'undefined') {
        currentDeviceType = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            ? 'mobile'
            : 'desktop';

        console.log("Current device type:", currentDeviceType);
    }
});

// Page loader handling
window.addEventListener('load', function () {
    const loader = document.getElementById('page-loader');
    // Add a small delay to ensure all resources are loaded and rendered
    setTimeout(function () {
        loader.classList.add('loader-hidden');
        // Remove loader from DOM after animation completes
        setTimeout(function () {
            if (loader.parentNode) {
                loader.parentNode.removeChild(loader);
            }
        }, 500);
    }, 800);
});
// Helper function to get time ago for password reset requests
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Simple selectStudents function for general use
function selectStudents() {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';

    popup.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;width:500px;max-height:600px;overflow-y:auto">
            <h3>Select Students</h3>
            <div id="students-list">Loading...</div>
            <div style="margin-top:20px;text-align:right">
                <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" style="margin-right:10px">Cancel</button>
                <button onclick="confirmStudentSelection();this.closest('div[style*=\"position:fixed\"]').remove()">Done</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Load students
    firebase.database().ref('users').orderByChild('role').equalTo('student').once('value').then(snapshot => {
        let html = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                html += `<div style="padding:5px"><input type="checkbox" id="s_${child.key}" onchange="updateSelection('${child.key}','${user.name}','${user.email}',this.checked)"> ${user.name} (${user.email})</div>`;
            });
        }
        document.getElementById('students-list').innerHTML = html || 'No students found';
    });
}

function updateSelection(id, name, email, checked) {
    if (!window.selectedStudentsList) window.selectedStudentsList = [];
    if (checked) {
        if (!window.selectedStudentsList.some(s => s.id === id)) {
            window.selectedStudentsList.push({ id, name, email });
        }
    } else {
        window.selectedStudentsList = window.selectedStudentsList.filter(s => s.id !== id);
    }
}

function confirmStudentSelection() {
    console.log('Selected students:', window.selectedStudentsList);
}

