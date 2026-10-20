// Analytics Loader - Ensures analytics data is loaded properly
document.addEventListener('DOMContentLoaded', function() {
    // Add click handler for analytics tab
    const analyticsTab = document.querySelector('a[href="#analytics"]');
    if (analyticsTab) {
        analyticsTab.addEventListener('click', function() {
            console.log('Analytics tab clicked, loading data...');
            if (typeof loadAnalyticsData === 'function') {
                // Add a small delay to ensure the tab is fully visible
                setTimeout(loadAnalyticsData, 100);
            } else {
                console.error('loadAnalyticsData function not found');
            }
        });
    }
    
    // Check if we're already on the analytics tab when page loads
    setTimeout(function() {
        const analyticsSection = document.getElementById('analytics');
        if (analyticsSection && analyticsSection.classList.contains('active')) {
            console.log('Analytics tab is active on page load, loading data...');
            if (typeof loadAnalyticsData === 'function') {
                loadAnalyticsData();
            }
        }
    }, 500);
});

// Function to manually refresh analytics data
function refreshAnalyticsData() {
    console.log('Manually refreshing analytics data...');
    if (typeof loadAnalyticsData === 'function') {
        loadAnalyticsData();
        showAlert('Analytics data refreshed', 'success');
    } else {
        console.error('loadAnalyticsData function not found');
        showAlert('Error refreshing analytics data', 'danger');
    }
}