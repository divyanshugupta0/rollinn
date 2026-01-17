// Attendance Manager - Adds location/class management functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize attendance section
    initAttendanceSection();
    
    function initAttendanceSection() {
        const attendanceSection = document.getElementById('attendanceSection');
        if (!attendanceSection) return;
        
        // Add location/class management UI
        const locationManager = document.createElement('div');
        locationManager.className = 'location-manager';
        locationManager.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-map-marker-alt"></i> Manage Locations & Classes</h2>
                <button id="addLocationBtn" class="primary-btn"><i class="fas fa-plus"></i> Add New Location</button>
            </div>
            
            <div class="location-filters">
                <div class="form-group">
                    <input type="text" id="locationSearchInput" class="form-control" placeholder="Search locations...">
                </div>
                <div class="form-group">
                    <select id="locationStatusFilter" class="form-control">
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>
            
            <div id="locationsContainer" class="locations-container">
                <div class="loader-container">
                    <div class="loader"></div>
                </div>
            </div>
        `;
        
        // Insert after header
        const header = attendanceSection.querySelector('.header');
        if (header) {
            header.insertAdjacentElement('afterend', locationManager);
        } else {
            attendanceSection.appendChild(locationManager);
        }
        
        // Add location form modal
        const locationModal = document.createElement('div');
        locationModal.className = 'modal-overlay';
        locationModal.id = 'locationModal';
        locationModal.style.display = 'none';
        locationModal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="fas fa-map-marker-alt"></i> <span id="locationModalTitle">Add New Location</span></h3>
                    <button class="close-btn" id="closeLocationModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <form id="locationForm">
                        <div class="form-group">
                            <label for="locationName"><i class="fas fa-signature"></i> Location Name</label>
                            <input type="text" id="locationName" class="form-control" required placeholder="e.g. Room 101, Building A">
                        </div>
                        
                        <div class="form-group">
                            <label for="className"><i class="fas fa-book"></i> Class Name (Optional)</label>
                            <input type="text" id="className" class="form-control" placeholder="e.g. Mathematics, Physics">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="startTime"><i class="fas fa-clock"></i> Start Time</label>
                                <input type="time" id="startTime" class="form-control">
                            </div>
                            
                            <div class="form-group">
                                <label for="endTime"><i class="fas fa-clock"></i> End Time</label>
                                <input type="time" id="endTime" class="form-control">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="latitude"><i class="fas fa-map-pin"></i> Latitude</label>
                                <input type="number" id="latitude" class="form-control" step="0.000001" placeholder="e.g. 37.7749">
                            </div>
                            
                            <div class="form-group">
                                <label for="longitude"><i class="fas fa-map-pin"></i> Longitude</label>
                                <input type="number" id="longitude" class="form-control" step="0.000001" placeholder="e.g. -122.4194">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="locationRadius"><i class="fas fa-expand"></i> Radius (meters)</label>
                            <input type="number" id="locationRadius" class="form-control" value="100" min="10" max="1000">
                        </div>
                        
                        <div class="form-group">
                            <label for="expiryDate"><i class="fas fa-calendar-alt"></i> Expiry Date (Optional)</label>
                            <input type="date" id="expiryDate" class="form-control">
                        </div>
                        
                        <div class="form-group checkbox-group">
                            <input type="checkbox" id="locationActive" checked>
                            <label for="locationActive">Active</label>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="primary-btn" id="saveLocationBtn">
                                <i class="fas fa-save"></i> Save Location
                            </button>
                            <button type="button" class="secondary-btn" id="cancelLocationBtn">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(locationModal);
        
        // Add styles
        addStyles();
        
        // Add event listeners
        document.getElementById('addLocationBtn').addEventListener('click', showAddLocationModal);
        document.getElementById('closeLocationModal').addEventListener('click', hideLocationModal);
        document.getElementById('cancelLocationBtn').addEventListener('click', hideLocationModal);
        document.getElementById('locationForm').addEventListener('submit', saveLocation);
        document.getElementById('locationSearchInput').addEventListener('input', filterLocations);
        document.getElementById('locationStatusFilter').addEventListener('change', filterLocations);
        
        // Load locations
        loadLocations();
    }
    
    // Show add location modal
    function showAddLocationModal() {
        const modal = document.getElementById('locationModal');
        const form = document.getElementById('locationForm');
        const title = document.getElementById('locationModalTitle');
        
        // Reset form
        form.reset();
        form.dataset.mode = 'add';
        form.dataset.id = '';
        title.textContent = 'Add New Location';
        
        // Set default values
        document.getElementById('locationActive').checked = true;
        
        // Set minimum date to today
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        document.getElementById('expiryDate').min = formattedDate;
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Show edit location modal
    function showEditLocationModal(locationId) {
        const modal = document.getElementById('locationModal');
        const form = document.getElementById('locationForm');
        const title = document.getElementById('locationModalTitle');
        
        // Reset form
        form.reset();
        form.dataset.mode = 'edit';
        form.dataset.id = locationId;
        title.textContent = 'Edit Location';
        
        // Load location data
        firebase.database().ref('locations/' + locationId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    
                    // Fill form fields
                    document.getElementById('locationName').value = data.name || '';
                    document.getElementById('className').value = data.className || '';
                    document.getElementById('startTime').value = data.startTime || '';
                    document.getElementById('endTime').value = data.endTime || '';
                    document.getElementById('latitude').value = data.latitude || '';
                    document.getElementById('longitude').value = data.longitude || '';
                    document.getElementById('locationRadius').value = data.radius || 100;
                    
                    // Handle expiry date
                    if (data.expiresAt) {
                        const expiryDate = new Date(data.expiresAt);
                        const formattedDate = expiryDate.toISOString().split('T')[0];
                        document.getElementById('expiryDate').value = formattedDate;
                    }
                    
                    // Handle active status
                    document.getElementById('locationActive').checked = data.status !== 'inactive';
                    
                    // Show modal
                    modal.style.display = 'flex';
                } else {
                    showAlert(document.getElementById('attendanceAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Location not found', 'error');
                }
            })
            .catch((error) => {
                console.error('Error loading location:', error);
                showAlert(document.getElementById('attendanceAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error loading location: ' + error.message, 'error');
            });
    }
    
    // Hide location modal
    function hideLocationModal() {
        document.getElementById('locationModal').style.display = 'none';
    }
    
    // Save location
    function saveLocation(e) {
        e.preventDefault();
        
        const form = document.getElementById('locationForm');
        const mode = form.dataset.mode;
        const locationId = form.dataset.id || firebase.database().ref('locations').push().key;
        
        // Get form values
        const name = document.getElementById('locationName').value;
        const className = document.getElementById('className').value;
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const latitude = parseFloat(document.getElementById('latitude').value) || null;
        const longitude = parseFloat(document.getElementById('longitude').value) || null;
        const radius = parseInt(document.getElementById('locationRadius').value) || 100;
        const expiryDate = document.getElementById('expiryDate').value;
        const active = document.getElementById('locationActive').checked;
        
        // Prepare location data
        const locationData = {
            name: name,
            status: active ? 'active' : 'inactive',
            updatedAt: Date.now()
        };
        
        // Add optional fields if provided
        if (className) locationData.className = className;
        if (startTime) locationData.startTime = startTime;
        if (endTime) locationData.endTime = endTime;
        if (latitude !== null) locationData.latitude = latitude;
        if (longitude !== null) locationData.longitude = longitude;
        if (radius) locationData.radius = radius;
        
        // Handle expiry date
        if (expiryDate) {
            const expiryDateTime = new Date(expiryDate);
            expiryDateTime.setHours(23, 59, 59, 999); // End of day
            locationData.expiresAt = expiryDateTime.getTime();
        }
        
        // Add created timestamp for new locations
        if (mode === 'add') {
            locationData.createdAt = Date.now();
        }
        
        // Save to Firebase
        firebase.database().ref('locations/' + locationId).update(locationData)
            .then(() => {
                hideLocationModal();
                showAlert(document.getElementById('attendanceAlert'), 
                    `<i class="fas fa-check-circle"></i> Location ${mode === 'add' ? 'added' : 'updated'} successfully!`, 'success');
                loadLocations();
            })
            .catch((error) => {
                console.error('Error saving location:', error);
                showAlert(document.getElementById('attendanceAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error saving location: ' + error.message, 'error');
            });
    }
    
    // Load locations
    function loadLocations() {
        const locationsContainer = document.getElementById('locationsContainer');
        
        // Show loading indicator
        locationsContainer.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;
        
        // Load locations from Firebase
        firebase.database().ref('locations').once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locations = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const location = childSnapshot.val();
                        location.id = childSnapshot.key;
                        locations.push(location);
                    });
                    
                    // Sort locations by name
                    locations.sort((a, b) => {
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    
                    // Render locations
                    renderLocations(locations);
                } else {
                    locationsContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-map-marker-alt"></i>
                            <p>No locations found. Click "Add New Location" to create one.</p>
                        </div>
                    `;
                }
            })
            .catch((error) => {
                console.error('Error loading locations:', error);
                locationsContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Error loading locations: ${error.message}</p>
                    </div>
                `;
            });
    }
    
    // Render locations
    function renderLocations(locations) {
        const locationsContainer = document.getElementById('locationsContainer');
        const searchInput = document.getElementById('locationSearchInput').value.toLowerCase();
        const statusFilter = document.getElementById('locationStatusFilter').value;
        
        // Filter locations
        const filteredLocations = locations.filter(location => {
            const nameMatch = (location.name || '').toLowerCase().includes(searchInput) || 
                             (location.className || '').toLowerCase().includes(searchInput);
            
            const statusMatch = statusFilter === 'all' || 
                               (statusFilter === 'active' && location.status !== 'inactive') ||
                               (statusFilter === 'inactive' && location.status === 'inactive');
            
            return nameMatch && statusMatch;
        });
        
        // Check if any locations match filters
        if (filteredLocations.length === 0) {
            locationsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <p>No locations match your filters.</p>
                </div>
            `;
            return;
        }
        
        // Clear container
        locationsContainer.innerHTML = '';
        
        // Create location cards
        filteredLocations.forEach(location => {
            const now = new Date();
            const isExpired = location.expiresAt && now > new Date(location.expiresAt);
            const isActive = location.status !== 'inactive' && !isExpired;
            
            const card = document.createElement('div');
            card.className = `location-card ${isActive ? 'active' : 'inactive'}`;
            card.dataset.id = location.id;
            
            // Format times
            const timeDisplay = location.startTime && location.endTime ? 
                `${location.startTime} - ${location.endTime}` : 'No schedule set';
            
            // Format expiry
            let expiryDisplay = '';
            if (location.expiresAt) {
                const expiryDate = new Date(location.expiresAt);
                const formattedDate = expiryDate.toLocaleDateString();
                
                if (isExpired) {
                    expiryDisplay = `<div class="location-expired"><i class="fas fa-calendar-times"></i> Expired on ${formattedDate}</div>`;
                } else {
                    expiryDisplay = `<div class="location-expiry"><i class="fas fa-calendar-alt"></i> Expires on ${formattedDate}</div>`;
                }
            }
            
            // Format coordinates
            const coordinatesDisplay = location.latitude && location.longitude ? 
                `<div class="location-coordinates"><i class="fas fa-map-pin"></i> ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>` : '';
            
            card.innerHTML = `
                <div class="location-header">
                    <h3>${location.name || 'Unnamed Location'}</h3>
                    <div class="location-status ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </div>
                </div>
                <div class="location-body">
                    ${location.className ? `<div class="location-class"><i class="fas fa-book"></i> Class: ${location.className}</div>` : ''}
                    <div class="location-time"><i class="fas fa-clock"></i> ${timeDisplay}</div>
                    ${coordinatesDisplay}
                    ${expiryDisplay}
                </div>
                <div class="location-actions">
                    <button class="action-btn edit-btn" data-id="${location.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn take-attendance-btn" data-id="${location.id}">
                        <i class="fas fa-clipboard-check"></i> Take Attendance
                    </button>
                    <button class="action-btn delete-btn" data-id="${location.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            
            // Add event listeners
            card.querySelector('.edit-btn').addEventListener('click', function() {
                showEditLocationModal(this.dataset.id);
            });
            
            card.querySelector('.take-attendance-btn').addEventListener('click', function() {
                takeAttendanceForLocation(this.dataset.id);
            });
            
            card.querySelector('.delete-btn').addEventListener('click', function() {
                deleteLocation(this.dataset.id);
            });
            
            locationsContainer.appendChild(card);
        });
    }
    
    // Filter locations
    function filterLocations() {
        // Get all locations and apply filters
        firebase.database().ref('locations').once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locations = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const location = childSnapshot.val();
                        location.id = childSnapshot.key;
                        locations.push(location);
                    });
                    
                    renderLocations(locations);
                }
            });
    }
    
    // Take attendance for location
    function takeAttendanceForLocation(locationId) {
        // Load location data
        firebase.database().ref('locations/' + locationId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locationData = snapshot.val();
                    locationData.id = locationId;
                    
                    // Convert to class data format expected by existing code
                    const classData = {
                        id: locationId,
                        name: locationData.className || locationData.name,
                        location: locationData.name,
                        startTime: locationData.startTime,
                        endTime: locationData.endTime,
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        radius: locationData.radius,
                        locationData: locationData
                    };
                    
                    // Call existing selectClass function
                    if (typeof selectClass === 'function') {
                        selectClass(classData);
                    } else {
                        showAlert(document.getElementById('attendanceAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                } else {
                    showAlert(document.getElementById('attendanceAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Location not found', 'error');
                }
            })
            .catch((error) => {
                console.error('Error loading location for attendance:', error);
                showAlert(document.getElementById('attendanceAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error loading location: ' + error.message, 'error');
            });
    }
    
    // Delete location
    function deleteLocation(locationId) {
        if (confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
            firebase.database().ref('locations/' + locationId).remove()
                .then(() => {
                    showAlert(document.getElementById('attendanceAlert'), 
                        '<i class="fas fa-check-circle"></i> Location deleted successfully!', 'success');
                    loadLocations();
                })
                .catch((error) => {
                    console.error('Error deleting location:', error);
                    showAlert(document.getElementById('attendanceAlert'), 
                        '<i class="fas fa-exclamation-circle"></i> Error deleting location: ' + error.message, 'error');
                });
        }
    }
    
    // Add styles
    function addStyles() {
        if (document.getElementById('attendance-manager-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'attendance-manager-styles';
        style.textContent = `
            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .location-manager {
                background: white;
                border-radius: 16px;
                padding: 25px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
                border: 1px solid rgba(0, 0, 0, 0.05);
                margin-bottom: 25px;
            }
            
            .location-filters {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .location-filters .form-group {
                flex: 1;
            }
            
            .locations-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
            }
            
            .location-card {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                border: 1px solid rgba(0, 0, 0, 0.05);
                transition: all 0.3s ease;
            }
            
            .location-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
            }
            
            .location-card.inactive {
                opacity: 0.7;
            }
            
            .location-header {
                background: linear-gradient(135deg, #66bb6a, #43a047);
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .location-card.inactive .location-header {
                background: linear-gradient(135deg, #9e9e9e, #757575);
            }
            
            .location-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .location-status {
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .location-status.active {
                color: #e8f5e9;
            }
            
            .location-status.inactive {
                color: #ffebee;
            }
            
            .location-body {
                padding: 15px;
            }
            
            .location-class, .location-time, .location-coordinates, .location-expiry, .location-expired {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: #555;
            }
            
            .location-expired {
                color: #f44336;
            }
            
            .location-actions {
                display: flex;
                gap: 10px;
                padding: 15px;
                border-top: 1px solid #f1f3f5;
                background: #f8f9fa;
            }
            
            .action-btn {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                background: #e9ecef;
                color: #495057;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }
            
            .action-btn:hover {
                background: #dee2e6;
            }
            
            .edit-btn:hover {
                background: #e3f2fd;
                color: #1976d2;
            }
            
            .take-attendance-btn:hover {
                background: #e8f5e9;
                color: #2e7d32;
            }
            
            .delete-btn:hover {
                background: #ffebee;
                color: #d32f2f;
            }
            
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                backdrop-filter: blur(3px);
            }
            
            .modal-container {
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            }
            
            .modal-header {
                background: linear-gradient(135deg, #66bb6a, #43a047);
                color: white;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            .modal-header h3 {
                margin: 0;
                font-size: 20px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .close-btn {
                background: transparent;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s ease;
            }
            
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .modal-body {
                padding: 20px;
            }
            
            .form-row {
                display: flex;
                gap: 15px;
            }
            
            .form-row .form-group {
                flex: 1;
            }
            
            .modal-actions {
                display: flex;
                gap: 15px;
                margin-top: 20px;
            }
            
            .modal-actions button {
                flex: 1;
            }
            
            .secondary-btn {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                color: #495057;
                border: 1px solid #dee2e6;
                padding: 12px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .secondary-btn:hover {
                background: linear-gradient(135deg, #e9ecef, #dee2e6);
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            }
            
            @media (max-width: 768px) {
                .location-filters {
                    flex-direction: column;
                }
                
                .form-row {
                    flex-direction: column;
                }
                
                .locations-container {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Helper function to show alerts
    function showAlert(element, message, type) {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
});