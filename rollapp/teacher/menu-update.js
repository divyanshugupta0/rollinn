// Menu Update - Adds timetable menu item and initializes section
document.addEventListener('DOMContentLoaded', function() {
    // Add timetable menu item to sidebar
    addTimetableMenuItem();
    
    // Initialize timetable section if not already present
    initTimetableSection();
    
    // Add timetable menu item to sidebar
    function addTimetableMenuItem() {
        const sidebarMenu = document.querySelector('.sidebar-menu');
        if (!sidebarMenu) return;
        
        // Check if timetable menu item already exists
        if (document.querySelector('.menu-item[data-section="timetable"]')) return;
        
        // Create timetable menu item
        const timetableMenuItem = document.createElement('div');
        timetableMenuItem.className = 'menu-item';
        timetableMenuItem.setAttribute('data-section', 'timetable');
        timetableMenuItem.innerHTML = `
            <i class="fas fa-calendar-alt"></i>
            <span>Timetable</span>
        `;
        
        // Insert before settings menu item
        const settingsMenuItem = document.querySelector('.menu-item[data-section="settings"]');
        if (settingsMenuItem) {
            sidebarMenu.insertBefore(timetableMenuItem, settingsMenuItem);
        } else {
            // If settings menu item not found, append to the end
            sidebarMenu.appendChild(timetableMenuItem);
        }
        
        // Add click event listener
        timetableMenuItem.addEventListener('click', function(e) {
            if (typeof window.switchTeacherSection === 'function') {
                e.preventDefault();
                window.switchTeacherSection('timetable');
                return;
            }
            // Update active menu item
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
            });
            this.classList.add('active');
            
            // Show timetable section
            document.querySelectorAll('.section-container').forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });
            
            const timetableSection = document.getElementById('timetableSection');
            if (timetableSection) {
                timetableSection.classList.add('active');
                timetableSection.style.display = 'block';
            }
        });
    }
    
    // Initialize timetable section if not already present
    function initTimetableSection() {
        // Check if timetable section already exists
        if (document.getElementById('timetableSection')) return;
        
        // Create timetable section
        const timetableSection = document.createElement('div');
        timetableSection.id = 'timetableSection';
        timetableSection.className = 'section-container';
        timetableSection.innerHTML = `
            <div class="header">
                <h1><i class="fas fa-calendar-alt"></i> Class Timetable</h1>
                <div class="teacher-info" id="timetableTeacherInfo">
                    <i class="fas fa-user-tie"></i> Loading...
                    <div class="header-dropdown">
                        <div class="dropdown-item header-logout-btn">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Logout</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="timetableAlert" class="alert" style="display: none;"></div>
        `;
        
        // Insert before settings section
        const settingsSection = document.getElementById('settingsSection');
        if (settingsSection) {
            settingsSection.parentNode.insertBefore(timetableSection, settingsSection);
        } else {
            // If settings section not found, append to main content
            document.querySelector('.main-content .container').appendChild(timetableSection);
        }
    }
});