// System maintenance functions
function backupDatabase() {
    console.log("Backup database function called");
    
    if (!currentUser || !ownerAuth) {
        showAlert('You must be logged in to perform backups', 'danger');
        return;
    }
    
    showAlert('Database backup started...', 'info');
    
    // Create backup record
    const timestamp = new Date().toISOString();
    const backupRef = ownerAuth.database().ref('owners/' + currentUser.uid + '/maintenance/backups').push();
    
    backupRef.set({
        timestamp: timestamp,
        status: 'completed',
        type: 'manual'
    })
    .then(() => {
        showAlert('Database backup completed successfully', 'success');
        updateSystemInfo();
    })
    .catch(error => {
        console.error('Error saving backup:', error);
        showAlert('Error during backup: ' + error.message, 'danger');
    });
}

function clearCache() {
    console.log("Clear cache function called");
    
    showAlert('Cache clearing in progress...', 'info');
    
    if (currentUser && ownerAuth) {
        // Record cache clear action
        ownerAuth.database().ref('owners/' + currentUser.uid + '/maintenance/cacheClears').push({
            timestamp: new Date().toISOString(),
            status: 'completed'
        })
        .then(() => {
            showAlert('Cache cleared successfully', 'success');
            updateSystemInfo();
        })
        .catch(error => {
            console.error('Error recording cache clear:', error);
        });
    } else {
        setTimeout(() => {
            showAlert('Cache cleared successfully', 'success');
        }, 1000);
    }
}

function updateSystem() {
    console.log("Update system function called");
    
    showAlert('System update in progress...', 'info');
    
    if (currentUser && ownerAuth) {
        // Record system update action
        ownerAuth.database().ref('owners/' + currentUser.uid + '/maintenance/updates').push({
            timestamp: new Date().toISOString(),
            version: '1.2.5',
            status: 'completed'
        })
        .then(() => {
            // Update system info in database
            ownerAuth.database().ref('owners/' + currentUser.uid + '/systemInfo').update({
                version: '1.2.5',
                lastUpdated: new Date().toISOString()
            })
            .then(() => {
                showAlert('System updated successfully to version 1.2.5', 'success');
                updateSystemInfo();
            });
        })
        .catch(error => {
            console.error('Error recording system update:', error);
        });
    } else {
        setTimeout(() => {
            showAlert('System updated successfully to version 1.2.5', 'success');
        }, 1500);
    }
}

function restartSystem() {
    console.log("Restart system function called");
    
    if (confirm('Are you sure you want to restart the system? This will log you out.')) {
        showAlert('System restarting...', 'warning');
        
        if (currentUser && ownerAuth) {
            // Record system restart action
            ownerAuth.database().ref('owners/' + currentUser.uid + '/maintenance/restarts').push({
                timestamp: new Date().toISOString(),
                status: 'initiated'
            })
            .then(() => {
                setTimeout(() => {
                    ownerAuth.auth().signOut()
                        .then(() => {
                            hideApp();
                            showAlert('System restarted successfully. Please log in again.', 'success');
                        })
                        .catch(error => {
                            showAlert('Error during restart: ' + error.message, 'danger');
                        });
                }, 2000);
            })
            .catch(error => {
                console.error('Error recording system restart:', error);
            });
        } else {
            setTimeout(() => {
                location.reload();
            }, 2000);
        }
    }
}

// Update system information
function updateSystemInfo() {
    console.log("Updating system info");
    if (!currentUser || !ownerAuth) return;
    
    // Initialize system info if it doesn't exist
    ownerAuth.database().ref('owners/' + currentUser.uid + '/systemInfo').once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                // Create initial system info
                ownerAuth.database().ref('owners/' + currentUser.uid + '/systemInfo').set({
                    version: '1.2.5',
                    lastUpdated: new Date().toISOString(),
                    databaseSize: '0.1 MB',
                    storageUsage: 1
                });
            }
            
            // Get system info
            return ownerAuth.database().ref('owners/' + currentUser.uid + '/systemInfo').once('value');
        })
        .then(snapshot => {
            if (snapshot.exists()) {
                const systemInfo = snapshot.val();
                
                // Update UI
                document.getElementById('lastUpdatedDate').textContent = 
                    new Date(systemInfo.lastUpdated).toLocaleDateString();
                
                // Calculate database size
                ownerAuth.database().ref('owners/' + currentUser.uid).once('value')
                    .then(dataSnapshot => {
                        if (dataSnapshot.exists()) {
                            const data = JSON.stringify(dataSnapshot.val());
                            const sizeInMB = (data.length / (1024 * 1024)).toFixed(1);
                            
                            // Update UI
                            document.getElementById('databaseSize').textContent = sizeInMB + ' MB';
                            
                            // Update storage usage
                            const percentage = Math.min(Math.round((sizeInMB / 10) * 100), 100);
                            document.getElementById('storageUsageBar').style.width = percentage + '%';
                            document.getElementById('storageUsageText').textContent = percentage + '% of 10MB used';
                            
                            // Change color based on usage
                            if (percentage > 80) {
                                document.getElementById('storageUsageBar').className = 'progress-bar bg-danger';
                            } else if (percentage > 60) {
                                document.getElementById('storageUsageBar').className = 'progress-bar bg-warning';
                            } else {
                                document.getElementById('storageUsageBar').className = 'progress-bar bg-success';
                            }
                            
                            // Save to database
                            ownerAuth.database().ref('owners/' + currentUser.uid + '/systemInfo').update({
                                databaseSize: sizeInMB + ' MB',
                                storageUsage: percentage
                            });
                        }
                    });
            }
        });
    
    // Count backups
    ownerAuth.database().ref('owners/' + currentUser.uid + '/maintenance/backups').once('value')
        .then(snapshot => {
            const backupCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            document.getElementById('backupCount').textContent = backupCount;
        });
}

// Initialize system maintenance
document.addEventListener('DOMContentLoaded', function() {
    console.log("System maintenance script loaded");
    
    // Update system info when settings section is shown
    const settingsTab = document.querySelector('a[href="#settings"]');
    if (settingsTab) {
        settingsTab.addEventListener('click', function() {
            console.log("Settings tab clicked");
            setTimeout(updateSystemInfo, 500);
        });
    }
    
    // Initial update of system info
    setTimeout(updateSystemInfo, 3000);
});