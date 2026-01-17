// Live Attendees Functionality - Modern Redesign
// This file handles the live attendees popup and real-time attendance tracking

// Global variables for live attendees
let liveAttendeesPopup = null;
let attendanceListener = null;
let currentLocationId = null;
let currentLocationName = null;
let allAttendeesData = [];
let remainingTimeInterval = null;
let locationExpiresAt = null;

// Function to show live attendees popup
window.showLiveAttendees = function (locationId, locationName) {
    currentLocationId = locationId;
    currentLocationName = locationName;

    // Remove existing popup if any
    if (liveAttendeesPopup) {
        closeLiveAttendees();
    }

    // Create popup HTML
    createLiveAttendeesPopup(locationId, locationName);

    // Generate QR code for attendance
    generateAttendanceQR(locationId);

    // Start listening for real-time attendance updates
    startAttendanceListener(locationId);

    // Fetch location expiry time and start countdown
    fetchLocationExpiry(locationId);
};

// Function to create the live attendees popup
function createLiveAttendeesPopup(locationId, locationName) {
    liveAttendeesPopup = document.createElement('div');
    liveAttendeesPopup.className = 'live-attendees-overlay';
    liveAttendeesPopup.innerHTML = `
        <div class="live-attendees-modal">
            <div class="modal-header-modern">
                <div class="header-left">
                    <div class="header-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="header-text">
                        <h2>Live Attendance</h2>
                        <span class="location-badge"><i class="fas fa-map-marker-alt"></i> ${locationName}</span>
                    </div>
                </div>
                <div class="header-right">
                    <div class="time-remaining" id="time-remaining">
                        <i class="fas fa-clock"></i>
                        <span>Ending in: <strong id="remaining-time">--:--</strong></span>
                    </div>
                    <button class="header-btn" onclick="toggleFullscreen()" title="Toggle Fullscreen">
                        <i class="fas fa-expand" id="fullscreen-icon"></i>
                    </button>
                    <button class="header-btn close-btn" onclick="closeLiveAttendees()" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="modal-body-modern">
                <div class="content-grid">
                    <div class="qr-panel">
                        <div class="panel-header">
                            <i class="fas fa-qrcode"></i> Scan to Check-in
                        </div>
                        <div class="qr-container">
                            <div id="live-qr-code"></div>
                        </div>
                        <p class="qr-hint">Students can scan this QR code with their app</p>
                        <button class="refresh-qr-btn" onclick="refreshQRCode()">
                            <i class="fas fa-sync-alt"></i> Refresh QR
                        </button>
                    </div>
                    
                    <div class="attendees-panel">
                        <div class="stats-row">
                            <div class="stat-card present">
                                <div class="stat-icon"><i class="fas fa-user-check"></i></div>
                                <div class="stat-content">
                                    <span class="stat-value" id="stat-present">0</span>
                                    <span class="stat-label">Present</span>
                                </div>
                            </div>
                            <div class="stat-card late">
                                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                                <div class="stat-content">
                                    <span class="stat-value" id="stat-late">0</span>
                                    <span class="stat-label">Late</span>
                                </div>
                            </div>
                            <div class="stat-card absent">
                                <div class="stat-icon"><i class="fas fa-user-times"></i></div>
                                <div class="stat-content">
                                    <span class="stat-value" id="stat-absent">0</span>
                                    <span class="stat-label">Absent</span>
                                </div>
                            </div>
                            <div class="stat-card recent">
                                <div class="stat-icon"><i class="fas fa-bolt"></i></div>
                                <div class="stat-content">
                                    <span class="stat-value" id="stat-recent">0</span>
                                    <span class="stat-label">Recent</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="panel-header">
                            <div class="header-with-actions">
                                <span><i class="fas fa-list-alt"></i> Attendees</span>
                                <div class="header-actions">
                                    <button class="action-btn" onclick="exportAttendees()" title="Export List">
                                        <i class="fas fa-download"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="search-filter-bar">
                            <div class="search-box">
                                <i class="fas fa-search"></i>
                                <input type="text" id="attendee-search" placeholder="Search by name or roll..." oninput="filterAttendees()">
                            </div>
                            <div class="filter-buttons">
                                <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">All</button>
                                <button class="filter-btn" data-filter="present" onclick="setFilter('present')">Present</button>
                                <button class="filter-btn" data-filter="late" onclick="setFilter('late')">Late</button>
                                <button class="filter-btn" data-filter="absent" onclick="setFilter('absent')">Absent</button>
                            </div>
                        </div>
                        
                        <div class="attendees-list-container" id="attendees-container">
                            <div class="loading-state">
                                <div class="spinner"></div>
                                <p>Loading attendees...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(liveAttendeesPopup);

    // Show popup with animation
    requestAnimationFrame(() => {
        liveAttendeesPopup.classList.add('show');
    });
}

// Current filter state
let currentFilter = 'all';

// Set filter for attendees
window.setFilter = function (filter) {
    currentFilter = filter;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Re-render with filter
    renderAttendees();
};

// Filter attendees by search
window.filterAttendees = function () {
    renderAttendees();
};

// Export attendees to CSV
window.exportAttendees = function () {
    if (allAttendeesData.length === 0) {
        alert('No attendees to export');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    let csv = 'Roll No,Name,Status,Check-in Time\n';

    allAttendeesData.forEach(({ rollNo, userName, data }) => {
        const status = data.status || 'present';
        const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A';
        csv += `"${rollNo || 'N/A'}","${userName}","${status}","${time}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${currentLocationName}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// Refresh QR code
window.refreshQRCode = function () {
    const btn = document.querySelector('.refresh-qr-btn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        btn.disabled = true;
    }

    setTimeout(() => {
        generateAttendanceQR(currentLocationId);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh QR';
            btn.disabled = false;
        }
    }, 500);
};

