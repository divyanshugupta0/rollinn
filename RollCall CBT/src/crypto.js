const crypto = require('crypto');
const os = require('os');

const CBT_SALT = 'ROLLCALL_CBT_SECURE_AUTH_V1_SECRET_2026';
const CBT_EXAM_SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';
const CBT_LICENSE_GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;

function applyCbtLicenseGracePeriod(licenseInfo, now = Date.now()) {
    const expiryTimestamp = Number(licenseInfo?.expiryTimestamp) || Date.parse(licenseInfo?.expiryDate || '');
    if (!Number.isFinite(expiryTimestamp)) return licenseInfo;
    const gracePeriodEndsAt = expiryTimestamp + CBT_LICENSE_GRACE_PERIOD_MS;
    if (now <= expiryTimestamp) return { ...licenseInfo, inGracePeriod: false, renewalRequired: false };

    const graceDaysRemaining = Math.max(0, Math.ceil((gracePeriodEndsAt - now) / (24 * 60 * 60 * 1000)));
    if (now <= gracePeriodEndsAt) {
        return {
            ...licenseInfo,
            valid: true,
            expired: false,
            licenseExpired: true,
            inGracePeriod: true,
            renewalRequired: true,
            gracePeriodEndsAt,
            graceDaysRemaining,
            error: `License expired. Renewal required within ${graceDaysRemaining} day${graceDaysRemaining === 1 ? '' : 's'} or the IDE will lock.`
        };
    }
    return {
        ...licenseInfo,
        valid: false,
        expired: true,
        licenseExpired: true,
        inGracePeriod: false,
        renewalRequired: true,
        gracePeriodExpired: true,
        gracePeriodEndsAt,
        graceDaysRemaining: 0,
        error: 'License grace period ended. Please renew from the RollCall Admin Panel.'
    };
}

/**
 * Generate a unique hardware fingerprint for this machine
 */
