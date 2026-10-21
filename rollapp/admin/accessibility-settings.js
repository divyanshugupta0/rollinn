// Accessibility Settings JavaScript
// Auto-save and apply settings on change

// Load accessibility settings from Firebase
function loadAccessibilitySettings() {
    if (!firebase || !firebase.database) {
        console.error('Firebase not initialized');
        return;
    }
    
    firebase.database().ref('accessibility_settings').once('value')
        .then((snapshot) => {
            const settings = snapshot.val() || {
                attendanceCapturing: true,
                desktopAttendanceBlocked: true,
                privacyMode: false,
                largeText: false,
                highContrast: false,
                audioNotifications: true,
                emailNotifications: true,
                mobileOptimization: true
            };
            
            // Set toggle states and apply settings
            setToggleAndApply('attendance-capturing-toggle', settings.attendanceCapturing);
            setToggleAndApply('desktop-attendance-block-toggle', settings.desktopAttendanceBlocked !== false);
            setToggleAndApply('privacy-mode-toggle', settings.privacyMode);
            setToggleAndApply('large-text-toggle', settings.largeText);
            setToggleAndApply('high-contrast-toggle', settings.highContrast);
            setToggleAndApply('audio-notifications-toggle', settings.audioNotifications);
            setToggleAndApply('email-notifications-toggle', settings.emailNotifications);
            setToggleAndApply('mobile-optimization-toggle', settings.mobileOptimization);
            
            // Initialize audio notifications
            audioNotificationsEnabled = settings.audioNotifications;
            window.audioNotificationsEnabled = settings.audioNotifications;
            setupAudioNotifications();
            
            // Add auto-save listeners
            addAutoSaveListeners();
        })
        .catch((error) => {
            console.error('Error loading accessibility settings:', error);
        });
}

// Set toggle state and apply setting
function setToggleAndApply(toggleId, value) {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
        toggle.checked = value;
        applySetting(toggleId, value);
    }
}

// Add auto-save listeners to all toggles
function addAutoSaveListeners() {
    const toggles = [
        'attendance-capturing-toggle',
        'desktop-attendance-block-toggle',
        'privacy-mode-toggle',
        'large-text-toggle',
        'high-contrast-toggle',
        'audio-notifications-toggle',
        'email-notifications-toggle',
        'mobile-optimization-toggle'
    ];
    
    toggles.forEach(toggleId => {
        const toggle = document.getElementById(toggleId);
        if (toggle) {
            toggle.addEventListener('change', () => {
                applySetting(toggleId, toggle.checked);
                autoSaveSettings();
            });
        }
    });
}

// Auto-save settings to Firebase
function autoSaveSettings() {
    if (!firebase || !firebase.database) return;
    
    const settings = {
        attendanceCapturing: document.getElementById('attendance-capturing-toggle').checked,
        desktopAttendanceBlocked: document.getElementById('desktop-attendance-block-toggle').checked,
        privacyMode: document.getElementById('privacy-mode-toggle').checked,
        largeText: document.getElementById('large-text-toggle').checked,
        highContrast: document.getElementById('high-contrast-toggle').checked,
        audioNotifications: document.getElementById('audio-notifications-toggle').checked,
        emailNotifications: document.getElementById('email-notifications-toggle').checked,
        mobileOptimization: document.getElementById('mobile-optimization-toggle').checked,
        lastUpdated: Date.now()
    };
    
    firebase.database().ref('accessibility_settings').set(settings)
        .catch((error) => {
            console.error('Auto-save failed:', error);
        });
}

// Global audio notification setting
let audioNotificationsEnabled = false;

// Apply setting to the site immediately
function applySetting(toggleId, value) {
    const body = document.body;
    
    switch(toggleId) {
        case 'privacy-mode-toggle':
            body.classList.toggle('privacy-mode', value);
            break;
        case 'large-text-toggle':
            body.classList.toggle('large-text', value);
            break;
        case 'high-contrast-toggle':
            body.classList.toggle('high-contrast', value);
            break;
        case 'mobile-optimization-toggle':
            body.classList.toggle('mobile-optimized', value);
            break;
        case 'audio-notifications-toggle':
            audioNotificationsEnabled = value;
            window.audioNotificationsEnabled = value;
            setupAudioNotifications();
            break;
    }
}

// Text-to-speech function
function speakNotification(text) {
    const toggle = document.getElementById('audio-notifications-toggle');
    const isEnabled = toggle && toggle.checked;
    
    console.log('speakNotification called with:', text);
    console.log('Toggle found:', !!toggle);
    console.log('Toggle checked:', toggle ? toggle.checked : 'N/A');
    console.log('Speech synthesis available:', 'speechSynthesis' in window);
    
    if (!isEnabled || !('speechSynthesis' in window)) {
        console.log('Audio notification skipped - not enabled or no speech synthesis');
        return;
    }
    
    const cleanText = text.replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, ' ');
    console.log('Speaking:', cleanText);
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    speechSynthesis.speak(utterance);
}

// Setup audio notifications
function setupAudioNotifications() {
    console.log('setupAudioNotifications called');
    
    if (!window.originalShowAlert) {
        window.originalShowAlert = window.showAlert;
        console.log('Saved original showAlert function');
    }
    if (!window.originalShowLoginStatus) {
        window.originalShowLoginStatus = window.showLoginStatus;
        console.log('Saved original showLoginStatus function');
    }
    
    window.showAlert = function(message, type) {
        console.log('showAlert intercepted:', message, type);
        if (window.originalShowAlert) {
            window.originalShowAlert.call(this, message, type);
        }
        speakNotification(message);
    };
    
    if (window.originalShowLoginStatus) {
        window.showLoginStatus = function(message, type) {
            console.log('showLoginStatus intercepted:', message, type);
            window.originalShowLoginStatus.call(this, message, type);
            speakNotification(message);
        };
    }
}

// Manual save function (kept for compatibility)
function saveAccessibilitySettings() {
    autoSaveSettings();
    if (window.showAlert) {
        showAlert('Settings saved successfully!', 'success');
    }
}

// Test audio function
function testAudio() {
    const toggle = document.getElementById('audio-notifications-toggle');
    if (toggle && toggle.checked) {
        speakNotification('Audio notifications are working correctly');
    } else {
        alert('Audio notifications are disabled. Please enable the toggle first.');
    }
}



// Make test function available
window.testAudio = testAudio;

// Show accessibility section
function showAccessibilitySection() {
    document.querySelectorAll('.section-template').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('accessibility-section').classList.remove('hidden');
    loadAccessibilitySettings();
}

// Initialize audio notifications on load
setTimeout(() => {
    setupAudioNotifications();
    setupNotificationObserver();
}, 1000);

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        setupAudioNotifications();
        setupNotificationObserver();
    }, 2000);
});

// Re-setup when accessibility settings are loaded
window.addEventListener('load', function() {
    setTimeout(() => {
        setupAudioNotifications();
    }, 3000);
});

// Setup mutation observer to watch for new notifications
function setupNotificationObserver() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === Node.ELEMENT_NODE && node.classList && 
                    node.classList.contains('status-indicator') && node.textContent) {
                    speakNotification(node.textContent);
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}



// Make functions globally available
window.saveAccessibilitySettings = saveAccessibilitySettings;
window.loadAccessibilitySettings = loadAccessibilitySettings;
window.showAccessibilitySection = showAccessibilitySection;
window.speakNotification = speakNotification;
window.audioNotificationsEnabled = audioNotificationsEnabled;
window.setupAudioNotifications = setupAudioNotifications;
