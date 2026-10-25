const { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const {
    getMachineFingerprint,
    verifyCbtLicenseKey,
    verifyCbtLicenseFile,
    unpackRollCbt,
    packageExamToRollCbt,
    createSubmissionArchive
} = require('./crypto');

let mainWindow = null;
let activeExamSession = null;
let isKioskModeActive = false;

// License file path in user data directory
function getLicenseFilePath() {
    return path.join(app.getPath('userData'), 'rollcall-cbt-license.json');
}

// Read stored license
function readStoredLicense() {
    try {
        const filePath = getLicenseFilePath();
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (data && data.licenseKey && data.schoolCode) {
                const verification = verifyCbtLicenseKey(data.licenseKey, data.schoolCode);
                return {
                    ...data,
                    ...verification,
                    deviceId: getMachineFingerprint()
                };
            }
        }
    } catch (err) {
        console.error('Error reading stored license:', err);
    }
    return {
        valid: false,
        schoolCode: null,
        licenseKey: null,
        deviceId: getMachineFingerprint()
    };
}

// Save license
function saveStoredLicense(licenseData) {
    const filePath = getLicenseFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(licenseData, null, 2), 'utf8');
}

// Clear license
function clearStoredLicense() {
    try {
        const filePath = getLicenseFilePath();
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error('Error clearing license:', e);
    }
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1440, width),
        height: Math.min(920, height),
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0a0f1d',
        title: 'RollCall CBT - Offline Computer-Based Testing System',
        icon: path.join(__dirname, '..', '..', 'RollCall ERP', 'desktop', 'build', 'icon.ico'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true
        }
    });

    // Remove default menu for distraction-free exam environment
    Menu.setApplicationMenu(null);

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        handleCommandLineFiles();
    });

    // Detect focus loss during exam (Anti-Cheat)
    mainWindow.on('blur', () => {
        if (isKioskModeActive && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cbt:blur-detected', {
                timestamp: Date.now()
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function handleCommandLineFiles() {
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    for (const arg of args) {
        if (fs.existsSync(arg)) {
            if (arg.endsWith('.rollcbt')) {
                setTimeout(() => {
                    try {
                        const content = fs.readFileSync(arg, 'utf8');
                        const license = readStoredLicense();
                        if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
                        const exam = unpackRollCbt(content, license.schoolCode);
                        mainWindow.webContents.send('cbt:file-opened-from-cli', {
                            filePath: arg,
                            exam
                        });
                    } catch (e) {
                        mainWindow.webContents.send('cbt:error-message', e.message);
                    }
                }, 1000);
                break;
            } else if (arg.endsWith('.rolllic') || arg.endsWith('.cbtlic')) {
                setTimeout(() => {
                    try {
                        const content = fs.readFileSync(arg, 'utf8');
                        const verified = verifyCbtLicenseFile(content);
                        if (verified.valid) {
                            saveStoredLicense(verified);
                            mainWindow.webContents.send('cbt:license-activated-from-cli', verified);
                        } else {
                            mainWindow.webContents.send('cbt:error-message', verified.error);
                        }
                    } catch (e) {
                        mainWindow.webContents.send('cbt:error-message', e.message);
                    }
                }, 1000);
                break;
            }
        }
    }
}

// IPC Handlers
function setupIpcHandlers() {
    // License status
    ipcMain.handle('cbt:get-license-status', async () => {
        return readStoredLicense();
    });

    // Open License File Dialog (.rolllic / .cbtlic / .json)
    ipcMain.handle('cbt:open-license-file-dialog', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Offline CBT License File (.rolllic)',
            filters: [
                { name: 'RollCall CBT License Files', extensions: ['rolllic', 'cbtlic', 'json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths.length) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        try {
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const verified = verifyCbtLicenseFile(rawContent);
            if (!verified.valid) {
                return { success: false, error: verified.error || 'Invalid license file.' };
            }

            const licenseRecord = {
                schoolCode: verified.schoolCode,
                institutionName: verified.institutionName,
                licenseKey: verified.licenseKey,
                activatedAt: new Date().toISOString(),
                expiryDate: verified.expiryDate,
                expiryTimestamp: verified.expiryTimestamp,
                tier: verified.tier,
                features: verified.features,
                deviceId: getMachineFingerprint()
            };

            saveStoredLicense(licenseRecord);
            return { success: true, license: licenseRecord, fileName: path.basename(filePath) };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to read license file.' };
        }
    });

    // Activate from raw license file content (e.g. drag & drop license file)
    ipcMain.handle('cbt:activate-from-license-content', async (event, content) => {
        try {
            const verified = verifyCbtLicenseFile(content);
            if (!verified.valid) {
                return { success: false, error: verified.error || 'Invalid license file.' };
            }

            const licenseRecord = {
                schoolCode: verified.schoolCode,
                institutionName: verified.institutionName,
                licenseKey: verified.licenseKey,
                activatedAt: new Date().toISOString(),
                expiryDate: verified.expiryDate,
                expiryTimestamp: verified.expiryTimestamp,
                tier: verified.tier,
                features: verified.features,
                deviceId: getMachineFingerprint()
            };

            saveStoredLicense(licenseRecord);
            return { success: true, license: licenseRecord };
        } catch (e) {
            return { success: false, error: e.message || 'Error processing license.' };
        }
    });

    // Manual string license key activation fallback
    ipcMain.handle('cbt:activate-license-key', async (event, { schoolCode, licenseKey, institutionName }) => {
        const cleanSchoolCode = String(schoolCode || '').trim().toUpperCase();
        const cleanKey = String(licenseKey || '').trim();

        const verification = verifyCbtLicenseKey(cleanKey, cleanSchoolCode);
        if (!verification.valid) {
            return { success: false, error: verification.error || 'License activation failed.' };
        }

        const licenseRecord = {
            schoolCode: cleanSchoolCode,
            institutionName: institutionName || 'RollCall Institution',
            licenseKey: cleanKey,
            activatedAt: new Date().toISOString(),
            expiryDate: verification.expiryDate,
            expiryTimestamp: verification.expiryTimestamp,
            tier: verification.tier,
            deviceId: getMachineFingerprint()
        };

        saveStoredLicense(licenseRecord);
        return { success: true, license: licenseRecord };
    });

    ipcMain.handle('cbt:deactivate-license', async () => {
        clearStoredLicense();
        return { success: true };
    });

    // File Open Dialog for .rollcbt
    ipcMain.handle('cbt:open-exam-dialog', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select RollCall Exam File (.rollcbt)',
            filters: [
                { name: 'RollCall CBT Exam Files', extensions: ['rollcbt'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths.length) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        try {
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const license = readStoredLicense();
            if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
            const exam = unpackRollCbt(rawContent, license.schoolCode);
            return {
                canceled: false,
                filePath,
                fileName: path.basename(filePath),
                exam
            };
        } catch (error) {
            return {
                canceled: false,
                error: error.message || 'Failed to inspect or verify exam file.'
            };
        }
    });

    // Inspect exam directly from raw content (e.g. drag & drop .rollcbt into browser)
    ipcMain.handle('cbt:inspect-exam-content', async (event, rawContent) => {
        try {
            const license = readStoredLicense();
            if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
            const exam = unpackRollCbt(rawContent, license.schoolCode);
            return { success: true, exam };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Enter / Exit Kiosk Lockdown mode
    ipcMain.handle('cbt:set-kiosk-mode', async (event, enable) => {
        isKioskModeActive = !!enable;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setFullScreen(isKioskModeActive);
            mainWindow.setKiosk(isKioskModeActive);
            mainWindow.setAlwaysOnTop(isKioskModeActive, 'screen-saver');

            if (isKioskModeActive) {
                globalShortcut.register('CommandOrControl+W', () => {});
                globalShortcut.register('Alt+F4', () => {});
                globalShortcut.register('F11', () => {});
                globalShortcut.register('F12', () => {});
            } else {
                globalShortcut.unregisterAll();
            }
        }
        return { kiosk: isKioskModeActive };
    });

    // Save candidate submission archive (.rollcbt-sub) offline
    ipcMain.handle('cbt:save-submission', async (event, submissionData) => {
        try {
            const archiveContent = createSubmissionArchive(submissionData);
            const defaultFilename = `${submissionData.candidate.rollNo}_${submissionData.examCode}_submission.rollcbt-sub`.replace(/[^a-zA-Z0-9_.-]/g, '_');

            // Default save directory: Desktop or Documents
            const saveResult = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Official CBT Exam Submission Record (.rollcbt-sub)',
                defaultPath: path.join(app.getPath('desktop'), defaultFilename),
                filters: [
                    { name: 'RollCall CBT Submission File', extensions: ['rollcbt-sub'] }
                ]
            });

            if (saveResult.canceled || !saveResult.filePath) {
                // Also write a safe backup in userData/submissions
                const backupDir = path.join(app.getPath('userData'), 'submissions');
                fs.mkdirSync(backupDir, { recursive: true });
                const backupPath = path.join(backupDir, defaultFilename);
                fs.writeFileSync(backupPath, archiveContent, 'utf8');
                return { success: true, savedPath: backupPath, isBackup: true };
            }

            fs.writeFileSync(saveResult.filePath, archiveContent, 'utf8');
            return { success: true, savedPath: saveResult.filePath };
        } catch (err) {
            console.error('Error saving submission:', err);
            return { success: false, error: err.message };
        }
    });

    // Auto-save temporary response state (crash protection)
    ipcMain.handle('cbt:cache-session-progress', async (event, sessionData) => {
        try {
            const cacheDir = path.join(app.getPath('userData'), 'session_cache');
            fs.mkdirSync(cacheDir, { recursive: true });
            const cacheFile = path.join(cacheDir, `exam_${sessionData.examId}_${sessionData.rollNo}.json`);
            fs.writeFileSync(cacheFile, JSON.stringify(sessionData, null, 2), 'utf8');
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Close window / Quit application
    ipcMain.handle('cbt:exit-app', async () => {
        app.quit();
    });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            const filePath = commandLine.find(arg => arg.endsWith('.rollcbt') || arg.endsWith('.rolllic'));
            if (filePath && fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    if (filePath.endsWith('.rolllic') || filePath.endsWith('.cbtlic')) {
                        const verified = verifyCbtLicenseFile(content);
                        if (verified.valid) {
                            saveStoredLicense(verified);
                            mainWindow.webContents.send('cbt:license-activated-from-cli', verified);
                        }
                    } else {
                        const license = readStoredLicense();
                        if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
                        const exam = unpackRollCbt(content, license.schoolCode);
                        mainWindow.webContents.send('cbt:file-opened-from-cli', { filePath, exam });
                    }
                } catch (e) {
                    mainWindow.webContents.send('cbt:error-message', e.message);
                }
            }
        }
    });

    app.whenReady().then(() => {
        setupIpcHandlers();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('will-quit', () => {
        globalShortcut.unregisterAll();
    });
}


