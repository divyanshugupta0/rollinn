// Timetable Final - Adds class editing and section selection
document.addEventListener('DOMContentLoaded', function() {
    // Apply final improvements after timetable is loaded
    setTimeout(finalizeTimetable, 1200);
    
    function finalizeTimetable() {
        // Remove add new class button
        removeAddClassButton();
        
        // Add class editing functionality
        addClassEditingFunctionality();
        
        // Add section selection to grade dropdown
        addSectionSelection();
    }
    
    // Remove add new class button
    function removeAddClassButton() {
        const addClassBtn = document.getElementById('addClassToTimetableBtn');
        if (addClassBtn) {
            addClassBtn.style.display = 'none';
        }
    }
    
    // Add class editing functionality
    function addClassEditingFunctionality() {
        // Add click event to timetable slots
        document.addEventListener('click', function(e) {
            const timetableSlot = e.target.closest('.timetable-slot');
            if (timetableSlot) {
                const day = timetableSlot.dataset.day;
                const period = timetableSlot.dataset.period;
                const grade = timetableSlot.dataset.grade;
                const isFilled = timetableSlot.classList.contains('filled-slot');
                
                // Show class edit modal
                showClassEditModal(timetableSlot, day, period, grade, isFilled);
            }
        });
        
        // Create class edit modal
        createClassEditModal();
    }
    
    // Create class edit modal
    function createClassEditModal() {
        // Check if modal already exists
        if (document.getElementById('classEditModal')) return;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'classEditModal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3 id="classEditModalTitle"><i class="fas fa-book"></i> Add Class</h3>
                    <button class="close-btn" id="closeClassEditModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <form id="classEditForm">
                        <div class="form-group">
                            <label for="classEditDay">Day</label>
                            <input type="text" id="classEditDay" class="form-control" readonly>
                        </div>
                        <div class="form-group">
                            <label for="classEditPeriod">Period</label>
                            <input type="text" id="classEditPeriod" class="form-control" readonly>
                        </div>
                        <div class="form-group">
                            <label for="classEditTime">Time</label>
                            <input type="text" id="classEditTime" class="form-control" readonly>
                        </div>
                        <div class="form-group">
                            <label for="classEditSubject"><i class="fas fa-book"></i> Subject</label>
                            <input type="text" id="classEditSubject" class="form-control" required placeholder="e.g. Mathematics, Science">
                        </div>
                        <div class="form-group">
                            <label for="classEditTeacher"><i class="fas fa-user-tie"></i> Teacher</label>
                            <input type="text" id="classEditTeacher" class="form-control" placeholder="Teacher name">
                        </div>
                        <div class="form-group">
                            <label for="classEditRoom"><i class="fas fa-door-open"></i> Room/Location</label>
                            <input type="text" id="classEditRoom" class="form-control" placeholder="e.g. Room 101, Lab 2">
                        </div>
                        <div class="form-group">
                            <label for="classEditSection"><i class="fas fa-users"></i> Section</label>
                            <select id="classEditSection" class="form-control">
                                <option value="A">Section A</option>
                                <option value="B">Section B</option>
                                <option value="C">Section C</option>
                                <option value="D">Section D</option>
                                <option value="All">All Sections</option>
                            </select>
                        </div>
                        <input type="hidden" id="classEditSlotId">
                    </form>
                </div>
                <div class="modal-actions">
                    <button type="button" class="primary-btn" id="saveClassEditBtn">
                        <i class="fas fa-save"></i> Save Class
                    </button>
                    <button type="button" class="secondary-btn" id="cancelClassEditBtn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button type="button" class="danger-btn" id="removeClassBtn" style="display: none;">
                        <i class="fas fa-trash"></i> Remove Class
                    </button>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('closeClassEditModal').addEventListener('click', hideClassEditModal);
        document.getElementById('cancelClassEditBtn').addEventListener('click', hideClassEditModal);
        document.getElementById('saveClassEditBtn').addEventListener('click', saveClassEdit);
        document.getElementById('removeClassBtn').addEventListener('click', removeClass);
    }
    
    // Show class edit modal
    function showClassEditModal(slot, day, period, grade, isFilled) {
        const modal = document.getElementById('classEditModal');
        if (!modal) return;
        
        // Get period time
        const periodCell = document.querySelector(`.period-cell:nth-child(${parseInt(period) + 1})`);
        const periodTime = periodCell ? periodCell.querySelector('.period-time').textContent : '';
        
        // Set form values
        document.getElementById('classEditDay').value = day.charAt(0).toUpperCase() + day.slice(1);
        document.getElementById('classEditPeriod').value = period;
        document.getElementById('classEditTime').value = periodTime;
        document.getElementById('classEditSlotId').value = `${day}_${period}_${grade}`;
        
        // Set title and button visibility based on whether slot is filled
        const modalTitle = document.getElementById('classEditModalTitle');
        const removeClassBtn = document.getElementById('removeClassBtn');
        
        if (isFilled) {
            modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Class';
            removeClassBtn.style.display = 'block';
            
            // Get existing class data
            const subject = slot.querySelector('.slot-subject')?.textContent || '';
            const teacher = slot.querySelector('.slot-teacher')?.textContent.replace('Teacher: ', '') || '';
            const room = slot.querySelector('.slot-room')?.textContent.replace('Room: ', '') || '';
            const section = slot.dataset.section || 'A';
            
            // Set form values
            document.getElementById('classEditSubject').value = subject;
            document.getElementById('classEditTeacher').value = teacher;
            document.getElementById('classEditRoom').value = room;
            document.getElementById('classEditSection').value = section;
        } else {
            modalTitle.innerHTML = '<i class="fas fa-plus"></i> Add Class';
            removeClassBtn.style.display = 'none';
            
            // Reset form
            document.getElementById('classEditForm').reset();
            document.getElementById('classEditDay').value = day.charAt(0).toUpperCase() + day.slice(1);
            document.getElementById('classEditPeriod').value = period;
            document.getElementById('classEditTime').value = periodTime;
        }
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Hide class edit modal
    function hideClassEditModal() {
        const modal = document.getElementById('classEditModal');
        if (modal) modal.style.display = 'none';
    }
    
    // Save class edit
    function saveClassEdit() {
        // Get form values
        const slotId = document.getElementById('classEditSlotId').value;
        const subject = document.getElementById('classEditSubject').value;
        const teacher = document.getElementById('classEditTeacher').value;
        const room = document.getElementById('classEditRoom').value;
        const section = document.getElementById('classEditSection').value;
        
        if (!subject) {
            alert('Subject is required');
            return;
        }
        
        // Parse slot ID
        const [day, period, grade] = slotId.split('_');
        
        // Find the slot
        const slot = document.querySelector(`.timetable-slot[data-day="${day}"][data-period="${period}"][data-grade="${grade}"]`);
        if (!slot) return;
        
        // Update slot
        slot.className = 'timetable-slot filled-slot';
        slot.dataset.section = section;
        slot.innerHTML = `
            <div class="slot-subject">${subject}</div>
            <div class="slot-teacher"><i class="fas fa-user-tie"></i> ${teacher}</div>
            <div class="slot-room"><i class="fas fa-door-open"></i> ${room}</div>
            <div class="slot-section"><i class="fas fa-users"></i> Section ${section}</div>
        `;
        
        // Hide modal
        hideClassEditModal();
        
        // Show success message
        showAlert(document.getElementById('timetableAlert'), 
            `<i class="fas fa-check-circle"></i> Class ${subject} saved successfully!`, 'success');
    }
    
    // Remove class
    function removeClass() {
        if (confirm('Are you sure you want to remove this class?')) {
            // Get slot ID
            const slotId = document.getElementById('classEditSlotId').value;
            const [day, period, grade] = slotId.split('_');
            
            // Find the slot
            const slot = document.querySelector(`.timetable-slot[data-day="${day}"][data-period="${period}"][data-grade="${grade}"]`);
            if (!slot) return;
            
            // Clear slot
            slot.className = 'timetable-slot empty-slot';
            slot.innerHTML = `
                <div class="add-class-btn">
                    <i class="fas fa-plus"></i>
                    <span>Add Class</span>
                </div>
            `;
            
            // Hide modal
            hideClassEditModal();
            
            // Show success message
            showAlert(document.getElementById('timetableAlert'), 
                '<i class="fas fa-check-circle"></i> Class removed successfully!', 'success');
        }
    }
    
    // Add section selection to grade dropdown
    function addSectionSelection() {
        const gradeSelector = document.getElementById('gradeSelector');
        if (!gradeSelector) return;
        
        // Get current options
        const currentOptions = Array.from(gradeSelector.options).map(opt => opt.value);
        
        // Clear options
        gradeSelector.innerHTML = '<option value="">Select Grade/Class</option>';
        
        // Add options with sections
        for (let i = 1; i <= 12; i++) {
            const gradeOptgroup = document.createElement('optgroup');
            gradeOptgroup.label = `Grade ${i}`;
            
            // Add sections
            gradeOptgroup.innerHTML = `
                <option value="${i}-A">Grade ${i} (Section A)</option>
                <option value="${i}-B">Grade ${i} (Section B)</option>
                <option value="${i}-C">Grade ${i} (Section C)</option>
            `;
            
            gradeSelector.appendChild(gradeOptgroup);
        }
        
        // Add styles for optgroup
        const style = document.createElement('style');
        style.textContent = `
            optgroup {
                font-weight: bold;
                color: #2E7D32;
                background-color: #f1f8e9;
            }
            
            .slot-section {
                font-size: 12px;
                color: #555;
                margin-top: 5px;
                display: flex;
                align-items: center;
                gap: 5px;
                font-style: italic;
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