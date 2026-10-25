/**
 * RollCall Admin Panel - CBT Hub & Offline Exam Generator Module
 * Works in ANY mode of admin panel (School, College, Coaching, ERP).
 */

(function (window, document) {
    'use strict';

    const CBT_SALT = 'ROLLCALL_CBT_SECURE_AUTH_V1_SECRET_2026';
    const CBT_EXAM_SALT = 'ROLLCALL_EXAM_PACKAGE_INTEGRITY_SALT_2026';

    // In-memory state for Exam Studio
    const builderState = {
        candidates: [],
        sections: [
            {
                id: 'sec-1',
                title: 'Section A: General & Core Subject',
                questions: []
            }
        ]
    };

    // Submissions evaluator state
    const evaluatedSubmissions = [];

    // =========================================================================
    // CLIENT CRYPTO ENGINE (Web Crypto API)
    // =========================================================================
    async function hmacSha256Hex(keyString, dataString) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(keyString),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataString));
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function sha256Digest(dataString) {
        const enc = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(dataString));
        return new Uint8Array(hashBuffer);
    }

    async function aesCbcEncrypt(keyBytes, text) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-CBC' },
            false,
            ['encrypt']
        );
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv },
            key,
            enc.encode(text)
        );

        // Convert IV to hex and encrypted to base64
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        let binary = '';
        const bytes = new Uint8Array(encrypted);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const dataBase64 = btoa(binary);

        return { iv: ivHex, data: dataBase64 };
    }

    // Generate CBT License Key String
    async function generateCbtLicenseKey(schoolCode, expiryDateMs = null) {
        const cleanCode = String(schoolCode || 'ROLL-SCH-01').trim().toUpperCase();
        const expiry = Number(expiryDateMs) || (Date.now() + 365 * 24 * 60 * 60 * 1000);
        const dataToSign = `RCCBT::${cleanCode}::${expiry}::${CBT_SALT}`;
        const fullSig = await hmacSha256Hex(CBT_SALT, dataToSign);
        const sig = fullSig.substring(0, 32);
        return `RCCBT-V1-${cleanCode}-${expiry}-${sig}`;
    }

    // Generate Full Offline CBT License File (.rolllic)
    async function generateCbtLicenseFile(schoolCode, institutionName = 'RollCall Institution', expiryDateMs = null, options = {}) {
        const cleanCode = String(schoolCode || 'ROLL-SCH-01').trim().toUpperCase();
        const expiry = Number(expiryDateMs) || (Date.now() + 365 * 24 * 60 * 60 * 1000);
        const licenseKey = options.licenseKey || await generateCbtLicenseKey(cleanCode, expiry);

        const payload = {
            magic: 'ROLLLIC_CBT',
            version: '1.0',
            schoolCode: cleanCode,
            institutionName: String(institutionName || 'RollCall Institution').trim(),
            schoolName: String(institutionName || 'RollCall Institution').trim(),
            licenseKey,
            tier: 'RollCall CBT Offline Enterprise Edition',
            issuedAt: new Date().toISOString(),
            expiresAt: expiry,
            expiryDate: new Date(expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
            activationStartDate: new Date(options.activationStartDate || new Date().toISOString()).toISOString(),
            maxDevices: Math.max(1, Math.floor(Number(options.maxDevices) || 1)),
            remainingDevices: Math.max(1, Math.floor(Number(options.maxDevices) || 1)),
            activationCount: 0,
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

        const signature = await hmacSha256Hex(CBT_SALT, JSON.stringify(payload));

        return JSON.stringify({
            header: 'ROLLCALL_CBT_OFFLINE_LICENSE_FILE_V1',
            signature,
            license: payload
        }, null, 2);
    }

    // Package Exam into .rollcbt container
    async function packageExamToRollCbt(examData, schoolCode) {
        const cleanSchoolCode = String(schoolCode || examData.schoolCode || 'ANY').trim().toUpperCase();

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
                        delete qCopy.correctAnswer;
                    }
                    return qCopy;
                })
            };
        });

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
                showImmediateResult: examData.rules?.showImmediateResult !== false,
                negativeMarkingPerQuestion: Number(examData.rules?.negativeMarkingPerQuestion || 0)
            },
            candidates: examData.candidates || [],
            sections: sanitizedSections,
            createdAt: new Date().toISOString()
        };

        // Encrypt answers map with AES-CBC
        const keyMaterial = `${cleanSchoolCode}::${packagePayload.examId}::${CBT_EXAM_SALT}`;
        const cipherKeyBytes = await sha256Digest(keyMaterial);
        const encrypted = await aesCbcEncrypt(cipherKeyBytes, JSON.stringify(answersMap));

        packagePayload.encryptedAnswers = encrypted;

        // Sign with SHA-256 HMAC
        const contentString = JSON.stringify(packagePayload);
        const checksum = await hmacSha256Hex(CBT_EXAM_SALT, contentString);

        return JSON.stringify({
            header: 'ROLLCALL_CBT_SECURE_EXAM_PACKAGE_V1',
            checksum,
            payload: packagePayload
        }, null, 2);
    }

    // Trigger Browser File Download
    function downloadBlob(filename, textContent, mimeType = 'application/json') {
        const blob = new Blob([textContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    }

    // =========================================================================
    // CBT HUB SECTION INITIALIZATION
    // =========================================================================
    function cbtSubscriptionIsActive(subscription) {
        if (!subscription || String(subscription.status || 'active').toLowerCase() === 'inactive') return false;
        const end = Date.parse(subscription.endDate || '');
        return !end || end >= Date.now();
    }

    function getLicenseKeyExpiry(licenseKey) {
        const match = String(licenseKey || '').match(/^RCCBT-V1-.+-(\d+)-[a-f0-9]{32,64}$/i);
        return match ? Number(match[1]) : 0;
    }

    async function getOrCreateStoredCbtLicense(schoolId, schoolCode, schoolName, planExpiry, planStart, maxDevices) {
        if (!cbtSubscriptionIsActive(window.currentCbtPlanSubscription)) {
            throw new Error('An active CBT plan is required before generating a license key.');
        }
        const ref = window.firebase.database().ref(`schools/${schoolId}/cbtLicense`);
        const snapshot = await ref.once('value');
        const stored = snapshot.val() || {};
        const storedExpiry = getLicenseKeyExpiry(stored.licenseKey);
        if (stored.licenseKey && String(stored.schoolCode || '').toUpperCase() === String(schoolCode || '').toUpperCase() && storedExpiry === Number(planExpiry)) {
            window.currentCbtLicenseRecord = { ...stored, licenseKey: stored.licenseKey };
            return window.currentCbtLicenseRecord;
        }

        const licenseKey = await generateCbtLicenseKey(schoolCode, planExpiry);
        const record = {
            ...stored,
            schoolCode,
            schoolName,
            licenseKey,
            activationStartDate: planStart,
            expiryDate: new Date(planExpiry).toISOString(),
            maxDevices: Math.max(1, Math.floor(Number(maxDevices) || 1)),
            issuedAt: stored.issuedAt || new Date().toISOString(),
            updatedAt: Date.now()
        };
        await ref.set(record);
        window.currentCbtLicenseRecord = record;
        return record;
    }

    window.refreshCbtPlanAccess = async function (schoolId) {
        const item = document.querySelector('.sidebar-menu-item-modern[data-section="cbt-portal"]');
        if (!schoolId || !window.firebase?.database) {
            window.currentCbtPlanActive = false;
            if (item) item.hidden = true;
            return false;
        }
        try {
            const snapshot = await window.firebase.database().ref(`schools/${schoolId}/cbtSubscription`).once('value');
            window.currentCbtPlanSubscription = snapshot.val() || null;
            const active = cbtSubscriptionIsActive(window.currentCbtPlanSubscription);
            window.currentCbtPlanActive = active;
            if (item) item.hidden = !active;
            if (!active) document.getElementById('account-cbt-license-card')?.remove();
            if (!active && document.getElementById('cbt-portal-section-active')) {
                document.querySelector('.sidebar-menu-item-modern[data-section="dashboard"]')?.click();
            }
            return active;
        } catch (error) {
            console.error('Unable to verify CBT plan access', error);
            window.currentCbtPlanActive = false;
            window.currentCbtPlanSubscription = null;
            if (item) item.hidden = true;
            return false;
        }
    };

    window.initCbtPortalSection = async function () {
        const section = document.getElementById('cbt-portal-section-active');
        if (!section) return;

        const schoolId = window.currentAdminSchoolId;
        if (!await window.refreshCbtPlanAccess(schoolId)) {
            section.classList.add('hidden');
            document.querySelector('.sidebar-menu-item-modern[data-section="dashboard"]')?.click();
            return;
        }
        const cbtSubscription = window.currentCbtPlanSubscription || {};

        // Current School & Institution resolution
        const schoolCodeEl = section.querySelector('#cbt-school-code-display');
        const instNameEl = section.querySelector('#cbt-inst-name-display');
        const licenseCodeDisplay = section.querySelector('#cbt-license-code-display');

        // Extract school details from loaded session
        const currentSchoolCode = window.currentAdminSchoolCode ||
            document.getElementById('account-institution-code')?.textContent?.trim() ||
            'ROLL-SCH-01';
        const currentInstName = window.currentAdminSchoolName ||
            document.getElementById('account-institution-name')?.textContent?.trim() ||
            'RollCall Academy';

        if (schoolCodeEl) schoolCodeEl.textContent = currentSchoolCode;
        if (instNameEl) instNameEl.textContent = currentInstName;

        // Pre-generate license key for display
        const planExpiry = Date.parse(cbtSubscription.endDate || '') || (Date.now() + 365 * 24 * 60 * 60 * 1000);
        const planStart = cbtSubscription.startDate || new Date().toISOString();
        const defaultMaxDevices = Math.max(1, Number(cbtSubscription.maxDevices || cbtSubscription.deviceLimit || 1));
        const maxDevicesInput = section.querySelector('#cbt-license-max-devices');
        const startDateDisplay = section.querySelector('#cbt-license-start-date');
        const expiryDateDisplay = section.querySelector('#cbt-license-expiry-date');
        if (maxDevicesInput) maxDevicesInput.value = String(defaultMaxDevices);
        if (startDateDisplay) startDateDisplay.textContent = new Date(planStart).toLocaleString();
        if (expiryDateDisplay) expiryDateDisplay.textContent = new Date(planExpiry).toLocaleString();
        const storedLicense = await getOrCreateStoredCbtLicense(schoolId, currentSchoolCode, currentInstName, planExpiry, planStart, defaultMaxDevices);
        if (licenseCodeDisplay) licenseCodeDisplay.textContent = storedLicense.licenseKey;

        // Tab Navigation inside CBT Hub
        const tabBtns = section.querySelectorAll('.cbt-tab-btn');
        const tabPanes = section.querySelectorAll('.cbt-tab-pane');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const targetPane = section.querySelector(`#${targetId}`);
                if (targetPane) targetPane.classList.add('active');
            });
        });

        // ---------------------------------------------------------------------
        // TAB 1: License Manager Actions
        // ---------------------------------------------------------------------
        const btnDownloadLicense = section.querySelector('#btn-download-cbt-license');
        const btnCopyLicense = section.querySelector('#btn-copy-cbt-license');
        const licenseStatusMsg = section.querySelector('#cbt-license-status-msg');

        if (btnDownloadLicense) {
            btnDownloadLicense.onclick = async () => {
                btnDownloadLicense.disabled = true;
                btnDownloadLicense.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating File...';
                try {
                    if (!await window.refreshCbtPlanAccess(schoolId)) throw new Error('The CBT plan is no longer active for this school.');
                    const maxDevices = Math.max(1, Math.floor(Number(maxDevicesInput?.value || 0)));
                    if (!Number.isInteger(maxDevices) || maxDevices < 1) throw new Error('Enter a valid maximum device count.');
                    const activeSubscription = window.currentCbtPlanSubscription || {};
                    const activePlanExpiry = Date.parse(activeSubscription.endDate || '') || (Date.now() + 365 * 24 * 60 * 60 * 1000);
                    const activePlanStart = activeSubscription.startDate || new Date().toISOString();
                    const licenseRecord = await getOrCreateStoredCbtLicense(schoolId, currentSchoolCode, currentInstName, activePlanExpiry, activePlanStart, maxDevices);
                    const fileContent = await generateCbtLicenseFile(currentSchoolCode, currentInstName, activePlanExpiry, { maxDevices, activationStartDate: activePlanStart, licenseKey: licenseRecord.licenseKey });
                    const filename = `${currentSchoolCode}-cbt-license.rolllic`;
                    downloadBlob(filename, fileContent, 'application/json');
                    const issuedAt = new Date().toISOString();
                    await window.firebase.database().ref(`schools/${schoolId}/cbtLicense`).update({ ...licenseRecord, maxDevices, activationStartDate: activePlanStart, expiryDate: new Date(activePlanExpiry).toISOString(), issuedAt, updatedAt: Date.now() });
                    if (licenseStatusMsg) {
                        licenseStatusMsg.textContent = `✓ License file "${filename}" issued for ${maxDevices} device${maxDevices === 1 ? '' : 's'}. Copy it to removable storage before activation.`;
                        licenseStatusMsg.style.color = '#10b981';
                    }
                } catch (e) {
                    alert('Error generating license file: ' + e.message);
                } finally {
                    btnDownloadLicense.disabled = false;
                    btnDownloadLicense.innerHTML = '<i class="fas fa-download"></i> Issue & Download .rolllic';
                }
            };
        }

        if (btnCopyLicense) {
            btnCopyLicense.onclick = async () => {
                if (!await window.refreshCbtPlanAccess(schoolId)) {
                    alert('The CBT plan is not active for this school.');
                    return;
                }
                const activeSubscription = window.currentCbtPlanSubscription || {};
                const activePlanExpiry = Date.parse(activeSubscription.endDate || '') || (Date.now() + 365 * 24 * 60 * 60 * 1000);
                const activePlanStart = activeSubscription.startDate || new Date().toISOString();
                const licenseRecord = await getOrCreateStoredCbtLicense(schoolId, currentSchoolCode, currentInstName, activePlanExpiry, activePlanStart, Number(maxDevicesInput?.value || defaultMaxDevices));
                const key = licenseRecord.licenseKey;
                if (licenseCodeDisplay) licenseCodeDisplay.textContent = key;
                navigator.clipboard.writeText(key).then(() => {
                    if (licenseStatusMsg) {
                        licenseStatusMsg.textContent = '✓ CBT Access Code copied to clipboard!';
                        licenseStatusMsg.style.color = '#10b981';
                    }
                });
            };
        }

        // ---------------------------------------------------------------------
        // TAB 2: Exam Builder Actions
        // ---------------------------------------------------------------------
        const candidatesTableBody = section.querySelector('#cbt-candidates-tbody');
        const candidateCountLabel = section.querySelector('#cbt-candidate-count-label');
        const btnAutoLoadStudents = section.querySelector('#btn-autoload-students');
        const btnAddCandidateManual = section.querySelector('#btn-add-candidate-manual');
        const btnPreloadSampleExam = section.querySelector('#btn-preload-sample-exam');
        const btnAddQuestion = section.querySelector('#btn-add-question');
        const questionsContainer = section.querySelector('#cbt-questions-container');
        const btnExportRollCbt = section.querySelector('#btn-export-rollcbt');
        const exportStatusMsg = section.querySelector('#cbt-export-status-msg');

        // Render Candidates in Table
        function renderCandidatesTable() {
            if (!candidatesTableBody) return;
            candidatesTableBody.innerHTML = '';
            candidateCountLabel.textContent = `${builderState.candidates.length} Students Added`;

            if (!builderState.candidates.length) {
                candidatesTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">
                            No candidates added yet. Click "Auto-Load Students from Database" or add manually.
                        </td>
                    </tr>
                `;
                return;
            }

            builderState.candidates.forEach((cand, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${cand.rollNo || (idx + 101)}</strong></td>
                    <td>${cand.name}</td>
                    <td>${cand.batch || 'Batch A'}</td>
                    <td><code>${cand.pin || '1234'}</code></td>
                    <td>
                        <button type="button" class="btn-remove-row" data-idx="${idx}" title="Remove Candidate">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;
                tr.querySelector('.btn-remove-row').onclick = () => {
                    builderState.candidates.splice(idx, 1);
                    renderCandidatesTable();
                };
                candidatesTableBody.appendChild(tr);
            });
        }

        // Auto-Load Students from Firebase Database
        if (btnAutoLoadStudents) {
            btnAutoLoadStudents.onclick = async () => {
                btnAutoLoadStudents.disabled = true;
                btnAutoLoadStudents.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching Database...';
                try {
                    let schoolIdToQuery = window.currentAdminSchoolId;
                    if (!schoolIdToQuery && typeof firebase !== 'undefined' && firebase.auth().currentUser) {
                        const userSnap = await firebase.database().ref(`users/${firebase.auth().currentUser.uid}`).once('value');
                        schoolIdToQuery = userSnap.val()?.schoolId;
                    }

                    if (typeof firebase !== 'undefined' && schoolIdToQuery) {
                        const usersSnap = await firebase.database().ref('users').once('value');
                        const fetched = [];
                        usersSnap.forEach(snap => {
                            const u = snap.val() || {};
                            if (String(u.schoolId || '') === String(schoolIdToQuery) && String(u.role || '').toLowerCase() === 'student') {
                                fetched.push({
                                    rollNo: String(u.rollNumber || u.rollNo || u.studentId || (fetched.length + 101)).trim(),
                                    name: String(u.fullName || u.name || 'Student').trim(),
                                    batch: String(u.batch || u.batchName || u.className || 'General').trim(),
                                    pin: String(u.pin || u.rollNumber || Math.floor(1000 + Math.random() * 9000))
                                });
                            }
                        });

                        if (fetched.length > 0) {
                            builderState.candidates = fetched;
                            renderCandidatesTable();
                            alert(`Successfully imported ${fetched.length} registered students from your institution database!`);
                        } else {
                            // Fallback demo students
                            loadDemoCandidates();
                            alert('No students found under this school ID yet. Pre-filled with demonstration candidates.');
                        }
                    } else {
                        loadDemoCandidates();
                        alert('Preloaded active test candidates for your school.');
                    }
                } catch (e) {
                    console.error('Student fetch error:', e);
                    loadDemoCandidates();
                } finally {
                    btnAutoLoadStudents.disabled = false;
                    btnAutoLoadStudents.innerHTML = '<i class="fas fa-sync-alt"></i> Auto-Load Students from Database';
                }
            };
        }

        function loadDemoCandidates() {
            builderState.candidates = [
                { rollNo: '101', name: 'Aarav Sharma', batch: 'Grade 10-A', pin: '1234' },
                { rollNo: '102', name: 'Diya Patel', batch: 'Grade 10-A', pin: '1234' },
                { rollNo: '103', name: 'Rohan Verma', batch: 'Grade 10-B', pin: '1234' },
                { rollNo: '104', name: 'Ananya Iyer', batch: 'Grade 10-B', pin: '1234' },
                { rollNo: '105', name: 'Kabir Mehta', batch: 'Grade 10-B', pin: '1234' }
            ];
            renderCandidatesTable();
        }

        // Add Manual Candidate
        if (btnAddCandidateManual) {
            btnAddCandidateManual.onclick = () => {
                const name = prompt('Enter Student Full Name:');
                if (!name || !name.trim()) return;
                const rollNo = prompt('Enter Roll Number:', String(builderState.candidates.length + 101));
                const batch = prompt('Enter Batch/Class:', 'Batch A');
                const pin = prompt('Enter 4-Digit Candidate Exam PIN:', '1234');

                builderState.candidates.push({
                    name: name.trim(),
                    rollNo: rollNo ? rollNo.trim() : String(builderState.candidates.length + 101),
                    batch: batch ? batch.trim() : 'General',
                    pin: pin ? pin.trim() : '1234'
                });
                renderCandidatesTable();
            };
        }

        // Questions Manager
        function renderQuestions() {
            if (!questionsContainer) return;
            questionsContainer.innerHTML = '';

            const questions = builderState.sections[0].questions;
            if (!questions.length) {
                questionsContainer.innerHTML = `
                    <div style="text-align:center; padding:30px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; color:#64748b;">
                        <i class="fas fa-edit" style="font-size:2rem; margin-bottom:8px;"></i>
                        <p>No questions created yet. Click "Preload Sample Exam" or "Add Question" below.</p>
                    </div>
                `;
                return;
            }

            questions.forEach((q, idx) => {
                const card = document.createElement('div');
                card.className = 'cbt-question-editor-card';
                card.innerHTML = `
                    <div class="cbt-q-header">
                        <strong>Question ${idx + 1} (${q.type === 'multiple_select' ? 'Multiple Select' : 'Single Choice MCQ'})</strong>
                        <div>
                            <span style="font-size:0.82rem; color:#64748b; margin-right:12px;">Marks: +${q.marks} | Neg: -${q.negativeMarks || 0}</span>
                            <button type="button" class="btn-remove-row btn-remove-q" data-idx="${idx}"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <input type="text" class="form-control q-text-input" data-idx="${idx}" value="${escapeHtml(q.text)}" placeholder="Type question text..." style="width:100%; font-weight:600;">
                    </div>
                    <div class="cbt-options-editor-grid">
                        ${(q.options || ['A', 'B', 'C', 'D']).map((opt, oIdx) => `
                            <div class="cbt-opt-input-row">
                                <span>${String.fromCharCode(65 + oIdx)}</span>
                                <input type="text" class="q-opt-input" data-qidx="${idx}" data-oidx="${oIdx}" value="${escapeHtml(opt)}">
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:0.85rem;">
                        <div>
                            <label style="font-weight:600; margin-right:8px;">Correct Option:</label>
                            <select class="q-correct-select" data-idx="${idx}" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1;">
                                <option value="A" ${q.correctAnswer === 'A' ? 'selected' : ''}>A</option>
                                <option value="B" ${q.correctAnswer === 'B' ? 'selected' : ''}>B</option>
                                <option value="C" ${q.correctAnswer === 'C' ? 'selected' : ''}>C</option>
                                <option value="D" ${q.correctAnswer === 'D' ? 'selected' : ''}>D</option>
                            </select>
                        </div>
                        <input type="text" class="q-explanation-input" data-idx="${idx}" value="${escapeHtml(q.explanation || '')}" placeholder="Optional explanation..." style="flex:1; margin-left:14px; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px;">
                    </div>
                `;

                // Event handlers
                card.querySelector('.btn-remove-q').onclick = () => {
                    builderState.sections[0].questions.splice(idx, 1);
                    renderQuestions();
                };

                card.querySelector('.q-text-input').onchange = (e) => {
                    q.text = e.target.value;
                };

                card.querySelectorAll('.q-opt-input').forEach(optInp => {
                    optInp.onchange = (e) => {
                        const oIdx = Number(e.target.dataset.oidx);
                        q.options[oIdx] = e.target.value;
                    };
                });

                card.querySelector('.q-correct-select').onchange = (e) => {
                    q.correctAnswer = e.target.value;
                };

                card.querySelector('.q-explanation-input').onchange = (e) => {
                    q.explanation = e.target.value;
                };

                questionsContainer.appendChild(card);
            });
        }

        // Add Empty Question
        if (btnAddQuestion) {
            btnAddQuestion.onclick = () => {
                const count = builderState.sections[0].questions.length;
                builderState.sections[0].questions.push({
                    id: `q_${Date.now()}_${count + 1}`,
                    text: `Sample question ${count + 1} text?`,
                    type: 'multiple_choice',
                    options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
                    correctAnswer: 'A',
                    marks: 2.0,
                    negativeMarks: 0.5,
                    explanation: 'Correct answer explanation.'
                });
                renderQuestions();
            };
        }

        // Preload Sample Exam
        if (btnPreloadSampleExam) {
            btnPreloadSampleExam.onclick = () => {
                section.querySelector('#cbt-input-exam-title').value = 'Mid-Term Science & Digital Assessment 2026';
                section.querySelector('#cbt-input-exam-code').value = 'SCI-CBT-101';
                section.querySelector('#cbt-input-exam-subject').value = 'General Science';
                section.querySelector('#cbt-input-exam-grade').value = 'All Registered Batches';
                section.querySelector('#cbt-input-exam-duration').value = '45';
                section.querySelector('#cbt-input-exam-marks').value = '50';
                section.querySelector('#cbt-input-exam-pass').value = '40';

                loadDemoCandidates();

                builderState.sections[0].questions = [
                    {
                        id: 'q1',
                        text: 'What is the primary function of mitochondria in a eukaryotic cell?',
                        type: 'multiple_choice',
                        options: ['Protein Synthesis', 'Cellular Respiration and ATP Generation', 'Photosynthesis', 'Lipid Storage'],
                        correctAnswer: 'B',
                        marks: 2.0,
                        negativeMarks: 0.5,
                        explanation: 'Mitochondria produce ATP through cellular aerobic respiration.'
                    },
                    {
                        id: 'q2',
                        text: 'Which chemical element has the atomic number 1 on the periodic table?',
                        type: 'multiple_choice',
                        options: ['Helium', 'Hydrogen', 'Oxygen', 'Carbon'],
                        correctAnswer: 'B',
                        marks: 2.0,
                        negativeMarks: 0.5,
                        explanation: 'Hydrogen is the lightest element with atomic number 1.'
                    },
                    {
                        id: 'q3',
                        text: 'Which of the following is an open-source operating system kernel?',
                        type: 'multiple_choice',
                        options: ['Windows NT', 'macOS Darwin', 'Linux', 'MS-DOS'],
                        correctAnswer: 'C',
                        marks: 2.0,
                        negativeMarks: 0.5,
                        explanation: 'Linux is a renowned open-source monolithic Unix-like kernel.'
                    },
                    {
                        id: 'q4',
                        text: 'What is the phenomenon where light bends when passing from one medium to another?',
                        type: 'multiple_choice',
                        options: ['Reflection', 'Refraction', 'Diffraction', 'Polarization'],
                        correctAnswer: 'B',
                        marks: 2.0,
                        negativeMarks: 0.5,
                        explanation: 'Refraction is the change in direction of a wave due to change in speed across media.'
                    }
                ];

                renderQuestions();
                alert('Loaded full sample science examination with 4 questions and student roster!');
            };
        }

        // Export .rollcbt Exam Package
        if (btnExportRollCbt) {
            btnExportRollCbt.onclick = async () => {
                const title = section.querySelector('#cbt-input-exam-title')?.value.trim() || 'Offline CBT Exam';
                const code = section.querySelector('#cbt-input-exam-code')?.value.trim() || 'CBT-101';
                const subject = section.querySelector('#cbt-input-exam-subject')?.value.trim() || 'General';
                const grade = section.querySelector('#cbt-input-exam-grade')?.value.trim() || 'All Batches';
                const duration = Number(section.querySelector('#cbt-input-exam-duration')?.value) || 60;
                const totalMarks = Number(section.querySelector('#cbt-input-exam-marks')?.value) || 100;
                const passMarks = Number(section.querySelector('#cbt-input-exam-pass')?.value) || 40;
                const instructions = section.querySelector('#cbt-input-exam-instructions')?.value.trim() || 'Do not switch tabs during this test.';

                if (!builderState.sections[0].questions.length) {
                    alert('Please add at least one question before generating the exam file.');
                    return;
                }

                btnExportRollCbt.disabled = true;
                btnExportRollCbt.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encrypting &amp; Packaging...';

                try {
                    const examData = {
                        title,
                        code,
                        subject,
                        grade,
                        durationMinutes: duration,
                        totalMarks,
                        passMarks,
                        instructions,
                            schoolCode: currentSchoolCode,
                            schoolName: currentInstName,
                        rules: {
                            fullScreenEnforced: section.querySelector('#cbt-rule-fullscreen')?.checked !== false,
                            maxBlurStrikes: Number(section.querySelector('#cbt-rule-strikes')?.value || 3),
                            webcamProctoringRequired: !!section.querySelector('#cbt-rule-webcam')?.checked,
                            randomizeQuestions: !!section.querySelector('#cbt-rule-shuffle-q')?.checked,
                            randomizeOptions: !!section.querySelector('#cbt-rule-shuffle-opt')?.checked,
                            calculatorAllowed: section.querySelector('#cbt-rule-calc')?.value || 'scientific',
                            scratchpadAllowed: true,
                            showImmediateResult: !!section.querySelector('#cbt-rule-instant-result')?.checked,
                            negativeMarkingPerQuestion: Number(section.querySelector('#cbt-rule-neg')?.value || 0.25)
                        },
                        candidates: builderState.candidates,
                        sections: builderState.sections
                    };

                    const rollCbtContent = await packageExamToRollCbt(examData, currentSchoolCode);
                    const cleanFilename = `${code}_${subject}_exam.rollcbt`.replace(/[^a-zA-Z0-9_.-]/g, '_');
                    downloadBlob(cleanFilename, rollCbtContent, 'application/octet-stream');

                    if (exportStatusMsg) {
                        exportStatusMsg.textContent = `✓ Successfully generated "${cleanFilename}" with ${builderState.candidates.length} students & ${builderState.sections[0].questions.length} questions!`;
                        exportStatusMsg.style.color = '#10b981';
                    }
                } catch (e) {
                    alert('Error packaging exam file: ' + e.message);
                } finally {
                    btnExportRollCbt.disabled = false;
                    btnExportRollCbt.innerHTML = '<i class="fas fa-file-export"></i> Generate &amp; Download .rollcbt Exam Package';
                }
            };
        }

        // ---------------------------------------------------------------------
        // TAB 3: Offline Submissions Evaluator
        // ---------------------------------------------------------------------
        const subDropzone = section.querySelector('#cbt-submissions-dropzone');
        const subInputFile = section.querySelector('#cbt-input-sub-file');
        const subTableBody = section.querySelector('#cbt-submissions-tbody');
        const btnExportCsv = section.querySelector('#btn-export-sub-csv');

        if (subDropzone && subInputFile) {
            subDropzone.onclick = () => subInputFile.click();

            subInputFile.onchange = (e) => {
                Array.from(e.target.files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        try {
                            const parsed = JSON.parse(re.target.result);
                            if (parsed.header === 'ROLLCALL_CBT_SUBMISSION_V1' && parsed.data) {
                                evaluatedSubmissions.push(parsed.data);
                                renderSubmissionsTable();
                            } else {
                                alert(`File "${file.name}" is not a recognized .rollcbt-sub submission archive.`);
                            }
                        } catch (err) {
                            alert(`Error parsing "${file.name}": ` + err.message);
                        }
                    };
                    reader.readAsText(file);
                });
            };
        }

        function renderSubmissionsTable() {
            if (!subTableBody) return;
            subTableBody.innerHTML = '';
            if (!evaluatedSubmissions.length) {
                subTableBody.innerHTML = `
                    <tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">
                        No candidate submission records loaded yet.
                    </td></tr>
                `;
                return;
            }

            evaluatedSubmissions.forEach((sub, idx) => {
                const tr = document.createElement('tr');
                const score = sub.scoreSummary?.totalScore ?? 'N/A';
                const total = sub.scoreSummary?.totalPossible ?? 'N/A';
                const pct = sub.scoreSummary?.percentage ?? 'N/A';
                const passed = sub.scoreSummary?.passed;
                const strikes = sub.antiCheatLog?.length || 0;

                tr.innerHTML = `
                    <td><strong>${sub.candidate?.rollNo || 'N/A'}</strong></td>
                    <td>${sub.candidate?.name || 'Unnamed'}</td>
                    <td>${sub.examCode || 'CBT'}</td>
                    <td><strong>${score} / ${total}</strong> (${pct}%)</td>
                    <td><span style="color:${passed ? '#10b981' : '#ef4444'}; font-weight:700;">${passed ? 'PASSED' : 'FAILED'}</span></td>
                    <td><span style="color:${strikes > 0 ? '#ef4444' : '#10b981'}; font-weight:600;">${strikes > 0 ? `${strikes} Strikes` : 'Clean'}</span></td>
                `;
                subTableBody.appendChild(tr);
            });
        }

        if (btnExportCsv) {
            btnExportCsv.onclick = () => {
                if (!evaluatedSubmissions.length) {
                    alert('No submission data to export.');
                    return;
                }
                let csv = 'Roll No,Candidate Name,Exam Code,Score,Total Marks,Percentage,Status,Strikes\n';
                evaluatedSubmissions.forEach(s => {
                    csv += `"${s.candidate?.rollNo || ''}","${s.candidate?.name || ''}","${s.examCode || ''}",${s.scoreSummary?.totalScore || 0},${s.scoreSummary?.totalPossible || 0},${s.scoreSummary?.percentage || 0},"${s.scoreSummary?.passed ? 'PASSED' : 'FAILED'}",${s.antiCheatLog?.length || 0}\n`;
                });
                downloadBlob('CBT_Exam_Results_Report.csv', csv, 'text/csv');
            };
        }

        // Initial table renders
        renderCandidatesTable();
        renderQuestions();
    };

    // =========================================================================
    // MANAGE ACCOUNT: CBT LICENSE CARD (WORKS IN ANY MODE!)
    // =========================================================================
    window.initManageAccountCbtLicense = async function (section) {
        if (!section) return;
        const schoolId = window.currentAdminSchoolId;
        if (typeof window.refreshCbtPlanAccess === 'function' && !await window.refreshCbtPlanAccess(schoolId)) {
            section.querySelector('#account-cbt-license-card')?.remove();
            return;
        }
        let cbtCard = section.querySelector('#account-cbt-license-card');
        if (!cbtCard) {
            const subscriptionCard = section.querySelector('.account-subscription-card');
            if (subscriptionCard && subscriptionCard.parentNode) {
                const cardDiv = document.createElement('section');
                cardDiv.id = 'account-cbt-license-card';
                cardDiv.className = 'card account-card ac-card account-cbt-license-card';
                cardDiv.innerHTML = `
                    <div class="card-header">
                        <span class="ac-card-icon" style="background:rgba(16,185,129,0.15); color:#10b981;"><i class="fas fa-laptop-code"></i></span>
                        <div><span class="ac-card-kicker">OFFLINE TESTING SUITE</span><h3>RollCall CBT Offline Access</h3></div>
                    </div>
                    <div class="card-body">
                        <p>Activate your offline RollCall CBT testing centers. Download the signed <code>.rolllic</code> license file or copy the access code for air-gapped student computers.</p>
                        <div class="cbt-btn-row">
                            <button type="button" class="btn-cbt-primary" id="btn-ac-download-cbt-lic">
                                <i class="fas fa-download"></i> Download .rolllic License File
                            </button>
                            <button type="button" class="btn-cbt-secondary" id="btn-ac-copy-cbt-key">
                                <i class="fas fa-copy"></i> Copy CBT License Key
                            </button>
                        </div>
                        <p id="ac-cbt-lic-status" style="margin-top:10px; font-size:0.82rem; font-weight:600;"></p>
                    </div>
                `;
                subscriptionCard.parentNode.insertBefore(cardDiv, subscriptionCard.nextSibling);
                cbtCard = cardDiv;
            }
        }

        if (cbtCard) {
            const btnDownload = cbtCard.querySelector('#btn-ac-download-cbt-lic');
            const btnCopy = cbtCard.querySelector('#btn-ac-copy-cbt-key');
            const statusEl = cbtCard.querySelector('#ac-cbt-lic-status');

            const currentSchoolCode = window.currentAdminSchoolCode ||
                document.getElementById('account-institution-code')?.textContent?.trim() ||
                'ROLL-SCH-01';
            const currentInstName = window.currentAdminSchoolName ||
                document.getElementById('account-institution-name')?.textContent?.trim() ||
                'RollCall Academy';

            if (btnDownload) {
                btnDownload.onclick = async () => {
                    if (!await window.refreshCbtPlanAccess(schoolId)) {
                        if (statusEl) statusEl.textContent = 'An active CBT plan is required for this school.';
                        return;
                    }
                    const subscription = window.currentCbtPlanSubscription || {};
                    const expiry = Date.parse(subscription.endDate || '') || (Date.now() + 365 * 24 * 60 * 60 * 1000);
                    const planStart = subscription.startDate || new Date().toISOString();
                    const maxDevices = Math.max(1, Math.floor(Number(subscription.maxDevices || subscription.deviceLimit || 1)));
                    const licenseRecord = await getOrCreateStoredCbtLicense(schoolId, currentSchoolCode, currentInstName, expiry, planStart, maxDevices);
                    const fileContent = await generateCbtLicenseFile(currentSchoolCode, currentInstName, expiry, { maxDevices, activationStartDate: planStart, licenseKey: licenseRecord.licenseKey });
                    const filename = `${currentSchoolCode}-cbt-license.rolllic`;
                    downloadBlob(filename, fileContent, 'application/json');
                    if (statusEl) {
                        statusEl.textContent = `✓ License file "${filename}" downloaded.`;
                        statusEl.style.color = '#10b981';
                    }
                };
            }

            if (btnCopy) {
                btnCopy.onclick = async () => {
                    if (!await window.refreshCbtPlanAccess(schoolId)) {
                        if (statusEl) statusEl.textContent = 'An active CBT plan is required for this school.';
                        return;
                    }
                    const subscription = window.currentCbtPlanSubscription || {};
                    const expiry = Date.parse(subscription.endDate || '') || (Date.now() + 365 * 24 * 60 * 60 * 1000);
                    const planStart = subscription.startDate || new Date().toISOString();
                    const maxDevices = Math.max(1, Math.floor(Number(subscription.maxDevices || subscription.deviceLimit || 1)));
                    const licenseRecord = await getOrCreateStoredCbtLicense(schoolId, currentSchoolCode, currentInstName, expiry, planStart, maxDevices);
                    const key = licenseRecord.licenseKey;
                    navigator.clipboard.writeText(key).then(() => {
                        if (statusEl) {
                            statusEl.textContent = '✓ CBT Access Key copied to clipboard!';
                            statusEl.style.color = '#10b981';
                        }
                    });
                };
            }
        }
    };

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    window.addEventListener('load', () => {
        if (window.currentAdminSchoolId) window.refreshCbtPlanAccess(window.currentAdminSchoolId);
    }, { once: true });

})(window, document);
