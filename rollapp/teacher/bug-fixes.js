// Bug Fixes - Addresses various issues across the application
document.addEventListener('DOMContentLoaded', function() {
    // Fix teacher name in header
    fixTeacherNameInHeader();
    
    // Fix dashboard quick action buttons
    fixQuickActionButtons();
    
    // Fix duplicate attendance rate blocks
    fixDuplicateBlocks();
    
    // Fix timetable class popup
    fixTimetableClassPopup();
    
    // Fix teacher name in header
    function fixTeacherNameInHeader() {
        setTimeout(() => {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) return;
            firebase.database().ref('users/' + currentUser.uid).once('value')
                .then(snapshot => {
                    const profile = snapshot.val() || {};
                    window.updateTeacherHeaderName?.(profile.name || currentUser.displayName || currentUser.email || 'Teacher');
                })
                .catch(error => console.warn('Could not update teacher header name:', error));
        }, 1000);
    }
    
    // Fix quick action buttons
    function fixQuickActionButtons() {
        // Fix quick action buttons after a short delay
        setTimeout(() => {
            // Remove duplicate quick actions section
            const quickActions = document.querySelectorAll('.quick-actions');
            if (quickActions.length > 1) {
                for (let i = 1; i < quickActions.length; i++) {
                    quickActions[i].remove();
                }
            }
            
            // Add event listeners to quick action buttons
            document.getElementById('quickTakeAttendanceBtn')?.addEventListener('click', function() {
                // Switch to attendance section
                const attendanceMenuItem = document.querySelector('.menu-item[data-section="attendance"]');
                if (attendanceMenuItem) {
                    attendanceMenuItem.click();
                }
            });
            
            document.getElementById('quickViewReportsBtn')?.addEventListener('click', function() {
                // Switch to reports section
                const reportsMenuItem = document.querySelector('.menu-item[data-section="reports"]');
                if (reportsMenuItem) {
                    reportsMenuItem.click();
                }
            });
            
            document.getElementById('quickMessageBtn')?.addEventListener('click', function() {
                alert('Messaging feature will be available in the next update.');
            });
            
            document.getElementById('quickExportBtn')?.addEventListener('click', function() {
                // Switch to reports section
                const reportsMenuItem = document.querySelector('.menu-item[data-section="reports"]');
                if (reportsMenuItem) {
                    reportsMenuItem.click();
                }
            });
        }, 1000);
    }
    
    // Fix duplicate blocks
    function fixDuplicateBlocks() {
        // Fix duplicate blocks after a short delay
        setTimeout(() => {
            // Remove duplicate upcoming classes section
            const upcomingClasses = document.querySelectorAll('.upcoming-classes');
            if (upcomingClasses.length > 1) {
                for (let i = 1; i < upcomingClasses.length; i++) {
                    upcomingClasses[i].remove();
                }
            }
            
            // Calculate attendance rate correctly
            const presentCount = parseInt(document.getElementById('todayPresentCount')?.textContent || '0');
            const totalCount = parseInt(document.getElementById('totalStudentCount')?.textContent || '1');
            
            if (totalCount > 0) {
                const attendanceRate = Math.round((presentCount / totalCount) * 100);
                const attendanceRateElement = document.getElementById('attendanceRateCount');
                if (attendanceRateElement) {
                    attendanceRateElement.textContent = `${attendanceRate}%`;
                }
            }
        }, 1500);
    }
    
    // Fix timetable class popup
    function fixTimetableClassPopup() {
        // Wait for the modal to be created
        const checkInterval = setInterval(() => {
            const modal = document.getElementById('classEditModal');
            if (modal) {
                clearInterval(checkInterval);
                
                // Remove time field
                const timeField = modal.querySelector('.form-group:has(#classEditTime)');
                if (timeField) {
                    timeField.style.display = 'none';
                }
                
                // Replace teacher input with dropdown
                const teacherField = modal.querySelector('.form-group:has(#classEditTeacher)');
                if (teacherField) {
                    const teacherLabel = teacherField.querySelector('label');
                    const teacherInput = teacherField.querySelector('input');
                    
                    // Create select element
                    const teacherSelect = document.createElement('select');
                    teacherSelect.id = 'classEditTeacher';
                    teacherSelect.className = 'form-control';
                    teacherSelect.innerHTML = `
                        <option value="">Select Teacher</option>
                        <option value="Mr. Smith">Mr. Smith</option>
                        <option value="Ms. Johnson">Ms. Johnson</option>
                        <option value="Mrs. Davis">Mrs. Davis</option>
                        <option value="Mr. Wilson">Mr. Wilson</option>
                        <option value="Ms. Thompson">Ms. Thompson</option>
                    `;
                    
                    // Replace input with select
                    if (teacherInput && teacherInput.parentNode) {
                        teacherInput.parentNode.replaceChild(teacherSelect, teacherInput);
                    }
                    
                    // Load actual teachers from database
                    loadTeachersForDropdown(teacherSelect);
                }
                
                // Fix button styling
                const modalActions = modal.querySelector('.modal-actions');
                if (modalActions) {
                    modalActions.style.display = 'flex';
                    modalActions.style.justifyContent = 'space-between';
                    modalActions.style.padding = '15px 20px';
                    modalActions.style.borderTop = '1px solid #e9ecef';
                    modalActions.style.backgroundColor = '#f8f9fa';
                    
                    // Fix primary button
                    const primaryBtn = modalActions.querySelector('.primary-btn');
                    if (primaryBtn) {
                        primaryBtn.style.padding = '10px 20px';
                        primaryBtn.style.fontSize = '14px';
                        primaryBtn.style.fontWeight = '600';
                        primaryBtn.style.borderRadius = '6px';
                    }
                    
                    // Fix secondary button
                    const secondaryBtn = modalActions.querySelector('.secondary-btn');
                    if (secondaryBtn) {
                        secondaryBtn.style.padding = '10px 20px';
                        secondaryBtn.style.fontSize = '14px';
                        secondaryBtn.style.fontWeight = '600';
                        secondaryBtn.style.borderRadius = '6px';
                    }
                    
                    // Fix danger button
                    const dangerBtn = modalActions.querySelector('.danger-btn');
                    if (dangerBtn) {
                        dangerBtn.style.padding = '10px 20px';
                        dangerBtn.style.fontSize = '14px';
                        dangerBtn.style.fontWeight = '600';
                        dangerBtn.style.borderRadius = '6px';
                    }
                }
            }
        }, 500);
    }
    
    // Load teachers for dropdown
    function loadTeachersForDropdown(selectElement) {
        if (!selectElement) return;
        
        // Load teachers from database
        firebase.database().ref('users').orderByChild('role').equalTo('teacher').once('value')
            .then((snapshot) => {
                if (snapshot.exists()) {
                    // Clear default options
                    selectElement.innerHTML = '<option value="">Select Teacher</option>';
                    
                    // Add teachers from database
                    snapshot.forEach((childSnapshot) => {
                        const teacher = childSnapshot.val();
                        const teacherName = teacher.name || teacher.email || `Teacher ${childSnapshot.key}`;
                        
                        const option = document.createElement('option');
                        option.value = teacherName;
                        option.textContent = teacherName;
                        selectElement.appendChild(option);
                    });
                }
            })
            .catch(error => {
                console.error('Error loading teachers:', error);
            });
    }
});
