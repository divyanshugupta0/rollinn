// Analytics data from Firebase
document.addEventListener('DOMContentLoaded', function() {
    // Load analytics data when analytics tab is clicked
    const analyticsTab = document.querySelector('a[href="#analytics"]');
    if (analyticsTab) {
        analyticsTab.addEventListener('click', loadAnalyticsData);
    }
    
    // Also try to load analytics data on page load if we're on the analytics tab
    setTimeout(function() {
        if (document.getElementById('analytics').classList.contains('active')) {
            loadAnalyticsData();
        }
    }, 1000);
});

function loadAnalyticsData() {
    if (!currentUser || !ownerAuth) {
        console.log('User not logged in, cannot load analytics');
        return;
    }
    
    // Get schools data from owner's Firebase
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools').once('value')
        .then(snapshot => {
            const schools = snapshot.exists() ? snapshot.val() : {};
            const schoolsArray = Object.values(schools);
            
            // Calculate total students
            const totalStudents = schoolsArray.reduce((total, school) => {
                return total + (school.details && school.details.currentStudents ? parseInt(school.details.currentStudents) : 0);
            }, 0);
            
            // Calculate total teachers
            const totalTeachers = schoolsArray.reduce((total, school) => {
                return total + (school.details && school.details.teacherCount ? parseInt(school.details.teacherCount) : 0);
            }, 0);
            
            // Calculate growth only when both comparison periods contain real records.
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const recentSchools = schoolsArray.filter(school => {
                const regDate = new Date(school.registrationDate);
                return regDate > oneMonthAgo;
            }).length;
            
            const previousMonthCount = schoolsArray.length - recentSchools;
            const growthPercentage = previousMonthCount > 0 ? Math.round((recentSchools / previousMonthCount) * 100) : 0;
            const growthRate = previousMonthCount > 0 ? `${growthPercentage}%` : '—';
            
            // Calculate average rating from actual school ratings if available
            let avgRating = 0;
            let ratingCount = 0;
            
            schoolsArray.forEach(school => {
                if (school.rating && !isNaN(parseFloat(school.rating))) {
                    avgRating += parseFloat(school.rating);
                    ratingCount++;
                }
            });
            
            avgRating = ratingCount ? (avgRating / ratingCount).toFixed(1) : '—';
            
            // Update the analytics dashboard with real data
            document.getElementById('totalStudents').textContent = totalStudents;
            document.getElementById('totalTeachers').textContent = totalTeachers;
            document.getElementById('growthRate').textContent = growthRate;
            document.getElementById('avgRating').textContent = avgRating;
            
            // Count school types
            const schoolTypes = {};
            schoolsArray.forEach(school => {
                const type = school.type || 'Other';
                schoolTypes[type] = (schoolTypes[type] || 0) + 1;
            });
            
            // Count subscription plans
            const planCounts = {};
            schoolsArray.forEach(school => {
                const planName = school.subscription?.plan;
                if (planName) planCounts[planName] = (planCounts[planName] || 0) + 1;
            });
            const planEntries = Object.entries(planCounts).sort((a, b) => b[1] - a[1]);
            const totalPlans = planEntries.reduce((sum, item) => sum + item[1], 0);
            const sparkPlanElement = document.getElementById('sparkPlanProgress');
            const bulletPlanElement = document.getElementById('bulletPlanProgress');
            const firstPlan = planEntries[0];
            const secondPlan = planEntries[1];
            [[sparkPlanElement, firstPlan], [bulletPlanElement, secondPlan]].forEach(([element, entry]) => {
                if (!element) return;
                const percentage = entry && totalPlans ? Math.round(entry[1] / totalPlans * 100) : 0;
                element.style.width = percentage + '%';
                element.textContent = entry ? `${entry[0]} (${percentage}%)` : '';
                element.setAttribute('aria-valuenow', String(percentage));
            });
            
            // Calculate regional distribution
            const regionDistribution = {};
            schoolsArray.forEach(school => {
                if (school.address && school.address.state) {
                    const region = getRegionFromState(school.address.state);
                    regionDistribution[region] = (regionDistribution[region] || 0) + 1;
                }
            });
            
            // Update regional distribution in the UI
            updateRegionalDistribution(regionDistribution, schoolsArray.length);
            
            // Initialize charts if Chart.js is available
            if (typeof Chart !== 'undefined' && schoolsArray.length > 0) {
                initializeCharts(schoolsArray, schoolTypes);
            } else {
                setAnalyticsChartEmptyState('registrationChart', 'registrationChartEmpty', true);
                setAnalyticsChartEmptyState('schoolTypeChart', 'schoolTypeChartEmpty', true);
            }
        })
        .catch(error => {
            console.error('Error loading analytics data:', error);
        });
}

