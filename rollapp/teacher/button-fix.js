// Button Fix - Updates buttons for classes with submitted attendance
document.addEventListener('DOMContentLoaded', function() {
    // Override renderLocationsWithAttendanceStatus function
    const originalRenderLocationsWithAttendanceStatus = window.renderLocationsWithAttendanceStatus;
    window.renderLocationsWithAttendanceStatus = function(locations, submittedAttendances) {
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
                        `<button class="action-btn view-btn" data-id="${location.id}">
                            <i class="fas fa-eye"></i> View Attendance
                        </button>
                        <button class="action-btn modify-btn" data-id="${location.id}">
                            <i class="fas fa-edit"></i> Modify Attendance
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
                card.querySelector('.view-btn').addEventListener('click', function() {
                    viewAttendanceForLocation(this.dataset.id);
                });
                
                card.querySelector('.modify-btn').addEventListener('click', function() {
                    modifyAttendanceForLocation(this.dataset.id);
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
    };
    
    // Override renderClassesWithAttendanceStatus function
    const originalRenderClassesWithAttendanceStatus = window.renderClassesWithAttendanceStatus;
    window.renderClassesWithAttendanceStatus = function(classes, submittedAttendances) {
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
                        `<button class="action-btn view-btn" data-id="${classData.id}">
                            <i class="fas fa-eye"></i> View Attendance
                        </button>
                        <button class="action-btn modify-btn" data-id="${classData.id}">
                            <i class="fas fa-edit"></i> Modify Attendance
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
                card.querySelector('.view-btn').addEventListener('click', function() {
                    viewAttendanceForClass(this.dataset.id);
                });
                
                card.querySelector('.modify-btn').addEventListener('click', function() {
                    modifyAttendanceForClass(this.dataset.id);
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
    };
    
    // Add styles for buttons
    const style = document.createElement('style');
    style.textContent = `
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
    `;
    document.head.appendChild(style);
});