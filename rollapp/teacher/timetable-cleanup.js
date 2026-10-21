// Timetable Cleanup - Implements final timetable improvements
document.addEventListener('DOMContentLoaded', function() {
    // Apply cleanup after timetable is loaded
    setTimeout(cleanupTimetable, 1500);
    
    function cleanupTimetable() {
        // Clear all class blocks
        clearAllClassBlocks();
        
        // Add Saturday to timetable
        addSaturdayToTimetable();
        
        // Add period increase button
        addPeriodIncreaseButton();
        
        // Fix teacher dropdown to only use Firebase data
        fixTeacherDropdown();
        
        // Fix header display
        fixHeaderDisplay();
    }
    
    // Clear all class blocks
    function clearAllClassBlocks() {
        const filledSlots = document.querySelectorAll('.filled-slot');
        filledSlots.forEach(slot => {
            // Keep the slot but clear its content
            slot.className = 'timetable-slot empty-slot';
            slot.innerHTML = `
                <div class="add-class-btn">
                    <i class="fas fa-plus"></i>
                    <span>Add Class</span>
                </div>
            `;
        });
    }
    
    // Add Saturday to timetable
    function addSaturdayToTimetable() {
        const timetable = document.querySelector('.timetable table');
        if (!timetable) return;
        
        // Add Saturday to header row
        const headerRow = timetable.querySelector('thead tr');
        if (headerRow) {
            const saturdayHeader = document.createElement('th');
            saturdayHeader.textContent = 'Saturday';
            headerRow.appendChild(saturdayHeader);
        }
        
        // Add Saturday cell to each row
        const rows = timetable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const lastCell = row.querySelector('td:last-child');
            if (lastCell) {
                const period = row.querySelector('.period-cell .period-number')?.textContent;
                const grade = lastCell.dataset.grade;
                
                const saturdayCell = document.createElement('td');
                saturdayCell.className = 'timetable-slot empty-slot';
                saturdayCell.dataset.day = 'saturday';
                saturdayCell.dataset.period = period;
                saturdayCell.dataset.grade = grade;
                saturdayCell.innerHTML = `
                    <div class="add-class-btn">
                        <i class="fas fa-plus"></i>
                        <span>Add Class</span>
                    </div>
                `;
                
                // Add click event
                saturdayCell.addEventListener('click', function() {
                    const day = this.dataset.day;
                    const period = this.dataset.period;
                    const grade = this.dataset.grade;
                    const isFilled = this.classList.contains('filled-slot');
                    
                    // Show class edit modal
                    if (typeof showClassEditModal === 'function') {
                        showClassEditModal(this, day, period, grade, isFilled);
                    } else {
                        // Fallback
                        alert(`Add class to ${day}, Period ${period}`);
                    }
                });
                
                row.appendChild(saturdayCell);
            }
        });
    }
    
    // Add period increase button
    function addPeriodIncreaseButton() {
        const timetableContainer = document.getElementById('timetableContainer');
        if (!timetableContainer) return;
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'period-controls';
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.textAlign = 'center';
        
        // Create add period button
        const addPeriodBtn = document.createElement('button');
        addPeriodBtn.className = 'primary-btn';
        addPeriodBtn.innerHTML = '<i class="fas fa-plus"></i> Add Period';
        addPeriodBtn.style.display = 'inline-block';
        addPeriodBtn.style.width = 'auto';
        
        // Add event listener
        addPeriodBtn.addEventListener('click', function() {
            addNewPeriod();
        });
        
        // Add to container
        buttonContainer.appendChild(addPeriodBtn);
        timetableContainer.appendChild(buttonContainer);
    }
    
    // Add new period
    function addNewPeriod() {
        const timetable = document.querySelector('.timetable table tbody');
        if (!timetable) return;
        
        // Get current number of periods
        const currentPeriods = timetable.querySelectorAll('tr').length;
        const newPeriodNumber = currentPeriods + 1;
        
        // Calculate new time
        const lastPeriodTime = timetable.querySelector('tr:last-child .period-time')?.textContent;
        let newStartTime = '14:00';
        let newEndTime = '14:45';
        
        if (lastPeriodTime) {
            const [_, lastEndTime] = lastPeriodTime.split(' - ');
            const [hours, minutes] = lastEndTime.split(':').map(Number);
            
            // Add 5 minutes break
            const startDate = new Date();
            startDate.setHours(hours, minutes + 5, 0);
            
            // 45 minutes class
            const endDate = new Date();
            endDate.setHours(hours, minutes + 50, 0);
            
            newStartTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
            newEndTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Create new row
        const newRow = document.createElement('tr');
        
        // Add period cell
        const periodCell = document.createElement('td');
        periodCell.className = 'period-cell';
        periodCell.style.position = 'relative';
        periodCell.innerHTML = `
            <div class="period-number">${newPeriodNumber}</div>
            <div class="period-time">${newStartTime} - ${newEndTime}</div>
            <div class="time-edit-overlay">
                <button class="time-edit-btn">
                    <i class="fas fa-clock"></i> Edit Time
                </button>
            </div>
        `;
        newRow.appendChild(periodCell);
        
        // Get grade
        const grade = document.getElementById('gradeSelector')?.value || '1';
        
        // Add day cells (including Saturday)
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        days.forEach(day => {
            const dayCell = document.createElement('td');
            dayCell.className = 'timetable-slot empty-slot';
            dayCell.dataset.day = day;
            dayCell.dataset.period = newPeriodNumber;
            dayCell.dataset.grade = grade;
            dayCell.innerHTML = `
                <div class="add-class-btn">
                    <i class="fas fa-plus"></i>
                    <span>Add Class</span>
                </div>
            `;
            
            // Add click event
            dayCell.addEventListener('click', function() {
                const day = this.dataset.day;
                const period = this.dataset.period;
                const grade = this.dataset.grade;
                const isFilled = this.classList.contains('filled-slot');
                
                // Show class edit modal
                if (typeof showClassEditModal === 'function') {
                    showClassEditModal(this, day, period, grade, isFilled);
                } else {
                    // Fallback
                    alert(`Add class to ${day}, Period ${period}`);
                }
            });
            
            newRow.appendChild(dayCell);
        });
        
        // Add to timetable
        timetable.appendChild(newRow);
        
        // Add edit time functionality to new period cell
        periodCell.querySelector('.time-edit-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Get period number and time
            const periodNumber = periodCell.querySelector('.period-number')?.textContent;
            const periodTime = periodCell.querySelector('.period-time')?.textContent;
            
            // Show time slot editor
            if (typeof showSingleTimeSlotEditor === 'function') {
                showSingleTimeSlotEditor(periodCell, periodNumber, newStartTime, newEndTime);
            } else {
                // Fallback
                alert(`Edit time for Period ${periodNumber}`);
            }
        });
        
        // Show success message
        const timetableAlert = document.getElementById('timetableAlert');
        if (timetableAlert) {
            timetableAlert.innerHTML = '<i class="fas fa-check-circle"></i> New period added successfully!';
            timetableAlert.className = 'alert alert-success';
            timetableAlert.style.display = 'block';
            
            setTimeout(() => {
                timetableAlert.style.display = 'none';
            }, 5000);
        }
    }
    
    // Fix teacher dropdown to only use Firebase data
    function fixTeacherDropdown() {
        // Create a MutationObserver to watch for the modal being added to the DOM
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.id === 'classEditModal') {
                            // Modal has been added to the DOM
                            setupTeacherDropdown();
                            break;
                        }
                    }
                }
            });
        });
        
        // Start observing the document body for changes
        observer.observe(document.body, { childList: true });
        
        // Also check if modal already exists
        if (document.getElementById('classEditModal')) {
            setupTeacherDropdown();
        }
    }
    
    // Setup teacher dropdown
    function setupTeacherDropdown() {
        // Find the teacher field
        const teacherField = document.querySelector('#classEditModal .form-group:has(#classEditTeacher)');
        if (!teacherField) return;
        
        // Create select element if it doesn't exist
        let teacherSelect = document.getElementById('classEditTeacher');
        if (teacherSelect && teacherSelect.tagName !== 'SELECT') {
            // Replace input with select
            const teacherInput = teacherSelect;
            teacherSelect = document.createElement('select');
            teacherSelect.id = 'classEditTeacher';
            teacherSelect.className = 'form-control';
            teacherSelect.innerHTML = '<option value="">Loading teachers...</option>';
            
            if (teacherInput.parentNode) {
                teacherInput.parentNode.replaceChild(teacherSelect, teacherInput);
            }
        }
        
        // Load teachers from Firebase
        firebase.database().ref('users').orderByChild('role').equalTo('teacher').once('value')
            .then((snapshot) => {
                // Clear existing options
                teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
                
                if (snapshot.exists()) {
                    // Add teachers from database
                    snapshot.forEach((childSnapshot) => {
                        const teacher = childSnapshot.val();
                        const teacherName = teacher.name || teacher.email || `Teacher ${childSnapshot.key}`;
                        
                        const option = document.createElement('option');
                        option.value = teacherName;
                        option.textContent = teacherName;
                        teacherSelect.appendChild(option);
                    });
                    
                    console.log(`Loaded ${teacherSelect.options.length - 1} teachers from Firebase`);
                } else {
                    // No teachers found
                    teacherSelect.innerHTML = '<option value="">No teachers found</option>';
                    console.log('No teachers found in Firebase');
                }
            })
            .catch(error => {
                console.error('Error loading teachers:', error);
                teacherSelect.innerHTML = '<option value="">Error loading teachers</option>';
            });
    }
    
    // Fix header display
    function fixHeaderDisplay() {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return;
        firebase.database().ref('users/' + currentUser.uid).once('value')
            .then(snapshot => {
                const profile = snapshot.val() || {};
                window.updateTeacherHeaderName?.(profile.name || currentUser.displayName || currentUser.email || 'Teacher');
            })
            .catch(error => console.warn('Could not update teacher header name:', error));
    }
});
