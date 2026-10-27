// Attendance Manager - Adds location/class management functionality
document.addEventListener('DOMContentLoaded', function() {
    const teacherSchoolId = () => typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.schoolId ? currentTeacher.schoolId : null;
    const belongsToTeacherSchool = record => !!teacherSchoolId() && record && record.schoolId === teacherSchoolId();
    const rosterPageSize = 20;
    let rosterCurrentPage = 1;

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    window.isSchoolModeActive = function() {
        return document.body.classList.contains('teacher-school-mode') || 
               (typeof currentTeacher !== 'undefined' && currentTeacher && (currentTeacher.isSchoolMode || currentTeacher.institutionType === 'school'));
    };

    // Initialize attendance section
    initAttendanceSection();
    
    function initAttendanceSection() {
        const attendanceSection = document.getElementById('attendanceSection');
        if (!attendanceSection) return;
        
        const isSchool = window.isSchoolModeActive();

        // Add location/class management UI
        const locationManager = document.createElement('div');
        locationManager.className = 'location-manager';
        locationManager.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-${isSchool ? 'clipboard-check' : 'map-marker-alt'}"></i> <span id="attendanceSectionHeading">${isSchool ? 'Class Attendance' : 'Manage Locations & Classes'}</span></h2>
                <button id="addLocationBtn" class="primary-btn" style="${isSchool ? 'display:none;' : ''}"><i class="fas fa-plus"></i> Add New Location</button>
            </div>
            
            <div class="location-filters" style="${isSchool ? 'display:none;' : ''}">
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
        document.getElementById('addLocationBtn')?.addEventListener('click', showAddLocationModal);
        document.getElementById('closeLocationModal')?.addEventListener('click', hideLocationModal);
        document.getElementById('cancelLocationBtn')?.addEventListener('click', hideLocationModal);
        document.getElementById('locationForm')?.addEventListener('submit', saveLocation);
        document.getElementById('captureMobileLocationBtn')?.addEventListener('click', captureMobileLocation);
        document.getElementById('fetchSharedLocationBtn')?.addEventListener('click', fetchSharedMobileCoordinates);
        document.getElementById('showLocationQrBtn')?.addEventListener('click', showMobileCaptureQr);
        document.getElementById('locationModal')?.addEventListener('click', event => {
            if (event.target.id === 'locationModal') hideLocationModal();
        });
        document.getElementById('addLocationSectionBtn')?.addEventListener('click', addLocationSection);
        document.getElementById('locationSelectedSections')?.addEventListener('click', removeLocationSection);
        document.getElementById('locationSearchInput')?.addEventListener('input', filterLocations);
        document.getElementById('locationStatusFilter')?.addEventListener('change', filterLocations);
        ['latitude', 'longitude', 'locationRadius'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateTeacherLocationMap);
                el.addEventListener('change', updateTeacherLocationMap);
            }
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
    
    // Load locations (or auto-generated class cards for school mode)
    function loadLocations() {
        if (typeof window.isSchoolModeActive === 'function' && window.isSchoolModeActive()) {
            return window.loadSchoolClassCards();
        }

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

    // Auto-generate class cards for School Mode
    window.loadSchoolClassCards = async function(customDate) {
        const locationsContainer = document.getElementById('locationsContainer');
        if (!locationsContainer) return;

        // Ensure school mode styles and UI are applied
        document.body.classList.add('teacher-school-mode');
        const headingSpan = document.getElementById('attendanceSectionHeading');
        if (headingSpan) headingSpan.textContent = 'Class Attendance';
        const headingH2 = document.querySelector('.location-manager .section-header h2');
        if (headingH2) headingH2.innerHTML = '<i class="fas fa-clipboard-check"></i> <span id="attendanceSectionHeading">Class Attendance</span>';
        const addBtn = document.getElementById('addLocationBtn');
        if (addBtn) addBtn.style.display = 'none';
        const filterBoxes = document.querySelectorAll('.location-filters, .location-manager .location-filters');
        filterBoxes.forEach(box => { box.style.display = 'none'; });

        locationsContainer.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;

        const schoolId = teacherSchoolId();
        if (!schoolId) {
            locationsContainer.innerHTML = '<div class="empty-state">Assign a school to this teacher account to view classes.</div>';
            return;
        }

        try {
            // Query relevant records
            const [scopedSnap, legacySnap, classesSnap, coursesSnap, usersSnap] = await Promise.all([
                firebase.database().ref(`classTeacherAssignmentsByClass/${schoolId}`).once('value'),
                firebase.database().ref(`classTeacherAssignments/${schoolId}`).once('value'),
                firebase.database().ref(`schoolClasses/${schoolId}`).once('value'),
                firebase.database().ref(`courses/${schoolId}`).once('value'),
                firebase.database().ref(`schoolUsers/${schoolId}`).once('value')
            ]);

            const scopedAssignments = scopedSnap.val() || {};
            const legacyAssignments = legacySnap.val() || {};
            const schoolClasses = classesSnap.val() || {};
            const courses = coursesSnap.val() || {};
            const allStudents = [];
            if (usersSnap.exists()) {
                usersSnap.forEach(s => {
                    const st = s.val();
                    st.id = s.key;
                    const role = String(st.role || '').toLowerCase();
                    if (!role || role === 'student') allStudents.push(st);
                });
            }

            const teacherId = typeof currentTeacher !== 'undefined' && currentTeacher ? (currentTeacher.id || currentTeacher.uid) : '';
            const teacherEmail = typeof currentTeacher !== 'undefined' && currentTeacher ? (currentTeacher.email || '') : '';

            // Clean section string helper: e.g. "Section A" -> "A", "b" -> "B"
            function normalizeSec(sec) {
                return String(sec || '').trim().replace(/^section\s+/i, '').toUpperCase();
            }

            // Collect all assigned classes and sections for this teacher without duplicates
            const classSectionMap = new Map();

            function addOrUpdateSection(classId, className, rawSec, year) {
                const sec = normalizeSec(rawSec);
                if (!sec) return;

                let clsName = String(className || '').trim();
                if (!clsName || clsName.toLowerCase() === 'class') {
                    clsName = courses[classId]?.courseName || schoolClasses[classId]?.className || currentTeacher?.assignedClass || currentTeacher?.className || '';
                }

                // Check if an entry for this section already exists
                let existingKey = null;
                for (const [key, existing] of classSectionMap.entries()) {
                    if (normalizeSec(existing.section) === sec) {
                        const existingIsGeneric = !existing.className || existing.className.toLowerCase() === 'class';
                        const incomingIsGeneric = !clsName || clsName.toLowerCase() === 'class';
                        
                        // Same classId or one/both have generic class name, or same class name
                        if ((existing.classId && classId && String(existing.classId) === String(classId)) ||
                            existingIsGeneric || incomingIsGeneric ||
                            existing.className.toLowerCase() === clsName.toLowerCase()) {
                            existingKey = key;
                            break;
                        }
                    }
                }

                if (existingKey) {
                    const existing = classSectionMap.get(existingKey);
                    // Upgrade generic or missing values with more specific ones
                    if (!existing.classId && classId) existing.classId = classId;
                    if ((!existing.className || existing.className.toLowerCase() === 'class') && clsName && clsName.toLowerCase() !== 'class') {
                        existing.className = clsName;
                    }
                    if (!existing.year && year) existing.year = year;
                } else {
                    const finalClassName = (clsName && clsName.toLowerCase() !== 'class') ? clsName : 'Class';
                    const canonicalKey = `${(classId || finalClassName).toLowerCase()}_${sec.toLowerCase()}`;
                    classSectionMap.set(canonicalKey, {
                        classId: classId || '',
                        className: finalClassName,
                        section: sec,
                        year: year || ''
                    });
                }
            }

            // 1. Profile classTeacherClassSections
            const profileScopes = Array.isArray(currentTeacher?.classTeacherClassSections) ? currentTeacher.classTeacherClassSections : [];
            profileScopes.forEach(item => {
                if (!item || !item.section) return;
                const classId = item.classId || '';
                const className = item.className || (courses[classId]?.courseName) || (schoolClasses[classId]?.className) || '';
                addOrUpdateSection(classId, className, item.section, item.year);
            });

            // 2. classTeacherAssignmentsByClass
            Object.entries(scopedAssignments).forEach(([clsId, sections]) => {
                Object.entries(sections || {}).forEach(([secKey, assignment]) => {
                    if (!assignment || assignment.teacherId !== teacherId) return;
                    const className = assignment.className || (courses[clsId]?.courseName) || (schoolClasses[clsId]?.className) || '';
                    addOrUpdateSection(clsId, className, assignment.section || secKey, assignment.year);
                });
            });

            // 3. Legacy classTeacherAssignments (only adds if not already present or upgrades)
            Object.entries(legacyAssignments).forEach(([secKey, assignment]) => {
                if (!assignment || assignment.teacherId !== teacherId) return;
                addOrUpdateSection('', assignment.className || '', assignment.section || secKey, assignment.year || '');
            });

            // 4. Assigned sections from profile
            const profileSections = [
                ...(Array.isArray(currentTeacher?.classTeacherSections) ? currentTeacher.classTeacherSections : [currentTeacher?.classTeacherSections]),
                ...(Array.isArray(currentTeacher?.assignedSections) ? currentTeacher.assignedSections : [currentTeacher?.assignedSections]),
                currentTeacher?.classTeacherSection
            ].filter(Boolean);

            profileSections.forEach(sec => {
                addOrUpdateSection(currentTeacher?.classId || '', currentTeacher?.assignedClass || currentTeacher?.className || '', sec, '');
            });

            // 5. Fallback from schoolClasses if still empty
            if (classSectionMap.size === 0) {
                Object.entries(schoolClasses).forEach(([clsId, clsData]) => {
                    if (clsData.teacherId === teacherId || clsData.teacherEmail === teacherEmail) {
                        const secs = Array.isArray(clsData.sections) ? clsData.sections : (clsData.section ? [clsData.section] : ['A']);
                        secs.forEach(sec => {
                            addOrUpdateSection(clsId, clsData.className || clsData.name || '', sec, '');
                        });
                    }
                });
            }

            // Generate class cards - ensure no duplicate sections
            const classCards = [];
            window._teacherClassCardsMap = {};
            const finalCardsMap = new Map();

            classSectionMap.forEach((item) => {
                const normSec = normalizeSec(item.section);
                const safeClassId = (item.classId || item.className).replace(/[^a-zA-Z0-9_-]/g, '_');
                const safeSec = normSec.replace(/[^a-zA-Z0-9_-]/g, '_');
                const cardId = `ct_${safeClassId}_${safeSec}`;

                // Calculate enrolled students in this section
                const matchingStudents = allStudents.filter(st => {
                    const sSec = normalizeSec(st.section || st.classSection || st.assignedSection);
                    if (normSec && sSec && sSec !== normSec) return false;
                    if (item.classId && st.classId && String(st.classId) !== String(item.classId)) return false;
                    return true;
                });

                const card = {
                    id: cardId,
                    classId: item.classId,
                    className: item.className,
                    section: normSec,
                    year: item.year,
                    name: `${item.className} · Section ${normSec}`,
                    location: `${item.className} · Section ${normSec}`,
                    studentCount: matchingStudents.length,
                    isSchoolClass: true,
                    schoolId: schoolId
                };

                // Deduplicate by section: if duplicate section, prioritize the one with a specific class name
                const dedupeKey = `${item.className.toLowerCase()}_${normSec}`;
                const secOnlyKey = `${normSec}`;

                // If secOnlyKey exists with generic 'Class' and this one has a specific class name, replace it
                if (finalCardsMap.has(secOnlyKey)) {
                    const existing = finalCardsMap.get(secOnlyKey);
                    if (existing.className.toLowerCase() === 'class' && item.className.toLowerCase() !== 'class') {
                        finalCardsMap.delete(secOnlyKey);
                        finalCardsMap.set(dedupeKey, card);
                        return;
                    }
                }

                if (!finalCardsMap.has(dedupeKey)) {
                    finalCardsMap.set(dedupeKey, card);
                }
            });

            finalCardsMap.forEach(card => {
                classCards.push(card);
                window._teacherClassCardsMap[card.id] = card;
            });

            window._teacherClassCards = classCards;

            // Check submitted status for the selected date
            const dateInput = document.getElementById('attendanceFilterDate');
            const selectedDate = customDate || (dateInput?.value ? formatDateForDatabase(new Date(dateInput.value)) : formatDateForDatabase(new Date()));

            const submittedAttendances = {};
            const promises = classCards.map(c => {
                return firebase.database().ref(`attendance_by_location/${c.id}/${selectedDate}`).once('value')
                    .then(snap => {
                        if (snap.exists()) submittedAttendances[c.id] = snap.val();
                    })
                    .catch(() => {});
            });

            await Promise.all(promises);
            window.submittedAttendances = submittedAttendances;

            window.renderSchoolClassCards(classCards, submittedAttendances);

        } catch (error) {
            console.error('Error loading school class cards:', error);
            locationsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error loading classes: ${error.message}</p></div>`;
        }
    };

    // Render School Mode Class Cards
    window.renderSchoolClassCards = function(classCards, submittedAttendances) {
        const locationsContainer = document.getElementById('locationsContainer');
        if (!locationsContainer) return;

        // Ensure school mode UI state
        document.body.classList.add('teacher-school-mode');
        const addBtn = document.getElementById('addLocationBtn');
        if (addBtn) addBtn.style.display = 'none';
        const filterBoxes = document.querySelectorAll('.location-filters, .location-manager .location-filters');
        filterBoxes.forEach(box => { box.style.display = 'none'; });

        if (!classCards || classCards.length === 0) {
            locationsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chalkboard-teacher"></i>
                    <p>No class teacher sections assigned to your account yet.</p>
                    <small>Contact your school administrator to assign your class and section.</small>
                </div>
            `;
            return;
        }

        locationsContainer.innerHTML = '';

        classCards.forEach(card => {
            const hasSubmitted = submittedAttendances && submittedAttendances[card.id] !== undefined;
            const cardElem = document.createElement('div');
            cardElem.className = `location-card school-class-card ${hasSubmitted ? 'submitted' : 'pending'}`;
            cardElem.dataset.id = card.id;

            cardElem.innerHTML = `
                <div class="location-header">
                    <h3><i class="fas fa-chalkboard"></i> ${escapeHtml(card.className)} · Section ${escapeHtml(card.section)}</h3>
                    <div class="location-status ${hasSubmitted ? 'active' : 'inactive'}">
                        ${hasSubmitted 
                            ? '<i class="fas fa-check-circle"></i> Submitted' 
                            : '<i class="fas fa-clock"></i> Pending'}
                    </div>
                </div>
                <div class="location-body">
                    <div class="location-class"><i class="fas fa-users"></i> ${card.studentCount} Students Enrolled</div>
                    <div class="location-time"><i class="fas fa-calendar-day"></i> Daily Attendance Sheet</div>
                </div>
                <div class="location-actions">
                    ${hasSubmitted ? 
                        `<button type="button" class="action-btn modify-btn" data-id="${card.id}">
                            <i class="fas fa-edit"></i> Edit Attendance
                        </button>
                        <button type="button" class="action-btn view-btn" data-id="${card.id}">
                            <i class="fas fa-eye"></i> View Attendance
                        </button>` : 
                        `<button type="button" class="action-btn take-attendance-btn" data-id="${card.id}">
                            <i class="fas fa-clipboard-check"></i> Take Attendance
                        </button>`
                    }
                </div>
            `;

            if (hasSubmitted) {
                cardElem.querySelector('.modify-btn')?.addEventListener('click', function() {
                    window.openSchoolClassAttendance(this.dataset.id, true);
                });
                cardElem.querySelector('.view-btn')?.addEventListener('click', function() {
                    window.openSchoolClassAttendance(this.dataset.id, false);
                });
            } else {
                cardElem.querySelector('.take-attendance-btn')?.addEventListener('click', function() {
                    window.openSchoolClassAttendance(this.dataset.id, true);
                });
            }

            locationsContainer.appendChild(cardElem);
        });
    };

    // Open School Class Attendance Sheet
    window.openSchoolClassAttendance = async function(cardId, editable = true) {
        const card = window._teacherClassCardsMap?.[cardId];
        if (!card) {
            console.error('Card not found for id:', cardId);
            return;
        }

        currentClassData = card;

        const popup = document.getElementById('attendancePopup');
        if (!popup) return;
        popup.style.display = 'flex';
        popup.classList.add('ap-school-mode');
        document.body.classList.add('teacher-school-mode');

        // Update popup titles
        const popupTitle = document.getElementById('attendancePopupTitle');
        if (popupTitle) {
            popupTitle.innerHTML = `<i class="fas fa-school" style="margin-right:6px;color:#a7f3d0;"></i> ${escapeHtml(card.name)} <span style="font-size:12px;font-weight:500;opacity:0.85;margin-left:6px;">Section: ${escapeHtml(card.section || 'A')}</span>`;
        }
        const popupName = document.getElementById('popupClassName');
        if (popupName) popupName.textContent = card.name;
        const popupLoc = document.getElementById('popupClassLocation');
        if (popupLoc) popupLoc.innerHTML = `<i class="fas fa-users"></i> Section: ${card.section} · ${card.className}`;
        const popupTime = document.getElementById('popupClassTime');
        if (popupTime) popupTime.innerHTML = `<i class="fas fa-calendar-day"></i> Daily Attendance Sheet`;

        // Date setup
        const filterDateInput = document.getElementById('attendanceFilterDate');
        const popupDateInput = document.getElementById('popupAttendanceDate');
        const todayStr = formatDateForDatabase(new Date());
        const selectedDate = filterDateInput?.value ? formatDateForDatabase(new Date(filterDateInput.value)) : todayStr;
        if (popupDateInput) {
            popupDateInput.value = selectedDate;
            popupDateInput.max = todayStr;
        }

        // Hide redundant workspace tools in school mode
        const workspaceTools = document.getElementById('rcSessionStats');
        if (workspaceTools) workspaceTools.style.display = 'none';

        // Load students and roster
        window.loadSchoolAttendanceSheet(card, selectedDate, editable);
    };

    // Load students for school attendance sheet
    window.loadSchoolAttendanceSheet = async function(card, selectedDate, editable = true) {
        const popupStudentList = document.getElementById('popupStudentList');
        const loadingAnimation = document.getElementById('attendancePopupLoadingAnimation');
        const submitBtn = document.getElementById('submitAttendancePopupBtn');
        const attendanceSummary = document.getElementById('attendanceSummary');

        if (loadingAnimation) {
            loadingAnimation.classList.add('active');
            loadingAnimation.style.display = 'flex';
        }
        if (popupStudentList) popupStudentList.style.display = 'none';
        if (attendanceSummary) attendanceSummary.style.display = 'none';

        try {
            rosterCurrentPage = 1;
            const schoolId = teacherSchoolId();
            const snap = await firebase.database().ref(`schoolUsers/${schoolId}`).once('value');
            const normSec = String(card.section || '').trim().replace(/^section\s+/i, '').toLowerCase();

            students = [];
            if (snap.exists()) {
                snap.forEach(child => {
                    const st = child.val();
                    const key = child.key;
                    if (!key || key === 'undefined' || key === 'null' || !key.trim() || !st) return;
                    st.id = key;
                    const role = String(st.role || '').toLowerCase();
                    if (role && role !== 'student') return;

                    const sSec = String(st.section || st.classSection || st.assignedSection || '').trim().replace(/^section\s+/i, '').toLowerCase();
                    if (normSec && sSec && sSec !== normSec) return;
                    if (card.classId && st.classId && String(st.classId) !== String(card.classId)) return;

                    students.push(st);
                });
            }

            // Sort students ascending by Roll Number (numeric first, then alphanumeric)
            const parseRollNumber = (item) => {
                const raw = item?.classRoll ?? item?.rollNo ?? item?.roll ?? '';
                const str = String(raw).trim();
                const num = parseInt(str.replace(/\D+/g, ''), 10);
                return {
                    num: isNaN(num) ? Infinity : num,
                    str: str.toLowerCase()
                };
            };

            students.sort((a, b) => {
                const pa = parseRollNumber(a);
                const pb = parseRollNumber(b);
                if (pa.num !== pb.num) return pa.num - pb.num;
                if (pa.str && pb.str) return pa.str.localeCompare(pb.str, undefined, { numeric: true, sensitivity: 'base' });
                return (a.name || a.email || '').localeCompare(b.name || b.email || '');
            });

            // LocalStorage key: stores attendance draft in browser, NO per-student DB calls!
            const draftKey = `rc_draft_${schoolId}_${card.id}_${selectedDate}`;
            let localDraft = null;
            let fromDraft = false;

            try {
                const rawDraft = localStorage.getItem(draftKey);
                if (rawDraft) {
                    localDraft = JSON.parse(rawDraft);
                    fromDraft = true;
                }
            } catch (e) {
                console.warn('Could not parse local draft', e);
            }

            attendanceData = {};
            let studentHistory = {};

            try {
                // Fetch today's attendance AND full class attendance history in parallel
                const [attSnap, classAllSnap] = await Promise.all([
                    firebase.database().ref(`attendance_by_location/${card.id}/${selectedDate}`).once('value'),
                    firebase.database().ref(`attendance_by_location/${card.id}`).once('value')
                ]);

                if (fromDraft && localDraft) {
                    Object.keys(localDraft).forEach(k => {
                        if (k && k !== 'undefined' && k !== 'null' && !k.startsWith('_')) attendanceData[k] = localDraft[k];
                    });
                } else if (attSnap.exists()) {
                    const existing = attSnap.val() || {};
                    Object.keys(existing).forEach(k => {
                        if (k && k !== '_meta' && k !== 'undefined' && k !== 'null' && typeof existing[k] === 'string') {
                            attendanceData[k] = existing[k];
                        }
                    });
                }

                // Compute historical baseline (excluding currently selected date so live selection adds to baseline)
                if (classAllSnap && classAllSnap.exists()) {
                    const allData = classAllSnap.val() || {};
                    Object.keys(allData).forEach(dateKey => {
                        if (dateKey === '_meta' || dateKey === selectedDate) return;
                        const dayVal = allData[dateKey];
                        if (!dayVal || typeof dayVal !== 'object') return;

                        // Verify that attendance was actually recorded for this date
                        const hasMarks = Object.keys(dayVal).some(k => !k.startsWith('_') && typeof dayVal[k] === 'string');
                        if (!hasMarks) return;

                        students.forEach(st => {
                            if (!studentHistory[st.id]) studentHistory[st.id] = { present: 0, total: 0 };
                            const rec = dayVal[st.id + '_record'] || {};
                            const stStatus = String(rec.status || dayVal[st.id] || '').toLowerCase();
                            if (['present', 'late', 'onduty'].includes(stStatus)) {
                                studentHistory[st.id].present++;
                                studentHistory[st.id].total++;
                            } else if (stStatus === 'absent') {
                                studentHistory[st.id].total++;
                            }
                        });
                    });
                }
            } catch (fetchErr) {
                console.warn('Error reading attendance records:', fetchErr);
            }

            if (loadingAnimation) {
                loadingAnimation.classList.remove('active');
                loadingAnimation.style.display = 'none';
            }

            window.renderSchoolRosterTable(students, attendanceData, draftKey, editable, fromDraft, studentHistory);

        } catch (err) {
            console.error('Error loading attendance sheet:', err);
            if (loadingAnimation) {
                loadingAnimation.classList.remove('active');
                loadingAnimation.style.display = 'none';
            }
            if (popupStudentList) {
                popupStudentList.style.display = 'block';
                popupStudentList.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ${err.message}</p></div>`;
            }
        }
    };

    // Render Student Table for School Mode
    window.renderSchoolRosterTable = function(studentsList, attData, draftKey, editable = true, fromDraft = false, studentHistory = {}) {
        const popupStudentList = document.getElementById('popupStudentList');
        const submitBtn = document.getElementById('submitAttendancePopupBtn');
        if (!popupStudentList) return;

        popupStudentList.style.display = 'block';

        if (!studentsList || studentsList.length === 0) {
            popupStudentList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>No students enrolled in this section.</p>
                </div>
            `;
            if (submitBtn) submitBtn.style.display = 'none';
            return;
        }

        // Live calculation of currently running attendance for each student
        const computeRunningAtt = (studentId, currentStatus) => {
            const hist = (studentHistory && studentHistory[studentId]) || { present: 0, total: 0 };
            let p = hist.present || 0;
            let t = hist.total || 0;

            if (currentStatus === 'present') {
                p += 1;
                t += 1;
            } else if (currentStatus === 'absent') {
                t += 1;
            }

            if (t === 0) {
                return {
                    pct: null,
                    html: `<div class="running-att-wrap"><span class="running-att-badge att-neutral">—</span><small class="running-att-count">No sessions</small></div>`
                };
            }

            const pct = Math.round((p / t) * 100);
            const badgeClass = pct >= 75 ? 'att-good' : pct >= 60 ? 'att-warn' : 'att-danger';
            return {
                pct,
                html: `<div class="running-att-wrap"><span class="running-att-badge ${badgeClass}">${pct}%</span><small class="running-att-count">${p}/${t} attended</small></div>`
            };
        };

        // Ascending numeric/alphanumeric sort by Roll Number
        const getRollVal = (st) => {
            const raw = st?.classRoll ?? st?.rollNo ?? st?.roll ?? '';
            const str = String(raw).trim();
            const num = parseInt(str.replace(/\D+/g, ''), 10);
            return {
                num: isNaN(num) ? Infinity : num,
                str: str.toLowerCase()
            };
        };

        studentsList.sort((a, b) => {
            const pa = getRollVal(a);
            const pb = getRollVal(b);
            if (pa.num !== pb.num) return pa.num - pb.num;
            if (pa.str && pb.str) return pa.str.localeCompare(pb.str, undefined, { numeric: true, sensitivity: 'base' });
            return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), undefined, { numeric: true, sensitivity: 'base' });
        });

        const totalRosterPages = Math.max(1, Math.ceil(studentsList.length / rosterPageSize));
        rosterCurrentPage = Math.min(Math.max(1, rosterCurrentPage), totalRosterPages);
        const rosterStart = (rosterCurrentPage - 1) * rosterPageSize;
        const visibleStudents = studentsList.slice(rosterStart, rosterStart + rosterPageSize);
        const rosterEnd = Math.min(rosterStart + visibleStudents.length, studentsList.length);

        let tableHtml = `
            ${fromDraft ? '<div class="alert alert-info" style="display:flex;align-items:center;gap:8px;padding:8px 14px;margin-bottom:10px;background:#e8f4fd;color:#0c5460;border-radius:8px;font-size:12.5px;"><i class="fas fa-info-circle"></i> Restored unsaved attendance draft from your device.</div>' : ''}
            <div class="school-roster-topbar" style="display:flex;justify-content:space-between;align-items:center;padding:10px 24px;background:#f9fbf9;border-bottom:1px solid #e5ede7;flex-wrap:nowrap;gap:12px;">
                <div style="font-weight:700;font-size:13.5px;color:#1e3d2b;white-space:nowrap;flex-shrink:0;">
                    <i class="fas fa-user-graduate" style="color:#15803d;margin-right:6px;"></i> Students Enrolled: 
                    <span class="badge" style="background:#e8f5ec;color:#15803d;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;">${studentsList.length}</span>
                    <small class="roster-range" style="color:#6b7280;font-size:11px;font-weight:600;margin-left:5px;">Showing ${rosterStart + 1}-${rosterEnd}</small>
                </div>
                <div class="school-roster-actions" style="display:inline-flex !important;flex-direction:row !important;flex-wrap:nowrap !important;align-items:center !important;gap:8px !important;flex-shrink:0;">
                    <button type="button" id="markAllPresentBtn" class="secondary-btn" style="width:auto !important;flex:0 0 auto !important;white-space:nowrap !important;margin:0 !important;padding:6px 14px;font-size:12px;font-weight:700;background:#ecfdf5;color:#15803d;border:1.5px solid #86efac;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-check-double"></i> All Present</button>
                    <button type="button" id="markAllAbsentBtn" class="secondary-btn" style="width:auto !important;flex:0 0 auto !important;white-space:nowrap !important;margin:0 !important;padding:6px 14px;font-size:12px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1.5px solid #fca5a5;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-times"></i> All Absent</button>
                    <button type="button" id="clearAllDraftBtn" class="secondary-btn" style="width:auto !important;flex:0 0 auto !important;white-space:nowrap !important;margin:0 !important;padding:6px 12px;font-size:12px;font-weight:600;color:#dc2626;background:#fff;border:1px solid #fca5a5;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-trash-alt"></i> Clear</button>
                </div>
            </div>
            <div class="table-responsive" style="overflow-x:auto;">
                <table class="attendance-table" style="width:100%;border-collapse:collapse;table-layout:fixed;min-width:540px;">
                    <thead>
                        <tr style="background:#f4f7f5;border-bottom:2px solid #d9e5dc;text-align:left;">
                            <th class="st-roll-header" style="padding:11px 14px 11px 20px;width:95px;text-align:center;">Roll No</th>
                            <th class="st-name-header" style="padding:11px 16px;text-align:left;">Student Name</th>
                            <th class="st-running-header" style="padding:11px 10px;width:150px;text-align:center;">Running Att.</th>
                            <th class="st-actions-header" style="padding:11px 28px 11px 12px;width:270px;text-align:center;">Attendance Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        visibleStudents.forEach((st, idx) => {
            const absoluteIndex = rosterStart + idx;
            const rawRoll = st.classRoll || st.rollNo || st.roll || (absoluteIndex + 1);
            const cleanRoll = String(rawRoll).trim();
            const name = st.name || st.email || `Student ${absoluteIndex + 1}`;
            const currentStatus = attData[st.id] || '';

            tableHtml += `
                <tr class="student-row ${currentStatus === 'present' ? 'is-present' : currentStatus === 'absent' ? 'is-absent' : ''}" data-student-id="${st.id}">
                    <td class="st-roll-cell" style="width:95px;text-align:center;padding:10px 14px 10px 20px;vertical-align:middle;">
                        <span class="st-roll-badge" style="display:inline-block;padding:4px 10px;border-radius:6px;background:#eef6f1;color:#166534;font-weight:700;font-size:13px;border:1px solid #bbf7d0;">${escapeHtml(cleanRoll)}</span>
                    </td>
                    <td class="st-name-cell" style="padding:10px 16px;text-align:left;vertical-align:middle;">
                        <div class="st-name" style="font-weight:700;color:#111827;font-size:14px;line-height:1.25;">${escapeHtml(name)}</div>
                        ${st.email ? `<small style="color:#6b7280;font-size:12px;display:block;margin-top:2px;">${escapeHtml(st.email)}</small>` : ''}
                    </td>
                    <td class="st-running-cell" id="runningAtt_${st.id}" style="width:150px;text-align:center;padding:10px 10px;vertical-align:middle;">
                        ${computeRunningAtt(st.id, currentStatus).html}
                    </td>
                    <td class="st-actions-cell" style="width:270px;text-align:center;padding:10px 28px 10px 12px;vertical-align:middle;">
                        <div class="attendance-buttons" style="display:inline-flex;gap:8px;justify-content:center;">
                            <button type="button" class="attendance-btn present-btn ${currentStatus === 'present' ? 'active' : ''}" 
                                data-student-id="${st.id}" data-status="present">
                                <i class="fas fa-check"></i> Present
                            </button>
                            <button type="button" class="attendance-btn absent-btn ${currentStatus === 'absent' ? 'active' : ''}" 
                                data-student-id="${st.id}" data-status="absent">
                                <i class="fas fa-times"></i> Absent
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
            <div class="roster-pagination" aria-label="Attendance student pages">
                <span class="roster-page-summary">Showing ${rosterStart + 1}-${rosterEnd} of ${studentsList.length} students</span>
                <div class="roster-page-controls">
                    <button type="button" class="roster-page-btn" data-roster-page="1" ${rosterCurrentPage <= 1 ? 'disabled' : ''} aria-label="First page"><i class="fas fa-angles-left"></i></button>
                    <button type="button" class="roster-page-btn" data-roster-page="${rosterCurrentPage - 1}" ${rosterCurrentPage <= 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fas fa-chevron-left"></i> Prev</button>
                    <span class="roster-page-number">Page ${rosterCurrentPage} of ${totalRosterPages}</span>
                    <button type="button" class="roster-page-btn" data-roster-page="${rosterCurrentPage + 1}" ${rosterCurrentPage >= totalRosterPages ? 'disabled' : ''} aria-label="Next page">Next <i class="fas fa-chevron-right"></i></button>
                    <button type="button" class="roster-page-btn" data-roster-page="${totalRosterPages}" ${rosterCurrentPage >= totalRosterPages ? 'disabled' : ''} aria-label="Last page"><i class="fas fa-angles-right"></i></button>
                </div>
            </div>
        `;

        popupStudentList.innerHTML = tableHtml;

        popupStudentList.querySelectorAll('.roster-page-btn:not([disabled])').forEach(button => {
            button.addEventListener('click', () => {
                rosterCurrentPage = Number(button.dataset.rosterPage) || 1;
                window.renderSchoolRosterTable(studentsList, attData, draftKey, editable, fromDraft, studentHistory);
            });
        });

        if (submitBtn) {
            submitBtn.style.display = 'inline-flex';
            const hasExisting = window.submittedAttendances && window.submittedAttendances[currentClassData?.id];
            submitBtn.innerHTML = hasExisting ? '<i class="fas fa-save"></i> Update Attendance' : '<i class="fas fa-save"></i> Submit Attendance';
            submitBtn.disabled = false;
        }

        // Persist draft to local storage only - NO database writes per student click
        const persistDraft = () => {
            try {
                localStorage.setItem(draftKey, JSON.stringify(attendanceData));
            } catch (e) {
                console.warn('Could not save draft to localStorage', e);
            }
        };

        // Event delegation for marking Present/Absent with instant running attendance update
        popupStudentList.onclick = function(e) {
            const btn = e.target.closest('.attendance-btn');
            if (!btn) return;
            const studentId = btn.getAttribute('data-student-id');
            const status = btn.getAttribute('data-status');
            if (!studentId || studentId === 'undefined' || studentId === 'null' || !studentId.trim() || !status) return;

            attendanceData[studentId] = status;

            const row = btn.closest('.student-row');
            if (row) {
                row.querySelectorAll('.attendance-btn').forEach(b => {
                    if (b.getAttribute('data-status') === status) {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });
                row.classList.toggle('is-present', status === 'present');
                row.classList.toggle('is-absent', status === 'absent');
            }

            // Live update of Running Attendance column
            const runningCell = document.getElementById(`runningAtt_${studentId}`);
            if (runningCell) {
                runningCell.innerHTML = computeRunningAtt(studentId, status).html;
            }

            // ONLY local storage - NO DATABASE CALL!
            persistDraft();
        };

        // Mark all present
        document.getElementById('markAllPresentBtn')?.addEventListener('click', () => {
            studentsList.forEach(st => {
                const sid = st?.id || st?.uid;
                if (sid && sid !== 'undefined' && sid !== 'null' && String(sid).trim()) {
                    attendanceData[sid] = 'present';
                    const cell = document.getElementById(`runningAtt_${sid}`);
                    if (cell) cell.innerHTML = computeRunningAtt(sid, 'present').html;
                }
            });
            popupStudentList.querySelectorAll('.student-row').forEach(row => {
                row.querySelector('.present-btn')?.classList.add('active');
                row.querySelector('.absent-btn')?.classList.remove('active');
                row.classList.add('is-present');
                row.classList.remove('is-absent');
            });
            persistDraft();
        });

        // Mark all absent
        document.getElementById('markAllAbsentBtn')?.addEventListener('click', () => {
            studentsList.forEach(st => {
                const sid = st?.id || st?.uid;
                if (sid && sid !== 'undefined' && sid !== 'null' && String(sid).trim()) {
                    attendanceData[sid] = 'absent';
                    const cell = document.getElementById(`runningAtt_${sid}`);
                    if (cell) cell.innerHTML = computeRunningAtt(sid, 'absent').html;
                }
            });
            popupStudentList.querySelectorAll('.student-row').forEach(row => {
                row.querySelector('.absent-btn')?.classList.add('active');
                row.querySelector('.present-btn')?.classList.remove('active');
                row.classList.add('is-absent');
                row.classList.remove('is-present');
            });
            persistDraft();
        });

        // Clear all draft
        document.getElementById('clearAllDraftBtn')?.addEventListener('click', () => {
            if (!confirm('Clear all attendance selections and local draft for this class?')) return;
            attendanceData = {};
            try { localStorage.removeItem(draftKey); } catch (e) {}
            studentsList.forEach(st => {
                const sid = st?.id || st?.uid;
                if (sid) {
                    const cell = document.getElementById(`runningAtt_${sid}`);
                    if (cell) cell.innerHTML = computeRunningAtt(sid, '').html;
                }
            });
            popupStudentList.querySelectorAll('.student-row').forEach(row => {
                row.querySelectorAll('.attendance-btn').forEach(b => b.classList.remove('active'));
                row.classList.remove('is-present', 'is-absent');
            });
        });
    };

    // Submit school attendance in a single batch to Firebase and clear local storage
    window.submitSchoolAttendance = async function() {
        if (!currentClassData || !teacherSchoolId()) {
            alert('No class or school selected.');
            return;
        }

        const classLocationId = currentClassData.id || currentClassData.classId;
        if (!classLocationId || classLocationId === 'undefined' || classLocationId === 'null') {
            alert('Invalid class selected.');
            return;
        }

        const dateInput = document.getElementById('popupAttendanceDate');
        const selectedDate = dateInput?.value ? formatDateForDatabase(new Date(dateInput.value)) : formatDateForDatabase(new Date());
        const draftKey = `rc_draft_${teacherSchoolId()}_${classLocationId}_${selectedDate}`;

        // Ensure every student has a status (unmarked defaulted to absent)
        students.forEach(st => {
            const sid = st?.id || st?.uid;
            if (!sid || sid === 'undefined' || sid === 'null' || !String(sid).trim()) return;
            if (!attendanceData[sid]) attendanceData[sid] = 'absent';
        });

        // Strictly sanitize attendanceData so phantom undefined/null keys are NEVER stored
        const cleanPayload = {};
        let presentCount = 0;
        let absentCount = 0;
        Object.keys(attendanceData).forEach(k => {
            if (!k || k === 'undefined' || k === 'null' || k === 'NaN' || k.startsWith('_') || !k.trim()) return;
            const val = attendanceData[k];
            cleanPayload[k] = val;
            if (val === 'present') presentCount++;
            else if (val === 'absent') absentCount++;
        });

        const validStudentCount = students.filter(st => {
            const sid = st?.id || st?.uid;
            return sid && sid !== 'undefined' && sid !== 'null' && String(sid).trim();
        }).length;

        const submitBtn = document.getElementById('submitAttendancePopupBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }

        const payload = {
            ...cleanPayload,
            _meta: {
                schoolId: teacherSchoolId(),
                locationId: classLocationId,
                classId: currentClassData.classId || classLocationId,
                className: currentClassData.className || currentClassData.name || '',
                section: currentClassData.section || '',
                teacherId: currentTeacher?.id || '',
                teacherName: currentTeacher?.name || currentTeacher?.email || '',
                date: selectedDate,
                time: new Date().toLocaleTimeString('en-US', { hour12: false }),
                timestamp: Date.now(),
                status: 'submitted',
                submitted: true,
                stats: {
                    total: validStudentCount || Object.keys(cleanPayload).length,
                    present: presentCount,
                    absent: absentCount
                }
            }
        };

        try {
            // Write clean batch and purge any existing phantom undefined/null keys
            const updates = {};
            updates[`attendance_by_location/${classLocationId}/${selectedDate}`] = payload;
            updates[`attendance_by_location/${classLocationId}/${selectedDate}/undefined`] = null;
            updates[`attendance_by_location/${classLocationId}/${selectedDate}/null`] = null;
            updates[`attendance/${teacherSchoolId()}/${classLocationId}/${selectedDate}`] = payload;
            updates[`attendance/${teacherSchoolId()}/${classLocationId}/${selectedDate}/undefined`] = null;
            updates[`attendance/${teacherSchoolId()}/${classLocationId}/${selectedDate}/null`] = null;

            await firebase.database().ref().update(updates);

            // Clear draft from localStorage upon successful write!
            try { localStorage.removeItem(draftKey); } catch (e) {}

            // Update cache
            window.submittedAttendances = window.submittedAttendances || {};
            window.submittedAttendances[classLocationId] = payload;

            alert(`Attendance submitted successfully! (${presentCount} Present, ${absentCount} Absent)`);

            // Hide popup
            const popup = document.getElementById('attendancePopup');
            if (popup) popup.style.display = 'none';

            // Refresh cards
            if (typeof window.loadSchoolClassCards === 'function') {
                window.loadSchoolClassCards(selectedDate);
            }

        } catch (err) {
            console.error('Attendance submission failed:', err);
            alert('Submission failed: ' + err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Submit Attendance';
            }
        }
    };
    
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
        if (window._teacherClassCardsMap && window._teacherClassCardsMap[locationId]) {
            if (typeof window.openSchoolClassAttendance === 'function') {
                return window.openSchoolClassAttendance(locationId, true);
            }
            if (typeof selectClass === 'function') {
                return selectClass(window._teacherClassCardsMap[locationId]);
            }
        }
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
            body.teacher-school-mode #addLocationBtn,
            body.teacher-school-mode .location-manager #addLocationBtn,
            body.teacher-school-mode #locationModal,
            body.teacher-school-mode .location-filters,
            body.teacher-school-mode .location-manager .location-filters {
                display: none !important;
            }
            
            .school-class-card {
                background: white;
                border-radius: 14px;
                border: 1px solid #e1e9e2;
                box-shadow: 0 4px 14px rgba(27,57,37,.06);
                padding: 20px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                gap: 15px;
                transition: transform .2s ease, box-shadow .2s ease;
            }
            
            .school-class-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 8px 24px rgba(27,57,37,.12);
            }
            
            .school-class-card.submitted {
                border-top: 4px solid #176b4d;
            }
            
            .school-class-card.pending {
                border-top: 4px solid #f57c00;
            }
            
            .school-class-card .location-header {
                background: transparent !important;
                padding: 0 !important;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 10px;
            }
            
            .school-class-card .location-header h3 {
                margin: 0;
                color: #233529;
                font-size: 18px;
                font-weight: 750;
            }
            
            .school-class-card .location-status {
                font-size: 11px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 20px;
                text-transform: uppercase;
                letter-spacing: .05em;
            }
            
            .school-class-card .location-status.active {
                background: #e8f5e9;
                color: #1b5e20;
            }
            
            .school-class-card .location-status.inactive {
                background: #fff3e0;
                color: #e65100;
            }
            
            .school-class-card .location-body {
                padding: 0 !important;
                display: flex;
                flex-direction: column;
                gap: 8px;
                color: #55675c;
                font-size: 13px;
            }
            
            .school-class-card .location-actions {
                padding: 0 !important;
                display: flex;
                gap: 8px;
                margin-top: 5px;
            }
            
            .school-class-card .location-actions button {
                flex: 1;
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-weight: 650;
                border-radius: 9px;
                cursor: pointer;
                font-size: 13px;
                padding: 8px 12px;
            }
            
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
