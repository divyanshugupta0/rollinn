const { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const QRCode = require('qrcode');
const fflate = require('fflate');

const CBT_QR_SYNC_SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';

function encryptAndFormatSyncPayload(objPayload) {
    const rawString = JSON.stringify(objPayload);
    const uncompressedBytes = Buffer.from(rawString, 'utf8');
    const compressed = fflate.deflateSync(uncompressedBytes, { level: 9 });
    
    const key = crypto.createHash('sha256').update(CBT_QR_SYNC_SALT).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(compressed)), cipher.final()]);
    
    const packed = Buffer.concat([iv, encrypted]);
    return `ROLLCALL_SYNC_V1:${packed.toString('base64')}`;
}

const {
    getMachineFingerprint,
    verifyCbtLicenseKey,
    verifyCbtLicenseFile,
    applyCbtLicenseGracePeriod,
    verifyClockIntegrity,
    consumeCbtLicenseFile,
    unpackRollCbt,
    packageExamToRollCbt,
    packStationVault,
    unpackStationVault,
    createSubmissionArchive
} = require('./crypto');

let mainWindow = null;
let activeExamSession = null;
let isKioskModeActive = false;

// Application-private .rollcbt vault path for license & station records
function getStationVaultPath() {
    return path.join(app.getPath('userData'), 'rollcall-station-vault.rollcbt');
}

// Legacy JSON license file path for automatic migration
function getLicenseFilePath() {
    return path.join(app.getPath('userData'), 'rollcall-cbt-license.json');
}

function isCbtTestMode() {
    return !app.isPackaged || process.argv.includes('--test-license') || process.env.ROLLCALL_CBT_TEST_MODE === '1';
}

function getValidExamSchoolCodes(license) {
    if (isCbtTestMode() || license?.temporaryTest) {
        return null; // In test mode or temporary test license, allow inspecting and testing any valid .rollcbt package
    }
    const codes = [];
    if (license?.schoolCode) codes.push(license.schoolCode);
    if (license?.schoolId) codes.push(license.schoolId);
    return codes.length ? codes : null;
}

// Read application-private .rollcbt vault
function readStationVault() {
    const vaultPath = getStationVaultPath();
    const legacyPath = getLicenseFilePath();
    const hwId = getMachineFingerprint();

    if (fs.existsSync(vaultPath)) {
        try {
            const raw = fs.readFileSync(vaultPath, 'utf8');
            return unpackStationVault(raw, hwId);
        } catch (err) {
            console.error('Error reading station vault .rollcbt:', err);
        }
    }

    // Migration from legacy plain JSON license if vault doesn't exist yet
    let legacyLicense = null;
    if (fs.existsSync(legacyPath)) {
        try {
            legacyLicense = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        } catch (_) {}
    }

    const defaultVault = {
        license: legacyLicense || null,
        records: []
    };

    if (legacyLicense) {
        saveStationVault(defaultVault);
    }

    return defaultVault;
}

// Save to application-private .rollcbt vault
function saveStationVault(vaultData) {
    try {
        const vaultPath = getStationVaultPath();
        fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
        const packed = packStationVault(vaultData, getMachineFingerprint());
        fs.writeFileSync(vaultPath, packed, 'utf8');
        return true;
    } catch (err) {
        console.error('Error saving station vault .rollcbt:', err);
        return false;
    }
}

// Read stored license from private .rollcbt vault
function readStoredLicense() {
    try {
        const vault = readStationVault();
        const data = vault.license;
        if (data && data.licenseKey && data.schoolCode) {
            const currentDeviceId = getMachineFingerprint();
            if (data.activatedDeviceId && data.activatedDeviceId !== currentDeviceId) {
                return {
                    valid: false,
                    expired: false,
                    clockTampered: false,
                    error: 'This CBT license is activated for a different device.',
                    deviceId: currentDeviceId
                };
            }

            // Monotonic air-gapped clock integrity check
            const clockCheck = verifyClockIntegrity(vault, data, Date.now());
            if (clockCheck.tampered) {
                return {
                    ...data,
                    valid: false,
                    expired: false,
                    clockTampered: true,
                    error: clockCheck.error,
                    lastVerifiedTime: clockCheck.lastVerifiedTime,
                    deviceId: currentDeviceId
                };
            }

            if (clockCheck.permanentlyExpired) {
                return {
                    ...data,
                    valid: false,
                    expired: true,
                    clockTampered: false,
                    error: clockCheck.error,
                    lastVerifiedTime: clockCheck.lastVerifiedTime,
                    deviceId: currentDeviceId
                };
            }

            // Normal clock: Ratchet forward monotonic timestamp if system clock has progressed
            const effectiveNow = clockCheck.effectiveTime;
            if (effectiveNow > (vault.lastKnownTimestamp || 0)) {
                vault.lastKnownTimestamp = effectiveNow;
                saveStationVault(vault);
            }

            const verification = verifyCbtLicenseKey(data.licenseKey, data.schoolCode, effectiveNow);
            const temporaryExpired = Boolean(data.temporaryTest && Number(data.testExpiresAt || 0) <= effectiveNow);
            return applyCbtLicenseGracePeriod({
                ...data,
                ...verification,
                valid: verification.valid && !temporaryExpired,
                expired: verification.expired || temporaryExpired,
                clockTampered: false,
                lastVerifiedTime: effectiveNow,
                error: temporaryExpired ? 'Temporary test license expired. Activate it again for testing.' : verification.error,
                deviceId: currentDeviceId
            }, effectiveNow);
        }
    } catch (err) {
        console.error('Error reading stored license from station vault:', err);
    }
    return {
        valid: false,
        schoolCode: null,
        licenseKey: null,
        deviceId: getMachineFingerprint(),
        clockTampered: false
    };
}

