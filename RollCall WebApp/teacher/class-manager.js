// Class Manager - Adds class management functionality
document.addEventListener('DOMContentLoaded', function() {
    const schoolIdForTeacher = () => typeof currentTeacher !== 'undefined' && currentTeacher ? currentTeacher.schoolId : null;
    const teacherOwnsClass = record => !!schoolIdForTeacher() && record && record.schoolId === schoolIdForTeacher();
    // Initialize classes section
    initClassesSection();
    
    function initClassesSection() {
        const classesSection = document.getElementById('classesSection');
        if (!classesSection) return;
        
        // Add class management UI
        const classManager = document.createElement('div');
        classManager.className = 'class-manager';
        classManager.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-chalkboard"></i> Manage Classes</h2>
                <button id="addClassBtn" class="primary-btn"><i class="fas fa-plus"></i> Add New Class</button>
            </div>
            
            <div class="class-filters">
                <div class="form-group">
                    <input type="text" id="classSearchInput" class="form-control" placeholder="Search classes...">
                </div>
                <div class="form-group">
                    <select id="classStatusFilter" class="form-control">
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>
            
            <div id="classesContainer" class="classes-container">
                <div class="loader-container">
                    <div class="loader"></div>
                </div>
            </div>
        `;
        
        // Insert after header
        const header = classesSection.querySelector('.header');
        if (header) {
            header.insertAdjacentElement('afterend', classManager);
        } else {
            classesSection.appendChild(classManager);
        }
        
        // Add class form modal
        const classModal = document.createElement('div');
        classModal.className = 'modal-overlay';
        classModal.id = 'classModal';
        classModal.style.display = 'none';
        classModal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="fas fa-chalkboard"></i> <span id="classModalTitle">Add New Class</span></h3>
                    <button class="close-btn" id="closeClassModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <form id="classForm">
                        <div class="form-group">
                            <label for="className"><i class="fas fa-signature"></i> Class Name</label>
                            <input type="text" id="className" class="form-control" required placeholder="e.g. Mathematics, Physics">
                        </div>
                        
                        <div class="form-group">
                            <label for="classSubject"><i class="fas fa-book"></i> Subject</label>
                            <input type="text" id="classSubject" class="form-control" placeholder="e.g. Science, Arts">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label for="classStartTime"><i class="fas fa-clock"></i> Start Time</label>
                                <input type="time" id="classStartTime" class="form-control">
                            </div>
                            
                            <div class="form-group">
                                <label for="classEndTime"><i class="fas fa-clock"></i> End Time</label>
                                <input type="time" id="classEndTime" class="form-control">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="classRoom"><i class="fas fa-door-open"></i> Room/Location</label>
                            <input type="text" id="classRoom" class="form-control" placeholder="e.g. Room 101, Building A">
                        </div>
                        
                        <div class="form-group">
                            <label for="classDays"><i class="fas fa-calendar-day"></i> Days</label>
                            <div class="days-selector">
                                <label class="day-checkbox">
                                    <input type="checkbox" value="mon"> Mon
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="tue"> Tue
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="wed"> Wed
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="thu"> Thu
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="fri"> Fri
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="sat"> Sat
                                </label>
                                <label class="day-checkbox">
                                    <input type="checkbox" value="sun"> Sun
                                </label>
                            </div>
                        </div>
                        
                        <div class="form-group checkbox-group">
                            <input type="checkbox" id="classActive" checked>
                            <label for="classActive">Active</label>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="primary-btn" id="saveClassBtn">
                                <i class="fas fa-save"></i> Save Class
                            </button>
                            <button type="button" class="secondary-btn" id="cancelClassBtn">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(classModal);
        
        // Add styles
        addStyles();
        
        // Add event listeners
        document.getElementById('addClassBtn').addEventListener('click', showAddClassModal);
        document.getElementById('closeClassModal').addEventListener('click', hideClassModal);
        document.getElementById('cancelClassBtn').addEventListener('click', hideClassModal);
        document.getElementById('classForm').addEventListener('submit', saveClass);
        document.getElementById('classSearchInput').addEventListener('input', filterClasses);
        document.getElementById('classStatusFilter').addEventListener('change', filterClasses);
        
        // Load classes
        loadClasses();
    }
    
    // Show add class modal
    function showAddClassModal() {
        const modal = document.getElementById('classModal');
        const form = document.getElementById('classForm');
        const title = document.getElementById('classModalTitle');
        
        // Reset form
        form.reset();
        form.dataset.mode = 'add';
        form.dataset.id = '';
        title.textContent = 'Add New Class';
        
        // Set default values
        document.getElementById('classActive').checked = true;
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Show edit class modal
    function showEditClassModal(classId) {
        const modal = document.getElementById('classModal');
        const form = document.getElementById('classForm');
        const title = document.getElementById('classModalTitle');
        
        // Reset form
        form.reset();
        form.dataset.mode = 'edit';
        form.dataset.id = classId;
        title.textContent = 'Edit Class';
        
        // Load class data
        firebase.database().ref('classes/' + classId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (!teacherOwnsClass(data)) throw new Error('This class is not assigned to your school.');
                    
                    // Fill form fields
                    document.getElementById('className').value = data.name || '';
                    document.getElementById('classSubject').value = data.subject || '';
                    document.getElementById('classStartTime').value = data.startTime || '';
                    document.getElementById('classEndTime').value = data.endTime || '';
                    document.getElementById('classRoom').value = data.room || '';
                    
                    // Set days checkboxes
                    if (data.days) {
                        const dayCheckboxes = document.querySelectorAll('.day-checkbox input');
                        dayCheckboxes.forEach(checkbox => {
                            checkbox.checked = data.days.includes(checkbox.value);
                        });
                    }
                    
                    // Set active status
                    document.getElementById('classActive').checked = data.status !== 'inactive';
                    
                    // Show modal
                    modal.style.display = 'flex';
                } else {
                    showAlert(document.getElementById('classesAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Class not found', 'error');
                }
            })
            .catch((error) => {
                console.error('Error loading class:', error);
                showAlert(document.getElementById('classesAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error loading class: ' + error.message, 'error');
            });
    }
    
    // Hide class modal
    function hideClassModal() {
        document.getElementById('classModal').style.display = 'none';
    }
    
    // Save class
    function saveClass(e) {
        e.preventDefault();
        
        const form = document.getElementById('classForm');
        const mode = form.dataset.mode;
        const classId = form.dataset.id || firebase.database().ref('classes').push().key;
        if (!schoolIdForTeacher()) {
            showAlert(document.getElementById('classesAlert'), 'Assign a school to this teacher account before managing classes.', 'error');
            return;
        }
        
        // Get form values
        const name = document.getElementById('className').value;
        const subject = document.getElementById('classSubject').value;
        const startTime = document.getElementById('classStartTime').value;
        const endTime = document.getElementById('classEndTime').value;
        const room = document.getElementById('classRoom').value;
        const active = document.getElementById('classActive').checked;
        
        // Get selected days
        const dayCheckboxes = document.querySelectorAll('.day-checkbox input:checked');
        const days = Array.from(dayCheckboxes).map(checkbox => checkbox.value);
        
        // Prepare class data
        const classData = {
            name: name,
            subject: subject,
            startTime: startTime,
            endTime: endTime,
            room: room,
            days: days,
            status: active ? 'active' : 'inactive',
            schoolId: schoolIdForTeacher(),
            updatedBy: currentTeacher.id,
            updatedAt: Date.now()
        };
        
        // Add created timestamp for new classes
        if (mode === 'add') {
            classData.createdAt = Date.now();
        }
        
        // Save to Firebase
        const classRef = firebase.database().ref('classes/' + classId);
        const save = mode === 'add' ? Promise.resolve() : classRef.once('value').then(snapshot => {
            if (!snapshot.exists() || !teacherOwnsClass(snapshot.val())) throw new Error('This class is not assigned to your school.');
        });
        save.then(() => Promise.all([
            classRef.update(classData),
            firebase.database().ref(`schoolClasses/${schoolIdForTeacher()}/${classId}`).set(Object.assign({ id: classId }, classData))
        ]))
            .then(() => {
                hideClassModal();
                showAlert(document.getElementById('classesAlert'), 
                    `<i class="fas fa-check-circle"></i> Class ${mode === 'add' ? 'added' : 'updated'} successfully!`, 'success');
                loadClasses();
            })
            .catch((error) => {
                console.error('Error saving class:', error);
                showAlert(document.getElementById('classesAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error saving class: ' + error.message, 'error');
            });
    }
    
    // Load classes
    function loadClasses() {
        const classesContainer = document.getElementById('classesContainer');
        
        // Show loading indicator
        classesContainer.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;
        
        // Load classes from Firebase
        if (!schoolIdForTeacher()) { classesContainer.innerHTML = '<div class="empty-state">Assign a school to this teacher account to view classes.</div>'; return; }
        firebase.database().ref(`schoolClasses/${schoolIdForTeacher()}`).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classes = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const classData = childSnapshot.val();
                        classData.id = childSnapshot.key;
                        if (teacherOwnsClass(classData)) classes.push(classData);
                    });
                    
                    // Sort classes by name
                    classes.sort((a, b) => {
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    
                    // Render classes
                    renderClasses(classes);
                } else {
                    classesContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-chalkboard"></i>
                            <p>No classes found. Click "Add New Class" to create one.</p>
                        </div>
                    `;
                }
            })
            .catch((error) => {
                console.error('Error loading classes:', error);
                classesContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Error loading classes: ${error.message}</p>
                    </div>
                `;
            });
    }
    
    // Render classes
    function renderClasses(classes) {
        const classesContainer = document.getElementById('classesContainer');
        const searchInput = document.getElementById('classSearchInput').value.toLowerCase();
        const statusFilter = document.getElementById('classStatusFilter').value;
        
        // Filter classes
        const filteredClasses = classes.filter(classData => {
            const nameMatch = (classData.name || '').toLowerCase().includes(searchInput) || 
                             (classData.subject || '').toLowerCase().includes(searchInput);
            
            const statusMatch = statusFilter === 'all' || 
                               (statusFilter === 'active' && classData.status !== 'inactive') ||
                               (statusFilter === 'inactive' && classData.status === 'inactive');
            
            return nameMatch && statusMatch;
        });
        
        // Check if any classes match filters
        if (filteredClasses.length === 0) {
            classesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <p>No classes match your filters.</p>
                </div>
            `;
            return;
        }
        
        // Clear container
        classesContainer.innerHTML = '';
        
        // Create class cards
        filteredClasses.forEach(classData => {
            const isActive = classData.status !== 'inactive';
            
            const card = document.createElement('div');
            card.className = `class-card ${isActive ? 'active' : 'inactive'}`;
            card.dataset.id = classData.id;
            
            // Format days
            const daysDisplay = classData.days && classData.days.length > 0 ? 
                classData.days.map(day => day.charAt(0).toUpperCase() + day.slice(1)).join(', ') : 'No days set';
            
            // Format times
            const timeDisplay = classData.startTime && classData.endTime ? 
                `${classData.startTime} - ${classData.endTime}` : 'No schedule set';
            
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
                    <button class="action-btn edit-btn" data-id="${classData.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn take-attendance-btn" data-id="${classData.id}">
                        <i class="fas fa-clipboard-check"></i> Take Attendance
                    </button>
                    <button class="action-btn delete-btn" data-id="${classData.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            
            // Add event listeners
            card.querySelector('.edit-btn').addEventListener('click', function() {
                showEditClassModal(this.dataset.id);
            });
            
            card.querySelector('.take-attendance-btn').addEventListener('click', function() {
                takeAttendanceForClass(this.dataset.id);
            });
            
            card.querySelector('.delete-btn').addEventListener('click', function() {
                deleteClass(this.dataset.id);
            });
            
            classesContainer.appendChild(card);
        });
    }
    
    // Filter classes
    function filterClasses() {
        // Get all classes and apply filters
        if (!schoolIdForTeacher()) return;
        firebase.database().ref(`schoolClasses/${schoolIdForTeacher()}`).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classes = [];
                    
                    snapshot.forEach((childSnapshot) => {
                        const classData = childSnapshot.val();
                        classData.id = childSnapshot.key;
                        if (teacherOwnsClass(classData)) classes.push(classData);
                    });
                    
                    renderClasses(classes);
                }
            });
    }
    
    // Take attendance for class
    function takeAttendanceForClass(classId) {
        // Load class data
        firebase.database().ref('classes/' + classId).once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    const classData = snapshot.val();
                    if (!teacherOwnsClass(classData)) throw new Error('This class is not assigned to your school.');
                    classData.id = classId;
                    
                    // Call existing selectClass function
                    if (typeof selectClass === 'function') {
                        selectClass(classData);
                    } else {
                        showAlert(document.getElementById('classesAlert'), 
                            '<i class="fas fa-exclamation-triangle"></i> Attendance function not available', 'error');
                    }
                } else {
                    showAlert(document.getElementById('classesAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Class not found', 'error');
                }
            })
            .catch((error) => {
                console.error('Error loading class for attendance:', error);
                showAlert(document.getElementById('classesAlert'), 
                    '<i class="fas fa-exclamation-circle"></i> Error loading class: ' + error.message, 'error');
            });
    }
    
    // Delete class
    function deleteClass(classId) {
        if (confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
            const classRef = firebase.database().ref('classes/' + classId);
            classRef.once('value').then(snapshot => {
                if (!snapshot.exists() || !teacherOwnsClass(snapshot.val())) throw new Error('This class is not assigned to your school.');
                return Promise.all([classRef.remove(), firebase.database().ref(`schoolClasses/${schoolIdForTeacher()}/${classId}`).remove()]);
            })
                .then(() => {
                    showAlert(document.getElementById('classesAlert'), 
                        '<i class="fas fa-check-circle"></i> Class deleted successfully!', 'success');
                    loadClasses();
                })
                .catch((error) => {
                    console.error('Error deleting class:', error);
                    showAlert(document.getElementById('classesAlert'), 
                        '<i class="fas fa-exclamation-circle"></i> Error deleting class: ' + error.message, 'error');
                });
        }
    }
    
    // Add styles
    function addStyles() {
        if (document.getElementById('class-manager-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'class-manager-styles';
        style.textContent = `
            .class-manager {
                background: white;
                border-radius: 16px;
                padding: 25px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
                border: 1px solid rgba(0, 0, 0, 0.05);
                margin-bottom: 25px;
            }
            
            .class-filters {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .class-filters .form-group {
                flex: 1;
            }
            
            .classes-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
            }
            
            .class-card {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                border: 1px solid rgba(0, 0, 0, 0.05);
                transition: all 0.3s ease;
            }
            
            .class-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
            }
            
            .class-card.inactive {
                opacity: 0.7;
            }
            
            .class-header {
                background: linear-gradient(135deg, #42a5f5, #1976d2);
                color: white;
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .class-card.inactive .class-header {
                background: linear-gradient(135deg, #9e9e9e, #757575);
            }
            
            .class-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .class-status {
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .class-status.active {
                color: #e3f2fd;
            }
            
            .class-status.inactive {
                color: #ffebee;
            }
            
            .class-body {
                padding: 15px;
            }
            
            .class-subject, .class-time, .class-room, .class-days {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: #555;
            }
            
            .class-actions {
                display: flex;
                gap: 10px;
                padding: 15px;
                border-top: 1px solid #f1f3f5;
                background: #f8f9fa;
            }
            
            .days-selector {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 10px;
            }
            
            .day-checkbox {
                display: flex;
                align-items: center;
                gap: 5px;
                background: #f1f3f5;
                padding: 8px 12px;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .day-checkbox:hover {
                background: #e9ecef;
            }
            
            .day-checkbox input {
                margin: 0;
            }
            
            @media (max-width: 768px) {
                .class-filters {
                    flex-direction: column;
                }
                
                .classes-container {
                    grid-template-columns: 1fr;
                }
                
                .days-selector {
                    flex-direction: column;
                    align-items: flex-start;
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
