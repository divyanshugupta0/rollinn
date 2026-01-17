// Fix duplicate elements in the teacher portal
document.addEventListener('DOMContentLoaded', function() {
    // Fix duplicate quick actions
    const quickActions = document.querySelectorAll('.quick-actions');
    if (quickActions.length > 1) {
        for (let i = 1; i < quickActions.length; i++) {
            quickActions[i].remove();
        }
    }
    
    // Fix duplicate upcoming classes
    const upcomingClasses = document.querySelectorAll('.upcoming-classes');
    if (upcomingClasses.length > 1) {
        for (let i = 1; i < upcomingClasses.length; i++) {
            upcomingClasses[i].remove();
        }
    }
    
    // Fix duplicate student search
    const studentSearch = document.querySelectorAll('.student-search');
    if (studentSearch.length > 1) {
        for (let i = 1; i < studentSearch.length; i++) {
            studentSearch[i].remove();
        }
    }
    
    // Fix duplicate report filters
    const reportFilters = document.querySelectorAll('.reports-filters');
    if (reportFilters.length > 1) {
        for (let i = 1; i < reportFilters.length; i++) {
            reportFilters[i].remove();
        }
    }
    
    // Fix duplicate report charts
    const reportCharts = document.querySelectorAll('#reportCharts');
    if (reportCharts.length > 1) {
        for (let i = 1; i < reportCharts.length; i++) {
            reportCharts[i].remove();
        }
    }
    
    // Fix duplicate bulk actions
    const bulkActions = document.querySelectorAll('.bulk-actions');
    if (bulkActions.length > 1) {
        for (let i = 1; i < bulkActions.length; i++) {
            bulkActions[i].remove();
        }
    }
});