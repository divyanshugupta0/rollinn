// Interactive Map for Analytics Dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map when analytics tab is clicked
    const analyticsTab = document.querySelector('a[href="#analytics"]');
    if (analyticsTab) {
        analyticsTab.addEventListener('click', initializeMap);
    }
    
    // Also check if we're already on the analytics tab
    setTimeout(function() {
        if (document.getElementById('analytics').classList.contains('active')) {
            initializeMap();
        }
    }, 1000);
});

// Initialize the interactive map
function initializeMap() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;
    
    // Clear any existing content
    mapContainer.innerHTML = '';
    
    // Create the SVG map
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '250');
    svg.setAttribute('viewBox', '0 0 960 500');
    svg.style.maxWidth = '100%';
    
    // Add the map to the container
    mapContainer.appendChild(svg);
    
    // Draw the US map with regions
    drawUSMap(svg);
    
    // Add event listener for window resize
    window.addEventListener('resize', function() {
        // Adjust map size if needed
        const width = mapContainer.clientWidth;
        if (width > 0) {
            svg.setAttribute('width', width);
            svg.setAttribute('height', Math.min(250, width * 0.5));
        }
    });
}

// Draw the US map with regions
function drawUSMap(svg) {
    // Define regions with different colors
    const regions = [
        { id: 'northeast', path: 'M830,90 L900,70 L890,170 L800,190 L780,150 L830,90', fill: '#4a69bd', name: 'Northeast' },
        { id: 'midwest', path: 'M600,100 L750,80 L780,150 L700,250 L600,230 L600,100', fill: '#6ab04c', name: 'Midwest' },
        { id: 'south', path: 'M600,230 L700,250 L750,350 L650,400 L550,380 L500,300 L600,230', fill: '#eb4d4b', name: 'South' },
        { id: 'west', path: 'M200,100 L400,80 L450,200 L400,350 L300,400 L150,350 L200,100', fill: '#f6b93b', name: 'West' }
    ];
    
    // Draw each region
    regions.forEach(region => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', region.path);
        path.setAttribute('fill', region.fill);
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('id', region.id);
        
        // Add hover effect
        path.addEventListener('mouseover', function() {
            this.setAttribute('fill-opacity', '0.7');
            showTooltip(region.name);
        });
        
        path.addEventListener('mouseout', function() {
            this.setAttribute('fill-opacity', '1');
            hideTooltip();
        });
        
        // Add click event
        path.addEventListener('click', function() {
            showRegionDetails(region.name);
        });
        
        svg.appendChild(path);
    });
    
    // Add a title to the map
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', '480');
    title.setAttribute('y', '30');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '16');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#333');
    title.textContent = 'School Distribution by Region';
    svg.appendChild(title);
}

// Show tooltip on hover
function showTooltip(regionName) {
    // Create tooltip if it doesn't exist
    let tooltip = document.getElementById('map-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'map-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.padding = '5px 10px';
        tooltip.style.background = 'rgba(0,0,0,0.7)';
        tooltip.style.color = '#fff';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '1000';
        document.body.appendChild(tooltip);
    }
    
    // Update tooltip content and position
    tooltip.textContent = regionName;
    tooltip.style.display = 'block';
    
    // Position tooltip near mouse
    document.addEventListener('mousemove', positionTooltip);
}

// Position tooltip near mouse cursor
function positionTooltip(e) {
    const tooltip = document.getElementById('map-tooltip');
    if (tooltip) {
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY + 10) + 'px';
    }
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.getElementById('map-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
        document.removeEventListener('mousemove', positionTooltip);
    }
}

// Show region details when clicked
function showRegionDetails(regionName) {
    // Get data for the region (in a real app, this would come from Firebase)
    const regionData = getRegionData(regionName);
    
    // Update the region distribution display
    updateRegionDistribution(regionData);
    
    // Show an alert with the region name
    showAlert(`Showing data for ${regionName} region`, 'info');
}

// Get mock data for a region
function getRegionData(regionName) {
    // In a real app, this would fetch data from Firebase
    const mockData = {
        'Northeast': { schools: 45, students: 12500, growth: '+8%' },
        'Midwest': { schools: 32, students: 8700, growth: '+5%' },
        'South': { schools: 38, students: 10200, growth: '+12%' },
        'West': { schools: 28, students: 7600, growth: '+15%' }
    };
    
    return mockData[regionName] || { schools: 0, students: 0, growth: '0%' };
}

// Update region distribution display
function updateRegionDistribution(data) {
    const container = document.getElementById('regionDistribution');
    if (container) {
        // Add school count to the display
        const schoolsElement = document.createElement('div');
        schoolsElement.className = 'mt-2 text-info';
        schoolsElement.innerHTML = `<strong>Schools:</strong> ${data.schools}`;
        
        // Add student count to the display
        const studentsElement = document.createElement('div');
        studentsElement.className = 'text-primary';
        studentsElement.innerHTML = `<strong>Students:</strong> ${data.students}`;
        
        // Add growth rate to the display
        const growthElement = document.createElement('div');
        growthElement.className = 'text-success';
        growthElement.innerHTML = `<strong>Growth:</strong> ${data.growth}`;
        
        // Clear and update the container
        container.innerHTML = '';
        container.appendChild(schoolsElement);
        container.appendChild(studentsElement);
        container.appendChild(growthElement);
    }
}