const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rollcallCBT', {
    // Offline License Management
    getLicenseStatus: () => ipcRenderer.invoke('cbt:get-license-status'),
    getTestMode: () => ipcRenderer.invoke('cbt:get-test-mode'),
    openLicenseFileDialog: () => ipcRenderer.invoke('cbt:open-license-file-dialog'),
    openTestLicenseDialog: () => ipcRenderer.invoke('cbt:open-test-license-dialog'),
    getRemovableDrives: () => ipcRenderer.invoke('cbt:get-removable-drives'),
    activateFromLicenseContent: (content) => ipcRenderer.invoke('cbt:activate-from-license-content', content),
    activateLicenseKey: (payload) => ipcRenderer.invoke('cbt:activate-license-key', payload),
    deactivateLicense: () => ipcRenderer.invoke('cbt:deactivate-license'),

    // Exam File Operations
    openExamDialog: () => ipcRenderer.invoke('cbt:open-exam-dialog'),
    inspectExamContent: (content) => ipcRenderer.invoke('cbt:inspect-exam-content', content),

    // Exam Security & Kiosk
    setKioskMode: (enable) => ipcRenderer.invoke('cbt:set-kiosk-mode', enable),
    onBlurDetected: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('cbt:blur-detected', handler);
        return () => ipcRenderer.removeListener('cbt:blur-detected', handler);
    },
    onFileOpenedFromCli: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('cbt:file-opened-from-cli', handler);
        return () => ipcRenderer.removeListener('cbt:file-opened-from-cli', handler);
    },
    onLicenseActivatedFromCli: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('cbt:license-activated-from-cli', handler);
        return () => ipcRenderer.removeListener('cbt:license-activated-from-cli', handler);
    },
    onErrorMessage: (callback) => {
        const handler = (event, msg) => callback(msg);
        ipcRenderer.on('cbt:error-message', handler);
        return () => ipcRenderer.removeListener('cbt:error-message', handler);
    },

    // Session caching & Submission
    cacheSessionProgress: (sessionData) => ipcRenderer.invoke('cbt:cache-session-progress', sessionData),
    saveSubmission: (submissionData) => ipcRenderer.invoke('cbt:save-submission', submissionData),
    generateSyncQr: (payload) => ipcRenderer.invoke('cbt:generate-sync-qr', payload),

    // Exit & Window controls
    minimizeWindow: () => ipcRenderer.invoke('cbt:minimize-window'),
    toggleMaximizeWindow: () => ipcRenderer.invoke('cbt:toggle-maximize-window'),
    exitApp: () => ipcRenderer.invoke('cbt:exit-app')
});
