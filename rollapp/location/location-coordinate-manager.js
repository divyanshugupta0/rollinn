// Location Coordinate Manager - Handles smooth location updates without page jumps
document.addEventListener('DOMContentLoaded', function() {
    let locationUpdateInterval = null;
    let lastKnownPosition = null;
    let locationStabilityCounter = 0;
    let isLocationStable = false;
    
    // Configuration
    const LOCATION_UPDATE_INTERVAL = 10000; // 10 seconds
    const STABILITY_THRESHOLD = 3; // Number of similar readings for stability
    const DISTANCE_THRESHOLD = 50; // Meters - consider location stable if within this distance
    
    // Enhanced location tracking
    function initializeLocationTracking() {
        if (!navigator.geolocation) {
            console.log("Geolocation not supported");
            return;
        }
        
        // Start continuous location monitoring
        startContinuousLocationTracking();
    }
    
    // Start continuous location tracking
    function startContinuousLocationTracking() {
        console.log("Starting continuous location tracking...");
        
        // Initial location fetch
        getCurrentLocationSmooth();
        
        // Set up interval for periodic updates
        locationUpdateInterval = setInterval(() => {
            getCurrentLocationSmooth();
        }, LOCATION_UPDATE_INTERVAL);
        
        // Also use watchPosition for real-time updates
        if (navigator.geolocation.watchPosition) {
            navigator.geolocation.watchPosition(
                handleLocationUpdate,
                handleLocationError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 30000, // 30 seconds
                    timeout: 15000 // 15 seconds
                }
            );
        }
    }
    
    // Get current location smoothly
    function getCurrentLocationSmooth() {
        navigator.geolocation.getCurrentPosition(
            handleLocationUpdate,
            handleLocationError,
            {
                enableHighAccuracy: true,
                maximumAge: 10000, // 10 seconds
                timeout: 10000 // 10 seconds
            }
        );
    }
    
    // Handle location update
    function handleLocationUpdate(position) {
        const newPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
        };
        
        console.log("Location update received:", newPosition);
        
        // Check if location is stable
        if (isLocationChangeSignificant(newPosition)) {
            console.log("Significant location change detected");
            locationStabilityCounter = 0;
            isLocationStable = false;
            
            // Update location immediately for significant changes
            updateLocationCoordinates(newPosition);
        } else {
            locationStabilityCounter++;
            
            if (locationStabilityCounter >= STABILITY_THRESHOLD) {
                if (!isLocationStable) {
                    console.log("Location stabilized");
                    isLocationStable = true;
                }
                
                // Update with stable location
                updateLocationCoordinates(newPosition);
            }
        }
        
        lastKnownPosition = newPosition;
    }
    
    // Handle location error
    function handleLocationError(error) {
        console.error("Location error:", error);
        
        let errorMessage = "Location access error";\n        \n        switch(error.code) {\n            case error.PERMISSION_DENIED:\n                errorMessage = "Location access denied. Please enable location services.";\n                break;\n            case error.POSITION_UNAVAILABLE:\n                errorMessage = "Location information unavailable.";\n                break;\n            case error.TIMEOUT:\n                errorMessage = "Location request timed out.";\n                break;\n        }\n        \n        // Show error in UI without disrupting scroll\n        showLocationError(errorMessage);\n    }\n    \n    // Check if location change is significant\n    function isLocationChangeSignificant(newPosition) {\n        if (!lastKnownPosition) {\n            return true; // First location is always significant\n        }\n        \n        const distance = calculateDistanceSimple(\n            lastKnownPosition.lat, lastKnownPosition.lng,\n            newPosition.lat, newPosition.lng\n        );\n        \n        return distance > DISTANCE_THRESHOLD;\n    }\n    \n    // Simple distance calculation\n    function calculateDistanceSimple(lat1, lon1, lat2, lon2) {\n        const R = 6371000; // Earth radius in meters\n        const dLat = (lat2 - lat1) * Math.PI / 180;\n        const dLon = (lon2 - lon1) * Math.PI / 180;\n        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +\n                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *\n                  Math.sin(dLon/2) * Math.sin(dLon/2);\n        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n        return R * c;\n    }\n    \n    // Update location coordinates smoothly\n    function updateLocationCoordinates(position) {\n        // Store current scroll position\n        const scrollY = window.pageYOffset || document.documentElement.scrollTop;\n        \n        // Lock scroll to prevent jumping\n        if (typeof window.lockScroll === 'function') {\n            window.lockScroll();\n        }\n        \n        // Update coordinate displays\n        updateCoordinateDisplays(position);\n        \n        // Update available classes without full reload\n        if (typeof window.findNearbyLocationsWithProximity === 'function') {\n            // Use a small delay to ensure DOM updates are complete\n            setTimeout(() => {\n                window.findNearbyLocationsWithProximity(position.lat, position.lng);\n                \n                // Restore scroll position after a brief delay\n                setTimeout(() => {\n                    window.scrollTo(0, scrollY);\n                }, 100);\n            }, 50);\n        }\n        \n        // Update distance info\n        updateDistanceInfo(position);\n    }\n    \n    // Update coordinate displays\n    function updateCoordinateDisplays(position) {\n        const currentLatitude = document.getElementById('current-latitude');\n        const currentLongitude = document.getElementById('current-longitude');\n        const locationInfo = document.getElementById('location-info');\n        \n        if (currentLatitude) {\n            currentLatitude.textContent = `Latitude: ${position.lat.toFixed(6)}`;\n        }\n        \n        if (currentLongitude) {\n            currentLongitude.textContent = `Longitude: ${position.lng.toFixed(6)}`;\n        }\n        \n        if (locationInfo) {\n            locationInfo.classList.remove('hidden');\n        }\n        \n        // Hide location status if it's showing\n        const locationStatus = document.getElementById('location-status');\n        if (locationStatus) {\n            locationStatus.classList.add('hidden');\n        }\n    }\n    \n    // Update distance info\n    function updateDistanceInfo(position) {\n        const distanceInfo = document.getElementById('distance-info');\n        if (!distanceInfo) return;\n        \n        // This will be updated by the class checking function\n        distanceInfo.textContent = 'Distance from classes: Calculating...';\n    }\n    \n    // Show location error without disrupting scroll\n    function showLocationError(message) {\n        const locationStatus = document.getElementById('location-status');\n        if (locationStatus) {\n            locationStatus.textContent = message;\n            locationStatus.className = 'status-indicator error';\n            locationStatus.classList.remove('hidden');\n        }\n        \n        // Update badges to show error state\n        const locationBadge = document.getElementById('location-badge');\n        const methodBadge = document.getElementById('method-badge');\n        \n        if (locationBadge) {\n            locationBadge.className = 'badge badge-danger';\n            locationBadge.textContent = 'Location: Error';\n        }\n        \n        if (methodBadge) {\n            methodBadge.textContent = 'Method: Error';\n            methodBadge.className = 'badge badge-danger';\n        }\n    }\n    \n    // Override the original startLocationTracking function\n    if (typeof window.startLocationTracking === 'function') {\n        window.originalStartLocationTracking = window.startLocationTracking;\n    }\n    \n    window.startLocationTracking = function() {\n        console.log("Enhanced location tracking started");\n        initializeLocationTracking();\n    };\n    \n    // Override the original updatePosition function to prevent scroll issues\n    if (typeof window.updatePosition === 'function') {\n        window.originalUpdatePosition = window.updatePosition;\n    }\n    \n    window.updatePosition = function(position) {\n        // Use our enhanced location update instead\n        handleLocationUpdate(position);\n    };\n    \n    // Clean up on page unload\n    window.addEventListener('beforeunload', function() {\n        if (locationUpdateInterval) {\n            clearInterval(locationUpdateInterval);\n        }\n    });\n    \n    // Smooth scroll restoration\n    function smoothScrollRestore(targetY) {\n        const startY = window.pageYOffset || document.documentElement.scrollTop;\n        const distance = targetY - startY;\n        const duration = 300; // 300ms animation\n        let start = null;\n        \n        function step(timestamp) {\n            if (!start) start = timestamp;\n            const progress = Math.min((timestamp - start) / duration, 1);\n            \n            // Easing function for smooth animation\n            const ease = progress * (2 - progress);\n            \n            window.scrollTo(0, startY + (distance * ease));\n            \n            if (progress < 1) {\n                requestAnimationFrame(step);\n            }\n        }\n        \n        requestAnimationFrame(step);\n    }\n    \n    // Enhanced scroll restoration\n    window.smoothScrollRestore = smoothScrollRestore;\n    \n    console.log("Location Coordinate Manager initialized");\n});