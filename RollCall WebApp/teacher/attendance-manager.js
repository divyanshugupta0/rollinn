// Attendance Manager - Adds location/class management functionality
document.addEventListener('DOMContentLoaded', function() {
    const teacherSchoolId = () => typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.schoolId ? currentTeacher.schoolId : null;
    const belongsToTeacherSchool = record => !!teacherSchoolId() && record && record.schoolId === teacherSchoolId();
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
                    <div class="location-form-intro">Set the class section, attendance method, and geofence for this school location.</div>
                    <form id="locationForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="locationSection"><i class="fas fa-users"></i> Section</label>
                                <div class="location-section-picker">
                                    <select id="locationSection" class="form-control" aria-label="Choose a section">
                                        <option value="" selected disabled>Loading school sections…</option>
                                    </select>
                                    <button type="button" class="secondary-btn" id="addLocationSectionBtn">Add</button>
                                </div>
                                <small class="location-field-hint">Choose one or more sections. Select General to include all sections.</small>
                                <div id="locationSelectedSections" class="location-selected-sections" aria-live="polite"></div>
                            </div>
                            <div class="form-group">
                                <label for="attendanceMethod"><i class="fas fa-fingerprint"></i> Attendance method</label>
                                <select id="attendanceMethod" class="form-control">
                                    <option value="location">Location only</option>
                                    <option value="qr">QR code + location</option>
                                    <option value="code">Code + location</option>
                                    <option value="face">Face recognition + location</option>
                                    <option value="face_qr">Face + QR + location</option>
                                    <option value="face_code">Face + code + location</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="locationName"><i class="fas fa-signature"></i> Location name</label>
                            <input type="text" id="locationName" class="form-control" required placeholder="e.g. Room 101, Science Lab">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="locationRadius"><i class="fas fa-expand"></i> Radius (meters)</label>
                                <input type="number" id="locationRadius" class="form-control" value="100" min="10" max="1000" required>
                            </div>
                            <div class="form-group">
                                <label for="classDuration"><i class="fas fa-hourglass-half"></i> Class duration (minutes)</label>
                                <input type="number" id="classDuration" class="form-control" value="60" min="15" max="300" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="latitude"><i class="fas fa-map-pin"></i> Latitude</label>
                                <input type="number" id="latitude" class="form-control" step="any" min="-90" max="90" required placeholder="e.g. 28.6139">
                            </div>
                            <div class="form-group">
                                <label for="longitude"><i class="fas fa-map-pin"></i> Longitude</label>
                                <input type="number" id="longitude" class="form-control" step="any" min="-180" max="180" required placeholder="e.g. 77.2090">
                            </div>
                        </div>
                        <div class="mobile-location-tools">
                            <button type="button" class="secondary-btn" id="captureMobileLocationBtn"><i class="fas fa-location-arrow"></i> Use this device’s location</button>
                            <button type="button" class="secondary-btn" id="fetchSharedLocationBtn"><i class="fas fa-mobile-alt"></i> Fetch mobile coordinates</button>
                            <button type="button" class="secondary-btn" id="showLocationQrBtn"><i class="fas fa-qrcode"></i> Capture from another phone</button>
                            <span id="mobileLocationStatus" role="status" aria-live="polite">On a phone, allow location access when prompted.</span>
                        </div>
                        <div id="locationQrContainer" class="location-qr-container" hidden></div>
                        <div class="location-preview-panel">
                            <div class="location-preview-heading"><i class="fas fa-map-marked-alt"></i> Location preview</div>
                            <div id="teacherLocationMap" aria-label="Map preview of the attendance location"></div>
                            <small>Map shows the saved center point and attendance radius.</small>
                        </div>
                        <div class="form-group">
                            <label for="scheduledStart"><i class="fas fa-calendar-alt"></i> Scheduled start (optional)</label>
                            <input type="datetime-local" id="scheduledStart" class="form-control">
                            <small class="location-field-hint">Leave empty to activate immediately. The end time is calculated from class duration.</small>
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
        document.getElementById('captureMobileLocationBtn').addEventListener('click', captureMobileLocation);
        document.getElementById('fetchSharedLocationBtn').addEventListener('click', fetchSharedMobileCoordinates);
        document.getElementById('showLocationQrBtn').addEventListener('click', showMobileCaptureQr);
        document.getElementById('locationModal').addEventListener('click', event => {
            if (event.target.id === 'locationModal') hideLocationModal();
        });
        document.getElementById('addLocationSectionBtn').addEventListener('click', addLocationSection);
        document.getElementById('locationSelectedSections').addEventListener('click', removeLocationSection);
        document.getElementById('locationSearchInput').addEventListener('input', filterLocations);
        document.getElementById('locationStatusFilter').addEventListener('change', filterLocations);
        ['latitude', 'longitude', 'locationRadius'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateTeacherLocationMap);
            document.getElementById(id).addEventListener('change', updateTeacherLocationMap);
        });
        
        // Load locations
        loadLocationSections();
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
        form.dataset.existingCode = '';
        form.dataset.createdAt = '';
        form.dataset.createdBy = '';
        setLocationSections(['General']);
        document.getElementById('mobileLocationStatus').textContent = 'On a phone, allow location access when prompted.';
        document.getElementById('locationQrContainer').hidden = true;
        document.getElementById('locationQrContainer').replaceChildren();
        cleanupQrCapture();
        title.textContent = 'Add New Location';
        
        // Set default values
        document.getElementById('locationActive').checked = true;
        
        // Set minimum date to today
        document.getElementById('scheduledStart').min = new Date(Date.now() + 60000).toISOString().slice(0, 16);
        
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
                    if (!belongsToTeacherSchool(data)) {
                        showAlert(document.getElementById('attendanceAlert'), '<i class="fas fa-lock"></i> This location is not assigned to your school.', 'error');
                        return;
                    }
                    
                    // Fill form fields
                    document.getElementById('locationName').value = data.name || '';
                    const savedSections = Array.isArray(data.section) ? data.section : (data.section ? String(data.section).split(',').map(value => value.trim()) : ['General']);
                    savedSections.forEach(value => ensureLocationSectionOption(value));
                    setLocationSections(savedSections);
                    document.getElementById('attendanceMethod').value = data.attendanceMethod || 'location';
                    document.getElementById('classDuration').value = data.classDuration || 60;
                    document.getElementById('latitude').value = data.latitude || '';
                    document.getElementById('longitude').value = data.longitude || '';
                    document.getElementById('locationRadius').value = data.radius || 100;
                    if (data.scheduledStart) {
                        const scheduled = new Date(data.scheduledStart);
                        document.getElementById('scheduledStart').value = new Date(scheduled.getTime() - scheduled.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    }
                    
                    // Handle active status
                    document.getElementById('locationActive').checked = data.status !== 'inactive';
                    form.dataset.existingCode = data.attendanceCode || '';
                    form.dataset.createdAt = data.createdAt || '';
                    form.dataset.createdBy = data.createdBy || '';
                    
                    // Show modal
                    modal.style.display = 'flex';
                    setTimeout(updateTeacherLocationMap, 120);
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
        cleanupQrCapture();
    }

    function ensureLocationSectionOption(value) {
        const select = document.getElementById('locationSection');
        if (!select || !value || Array.from(select.options).some(option => option.value === value)) return;
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'General' ? 'General (all sections)' : (value.toLowerCase().startsWith('section ') ? value : `Section ${value}`);
        select.appendChild(option);
    }

    function loadLocationSections() {
        const select = document.getElementById('locationSection');
        if (!select) return;
        select.innerHTML = '<option value="" selected disabled>Select a section</option>';
        ensureLocationSectionOption('General');
        const schoolId = teacherSchoolId();
        if (!schoolId) return;
        Promise.all([
            firebase.database().ref(`schoolUsers/${schoolId}`).once('value'),
            firebase.database().ref(`schoolClasses/${schoolId}`).once('value')
        ]).then(([usersSnapshot, classesSnapshot]) => {
            const sections = new Set();
            if (usersSnapshot.exists()) usersSnapshot.forEach(child => {
                const user = child.val() || {};
                if ((!user.role || user.role === 'student') && user.section) sections.add(String(user.section).trim());
            });
            if (classesSnapshot.exists()) classesSnapshot.forEach(child => {
                const item = child.val() || {};
                if (item.section) (Array.isArray(item.section) ? item.section : String(item.section).split(',')).forEach(value => sections.add(String(value).trim()));
                else if (item.name) sections.add(String(item.name).trim());
            });
            Array.from(sections).filter(Boolean).sort((a, b) => a.localeCompare(b)).forEach(ensureLocationSectionOption);
        }).catch(error => {
            console.error('Error loading school sections:', error);
            document.getElementById('mobileLocationStatus').textContent = 'Could not load school sections. You can still choose General.';
        });
    }

    function getLocationSections() {
        return Array.from(document.querySelectorAll('#locationSelectedSections [data-section]')).map(chip => chip.dataset.section);
    }

    function setLocationSections(sections) {
        const container = document.getElementById('locationSelectedSections');
        const values = Array.from(new Set((sections || []).map(value => String(value).trim()).filter(Boolean)));
        const normalized = values.includes('General') ? ['General'] : values;
        container.replaceChildren();
        if (!normalized.length) {
            const empty = document.createElement('span');
            empty.className = 'location-section-empty';
            empty.textContent = 'No sections selected';
            container.appendChild(empty);
            return;
        }
        normalized.forEach(value => {
            const chip = document.createElement('span');
            chip.className = 'location-section-chip';
            chip.dataset.section = value;
            const label = document.createElement('span');
            label.textContent = value === 'General' ? 'General · All sections' : (value.toLowerCase().startsWith('section ') ? value : `Section ${value}`);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.setAttribute('aria-label', `Remove ${label.textContent}`);
            remove.textContent = '×';
            chip.append(label, remove);
            container.appendChild(chip);
        });
    }

    function addLocationSection() {
        const value = document.getElementById('locationSection').value;
        if (!value) return;
        const current = getLocationSections();
        setLocationSections(value === 'General' ? ['General'] : current.filter(section => section !== 'General').concat(value));
    }

    function removeLocationSection(event) {
        const chip = event.target.closest('[data-section]');
        if (!chip) return;
        setLocationSections(getLocationSections().filter(value => value !== chip.dataset.section));
    }

    function captureMobileLocation() {
        const button = document.getElementById('captureMobileLocationBtn');
        const status = document.getElementById('mobileLocationStatus');
        if (!navigator.geolocation) {
            status.textContent = 'Location is not supported by this browser. Enter coordinates manually.';
            return;
        }
        button.disabled = true;
        status.textContent = 'Getting your device location…';
        navigator.geolocation.getCurrentPosition(position => {
            document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
            document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
            status.textContent = `Coordinates captured (±${Math.round(position.coords.accuracy)} m accuracy).`;
            updateTeacherLocationMap();
            button.disabled = false;
        }, error => {
            const messages = {
                1: 'Location permission was denied. Allow it in your browser settings and try again.',
                2: 'Your device could not determine its location. Try again outdoors or enter coordinates manually.',
                3: 'Location request timed out. Try again.'
            };
            status.textContent = messages[error.code] || 'Could not get your location. Enter coordinates manually.';
            button.disabled = false;
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }

    let teacherLocationMap = null;
    let teacherLocationCircle = null;
    let teacherLocationMarker = null;
    let qrCaptureRef = null;
    function updateTeacherLocationMap() {
        const mapElement = document.getElementById('teacherLocationMap');
        if (!mapElement || !window.L) return;
        if (!teacherLocationMap) {
            teacherLocationMap = L.map(mapElement, { zoomControl: true, scrollWheelZoom: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(teacherLocationMap);
        }
        const lat = parseFloat(document.getElementById('latitude').value);
        const lng = parseFloat(document.getElementById('longitude').value);
        const radius = Math.max(10, parseFloat(document.getElementById('locationRadius').value) || 100);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const center = [lat, lng];
        if (!teacherLocationMarker) teacherLocationMarker = L.marker(center).addTo(teacherLocationMap);
        else teacherLocationMarker.setLatLng(center);
        if (!teacherLocationCircle) teacherLocationCircle = L.circle(center, { radius, color: '#16704c', fillColor: '#46a77b', fillOpacity: .16 }).addTo(teacherLocationMap);
        else { teacherLocationCircle.setLatLng(center); teacherLocationCircle.setRadius(radius); }
        teacherLocationMap.setView(center, 17);
        setTimeout(() => teacherLocationMap.invalidateSize(), 80);
    }

    function fetchSharedMobileCoordinates() {
        const status = document.getElementById('mobileLocationStatus');
        status.textContent = 'Checking for coordinates shared from a mobile device…';
        firebase.database().ref('mobileCoordinates').once('value').then(snapshot => {
            const coords = snapshot.val();
            if (!coords || !Number.isFinite(Number(coords.latitude)) || !Number.isFinite(Number(coords.longitude))) {
                status.textContent = 'No shared coordinates found. Use this device or generate a capture QR.';
                return;
            }
            setLocationCoordinates(coords.latitude, coords.longitude, 'Mobile coordinates fetched.');
        }).catch(error => {
            console.error('Unable to fetch mobile coordinates:', error);
            status.textContent = 'Could not fetch shared coordinates. Check your connection and try again.';
        });
    }

    function setLocationCoordinates(latitude, longitude, message) {
        document.getElementById('latitude').value = Number(latitude).toFixed(6);
        document.getElementById('longitude').value = Number(longitude).toFixed(6);
        document.getElementById('mobileLocationStatus').textContent = message;
        updateTeacherLocationMap();
    }

    function showMobileCaptureQr() {
        const container = document.getElementById('locationQrContainer');
        const status = document.getElementById('mobileLocationStatus');
        if (!window.QRCode) { status.textContent = 'QR generator did not load. Use this device’s location instead.'; return; }
        cleanupQrCapture();
        const captureRef = firebase.database().ref('locations').push();
        const captureId = captureRef.key;
        const bytes = new Uint8Array(18);
        window.crypto.getRandomValues(bytes);
        const token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        qrCaptureRef = firebase.database().ref(`locations/${captureId}`);
        qrCaptureRef.set({ qrCapture: true, qrToken: token, schoolId: teacherSchoolId(), createdBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null, createdAt: Date.now() })
            .then(() => {
                container.replaceChildren();
                const captureUrl = new URL('../location/location-qr-new.html', window.location.href);
                captureUrl.searchParams.set('token', token);
                captureUrl.searchParams.set('locationId', captureId);
                new QRCode(container, { text: captureUrl.href, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.H });
                container.hidden = false;
                status.textContent = 'Scan the QR with the phone that will capture the location.';
                qrCaptureRef.child('coordinates').on('value', snapshot => {
                    const coords = snapshot.val();
                    if (!coords || coords.token !== token) return;
                    setLocationCoordinates(coords.latitude, coords.longitude, `Phone coordinates captured (±${Math.round(Number(coords.accuracy) || 0)} m accuracy).`);
                    cleanupQrCapture();
                    container.hidden = true;
                });
            }).catch(error => {
                console.error('Unable to create mobile capture QR:', error);
                status.textContent = 'Could not create the QR capture. Try the device location button.';
            });
    }

    function cleanupQrCapture() {
        if (!qrCaptureRef) return;
        qrCaptureRef.child('coordinates').off();
        qrCaptureRef.remove().catch(error => console.warn('Could not remove temporary QR capture:', error));
        qrCaptureRef = null;
    }
    
    // Save location
    function saveLocation(e) {
        e.preventDefault();
        
        const form = document.getElementById('locationForm');
        const mode = form.dataset.mode;
        const locationId = form.dataset.id || firebase.database().ref('locations').push().key;
        
        // Get form values
        const name = document.getElementById('locationName').value;
        const sections = getLocationSections();
        const attendanceMethod = document.getElementById('attendanceMethod').value;
        const classDuration = parseInt(document.getElementById('classDuration').value, 10);
        const latitude = parseFloat(document.getElementById('latitude').value);
        const longitude = parseFloat(document.getElementById('longitude').value);
        const radius = parseInt(document.getElementById('locationRadius').value, 10);
        const scheduledValue = document.getElementById('scheduledStart').value;
        const active = document.getElementById('locationActive').checked;

        if (!teacherSchoolId()) {
            showAlert(document.getElementById('attendanceAlert'), '<i class="fas fa-lock"></i> Assign this teacher to a school before managing locations.', 'error');
            return;
        }
        if (!name.trim() || !sections.length || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(radius) || radius < 10 || radius > 1000 || !Number.isFinite(classDuration) || classDuration < 15 || classDuration > 300) {
            showAlert(document.getElementById('attendanceAlert'), '<i class="fas fa-exclamation-circle"></i> Select at least one section and enter valid coordinates, a 10–1000 m radius, and a 15–300 minute duration.', 'error');
            return;
        }
        const now = Date.now();
        const scheduledStart = scheduledValue ? new Date(scheduledValue).getTime() : now;
        if (!Number.isFinite(scheduledStart) || (scheduledValue && scheduledStart <= now)) {
            showAlert(document.getElementById('attendanceAlert'), '<i class="fas fa-exclamation-circle"></i> Scheduled start must be in the future.', 'error');
            return;
        }
        const expiresAt = new Date(scheduledStart + classDuration * 60000).toISOString();
        
        // Prepare location data
        const locationData = {
            name: name,
            status: active ? 'active' : 'inactive',
            updatedAt: new Date(now).toISOString(),
            schoolId: teacherSchoolId(),
            createdBy: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null,
            section: sections.length === 1 ? sections[0] : sections,
            attendanceMethod,
            classDuration,
            expiresAt,
            scheduledStart: scheduledValue ? new Date(scheduledStart).toISOString() : null,
            latitude,
            longitude,
            radius
        };
        if (attendanceMethod === 'code') {
            locationData.attendanceCode = form.dataset.existingCode || String(Math.floor(100000 + Math.random() * 900000));
        } else locationData.attendanceCode = null;
        
        // Add created timestamp for new locations
        if (mode === 'add') {
            locationData.createdAt = Date.now();
        }

        if (mode === 'edit') {
            locationData.createdAt = Number(form.dataset.createdAt) || now;
            locationData.createdBy = form.dataset.createdBy || locationData.createdBy;
        }
        
        // Save to Firebase
        Promise.all([
            firebase.database().ref('locations/' + locationId).update(locationData),
            firebase.database().ref(`schoolLocations/${teacherSchoolId()}/${locationId}`).set(Object.assign({ id: locationId }, locationData))
        ])
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
        if (!teacherSchoolId()) { locationsContainer.innerHTML = '<div class="empty-state">Assign a school to this teacher account to view locations.</div>'; return; }
        firebase.database().ref(`schoolLocations/${teacherSchoolId()}`).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locations = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const location = childSnapshot.val();
                        location.id = childSnapshot.key;
                        if (belongsToTeacherSchool(location)) locations.push(location);
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
            const sections = Array.isArray(location.section) ? location.section.join(' ') : (location.section || '');
            const nameMatch = (location.name || '').toLowerCase().includes(searchInput) || 
                             (location.className || '').toLowerCase().includes(searchInput) || sections.toLowerCase().includes(searchInput);
            
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
            const timeDisplay = location.scheduledStart
                ? new Date(location.scheduledStart).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                : (location.startTime && location.endTime ? `${location.startTime} - ${location.endTime}` : 'Starts immediately');
            
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
            const coordinatesDisplay = Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)) ?
                `<div class="location-coordinates"><i class="fas fa-map-pin"></i> ${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}</div>` : '';
            const sectionDisplay = Array.isArray(location.section) ? location.section.join(', ') : (location.section || '');
            const methodNames = { location: 'Location only', qr: 'QR + location', code: 'Code + location', face: 'Face + location', face_qr: 'Face + QR + location', face_code: 'Face + code + location' };
            
            card.innerHTML = `
                <div class="location-header">
                    <h3>${location.name || 'Unnamed Location'}</h3>
                    <div class="location-status ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </div>
                </div>
                <div class="location-body">
                    ${sectionDisplay ? `<div class="location-class"><i class="fas fa-users"></i> Section: ${sectionDisplay}</div>` : ''}
                    <div class="location-class"><i class="fas fa-fingerprint"></i> ${methodNames[location.attendanceMethod] || 'Location only'} · ${location.classDuration || 60} min</div>
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
        if (!teacherSchoolId()) return;
        firebase.database().ref(`schoolLocations/${teacherSchoolId()}`).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const locations = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const location = childSnapshot.val();
                        location.id = childSnapshot.key;
                        if (belongsToTeacherSchool(location)) locations.push(location);
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
                    if (!belongsToTeacherSchool(locationData)) throw new Error('This location is not assigned to your school.');
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
            firebase.database().ref('locations/' + locationId).once('value').then(snapshot => {
                if (!snapshot.exists() || !belongsToTeacherSchool(snapshot.val())) throw new Error('This location is not assigned to your school.');
                return Promise.all([firebase.database().ref('locations/' + locationId).remove(), firebase.database().ref(`schoolLocations/${teacherSchoolId()}/${locationId}`).remove()]);
            })
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
                border-radius: 18px;
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                border: 1px solid #e2ebe5;
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
                padding: 24px;
            }

            .location-form-intro {
                margin: 0 0 20px;
                padding: 13px 15px;
                border-radius: 10px;
                background: #f1f8f3;
                color: #486256;
                font-size: 13px;
                line-height: 1.5;
            }

            .mobile-location-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: -2px 0 17px; }
            .mobile-location-tools button { padding: 10px 14px; }
            .mobile-location-tools button:disabled { opacity: .65; cursor: wait; }
            #mobileLocationStatus { color: #718078; font-size: 12px; line-height: 1.4; }
            .location-preview-panel { overflow: hidden; border: 1px solid #e1e9e3; border-radius: 12px; background: #f8fbf9; }
            .location-preview-heading { padding: 11px 13px; color: #34463d; font-size: 13px; font-weight: 700; }
            #teacherLocationMap { width: 100%; height: 220px; background: #edf3ef; }
            .location-preview-panel > small { display: block; padding: 9px 12px; color: #718078; font-size: 11px; }
            .location-qr-container { justify-self: center; padding: 12px; border: 1px solid #e1e9e3; border-radius: 12px; background: #fff; }

            #locationForm .form-group { min-width: 0; margin-bottom: 16px; }
            #locationForm label { display: block; margin: 0 0 7px; color: #34463d; font-weight: 650; font-size: 13px; }
            #locationForm .form-control { width: 100%; min-height: 44px; border: 1px solid #dce6df; border-radius: 9px; padding: 10px 12px; background: #fff; color: #1d2e25; box-sizing: border-box; }
            #locationForm .form-control:focus { outline: 3px solid rgba(29, 116, 78, .14); border-color: #1d744e; }
            .location-field-hint { display: block; margin-top: 6px; color: #718078; font-size: 12px; line-height: 1.45; }
            .location-section-picker { display: flex; gap: 8px; align-items: stretch; }
            .location-section-picker select { flex: 1; min-width: 0; }
            .location-selected-sections { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
            .location-section-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; background: #eaf5ee; color: #176443; font-size: 12px; font-weight: 650; }
            .location-section-chip button { border: 0; background: transparent; color: inherit; font-size: 17px; line-height: 1; cursor: pointer; padding: 0; }
            .location-section-empty { color: #7b8981; font-size: 12px; }
            #locationForm .checkbox-group { display: flex; align-items: center; gap: 9px; }
            #locationForm .checkbox-group label { margin: 0; }
            #locationForm .checkbox-group input { width: 17px; height: 17px; accent-color: #16704c; }

            @media (max-width: 600px) {
                .modal-overlay { align-items: flex-end; padding: 0; }
                .modal-container { width: 100%; max-width: none; max-height: 94vh; border-radius: 18px 18px 0 0; }
                .modal-body { padding: 18px; }
                .form-row { flex-direction: column; gap: 0; }
                .modal-actions { flex-direction: column; }
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
