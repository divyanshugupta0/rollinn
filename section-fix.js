// Fix for multiple sections showing issue
document.addEventListener('DOMContentLoaded', function() {
    // Get all menu items and sections
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.section-container');
    
    // First, hide all sections except dashboard
    sections.forEach(section => {
        if (section.id !== 'dashboardSection') {
            section.style.display = 'none';
            section.classList.remove('active');
        } else {
            section.style.display = 'block';
            section.classList.add('active');
        }
    });
    
    // Add click event to each menu item
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const sectionId = this.getAttribute('data-section');
            
            // Update active menu item
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');
            
            // Force hide ALL sections first
            sections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('active');
            });
            
            // Show ONLY the selected section
            const targetSection = document.getElementById(sectionId + 'Section');
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active');
            }
        });
    });
});