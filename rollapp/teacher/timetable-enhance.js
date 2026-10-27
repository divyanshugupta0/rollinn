// Timetable Enhancements - Adds time slot customization
document.addEventListener('DOMContentLoaded', function() {
    // Add time slot customization after timetable is loaded
    setTimeout(enhanceTimetable, 1000);
    
    function enhanceTimetable() {
        // Add time slot customization controls
        addTimeSlotControls();
        
        // Add edit modal for time slots
        addTimeSlotEditModal();
    }
    
    // Add time slot customization controls
    function addTimeSlotControls() {
        const timetableContainer = document.getElementById('timetableContainer');
        if (!timetableContainer) return;
        
        // Create time slot controls
        const timeSlotControls = document.createElement('div');
        timeSlotControls.className = 'time-slot-controls';
        timeSlotControls.innerHTML = `
            <div class="form-group">
                <label><i class="fas fa-clock"></i> Customize Time Slots</label>
                <div class="time-slot-actions">
                    <button id="editTimeSlotsBtn" class="secondary-btn">
                        <i class="fas fa-edit"></i> Edit Time Slots
                    </button>
                    <button id="addPeriodBtn" class="secondary-btn">
                        <i class="fas fa-plus"></i> Add Period
                    </button>
                    <button id="resetTimeSlotsBtn" class="secondary-btn">
                        <i class="fas fa-undo"></i> Reset to Default
                    </button>
                </div>
            </div>
        `;
        
        // Insert before timetable
        const timetableElement = timetableContainer.querySelector('.timetable');
        if (timetableElement && timetableElement.parentNode === timetableContainer) {
            timetableElement.parentNode.insertBefore(timeSlotControls, timetableElement);
        } else {
            timetableContainer.insertBefore(timeSlotControls, timetableContainer.firstChild);
        }
        
        // Add event listeners
        document.getElementById('editTimeSlotsBtn')?.addEventListener('click', showTimeSlotEditor);
        document.getElementById('addPeriodBtn')?.addEventListener('click', addNewPeriod);
        document.getElementById('resetTimeSlotsBtn')?.addEventListener('click', resetTimeSlots);
    }
    
    // Add time slot edit modal
    function addTimeSlotEditModal() {
        // Check if modal already exists
        if (document.getElementById('timeSlotModal')) return;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'timeSlotModal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="fas fa-clock"></i> Edit Time Slots</h3>
                    <button class="close-btn" id="closeTimeSlotModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="time-slots-list" id="timeSlotsListEdit">
                        <!-- Time slots will be loaded here -->
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="primary-btn" id="saveTimeSlotsBtn">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                    <button type="button" class="secondary-btn" id="cancelTimeSlotBtn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('closeTimeSlotModal')?.addEventListener('click', hideTimeSlotEditor);
        document.getElementById('cancelTimeSlotBtn')?.addEventListener('click', hideTimeSlotEditor);
        document.getElementById('saveTimeSlotsBtn')?.addEventListener('click', saveTimeSlots);
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .time-slot-controls {
                margin-bottom: 20px;
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }
            
            .time-slot-actions {
                display: flex;
                gap: 10px;
                margin-top: 10px;
                flex-wrap: wrap;
            }
            
            .time-slots-list {
                max-height: 400px;
                overflow-y: auto;
            }
            
            .time-slot-item {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 15px;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }
            
            .time-slot-number {
                font-weight: bold;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #4CAF50;
                color: white;
                border-radius: 50%;
            }
            
            .time-slot-inputs {
                display: flex;
                gap: 10px;
                flex: 1;
            }
            
            .time-slot-inputs input {
                flex: 1;
            }
            
            .time-slot-actions-item {
                display: flex;
                gap: 5px;
            }
            
            .time-slot-actions-item button {
                padding: 5px 10px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                transition: all 0.3s;
            }
            
            .time-slot-move-up {
                background: #2196F3;
                color: white;
            }
            
            .time-slot-move-down {
                background: #2196F3;
                color: white;
            }
            
            .time-slot-delete {
                background: #F44336;
                color: white;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show time slot editor
    function showTimeSlotEditor() {
        const modal = document.getElementById('timeSlotModal');
        if (!modal) return;
        
        // Get current time slots
        const timeSlots = getCurrentTimeSlots();
        
        // Populate time slots list
        const timeSlotsList = document.getElementById('timeSlotsListEdit');
        if (!timeSlotsList) return;
        
        timeSlotsList.innerHTML = '';
        
        timeSlots.forEach((slot, index) => {
            const slotItem = document.createElement('div');
            slotItem.className = 'time-slot-item';
            slotItem.innerHTML = `
                <div class="time-slot-number">${index + 1}</div>
                <div class="time-slot-inputs">
                    <input type="time" class="form-control time-start" value="${slot.start}" required>
                    <span>to</span>
                    <input type="time" class="form-control time-end" value="${slot.end}" required>
                </div>
                <div class="time-slot-actions-item">
                    <button class="time-slot-move-up" ${index === 0 ? 'disabled' : ''}>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="time-slot-move-down" ${index === timeSlots.length - 1 ? 'disabled' : ''}>
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="time-slot-delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Add event listeners
            slotItem.querySelector('.time-slot-move-up').addEventListener('click', () => moveTimeSlot(index, 'up'));
            slotItem.querySelector('.time-slot-move-down').addEventListener('click', () => moveTimeSlot(index, 'down'));
            slotItem.querySelector('.time-slot-delete').addEventListener('click', () => deleteTimeSlot(index));
            
            timeSlotsList.appendChild(slotItem);
        });
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Hide time slot editor
    function hideTimeSlotEditor() {
        const modal = document.getElementById('timeSlotModal');
        if (modal) modal.style.display = 'none';
    }
    
    // Get current time slots from the timetable
    function getCurrentTimeSlots() {
        const timeSlots = [];
        const periodCells = document.querySelectorAll('.period-cell');
        
        periodCells.forEach(cell => {
            const timeText = cell.querySelector('.period-time')?.textContent || '';
            const [start, end] = timeText.split(' - ');
            
            if (start && end) {
                timeSlots.push({
                    start: convertTo24Hour(start.trim()),
                    end: convertTo24Hour(end.trim())
                });
            }
        });
        
        return timeSlots;
    }
    
    // Convert time to 24-hour format for input[type="time"]
    function convertTo24Hour(timeStr) {
        // If already in 24-hour format, return as is
        if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
            return timeStr.padStart(5, '0');
        }
        
        // Parse time with AM/PM
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        
        if (hours === '12') {
            hours = modifier === 'AM' ? '00' : '12';
        } else if (modifier === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }
        
        return `${hours.padStart(2, '0')}:${minutes}`;
    }
    
    // Move time slot up or down
    function moveTimeSlot(index, direction) {
        const timeSlotsList = document.getElementById('timeSlotsListEdit');
        const items = timeSlotsList.querySelectorAll('.time-slot-item');
        
        if (direction === 'up' && index > 0) {
            timeSlotsList.insertBefore(items[index], items[index - 1]);
            updateTimeSlotNumbers();
        } else if (direction === 'down' && index < items.length - 1) {
            timeSlotsList.insertBefore(items[index + 1], items[index]);
            updateTimeSlotNumbers();
        }
    }
    
    // Delete time slot
    function deleteTimeSlot(index) {
        const timeSlotsList = document.getElementById('timeSlotsListEdit');
        const items = timeSlotsList.querySelectorAll('.time-slot-item');
        
        if (items.length <= 1) {
            alert('Cannot delete the last time slot');
            return;
        }
        
        items[index].remove();
        updateTimeSlotNumbers();
    }
    
    // Update time slot numbers after reordering
    function updateTimeSlotNumbers() {
        const timeSlotsList = document.getElementById('timeSlotsListEdit');
        const items = timeSlotsList.querySelectorAll('.time-slot-item');
        
        items.forEach((item, index) => {
            item.querySelector('.time-slot-number').textContent = index + 1;
            
            // Update move buttons
            item.querySelector('.time-slot-move-up').disabled = index === 0;
            item.querySelector('.time-slot-move-down').disabled = index === items.length - 1;
        });
    }
    
    // Add new period
    function addNewPeriod() {
        const timeSlots = getCurrentTimeSlots();
        const lastSlot = timeSlots[timeSlots.length - 1];
        
        // Calculate new time slot (30 minutes after last slot)
        let newStart = '14:00';
        let newEnd = '14:45';
        
        if (lastSlot) {
            const [hours, minutes] = lastSlot.end.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hours, minutes + 5, 0);
            
            const endDate = new Date();
            endDate.setHours(hours, minutes + 50, 0);
            
            newStart = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
            newEnd = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // Add new period to timetable
        const grade = document.getElementById('gradeSelector')?.value;
        if (grade) {
            // Refresh timetable with new period
            const timetableContainer = document.getElementById('timetableContainer');
            const timetable = timetableContainer.querySelector('.timetable');
            
            if (timetable) {
                const tbody = timetable.querySelector('tbody');
                const periodCount = tbody.querySelectorAll('tr').length;
                
                // Create new row
                const newRow = document.createElement('tr');
                newRow.innerHTML = `
                    <td class="period-cell">
                        <div class="period-number">${periodCount + 1}</div>
                        <div class="period-time">${formatTimeForDisplay(newStart)} - ${formatTimeForDisplay(newEnd)}</div>
                    </td>
                `;
                
                // Add cells for each day
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
                days.forEach(day => {
                    newRow.innerHTML += `
                        <td class="timetable-slot empty-slot" data-day="${day}" data-period="${periodCount + 1}" data-grade="${grade}">
                            <div class="add-class-btn">
                                <i class="fas fa-plus"></i>
                                <span>Add Class</span>
                            </div>
                        </td>
                    `;
                });
                
                tbody.appendChild(newRow);
                
                // Add event listeners to new slots
                newRow.querySelectorAll('.timetable-slot').forEach(slot => {
                    slot.addEventListener('click', function() {
                        const day = this.dataset.day;
                        const period = this.dataset.period;
                        const grade = this.dataset.grade;
                        
                        showAlert(document.getElementById('timetableAlert'), 
                            `<i class="fas fa-plus-circle"></i> Adding class to ${day}, Period ${period}`, 'info');
                    });
                });
                
                showAlert(document.getElementById('timetableAlert'), 
                    '<i class="fas fa-check-circle"></i> New period added successfully!', 'success');
            }
        } else {
            showAlert(document.getElementById('timetableAlert'), 
                '<i class="fas fa-exclamation-triangle"></i> Please select a grade/class first', 'error');
        }
    }
    
    // Reset time slots to default
    function resetTimeSlots() {
        const grade = document.getElementById('gradeSelector')?.value;
        if (grade) {
            if (confirm('Are you sure you want to reset time slots to default?')) {
                showSampleTimetable(grade);
                showAlert(document.getElementById('timetableAlert'), 
                    '<i class="fas fa-check-circle"></i> Time slots reset to default', 'success');
            }
        } else {
            showAlert(document.getElementById('timetableAlert'), 
                '<i class="fas fa-exclamation-triangle"></i> Please select a grade/class first', 'error');
        }
    }
    
    // Save time slots
    function saveTimeSlots() {
        const timeSlotsList = document.getElementById('timeSlotsListEdit');
        const items = timeSlotsList.querySelectorAll('.time-slot-item');
        const newTimeSlots = [];
        
        // Collect time slots from form
        items.forEach(item => {
            const start = item.querySelector('.time-start').value;
            const end = item.querySelector('.time-end').value;
            
            if (start && end) {
                newTimeSlots.push({
                    start,
                    end
                });
            }
        });
        
        // Validate time slots
        for (let i = 0; i < newTimeSlots.length; i++) {
            if (newTimeSlots[i].start >= newTimeSlots[i].end) {
                alert(`Period ${i + 1}: End time must be after start time`);
                return;
            }
            
            if (i > 0 && newTimeSlots[i].start <= newTimeSlots[i - 1].end) {
                alert(`Period ${i + 1}: Start time must be after previous period's end time`);
                return;
            }
        }
        
        // Update timetable with new time slots
        const grade = document.getElementById('gradeSelector')?.value;
        if (grade) {
            // Get current timetable structure
            const timetableContainer = document.getElementById('timetableContainer');
            const timetable = timetableContainer.querySelector('.timetable');
            
            if (timetable) {
                const rows = timetable.querySelectorAll('tbody tr');
                
                // Update period times
                rows.forEach((row, index) => {
                    if (index < newTimeSlots.length) {
                        const periodCell = row.querySelector('.period-cell');
                        const periodTime = periodCell.querySelector('.period-time');
                        
                        periodTime.textContent = `${formatTimeForDisplay(newTimeSlots[index].start)} - ${formatTimeForDisplay(newTimeSlots[index].end)}`;
                    }
                });
                
                // Hide modal
                hideTimeSlotEditor();
                
                showAlert(document.getElementById('timetableAlert'), 
                    '<i class="fas fa-check-circle"></i> Time slots updated successfully!', 'success');
            }
        }
    }
    
    // Format time for display (convert from 24h to 12h if needed)
    function formatTimeForDisplay(time24h) {
        const [hours, minutes] = time24h.split(':').map(Number);
        
        // Use 24-hour format
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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
    
    // Reference to showSampleTimetable function from timetable-content.js
    function showSampleTimetable(grade) {
        // This is just a reference - the actual function is in timetable-content.js
        // We'll call it via window.showSampleTimetable if available
        if (typeof window.showSampleTimetable === 'function') {
            window.showSampleTimetable(grade);
        } else {
            console.error('showSampleTimetable function not found');
        }
    }
});
