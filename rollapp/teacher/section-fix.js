// One delegated handler supports both the fixed panels and dynamically added panels.
document.addEventListener('DOMContentLoaded', function () {
    function activateSection(sectionName, activeItem) {
        const target = document.getElementById(sectionName + 'Section');
        if (!target) return false;

        document.querySelectorAll('.main-content .section-container').forEach(section => {
            const isActive = section === target;
            section.classList.toggle('active', isActive);
            section.style.display = isActive ? 'block' : 'none';
            section.setAttribute('aria-hidden', String(!isActive));
        });
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            const isActive = item === activeItem;
            item.classList.toggle('active', isActive);
            if (isActive) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });
        return true;
    }

    const dashboardItem = document.querySelector('.sidebar-menu .menu-item[data-section="dashboard"]');
    if (!document.body.classList.contains('teacher-authenticated')) activateSection('dashboard', dashboardItem);

    document.addEventListener('click', function (event) {
        const item = event.target.closest('.sidebar-menu .menu-item[data-section]');
        if (!item) return;
        event.preventDefault();
        activateSection(item.dataset.section, item);
    });
});