// Function to generate QR code for attendance
function generateAttendanceQR(locationId) {
    const qrContainer = document.getElementById('live-qr-code');
    if (!qrContainer) return;

    // Clear any existing QR code
    qrContainer.innerHTML = '';

    // Create QR data with location and timestamp
    const qrData = {
        type: 'attendance',
        locationId: locationId,
        timestamp: Date.now(),
        action: 'checkin'
    };

    // Generate QR code using QRCode.js
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: JSON.stringify(qrData),
            width: 300,
            height: 300,
            colorDark: "#1a1a2e",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        qrContainer.innerHTML = '<div class="qr-placeholder"><i class="fas fa-qrcode"></i><p>QR Library Not Loaded</p></div>';
    }
}

// Function to start listening for real-time attendance updates
function startAttendanceListener(locationId) {
    if (!firebase || !firebase.database) {
        console.error('Firebase not initialized');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const attendanceRef = firebase.database().ref(`attendance_by_location/${locationId}/${today}`);

    // Listen for new attendance records
    attendanceListener = attendanceRef.on('value', (snapshot) => {
        const attendanceData = snapshot.val() || {};
        processAttendanceData(attendanceData);
    });
}

// Process attendance data
function processAttendanceData(attendanceData) {
    const attendees = Object.entries(attendanceData);
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    // Update stats
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let recentCount = 0;

    attendees.forEach(([userId, data]) => {
        const status = data.status || 'present';
        if (status === 'absent') absentCount++;
        else if (status === 'late') lateCount++;
        else presentCount++;

        if (data.timestamp && data.timestamp > fiveMinutesAgo) recentCount++;
    });

    animateCounter('stat-present', presentCount);
    animateCounter('stat-late', lateCount);
    animateCounter('stat-absent', absentCount);
    animateCounter('stat-recent', recentCount);

    // Fetch user data and render
    const userPromises = attendees.map(([userId, data]) => {
        return firebase.database().ref(`users/${userId}`).once('value')
            .then(snapshot => {
                const userData = snapshot.val() || {};
                return {
                    userId,
                    data,
                    rollNo: userData.classRoll || userData.univRoll || userData.rollNo || null,
                    userName: userData.name || data.userName || 'Unknown Student',
                    section: userData.section || data.section || ''
                };
            })
            .catch(() => ({
                userId,
                data,
                rollNo: null,
                userName: data.userName || 'Unknown Student',
                section: data.section || ''
            }));
    });

    Promise.all(userPromises).then(attendeesWithData => {
        // Sort by timestamp (most recent first)
        attendeesWithData.sort((a, b) => (b.data.timestamp || 0) - (a.data.timestamp || 0));
        allAttendeesData = attendeesWithData;
        renderAttendees();
    });
}

// Animate counter
function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const current = parseInt(el.textContent) || 0;
    if (current === targetValue) return;

    el.classList.add('updating');
    el.textContent = targetValue;

    setTimeout(() => el.classList.remove('updating'), 300);
}