function getMachineFingerprint() {
    const raw = [
        os.hostname(),
        os.platform(),
        os.arch(),
        os.release(),
        os.cpus()[0]?.model || 'unknown-cpu'
    ].join('::');
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Generate a CBT License key (used by Admin Panel & offline generator)
 * Format: RCCBT-V1-<SCHOOLCODE>-<EXPIRY_MS>-<SIGNATURE>
 */
function generateCbtLicenseKey(schoolCode, expiryDateMs = null) {
    const cleanCode = String(schoolCode || '').trim().toUpperCase();
    if (!cleanCode) throw new Error('Valid school code is required to generate CBT license.');
    
    // Default 1 year validity if not specified
    const expiry = Number(expiryDateMs) || (Date.now() + 365 * 24 * 60 * 60 * 1000);
    const dataToSign = `RCCBT::${cleanCode}::${expiry}::${CBT_SALT}`;
    const sig = crypto.createHmac('sha256', CBT_SALT).update(dataToSign).digest('hex').substring(0, 32);
    
    return `RCCBT-V1-${cleanCode}-${expiry}-${sig}`;
}

/**
 * Generate a complete offline CBT License File (.rolllic)
 */
function generateCbtLicenseFile(schoolCode, institutionName = 'RollCall Institution', expiryDateMs = null, options = {}) {
    const cleanCode = String(schoolCode || '').trim().toUpperCase();
    const expiry = Number(expiryDateMs) || (Date.now() + 365 * 24 * 60 * 60 * 1000);
    const licenseKey = generateCbtLicenseKey(cleanCode, expiry);
    const maxDevices = Math.max(1, Math.floor(Number(options.maxDevices) || 1));
    const activationStart = options.activationStartDate || new Date().toISOString();

    const payload = {
        magic: 'ROLLLIC_CBT',
        version: '1.0',
        schoolCode: cleanCode,
        institutionName: String(institutionName || 'RollCall Institution').trim(),
        licenseKey,
        tier: 'RollCall CBT Offline Enterprise Edition',
        issuedAt: new Date().toISOString(),
        expiresAt: expiry,
        expiryDate: new Date(expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        activationStartDate: new Date(activationStart).toISOString(),
        maxDevices,
        remainingDevices: maxDevices,
        activationCount: 0,
        activationDeviceIds: [],
        licenseId: options.licenseId || `RCCBT-LIC-${cleanCode}-${Date.now()}`,
        features: [
            '100% Air-Gapped Offline Operation',
            'Full Anti-Cheat Proctoring & Kiosk Lockdown',
            'Full Offline Student Roster Verification',
            'Encrypted .rollcbt Exam Package Ingestion',
            'Digitally Signed .rollcbt-sub Submissions',
            'Unlimited Offline Test Centers & Candidates',
            'External Storage Device Activation with Signed License Replacement'
        ]
    };

    const signature = crypto.createHmac('sha256', CBT_SALT)
        .update(JSON.stringify(payload))
        .digest('hex');

    return JSON.stringify({
        header: 'ROLLCALL_CBT_OFFLINE_LICENSE_FILE_V1',
        signature,
        license: payload
    }, null, 2);
}

/**
 * Verify a CBT License key string
 */
function verifyCbtLicenseKey(licenseKey, expectedSchoolCode = null) {
    if (!licenseKey || typeof licenseKey !== 'string') {
        return { valid: false, error: 'License key is missing or invalid.' };
    }

    const trimmed = licenseKey.trim();
    const match = trimmed.match(/^RCCBT-V1-(.+)-(\d+)-([a-f0-9]{32,64})$/i);
    if (!match) {
        return { valid: false, error: 'Invalid license key format. Must be formatted like RCCBT-V1-<SCHOOLCODE>-<EXPIRY>-<SIG>.' };
    }

    const schoolCode = match[1].trim().toUpperCase();
    const expiry = Number(match[2]);
    const sig = match[3].toLowerCase();

    if (!Number.isFinite(expiry) || expiry <= 0) {
        return { valid: false, error: 'Invalid license expiration date.' };
    }

    if (expectedSchoolCode && expectedSchoolCode.trim().toUpperCase() !== schoolCode) {
        return { valid: false, error: `License was issued for school code "${schoolCode}", not "${expectedSchoolCode}".` };
    }

    // Verify signature
    const dataToSign = `RCCBT::${schoolCode}::${expiry}::${CBT_SALT}`;
    const expectedSig = crypto.createHmac('sha256', CBT_SALT).update(dataToSign).digest('hex').substring(0, 32).toLowerCase();

    if (sig !== expectedSig) {
        return { valid: false, error: 'License cryptographic signature verification failed. Code is corrupted or forged.' };
    }

    const now = Date.now();
    const isExpired = now > expiry;
    const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));

    if (isExpired) {
        return {
            valid: false,
            expired: true,
            schoolCode,
            expiryDate: new Date(expiry).toISOString(),
            error: `License expired on ${new Date(expiry).toLocaleDateString()}. Please renew from the RollCall Admin Panel.`
        };
    }

    return {
        valid: true,
        expired: false,
        schoolCode,
        expiryTimestamp: expiry,
        expiryDate: new Date(expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        daysRemaining,
        licenseKey: trimmed,
        tier: 'RollCall CBT Offline Enterprise Edition'
    };
}

/**
 * Verify an uploaded offline CBT License File content (.rolllic)
 */
function verifyCbtLicenseFile(rawFileContent) {
    let parsed;
    try {
        parsed = typeof rawFileContent === 'string' ? JSON.parse(rawFileContent) : rawFileContent;
    } catch {
        return { valid: false, error: 'The uploaded file is not a valid license file format.' };
    }

    if (!parsed || parsed.header !== 'ROLLCALL_CBT_OFFLINE_LICENSE_FILE_V1' || !parsed.license || !parsed.signature) {
        return { valid: false, error: 'Invalid or unrecognized RollCall license file format.' };
    }

    // Verify digital signature of license file
    const expectedSig = crypto.createHmac('sha256', CBT_SALT)
        .update(JSON.stringify(parsed.license))
        .digest('hex');

    if (parsed.signature !== expectedSig) {
        return { valid: false, error: 'License file integrity check failed! File has been altered or tampered with.' };
    }

    // Verify the license key inside
    const keyCheck = verifyCbtLicenseKey(parsed.license.licenseKey, parsed.license.schoolCode);
    if (!keyCheck.valid) {
        return keyCheck;
    }

    return {
        valid: true,
        schoolCode: parsed.license.schoolCode,
        institutionName: parsed.license.institutionName || 'RollCall Institution',
        licenseKey: parsed.license.licenseKey,
        tier: parsed.license.tier || 'RollCall CBT Offline Enterprise Edition',
        expiryDate: parsed.license.expiryDate,
        expiryTimestamp: parsed.license.expiresAt,
        activationStartDate: parsed.license.activationStartDate || parsed.license.issuedAt,
        maxDevices: Math.max(1, Math.floor(Number(parsed.license.maxDevices) || 1)),
        remainingDevices: Math.max(0, Math.floor(Number(parsed.license.remainingDevices ?? parsed.license.maxDevices ?? 1))),
        activationCount: Math.max(0, Math.floor(Number(parsed.license.activationCount) || 0)),
        licenseId: parsed.license.licenseId || '',
        daysRemaining: keyCheck.daysRemaining,
        features: parsed.license.features || []
    };
}

/** Consume one device seat and return the signed replacement file payload. */
function consumeCbtLicenseFile(rawFileContent, deviceId) {
    let parsed;
    try {
        parsed = typeof rawFileContent === 'string' ? JSON.parse(rawFileContent) : rawFileContent;
    } catch {
        return { valid: false, error: 'The selected license file is not valid JSON.' };
    }

    const verified = verifyCbtLicenseFile(parsed);
    if (!verified.valid) return verified;
    const start = Date.parse(parsed.license.activationStartDate || parsed.license.issuedAt || '');
    if (start && Date.now() < start) {
        return { valid: false, error: `License activation starts on ${new Date(start).toLocaleString()}.` };
    }

    const remaining = Math.max(0, Math.floor(Number(parsed.license.remainingDevices ?? parsed.license.maxDevices ?? 1)));
    const activatedDeviceIds = Array.isArray(parsed.license.activationDeviceIds) ? parsed.license.activationDeviceIds.map(String) : [];
    if (deviceId && activatedDeviceIds.includes(String(deviceId))) {
        return { valid: false, error: 'This IDE is already activated by this license.' };
    }
    if (remaining < 1) {
        return { valid: false, error: 'This license has no remaining device activations.' };
    }

    const replacementLicense = {
        ...parsed.license,
        maxDevices: Math.max(1, Math.floor(Number(parsed.license.maxDevices) || 1)),
        remainingDevices: remaining - 1,
        activationCount: Math.max(0, Math.floor(Number(parsed.license.activationCount) || 0)) + 1,
        activationDeviceIds: [...activatedDeviceIds, String(deviceId || '')].filter(Boolean),
        lastActivatedAt: new Date().toISOString(),
        lastActivatedDeviceId: String(deviceId || '')
    };
    const replacement = {
        header: parsed.header,
        signature: crypto.createHmac('sha256', CBT_SALT).update(JSON.stringify(replacementLicense)).digest('hex'),
        license: replacementLicense
    };
    const replacementRaw = JSON.stringify(replacement, null, 2);
    const lastSeat = remaining === 1;
    const tombstoneRaw = JSON.stringify({
        header: 'ROLLCALL_CBT_LICENSE_CONSUMED_V1',
        status: 'consumed',
        consumedAt: replacementLicense.lastActivatedAt
    }, null, 2);
    return {
        ...verifyCbtLicenseFile(replacementRaw),
        replacementRaw,
        tombstoneRaw,
        lastSeat,
        activatedDeviceId: String(deviceId || ''),
        activatedAt: replacementLicense.lastActivatedAt
    };
}

/**
 * Securely package exam object into .rollcbt payload
 */
function packageExamToRollCbt(examData, schoolCode) {
    const cleanSchoolCode = String(schoolCode || examData.schoolCode || 'ANY').trim().toUpperCase();
    
    // Extract answer keys so they can be securely hashed / encrypted inside the file
    const answersMap = {};
    const sanitizedSections = (examData.sections || []).map(section => {
        return {
            ...section,
            questions: (section.questions || []).map(q => {
                const qCopy = { ...q };
                if (qCopy.correctAnswer !== undefined) {
                    answersMap[qCopy.id] = {
                        correctAnswer: qCopy.correctAnswer,
                        explanation: qCopy.explanation || ''
                    };
                    delete qCopy.correctAnswer; // Strip plaintext correct answer from direct question entry
                }
                return qCopy;
            })
        };
    });

    const packagePayload = {
        magic: 'ROLLCBT',
        version: '1.0',
        schoolCode: cleanSchoolCode,
        examId: examData.examId || `EXAM-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        title: examData.title || 'Untitled Examination',
        code: examData.code || 'CBT-101',
        subject: examData.subject || 'General',
        grade: examData.grade || 'All Batches',
        durationMinutes: Number(examData.durationMinutes) || 60,
        totalMarks: Number(examData.totalMarks) || 100,
        passMarks: Number(examData.passMarks) || 40,
        instructions: examData.instructions || 'Read all questions carefully before answering.',
        rules: {
            fullScreenEnforced: examData.rules?.fullScreenEnforced !== false,
            maxBlurStrikes: Number(examData.rules?.maxBlurStrikes ?? 3),
            webcamProctoringRequired: !!examData.rules?.webcamProctoringRequired,
            randomizeQuestions: !!examData.rules?.randomizeQuestions,
            randomizeOptions: !!examData.rules?.randomizeOptions,
            calculatorAllowed: examData.rules?.calculatorAllowed || 'basic',
            scratchpadAllowed: examData.rules?.scratchpadAllowed !== false,
            showImmediateResult: examData.rules?.showImmediateResult !== false,
            negativeMarkingPerQuestion: Number(examData.rules?.negativeMarkingPerQuestion || 0)
        },
        candidates: examData.candidates || [],
        sections: sanitizedSections,
        createdAt: new Date().toISOString()
    };

    // Encrypt answers map with master secret
    const cipherKey = crypto.createHash('sha256').update(`${cleanSchoolCode}::${packagePayload.examId}::${CBT_EXAM_SALT}`).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    let encryptedAnswers = cipher.update(JSON.stringify(answersMap), 'utf8', 'base64');
    encryptedAnswers += cipher.final('base64');

    packagePayload.encryptedAnswers = {
        iv: iv.toString('hex'),
        data: encryptedAnswers
    };

    // Generate SHA-256 HMAC checksum
    const contentString = JSON.stringify(packagePayload);
    const checksum = crypto.createHmac('sha256', CBT_EXAM_SALT).update(contentString).digest('hex');

    const finalEnvelope = {
        header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1',
        checksum,
        payload: packagePayload
    };

    return JSON.stringify(finalEnvelope, null, 2);
}

/**
 * Unpack and verify .rollcbt file
 */
function unpackRollCbt(rawContent, currentSchoolCode = null) {
    let envelope;
    try {
        envelope = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch {
        throw new Error('The selected file is not a valid JSON or .rollcbt archive.');
    }

    if (!envelope || envelope.header !== 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1' || !envelope.payload) {
        throw new Error('Unsupported or corrupted .rollcbt file format.');
    }

    // Verify HMAC
    const contentString = JSON.stringify(envelope.payload);
    const expectedChecksum = crypto.createHmac('sha256', CBT_EXAM_SALT).update(contentString).digest('hex');
    if (envelope.checksum !== expectedChecksum) {
        throw new Error('Cryptographic checksum validation failed! The exam file may have been altered or tampered with.');
    }

    const payload = envelope.payload;
    const examSchool = String(payload.schoolCode || '').toUpperCase();
    if (currentSchoolCode && examSchool !== 'ANY' && examSchool !== String(currentSchoolCode).toUpperCase()) {
        throw new Error(`This exam package is locked to institution code "${examSchool}", but your application is activated for "${currentSchoolCode}".`);
    }

    // Decrypt answer keys
    let answers = {};
    if (payload.encryptedAnswers) {
        try {
            const cipherKey = crypto.createHash('sha256').update(`${payload.schoolCode}::${payload.examId}::${CBT_EXAM_SALT}`).digest();
            const iv = Buffer.from(payload.encryptedAnswers.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
            let decrypted = decipher.update(payload.encryptedAnswers.data, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            answers = JSON.parse(decrypted);
        } catch (e) {
            console.error('Answer key decryption warning:', e);
        }
    }

    // Merge answers into questions
    const fullSections = (payload.sections || []).map(section => {
        return {
            ...section,
            questions: (section.questions || []).map(q => {
                const answerInfo = answers[q.id] || {};
                return {
                    ...q,
                    correctAnswer: answerInfo.correctAnswer !== undefined ? answerInfo.correctAnswer : null,
                    explanation: answerInfo.explanation || ''
                };
            })
        };
    });

    return {
        ...payload,
        sections: fullSections,
        verified: true
    };
}

/**
 * Generate encrypted/signed candidate submission archive (.rollcbt-sub)
 */
function createSubmissionArchive(submissionData) {
    const raw = {
        magic: 'ROLLCBT_SUBMISSION_V1',
        submittedAt: new Date().toISOString(),
        candidate: submissionData.candidate,
        examId: submissionData.examId,
        examCode: submissionData.examCode,
        examTitle: submissionData.examTitle,
        schoolCode: submissionData.schoolCode,
        responses: submissionData.responses,
        timeTakenSeconds: submissionData.timeTakenSeconds,
        antiCheatLog: submissionData.antiCheatLog || [],
        scoreSummary: submissionData.scoreSummary || null
    };

    const signature = crypto.createHmac('sha256', CBT_EXAM_SALT)
        .update(JSON.stringify(raw))
        .digest('hex');

    return JSON.stringify({
        header: 'ROLLCALL_CBT_SUBMISSION_V1',
        signature,
        data: raw
    }, null, 2);
}

module.exports = {
    getMachineFingerprint,
    generateCbtLicenseKey,
    generateCbtLicenseFile,
    verifyCbtLicenseKey,
    verifyCbtLicenseFile,
    consumeCbtLicenseFile,
    packageExamToRollCbt,
    unpackRollCbt,
    createSubmissionArchive,
    applyCbtLicenseGracePeriod,
    CBT_LICENSE_GRACE_PERIOD_MS,
    CBT_SALT,
    CBT_EXAM_SALT
};