function activateTemporaryTestLicense(rawContent) {
    if (!isCbtTestMode()) return { success: false, error: 'Temporary local activation is disabled in the packaged production app.' };
    const verified = verifyCbtLicenseFile(rawContent);
    if (!verified.valid) return { success: false, error: verified.error || 'Test license verification failed.' };
    const now = Date.now();
    const record = {
        ...verified,
        temporaryTest: true,
        testExpiresAt: now + (24 * 60 * 60 * 1000),
        activatedAt: new Date(now).toISOString(),
        activatedDeviceId: getMachineFingerprint(),
        activationStartDate: verified.activationStartDate || new Date(now).toISOString(),
        remainingDevices: verified.remainingDevices,
        deviceId: getMachineFingerprint()
    };
    saveStoredLicense(record);
    return { success: true, license: { ...record, valid: true, expired: false } };
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
        schoolCode: consumed.schoolCode, institutionName: consumed.institutionName, schoolName: consumed.schoolName,
        licenseKey: consumed.licenseKey,
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
    const vault = readStationVault();
    vault.license = licenseData;
    saveStationVault(vault);
    try {
        const legacyPath = getLicenseFilePath();
        if (fs.existsSync(legacyPath)) {
            fs.unlinkSync(legacyPath);
        }
    } catch (_) {}
}

