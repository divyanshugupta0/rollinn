// Auto Status - Automatically sets class/location status based on time range
document.addEventListener('DOMContentLoaded', function() {
    // Remove active checkbox from class form
    removeActiveCheckbox('classForm', 'classActive');
    
    // Remove active checkbox from location form
    removeActiveCheckbox('locationForm', 'locationActive');
    
    // Override save functions to automatically set status
    overrideSaveFunctions();
    
    // Remove active checkbox from form
    function removeActiveCheckbox(formId, checkboxId) {
        const checkInterval = setInterval(() => {
            const form = document.getElementById(formId);
            if (form) {
                clearInterval(checkInterval);
                
                const checkbox = document.getElementById(checkboxId);
                if (checkbox) {
                    const checkboxGroup = checkbox.closest('.form-group');
                    if (checkboxGroup) {
                        checkboxGroup.style.display = 'none';
                    }
                }
            }
        }, 500);
    }
    
    // Override save functions
    function overrideSaveFunctions() {
        // Override saveClass function
        if (typeof window.saveClass === 'function') {
            const originalSaveClass = window.saveClass;
            window.saveClass = function(e) {
                e.preventDefault();
                
                const form = document.getElementById('classForm');
                const startTime = document.getElementById('classStartTime').value;
                const endTime = document.getElementById('classEndTime').value;
                
                // Set active status based on current time
                const isActive = isTimeInRange(startTime, endTime);
                
                // Set hidden checkbox value
                const activeCheckbox = document.getElementById('classActive');
                if (activeCheckbox) {
                    activeCheckbox.checked = isActive;
                }
                
                // Call original function
                return originalSaveClass.call(this, e);
            };
        }
        
        // Override saveLocation function
        if (typeof window.saveLocation === 'function') {
            const originalSaveLocation = window.saveLocation;
            window.saveLocation = function(e) {
                e.preventDefault();
                
                const form = document.getElementById('locationForm');
                const startTime = document.getElementById('startTime').value;
                const endTime = document.getElementById('endTime').value;
                
                // Set active status based on current time
                const isActive = isTimeInRange(startTime, endTime);
                
                // Set hidden checkbox value
                const activeCheckbox = document.getElementById('locationActive');
                if (activeCheckbox) {
                    activeCheckbox.checked = isActive;
                }
                
                // Call original function
                return originalSaveLocation.call(this, e);
            };
        }
    }
    
    // Check if current time is within range
    function isTimeInRange(startTime, endTime) {
        if (!startTime || !endTime) return true; // Default to active if no time range
        
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHours * 60 + currentMinutes;
        
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        
        const startTimeInMinutes = startHours * 60 + startMinutes;
        const endTimeInMinutes = endHours * 60 + endMinutes;
        
        return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
    }
    
    // Add event listeners to time inputs to update status automatically
    function addTimeChangeListeners() {
        const checkInterval = setInterval(() => {
            // Class form time inputs
            const classStartTime = document.getElementById('classStartTime');
            const classEndTime = document.getElementById('classEndTime');
            
            if (classStartTime && classEndTime) {
                classStartTime.addEventListener('change', updateClassStatus);
                classEndTime.addEventListener('change', updateClassStatus);
            }
            
            // Location form time inputs
            const startTime = document.getElementById('startTime');
            const endTime = document.getElementById('endTime');
            
            if (startTime && endTime) {
                startTime.addEventListener('change', updateLocationStatus);
                endTime.addEventListener('change', updateLocationStatus);
            }
            
            // If all elements found, clear interval
            if ((classStartTime && classEndTime) || (startTime && endTime)) {
                clearInterval(checkInterval);
            }
        }, 500);
    }
    
    // Update class status based on time inputs
    function updateClassStatus() {
        const startTime = document.getElementById('classStartTime').value;
        const endTime = document.getElementById('classEndTime').value;
        const activeCheckbox = document.getElementById('classActive');
        
        if (activeCheckbox) {
            activeCheckbox.checked = isTimeInRange(startTime, endTime);
        }
    }
    
    // Update location status based on time inputs
    function updateLocationStatus() {
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const activeCheckbox = document.getElementById('locationActive');
        
        if (activeCheckbox) {
            activeCheckbox.checked = isTimeInRange(startTime, endTime);
        }
    }
    
    // Add time change listeners
    addTimeChangeListeners();
});