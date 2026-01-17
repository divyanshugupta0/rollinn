// Date-based Classes - Adds date filtering for classes and attendance
document.addEventListener('DOMContentLoaded', function() {
    // Add date selector to attendance section
    addDateSelectorToAttendance();
    
    // Add date selector to classes section
    addDateSelectorToClasses();
    
    // Update attendance buttons based on submission status
    updateAttendanceButtons();
    
    // Add date selector to attendance section
    function addDateSelectorToAttendance() {
        const locationManager = document.querySelector('.location-manager');
        if (!locationManager) return;
        
        // Create date selector
        const dateSelector = document.createElement('div');
        dateSelector.className = 'date-selector-container';
        dateSelector.innerHTML = `
            <div class="date-selector">
                <label for="attendanceDate"><i class="fas fa-calendar-alt"></i> Select Date:</label>
                <input type="date" id="attendanceFilterDate" class="form-control">
                <button id="filterAttendanceByDateBtn" class="secondary-btn">
                    <i class="fas fa-filter"></i> Filter
                </button>
            </div>
        `;
        
        // Insert before location manager
        locationManager.parentNode.insertBefore(dateSelector, locationManager);
        
        // Set default date to today
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        document.getElementById('attendanceFilterDate').value = formattedDate;
        
        // Add event listener
        document.getElementById('filterAttendanceByDateBtn').addEventListener('click', function() {
            filterLocationsByDate();
        });
    }
    
    // Add date selector to classes section
    function addDateSelectorToClasses() {
        const classManager = document.querySelector('.class-manager');
        if (!classManager) return;
        
        // Create date selector
        const dateSelector = document.createElement('div');
        dateSelector.className = 'date-selector-container';
        dateSelector.innerHTML = `
            <div class="date-selector">
                <label for="classesDate"><i class="fas fa-calendar-alt"></i> Select Date:</label>
                <input type="date" id="classesFilterDate" class="form-control">
                <button id="filterClassesByDateBtn" class="secondary-btn">
                    <i class="fas fa-filter"></i> Filter
                </button>
            </div>
        `;
        
        // Insert before class manager
        classManager.parentNode.insertBefore(dateSelector, classManager);
        
        // Set default date to today
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        document.getElementById('classesFilterDate').value = formattedDate;
        
        // Add event listener
        document.getElementById('filterClassesByDateBtn').addEventListener('click', function() {
            filterClassesByDate();
        });
    }
    
    // Filter locations by date
    function filterLocationsByDate() {
        const dateInput = document.getElementById('attendanceFilterDate');
        if (!dateInput) return;
        
        const selectedDate = dateInput.value;
        const formattedDate = formatDateForDatabase(new Date(selectedDate));
        
        // Show loading indicator
        const locationsContainer = document.getElementById('locationsContainer');
        if (locationsContainer) {
            locationsContainer.innerHTML = `
                <div class="loader-container">
                    <div class="loader"></div>
                </div>
            `;
        }
        
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
                    
                    // Check for submitted attendance on the selected date
                    checkSubmittedAttendance(locations, formattedDate);
                } else {
                    if (locationsContainer) {
                        locationsContainer.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-map-marker-alt"></i>
                                <p>No locations found for the selected date.</p>
                            </div>
                        `;
                    }
                }
            })
            .catch((error) => {
                console.error('Error loading locations:', error);
                if (locationsContainer) {
                    locationsContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Error loading locations: ${error.message}</p>
                        </div>
                    `;
                }
            });
    }
    
    // Check for submitted attendance
    function checkSubmittedAttendance(locations, date) {
        const submittedAttendances = {};
        const promises = [];
        
        // Check each location for submitted attendance
        locations.forEach(location => {
            const promise = firebase.database().ref(`attendance_by_location/${location.id}/${date}`).once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        submittedAttendances[location.id] = snapshot.val();
                    }
                })
                .catch(error => {
                    console.error(`Error checking attendance for location ${location.id}:`, error);
                });
            
            promises.push(promise);
        });
        
        // When all checks are complete
        Promise.all(promises)
            .then(() => {
                // Store submitted attendances in window for access by other functions
                window.submittedAttendances = submittedAttendances;
                
                // Render locations with updated buttons
                renderLocationsWithAttendanceStatus(locations, submittedAttendances);
            });
    }
    
    // Render locations with attendance status
    function renderLocationsWithAttendanceStatus(locations, submittedAttendances) {
        const locationsContainer = document.getElementById('locationsContainer');
        if (!locationsContainer) return;
        
        // Check if any locations exist
        if (locations.length === 0) {
            locationsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marker-alt"></i>
                    <p>No locations found for the selected date.</p>
                </div>
            `;
            return;
        }
        
        // Clear container
        locationsContainer.innerHTML = '';
        
        // Create location cards
        locations.forEach(location => {
            const isActive = location.status !== 'inactive';
            const hasSubmittedAttendance = submittedAttendances[location.id] !== undefined;
            
            const card = document.createElement('div');
            card.className = `location-card ${isActive ? 'active' : 'inactive'}`;
            card.dataset.id = location.id;
            
            // Format times
            const timeDisplay = location.startTime && location.endTime ? 
                `${location.startTime} - ${location.endTime}` : 'No schedule set';
            
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
                    ${location.latitude && location.longitude ? 
                        `<div class="location-coordinates"><i class="fas fa-map-pin"></i> ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>` : ''}
                </div>
                <div class="location-actions">
                    ${hasSubmittedAttendance ? 
                        `<button class="action-btn modify-btn" data-id="${location.id}">
                            <i class="fas fa-edit"></i> Modify Attendance
                        </button>
                        <button class="action-btn view-btn" data-id="${location.id}">
                            <i class="fas fa-eye"></i> View Attendance
                        </button>` : 
                        `<button class="action-btn edit-btn" data-id="${location.id}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="action-btn take-attendance-btn" data-id="${location.id}">
                            <i class="fas fa-clipboard-check"></i> Take Attendance
                        </button>`
                    }
                    <button class="action-btn delete-btn" data-id="${location.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            
            // Add event listeners
            if (hasSubmittedAttendance) {
                card.querySelector('.modify-btn').addEventListener('click', function() {
                    modifyAttendanceForLocation(this.dataset.id);
                });
                
                card.querySelector('.view-btn').addEventListener('click', function() {
                    viewAttendanceForLocation(this.dataset.id);
                });
            } else {
                card.querySelector('.edit-btn').addEventListener('click', function() {
                    editLocation(this.dataset.id);
                });
                
                card.querySelector('.take-attendance-btn').addEventListener('click', function() {
                    takeAttendanceForLocation(this.dataset.id);
                });
            }
            
            card.querySelector('.delete-btn').addEventListener('click', function() {
                deleteLocation(this.dataset.id);
            });
            
            locationsContainer.appendChild(card);
        });
    }
    
    // Filter classes by date
    function filterClassesByDate() {
        const dateInput = document.getElementById('classesFilterDate');
        if (!dateInput) return;
        
        const selectedDate = dateInput.value;
        const formattedDate = formatDateForDatabase(new Date(selectedDate));
        
        // Show loading indicator
        const classesContainer = document.getElementById('classesContainer');
        if (classesContainer) {
            classesContainer.innerHTML = `
                <div class="loader-container">
                    <div class="loader"></div>
                </div>
            `;
        }
        
        // Load classes from Firebase
        firebase.database().ref('classes').once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classes = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const classData = childSnapshot.val();
                        classData.id = childSnapshot.key;
                        
                        // Filter by day of week if days are specified
                        if (classData.days && classData.days.length > 0) {
                            const selectedDay = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                            if (!classData.days.includes(selectedDay.substring(0, 3))) {
                                return; // Skip this class if it's not scheduled for this day
                            }
                        }
                        
                        classes.push(classData);
                    });
                    
                    // Check for submitted attendance on the selected date
                    checkSubmittedAttendanceForClasses(classes, formattedDate);
                } else {
                    if (classesContainer) {
                        classesContainer.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-chalkboard"></i>
                                <p>No classes found for the selected date.</p>
                            </div>
                        `;
                    }
                }
            })
            .catch((error) => {
                console.error('Error loading classes:', error);
                if (classesContainer) {
                    classesContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Error loading classes: ${error.message}</p>
                        </div>
                    `;
                }
            });
    }
    
    // Check for submitted attendance for classes
    function checkSubmittedAttendanceForClasses(classes, date) {
        const submittedAttendances = {};
        const promises = [];
        
        // Check each class for submitted attendance
        classes.forEach(classData => {
            const promise = firebase.database().ref(`attendance_by_location/${classData.id}/${date}`).once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        submittedAttendances[classData.id] = snapshot.val();
                    }
                })
                .catch(error => {
                    console.error(`Error checking attendance for class ${classData.id}:`, error);
                });
            
            promises.push(promise);
        });
        
        // When all checks are complete
        Promise.all(promises)
            .then(() => {
                // Store submitted attendances in window for access by other functions
                window.submittedAttendances = submittedAttendances;
                
                // Render classes with updated buttons
                renderClassesWithAttendanceStatus(classes, submittedAttendances);
            });
    }
    
    // Render classes with attendance status
    function renderClassesWithAttendanceStatus(classes, submittedAttendances) {
        const classesContainer = document.getElementById('classesContainer');
        if (!classesContainer) return;
        
        // Check if any classes exist
        if (classes.length === 0) {
            classesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chalkboard"></i>
                    <p>No classes found for the selected date.</p>
                </div>
            `;
            return;
        }
        
        // Clear container
        classesContainer.innerHTML = '';
        
        // Create class cards
        classes.forEach(classData => {
            const isActive = classData.status !== 'inactive';
            const hasSubmittedAttendance = submittedAttendances[classData.id] !== undefined;
            
            const card = document.createElement('div');
            card.className = `class-card ${isActive ? 'active' : 'inactive'}`;
            card.dataset.id = classData.id;
            
            // Format times
            const timeDisplay = classData.startTime && classData.endTime ? 
                `${classData.startTime} - ${classData.endTime}` : 'No schedule set';
            
            // Format days
            const daysDisplay = classData.days && classData.days.length > 0 ? 
                classData.days.map(day => day.charAt(0).toUpperCase() + day.slice(1)).join(', ') : 'No days set';
            
            card.innerHTML = `
                <div class="class-header">
                    <h3>${classData.name || 'Unnamed Class'}</h3>
                    <div class="class-status ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </div>
                </div>
                <div class="class-body">
                    ${classData.subject ? `<div class="class-subject"><i class="fas fa-book"></i> Subject: ${classData.subject}</div>` : ''}
                    <div class="class-time"><i class="fas fa-clock"></i> ${timeDisplay}</div>
                    ${classData.room ? `<div class="class-room"><i class="fas fa-door-open"></i> Room: ${classData.room}</div>` : ''}
                    <div class="class-days"><i class="fas fa-calendar-day"></i> Days: ${daysDisplay}</div>
                </div>
                <div class="class-actions">
                    ${hasSubmittedAttendance ? 
                        `<button class="action-btn modify-btn" data-id="${classData.id}">
                            <i class="fas fa-edit"></i> Modify Attendance
                        </button>
                        <button class="action-btn view-btn" data-id="${classData.id}">
                            <i class="fas fa-eye"></i> View Attendance
                        </button>` : 
                        `<button class="action-btn edit-btn" data-id="${classData.id}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="action-btn take-attendance-btn" data-id="${classData.id}">
                            <i class="fas fa-clipboard-check"></i> Take Attendance
                        </button>`
                    }
                    <button class="action-btn delete-btn" data-id="${classData.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            
            // Add event listeners
            if (hasSubmittedAttendance) {
                card.querySelector('.modify-btn').addEventListener('click', function() {
                    modifyAttendanceForClass(this.dataset.id);
                });
                
                card.querySelector('.view-btn').addEventListener('click', function() {
                    viewAttendanceForClass(this.dataset.id);
                });
            } else {
                card.querySelector('.edit-btn').addEventListener('click', function() {
                    editClass(this.dataset.id);
                });
                
                card.querySelector('.take-attendance-btn').addEventListener('click', function() {
                    takeAttendanceForClass(this.dataset.id);
                });
            }
            
            card.querySelector('.delete-btn').addEventListener('click', function() {
                deleteClass(this.dataset.id);
            });
            
            classesContainer.appendChild(card);
        });
    }
    
    // Update attendance buttons based on submission status
    function updateAttendanceButtons() {
        // Override the original renderLocations function in attendance-manager.js
        if (typeof window.originalRenderLocations !== 'function' && typeof renderLocations === 'function') {
            window.originalRenderLocations = renderLocations;
            window.renderLocations = function(locations) {
                const selectedDate = document.getElementById('attendanceFilterDate')?.value || formatDateForDatabase(new Date());
                const formattedDate = formatDateForDatabase(new Date(selectedDate));
                
                // Check for submitted attendance first
                checkSubmittedAttendance(locations, formattedDate);
            };
        }
        
        // Override the original renderClasses function in class-manager.js
        if (typeof window.originalRenderClasses !== 'function' && typeof renderClasses === 'function') {
            window.originalRenderClasses = renderClasses;
            window.renderClasses = function(classes) {
                const selectedDate = document.getElementById('classesFilterDate')?.value || formatDateForDatabase(new Date());
                const formattedDate = formatDateForDatabase(new Date(selectedDate));
                
                // Filter classes by day of week
                const filteredClasses = classes.filter(classData => {
                    if (!classData.days || classData.days.length === 0) return true;
                    
                    const selectedDay = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                    return classData.days.includes(selectedDay.substring(0, 3));
                });
                
                // Check for submitted attendance first
                checkSubmittedAttendanceForClasses(filteredClasses, formattedDate);
            };
        }
    }
    
    // Helper functions for attendance actions
    function modifyAttendanceForLocation(locationId) {
        const selectedDate = document.getElementById('attendanceFilterDate')?.value || formatDateForDatabase(new Date());
        
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
                    
                    // Call existing selectClass function with the selected date
                    if (typeof selectClass === 'function') {
                        currentClassData = classData;
                        
                        // Show attendance popup
                        attendancePopup.style.display = 'flex';
                        
                        // Update class info display
                        document.getElementById('popupClassName').textContent = classData.location || classData.name;
                        document.getElementById('popupClassTime').innerHTML = `<i class="far fa-clock"></i> Time: ${classData.startTime ? classData.startTime + ' - ' + classData.endTime : 'N/A'}`;
                        
                        if (classData.location && classData.name) {
                            document.getElementById('popupClassLocation').innerHTML = `<i class="fas fa-book"></i> Class: ${classData.name}`;
                        } else {
                            document.getElementById('popupClassLocation').innerHTML = `<i class="fas fa-map-marker-alt"></i> Location: ${classData.location || 'N/A'}`;
                        }
                        
                        // Set date to selected date
                        popupAttendanceDate.value = selectedDate;
                        
                        // Show attendance in edit mode
                        const popupStudentList = document.getElementById('popupStudentList');
                        popupStudentList.style.display = 'none';
                        
                        // Load students for attendance marking
                        loadStudentsForClass(classData.id);
                        
                        // Load existing attendance data
                        loadAttendance();
                    } else {
                        showAlert(document.getElementById('attendanceAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                }
            });
    }
    
    function viewAttendanceForLocation(locationId) {
        const selectedDate = document.getElementById('attendanceFilterDate')?.value || formatDateForDatabase(new Date());
        
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
                        
                        // Set date to selected date
                        popupAttendanceDate.value = selectedDate;
                        
                        // Force view mode
                        const popupStudentList = document.getElementById('popupStudentList');
                        const attendanceSummary = document.getElementById('attendanceSummary');
                        const submitAttendancePopupBtn = document.getElementById('submitAttendancePopupBtn');
                        
                        popupStudentList.style.display = 'block';
                        attendanceSummary.style.display = 'flex';
                        submitAttendancePopupBtn.style.display = 'none';
                        
                        // Display submitted attendance
                        displaySubmittedAttendance(classData.id);
                    } else {
                        showAlert(document.getElementById('attendanceAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                }
            });
    }
    
    function modifyAttendanceForClass(classId) {
        const selectedDate = document.getElementById('classesFilterDate')?.value || formatDateForDatabase(new Date());
        
        // Load class data
        firebase.database().ref('classes/' + classId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classData = snapshot.val();
                    classData.id = classId;
                    
                    // Call existing selectClass function with the selected date
                    if (typeof selectClass === 'function') {
                        currentClassData = classData;
                        
                        // Show attendance popup
                        attendancePopup.style.display = 'flex';
                        
                        // Update class info display
                        document.getElementById('popupClassName').textContent = classData.name || 'Unnamed Class';
                        document.getElementById('popupClassTime').innerHTML = `<i class="far fa-clock"></i> Time: ${classData.startTime ? classData.startTime + ' - ' + classData.endTime : 'N/A'}`;
                        
                        if (classData.room) {
                            document.getElementById('popupClassLocation').innerHTML = `<i class="fas fa-door-open"></i> Room: ${classData.room}`;
                        } else {
                            document.getElementById('popupClassLocation').innerHTML = `<i class="fas fa-book"></i> Subject: ${classData.subject || 'N/A'}`;
                        }
                        
                        // Set date to selected date
                        popupAttendanceDate.value = selectedDate;
                        
                        // Show attendance in edit mode
                        const popupStudentList = document.getElementById('popupStudentList');
                        popupStudentList.style.display = 'none';
                        
                        // Load students for attendance marking
                        loadStudentsForClass(classData.id);
                        
                        // Load existing attendance data
                        loadAttendance();
                    } else {
                        showAlert(document.getElementById('classesAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                }
            });
    }
    
    function viewAttendanceForClass(classId) {
        const selectedDate = document.getElementById('classesFilterDate')?.value || formatDateForDatabase(new Date());
        
        // Load class data
        firebase.database().ref('classes/' + classId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classData = snapshot.val();
                    classData.id = classId;
                    
                    // Call existing selectClass function
                    if (typeof selectClass === 'function') {
                        selectClass(classData);
                        
                        // Set date to selected date
                        popupAttendanceDate.value = selectedDate;
                        
                        // Force view mode
                        const popupStudentList = document.getElementById('popupStudentList');
                        const attendanceSummary = document.getElementById('attendanceSummary');
                        const submitAttendancePopupBtn = document.getElementById('submitAttendancePopupBtn');
                        
                        popupStudentList.style.display = 'block';
                        attendanceSummary.style.display = 'flex';
                        submitAttendancePopupBtn.style.display = 'none';
                        
                        // Display submitted attendance
                        displaySubmittedAttendance(classData.id);
                    } else {
                        showAlert(document.getElementById('classesAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                }
            });
    }
    
    // Helper function to format date for database
    function formatDateForDatabase(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .date-selector-container {
            margin-bottom: 20px;
        }
        
        .date-selector {
            display: flex;
            align-items: center;
            gap: 15px;
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
            border: 1px solid rgba(0, 0, 0, 0.05);
        }
        
        .date-selector label {
            font-weight: 600;
            color: #343a40;
            white-space: nowrap;
        }
        
        .date-selector input[type="date"] {
            flex: 1;
            min-width: 200px;
        }
        
        .view-btn {
            background: linear-gradient(135deg, #42a5f5, #1976d2) !important;
            color: white !important;
        }
        
        .view-btn:hover {
            background: linear-gradient(135deg, #1976d2, #1565c0) !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(25, 118, 210, 0.3) !important;
        }
        
        .modify-btn {
            background: linear-gradient(135deg, #ff9800, #f57c00) !important;
            color: white !important;
        }
        
        .modify-btn:hover {
            background: linear-gradient(135deg, #f57c00, #ef6c00) !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(245, 124, 0, 0.3) !important;
        }
        
        @media (max-width: 768px) {
            .date-selector {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .date-selector input[type="date"] {
                width: 100%;
            }
            
            .date-selector button {
                width: 100%;
            }
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