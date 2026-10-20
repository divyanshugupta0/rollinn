// Location Features - Adds geolocation functionality
document.addEventListener('DOMContentLoaded', function() {
    // Add geolocation to attendance section
    enhanceAttendanceLocationForm();
    
    // Add geolocation to classes section
    enhanceClassLocationForm();
    
    // Enhance attendance location form
    function enhanceAttendanceLocationForm() {
        // Wait for modal to be created by attendance-manager.js
        const checkInterval = setInterval(() => {
            const form = document.getElementById('locationForm');
            if (form) {
                clearInterval(checkInterval);
                
                // Find the coordinates row
                const latInput = document.getElementById('latitude');
                const lngInput = document.getElementById('longitude');
                
                if (latInput && lngInput) {
                    const formRow = latInput.closest('.form-row');
                    
                    // Add fetch location button
                    const fetchBtn = document.createElement('button');
                    fetchBtn.type = 'button';
                    fetchBtn.className = 'fetch-location-btn';
                    fetchBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Current Location';
                    
                    // Insert after form row
                    formRow.insertAdjacentElement('afterend', fetchBtn);
                    
                    // Add event listener
                    fetchBtn.addEventListener('click', function() {
                        getCurrentLocation(latInput, lngInput);
                    });
                    
                    // Add map preview
                    const mapPreview = document.createElement('div');
                    mapPreview.className = 'map-preview';
                    mapPreview.id = 'locationMapPreview';
                    mapPreview.innerHTML = '<div class="map-placeholder">Location map will appear here after coordinates are set</div>';
                    
                    // Insert after fetch button
                    fetchBtn.insertAdjacentElement('afterend', mapPreview);
                    
                    // Update map when coordinates change
                    latInput.addEventListener('change', updateMapPreview);
                    lngInput.addEventListener('change', updateMapPreview);
                }
            }
        }, 500);
    }
    
    // Enhance class location form
    function enhanceClassLocationForm() {
        // Wait for modal to be created by class-manager.js
        const checkInterval = setInterval(() => {
            const form = document.getElementById('classForm');
            if (form) {
                clearInterval(checkInterval);
                
                // Find the room input
                const roomInput = document.getElementById('classRoom');
                
                if (roomInput) {
                    // Add location fields
                    const locationFields = document.createElement('div');
                    locationFields.className = 'form-row';
                    locationFields.innerHTML = `
                        <div class="form-group">
                            <label for="classLatitude"><i class="fas fa-map-pin"></i> Latitude</label>
                            <input type="number" id="classLatitude" class="form-control" step="0.000001" placeholder="e.g. 37.7749">
                        </div>
                        
                        <div class="form-group">
                            <label for="classLongitude"><i class="fas fa-map-pin"></i> Longitude</label>
                            <input type="number" id="classLongitude" class="form-control" step="0.000001" placeholder="e.g. -122.4194">
                        </div>
                    `;
                    
                    // Insert after room input
                    roomInput.closest('.form-group').insertAdjacentElement('afterend', locationFields);
                    
                    // Add fetch location button
                    const fetchBtn = document.createElement('button');
                    fetchBtn.type = 'button';
                    fetchBtn.className = 'fetch-location-btn';
                    fetchBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Get Current Location';
                    
                    // Insert after location fields
                    locationFields.insertAdjacentElement('afterend', fetchBtn);
                    
                    // Add event listener
                    fetchBtn.addEventListener('click', function() {
                        getCurrentLocation(
                            document.getElementById('classLatitude'), 
                            document.getElementById('classLongitude')
                        );
                    });
                    
                    // Add map preview
                    const mapPreview = document.createElement('div');
                    mapPreview.className = 'map-preview';
                    mapPreview.id = 'classMapPreview';
                    mapPreview.innerHTML = '<div class="map-placeholder">Location map will appear here after coordinates are set</div>';
                    
                    // Insert after fetch button
                    fetchBtn.insertAdjacentElement('afterend', mapPreview);
                    
                    // Update map when coordinates change
                    document.getElementById('classLatitude').addEventListener('change', function() {
                        updateMapPreview('classLatitude', 'classLongitude', 'classMapPreview');
                    });
                    document.getElementById('classLongitude').addEventListener('change', function() {
                        updateMapPreview('classLatitude', 'classLongitude', 'classMapPreview');
                    });
                    
                    // Modify save function to include location data
                    const originalSubmit = form.onsubmit;
                    form.onsubmit = function(e) {
                        // Add location data to form dataset
                        const lat = document.getElementById('classLatitude').value;
                        const lng = document.getElementById('classLongitude').value;
                        
                        if (lat && lng) {
                            form.dataset.latitude = lat;
                            form.dataset.longitude = lng;
                        }
                        
                        // Call original submit handler
                        if (originalSubmit) return originalSubmit.call(this, e);
                    };
                }
            }
        }, 500);
    }
    
    // Get current location
    function getCurrentLocation(latInput, lngInput) {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        
        // Show loading state
        latInput.disabled = true;
        lngInput.disabled = true;
        latInput.placeholder = 'Fetching...';
        lngInput.placeholder = 'Fetching...';
        
        navigator.geolocation.getCurrentPosition(
            // Success
            function(position) {
                latInput.value = position.coords.latitude;
                lngInput.value = position.coords.longitude;
                
                // Reset state
                latInput.disabled = false;
                lngInput.disabled = false;
                latInput.placeholder = 'e.g. 37.7749';
                lngInput.placeholder = 'e.g. -122.4194';
                
                // Update map
                const mapId = latInput.id === 'latitude' ? 'locationMapPreview' : 'classMapPreview';
                updateMapPreview(latInput.id, lngInput.id, mapId);
                
                // Show success message
                const alertElement = document.getElementById('attendanceAlert') || document.getElementById('classesAlert');
                if (alertElement) {
                    showAlert(alertElement, '<i class="fas fa-check-circle"></i> Location fetched successfully!', 'success');
                }
            },
            // Error
            function(error) {
                console.error('Error getting location:', error);
                
                // Reset state
                latInput.disabled = false;
                lngInput.disabled = false;
                latInput.placeholder = 'e.g. 37.7749';
                lngInput.placeholder = 'e.g. -122.4194';
                
                // Show error message
                const alertElement = document.getElementById('attendanceAlert') || document.getElementById('classesAlert');
                if (alertElement) {
                    showAlert(alertElement, `<i class="fas fa-exclamation-circle"></i> Error getting location: ${error.message}`, 'error');
                }
            },
            // Options
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }
    
    // Update map preview
    function updateMapPreview(latId, lngId, mapId) {
        // Handle both direct values and element IDs
        const lat = typeof latId === 'string' ? document.getElementById(latId).value : latId.value;
        const lng = typeof lngId === 'string' ? document.getElementById(lngId).value : lngId.value;
        const mapElement = typeof mapId === 'string' ? document.getElementById(mapId) : mapId;
        
        if (!lat || !lng || !mapElement) return;
        
        // Create static map URL (using OpenStreetMap)
        const zoom = 15;
        const width = 400;
        const height = 200;
        const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},red`;
        
        // Update map preview
        mapElement.innerHTML = `
            <img src="${mapUrl}" alt="Location Map" class="map-image">
            <div class="map-coordinates">
                <i class="fas fa-map-marker-alt"></i> ${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}
            </div>
        `;
    }
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .fetch-location-btn {
            background: linear-gradient(135deg, #ff7043, #f4511e);
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 10px 0;
            transition: all 0.3s ease;
            box-shadow: 0 4px 10px rgba(244, 81, 30, 0.2);
        }
        
        .fetch-location-btn:hover {
            background: linear-gradient(135deg, #f4511e, #e64a19);
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(244, 81, 30, 0.3);
        }
        
        .map-preview {
            margin: 15px 0;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            overflow: hidden;
            height: 200px;
            background-color: #f8f9fa;
        }
        
        .map-placeholder {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            font-style: italic;
            padding: 20px;
            text-align: center;
        }
        
        .map-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .map-coordinates {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(255, 255, 255, 0.8);
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 5px;
        }
    `;
    document.head.appendChild(style);
    
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