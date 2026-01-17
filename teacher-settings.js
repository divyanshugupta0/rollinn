// Add enhanced settings features
document.addEventListener('DOMContentLoaded', function() {
    // Add enhanced profile settings
    const enhanceProfileSettings = function() {
        const profileForm = document.getElementById('profileSettingsForm');
        if (!profileForm) return;
        
        // Check if fields already exist
        if (document.getElementById('settingsDesignation')) return;
        
        // Find the last form-group
        const lastFormGroup = profileForm.querySelector('.form-group:last-of-type');
        if (!lastFormGroup) return;
        
        // Add designation field
        const designationGroup = document.createElement('div');
        designationGroup.className = 'form-group';
        designationGroup.innerHTML = `
            <label for="settingsDesignation"><i class="fas fa-id-badge"></i> Designation</label>
            <input type="text" id="settingsDesignation" class="form-control" placeholder="Your designation">
        `;
        lastFormGroup.insertAdjacentElement('afterend', designationGroup);
        
        // Add subjects taught field
        const subjectsGroup = document.createElement('div');
        subjectsGroup.className = 'form-group';
        subjectsGroup.innerHTML = `
            <label for="settingsSubjects"><i class="fas fa-book"></i> Subjects Taught</label>
            <input type="text" id="settingsSubjects" class="form-control" placeholder="Comma separated subjects">
        `;
        designationGroup.insertAdjacentElement('afterend', subjectsGroup);
        
        // Add profile picture upload
        const profilePicGroup = document.createElement('div');
        profilePicGroup.className = 'form-group';
        profilePicGroup.innerHTML = `
            <label for="settingsProfilePic"><i class="fas fa-camera"></i> Profile Picture</label>
            <div class="file-upload">
                <input type="file" id="settingsProfilePic" accept="image/*">
                <label for="settingsProfilePic" class="file-upload-btn">
                    <i class="fas fa-cloud-upload-alt"></i> Choose Image
                </label>
                <div id="profilePicPreview" class="image-preview"></div>
            </div>
        `;
        subjectsGroup.insertAdjacentElement('afterend', profilePicGroup);
        
        // Add profile picture preview functionality
        const profilePicInput = document.getElementById('settingsProfilePic');
        const profilePicPreview = document.getElementById('profilePicPreview');
        
        if (profilePicInput && profilePicPreview) {
            profilePicInput.addEventListener('change', function(e) {
                if (e.target.files && e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        profilePicPreview.innerHTML = `<img src="${e.target.result}" alt="Profile Preview">`;
                    };
                    reader.readAsDataURL(e.target.files[0]);
                }
            });
        }
    };
    
    // Add notification settings
    const addNotificationSettings = function() {
        const settingsForm = document.querySelector('.settings-form');
        if (!settingsForm) return;
        
        // Check if notification settings already exist
        if (document.getElementById('notificationSettingsForm')) return;
        
        // Add notification settings section
        const notificationSection = document.createElement('div');
        notificationSection.innerHTML = `
            <h2><i class="fas fa-bell"></i> Notification Settings</h2>
            
            <form id="notificationSettingsForm">
                <div class="form-group checkbox-group">
                    <input type="checkbox" id="emailNotifications" checked>
                    <label for="emailNotifications">Email Notifications</label>
                </div>
                
                <div class="form-group checkbox-group">
                    <input type="checkbox" id="attendanceReminders" checked>
                    <label for="attendanceReminders">Attendance Reminders</label>
                </div>
                
                <div class="form-group checkbox-group">
                    <input type="checkbox" id="reportNotifications" checked>
                    <label for="reportNotifications">Report Notifications</label>
                </div>
                
                <div class="form-group checkbox-group">
                    <input type="checkbox" id="systemUpdates">
                    <label for="systemUpdates">System Updates</label>
                </div>
                
                <button type="submit" class="primary-btn"><i class="fas fa-save"></i> Save Notification Settings</button>
            </form>
        `;
        settingsForm.appendChild(notificationSection);
        
        // Add event listener for notification settings form
        const notificationForm = document.getElementById('notificationSettingsForm');
        if (notificationForm) {
            notificationForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const settingsAlert = document.getElementById('settingsAlert');
                if (settingsAlert) {
                    showAlert(settingsAlert, '<i class="fas fa-check-circle"></i> Notification settings saved successfully!', 'success');
                }
            });
        }
    };
    
    // Add appearance settings
    const addAppearanceSettings = function() {
        const settingsForm = document.querySelector('.settings-form');
        if (!settingsForm) return;
        
        // Check if appearance settings already exist
        if (document.getElementById('appearanceSettingsForm')) return;
        
        // Add appearance settings section
        const appearanceSection = document.createElement('div');
        appearanceSection.innerHTML = `
            <h2><i class="fas fa-palette"></i> Appearance Settings</h2>
            
            <form id="appearanceSettingsForm">
                <div class="form-group">
                    <label for="themeSelect"><i class="fas fa-paint-brush"></i> Theme</label>
                    <select id="themeSelect" class="form-control">
                        <option value="light">Light Theme</option>
                        <option value="dark">Dark Theme</option>
                        <option value="system">System Default</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="fontSizeSelect"><i class="fas fa-text-height"></i> Font Size</label>
                    <select id="fontSizeSelect" class="form-control">
                        <option value="small">Small</option>
                        <option value="medium" selected>Medium</option>
                        <option value="large">Large</option>
                    </select>
                </div>
                
                <button type="submit" class="primary-btn"><i class="fas fa-save"></i> Save Appearance Settings</button>
            </form>
        `;
        settingsForm.appendChild(appearanceSection);
        
        // Add event listener for appearance settings form
        const appearanceForm = document.getElementById('appearanceSettingsForm');
        if (appearanceForm) {
            appearanceForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const settingsAlert = document.getElementById('settingsAlert');
                if (settingsAlert) {
                    showAlert(settingsAlert, '<i class="fas fa-check-circle"></i> Appearance settings saved successfully!', 'success');
                }
            });
        }
    };
    
    // Add styles for settings features
    const addStyles = function() {
        if (document.getElementById('teacher-settings-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'teacher-settings-styles';
        style.textContent = `
            /* File upload styles */
            .file-upload {
                margin-top: 10px;
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .file-upload input[type="file"] {
                position: absolute;
                width: 0.1px;
                height: 0.1px;
                opacity: 0;
                overflow: hidden;
                z-index: -1;
            }
            
            .file-upload-btn {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                color: #495057;
                border: 1px solid #dee2e6;
                padding: 12px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.3s ease;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
                display: inline-flex;
                align-items: center;
                gap: 8px;
                width: fit-content;
            }
            
            .file-upload-btn:hover {
                background: linear-gradient(135deg, #e9ecef, #dee2e6);
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            }
            
            .image-preview {
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                margin-top: 10px;
            }
            
            .image-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            /* Checkbox styles */
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .checkbox-group input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
            }
            
            .checkbox-group label {
                margin-bottom: 0;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    };
    
    // Helper function to show alerts
    const showAlert = function(element, message, type) {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    };
    
    // Initialize all settings features
    const initSettings = function() {
        addStyles();
        enhanceProfileSettings();
        addNotificationSettings();
        addAppearanceSettings();
    };
    
    // Run after a short delay to ensure DOM is fully loaded
    setTimeout(initSettings, 1000);
});