function setAnalyticsChartEmptyState(canvasId, emptyStateId, isEmpty) {
    const canvas = document.getElementById(canvasId);
    const emptyState = document.getElementById(emptyStateId);
    if (!canvas || !emptyState) return;
    canvas.hidden = isEmpty;
    emptyState.hidden = !isEmpty;
}

// Helper function to determine region from state
function getRegionFromState(state) {
    // This is a simplified mapping - in a real app, you would have a more comprehensive mapping
    const northStates = ['New York', 'Pennsylvania', 'Massachusetts', 'Connecticut', 'New Jersey', 'Maine', 'Vermont', 'New Hampshire', 'Rhode Island'];
    const southStates = ['Florida', 'Georgia', 'Alabama', 'Mississippi', 'Louisiana', 'Texas', 'Arkansas', 'Tennessee', 'North Carolina', 'South Carolina', 'Kentucky', 'Virginia', 'West Virginia', 'Maryland', 'Delaware'];
    const westStates = ['California', 'Oregon', 'Washington', 'Nevada', 'Idaho', 'Montana', 'Wyoming', 'Colorado', 'Utah', 'Arizona', 'New Mexico', 'Hawaii', 'Alaska'];
    const midwestStates = ['Ohio', 'Michigan', 'Indiana', 'Illinois', 'Wisconsin', 'Minnesota', 'Iowa', 'Missouri', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas'];
    
    const stateLower = state.toLowerCase();
    
    for (const s of northStates) {
        if (s.toLowerCase() === stateLower) return 'North';
    }
    
    for (const s of southStates) {
        if (s.toLowerCase() === stateLower) return 'South';
    }
    
    for (const s of westStates) {
        if (s.toLowerCase() === stateLower) return 'West';
    }
    
    for (const s of midwestStates) {
        if (s.toLowerCase() === stateLower) return 'Midwest';
    }
    
    return 'Other';
}

// Update regional distribution in the UI
function updateRegionalDistribution(regionData, totalSchools) {
    const regionContainer = document.getElementById('regionDistribution');
    if (!regionContainer) return;
    
    // Clear existing content
    regionContainer.innerHTML = '';
    
    // Sort regions by count (descending)
    const sortedRegions = Object.entries(regionData)
        .sort((a, b) => b[1] - a[1]);
    
    // Add each region to the container
    sortedRegions.forEach(([region, count]) => {
        const percentage = Math.round((count / totalSchools) * 100);
        const div = document.createElement('div');
        div.textContent = `${region}: ${percentage}%`;
        regionContainer.appendChild(div);
    });
    
    // If no regions found
    if (sortedRegions.length === 0) {
        const div = document.createElement('div');
        div.textContent = 'No regional data available';
        regionContainer.appendChild(div);
    }
}

function initializeCharts(schools, schoolTypes) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const datedSchools = schools.filter(school => school.registrationDate && !Number.isNaN(new Date(school.registrationDate).getTime()));
    const registrationsByMonth = Array(12).fill(0);
    datedSchools.forEach(school => registrationsByMonth[new Date(school.registrationDate).getMonth()]++);
    setAnalyticsChartEmptyState('registrationChart', 'registrationChartEmpty', datedSchools.length === 0);
    setAnalyticsChartEmptyState('schoolTypeChart', 'schoolTypeChartEmpty', Object.keys(schoolTypes).length === 0);

    const registrationCtx = document.getElementById('registrationChart');
    if (registrationCtx && datedSchools.length > 0) {
        // Destroy existing chart if any
        const existingChart = Chart.getChart(registrationCtx);
        if (existingChart) {
            existingChart.destroy();
        }
        
        new Chart(registrationCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'School Registrations',
                    data: registrationsByMonth,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });
    }
    
    const typeCtx = document.getElementById('schoolTypeChart');
    if (typeCtx && Object.keys(schoolTypes).length > 0) {
        // Destroy existing chart if any
        const existingChart = Chart.getChart(typeCtx);
        if (existingChart) {
            existingChart.destroy();
        }
        
        const typeLabels = Object.keys(schoolTypes);
        const typeData = Object.values(schoolTypes);
        const backgroundColors = [
            'rgba(255, 99, 132, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)'
        ];
        
        new Chart(typeCtx, {
            type: 'pie',
            data: {
                labels: typeLabels,
                datasets: [{
                    data: typeData,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(color => color.replace('0.6', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    // Calculate and update renewal rate
    updateRenewalRate(schools);
    
    // Update upcoming renewals table
    updateUpcomingRenewals(schools);
}

// Calculate and update renewal rate
function updateRenewalRate(schools) {
    const renewalRateElement = document.getElementById('renewalRate');
    const renewalTrendElement = document.getElementById('renewalTrend');
    
    if (!renewalRateElement || !renewalTrendElement) return;
    
    // Get schools with subscription data
    const schoolsWithSubscription = schools.filter(school => 
        school.subscription && school.subscription.status);
    
    if (schoolsWithSubscription.length === 0) return;
    
    // Count active and expired subscriptions
    const activeSubscriptions = schoolsWithSubscription.filter(school => 
        school.subscription.status.toLowerCase() === 'active').length;
    
    const renewalRate = Math.round((activeSubscriptions / schoolsWithSubscription.length) * 100);
    
    renewalRateElement.textContent = renewalRate + '%';
    renewalTrendElement.className = 'text-muted';
    renewalTrendElement.textContent = 'No historical trend data';
}

// Update upcoming renewals table
function updateUpcomingRenewals(schools) {
    const renewalsTableBody = document.getElementById('upcomingRenewalsTable');
    if (!renewalsTableBody) return;
    
    // Clear existing content
    renewalsTableBody.innerHTML = '';
    
    // Get schools with subscription end dates
    const schoolsWithEndDates = schools.filter(school => 
        school.subscription && 
        school.subscription.endDate && 
        school.subscription.status && 
        school.subscription.status.toLowerCase() === 'active');
    
    if (schoolsWithEndDates.length === 0) {
        renewalsTableBody.innerHTML = '<tr><td colspan="3" class="text-center">No upcoming renewals found</td></tr>';
        return;
    }
    
    // Sort schools by end date (closest first)
    schoolsWithEndDates.sort((a, b) => {
        const dateA = new Date(a.subscription.endDate);
        const dateB = new Date(b.subscription.endDate);
        return dateA - dateB;
    });
    
    // Get today's date for comparison
    const today = new Date();
    
    // Add upcoming renewals (max 3)
    let renewalsAdded = 0;
    for (const school of schoolsWithEndDates) {
        const endDate = new Date(school.subscription.endDate);
        
        // Skip if end date is in the past
        if (endDate < today) continue;
        
        // Calculate days until expiration
        const daysUntil = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        
        // Create table row
        const row = document.createElement('tr');
        
        // School name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = school.name || 'Unknown School';
        row.appendChild(nameCell);
        
        // Plan type cell
        const planCell = document.createElement('td');
        planCell.textContent = school.subscription.planName || school.subscription.plan || 'Unknown plan';
        row.appendChild(planCell);
        
        // Expiry cell
        const expiryCell = document.createElement('td');
        expiryCell.textContent = daysUntil === 0 ? 'Today' : 
                               daysUntil === 1 ? 'Tomorrow' : 
                               `In ${daysUntil} days`;
        row.appendChild(expiryCell);
        
        // Add row to table
        renewalsTableBody.appendChild(row);
        
        // Limit to 3 entries
        renewalsAdded++;
        if (renewalsAdded >= 3) break;
    }
    
    // If no upcoming renewals were found
    if (renewalsAdded === 0) {
        renewalsTableBody.innerHTML = '<tr><td colspan="3" class="text-center">No upcoming renewals found</td></tr>';
    }
}

// Update chart period (month, quarter, year)
function updateChartPeriod(period) {
    // Store the selected period in a global variable or localStorage
    window.selectedPeriod = period;
    console.log('Updating chart period to:', period);
    
    // Show loading indicator
    const registrationChart = document.getElementById('registrationChart');
    if (registrationChart) {
        registrationChart.parentElement.classList.add('loading');
    }
    
    // Reload analytics data with the new period
    loadAnalyticsData();
}