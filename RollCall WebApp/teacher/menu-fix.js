// Fix sidebar menu navigation
document.addEventListener('DOMContentLoaded', function() {
    // Get all menu items and sections
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.section-container');
    
    // First, hide all sections except dashboard
    sections.forEach(section => {
        if (section.id !== 'dashboardSection') {
            section.style.display = 'none';
            section.classList.remove('active');
        }
    });
    
    // Add click event to each menu item
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            
            // Update active menu item
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');
            
            // Hide all sections
            sections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('active');
            });
            
            // Show selected section
            const targetSection = document.getElementById(sectionId + 'Section');
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active');
            }
        });
    });
});