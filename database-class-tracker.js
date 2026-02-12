// Database Class Tracker - Uses database to track displayed classes
document.addEventListener('DOMContentLoaded', function() {
    
    // Override class display function to use database tracking
    window.displayUniqueClasses = function(allLocations, nearbyLocations) {
        if (!window.currentUser) return;
        
        const userId = window.currentUser.uid;
        const today = new Date().toISOString().split('T')[0];
        const sessionKey = `${userId}_${today}`;
        
        let classesContainer = document.getElementById('classes-container');
        if (!classesContainer) {
            classesContainer = document.createElement('div');
            classesContainer.id = 'classes-container';
            classesContainer.className = 'classes-container';
            
            const locationInfo = document.getElementById('location-info');
            if (locationInfo && locationInfo.parentNode) {
                locationInfo.parentNode.insertBefore(classesContainer, locationInfo.nextSibling);
            } else {
                const captureBtn = document.getElementById('capture-btn');
                if (captureBtn && captureBtn.parentNode) {
                    captureBtn.parentNode.insertBefore(classesContainer, captureBtn);
                }
            }
        }
        
        // Clear existing classes
        const existingClasses = classesContainer.querySelectorAll('.class-item');
        existingClasses.forEach(item => item.remove());
        
        // Ensure title exists
        let titleDiv = classesContainer.querySelector('.classes-title');
        if (!titleDiv) {
            titleDiv = document.createElement('div');
            titleDiv.className = 'classes-title';
            titleDiv.innerHTML = '<i class="fas fa-chalkboard-teacher"></i> Available Classes for Attendance';
            classesContainer.appendChild(titleDiv);
        }
        
        // Get displayed classes and attendance data
        Promise.all([
            firebase.database().ref(`displayed_classes/${sessionKey}`).once('value'),
            firebase.database().ref('attendance').once('value')
        ]).then(([displayedSnapshot, attendanceSnapshot]) => {
            const displayedClasses = displayedSnapshot.exists() ? displayedSnapshot.val() : {};
            const allClassAttendance = attendanceSnapshot.exists() ? attendanceSnapshot.val() : {};
            
            // Remove duplicates by ID
            const uniqueLocations = [];
            const seenIds = new Set();
            
            allLocations.forEach(location => {
                if (!seenIds.has(location.id)) {
                    seenIds.add(location.id);
                    uniqueLocations.push(location);
                }
            });
            
            uniqueLocations.forEach(location => {
                // Skip if already displayed (tracked in database)
                if (displayedClasses[location.id]) {
                    return;
                }
                
                const alreadyAttended = allClassAttendance[location.id] && 
                                      allClassAttendance[location.id][today] && 
                                      allClassAttendance[location.id][today][userId];
                
                // Skip attended classes
                if (alreadyAttended) {
                    return;
                }
                
                const expiresAt = new Date(location.expiresAt);
                const now = new Date();
                const minutesRemaining = Math.floor((expiresAt - now) / 60000);
                
                // Skip expired classes
                if (minutesRemaining <= 0) {
                    return;
                }
                
                // Mark as displayed in database BEFORE showing
                firebase.database().ref(`displayed_classes/${sessionKey}/${location.id}`).set(true);
                
                const isNearby = nearbyLocations.some(nearby => nearby.id === location.id);
                const nearbyLocation = nearbyLocations.find(nearby => nearby.id === location.id);
                
                const classItem = document.createElement('div');
                classItem.className = `class-item ${isNearby ? 'nearby' : 'remote'}`;
                classItem.id = `class-item-${location.id}`;
                
                let statusText, statusClass, buttonText, buttonClass;
                
                if (isNearby) {
                    statusText = `Nearby (${Math.round(nearbyLocation.distance)}m)`;
                    statusClass = 'status-nearby';
                    buttonText = 'Mark Attendance';
                    buttonClass = 'nearby';
                } else {
                    statusText = 'Remote';
                    statusClass = 'status-remote';
                    buttonText = 'Mark Remote Attendance';
                    buttonClass = 'remote';
                }
                
                classItem.innerHTML = `
                    <div class="class-name">${location.name}</div>
                    <div class="class-details">
                        <div><i class="fas fa-clock"></i> Expires in: ${minutesRemaining} minutes</div>
                        <div><i class="fas fa-map-marker-alt"></i> Method: ${location.attendanceMethod === 'qr' ? 'QR Code + Location' : (location.attendanceMethod === 'code' ? 'Location + Code' : (location.attendanceMethod === 'face' ? 'Face Recognition + Location' : 'Location Only'))}</div>
                        ${isNearby ? `<div><i class="fas fa-route"></i> Distance: ${Math.round(nearbyLocation.distance)} meters</div>` : ''}
                    </div>
                    <span class="class-status ${statusClass}">${statusText}</span>
                    <button class="attendance-btn ${buttonClass}" 
                            data-location-id="${location.id}" 
                            data-is-nearby="${isNearby}"
                            data-requires-qr="${location.attendanceMethod === 'qr'}">
                        <i class="fas ${isNearby ? 'fa-map-marker-alt' : 'fa-wifi'}"></i> ${buttonText}
                    </button>
                    ${location.attendanceMethod === 'qr' && isNearby ? 
                        '<div class="qr-scanner-mini"><i class="fas fa-qrcode"></i> QR scanning will be required</div>' : ''}
                    ${location.attendanceMethod === 'code' && isNearby ? 
                        '<div class="code-entry-mini"><i class="fas fa-key"></i> Code entry will be required</div>' : ''}
                    ${location.attendanceMethod === 'face' && isNearby ? 
                        '<div class="qr-scanner-mini"><i class="fas fa-user-check"></i> Face verification will be required</div>' : ''}
                `;
                
                const attendanceBtn = classItem.querySelector('.attendance-btn');
                attendanceBtn.addEventListener('click', () => {
                    if (typeof window.handleClassAttendance === 'function') {
                        window.handleClassAttendance(location, isNearby);
                    }
                });
                
                classesContainer.appendChild(classItem);
            });
        }).catch((error) => {
            console.error("Error checking displayed classes:", error);
        });
    };
    
    // Override all display functions
    window.displayAllActiveClasses = window.displayUniqueClasses;
    window.updateAvailableClassesDynamically = window.displayUniqueClasses;
    window.updateAvailableClassesOptimized = window.displayUniqueClasses;
    
    // Clean up old displayed classes data daily
    const cleanupOldData = () => {
        if (!window.currentUser) return;
        
        const userId = window.currentUser.uid;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `${userId}_${yesterday.toISOString().split('T')[0]}`;
        
        firebase.database().ref(`displayed_classes/${yesterdayKey}`).remove();
    };
    
    // Clean up on page load
    setTimeout(cleanupOldData, 5000);
    
    console.log('Database Class Tracker initialized');
});
