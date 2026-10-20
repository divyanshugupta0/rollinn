// Class Time Status - Makes classes active only during their scheduled time range
document.addEventListener('DOMContentLoaded', function() {
    // Override renderClassesWithAttendanceStatus function to check time
    const originalRenderClassesWithAttendanceStatus = window.renderClassesWithAttendanceStatus;
    window.renderClassesWithAttendanceStatus = function(classes, submittedAttendances) {
        // Update active status based on current time
        classes = updateClassActiveStatus(classes);
        
        // Call original function with updated classes
        if (typeof originalRenderClassesWithAttendanceStatus === 'function') {
            originalRenderClassesWithAttendanceStatus(classes, submittedAttendances);
        } else {
            // Fallback if original function not available
            renderClasses(classes);
        }
    };
    
    // Override renderLocationsWithAttendanceStatus function to check time
    const originalRenderLocationsWithAttendanceStatus = window.renderLocationsWithAttendanceStatus;
    window.renderLocationsWithAttendanceStatus = function(locations, submittedAttendances) {
        // Update active status based on current time
        locations = updateLocationActiveStatus(locations);
        
        // Call original function with updated locations
        if (typeof originalRenderLocationsWithAttendanceStatus === 'function') {
            originalRenderLocationsWithAttendanceStatus(locations, submittedAttendances);
        } else {
            // Fallback if original function not available
            renderLocations(locations);
        }
    };
    
    // Update class active status based on time
    function updateClassActiveStatus(classes) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
        
        return classes.map(classData => {
            // Skip if manually set to inactive
            if (classData.status === 'inactive') return classData;
            
            // Check if class has time range
            if (classData.startTime && classData.endTime) {
                // Convert time strings to minutes
                const startMinutes = convertTimeToMinutes(classData.startTime);
                const endMinutes = convertTimeToMinutes(classData.endTime);
                
                // Set active status based on current time
                if (currentTime >= startMinutes && currentTime <= endMinutes) {
                    classData.status = 'active';
                    classData.activeReason = 'Current class in session';
                } else {
                    classData.status = 'inactive';
                    classData.activeReason = currentTime < startMinutes ? 
                        'Class starts later today' : 'Class has ended for today';
                }
            }
            
            return classData;
        });
    }
    
    // Update location active status based on time
    function updateLocationActiveStatus(locations) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
        
        return locations.map(location => {
            // Skip if manually set to inactive
            if (location.status === 'inactive') return location;
            
            // Check if location has time range
            if (location.startTime && location.endTime) {
                // Convert time strings to minutes
                const startMinutes = convertTimeToMinutes(location.startTime);
                const endMinutes = convertTimeToMinutes(location.endTime);
                
                // Set active status based on current time
                if (currentTime >= startMinutes && currentTime <= endMinutes) {
                    location.status = 'active';
                    location.activeReason = 'Currently active';
                } else {
                    location.status = 'inactive';
                    location.activeReason = currentTime < startMinutes ? 
                        'Starts later today' : 'Has ended for today';
                }
            }
            
            return location;
        });
    }
    
    // Convert time string (HH:MM) to minutes
    function convertTimeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    // Add styles for active/inactive status with reason
    const style = document.createElement('style');
    style.textContent = `
        .class-status, .location-status {
            position: relative;
        }
        
        .class-status:hover::after, .location-status:hover::after {
            content: attr(data-reason);
            position: absolute;
            top: 100%;
            right: 0;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 10;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
    
    // Update status display to show reason on hover
    document.addEventListener('DOMContentLoaded', function() {
        setInterval(function() {
            document.querySelectorAll('.class-card, .location-card').forEach(card => {
                const statusEl = card.querySelector('.class-status, .location-status');
                const isActive = !statusEl.classList.contains('inactive');
                
                // Get the class or location data
                const id = card.dataset.id;
                let data;
                
                if (card.classList.contains('class-card')) {
                    data = window.classes?.find(c => c.id === id);
                } else {
                    data = window.locations?.find(l => l.id === id);
                }
                
                // Update reason if data exists
                if (data && data.activeReason) {
                    statusEl.setAttribute('data-reason', data.activeReason);
                }
            });
        }, 1000);
    });
});