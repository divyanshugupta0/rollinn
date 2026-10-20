// Timetable Content - Adds default content to the timetable section
document.addEventListener('DOMContentLoaded', function() {
    // Add default content to timetable section
    setTimeout(addDefaultTimetableContent, 500);
    
    function addDefaultTimetableContent() {
        const timetableSection = document.getElementById('timetableSection');
        if (!timetableSection) return;
        
        // Check if timetable section already has content
        if (timetableSection.querySelector('.timetable-manager')) return;
        
        // Create default timetable content
        const timetableContent = document.createElement('div');
        timetableContent.className = 'timetable-manager';
        timetableContent.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-calendar-alt"></i> Manage Class Timetable</h2>
                <button id="addClassToTimetableBtn" class="primary-btn"><i class="fas fa-plus"></i> Add New Class</button>
            </div>
            
            <div class="class-filters">
                <div class="form-group">
                    <label for="gradeSelector"><i class="fas fa-graduation-cap"></i> Select Grade/Class</label>
                    <select id="gradeSelector" class="form-control">
                        <option value="">Select Grade/Class</option>
                        <option value="1">Grade 1</option>
                        <option value="2">Grade 2</option>
                        <option value="3">Grade 3</option>
                        <option value="4">Grade 4</option>
                        <option value="5">Grade 5</option>
                        <option value="6">Grade 6</option>
                        <option value="7">Grade 7</option>
                        <option value="8">Grade 8</option>
                        <option value="9">Grade 9</option>
                        <option value="10">Grade 10</option>
                        <option value="11">Grade 11</option>
                        <option value="12">Grade 12</option>
                    </select>
                </div>
                <button id="saveTimetableBtn" class="primary-btn"><i class="fas fa-save"></i> Save Timetable</button>
            </div>
            
            <div id="timetableContainer" class="timetable-container">
                <div class="empty-state">
                    <i class="fas fa-calendar-alt"></i>
                    <p>Select a grade/class to view or edit its timetable</p>
                </div>
            </div>
        `;
        
        // Add to timetable section
        timetableSection.appendChild(timetableContent);
        
        // Add event listener for grade selector
        const gradeSelector = document.getElementById('gradeSelector');
        if (gradeSelector) {
            gradeSelector.addEventListener('change', function() {
                const grade = this.value;
                if (grade) {
                    showSampleTimetable(grade);
                } else {
                    document.getElementById('timetableContainer').innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-calendar-alt"></i>
                            <p>Select a grade/class to view or edit its timetable</p>
                        </div>
                    `;
                }
            });
        }
        
        // Add event listener for save button
        const saveTimetableBtn = document.getElementById('saveTimetableBtn');
        if (saveTimetableBtn) {
            saveTimetableBtn.addEventListener('click', function() {
                const grade = document.getElementById('gradeSelector').value;
                if (grade) {
                    showAlert(document.getElementById('timetableAlert'), 
                        '<i class="fas fa-check-circle"></i> Timetable saved successfully!', 'success');
                } else {
                    showAlert(document.getElementById('timetableAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Please select a grade/class first', 'error');
                }
            });
        }
        
        // Add event listener for add class button
        const addClassBtn = document.getElementById('addClassToTimetableBtn');
        if (addClassBtn) {
            addClassBtn.addEventListener('click', function() {
                const grade = document.getElementById('gradeSelector').value;
                if (grade) {
                    showAlert(document.getElementById('timetableAlert'), 
                        '<i class="fas fa-info-circle"></i> Click on an empty slot in the timetable to add a class', 'info');
                } else {
                    showAlert(document.getElementById('timetableAlert'), 
                        '<i class="fas fa-exclamation-triangle"></i> Please select a grade/class first', 'error');
                }
            });
        }
    }
    
    // Show sample timetable for selected grade
    window.showSampleTimetable = function(grade) {
        const timetableContainer = document.getElementById('timetableContainer');
        if (!timetableContainer) return;
        
        // Define days and periods
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periods = [
            { id: 1, time: '8:00 - 8:45' },
            { id: 2, time: '8:50 - 9:35' },
            { id: 3, time: '9:40 - 10:25' },
            { id: 4, time: '10:40 - 11:25' },
            { id: 5, time: '11:30 - 12:15' },
            { id: 6, time: '12:20 - 13:05' }
        ];
        
        // Create sample subjects based on grade
        const subjects = ['Mathematics', 'Science', 'English', 'History', 'Geography', 'Art', 'Music', 'Physical Education'];
        
        // Create timetable HTML
        let timetableHTML = `
            <div class="timetable">
                <table>
                    <thead>
                        <tr>
                            <th class="period-header">Period</th>
                            ${days.map(day => `<th>${day}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Add rows for each period
        periods.forEach(period => {
            timetableHTML += `
                <tr>
                    <td class="period-cell">
                        <div class="period-number">${period.id}</div>
                        <div class="period-time">${period.time}</div>
                    </td>
            `;
            
            // Add cells for each day
            days.forEach(day => {
                // Randomly decide if this slot has a class
                const hasClass = Math.random() > 0.6;
                
                if (hasClass) {
                    // Select a random subject
                    const subject = subjects[Math.floor(Math.random() * subjects.length)];
                    const teacher = ['Mr. Smith', 'Ms. Johnson', 'Mrs. Davis', 'Mr. Wilson'][Math.floor(Math.random() * 4)];
                    const room = `Room ${Math.floor(Math.random() * 20) + 101}`;
                    
                    timetableHTML += `
                        <td class="timetable-slot filled-slot" data-day="${day.toLowerCase()}" data-period="${period.id}" data-grade="${grade}">
                            <div class="slot-subject">${subject}</div>
                            <div class="slot-teacher"><i class="fas fa-user-tie"></i> ${teacher}</div>
                            <div class="slot-room"><i class="fas fa-door-open"></i> ${room}</div>
                        </td>
                    `;
                } else {
                    // Empty slot
                    timetableHTML += `
                        <td class="timetable-slot empty-slot" data-day="${day.toLowerCase()}" data-period="${period.id}" data-grade="${grade}">
                            <div class="add-class-btn">
                                <i class="fas fa-plus"></i>
                                <span>Add Class</span>
                            </div>
                        </td>
                    `;
                }
            });
            
            timetableHTML += `</tr>`;
        });
        
        timetableHTML += `
                    </tbody>
                </table>
            </div>
        `;
        
        // Set timetable HTML
        timetableContainer.innerHTML = timetableHTML;
        
        // Add event listeners to slots
        document.querySelectorAll('.timetable-slot').forEach(slot => {
            slot.addEventListener('click', function() {
                const day = this.dataset.day;
                const period = this.dataset.period;
                const grade = this.dataset.grade;
                const isFilled = this.classList.contains('filled-slot');
                
                if (isFilled) {
                    showAlert(document.getElementById('timetableAlert'), 
                        `<i class="fas fa-info-circle"></i> Class on ${day}, Period ${period} selected`, 'info');
                } else {
                    showAlert(document.getElementById('timetableAlert'), 
                        `<i class="fas fa-plus-circle"></i> Adding class to ${day}, Period ${period}`, 'info');
                }
            });
        });
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