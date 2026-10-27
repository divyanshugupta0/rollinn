// Attendance Fixes - Addresses issues with attendance functionality
document.addEventListener('DOMContentLoaded', function() {
    const normalizePopupValue = value => String(value || '').trim().replace(/^section\s+/i, '').toLowerCase();
    const matchesPopupClassSection = (student, scope) => {
        const section = normalizePopupValue(student?.section || student?.classSection || student?.assignedSection);
        const selectedSections = (Array.isArray(scope?.section) ? scope.section : [scope?.section]).map(normalizePopupValue).filter(Boolean);
        if (!section || !selectedSections.length || !selectedSections.includes(section)) return false;
        const studentIds = [student?.classId, student?.courseId, student?.enrolledClassId, student?.classID].map(value => String(value || '').trim()).filter(Boolean);
        const selectedId = String(scope?.classId || '').trim();
        if (selectedId) return studentIds.includes(selectedId);
        const selectedName = normalizePopupValue(scope?.className || scope?.name);
        if (!selectedName || selectedName === 'class') return true;
        return [student?.className, student?.courseName, student?.course, student?.class].map(value => normalizePopupValue(value)).includes(selectedName);
    };

    // Remove refresh students button
    removeRefreshButton();
    
    // Fix day filtering for classes
    fixDayFiltering();
    
    // Fix action buttons
    fixActionButtons();
    
    // Enhance modify attendance popup
    enhanceModifyAttendancePopup();
    
    // Restyle popups
    restylePopups();
    
    // Remove refresh students button
    function removeRefreshButton() {
        setTimeout(() => {
            const refreshBtn = document.getElementById('refreshStudentsBtn');
            if (refreshBtn) {
                refreshBtn.remove();
            }
        }, 1000);
    }
    
    // Fix day filtering for classes in attendance section
    function fixDayFiltering() {
        // Override filterLocationsByDate function
        window.filterLocationsByDate = function() {
            const dateInput = document.getElementById('attendanceFilterDate');
            if (!dateInput) return;
            
            const selectedDate = dateInput.value;
            const selectedDay = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().substring(0, 3);
            
            // Show loading indicator
            const locationsContainer = document.getElementById('locationsContainer');
            if (locationsContainer) {
                locationsContainer.innerHTML = `
                    <div class="loader-container">
                        <div class="loader"></div>
                    </div>
                `;
            }
            
            if (typeof window.isSchoolModeActive === 'function' && window.isSchoolModeActive()) {
                if (typeof window.loadSchoolClassCards === 'function') {
                    return window.loadSchoolClassCards(formatDateForDatabase(new Date(selectedDate)));
                }
            }
            
            // Load locations from Firebase
            firebase.database().ref('locations').once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const locations = [];
                        
                        snapshot.forEach((childSnapshot) => {
                            const location = childSnapshot.val();
                            location.id = childSnapshot.key;
                            
                            // Only include locations scheduled for this day
                            if (location.days && location.days.length > 0) {
                                if (!location.days.includes(selectedDay)) {
                                    return; // Skip this location
                                }
                            }
                            
                            locations.push(location);
                        });
                        
                        // Check for submitted attendance on the selected date
                        checkSubmittedAttendance(locations, formatDateForDatabase(new Date(selectedDate)));
                    } else {
                        if (locationsContainer) {
                            locationsContainer.innerHTML = `
                                <div class="empty-state">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <p>No locations scheduled for ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })}.</p>
                                </div>
                            `;
                        }
                    }
                });
        };
    }
    
    // Fix action buttons
    function fixActionButtons() {
        // Override the event handlers for action buttons
        document.addEventListener('click', function(e) {
            // Edit location button
            if (e.target.closest('.edit-btn') && e.target.closest('.location-card')) {
                const locationId = e.target.closest('.edit-btn').dataset.id;
                if (typeof showEditLocationModal === 'function') {
                    showEditLocationModal(locationId);
                }
                e.stopPropagation();
            }
            
            // Take attendance button
            if (e.target.closest('.take-attendance-btn') && e.target.closest('.location-card')) {
                const locationId = e.target.closest('.take-attendance-btn').dataset.id;
                if (typeof takeAttendanceForLocation === 'function') {
                    takeAttendanceForLocation(locationId);
                }
                e.stopPropagation();
            }
            
            // Delete button
            if (e.target.closest('.delete-btn') && e.target.closest('.location-card')) {
                const locationId = e.target.closest('.delete-btn').dataset.id;
                if (typeof deleteLocation === 'function') {
                    deleteLocation(locationId);
                }
                e.stopPropagation();
            }
            
            // Modify attendance button
            if (e.target.closest('.modify-btn') && e.target.closest('.location-card')) {
                const locationId = e.target.closest('.modify-btn').dataset.id;
                if (typeof modifyAttendanceForLocation === 'function') {
                    modifyAttendanceForLocation(locationId);
                }
                e.stopPropagation();
            }
            
            // View attendance button
            if (e.target.closest('.view-btn') && e.target.closest('.location-card')) {
                const locationId = e.target.closest('.view-btn').dataset.id;
                if (typeof viewAttendanceForLocation === 'function') {
                    viewAttendanceForLocation(locationId);
                }
                e.stopPropagation();
            }
            
            // Class action buttons
            if (e.target.closest('.class-card')) {
                const actionBtn = e.target.closest('.action-btn');
                if (actionBtn) {
                    const classId = actionBtn.dataset.id;
                    
                    if (actionBtn.classList.contains('edit-btn') && typeof showEditClassModal === 'function') {
                        showEditClassModal(classId);
                        e.stopPropagation();
                    } else if (actionBtn.classList.contains('take-attendance-btn') && typeof takeAttendanceForClass === 'function') {
                        takeAttendanceForClass(classId);
                        e.stopPropagation();
                    } else if (actionBtn.classList.contains('delete-btn') && typeof deleteClass === 'function') {
                        deleteClass(classId);
                        e.stopPropagation();
                    } else if (actionBtn.classList.contains('modify-btn') && typeof modifyAttendanceForClass === 'function') {
                        modifyAttendanceForClass(classId);
                        e.stopPropagation();
                    } else if (actionBtn.classList.contains('view-btn') && typeof viewAttendanceForClass === 'function') {
                        viewAttendanceForClass(classId);
                        e.stopPropagation();
                    }
                }
            }
        });
    }
    
    // Enhance modify attendance popup
    function enhanceModifyAttendancePopup() {
        // Override modifyAttendanceForLocation function
        window.modifyAttendanceForLocation = function(locationId) {
            const selectedDate = document.getElementById('attendanceFilterDate')?.value || formatDateForDatabase(new Date());
            const formattedDate = formatDateForDatabase(new Date(selectedDate));
            
            // Load location data
            firebase.database().ref('locations/' + locationId).once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const locationData = snapshot.val();
                        locationData.id = locationId;
                        
                        // Convert to class data format expected by existing code
                        const classData = {
                            id: locationId,
                            classId: locationData.classId || locationData.courseId || '',
                            name: locationData.className || locationData.name,
                            className: locationData.className || locationData.name || '',
                            section: locationData.section || '',
                            location: locationData.name,
                            startTime: locationData.startTime,
                            endTime: locationData.endTime,
                            latitude: locationData.latitude,
                            longitude: locationData.longitude,
                            radius: locationData.radius,
                            locationData: locationData
                        };
                        
                        // Store the current class data
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
                        
                        // Load existing attendance data
                        firebase.database().ref(`attendance_by_location/${locationId}/${formattedDate}`).once('value')
                            .then((snapshot) => {
                                if (snapshot.exists()) {
                                    // Store attendance data
                                    attendanceData = {};
                                    const existingAttendance = snapshot.val();
                                    
                                    // Remove metadata from attendance data
                                    Object.keys(existingAttendance).forEach(key => {
                                        if (key !== '_meta' && typeof existingAttendance[key] === 'string') {
                                            attendanceData[key] = existingAttendance[key];
                                        }
                                    });
                                    
                                    // Load students with existing attendance data
                                    loadStudentsWithAttendance(locationId, attendanceData);
                                    
                                    // Show submit button for modifications
                                    const submitAttendancePopupBtn = document.getElementById('submitAttendancePopupBtn');
                                    if (submitAttendancePopupBtn) {
                                        submitAttendancePopupBtn.innerHTML = '<i class="fas fa-save"></i> Update Attendance';
                                        submitAttendancePopupBtn.style.display = 'block';
                                    }
                                } else {
                                    // No attendance data found
                                    showAlert(document.getElementById('attendanceAlert'), 
                                        '<i class="fas fa-exclamation-triangle"></i> No attendance data found for this date', 'error');
                                }
                            });
                    }
                });
        };
        
        // Override modifyAttendanceForClass function
        window.modifyAttendanceForClass = function(classId) {
            const selectedDate = document.getElementById('classesFilterDate')?.value || formatDateForDatabase(new Date());
            const formattedDate = formatDateForDatabase(new Date(selectedDate));
            
            // Load class data
            firebase.database().ref('classes/' + classId).once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const classData = snapshot.val();
                        classData.id = classId;
                        classData.classId = classData.classId || classData.courseId || classId;
                        classData.section = classData.section || classData.classSection || '';
                        
                        // Store the current class data
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
                        
                        // Load existing attendance data
                        firebase.database().ref(`attendance_by_location/${classId}/${formattedDate}`).once('value')
                            .then((snapshot) => {
                                if (snapshot.exists()) {
                                    // Store attendance data
                                    attendanceData = {};
                                    const existingAttendance = snapshot.val();
                                    
                                    // Remove metadata from attendance data
                                    Object.keys(existingAttendance).forEach(key => {
                                        if (key !== '_meta' && typeof existingAttendance[key] === 'string') {
                                            attendanceData[key] = existingAttendance[key];
                                        }
                                    });
                                    
                                    // Load students with existing attendance data
                                    loadStudentsWithAttendance(classId, attendanceData);
                                    
                                    // Show submit button for modifications
                                    const submitAttendancePopupBtn = document.getElementById('submitAttendancePopupBtn');
                                    if (submitAttendancePopupBtn) {
                                        submitAttendancePopupBtn.innerHTML = '<i class="fas fa-save"></i> Update Attendance';
                                        submitAttendancePopupBtn.style.display = 'block';
                                    }
                                } else {
                                    // No attendance data found
                                    showAlert(document.getElementById('classesAlert'), 
                                        '<i class="fas fa-exclamation-triangle"></i> No attendance data found for this date', 'error');
                                }
                            });
                    }
                });
        };
        
        // Load students with existing attendance data
        function loadStudentsWithAttendance(entityId, attendanceData) {
            // Show loading indicator
            const popupStudentList = document.getElementById('popupStudentList');
            if (popupStudentList) {
                popupStudentList.innerHTML = `
                    <div class="loader-container">
                        <div class="loader"></div>
                    </div>
                `;
                popupStudentList.style.display = 'block';
            }
            
            // Load all students
            firebase.database().ref('users').orderByChild('role').equalTo('student').once('value')
                .then((snapshot) => {
                    const students = [];
                    if (snapshot.exists()) {
                        snapshot.forEach((childSnapshot) => {
                            const student = childSnapshot.val();
                            student.id = childSnapshot.key;
                            if (matchesPopupClassSection(student, currentClassData)) students.push(student);
                        });
                    }
                    
                    // Sort students by name
                    students.sort((a, b) => {
                        const nameA = a.name || a.email || `Student ${a.id}`;
                        const nameB = b.name || b.email || `Student ${b.id}`;
                        return nameA.localeCompare(nameB);
                    });
                    
                    // Render students with attendance options
                    renderStudentsWithAttendance(students, attendanceData);
                })
                .catch(error => {
                    console.error('Error loading students:', error);
                    if (popupStudentList) {
                        popupStudentList.innerHTML = '<div class="empty-state">Error loading students</div>';
                    }
                });
        }
        
        // Render students with attendance options
        function renderStudentsWithAttendance(students, attendanceData) {
            const popupStudentList = document.getElementById('popupStudentList');
            if (!popupStudentList) return;
            
            // Clear student list
            popupStudentList.innerHTML = '';
            
            // Create header
            const header = document.createElement('div');
            header.className = 'student-list-header';
            header.innerHTML = `
                <div class="student-name-header">Student</div>
                <div class="attendance-options-header">Attendance</div>
            `;
            popupStudentList.appendChild(header);
            
            // Create student rows
            students.forEach(student => {
                const row = document.createElement('div');
                row.className = 'student-row';
                
                const displayName = student.name || student.email || `Student ${student.id}`;
                const status = attendanceData[student.id] || 'absent';
                
                row.innerHTML = `
                    <div class="student-info">
                        <div class="student-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <div class="student-name">${displayName}</div>
                            ${student.classRoll ? `<div class="roll-number">Roll: ${student.classRoll}</div>` : ''}
                        </div>
                    </div>
                    <div class="attendance-options">
                        <button class="attendance-btn present-btn ${status === 'present' ? 'active' : ''}" data-student-id="${student.id}" data-status="present">
                            <i class="fas fa-check"></i> Present
                        </button>
                        <button class="attendance-btn absent-btn ${status === 'absent' ? 'active' : ''}" data-student-id="${student.id}" data-status="absent">
                            <i class="fas fa-times"></i> Absent
                        </button>
                    </div>
                `;
                
                // Add event listeners for attendance buttons
                const presentBtn = row.querySelector('.present-btn');
                const absentBtn = row.querySelector('.absent-btn');
                
                presentBtn.addEventListener('click', function() {
                    markAttendance(student.id, 'present');
                });
                
                absentBtn.addEventListener('click', function() {
                    markAttendance(student.id, 'absent');
                });
                
                popupStudentList.appendChild(row);
            });
        }
    }
    
    // Restyle popups
    function restylePopups() {
        const style = document.createElement('style');
        style.textContent = `
            .popup-container {
                background: white;
                width: 90%;
                max-width: 800px;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
                animation: slideUp 0.4s ease;
                border: 1px solid rgba(0, 0, 0, 0.05);
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }
            
            .popup-header {
                background: linear-gradient(135deg, #66bb6a, #43a047);
                color: white;
                padding: 20px 25px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            }
            
            .popup-header h3 {
                margin: 0;
                font-size: 22px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .popup-content {
                padding: 25px;
                overflow-y: auto;
                flex-grow: 1;
            }
            
            .popup-actions {
                padding: 20px 25px;
                background: #f8f9fa;
                border-top: 1px solid rgba(0, 0, 0, 0.1);
                display: flex;
                justify-content: flex-end;
                gap: 15px;
            }
            
            .student-list-header {
                display: flex;
                justify-content: space-between;
                padding: 15px 20px;
                background: #f8f9fa;
                border-bottom: 2px solid #e9ecef;
                font-weight: 600;
                color: #495057;
            }
            
            .student-name-header {
                flex: 1;
            }
            
            .attendance-options-header {
                width: 220px;
                text-align: center;
            }
            
            .student-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid #e9ecef;
                transition: background-color 0.3s;
            }
            
            .student-row:hover {
                background-color: #f8f9fa;
            }
            
            .student-info {
                display: flex;
                align-items: center;
                gap: 15px;
                flex: 1;
            }
            
            .attendance-options {
                display: flex;
                gap: 10px;
                width: 220px;
            }
            
            .attendance-btn {
                flex: 1;
                padding: 8px 0;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                border: 1px solid #dee2e6;
            }
            
            .present-btn {
                background-color: #f1f8e9;
                color: #2e7d32;
            }
            
            .present-btn:hover {
                background-color: #c8e6c9;
            }
            
            .present-btn.active {
                background-color: #66bb6a;
                color: white;
                border-color: #43a047;
            }
            
            .absent-btn {
                background-color: #ffebee;
                color: #c62828;
            }
            
            .absent-btn:hover {
                background-color: #ffcdd2;
            }
            
            .absent-btn.active {
                background-color: #ef5350;
                color: white;
                border-color: #d32f2f;
            }
            
            @media (max-width: 768px) {
                .attendance-options {
                    flex-direction: column;
                    width: 120px;
                }
                
                .attendance-btn {
                    padding: 6px 0;
                    font-size: 12px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Helper function to format date for database
    function formatDateForDatabase(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