// Clear license
function clearStoredLicense() {
    try {
        const vault = readStationVault();
        vault.license = null;
        saveStationVault(vault);
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
        width: width,
        height: height,
        minWidth: 1024,
        minHeight: 700,
        frame: false,
        fullscreen: true,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0f1d',
        title: 'RollCall CBT - Offline Computer-Based Testing System',
        icon: path.join(__dirname, '..', 'images', 'icon.ico'),
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
        mainWindow.setFullScreen(true);
        mainWindow.show();
        // Open DevTools only when requested via --dev flag
        if (process.argv.includes('--dev')) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
        handleCommandLineFiles();
    });

    // Allow toggling DevTools with F12 or Ctrl+Shift+I (or Cmd+Option+I on macOS)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isF12 = input.key === 'F12';
        const isCtrlShiftI = (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i';
        if (input.type === 'keyDown' && (isF12 || isCtrlShiftI)) {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
            event.preventDefault();
        }
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
            if (path.basename(arg) === 'rollcall-station-vault.rollcbt') {
                continue;
            }
            if (arg.endsWith('.rollcbt')) {
                setTimeout(() => {
                    try {
                        const content = fs.readFileSync(arg, 'utf8');
                        const license = readStoredLicense();
                        if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
                        const exam = unpackRollCbt(content, getValidExamSchoolCodes(license));
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

function getDetectedRemovableDrives() {
    if (process.platform === 'win32') {
        try {
            const out = execFileSync('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-Command',
                'Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -Property DeviceID, VolumeName | ConvertTo-Json -Compress'
            ], { encoding: 'utf8', windowsHide: true }).trim();
            if (!out) return [];
            const parsed = JSON.parse(out);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            return items.map(d => ({
                path: `${d.DeviceID}\\`,
                drive: d.DeviceID,
                name: d.VolumeName || 'Removable Disk'
            }));
        } catch {
            return [];
        }
    } else if (process.platform === 'darwin') {
        try {
            if (fs.existsSync('/Volumes')) {
                return fs.readdirSync('/Volumes')
                    .filter(v => v !== 'Macintosh HD')
                    .map(v => ({ path: `/Volumes/${v}`, drive: v, name: v }));
            }
        } catch { return []; }
    } else {
        try {
            const dirs = ['/media', '/run/media'];
            const res = [];
            for (const d of dirs) {
                if (fs.existsSync(d)) {
                    for (const user of fs.readdirSync(d)) {
                        const userPath = path.join(d, user);
                        try {
                            if (fs.statSync(userPath).isDirectory()) {
                                for (const mount of fs.readdirSync(userPath)) {
                                    res.push({ path: path.join(userPath, mount), drive: mount, name: mount });
                                }
                            }
                        } catch {}
                    }
                }
            }
            return res;
        } catch { return []; }
    }
    return [];
}

// IPC Handlers
function setupIpcHandlers() {
    // License status
    ipcMain.handle('cbt:get-license-status', async () => {
        return readStoredLicense();
    });

    ipcMain.handle('cbt:get-test-mode', async () => isCbtTestMode());

    ipcMain.handle('cbt:get-removable-drives', async () => getDetectedRemovableDrives());

    ipcMain.handle('cbt:open-test-license-dialog', async () => {
        if (!isCbtTestMode()) return { success: false, error: 'Temporary local activation is disabled in the packaged production app.' };
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Local Test License File',
            filters: [{ name: 'RollCall CBT License Files', extensions: ['rolllic', 'cbtlic', 'json'] }],
            properties: ['openFile']
        });
        if (result.canceled || !result.filePaths.length) return { canceled: true };
        try {
            const raw = fs.readFileSync(result.filePaths[0], 'utf8');
            return { ...activateTemporaryTestLicense(raw), fileName: path.basename(result.filePaths[0]) };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to read test license file.' };
        }
    });

    // Open License File Dialog (.rolllic / .cbtlic / .json)
    ipcMain.handle('cbt:open-license-file-dialog', async () => {
        const drives = getDetectedRemovableDrives();
        const defaultPath = drives.length ? drives[0].path : undefined;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Offline CBT License File (.rolllic)',
            defaultPath,
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
            const exam = unpackRollCbt(rawContent, getValidExamSchoolCodes(license));
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

    // LAN Live Mode: HTTP proxy to communicate reliably with RollCall ERP on local subnet
    ipcMain.handle('cbt:lan-fetch', async (event, options) => {
        try {
            const url = options.url;
            const method = (options.method || 'GET').toUpperCase();
            const headers = options.headers || {};
            const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 8000);

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: ['GET', 'HEAD'].includes(method) ? undefined : body,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json().catch(() => ({}));
            return {
                ok: res.ok,
                status: res.status,
                data
            };
        } catch (error) {
            return {
                ok: false,
                status: 0,
                error: error.name === 'AbortError' ? 'Connection timed out. Check ERP host IP and port.' : error.message
            };
        }
    });

    // Inspect exam directly from raw content (e.g. drag & drop .rollcbt into browser)
    ipcMain.handle('cbt:inspect-exam-content', async (event, rawContent) => {
        try {
            const license = readStoredLicense();
            if (!license.valid || license.expired) throw new Error("An active admin-issued CBT license is required to open this exam file.");
            const exam = unpackRollCbt(rawContent, getValidExamSchoolCodes(license));
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
            mainWindow.setAlwaysOnTop(isKioskModeActive);
            mainWindow.focus();
            mainWindow.webContents.focus();

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

    // Generate encrypted sync QR code for continuous scanner ingestion
    ipcMain.handle('cbt:generate-sync-qr', async (event, payload) => {
        try {
            const envelope = encryptAndFormatSyncPayload(payload);
            const qrDataUrl = await QRCode.toDataURL(envelope, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 380,
                color: {
                    dark: '#0f172a',
                    light: '#ffffff'
                }
            });
            return { success: true, qrDataUrl, rawEnvelope: envelope };
        } catch (err) {
            console.error('Error generating sync QR:', err);
            return { success: false, error: err.message };
        }
    });

    // Window controls for frameless window
    ipcMain.handle('cbt:minimize-window', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    });

    ipcMain.handle('cbt:toggle-maximize-window', async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMaximized()) mainWindow.unmaximize();
            else mainWindow.maximize();
        }
    });

    ipcMain.handle('cbt:confirmDialog', async (event, { title, message, detail, confirmLabel, cancelLabel }) => {
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: [confirmLabel || 'OK', cancelLabel || 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            title: title || 'Confirmation',
            message: message || '',
            detail: detail || ''
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
            mainWindow.webContents.focus();
        }
        return result.response === 0;
    });

    ipcMain.handle('cbt:resetFocus', async () => {
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        try {
            mainWindow.blur();
            await new Promise(resolve => setTimeout(resolve, 60));
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focus();
                mainWindow.webContents.focus();
            }
        } catch (_) {}
        return true;
    });

    // Station Exam Records & Vault (.rollcbt)
    ipcMain.handle('cbt:get-station-records', async () => {
        try {
            const vault = readStationVault();
            const records = Array.isArray(vault.records) ? vault.records : [];
            console.log('[station-vault] get records:', records.length, records.slice(0, 3).map(r => ({
                id: r?.id,
                examId: r?.exam?.id || r?.examId,
                examTitle: r?.exam?.title || r?.examTitle,
                candidate: r?.candidate?.name || r?.candidateName
            })));
            return records;
        } catch (err) {
            console.error('Error getting station records from vault:', err);
            return [];
        }
    });

    ipcMain.handle('cbt:save-station-record', async (event, recordOrList) => {
        try {
            const vault = readStationVault();
            let records = Array.isArray(vault.records) ? vault.records : [];
            const toAdd = Array.isArray(recordOrList) ? recordOrList : [recordOrList];
            for (const item of toAdd) {
                if (!item) continue;
                const itemId = item.id || `${item.candidate?.rollNo}_${item.exam?.id}_${item.timestamp}`;
                const existingIdx = records.findIndex(r => (r.id && r.id === itemId) || (`${r.candidate?.rollNo}_${r.exam?.id}_${r.timestamp}` === itemId));
                if (existingIdx >= 0) {
                    records[existingIdx] = { ...records[existingIdx], ...item };
                } else {
                    records.unshift(item);
                }
            }
            if (records.length > 1000) records.length = 1000;
            vault.records = records;
            const success = saveStationVault(vault);
            console.log('[station-vault] saved record:', {
                success,
                total: records.length,
                examId: recordOrList?.exam?.id || recordOrList?.examId,
                examTitle: recordOrList?.exam?.title || recordOrList?.examTitle,
                candidate: recordOrList?.candidate?.name || recordOrList?.candidateName
            });
            return { success, count: records.length };
        } catch (err) {
            console.error('Error saving station record to vault:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('cbt:delete-station-record', async (event, payload) => {
        try {
            const recordId = String(payload?.recordId || '').trim();
            const examId = String(payload?.examId || '').trim();
            if (!recordId) return { success: false, error: 'Missing station record ID.' };

            const vault = readStationVault();
            const records = Array.isArray(vault.records) ? vault.records : [];
            const before = records.length;
            vault.records = records.filter(record => {
                const sameId = String(record?.id || '').trim() === recordId;
                const recordExamId = String(record?.exam?.id || record?.examId || record?.exam?.code || '').trim();
                const sameExam = !examId || recordExamId === examId;
                return !(sameId && sameExam);
            });
            const success = before !== vault.records.length ? saveStationVault(vault) : true;
            console.log('[station-vault] deleted record:', { success, recordId, examId, removed: before - vault.records.length });
            return { success, removed: before - vault.records.length };
        } catch (err) {
            console.error('Error deleting station record from vault:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('cbt:clear-station-records', async () => {
        try {
            const vault = readStationVault();
            vault.records = [];
            const success = saveStationVault(vault);
            return { success };
        } catch (err) {
            console.error('Error clearing station records from vault:', err);
            return { success: false, error: err.message };
        }
    });

    // Close window / Quit application
    ipcMain.handle('cbt:exit-app', async () => {
        app.quit();
    });

    // Monotonic clock ratchet & anti-rollback heartbeat (runs every 60s)
    setInterval(() => {
        try {
            const vault = readStationVault();
            if (vault && vault.license) {
                const check = verifyClockIntegrity(vault, vault.license, Date.now());
                if (check.tampered) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('cbt:clock-tamper-detected', {
                            message: check.error,
                            lastVerifiedTime: check.lastVerifiedTime
                        });
                    }
                } else if (Date.now() > (vault.lastKnownTimestamp || 0) + 60000) {
                    vault.lastKnownTimestamp = Date.now();
                    saveStationVault(vault);
                }
            }
        } catch (_) {}
    }, 60000);
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
            const filePath = commandLine.find(arg => (arg.endsWith('.rollcbt') || arg.endsWith('.rolllic')) && path.basename(arg) !== 'rollcall-station-vault.rollcbt');
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
                        const exam = unpackRollCbt(content, getValidExamSchoolCodes(license));
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


