// Timetable Fix - Corrects styling issues in the timetable section
document.addEventListener('DOMContentLoaded', function() {
    // Fix timetable section background
    fixTimetableBackground();
    
    function fixTimetableBackground() {
        // Add specific styles to fix the black background
        const style = document.createElement('style');
        style.textContent = `
            #timetableSection {
                background-color: #f8f9fa;
                color: #343a40;
            }
            
            #timetableSection .timetable-manager {
                background-color: white;
            }
            
            #timetableSection .timetable {
                background-color: white;
            }
            
            #timetableSection .timetable th {
                background-color: #f8f9fa;
                color: #343a40;
            }
            
            #timetableSection .timetable-slot {
                background-color: white;
            }
            
            #timetableSection .empty-slot {
                background-color: #f8f9fa;
            }
            
            #timetableSection .filled-slot {
                background-color: #e8f5e9;
            }
            
            #timetableSection .modal-container {
                background-color: white;
                color: #343a40;
            }
            
            #timetableSection .modal-body {
                background-color: white;
            }
            
            #timetableSection .form-control {
                background-color: #f8f9fa;
                color: #343a40;
            }
        `;
        document.head.appendChild(style);
        
        // Ensure the timetable container has proper background
        const timetableContainer = document.getElementById('timetableContainer');
        if (timetableContainer) {
            timetableContainer.style.backgroundColor = 'white';
        }
    }
});