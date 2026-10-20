// Timetable Improvements - Enhances table format and time slot editing
document.addEventListener('DOMContentLoaded', function() {
    // Apply improvements after timetable is loaded
    setTimeout(improveTimetable, 1000);
    
    function improveTimetable() {
        // Enhance table styling
        enhanceTableFormat();
        
        // Add direct time slot editing
        addDirectTimeSlotEditing();
        
        // Hide edit time slots button
        hideEditTimeSlotsButton();
    }
    
    // Enhance table format with better styling
    function enhanceTableFormat() {
        const style = document.createElement('style');
        style.textContent = `
            .timetable table {
                border-collapse: separate;
                border-spacing: 2px;
                width: 100%;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                border-radius: 10px;
                overflow: hidden;
            }
            
            .timetable th {
                background: linear-gradient(135deg, #4CAF50, #2E7D32);
                color: white;
                padding: 15px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-size: 14px;
            }
            
            .timetable td {
                padding: 0;
                vertical-align: top;
                border-radius: 6px;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            
            .period-cell {
                background: linear-gradient(135deg, #f5f7fa, #e4e8f0);
                padding: 12px !important;
                text-align: center;
                border-right: 2px solid #e0e0e0;
            }
            
            .period-number {
                font-size: 20px;
                font-weight: 700;
                color: #333;
                margin-bottom: 5px;
            }
            
            .period-time {
                font-size: 13px;
                color: #666;
                font-weight: 500;
            }
            
            .timetable-slot {
                height: 100px;
                transition: all 0.3s ease;
                cursor: pointer;
                padding: 10px;
                position: relative;
            }
            
            .empty-slot {
                background: linear-gradient(135deg, #f9f9f9, #f1f1f1);
                border: 1px dashed #ccc;
            }
            
            .filled-slot {
                background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
                border: 1px solid #a5d6a7;
            }
            
            .empty-slot:hover {
                background: linear-gradient(135deg, #f1f1f1, #e9e9e9);
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            .filled-slot:hover {
                background: linear-gradient(135deg, #c8e6c9, #a5d6a7);
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            .slot-subject {
                font-weight: 700;
                color: #2E7D32;
                margin-bottom: 8px;
                font-size: 15px;
            }
            
            .slot-teacher, .slot-room {
                font-size: 13px;
                color: #555;
                margin-top: 5px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .add-class-btn {
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #9e9e9e;
                transition: all 0.3s ease;
            }
            
            .add-class-btn i {
                font-size: 24px;
                margin-bottom: 8px;
            }
            
            .add-class-btn span {
                font-size: 13px;
                font-weight: 500;
            }
            
            .empty-slot:hover .add-class-btn {
                color: #4CAF50;
            }
            
            .time-edit-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
            }
            
            .period-cell:hover .time-edit-overlay {
                opacity: 1;
                pointer-events: auto;
            }
            
            .time-edit-btn {
                background: #2196F3;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: all 0.3s ease;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            
            .time-edit-btn:hover {
                background: #1976D2;
                transform: scale(1.05);
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add direct time slot editing
    function addDirectTimeSlotEditing() {
        // Add click event to period cells
        document.addEventListener('click', function(e) {
            const periodCell = e.target.closest('.period-cell');
            if (periodCell) {
                // Get period number and time
                const periodNumber = periodCell.querySelector('.period-number')?.textContent;
                const periodTime = periodCell.querySelector('.period-time')?.textContent;
                
                // Ask if user wants to edit time
                if (confirm(`Do you want to change the time for Period ${periodNumber}?\nCurrent time: ${periodTime}`)) {
                    // Get current time values
                    const [startTime, endTime] = periodTime.split(' - ');
                    
                    // Show single time slot edit modal
                    showSingleTimeSlotEditor(periodCell, periodNumber, startTime, endTime);
                }
            }
        });
        
        // Add edit overlay to period cells
        const periodCells = document.querySelectorAll('.period-cell');
        periodCells.forEach(cell => {
            // Create edit overlay
            const editOverlay = document.createElement('div');
            editOverlay.className = 'time-edit-overlay';
            editOverlay.innerHTML = `
                <button class="time-edit-btn">
                    <i class="fas fa-clock"></i> Edit Time
                </button>
            `;
            
            // Add to cell
            cell.style.position = 'relative';
            cell.appendChild(editOverlay);
        });
    }
    
    // Hide edit time slots button
    function hideEditTimeSlotsButton() {
        const editTimeSlotsBtn = document.getElementById('editTimeSlotsBtn');
        if (editTimeSlotsBtn) {
            editTimeSlotsBtn.style.display = 'none';
        }
    }
    
    // Show single time slot editor
    function showSingleTimeSlotEditor(periodCell, periodNumber, startTime, endTime) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('singleTimeSlotModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'singleTimeSlotModal';
            modal.innerHTML = `
                <div class="modal-container" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-clock"></i> Edit Time Slot</h3>
                        <button class="close-btn" id="closeSingleTimeSlotModal"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="singleTimeSlotForm">
                            <div class="form-group">
                                <label for="singlePeriodNumber">Period</label>
                                <input type="text" id="singlePeriodNumber" class="form-control" readonly>
                            </div>
                            <div class="form-group">
                                <label for="singleStartTime">Start Time</label>
                                <input type="time" id="singleStartTime" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="singleEndTime">End Time</label>
                                <input type="time" id="singleEndTime" class="form-control" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="primary-btn" id="saveSingleTimeSlotBtn">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                        <button type="button" class="secondary-btn" id="cancelSingleTimeSlotBtn">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add event listeners
            document.getElementById('closeSingleTimeSlotModal').addEventListener('click', hideSingleTimeSlotEditor);
            document.getElementById('cancelSingleTimeSlotBtn').addEventListener('click', hideSingleTimeSlotEditor);
            document.getElementById('saveSingleTimeSlotBtn').addEventListener('click', function() {
                saveSingleTimeSlot(periodCell);
            });
        }
        
        // Set values
        document.getElementById('singlePeriodNumber').value = periodNumber;
        document.getElementById('singleStartTime').value = convertTo24Hour(startTime);
        document.getElementById('singleEndTime').value = convertTo24Hour(endTime);
        
        // Show modal
        modal.style.display = 'flex';
    }
    
    // Hide single time slot editor
    function hideSingleTimeSlotEditor() {
        const modal = document.getElementById('singleTimeSlotModal');
        if (modal) modal.style.display = 'none';
    }
    
    // Save single time slot
    function saveSingleTimeSlot(periodCell) {
        const periodNumber = document.getElementById('singlePeriodNumber').value;
        const startTime = document.getElementById('singleStartTime').value;
        const endTime = document.getElementById('singleEndTime').value;
        
        // Validate times
        if (startTime >= endTime) {
            alert('End time must be after start time');
            return;
        }
        
        // Update period cell
        const periodTimeElement = periodCell.querySelector('.period-time');
        if (periodTimeElement) {
            periodTimeElement.textContent = `${formatTimeForDisplay(startTime)} - ${formatTimeForDisplay(endTime)}`;
        }
        
        // Hide modal
        hideSingleTimeSlotEditor();
        
        // Show success message
        showAlert(document.getElementById('timetableAlert'), 
            `<i class="fas fa-check-circle"></i> Time for Period ${periodNumber} updated successfully!`, 'success');
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
});