// Initialize sections on page load
window.addEventListener('load', function() {
    // Get all sections
    const sections = document.querySelectorAll('.section-container');
    
    // Hide all sections first
    sections.forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show only dashboard section
    const dashboardSection = document.getElementById('dashboardSection');
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
        dashboardSection.classList.add('active');
    }
    
    // Set dashboard menu item as active
    const dashboardMenuItem = document.querySelector('.menu-item[data-section="dashboard"]');
    if (dashboardMenuItem) {
        dashboardMenuItem.classList.add('active');
    }
});