// Render attendees list
function renderAttendees() {
    const container = document.getElementById('attendees-container');
    if (!container) return;

    const searchTerm = (document.getElementById('attendee-search')?.value || '').toLowerCase();
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    let filtered = allAttendeesData.filter(({ data, rollNo, userName }) => {
        const status = data.status || 'present';

        // Apply status filter
        if (currentFilter !== 'all' && status !== currentFilter) return false;

        // Apply search filter
        if (searchTerm) {
            const searchStr = `${rollNo || ''} ${userName}`.toLowerCase();
            if (!searchStr.includes(searchTerm)) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-clock"></i>
                <p>${allAttendeesData.length === 0 ? 'Waiting for students to check in...' : 'No matching attendees found'}</p>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(({ userId, data, rollNo, userName, section }) => {
        const checkInTime = data.timestamp || Date.now();
        const timeAgo = getTimeAgo(checkInTime);
        const isRecent = checkInTime > fiveMinutesAgo;
        const status = data.status || 'present';

        let statusClass = 'status-present';
        let statusText = 'Present';
        let statusIcon = 'fa-check-circle';

        if (status === 'absent') {
            statusClass = 'status-absent';
            statusText = 'Absent';
            statusIcon = 'fa-times-circle';
        } else if (status === 'late') {
            statusClass = 'status-late';
            statusText = 'Late';
            statusIcon = 'fa-clock';
        }

        html += `
            <div class="attendee-card ${isRecent ? 'recent-entry' : ''}">
                <div class="attendee-avatar">
                    ${rollNo ? `<span>${rollNo}</span>` : `<i class="fas fa-user"></i>`}
                </div>
                <div class="attendee-details">
                    <div class="attendee-name">${userName}</div>
                    <div class="attendee-meta">
                        <span class="meta-item"><i class="fas fa-clock"></i> ${timeAgo}</span>
                        ${section ? `<span class="meta-item"><i class="fas fa-users"></i> ${section}</span>` : ''}
                    </div>
                </div>
                <div class="attendee-actions">
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </span>
                    <div class="action-dropdown">
                        <button class="dropdown-trigger" onclick="toggleActionMenu(this)">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="dropdown-menu">
                            ${status !== 'present' ? `<button onclick="updateAttendeeStatus('${userId}', 'present')"><i class="fas fa-check-circle"></i> Mark Present</button>` : ''}
                            ${status !== 'late' ? `<button onclick="updateAttendeeStatus('${userId}', 'late')"><i class="fas fa-clock"></i> Mark Late</button>` : ''}
                            ${status !== 'absent' ? `<button onclick="updateAttendeeStatus('${userId}', 'absent')"><i class="fas fa-times-circle"></i> Mark Absent</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Toggle action menu
window.toggleActionMenu = function (btn) {
    const menu = btn.nextElementSibling;
    const isOpen = menu.classList.contains('show');

    // Close all other menus
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));

    if (!isOpen) {
        menu.classList.add('show');
    }
};

// Update attendee status from popup
window.updateAttendeeStatus = function (userId, newStatus) {
    if (!currentLocationId) return;

    const today = new Date().toISOString().split('T')[0];

    // Update attendance_by_location
    firebase.database().ref(`attendance_by_location/${currentLocationId}/${today}/${userId}`).update({ status: newStatus });

    // Update user_attendance
    firebase.database().ref(`user_attendance/${userId}/${today}/${currentLocationId}`).update({ status: newStatus });

    // Close dropdown
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
};

// Function to close live attendees popup
window.closeLiveAttendees = function () {
    if (liveAttendeesPopup) {
        liveAttendeesPopup.classList.remove('show');

        setTimeout(() => {
            if (liveAttendeesPopup && liveAttendeesPopup.parentNode) {
                liveAttendeesPopup.parentNode.removeChild(liveAttendeesPopup);
            }
            liveAttendeesPopup = null;
        }, 300);
    }

    // Stop listening for attendance updates
    if (attendanceListener && currentLocationId) {
        const today = new Date().toISOString().split('T')[0];
        const attendanceRef = firebase.database().ref(`attendance_by_location/${currentLocationId}/${today}`);
        attendanceRef.off('value', attendanceListener);
        attendanceListener = null;
        currentLocationId = null;
        allAttendeesData = [];
    }

    // Clear remaining time interval
    if (remainingTimeInterval) {
        clearInterval(remainingTimeInterval);
        remainingTimeInterval = null;
    }
};

// Helper function to calculate time ago
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'Just now';
    }
}

// Toggle fullscreen
window.toggleFullscreen = function () {
    const icon = document.getElementById('fullscreen-icon');

    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            if (icon) icon.className = 'fas fa-compress';
        }).catch(err => console.log('Fullscreen error:', err));
    } else {
        document.exitFullscreen().then(() => {
            if (icon) icon.className = 'fas fa-expand';
        }).catch(err => console.log('Exit fullscreen error:', err));
    }
};

