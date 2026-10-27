const crypto = require('crypto');
const os = require('os');

const CBT_SALT = 'ROLLCALL_CBT_SECURE_AUTH_V1_SECRET_2026';
const CBT_EXAM_SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';
const CBT_LICENSE_GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 15 * 60 * 1000; // 15-minute allowable tolerance for clock drift

/**
 * Air-gapped monotonic offline clock and anti-rollback verification.
 * Prevents dishonest users from rewinding the system clock or setting BIOS date backwards
 * to obtain unauthorized infinite trial or bypass license expiration.
 */
function verifyClockIntegrity(vault, licenseInfo, currentSystemTime = Date.now()) {
    const now = Number(currentSystemTime) || Date.now();
    const lastKnown = Number(vault?.lastKnownTimestamp || 0);
    const maxExamTime = Array.isArray(vault?.records)
        ? vault.records.reduce((max, r) => Math.max(max, Number(r.timestamp) || 0), 0)
        : 0;

    // Check 1: System clock is set earlier than the irreversible high-water mark stored in the encrypted .rollcbt vault
    if (lastKnown > 0 && now < (lastKnown - CLOCK_ROLLBACK_TOLERANCE_MS)) {
        return {
            tampered: true,
            permanentlyExpired: false,
            error: `Clock tampering detected: System time (${new Date(now).toLocaleString()}) is earlier than previously verified activity on this workstation (${new Date(lastKnown).toLocaleString()}). Please restore your computer's correct date and time.`,
            lastVerifiedTime: lastKnown,
            effectiveTime: lastKnown
        };
    }

    // Check 2: System clock is set earlier than completed examinations already conducted on this workstation
    if (maxExamTime > 0 && now < (maxExamTime - CLOCK_ROLLBACK_TOLERANCE_MS)) {
        return {
            tampered: true,
            permanentlyExpired: false,
            error: `Clock tampering detected: System time (${new Date(now).toLocaleString()}) is earlier than recorded examinations on this station (${new Date(maxExamTime).toLocaleString()}). Please restore your computer's correct date and time.`,
            lastVerifiedTime: maxExamTime,
            effectiveTime: maxExamTime
        };
    }

    // Check 3: System clock is set earlier than when the license was activated or issued
    if (licenseInfo && (licenseInfo.activationStartDate || licenseInfo.activatedAt || licenseInfo.issuedAt)) {
        const startTimestamp = Date.parse(licenseInfo.activationStartDate || licenseInfo.activatedAt || licenseInfo.issuedAt || '');
        if (startTimestamp && now < (startTimestamp - CLOCK_ROLLBACK_TOLERANCE_MS)) {
            return {
                tampered: true,
                permanentlyExpired: false,
                error: `Clock tampering detected: System time (${new Date(now).toLocaleString()}) is earlier than when this station license was activated (${new Date(startTimestamp).toLocaleString()}). Please restore your computer's correct date and time.`,
                lastVerifiedTime: startTimestamp,
                effectiveTime: startTimestamp
            };
        }
    }

    const baseline = Math.max(now, lastKnown, maxExamTime);

    // Check 4: Permanent expiration lock
    // Once this station has verified time crossing the license expiration (+ grace period),
    // the station locks permanently and rewinding the clock cannot resurrect it.
    const expiry = Number(licenseInfo?.expiryTimestamp || Date.parse(licenseInfo?.expiryDate || ''));
    if (expiry > 0 && lastKnown >= (expiry + CBT_LICENSE_GRACE_PERIOD_MS)) {
        return {
            tampered: false,
            permanentlyExpired: true,
            error: `License expired on ${new Date(expiry).toLocaleDateString()}. This workstation has passed the valid subscription and grace period. Rewinding the system clock cannot restore expired access.`,
            lastVerifiedTime: lastKnown,
            effectiveTime: lastKnown
        };
    }

    return {
        tampered: false,
        permanentlyExpired: false,
        error: null,
        lastVerifiedTime: baseline,
        effectiveTime: baseline
    };
}

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
        schoolName: String(options.schoolName || institutionName || 'RollCall Institution').trim(),
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
function verifyCbtLicenseKey(licenseKey, expectedSchoolCode = null, referenceTime = null) {
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

    const now = Number(referenceTime) || Date.now();
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
        schoolName: parsed.license.schoolName || parsed.license.institutionName || 'RollCall Institution',
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
                const ansVal = qCopy.correctAnswer !== undefined ? qCopy.correctAnswer
                    : (qCopy.correctOption !== undefined ? qCopy.correctOption
                    : (qCopy.correctIndex !== undefined ? qCopy.correctIndex
                    : (qCopy.answer !== undefined ? qCopy.answer
                    : (qCopy.correct_answer !== undefined ? qCopy.correct_answer
                    : (qCopy.key !== undefined ? qCopy.key : undefined)))));
                if (ansVal !== undefined) {
                    answersMap[qCopy.id] = {
                        correctAnswer: ansVal,
                        explanation: qCopy.explanation || ''
                    };
                    delete qCopy.correctAnswer;
                    delete qCopy.correctOption;
                    delete qCopy.correctIndex;
                    delete qCopy.answer;
                    delete qCopy.correct_answer;
                    delete qCopy.key;
                }
                return qCopy;
            })
        };
    });

    const isResultDisplayExplicitlyAllowed = (data) => {
        if (!data) return false;
        const r = data.rules || {};
        const candidates = [
            r.showImmediateResult,
            r.showResult,
            r.showResults,
            r.instantResult,
            r.showScore,
            data.showImmediateResult,
            data.showResult,
            data.showResults,
            data.instantResult
        ];
        for (const val of candidates) {
            if (val === false || val === 'false' || val === 0 || val === '0' || val === 'no' || val === 'off') {
                return false;
            }
        }
        for (const val of candidates) {
            if (val === true || val === 'true' || val === 1 || val === '1' || val === 'yes' || val === 'on') {
                return true;
            }
        }
        return false;
    };

    const packagePayload = {
        magic: 'ROLLCBT',
        version: '1.0',
        schoolCode: cleanSchoolCode,
        schoolName: String(examData.schoolName || examData.institutionName || '').trim(),
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
            showImmediateResult: isResultDisplayExplicitlyAllowed(examData),
            negativeMarkingPerQuestion: Number(examData.rules?.negativeMarkingPerQuestion || 0)
        },
        candidates: examData.candidates || [],
        assignmentId: examData.assignmentId || '',
        scheduleType: examData.scheduleType || 'CBT_SECTION',
        scheduledType: examData.scheduledType || 'SECTION',
        assignmentType: examData.assignmentType || 'SECTION',
        assignedClassId: examData.assignedClassId || '',
        assignedClassName: examData.assignedClassName || examData.grade || '',
        assignedSection: examData.assignedSection || '',
        deviceAllocation: examData.deviceAllocation || null,
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
    if (currentSchoolCode && examSchool !== 'ANY') {
        const allowed = (Array.isArray(currentSchoolCode) ? currentSchoolCode : [currentSchoolCode])
            .map(c => String(c || '').trim().toUpperCase())
            .filter(Boolean);
        if (allowed.length > 0 && !allowed.includes(examSchool)) {
            throw new Error(`This exam package is locked to institution code "${examSchool}", but your application is activated for "${allowed[0]}".`);
        }
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
                let answerInfo = {};
                if (answers && typeof answers === 'object') {
                    if (Array.isArray(answers)) {
                        answerInfo = answers.find(a => a && (a.id === q.id || a.questionId === q.id)) || {};
                    } else {
                        answerInfo = answers[q.id] || {};
                    }
                }

                const decryptedAns = answerInfo.correctAnswer !== undefined ? answerInfo.correctAnswer
                    : (answerInfo.correctOption !== undefined ? answerInfo.correctOption
                    : (answerInfo.correctIndex !== undefined ? answerInfo.correctIndex
                    : (answerInfo.answer !== undefined ? answerInfo.answer : undefined)));

                const effectiveAns = decryptedAns !== undefined ? decryptedAns
                    : (q.correctAnswer !== undefined ? q.correctAnswer
                    : (q.correctOption !== undefined ? q.correctOption
                    : (q.correctIndex !== undefined ? q.correctIndex
                    : (q.answer !== undefined ? q.answer
                    : (q.correct_answer !== undefined ? q.correct_answer
                    : (q.key !== undefined ? q.key : null))))));

                return {
                    ...q,
                    correctAnswer: effectiveAns,
                    explanation: answerInfo.explanation || q.explanation || ''
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

/**
 * Pack Station Vault into application-private .rollcbt file format
 * Stores workstation license and previously held exam records securely
 */
function packStationVault(vaultData, machineId = null) {
    const hwId = machineId || getMachineFingerprint();
    const lastKnown = Number(vaultData.lastKnownTimestamp || 0);
    const payload = {
        magic: 'ROLLCBT_STATION_VAULT',
        version: '1.0',
        vaultType: 'STATION_DATA',
        schoolCode: vaultData?.license?.schoolCode || 'ROLLCALL',
        institutionName: vaultData?.license?.institutionName || '',
        deviceId: hwId,
        updatedAt: new Date().toISOString(),
        lastKnownTimestamp: lastKnown
    };

    const vaultSecret = `${hwId}::${CBT_SALT}::ROLLCALL_STATION_VAULT_2026`;
    const cipherKey = crypto.createHash('sha256').update(vaultSecret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);

    const innerPayload = {
        license: vaultData.license || null,
        records: Array.isArray(vaultData.records) ? vaultData.records : [],
        lastKnownTimestamp: lastKnown
    };

    let encryptedData = cipher.update(JSON.stringify(innerPayload), 'utf8', 'base64');
    encryptedData += cipher.final('base64');

    payload.encryptedVault = {
        iv: iv.toString('hex'),
        data: encryptedData
    };

    const contentString = JSON.stringify(payload);
    const checksum = crypto.createHmac('sha256', CBT_EXAM_SALT).update(contentString).digest('hex');

    const envelope = {
        header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1',
        vaultHeader: 'ROLLCALL_CBT_STATION_VAULT_V1',
        checksum,
        payload
    };

    return JSON.stringify(envelope, null, 2);
}

/**
 * Unpack Station Vault from application-private .rollcbt file
 */
function unpackStationVault(rawContent, machineId = null) {
    let envelope;
    try {
        envelope = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch {
        throw new Error('Invalid station vault format.');
    }

    if (!envelope || !envelope.payload || (envelope.vaultHeader !== 'ROLLCALL_CBT_STATION_VAULT_V1' && envelope.payload.magic !== 'ROLLCBT_STATION_VAULT')) {
        throw new Error('Not a valid RollCall station vault archive.');
    }

    const contentString = JSON.stringify(envelope.payload);
    const expectedChecksum = crypto.createHmac('sha256', CBT_EXAM_SALT).update(contentString).digest('hex');
    if (envelope.checksum !== expectedChecksum) {
        throw new Error('Station vault checksum validation failed (tampering detected).');
    }

    const payload = envelope.payload;
    const hwId = machineId || getMachineFingerprint();

    if (payload.deviceId && payload.deviceId !== hwId) {
        throw new Error('Station vault is locked to a different workstation hardware ID.');
    }

    let inner = { license: null, records: [], lastKnownTimestamp: 0 };
    if (payload.encryptedVault) {
        try {
            const vaultSecret = `${hwId}::${CBT_SALT}::ROLLCALL_STATION_VAULT_2026`;
            const cipherKey = crypto.createHash('sha256').update(vaultSecret).digest();
            const iv = Buffer.from(payload.encryptedVault.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
            let decrypted = decipher.update(payload.encryptedVault.data, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            inner = JSON.parse(decrypted);
        } catch (e) {
            throw new Error('Failed to decrypt station vault: ' + e.message);
        }
    }

    return {
        schoolCode: payload.schoolCode,
        institutionName: payload.institutionName,
        deviceId: payload.deviceId,
        updatedAt: payload.updatedAt,
        lastKnownTimestamp: Number(inner.lastKnownTimestamp || payload.lastKnownTimestamp || 0),
        license: inner.license || null,
        records: Array.isArray(inner.records) ? inner.records : []
    };
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
    packStationVault,
    unpackStationVault,
    createSubmissionArchive,
    applyCbtLicenseGracePeriod,
    verifyClockIntegrity,
    CLOCK_ROLLBACK_TOLERANCE_MS,
    CBT_LICENSE_GRACE_PERIOD_MS,
    CBT_SALT,
    CBT_EXAM_SALT
};

