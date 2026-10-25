const { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const {
    getMachineFingerprint,
    verifyCbtLicenseKey,
    consumeCbtLicenseFile,
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
                const currentDeviceId = getMachineFingerprint();
                if (data.activatedDeviceId && data.activatedDeviceId !== currentDeviceId) {
                    return { valid: false, expired: false, error: 'This CBT license is activated for a different device.', deviceId: currentDeviceId };
                }
                const verification = verifyCbtLicenseKey(data.licenseKey, data.schoolCode);
                return {
                    ...data,
                    ...verification,
                    deviceId: currentDeviceId
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

function isExternalStoragePath(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (process.platform === 'win32') {
        const root = path.parse(resolved).root;
        const drive = root && /^[A-Z]:\\$/i.test(root) ? `${root[0].toUpperCase()}:` : '';
        if (!drive) return false;
        try {
            const result = execFileSync('wmic', ['logicaldisk', 'where', `DeviceID='${drive}'`, 'get', 'DriveType', '/value'], { encoding: 'utf8', windowsHide: true });
            return /DriveType=2/i.test(result);
        } catch {
            try {
                const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${drive}'\").DriveType`], { encoding: 'utf8', windowsHide: true });
                return result.trim() === '2';
            } catch {
                return false;
            }
        }
    }
    return process.platform === 'darwin'
        ? resolved.startsWith('/Volumes/')
        : resolved.startsWith('/media/') || resolved.startsWith('/run/media/') || resolved.startsWith('/mnt/');
}

function activateLicenseFromExternalPath(filePath) {
    if (!isExternalStoragePath(filePath)) return { success: false, error: 'For security, activate the license directly from a USB or other removable storage device.' };
    const consumed = consumeCbtLicenseFile(fs.readFileSync(filePath, 'utf8'), getMachineFingerprint());
    if (!consumed.valid) return { success: false, error: consumed.error || 'License activation failed.' };
    if (consumed.lastSeat) {
        // Remove license details before deleting the final-seat file so any
        // recovered copy is only an invalid consumed marker.
        fs.writeFileSync(filePath, consumed.tombstoneRaw, 'utf8');
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            console.warn('Unable to remove consumed final-seat license file:', error.message);
        }
    } else {
        const replacementPath = `${filePath}.replacement-${process.pid}-${Date.now()}`;
        fs.writeFileSync(replacementPath, consumed.replacementRaw, 'utf8');
        try {
            fs.renameSync(replacementPath, filePath);
        } catch {
            fs.copyFileSync(replacementPath, filePath);
            fs.unlinkSync(replacementPath);
        }
    }
    const licenseRecord = {
        schoolCode: consumed.schoolCode, institutionName: consumed.institutionName, licenseKey: consumed.licenseKey,
        activatedAt: consumed.activatedAt, activatedDeviceId: consumed.activatedDeviceId,
        expiryDate: consumed.expiryDate, expiryTimestamp: consumed.expiryTimestamp,
        activationStartDate: consumed.activationStartDate, maxDevices: consumed.maxDevices,
        remainingDevices: consumed.remainingDevices, activationCount: consumed.activationCount,
        licenseId: consumed.licenseId, tier: consumed.tier, features: consumed.features,
        deviceId: getMachineFingerprint()
    };
    saveStoredLicense(licenseRecord);
    return {
        success: true,
        license: { ...licenseRecord, valid: true, expired: false },
        licenseFileDeleted: Boolean(consumed.lastSeat)
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
                        const result = activateLicenseFromExternalPath(arg);
                        if (result.success) mainWindow.webContents.send('cbt:license-activated-from-cli', { ...result.license, licenseFileDeleted: result.licenseFileDeleted });
                        else mainWindow.webContents.send('cbt:error-message', result.error);
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
            const result = activateLicenseFromExternalPath(filePath);
            return result.success ? { ...result, fileName: path.basename(filePath) } : result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to read license file.' };
        }
    });

    // Activate from raw license file content (e.g. drag & drop license file)
    ipcMain.handle('cbt:activate-from-license-content', async () => ({
        success: false,
        error: 'License activation is only allowed by selecting the file from removable external storage.'
    }));

    // Manual string license key activation fallback
    ipcMain.handle('cbt:activate-license-key', async () => ({
        success: false,
        error: 'Manual license keys are disabled. Select the signed license file from removable external storage.'
    }));

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
                    if (filePath.endsWith('.rolllic') || filePath.endsWith('.cbtlic')) {
                        const result = activateLicenseFromExternalPath(filePath);
                        if (result.success) mainWindow.webContents.send('cbt:license-activated-from-cli', { ...result.license, licenseFileDeleted: result.licenseFileDeleted });
                        else mainWindow.webContents.send('cbt:error-message', result.error);
                    } else {
                        const content = fs.readFileSync(filePath, 'utf8');
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