// Fetch location expiry time
function fetchLocationExpiry(locationId) {
    if (!firebase || !firebase.database) return;

    firebase.database().ref(`locations/${locationId}`).once('value').then(snapshot => {
        if (snapshot.exists()) {
            const location = snapshot.val();
            if (location.expiresAt) {
                locationExpiresAt = new Date(location.expiresAt).getTime();
                updateRemainingTime();
                remainingTimeInterval = setInterval(updateRemainingTime, 1000);
            } else {
                document.getElementById('remaining-time').textContent = 'No limit';
            }
        }
    }).catch(err => console.error('Error fetching location:', err));
}

// Update remaining time display
function updateRemainingTime() {
    const el = document.getElementById('remaining-time');
    if (!el || !locationExpiresAt) return;

    const now = Date.now();
    const diff = locationExpiresAt - now;

    if (diff <= 0) {
        el.textContent = 'Ended';
        el.style.color = '#ef4444';
        if (remainingTimeInterval) {
            clearInterval(remainingTimeInterval);
            remainingTimeInterval = null;
        }
        return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
        el.textContent = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        el.textContent = `${minutes}m ${seconds}s`;
    } else {
        el.textContent = `${seconds}s`;
        el.style.color = '#ef4444';
    }
}

// Close popup when clicking overlay
document.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('live-attendees-overlay')) {
        closeLiveAttendees();
    }

    // Close dropdown menus when clicking outside
    if (!e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    }
});

// Close popup with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && liveAttendeesPopup) {
        closeLiveAttendees();
    }
});

// Auto-refresh QR code every 5 minutes
setInterval(() => {
    if (currentLocationId && document.getElementById('live-qr-code')) {
        generateAttendanceQR(currentLocationId);
    }
}, 5 * 60 * 1000);

