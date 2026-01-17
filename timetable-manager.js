// Timetable Manager - Adds timetable functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize timetable section
    initTimetableSection();
    
    function initTimetableSection() {
        const timetableSection = document.getElementById('timetableSection');
        if (!timetableSection) return;
        
        // Add timetable UI
        const timetableManager = document.createElement('div');
        timetableManager.className = 'timetable-manager';
        timetableManager.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-calendar-alt"></i> Class Timetable</h2>
                <div class="timetable-actions">
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
                    <button id="saveTimetableBtn" class="primary-btn"><i class="fas fa-save"></i> Save Timetable</button>
                </div>
            </div>
            
            <div id="timetableContainer" class="timetable-container">
                <div class="empty-state">
                    <i class="fas fa-calendar-alt"></i>
                    <p>Select a grade/class to view or edit its timetable</p>
                </div>
            </div>
        `;
        
        timetableSection.appendChild(timetableManager);
        
        // Add timetable slot modal
        const timetableModal = document.createElement('div');
        timetableModal.className = 'modal-overlay';
        timetableModal.id = 'timetableModal';
        timetableModal.style.display = 'none';
        timetableModal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="fas fa-calendar-plus"></i> <span id="timetableModalTitle">Add Class to Timetable</span></h3>
                    <button class="close-btn" id="closeTimetableModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <form id="timetableSlotForm">
                        <div class="form-group">
                            <label for="slotSubject"><i class="fas fa-book"></i> Subject</label>
                            <input type="text" id="slotSubject" class="form-control" required placeholder="e.g. Mathematics, Physics">
                        </div>
                        
                        <div class="form-group">
                            <label for="slotTeacher"><i class="fas fa-user-tie"></i> Teacher</label>
                            <input type="text" id="slotTeacher" class="form-control" placeholder="Teacher name">
                        </div>
                        
                        <div class="form-group">
                            <label for="slotRoom"><i class="fas fa-door-open"></i> Room/Location</label>
                            <input type="text" id="slotRoom" class="form-control" placeholder="e.g. Room 101, Building A">
                        </div>
                        
                        <div class="form-group" style="display: none;">
                            <input type="hidden" id="slotDay" value="">
                            <input type="hidden" id="slotPeriod" value="">
                            <input type="hidden" id="slotGrade" value="">
                        </div>
                        
                        <div class="modal-actions">
                            <button type="submit" class="primary-btn" id="saveSlotBtn">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <button type="button" class="secondary-btn" id="cancelSlotBtn">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                            <button type="button" class="danger-btn" id="removeSlotBtn" style="display: none;">
                                <i class="fas fa-trash"></i> Remove
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(timetableModal);
        
        // Add styles
        addStyles();
        
        // Add event listeners
        document.getElementById('gradeSelector').addEventListener('change', loadTimetable);
        document.getElementById('saveTimetableBtn').addEventListener('click', saveTimetable);
        document.getElementById('closeTimetableModal').addEventListener('click', hideTimetableModal);
        document.getElementById('cancelSlotBtn').addEventListener('click', hideTimetableModal);
        document.getElementById('timetableSlotForm').addEventListener('submit', saveSlot);
        document.getElementById('removeSlotBtn').addEventListener('click', removeSlot);
    }
    
    // Load timetable for selected grade
    function loadTimetable() {
        const gradeSelector = document.getElementById('gradeSelector');
        const grade = gradeSelector.value;
        
        if (!grade) {
            document.getElementById('timetableContainer').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-alt"></i>
                    <p>Select a grade/class to view or edit its timetable</p>
                </div>
            `;
            return;
        }
        
        // Show loading indicator
        document.getElementById('timetableContainer').innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
            </div>
        `;
        
        // Load timetable from Firebase
        firebase.database().ref(`timetables/grade${grade}`).once('value')
            .then((snapshot) => {
                // Create timetable structure
                createTimetableStructure(grade, snapshot.val() || {});
            })
            .catch((error) => {
                console.error('Error loading timetable:', error);
                document.getElementById('timetableContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Error loading timetable: ${error.message}</p>
                    </div>
                `;
            });
    }
    
    // Create timetable structure
    function createTimetableStructure(grade, timetableData) {
        const container = document.getElementById('timetableContainer');
        
        // Define days and periods
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const periods = [
            { id: 1, time: '8:00 - 8:45' },
            { id: 2, time: '8:50 - 9:35' },
            { id: 3, time: '9:40 - 10:25' },
            { id: 4, time: '10:40 - 11:25' },
            { id: 5, time: '11:30 - 12:15' },
            { id: 6, time: '12:20 - 13:05' },
            { id: 7, time: '13:45 - 14:30' },
            { id: 8, time: '14:35 - 15:20' }
        ];
        
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
                const dayKey = day.toLowerCase();
                const slotKey = `${dayKey}_${period.id}`;
                const slotData = timetableData[slotKey] || {};
                
                if (slotData.subject) {
                    // Slot has data
                    timetableHTML += `
                        <td class="timetable-slot filled-slot" data-day="${dayKey}" data-period="${period.id}" data-grade="${grade}">
                            <div class="slot-subject">${slotData.subject}</div>
                            ${slotData.teacher ? `<div class="slot-teacher"><i class="fas fa-user-tie"></i> ${slotData.teacher}</div>` : ''}
                            ${slotData.room ? `<div class="slot-room"><i class="fas fa-door-open"></i> ${slotData.room}</div>` : ''}
                        </td>
                    `;
                } else {
                    // Empty slot
                    timetableHTML += `
                        <td class="timetable-slot empty-slot" data-day="${dayKey}" data-period="${period.id}" data-grade="${grade}">
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
        container.innerHTML = timetableHTML;
        
        // Add event listeners to slots
        document.querySelectorAll('.timetable-slot').forEach(slot => {
            slot.addEventListener('click', function() {
                const day = this.dataset.day;
                const period = this.dataset.period;
                const grade = this.dataset.grade;
                const isFilled = this.classList.contains('filled-slot');
                
                showTimetableModal(day, period, grade, isFilled);
            });
        });
    }
    
    // Show timetable slot modal
    function showTimetableModal(day, period, grade, isFilled) {
        const modal = document.getElementById('timetableModal');
        const form = document.getElementById('timetableSlotForm');
        const title = document.getElementById('timetableModalTitle');
        const removeBtn = document.getElementById('removeSlotBtn');
        
        // Set hidden fields
        document.getElementById('slotDay').value = day;
        document.getElementById('slotPeriod').value = period;
        document.getElementById('slotGrade').value = grade;
        
        if (isFilled) {
            // Edit existing slot
            title.textContent = 'Edit Class in Timetable';
            removeBtn.style.display = 'block';
            
            // Load slot data
            const slotKey = `${day}_${period}`;
            firebase.database().ref(`timetables/grade${grade}/${slotKey}`).once('value')
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const slotData = snapshot.val();
                        document.getElementById('slotSubject').value = slotData.subject || '';
                        document.getElementById('slotTeacher').value = slotData.teacher || '';
                        document.getElementById('slotRoom').value = slotData.room || '';
                    }
                });
        } else {
            // Add new slot
            title.textContent = 'Add Class to Timetable';
            removeBtn.style.display = 'none';
            
            // Reset form
            form.reset();
        }
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Hide timetable modal
    function hideTimetableModal() {
        document.getElementById('timetableModal').style.display = 'none';
    }
    
    // Save slot
    function saveSlot(e) {
        e.preventDefault();
        
        const day = document.getElementById('slotDay').value;
        const period = document.getElementById('slotPeriod').value;
        const grade = document.getElementById('slotGrade').value;
        const subject = document.getElementById('slotSubject').value;
        const teacher = document.getElementById('slotTeacher').value;
        const room = document.getElementById('slotRoom').value;
        
        // Create slot data
        const slotData = {
            subject: subject,
            teacher: teacher,
            room: room,
            updatedAt: Date.now()
        };
        
        // Save to Firebase
        const slotKey = `${day}_${period}`;
        firebase.database().ref(`timetables/grade${grade}/${slotKey}`).update(slotData)
            .then(() => {
                hideTimetableModal();
                
                // Show success message
                const timetableSection = document.getElementById('timetableSection');
                if (timetableSection) {
                    const alertElement = document.createElement('div');
                    alertElement.className = 'alert alert-success';
                    alertElement.innerHTML = '<i class="fas fa-check-circle"></i> Timetable slot updated successfully!';
                    alertElement.style.display = 'block';
                    
                    timetableSection.insertBefore(alertElement, timetableSection.firstChild);
                    
                    // Hide alert after 5 seconds
                    setTimeout(() => {
                        alertElement.remove();
                    }, 5000);
                }
                
                // Reload timetable
                loadTimetable();
            })
            .catch((error) => {
                console.error('Error saving slot:', error);
                alert('Error saving slot: ' + error.message);
            });
    }
    
    // Remove slot
    function removeSlot() {
        const day = document.getElementById('slotDay').value;
        const period = document.getElementById('slotPeriod').value;
        const grade = document.getElementById('slotGrade').value;
        
        if (confirm('Are you sure you want to remove this class from the timetable?')) {
            // Remove from Firebase
            const slotKey = `${day}_${period}`;
            firebase.database().ref(`timetables/grade${grade}/${slotKey}`).remove()
                .then(() => {
                    hideTimetableModal();
                    
                    // Show success message
                    const timetableSection = document.getElementById('timetableSection');
                    if (timetableSection) {
                        const alertElement = document.createElement('div');
                        alertElement.className = 'alert alert-success';
                        alertElement.innerHTML = '<i class="fas fa-check-circle"></i> Timetable slot removed successfully!';
                        alertElement.style.display = 'block';
                        
                        timetableSection.insertBefore(alertElement, timetableSection.firstChild);
                        
                        // Hide alert after 5 seconds
                        setTimeout(() => {
                            alertElement.remove();
                        }, 5000);
                    }
                    
                    // Reload timetable
                    loadTimetable();
                })
                .catch((error) => {
                    console.error('Error removing slot:', error);
                    alert('Error removing slot: ' + error.message);
                });
        }
    }
    
    // Save entire timetable
    function saveTimetable() {
        const grade = document.getElementById('gradeSelector').value;
        
        if (!grade) {
            alert('Please select a grade/class first');
            return;
        }
        
        // Show confirmation
        if (confirm('Are you sure you want to save the current timetable?')) {
            // Get timetable data
            firebase.database().ref(`timetables/grade${grade}`).once('value')
                .then((snapshot) => {
                    const timetableData = snapshot.val() || {};
                    
                    // Add metadata
                    timetableData._meta = {
                        lastSaved: Date.now(),
                        savedBy: firebase.auth().currentUser?.uid || 'unknown'
                    };
                    
                    // Save to Firebase
                    firebase.database().ref(`timetables/grade${grade}`).update(timetableData)
                        .then(() => {
                            // Show success message
                            const timetableSection = document.getElementById('timetableSection');
                            if (timetableSection) {
                                const alertElement = document.createElement('div');
                                alertElement.className = 'alert alert-success';
                                alertElement.innerHTML = '<i class="fas fa-check-circle"></i> Timetable saved successfully!';
                                alertElement.style.display = 'block';
                                
                                timetableSection.insertBefore(alertElement, timetableSection.firstChild);
                                
                                // Hide alert after 5 seconds
                                setTimeout(() => {
                                    alertElement.remove();
                                }, 5000);
                            }
                        })
                        .catch((error) => {
                            console.error('Error saving timetable:', error);
                            alert('Error saving timetable: ' + error.message);
                        });
                });
        }
    }
    
    // Add styles
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .timetable-manager {
                background: white;
                border-radius: 16px;
                padding: 25px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
                border: 1px solid rgba(0, 0, 0, 0.05);
                margin-bottom: 25px;
            }
            
            .timetable-actions {
                display: flex;
                gap: 15px;
            }
            
            .timetable {
                margin-top: 20px;
                overflow-x: auto;
            }
            
            .timetable table {
                width: 100%;
                border-collapse: collapse;
                border-spacing: 0;
                background: white;
            }
            
            .timetable th, .timetable td {
                border: 1px solid #e9ecef;
                padding: 0;
                text-align: center;
            }
            
            .timetable th {
                background: #f8f9fa;
                padding: 15px;
                font-weight: 600;
                color: #495057;
            }
            
            .period-header {
                width: 100px;
            }
            
            .period-cell {
                background: #f8f9fa;
                padding: 10px;
                text-align: center;
            }
            
            .period-number {
                font-size: 18px;
                font-weight: 600;
                color: #495057;
            }
            
            .period-time {
                font-size: 12px;
                color: #6c757d;
                margin-top: 5px;
            }
            
            .timetable-slot {
                height: 100px;
                width: calc((100% - 100px) / 6);
                padding: 10px;
                vertical-align: top;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .timetable-slot:hover {
                background: #f8f9fa;
            }
            
            .empty-slot {
                background: #f8f9fa;
            }
            
            .filled-slot {
                background: #e8f5e9;
            }
            
            .add-class-btn {
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #adb5bd;
                transition: all 0.3s ease;
            }
            
            .add-class-btn i {
                font-size: 24px;
                margin-bottom: 5px;
            }
            
            .add-class-btn span {
                font-size: 12px;
            }
            
            .empty-slot:hover .add-class-btn {
                color: #66bb6a;
            }
            
            .slot-subject {
                font-weight: 600;
                color: #2e7d32;
                margin-bottom: 5px;
                font-size: 14px;
            }
            
            .slot-teacher, .slot-room {
                font-size: 12px;
                color: #555;
                margin-top: 3px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .danger-btn {
                background: linear-gradient(135deg, #ff5252, #f44336);
                color: white;
                border: none;
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
            
            .danger-btn:hover {
                background: linear-gradient(135deg, #f44336, #d32f2f);
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(244, 67, 54, 0.3);
            }
            
            @media (max-width: 992px) {
                .timetable-actions {
                    flex-direction: column;
                }
                
                .timetable th, .timetable td {
                    font-size: 12px;
                }
                
                .period-number {
                    font-size: 14px;
                }
                
                .period-time {
                    font-size: 10px;
                }
            }
        `;
        document.head.appendChild(style);
    }
});