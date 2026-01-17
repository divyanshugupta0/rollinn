// Dynamic Class Loader - Prevents full page reload and maintains scroll position
document.addEventListener('DOMContentLoaded', function() {
    let currentPosition = null;
    let lastLocationUpdate = 0;
    let availableClasses = new Map(); // Store classes to prevent duplicates
    let scrollPosition = 0;
    
    // Override the original findNearbyLocationsWithProximity function
    if (typeof window.findNearbyLocationsWithProximity === 'function') {
        window.originalFindNearbyLocationsWithProximity = window.findNearbyLocationsWithProximity;
    }
    
    // Enhanced location checking with dynamic updates
    window.findNearbyLocationsWithProximity = function(lat, lng) {
        if (!lat || !lng) {
            console.log("No location data available");
            return;
        }

        // Store current scroll position
        scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        // Throttle location updates to prevent excessive calls
        const now = Date.now();
        if (now - lastLocationUpdate < 5000) { // 5 second throttle
            return;
        }
        lastLocationUpdate = now;

        currentPosition = { lat, lng };
        
        // Get all locations without reloading the entire interface
        const locationsRef = window.ref(window.database, 'locations');
        
        window.get(locationsRef)
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locations = snapshot.val();
                    let nearbyLocations = [];
                    let allActiveLocations = [];
                    
                    console.log("Found " + Object.keys(locations).length + " locations to check");
                    
                    const now = new Date();
                    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
                    console.log(`Device type: ${isMobile ? 'Mobile' : 'Desktop'}`);
                    
                    // Check each location
                    for (const id in locations) {
                        const location = locations[id];
                        
                        if (!location.latitude || !location.longitude || !location.radius) {
                            console.log(`Location ${location.name} is missing required fields`);
                            continue;
                        }
                        
                        const expiresAt = new Date(location.expiresAt || now);
                        if (now > expiresAt) {
                            console.log(`Location ${location.name} has expired`);
                            continue;
                        }
                        
                        const distance = calculateDistance(
                            lat, lng, 
                            location.latitude, location.longitude
                        );
                        
                        let adjustedRadius = location.radius;
                        
                        if (isMobile) {
                            if (location.radius < 50) {
                                adjustedRadius = location.radius * 3;
                            } else if (location.radius < 100) {
                                adjustedRadius = location.radius * 2.5;
                            } else if (location.radius < 200) {
                                adjustedRadius = location.radius * 2;
                            } else {
                                adjustedRadius = location.radius * 1.5;
                            }
                        }
                        
                        let isNearby = distance <= adjustedRadius;
                        let confidence = 'low';
                        
                        if (isNearby) {
                            const confidenceThreshold1 = isMobile ? 0.6 : 0.5;
                            const confidenceThreshold2 = isMobile ? 0.9 : 0.8;
                            
                            if (distance <= adjustedRadius * confidenceThreshold1) {
                                confidence = 'high';
                            } else if (distance <= adjustedRadius * confidenceThreshold2) {
                                confidence = 'medium';
                            }
                            
                            nearbyLocations.push({ 
                                ...location, 
                                id,
                                distance,
                                confidence,
                                attendanceMethod: location.attendanceMethod || 'location'
                            });
                        }
                        
                        allActiveLocations.push({
                            ...location,
                            id,
                            distance,
                            isNearby,
                            confidence: isNearby ? confidence : 'remote',
                            attendanceMethod: location.attendanceMethod || 'location'
                        });
                    }
                    
                    nearbyLocations.sort((a, b) => a.distance - b.distance);
                    
                    // Update classes dynamically without full reload
                    updateAvailableClassesDynamically(allActiveLocations, nearbyLocations);
                    
                    // Update location badges
                    updateLocationBadges(nearbyLocations);
                }
            })
            .catch((error) => {
                console.error("Error checking locations:", error);
                updateLocationBadges([]);
            });
    };
    
    // Dynamic class update function
    function updateAvailableClassesDynamically(allLocations, nearbyLocations) {
        let classesContainer = document.getElementById('classes-container');
        
        if (!classesContainer) {
            // Create container if it doesn't exist
            classesContainer = createClassesContainer();
        }
        
        // Get today's date for attendance checking
        const today = new Date().toISOString().split('T')[0];
        
        // Check attendance for all classes
        const attendanceRef = window.ref(window.database, `user_attendance/${window.currentUser?.uid}/${today}`);
        window.get(attendanceRef)
            .then((attendanceSnapshot) => {
                const allClassAttendance = attendanceSnapshot.exists() ? attendanceSnapshot.val() : {};
                
                // Remove duplicates by location ID
                const uniqueLocations = allLocations.filter((location, index, self) => 
                    index === self.findIndex(l => l.id === location.id)
                );
                
                console.log(`Updating ${uniqueLocations.length} unique classes dynamically`);
                
                // Update or add each class
                uniqueLocations.forEach(location => {
                    updateOrAddClassItem(location, nearbyLocations, allClassAttendance, today);
                });
                
                // Remove expired classes
                removeExpiredClasses(uniqueLocations);
                
                // Restore scroll position
                setTimeout(() => {
                    window.scrollTo(0, scrollPosition);
                }, 100);
            })
            .catch((error) => {
                console.error("Error checking today's attendance:", error);
            });
    }
    
    // Create classes container
    function createClassesContainer() {
        const classesContainer = document.createElement('div');
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
        
        // Add title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'classes-title';
        titleDiv.innerHTML = '<i class="fas fa-chalkboard-teacher"></i> Available Classes for Attendance';
        classesContainer.appendChild(titleDiv);
        
        return classesContainer;
    }
    
    // Update or add individual class item
    function updateOrAddClassItem(location, nearbyLocations, allClassAttendance, today) {
        const classesContainer = document.getElementById('classes-container');
        let classItem = document.getElementById(`class-item-${location.id}`);
        
        const isNearby = nearbyLocations.some(nearby => nearby.id === location.id);
        const nearbyLocation = nearbyLocations.find(nearby => nearby.id === location.id);
        
        const alreadyAttended = window.attendedClasses && window.attendedClasses.has(location.id);
        
        // Calculate expiration time
        const expiresAt = new Date(location.expiresAt);
        const now = new Date();
        const minutesRemaining = Math.floor((expiresAt - now) / 60000);
        
        // Skip if class has expired
        if (minutesRemaining <= 0) {
            if (classItem) {
                classItem.remove();
            }
            return;
        }
        
        // Determine status and button properties
        let statusText, statusClass, buttonText, buttonClass, buttonDisabled;
        
        if (alreadyAttended) {
            statusText = 'Attended';
            statusClass = 'status-attended';
            buttonText = 'Already Marked';
            buttonClass = '';
            buttonDisabled = true;
        } else if (isNearby) {
            statusText = `Nearby (${Math.round(nearbyLocation.distance)}m)`;
            statusClass = 'status-nearby';
            buttonText = 'Mark Attendance';
            buttonClass = 'nearby';
            buttonDisabled = false;
        } else {
            statusText = 'Remote';
            statusClass = 'status-remote';
            buttonText = 'Mark Remote Attendance';
            buttonClass = 'remote';
            buttonDisabled = false;
        }
        
        if (classItem) {
            // Update existing class item and ensure visibility
            classItem.style.opacity = '1';
            classItem.style.visibility = 'visible';
            classItem.style.display = 'block';
            updateExistingClassItem(classItem, location, statusText, statusClass, buttonText, buttonClass, buttonDisabled, minutesRemaining, isNearby, nearbyLocation);
        } else {
            // Create new class item
            classItem = createNewClassItem(location, statusText, statusClass, buttonText, buttonClass, buttonDisabled, minutesRemaining, isNearby, nearbyLocation);
            classesContainer.appendChild(classItem);
        }
        
        // Store in available classes map
        availableClasses.set(location.id, {
            element: classItem,
            location: location,
            lastUpdate: Date.now()
        });
    }
    
    // Update existing class item
    function updateExistingClassItem(classItem, location, statusText, statusClass, buttonText, buttonClass, buttonDisabled, minutesRemaining, isNearby, nearbyLocation) {
        // Update class type
        classItem.className = `class-item ${isNearby ? 'nearby' : 'remote'}`;
        
        // Update status
        const statusSpan = classItem.querySelector('.class-status');
        if (statusSpan) {
            statusSpan.className = `class-status ${statusClass}`;
            statusSpan.textContent = statusText;
        }
        
        // Update time remaining
        const timeDiv = classItem.querySelector('.class-details div:first-child');
        if (timeDiv) {
            timeDiv.innerHTML = `<i class="fas fa-clock"></i> Expires in: ${minutesRemaining} minutes`;
        }
        
        // Update distance if nearby
        const distanceDiv = classItem.querySelector('.distance-display');
        if (isNearby && nearbyLocation) {
            if (distanceDiv) {
                distanceDiv.innerHTML = `<div><i class="fas fa-route"></i> Distance: ${Math.round(nearbyLocation.distance)} meters</div>`;
            } else {
                const classDetails = classItem.querySelector('.class-details');
                const newDistanceDiv = document.createElement('div');
                newDistanceDiv.className = 'distance-display';
                newDistanceDiv.innerHTML = `<div><i class="fas fa-route"></i> Distance: ${Math.round(nearbyLocation.distance)} meters</div>`;
                classDetails.appendChild(newDistanceDiv);
            }
        } else if (distanceDiv) {
            distanceDiv.remove();
        }
        
        // Update button
        const button = classItem.querySelector('.attendance-btn');
        if (button) {
            button.className = `attendance-btn ${buttonClass}`;
            button.innerHTML = `<i class="fas ${buttonDisabled ? 'fa-check' : (isNearby ? 'fa-map-marker-alt' : 'fa-wifi')}"></i> ${buttonText}`;
            button.disabled = buttonDisabled;
        }
        
        // Update QR scanner notice
        const qrNotice = classItem.querySelector('.qr-scanner-mini');
        if (location.attendanceMethod === 'qr' && isNearby && !buttonDisabled) {
            if (!qrNotice) {
                const newQrNotice = document.createElement('div');
                newQrNotice.className = 'qr-scanner-mini';
                newQrNotice.innerHTML = '<i class="fas fa-qrcode"></i> QR scanning will be required';
                button.insertAdjacentElement('afterend', newQrNotice);
            }
        } else if (qrNotice) {
            qrNotice.remove();
        }
    }
    
    // Create new class item
    function createNewClassItem(location, statusText, statusClass, buttonText, buttonClass, buttonDisabled, minutesRemaining, isNearby, nearbyLocation) {
        const classItem = document.createElement('div');
        classItem.id = `class-item-${location.id}`;
        classItem.className = `class-item ${isNearby ? 'nearby' : 'remote'}`;
        
        // Ensure proper visibility
        classItem.style.opacity = '1';
        classItem.style.visibility = 'visible';
        classItem.style.display = 'block';
        
        classItem.innerHTML = `
            <div class="class-name">${location.name}</div>
            <div class="class-details">
                <div><i class="fas fa-clock"></i> Expires in: ${minutesRemaining} minutes</div>
                <div><i class="fas fa-map-marker-alt"></i> Method: ${location.attendanceMethod === 'qr' ? 'QR Code + Location' : 'Location Only'}</div>
                ${isNearby ? `<div class="distance-display"><div><i class="fas fa-route"></i> Distance: ${Math.round(nearbyLocation.distance)} meters</div></div>` : ''}
            </div>
            <span class="class-status ${statusClass}">${statusText}</span>
            <button class="attendance-btn ${buttonClass}" 
                    data-location-id="${location.id}" 
                    data-is-nearby="${isNearby}"
                    data-requires-qr="${location.attendanceMethod === 'qr'}"
                    ${buttonDisabled ? 'disabled' : ''}>
                <i class="fas ${buttonDisabled ? 'fa-check' : (isNearby ? 'fa-map-marker-alt' : 'fa-wifi')}"></i> ${buttonText}
            </button>
            ${location.attendanceMethod === 'qr' && isNearby && !buttonDisabled ? 
                '<div class="qr-scanner-mini"><i class="fas fa-qrcode"></i> QR scanning will be required</div>' : ''}
        `;
        
        // Add click event for attendance button
        const attendanceBtn = classItem.querySelector('.attendance-btn');
        if (!buttonDisabled) {
            attendanceBtn.addEventListener('click', () => {
                if (typeof window.handleClassAttendance === 'function') {
                    window.handleClassAttendance(location, isNearby);
                }
            });
        }
        
        return classItem;
    }
    
    // Remove expired classes
    function removeExpiredClasses(currentLocations) {
        const currentLocationIds = new Set(currentLocations.map(loc => loc.id));
        
        // Remove classes that are no longer in the current locations
        availableClasses.forEach((classData, locationId) => {
            if (!currentLocationIds.has(locationId)) {
                if (classData.element && classData.element.parentNode) {
                    classData.element.remove();
                }
                availableClasses.delete(locationId);
            }
        });
    }
    
    // Update location badges
    function updateLocationBadges(nearbyLocations) {
        const locationBadge = document.getElementById('location-badge');
        const methodBadge = document.getElementById('method-badge');
        
        if (locationBadge) {
            if (nearbyLocations.length > 0) {
                locationBadge.className = 'badge badge-success';
                locationBadge.textContent = `${nearbyLocations.length} Class${nearbyLocations.length > 1 ? 'es' : ''} Nearby`;
            } else {
                locationBadge.className = 'badge badge-warning';
                locationBadge.textContent = 'No Classes Nearby';
            }
        }
        
        if (methodBadge) {
            if (nearbyLocations.length > 0) {
                methodBadge.textContent = 'Select Class Below';
                methodBadge.className = 'badge badge-info';
            } else {
                methodBadge.textContent = 'Remote Attendance Available';
                methodBadge.className = 'badge badge-info';
            }
        }
        
        // Hide main capture button
        const captureBtn = document.getElementById('capture-btn');
        if (captureBtn) {
            captureBtn.style.display = 'none';
        }
        
        // Hide scanner container
        const scannerContainer = document.getElementById('scanner-container');
        if (scannerContainer) {
            scannerContainer.classList.add('hidden');
        }
        
        // Stop camera if active
        if (typeof window.stopCamera === 'function') {
            window.stopCamera();
        }
    }
    
    // Enhanced position update function
    if (typeof window.updatePosition === 'function') {
        window.originalUpdatePosition = window.updatePosition;
    }
    
    window.updatePosition = function(position) {
        // Call original function first
        if (typeof window.originalUpdatePosition === 'function') {
            window.originalUpdatePosition(position);
        }
        
        // Then call our enhanced location checking
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Update position display
        const currentLatitude = document.getElementById('current-latitude');
        const currentLongitude = document.getElementById('current-longitude');
        const locationInfo = document.getElementById('location-info');
        
        if (currentLatitude) currentLatitude.textContent = `Latitude: ${lat.toFixed(6)}`;
        if (currentLongitude) currentLongitude.textContent = `Longitude: ${lng.toFixed(6)}`;
        if (locationInfo) locationInfo.classList.remove('hidden');
        
        // Call enhanced location checking
        window.findNearbyLocationsWithProximity(lat, lng);
        
        // Hide status message
        const locationStatus = document.getElementById('location-status');
        if (locationStatus) {
            locationStatus.classList.add('hidden');
        }
    };
    
    // Prevent scroll to top on class updates
    function preventScrollToTop() {
        // Override any functions that might cause scroll to top
        const originalScrollTo = window.scrollTo;
        let scrollLocked = false;
        
        window.lockScroll = function() {
            scrollLocked = true;
            setTimeout(() => {
                scrollLocked = false;
            }, 1000);
        };
        
        window.scrollTo = function(x, y) {
            if (scrollLocked && y === 0) {
                return; // Prevent scroll to top when locked
            }
            originalScrollTo.call(window, x, y);
        };
    }
    
    // Initialize scroll prevention
    preventScrollToTop();
    
    console.log('Dynamic Class Loader initialized - Classes will update without full reload');
});