// Inject modern styles
const modernStyles = document.createElement('style');
modernStyles.id = 'live-attendees-modern-styles';
modernStyles.textContent = `
    .live-attendees-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
        padding: 0;
    }
    
    .live-attendees-overlay.show {
        opacity: 1;
    }
    
    .live-attendees-modal {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 0;
        width: 100%;
        height: 100vh;
        max-width: none;
        max-height: none;
        overflow: hidden;
        box-shadow: none;
        transform: translateY(20px);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
    }
    
    .live-attendees-overlay.show .live-attendees-modal {
        transform: translateY(0);
    }
    
    .modal-header-modern {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 24px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    
    .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .header-icon {
        width: 42px;
        height: 42px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
    }
    
    .header-text h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
    }
    
    .location-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.2);
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
        margin-top: 4px;
    }
    
    .header-right {
        display: flex;
        align-items: center;
        gap: 16px;
    }
    
    .time-remaining {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.15);
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 0.9rem;
    }
    
    .time-remaining i {
        color: rgba(255, 255, 255, 0.8);
    }
    
    .time-remaining strong {
        color: #ffffff;
        font-weight: 600;
    }
    
    .header-btn {
        width: 40px;
        height: 40px;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        color: white;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .header-btn:hover {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.05);
    }
    
    .header-btn.close-btn:hover {
        background: rgba(239, 68, 68, 0.8);
    }
    
    .modal-body-modern {
        padding: 0;
        overflow: hidden;
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    
    .stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    
    .stat-card.present .stat-icon { background: linear-gradient(135deg, #10b981, #059669); }
    .stat-card.late .stat-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
    .stat-card.absent .stat-icon { background: linear-gradient(135deg, #ef4444, #dc2626); }
    .stat-card.recent .stat-icon { background: linear-gradient(135deg, #667eea, #764ba2); }
    
    .stat-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: white;
        flex-shrink: 0;
    }
    
    .stat-content {
        display: flex;
        flex-direction: column;
    }
    
    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #ffffff !important;
        line-height: 1;
        transition: transform 0.3s ease;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .stat-value.updating {
        transform: scale(1.2);
        color: #a5b4fc !important;
    }
    
    .stat-label {
        font-size: 0.75rem;
        color: #e0e0e0 !important;
        margin-top: 4px;
        font-weight: 500;
    }
    
    .content-grid {
        display: grid;
        grid-template-columns: 450px 1fr;
        gap: 20px;
        flex: 1;
        padding: 20px;
        overflow: hidden;
    }
    
    .qr-panel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    
    .attendees-panel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    
    .panel-header {
        padding: 16px 20px;
        background: rgba(255, 255, 255, 0.05);
        color: white;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .header-with-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }
    
    .header-actions {
        display: flex;
        gap: 8px;
    }
    
    .action-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .action-btn:hover {
        background: #667eea;
        transform: scale(1.1);
    }
    
    .qr-container {
        padding: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        background: white;
        margin: 24px;
        border-radius: 20px;
        flex: 1;
    }
    
    .qr-hint {
        text-align: center;
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
        padding: 0 20px;
        margin: 0;
    }
    
    .refresh-qr-btn {
        display: block;
        width: calc(100% - 40px);
        margin: 16px 20px 20px;
        padding: 12px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        border: none;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .refresh-qr-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    
    .refresh-qr-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
    
    .search-filter-bar {
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .search-box {
        position: relative;
    }
    
    .search-box i {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(255, 255, 255, 0.4);
    }
    
    .search-box input {
        width: 100%;
        padding: 12px 12px 12px 42px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        color: white;
        font-size: 0.95rem;
        outline: none;
        transition: all 0.2s ease;
    }
    
    .search-box input::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }
    
    .search-box input:focus {
        border-color: #667eea;
        background: rgba(102, 126, 234, 0.1);
    }
    
    .filter-buttons {
        display: flex;
        gap: 8px;
    }
    
    .filter-btn {
        flex: 1;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .filter-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }
    
    .filter-btn.active {
        background: linear-gradient(135deg, #667eea, #764ba2);
        border-color: transparent;
        color: white;
    }
    
    .attendees-list-container {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
    }
    
    .empty-state, .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
    }
    
    .empty-state i, .loading-state i {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .attendee-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        margin-bottom: 8px;
        transition: all 0.2s ease;
    }
    
    .attendee-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.1);
    }
    
    .attendee-card.recent-entry {
        border-left: 3px solid #667eea;
        animation: slideIn 0.3s ease;
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    .attendee-avatar {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 0.9rem;
        flex-shrink: 0;
    }
    
    .attendee-details {
        flex: 1;
        min-width: 0;
    }
    
    .attendee-name {
        color: white;
        font-weight: 600;
        font-size: 0.95rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .attendee-meta {
        display: flex;
        gap: 12px;
        margin-top: 4px;
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    .attendee-actions {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 600;
    }
    
    .status-badge.status-present {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
    }
    
    .status-badge.status-late {
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
    }
    
    .status-badge.status-absent {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }
    
    .action-dropdown {
        position: relative;
    }
    
    .dropdown-trigger {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .dropdown-trigger:hover {
        background: rgba(255, 255, 255, 0.2);
        color: white;
    }
    
    .dropdown-menu {
        position: absolute;
        right: 0;
        top: 100%;
        margin-top: 8px;
        background: #1e1e3f;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 8px;
        min-width: 160px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.2s ease;
        z-index: 100;
    }
    
    .dropdown-menu.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }
    
    .dropdown-menu button {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.85rem;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s ease;
    }
    
    .dropdown-menu button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }
    
    .dropdown-menu button i {
        width: 16px;
        text-align: center;
    }
    
    @media (max-width: 900px) {
        .content-grid {
            grid-template-columns: 1fr;
        }
        
        .stats-row {
            grid-template-columns: repeat(2, 1fr);
        }
        
        .qr-panel {
            order: 2;
        }
    }
    
    @media (max-width: 600px) {
        .live-attendees-overlay {
            padding: 10px;
        }
        
        .modal-header-modern {
            padding: 16px 20px;
        }
        
        .header-icon {
            width: 44px;
            height: 44px;
            font-size: 18px;
        }
        
        .modal-body-modern {
            padding: 16px;
        }
        
        .stats-row {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
        
        .stat-card {
            padding: 14px;
        }
        
        .stat-icon {
            width: 40px;
            height: 40px;
            font-size: 16px;
        }
        
        .stat-value {
            font-size: 1.4rem;
        }
    }
`;

// Remove old styles if exist and add new ones
const oldStyles = document.getElementById('live-attendees-modern-styles');
if (oldStyles) oldStyles.remove();
document.head.appendChild(modernStyles);