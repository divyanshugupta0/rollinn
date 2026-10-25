/**
 * RollCall CBT - Secure Offline Computer-Based Testing Client Application
 */

(function () {
    'use strict';

    // Application State
    const state = {
        license: null,
        activeExam: null,
        selectedCandidate: null,
        currentSectionIndex: 0,
        currentQuestionIndex: 0,
        candidateResponses: {},    // questionId -> response
        questionStatus: {},        // questionId -> 'answered' | 'not-answered' | 'review' | 'review-answered' | 'not-visited'
        examTimerInterval: null,
        remainingSeconds: 0,
        totalExamSeconds: 0,
        antiCheatStrikes: 0,
        maxStrikes: 3,
        antiCheatLog: [],
        webcamStream: null,
        scratchpadContent: '',
        fontSizeLevel: 1 // 0 = small, 1 = normal, 2 = large
    };

    // DOM Elements Cache
    const el = {};

    function initElements() {
        // Views
        el.viewLicenseGate = document.getElementById('view-license-gate');
        el.viewSetupExam = document.getElementById('view-setup-exam');
        el.viewExamHall = document.getElementById('view-exam-hall');
        el.viewResults = document.getElementById('view-results');

        // Topbar
        el.topbarInstName = document.getElementById('topbar-institution-name');
        el.topbarSchoolCode = document.getElementById('topbar-school-code');
        el.btnThemeToggle = document.getElementById('btn-theme-toggle');
        el.btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
        el.btnExitApp = document.getElementById('btn-exit-app');

        // License Gate
        el.licenseDropzone = document.getElementById('license-file-dropzone');
        el.inputHiddenLicenseFile = document.getElementById('input-hidden-license-file');
        el.btnBrowseLicenseFile = document.getElementById('btn-browse-license-file');
        el.btnToggleManualLicense = document.getElementById('btn-toggle-manual-license');
        el.formManualLicense = document.getElementById('license-manual-form');
        el.inputManualSchoolCode = document.getElementById('input-license-school-code');
        el.inputManualLicenseKey = document.getElementById('input-license-key');
        el.displayMachineFingerprint = document.getElementById('display-machine-fingerprint');

        // Setup Exam View
        el.setupInstTitle = document.getElementById('setup-inst-title');
        el.setupLicenseExpiry = document.getElementById('setup-license-expiry');
        el.setupLicenseDevices = document.getElementById('setup-license-devices');
        el.btnRelicense = document.getElementById('btn-relicense');
        el.examDropzone = document.getElementById('exam-file-dropzone');
        el.inputHiddenExamFile = document.getElementById('input-hidden-exam-file');
        el.btnBrowseExamFile = document.getElementById('btn-browse-exam-file');
        el.btnLoadSampleExam = document.getElementById('btn-load-sample-exam');
        el.examInspectContainer = document.getElementById('exam-inspect-container');

        // Inspect Meta
        el.inspectSubject = document.getElementById('inspect-exam-subject');
        el.inspectTitle = document.getElementById('inspect-exam-title');
        el.inspectCode = document.getElementById('inspect-exam-code');
        el.inspectDuration = document.getElementById('inspect-exam-duration');
        el.inspectMarks = document.getElementById('inspect-exam-marks');
        el.inspectQuestions = document.getElementById('inspect-exam-questions');
        el.inspectRulesTags = document.getElementById('inspect-rules-tags');
        el.inspectInstructions = document.getElementById('inspect-exam-instructions');
        el.inspectCandidateCount = document.getElementById('inspect-candidate-count');
        el.inputCandidateSearch = document.getElementById('input-candidate-search');
        el.candidateListGrid = document.getElementById('candidate-list-grid');

        // Candidate Selection & PIN Confirm
        el.candidateConfirmBox = document.getElementById('candidate-confirm-box');
        el.confirmStudentName = document.getElementById('confirm-student-name');
        el.confirmStudentRoll = document.getElementById('confirm-student-roll');
        el.confirmStudentClass = document.getElementById('confirm-student-class');
        el.btnChangeStudent = document.getElementById('btn-change-student');
        el.pinVerifyRow = document.getElementById('pin-verify-row');
        el.inputCandidatePin = document.getElementById('input-candidate-pin');
        el.btnVerifyPin = document.getElementById('btn-verify-pin');
        el.pinStatusMsg = document.getElementById('pin-status-msg');

        // Hardware Diagnostics
        el.diagWebcamStatus = document.getElementById('diag-webcam-status');
        el.diagWebcamText = document.getElementById('diag-webcam-text');
        el.setupWebcamVideo = document.getElementById('setup-webcam-video');
        el.checkHonorCode = document.getElementById('check-honor-code');
        el.btnEnterExamHall = document.getElementById('btn-enter-exam-hall');

        // Exam Hall
        el.hallExamTitle = document.getElementById('hall-exam-title');
        el.hallExamSubject = document.getElementById('hall-exam-subject');
        el.hallCandidateName = document.getElementById('hall-candidate-name');
        el.hallCandidateRoll = document.getElementById('hall-candidate-roll');
        el.hallProctorVideo = document.getElementById('hall-proctor-video');
        el.hallStrikeCount = document.getElementById('hall-strike-count');
        el.hallStrikeMax = document.getElementById('hall-strike-max');
        el.hallTimerDisplay = document.getElementById('hall-timer-display');
        el.hallTimerChip = document.getElementById('hall-timer-chip');

        // Utilities
        el.btnFontSmaller = document.getElementById('btn-font-smaller');
        el.btnFontLarger = document.getElementById('btn-font-larger');
        el.btnToggleCalc = document.getElementById('btn-toggle-calculator');
        el.btnToggleScratch = document.getElementById('btn-toggle-scratchpad');

        // Hall Sections & Workarea
        el.hallSectionsBar = document.getElementById('hall-sections-bar');
        el.qCurrentNumber = document.getElementById('q-current-number');
        el.qTotalNumber = document.getElementById('q-total-number');
        el.qMarksPositive = document.getElementById('q-marks-positive');
        el.qMarksNegative = document.getElementById('q-marks-negative');
        el.qTextContent = document.getElementById('q-text-content');
        el.qOptionsContainer = document.getElementById('q-options-container');

        // Question Actions
        el.btnQClear = document.getElementById('btn-q-clear');
        el.btnQReview = document.getElementById('btn-q-review');
        el.btnQPrev = document.getElementById('btn-q-prev');
        el.btnQSaveNext = document.getElementById('btn-q-save-next');
        el.autosaveTimestamp = document.getElementById('autosave-timestamp');

        // Palette
        el.statCountAnswered = document.getElementById('stat-count-answered');
        el.statCountUnanswered = document.getElementById('stat-count-unanswered');
        el.statCountReview = document.getElementById('stat-count-review');
        el.paletteButtonsGrid = document.getElementById('palette-buttons-grid');
        el.btnFinishTest = document.getElementById('btn-finish-test');

        // Modals
        el.modalCalc = document.getElementById('modal-calculator');
        el.btnCloseCalc = document.getElementById('btn-close-calc');
        el.calcDisplay = document.getElementById('calc-display');

        el.modalScratch = document.getElementById('modal-scratchpad');
        el.btnCloseScratch = document.getElementById('btn-close-scratchpad');
        el.scratchpadTextarea = document.getElementById('scratchpad-textarea');
        el.btnClearScratchpad = document.getElementById('btn-clear-scratchpad');

        el.modalAntiCheat = document.getElementById('modal-anti-cheat');
        el.modalStrikeVal = document.getElementById('modal-strike-val');
        el.btnAckStrike = document.getElementById('btn-acknowledge-strike');

        el.modalSubmitConfirm = document.getElementById('modal-submit-confirm');
        el.confirmCountAnswered = document.getElementById('confirm-count-answered');
        el.confirmCountUnanswered = document.getElementById('confirm-count-unanswered');
        el.confirmCountReview = document.getElementById('confirm-count-review');
        el.btnCancelSubmit = document.getElementById('btn-cancel-submit');
        el.btnConfirmFinalSubmit = document.getElementById('btn-confirm-final-submit');

        // Results
        el.resultBadgeIcon = document.getElementById('result-badge-icon');
        el.resultCandidateGreeting = document.getElementById('result-candidate-greeting');
        el.resultSubtitle = document.getElementById('result-subtitle');
        el.resultScoreVal = document.getElementById('result-score-val');
        el.resultTotalVal = document.getElementById('result-total-val');
        el.resultPercentagePill = document.getElementById('result-percentage-pill');
        el.resultStatusText = document.getElementById('result-status-text');
        el.resultStatusSub = document.getElementById('result-status-sub');
        el.resultAccuracyVal = document.getElementById('result-accuracy-val');
        el.resultAccuracyDetails = document.getElementById('result-accuracy-details');
        el.resultTimeTaken = document.getElementById('result-time-taken');
        el.resultAntiCheatStatus = document.getElementById('result-anti-cheat-status');
        el.btnDownloadSubmission = document.getElementById('btn-download-submission');
        el.btnPrintResult = document.getElementById('btn-print-result');
        el.reviewQuestionsList = document.getElementById('review-questions-list');
        el.btnBackToHome = document.getElementById('btn-back-to-home');
        el.toastStack = document.getElementById('toast-stack');
    }

    // Switch active view
    function switchView(viewName) {
        document.querySelectorAll('.cbt-view').forEach(v => v.classList.remove('active'));
        if (viewName === 'license') el.viewLicenseGate.classList.add('active');
        else if (viewName === 'setup') el.viewSetupExam.classList.add('active');
        else if (viewName === 'hall') el.viewExamHall.classList.add('active');
        else if (viewName === 'results') el.viewResults.classList.add('active');
    }

    // Show Toast Notification
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `cbt-toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        el.toastStack.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // =========================================================================
    // LICENSE MANAGEMENT
    // =========================================================================
    async function checkLicenseStatus() {
        try {
            const licenseInfo = await window.rollcallCBT.getLicenseStatus();
            if (licenseInfo && licenseInfo.deviceId) {
                el.displayMachineFingerprint.textContent = licenseInfo.deviceId;
            }

            if (licenseInfo && licenseInfo.valid && !licenseInfo.expired) {
                state.license = licenseInfo;
                applyActiveLicenseUI(licenseInfo);
                switchView('setup');
                if (licenseInfo.inGracePeriod) {
                    showToast(`Renewal reminder: your license expired. ${licenseInfo.graceDaysRemaining} grace day${licenseInfo.graceDaysRemaining === 1 ? '' : 's'} remaining.`, 'error');
                }
            } else {
                state.license = null;
                switchView('license');
                if (licenseInfo && licenseInfo.expired) {
                    showToast(licenseInfo.error || 'Your CBT license has expired.', 'error');
                }
            }
        } catch (e) {
            console.error('License check error:', e);
            switchView('license');
        }
    }

    function applyActiveLicenseUI(license) {
        const instName = license.schoolName || license.institutionName || 'RollCall Institution';
        const schoolCode = license.schoolCode || '----';
        el.topbarInstName.textContent = instName;
        el.topbarSchoolCode.textContent = schoolCode;
        el.setupInstTitle.textContent = `${instName} (${schoolCode})`;
        el.setupLicenseExpiry.textContent = `Offline Enterprise License · Valid until ${license.expiryDate || 'N/A'}`;
        if (license.inGracePeriod) {
            el.setupLicenseExpiry.textContent = `Renewal required - grace period ends ${new Date(license.gracePeriodEndsAt).toLocaleDateString()}`;
        }
        if (el.setupLicenseDevices) el.setupLicenseDevices.textContent = `Devices remaining: ${Number(license.remainingDevices ?? 0)} / ${Number(license.maxDevices || 1)}`;
    }

    async function handleLicenseFileUpload() {
        showToast('For security, use Select .rolllic File and choose it directly from removable external storage.', 'error');
    }

    // =========================================================================
    // EXAM FILE UPLOAD & INSPECTION (.rollcbt)
    // =========================================================================
    async function handleExamFileUpload(file) {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const content = e.target.result;
                const result = await window.rollcallCBT.inspectExamContent(content);
                if (result.success) {
                    loadExamIntoSetup(result.exam);
                    showToast(`Loaded exam: ${result.exam.title}`, 'success');
                } else {
                    showToast(result.error || 'Failed to inspect exam file.', 'error');
                }
            };
            reader.readAsText(file);
        } catch (err) {
            showToast('Error reading exam file: ' + err.message, 'error');
        }
    }

    function loadExamIntoSetup(exam) {
        state.activeExam = exam;
        state.selectedCandidate = null;
        state.candidateResponses = {};
        state.questionStatus = {};

        // Display exam details
        el.inspectSubject.textContent = (exam.subject || 'GENERAL').toUpperCase();
        el.inspectTitle.textContent = exam.title || 'Computer-Based Test';
        el.inspectCode.textContent = `CODE: ${exam.code || 'CBT'}`;
        el.inspectDuration.textContent = exam.durationMinutes || 60;
        el.inspectMarks.textContent = exam.totalMarks || 100;

        // Count total questions
        let totalQ = 0;
        (exam.sections || []).forEach(s => totalQ += (s.questions || []).length);
        el.inspectQuestions.textContent = totalQ;

        // Anti-cheat tags
        el.inspectRulesTags.innerHTML = `
            <span class="rule-tag"><i class="fas fa-expand-arrows-alt"></i> ${exam.rules?.fullScreenEnforced ? 'Fullscreen Lockdown' : 'Standard Window'}</span>
            <span class="rule-tag"><i class="fas fa-video"></i> ${exam.rules?.webcamProctoringRequired ? 'Webcam Proctoring Required' : 'Webcam Optional'}</span>
            <span class="rule-tag"><i class="fas fa-shield-alt"></i> Max Strikes: ${exam.rules?.maxBlurStrikes ?? 3}</span>
            <span class="rule-tag"><i class="fas fa-calculator"></i> Calculator: ${exam.rules?.calculatorAllowed || 'Basic'}</span>
            <span class="rule-tag"><i class="fas fa-edit"></i> Scratchpad: ${exam.rules?.scratchpadAllowed ? 'Enabled' : 'Disabled'}</span>
            <span class="rule-tag"><i class="fas fa-school"></i> ${exam.schoolName || state.license?.schoolName || state.license?.institutionName || 'School'}</span>
            ${exam.assignedSection ? `<span class="rule-tag"><i class="fas fa-users"></i> ${exam.assignedClassName || exam.grade || 'Class'} - Sec ${exam.assignedSection}</span>` : ''}
        `;

        el.inspectInstructions.textContent = exam.instructions || 'Read all questions carefully. Do not attempt to switch tabs or minimize the window during the test.';

        // Each activated IDE device sees only its assigned roster range.
        const deviceIndex = Number(state.license?.activationCount || 0);
        const candidates = Array.isArray(exam.candidates) && deviceIndex > 0
            ? exam.candidates.filter(candidate => !candidate.deviceIndex || Number(candidate.deviceIndex) === deviceIndex)
            : (exam.candidates || []);
        renderCandidatesList(candidates);

        // Show container
        el.examInspectContainer.classList.remove('hidden');
        el.examDropzone.classList.add('hidden');

        // Start hardware check (Webcam)
        initHardwareDiagnostics();
    }

    function renderCandidatesList(candidates) {
        el.candidateListGrid.innerHTML = '';
        el.inspectCandidateCount.textContent = `${candidates.length} Candidate${candidates.length === 1 ? '' : 's'} in Package`;

        if (!candidates.length) {
            el.candidateListGrid.innerHTML = `
                <div class="empty-roster-note" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-muted);">
                    <i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 8px;"></i>
                    <p>No specific candidate roster was bundled. Any registered student can enter their details.</p>
                </div>
            `;
            // Add custom entry student
            selectCandidate({
                rollNo: 'CANDIDATE-01',
                name: 'Test Candidate',
                batch: 'Batch A',
                pin: ''
            });
            return;
        }

        candidates.forEach(c => {
            const card = document.createElement('div');
            card.className = 'candidate-item-card';
            card.innerHTML = `
                <div class="c-avatar">${(c.name || 'S').charAt(0).toUpperCase()}</div>
                <div class="c-info">
                    <strong>${c.name}</strong>
                    <span>Roll: ${c.rollNo || 'N/A'} · ${c.batch || c.class || 'Student'}</span>
                </div>
            `;
            const photo = c.profilePic || c.profilePhoto || c.photoURL || c.photoUrl || c.profilePicture || c.imageUrl;
            if (photo) {
                const avatar = card.querySelector('.c-avatar');
                avatar.textContent = '';
                const image = document.createElement('img');
                image.src = photo;
                image.alt = '';
                avatar.appendChild(image);
            }
            card.addEventListener('click', () => {
                document.querySelectorAll('.candidate-item-card').forEach(ci => ci.classList.remove('selected'));
                card.classList.add('selected');
                selectCandidate(c);
            });
            el.candidateListGrid.appendChild(card);
        });
    }

    function selectCandidate(candidate) {
        state.selectedCandidate = candidate;
        el.confirmStudentName.textContent = candidate.name;
        el.confirmStudentRoll.textContent = candidate.rollNo;
        el.confirmStudentClass.textContent = `${candidate.batch || candidate.class || 'Student'}${candidate.section ? ` - Sec ${candidate.section}` : ''}`;

        el.candidateConfirmBox.classList.remove('hidden');

        // Check if PIN is required
        if (candidate.pin && String(candidate.pin).trim()) {
            el.pinVerifyRow.classList.remove('hidden');
            el.inputCandidatePin.value = '';
            el.pinStatusMsg.textContent = 'Enter student PIN to unlock exam session.';
            el.pinStatusMsg.style.color = 'var(--text-muted)';
            updateStartButtonState(false);
        } else {
            el.pinVerifyRow.classList.add('hidden');
            el.pinStatusMsg.textContent = '';
            updateStartButtonState(el.checkHonorCode.checked);
        }
    }

    function updateStartButtonState(ready) {
        el.btnEnterExamHall.disabled = !ready;
    }

    // Hardware diagnostics & Webcam Stream
    async function initHardwareDiagnostics() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                el.diagWebcamText.textContent = 'Requesting camera access...';
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });
                state.webcamStream = stream;
                el.setupWebcamVideo.srcObject = stream;
                el.diagWebcamStatus.className = 'fas fa-check-circle diag-status pass';
                el.diagWebcamText.textContent = 'Webcam stream verified and ready.';
            } else {
                el.diagWebcamStatus.className = 'fas fa-info-circle diag-status pending';
                el.diagWebcamText.textContent = 'Camera not available on this device.';
            }
        } catch (err) {
            console.warn('Webcam initialization:', err);
            el.diagWebcamStatus.className = 'fas fa-exclamation-circle diag-status pending';
            el.diagWebcamText.textContent = 'Camera permission denied or camera offline.';
        }
    }

    // =========================================================================
    // EXAM HALL ENGINE
    // =========================================================================
    async function startExamSession() {
        if (!state.activeExam || !state.selectedCandidate) {
            showToast('Please select a candidate before proceeding.', 'error');
            return;
        }

        // Enable Kiosk Lockdown
        await window.rollcallCBT.setKioskMode(true);

        // Switch to Exam Hall
        switchView('hall');

        // Proctoring video
        if (state.webcamStream) {
            el.hallProctorVideo.srcObject = state.webcamStream;
        }

        // Setup candidate display
        el.hallExamTitle.textContent = state.activeExam.title;
        el.hallExamSubject.textContent = (state.activeExam.subject || 'EXAM').toUpperCase();
        el.hallCandidateName.textContent = state.selectedCandidate.name;
        el.hallCandidateRoll.textContent = `Roll No: ${state.selectedCandidate.rollNo} · ${state.selectedCandidate.class || state.selectedCandidate.batch || ''}${state.selectedCandidate.section ? ` - Sec ${state.selectedCandidate.section}` : ''}`;

        // Setup strikes
        state.antiCheatStrikes = 0;
        state.maxStrikes = Number(state.activeExam.rules?.maxBlurStrikes ?? 3);
        el.hallStrikeCount.textContent = '0';
        el.hallStrikeMax.textContent = state.maxStrikes;

        // Timer
        const durationMins = Number(state.activeExam.durationMinutes) || 60;
        state.totalExamSeconds = durationMins * 60;
        state.remainingSeconds = state.totalExamSeconds;
        startExamTimer();

        // Render sections and questions
        renderExamSections();
        loadQuestion(0, 0);

        showToast('Exam Hall Initialized. Kiosk Lockdown Active.', 'info');
    }

    function startExamTimer() {
        if (state.examTimerInterval) clearInterval(state.examTimerInterval);
        updateTimerDisplay();

        state.examTimerInterval = setInterval(() => {
            state.remainingSeconds--;
            updateTimerDisplay();

            if (state.remainingSeconds <= 0) {
                clearInterval(state.examTimerInterval);
                showToast('Exam time has elapsed. Auto-submitting responses...', 'info');
                finalizeExamSubmission(true);
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const hrs = Math.floor(state.remainingSeconds / 3600);
        const mins = Math.floor((state.remainingSeconds % 3600) / 60);
        const secs = state.remainingSeconds % 60;

        const str = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        el.hallTimerDisplay.textContent = str;

        if (state.remainingSeconds < 300) {
            el.hallTimerChip.className = 'hall-timer-chip critical';
        } else if (state.remainingSeconds < 600) {
            el.hallTimerChip.className = 'hall-timer-chip warning';
        } else {
            el.hallTimerChip.className = 'hall-timer-chip';
        }
    }

    function renderExamSections() {
        el.hallSectionsBar.innerHTML = '';
        const sections = state.activeExam.sections || [];

        sections.forEach((sec, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `section-tab-btn ${idx === state.currentSectionIndex ? 'active' : ''}`;
            btn.innerHTML = `<i class="fas fa-layer-group"></i> ${sec.title || `Section ${idx + 1}`}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.section-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentSectionIndex = idx;
                loadQuestion(idx, 0);
            });
            el.hallSectionsBar.appendChild(btn);
        });
    }

    function loadQuestion(sectionIdx, questionIdx) {
        state.currentSectionIndex = sectionIdx;
        state.currentQuestionIndex = questionIdx;

        const sections = state.activeExam.sections || [];
        const currentSec = sections[sectionIdx];
        if (!currentSec || !currentSec.questions || !currentSec.questions[questionIdx]) return;

        const q = currentSec.questions[questionIdx];

        // Mark as visited if not already answered or review
        if (!state.questionStatus[q.id]) {
            state.questionStatus[q.id] = 'not-answered';
        }

        // Calculate overall question number
        let overallIdx = 1;
        for (let i = 0; i < sectionIdx; i++) {
            overallIdx += (sections[i].questions || []).length;
        }
        overallIdx += questionIdx;

        let totalQuestions = 0;
        sections.forEach(s => totalQuestions += (s.questions || []).length);

        el.qCurrentNumber.textContent = overallIdx;
        el.qTotalNumber.textContent = totalQuestions;
        el.qMarksPositive.textContent = `+${q.marks || 1.0}`;
        el.qMarksNegative.textContent = `-${q.negativeMarks || (state.activeExam.rules?.negativeMarkingPerQuestion || 0)}`;

        // Render question text
        el.qTextContent.innerHTML = q.text || 'Question text unavailable.';

        // Render options
        renderQuestionOptions(q);

        // Update palette
        renderQuestionPalette();

        // Previous button state
        el.btnQPrev.disabled = (sectionIdx === 0 && questionIdx === 0);
    }

    function renderQuestionOptions(q) {
        el.qOptionsContainer.innerHTML = '';
        const currentResp = state.candidateResponses[q.id];

        if (q.type === 'short_answer' || q.type === 'numerical') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'input-short-answer';
            input.placeholder = 'Type your answer here...';
            input.value = currentResp || '';
            input.addEventListener('input', (e) => {
                state.candidateResponses[q.id] = e.target.value.trim();
                triggerAutoSave();
            });
            el.qOptionsContainer.appendChild(input);
            return;
        }

        // Options (MCQ, Multi-select, True/False)
        const options = q.options || ['Option A', 'Option B', 'Option C', 'Option D'];
        const isMulti = q.type === 'multiple_select';

        options.forEach((optText, optIdx) => {
            const optLetter = String.fromCharCode(65 + optIdx);
            const isSelected = isMulti
                ? Array.isArray(currentResp) && currentResp.includes(optLetter)
                : currentResp === optLetter;

            const optDiv = document.createElement('div');
            optDiv.className = `option-choice-item ${isSelected ? 'selected' : ''}`;
            optDiv.innerHTML = `
                <div class="opt-prefix">${optLetter}</div>
                <div class="opt-text">${optText}</div>
            `;

            optDiv.addEventListener('click', () => {
                if (isMulti) {
                    let arr = Array.isArray(state.candidateResponses[q.id]) ? [...state.candidateResponses[q.id]] : [];
                    if (arr.includes(optLetter)) arr = arr.filter(x => x !== optLetter);
                    else arr.push(optLetter);
                    state.candidateResponses[q.id] = arr;
                } else {
                    state.candidateResponses[q.id] = optLetter;
                }
                renderQuestionOptions(q);
                triggerAutoSave();
            });

            el.qOptionsContainer.appendChild(optDiv);
        });
    }

    function renderQuestionPalette() {
        el.paletteButtonsGrid.innerHTML = '';
        const sections = state.activeExam.sections || [];
        const currentSec = sections[state.currentSectionIndex];
        if (!currentSec) return;

        let answeredCount = 0;
        let unansweredCount = 0;
        let reviewCount = 0;

        // Count across all questions
        sections.forEach(s => {
            (s.questions || []).forEach(q => {
                const status = state.questionStatus[q.id];
                if (status === 'answered' || status === 'review-answered') answeredCount++;
                else if (status === 'review') reviewCount++;
                else unansweredCount++;
            });
        });

        el.statCountAnswered.textContent = answeredCount;
        el.statCountUnanswered.textContent = unansweredCount;
        el.statCountReview.textContent = reviewCount;

        // Render current section buttons
        (currentSec.questions || []).forEach((q, qIdx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const status = state.questionStatus[q.id] || 'not-visited';
            btn.className = `btn-palette-q ${status} ${qIdx === state.currentQuestionIndex ? 'current' : ''}`;
            btn.textContent = qIdx + 1;
            btn.addEventListener('click', () => {
                loadQuestion(state.currentSectionIndex, qIdx);
            });
            el.paletteButtonsGrid.appendChild(btn);
        });
    }

    function saveAndAdvance(markReview = false) {
        const sections = state.activeExam.sections || [];
        const currentSec = sections[state.currentSectionIndex];
        const q = currentSec.questions[state.currentQuestionIndex];
        const hasAnswer = state.candidateResponses[q.id] !== undefined && state.candidateResponses[q.id] !== '';

        if (markReview) {
            state.questionStatus[q.id] = hasAnswer ? 'review-answered' : 'review';
        } else {
            state.questionStatus[q.id] = hasAnswer ? 'answered' : 'not-answered';
        }

        triggerAutoSave();

        // Advance to next question
        if (state.currentQuestionIndex + 1 < currentSec.questions.length) {
            loadQuestion(state.currentSectionIndex, state.currentQuestionIndex + 1);
        } else if (state.currentSectionIndex + 1 < sections.length) {
            // Next section
            renderExamSections();
            loadQuestion(state.currentSectionIndex + 1, 0);
        } else {
            // At the end of the exam
            renderQuestionPalette();
            showToast('You have reached the last question.', 'info');
        }
    }

    function clearCurrentResponse() {
        const sections = state.activeExam.sections || [];
        const currentSec = sections[state.currentSectionIndex];
        const q = currentSec.questions[state.currentQuestionIndex];

        delete state.candidateResponses[q.id];
        state.questionStatus[q.id] = 'not-answered';

        renderQuestionOptions(q);
        renderQuestionPalette();
        triggerAutoSave();
        showToast('Response cleared for this question.', 'info');
    }

    function triggerAutoSave() {
        const timeNow = new Date().toLocaleTimeString();
        el.autosaveTimestamp.textContent = `Auto-saved locally at ${timeNow}`;

        if (window.rollcallCBT && window.rollcallCBT.cacheSessionProgress && state.activeExam) {
            window.rollcallCBT.cacheSessionProgress({
                examId: state.activeExam.examId,
                rollNo: state.selectedCandidate.rollNo,
                responses: state.candidateResponses,
                questionStatus: state.questionStatus,
                remainingSeconds: state.remainingSeconds,
                timestamp: Date.now()
            });
        }
    }

    // =========================================================================
    // ANTI-CHEAT MONITORING
    // =========================================================================
    function handleBlurIncident() {
        if (!state.activeExam) return;

        state.antiCheatStrikes++;
        el.hallStrikeCount.textContent = state.antiCheatStrikes;

        state.antiCheatLog.push({
            incident: 'Focus Loss / Alt-Tab / Window Blur',
            timestamp: new Date().toISOString(),
            strikeNumber: state.antiCheatStrikes
        });

        el.modalStrikeVal.textContent = `${state.antiCheatStrikes} OF ${state.maxStrikes}`;
        el.modalAntiCheat.hidden = false;

        if (state.antiCheatStrikes >= state.maxStrikes) {
            el.modalAntiCheat.hidden = true;
            showToast('Maximum security strikes exceeded! Examination terminating.', 'error');
            finalizeExamSubmission(true);
        }
    }

    // =========================================================================
    // SUBMISSION & RESULTS EVALUATION
    // =========================================================================
    function openSubmitConfirmDialog() {
        let answered = 0;
        let unanswered = 0;
        let review = 0;

        (state.activeExam.sections || []).forEach(s => {
            (s.questions || []).forEach(q => {
                const status = state.questionStatus[q.id];
                if (status === 'answered' || status === 'review-answered') answered++;
                else if (status === 'review') review++;
                else unanswered++;
            });
        });

        el.confirmCountAnswered.textContent = answered;
        el.confirmCountUnanswered.textContent = unanswered;
        el.confirmCountReview.textContent = review;

        el.modalSubmitConfirm.hidden = false;
    }

    async function finalizeExamSubmission(isAutoSubmit = false) {
        el.modalSubmitConfirm.hidden = true;
        if (state.examTimerInterval) clearInterval(state.examTimerInterval);

        // Exit Kiosk Mode
        await window.rollcallCBT.setKioskMode(false);

        // Calculate score
        let totalScore = 0;
        let totalPossible = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unattemptedCount = 0;
        const reviewItems = [];

        (state.activeExam.sections || []).forEach(sec => {
            (sec.questions || []).forEach(q => {
                const qMarks = Number(q.marks) || 1.0;
                const qNeg = Number(q.negativeMarks) || (state.activeExam.rules?.negativeMarkingPerQuestion || 0);
                totalPossible += qMarks;

                const candidateAns = state.candidateResponses[q.id];
                let isCorrect = false;

                if (candidateAns === undefined || candidateAns === '') {
                    unattemptedCount++;
                } else if (q.correctAnswer !== null && q.correctAnswer !== undefined) {
                    if (String(candidateAns).trim().toUpperCase() === String(q.correctAnswer).trim().toUpperCase()) {
                        isCorrect = true;
                        correctCount++;
                        totalScore += qMarks;
                    } else {
                        incorrectCount++;
                        totalScore = Math.max(0, totalScore - qNeg);
                    }
                } else {
                    // Descriptive or subjective questions without auto-key
                    unattemptedCount++;
                }

                reviewItems.push({
                    text: q.text,
                    candidateAns: candidateAns || 'Not Answered',
                    correctAns: q.correctAnswer || 'Evaluated by Teacher',
                    explanation: q.explanation || '',
                    isCorrect: isCorrect,
                    isUnattempted: candidateAns === undefined || candidateAns === ''
                });
            });
        });

        const timeTaken = state.totalExamSeconds - state.remainingSeconds;
        const minsTaken = Math.floor(timeTaken / 60);
        const secsTaken = timeTaken % 60;
        const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;
        const passMarks = Number(state.activeExam.passMarks) || 40;
        const passed = percentage >= passMarks;

        // Render Results UI
        el.resultCandidateGreeting.textContent = `${state.selectedCandidate.name} - Exam Complete!`;
        el.resultSubtitle.textContent = `Official candidate record for ${state.activeExam.title} (${state.activeExam.code || 'CBT'})`;
        el.resultScoreVal.textContent = totalScore.toFixed(1);
        el.resultTotalVal.textContent = totalPossible.toFixed(1);
        el.resultPercentagePill.textContent = `${percentage}%`;

        if (passed) {
            el.resultStatusText.textContent = 'PASSED';
            el.resultStatusText.className = 'status-display';
            el.resultBadgeIcon.className = 'result-badge-icon';
            el.resultBadgeIcon.innerHTML = '<i class="fas fa-trophy"></i>';
        } else {
            el.resultStatusText.textContent = 'NEEDS IMPROVEMENT';
            el.resultStatusText.className = 'status-display fail';
            el.resultBadgeIcon.className = 'result-badge-icon fail';
            el.resultBadgeIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        }

        const accuracy = (correctCount + incorrectCount) > 0
            ? Math.round((correctCount / (correctCount + incorrectCount)) * 100)
            : 0;
        el.resultAccuracyVal.textContent = `${accuracy}%`;
        el.resultAccuracyDetails.textContent = `${correctCount} Correct · ${incorrectCount} Incorrect · ${unattemptedCount} Skipped`;
        el.resultTimeTaken.textContent = `${minsTaken}m ${secsTaken}s`;
        el.resultAntiCheatStatus.textContent = state.antiCheatStrikes > 0
            ? `Security Strikes Logged: ${state.antiCheatStrikes}`
            : 'Anti-Cheat: 100% Clean';

        // Render Question Reviews
        renderReviewList(reviewItems);

        // Switch to Results View
        switchView('results');

        // Prepare submission object
        state.lastSubmissionPackage = {
            candidate: state.selectedCandidate,
            examId: state.activeExam.examId,
            examCode: state.activeExam.code,
            examTitle: state.activeExam.title,
            schoolCode: state.license?.schoolCode || state.activeExam.schoolCode || 'OFFLINE',
            responses: state.candidateResponses,
            timeTakenSeconds: timeTaken,
            antiCheatLog: state.antiCheatLog,
            scoreSummary: {
                totalScore,
                totalPossible,
                percentage,
                passed,
                correctCount,
                incorrectCount,
                unattemptedCount,
                accuracy
            }
        };

        showToast('Exam submitted successfully!', 'success');
    }

    function renderReviewList(items) {
        el.reviewQuestionsList.innerHTML = '';
        items.forEach((item, idx) => {
            const card = document.createElement('div');
            const stateClass = item.isUnattempted ? 'unanswered' : (item.isCorrect ? 'correct' : 'incorrect');
            card.className = `review-item ${stateClass}`;
            card.innerHTML = `
                <div class="review-item-header">
                    <span>Question ${idx + 1}</span>
                    <span>${item.isUnattempted ? 'Skipped' : (item.isCorrect ? 'Correct (+)' : 'Incorrect (-)')}</span>
                </div>
                <div class="review-q-text">${item.text}</div>
                <div class="review-answers-grid">
                    <div class="review-candidate-ans">Your Answer: <strong>${item.candidateAns}</strong></div>
                    <div class="review-correct-ans">Correct Key: <strong>${item.correctAns}</strong></div>
                </div>
                ${item.explanation ? `<div class="review-explanation"><strong>Explanation:</strong> ${item.explanation}</div>` : ''}
            `;
            el.reviewQuestionsList.appendChild(card);
        });
    }

    // =========================================================================
    // SCIENTIFIC CALCULATOR LOGIC
    // =========================================================================
    let calcExpression = '';

    function handleCalcButton(val) {
        if (val === 'C') {
            calcExpression = '';
            el.calcDisplay.textContent = '0';
        } else if (val === 'DEL') {
            calcExpression = calcExpression.slice(0, -1);
            el.calcDisplay.textContent = calcExpression || '0';
        } else if (val === '=') {
            try {
                let expr = calcExpression
                    .replace(/×/g, '*')
                    .replace(/÷/g, '/')
                    .replace(/−/g, '-');
                // Evaluate safely
                const result = Function(`'use strict'; return (${expr})`)();
                calcExpression = String(result);
                el.calcDisplay.textContent = calcExpression;
            } catch {
                el.calcDisplay.textContent = 'Error';
                calcExpression = '';
            }
        } else if (['sin', 'cos', 'tan', 'sqrt', 'log', 'ln'].includes(val)) {
            const num = parseFloat(calcExpression) || 0;
            let res = 0;
            if (val === 'sin') res = Math.sin(num * Math.PI / 180);
            else if (val === 'cos') res = Math.cos(num * Math.PI / 180);
            else if (val === 'tan') res = Math.tan(num * Math.PI / 180);
            else if (val === 'sqrt') res = Math.sqrt(num);
            else if (val === 'log') res = Math.log10(num);
            else if (val === 'ln') res = Math.log(num);
            calcExpression = String(res.toFixed(4));
            el.calcDisplay.textContent = calcExpression;
        } else if (val === 'pi') {
            calcExpression += Math.PI.toFixed(4);
            el.calcDisplay.textContent = calcExpression;
        } else {
            calcExpression += val;
            el.calcDisplay.textContent = calcExpression;
        }
    }

    // =========================================================================
    // BUILT-IN DEMO EXAM GENERATOR (FOR IMMEDIATE OFFLINE DEMONSTRATION)
    // =========================================================================
    function getBuiltInDemoExam() {
        return {
            magic: 'ROLLCBT',
            version: '1.0',
            schoolCode: state.license?.schoolCode || 'DEMO-SCH',
            examId: 'EXAM-DEMO-2026',
            title: 'General Science & Computer Fundamentals CBT',
            code: 'SCI-CBT-2026',
            subject: 'Science & Technology',
            grade: 'All Batches',
            durationMinutes: 45,
            totalMarks: 50,
            passMarks: 40,
            instructions: '1. Each question has four choices with only one correct answer.\n2. Do not switch away from the exam window or press navigation shortcuts.\n3. Your webcam feed is continuously verified during this test.',
            rules: {
                fullScreenEnforced: true,
                maxBlurStrikes: 3,
                webcamProctoringRequired: true,
                randomizeQuestions: false,
                randomizeOptions: false,
                calculatorAllowed: 'scientific',
                scratchpadAllowed: true,
                showImmediateResult: true,
                negativeMarkingPerQuestion: 0.25
            },
            candidates: [
                { rollNo: '101', name: 'Aarav Sharma', batch: 'Batch Alpha (Class 10-A)', pin: '1234' },
                { rollNo: '102', name: 'Diya Patel', batch: 'Batch Alpha (Class 10-A)', pin: '1234' },
                { rollNo: '103', name: 'Rohan Verma', batch: 'Batch Beta (Class 10-B)', pin: '1234' },
                { rollNo: '104', name: 'Ananya Iyer', batch: 'Batch Beta (Class 10-B)', pin: '1234' },
                { rollNo: '105', name: 'Vikram Singh', batch: 'Batch Gamma (Class 10-C)', pin: '1234' }
            ],
            sections: [
                {
                    id: 'sec-1',
                    title: 'Section A: Physics & Electronics',
                    questions: [
                        {
                            id: 'q1',
                            text: 'What is the SI unit of electrical resistance?',
                            type: 'multiple_choice',
                            options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
                            correctAnswer: 'C',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: 'The SI unit of electrical resistance is the Ohm (symbol: Ω), named after Georg Ohm.'
                        },
                        {
                            id: 'q2',
                            text: 'Which principle explains why an airplane experiences aerodynamic lift?',
                            type: 'multiple_choice',
                            options: ['Archimedes Principle', 'Bernoulli Principle', 'Pascal Law', 'Coulomb Law'],
                            correctAnswer: 'B',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: 'Bernoulli principle states that an increase in the speed of a fluid occurs simultaneously with a decrease in static pressure.'
                        },
                        {
                            id: 'q3',
                            text: 'What is the acceleration due to gravity on Earth surface approximately?',
                            type: 'multiple_choice',
                            options: ['9.8 m/s²', '8.9 m/s²', '11.2 m/s²', '6.67 m/s²'],
                            correctAnswer: 'A',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: 'Standard gravity on the surface of the Earth is approximately 9.80665 m/s².'
                        }
                    ]
                },
                {
                    id: 'sec-2',
                    title: 'Section B: Computer Systems & Programming',
                    questions: [
                        {
                            id: 'q4',
                            text: 'In binary numeral system, what is the decimal equivalent of the binary number 1011?',
                            type: 'multiple_choice',
                            options: ['9', '11', '13', '15'],
                            correctAnswer: 'B',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: '1*2³ + 0*2² + 1*2¹ + 1*2⁰ = 8 + 0 + 2 + 1 = 11.'
                        },
                        {
                            id: 'q5',
                            text: 'Which memory type is volatile and loses its content when power is disconnected?',
                            type: 'multiple_choice',
                            options: ['ROM', 'Flash Drive', 'RAM', 'Hard Disk Drive'],
                            correctAnswer: 'C',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: 'RAM (Random Access Memory) is volatile primary memory.'
                        },
                        {
                            id: 'q6',
                            text: 'What is the time complexity of binary search on a sorted array of N elements?',
                            type: 'multiple_choice',
                            options: ['O(N)', 'O(log N)', 'O(N²)', 'O(1)'],
                            correctAnswer: 'B',
                            marks: 2.0,
                            negativeMarks: 0.5,
                            explanation: 'Binary search halves the search space each step, giving O(log N) logarithmic time complexity.'
                        }
                    ]
                }
            ]
        };
    }

    // =========================================================================
    // EVENT LISTENERS & SETUP
    // =========================================================================
    function setupEventListeners() {
        // Theme toggle
        el.btnThemeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            el.btnThemeToggle.innerHTML = `<i class="fas fa-${isDark ? 'moon' : 'sun'}"></i>`;
        });

        // Fullscreen toggle
        el.btnFullscreenToggle.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });

        // Exit App
        el.btnExitApp.addEventListener('click', () => {
            if (confirm('Are you sure you want to close RollCall CBT?')) {
                window.rollcallCBT.exitApp();
            }
        });

        // License File Dropzone
        el.licenseDropzone.addEventListener('click', async () => {
            const res = await window.rollcallCBT.openLicenseFileDialog();
            if (res.canceled) return;
            if (res.success) {
                showToast(res.licenseFileDeleted
                    ? 'Final device activated. The consumed license was removed from removable storage.'
                    : `License activated for ${res.license.institutionName}!`, 'success');
                state.license = res.license;
                applyActiveLicenseUI(res.license);
                switchView('setup');
            } else {
                showToast(res.error || 'Failed to activate license.', 'error');
            }
        });

        el.btnBrowseLicenseFile.addEventListener('click', (e) => {
            e.stopPropagation();
            el.licenseDropzone.click();
        });

        // License file drag & drop
        ['dragenter', 'dragover'].forEach(evt => {
            el.licenseDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                el.licenseDropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(evt => {
            el.licenseDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                el.licenseDropzone.classList.remove('dragover');
            });
        });
        el.licenseDropzone.addEventListener('drop', () => handleLicenseFileUpload());

        // Manual License Code form
        el.btnToggleManualLicense.addEventListener('click', () => {
            el.formManualLicense.classList.toggle('hidden');
        });

        el.formManualLicense.addEventListener('submit', async (e) => {
            e.preventDefault();
            const schoolCode = el.inputManualSchoolCode.value.trim();
            const licenseKey = el.inputManualLicenseKey.value.trim();
            if (!schoolCode || !licenseKey) {
                showToast('Please provide both School Code and License Key.', 'error');
                return;
            }

            const res = await window.rollcallCBT.activateLicenseKey({
                schoolCode,
                licenseKey
            });

            if (res.success) {
                showToast(res.licenseFileDeleted
                    ? 'Final device activated. The consumed license was removed from removable storage.'
                    : `License activated for ${res.license.schoolCode}!`, 'success');
                state.license = res.license;
                applyActiveLicenseUI(res.license);
                switchView('setup');
            } else {
                showToast(res.error || 'Activation failed.', 'error');
            }
        });

        // Manage License Button in Setup
        el.btnRelicense.addEventListener('click', () => {
            switchView('license');
        });

        // Exam File Dropzone
        el.examDropzone.addEventListener('click', async () => {
            const res = await window.rollcallCBT.openExamDialog();
            if (res.canceled) return;
            if (res.exam) {
                loadExamIntoSetup(res.exam);
                showToast(`Loaded exam: ${res.exam.title}`, 'success');
            } else {
                showToast(res.error || 'Could not load exam file.', 'error');
            }
        });

        el.btnBrowseExamFile.addEventListener('click', (e) => {
            e.stopPropagation();
            el.examDropzone.click();
        });

        ['dragenter', 'dragover'].forEach(evt => {
            el.examDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                el.examDropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(evt => {
            el.examDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                el.examDropzone.classList.remove('dragover');
            });
        });
        el.examDropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleExamFileUpload(file);
        });

        // Load Built-in Demo Exam
        el.btnLoadSampleExam.addEventListener('click', (e) => {
            e.stopPropagation();
            const demoExam = getBuiltInDemoExam();
            loadExamIntoSetup(demoExam);
            showToast('Loaded built-in demonstration exam package.', 'success');
        });

        // Candidate Search
        el.inputCandidateSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.candidate-item-card').forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(term) ? 'flex' : 'none';
            });
        });

        // Change Student
        el.btnChangeStudent.addEventListener('click', () => {
            state.selectedCandidate = null;
            el.candidateConfirmBox.classList.add('hidden');
            document.querySelectorAll('.candidate-item-card').forEach(c => c.classList.remove('selected'));
            updateStartButtonState(false);
        });

        // Verify PIN
        el.btnVerifyPin.addEventListener('click', () => {
            const pin = el.inputCandidatePin.value.trim();
            if (state.selectedCandidate && state.selectedCandidate.pin) {
                if (pin === String(state.selectedCandidate.pin).trim()) {
                    el.pinStatusMsg.textContent = '✓ PIN verified successfully!';
                    el.pinStatusMsg.style.color = 'var(--accent-emerald)';
                    updateStartButtonState(el.checkHonorCode.checked);
                } else {
                    el.pinStatusMsg.textContent = '✗ Incorrect PIN. Check with your exam supervisor.';
                    el.pinStatusMsg.style.color = 'var(--accent-coral)';
                    updateStartButtonState(false);
                }
            }
        });

        // Honor code checkbox
        el.checkHonorCode.addEventListener('change', () => {
            if (state.selectedCandidate) {
                const pinRequired = state.selectedCandidate.pin && String(state.selectedCandidate.pin).trim();
                const pinValid = !pinRequired || el.pinStatusMsg.textContent.includes('✓');
                updateStartButtonState(el.checkHonorCode.checked && pinValid);
            }
        });

        // Enter Exam Hall Button
        el.btnEnterExamHall.addEventListener('click', () => {
            startExamSession();
        });

        // Question actions in Exam Hall
        el.btnQSaveNext.addEventListener('click', () => saveAndAdvance(false));
        el.btnQReview.addEventListener('click', () => saveAndAdvance(true));
        el.btnQClear.addEventListener('click', clearCurrentResponse);
        el.btnQPrev.addEventListener('click', () => {
            if (state.currentQuestionIndex > 0) {
                loadQuestion(state.currentSectionIndex, state.currentQuestionIndex - 1);
            } else if (state.currentSectionIndex > 0) {
                const prevSec = state.activeExam.sections[state.currentSectionIndex - 1];
                loadQuestion(state.currentSectionIndex - 1, (prevSec.questions || []).length - 1);
            }
        });

        // Font sizing
        el.btnFontSmaller.addEventListener('click', () => {
            state.fontSizeLevel = Math.max(0, state.fontSizeLevel - 1);
            el.qTextContent.style.fontSize = state.fontSizeLevel === 0 ? '1rem' : (state.fontSizeLevel === 1 ? '1.18rem' : '1.35rem');
        });
        el.btnFontLarger.addEventListener('click', () => {
            state.fontSizeLevel = Math.min(2, state.fontSizeLevel + 1);
            el.qTextContent.style.fontSize = state.fontSizeLevel === 0 ? '1rem' : (state.fontSizeLevel === 1 ? '1.18rem' : '1.35rem');
        });

        // Calculator toggle
        el.btnToggleCalc.addEventListener('click', () => {
            el.modalCalc.hidden = !el.modalCalc.hidden;
        });
        el.btnCloseCalc.addEventListener('click', () => {
            el.modalCalc.hidden = true;
        });
        document.querySelectorAll('.calc-btn').forEach(b => {
            b.addEventListener('click', () => handleCalcButton(b.dataset.val));
        });

        // Scratchpad toggle
        el.btnToggleScratch.addEventListener('click', () => {
            el.modalScratch.hidden = !el.modalScratch.hidden;
        });
        el.btnCloseScratch.addEventListener('click', () => {
            el.modalScratch.hidden = true;
        });
        el.btnClearScratchpad.addEventListener('click', () => {
            el.scratchpadTextarea.value = '';
            state.scratchpadContent = '';
        });
        el.scratchpadTextarea.addEventListener('input', (e) => {
            state.scratchpadContent = e.target.value;
        });

        // Anti-cheat alert dismiss
        el.btnAckStrike.addEventListener('click', () => {
            el.modalAntiCheat.hidden = true;
        });

        // Finish exam button
        el.btnFinishTest.addEventListener('click', openSubmitConfirmDialog);
        el.btnCancelSubmit.addEventListener('click', () => {
            el.modalSubmitConfirm.hidden = true;
        });
        el.btnConfirmFinalSubmit.addEventListener('click', () => {
            finalizeExamSubmission(false);
        });

        // Results actions
        el.btnDownloadSubmission.addEventListener('click', async () => {
            if (!state.lastSubmissionPackage) return;
            const res = await window.rollcallCBT.saveSubmission(state.lastSubmissionPackage);
            if (res.success) {
                showToast(`Submission saved to: ${res.savedPath}`, 'success');
            } else {
                showToast(res.error || 'Failed to save submission file.', 'error');
            }
        });

        el.btnPrintResult.addEventListener('click', () => {
            window.print();
        });

        el.btnBackToHome.addEventListener('click', () => {
            state.activeExam = null;
            state.selectedCandidate = null;
            el.examInspectContainer.classList.add('hidden');
            el.examDropzone.classList.remove('hidden');
            switchView('setup');
        });

        // IPC Anti-cheat blur listener
        if (window.rollcallCBT && window.rollcallCBT.onBlurDetected) {
            window.rollcallCBT.onBlurDetected(() => {
                handleBlurIncident();
            });
        }

        // File opened from command line (.rollcbt)
        if (window.rollcallCBT && window.rollcallCBT.onFileOpenedFromCli) {
            window.rollcallCBT.onFileOpenedFromCli((data) => {
                if (data && data.exam) {
                    loadExamIntoSetup(data.exam);
                    showToast(`Opened exam: ${data.exam.title}`, 'info');
                }
            });
        }

        // License activated from command line (.rolllic)
        if (window.rollcallCBT && window.rollcallCBT.onLicenseActivatedFromCli) {
            window.rollcallCBT.onLicenseActivatedFromCli((license) => {
                state.license = license;
                applyActiveLicenseUI(license);
                switchView('setup');
                showToast(license.licenseFileDeleted
                    ? 'Final device activated. The consumed license was removed from removable storage.'
                    : `Activated license for ${license.institutionName}!`, 'success');
            });
        }

        // Generic error messages from main process
        if (window.rollcallCBT && window.rollcallCBT.onErrorMessage) {
            window.rollcallCBT.onErrorMessage((msg) => {
                showToast(msg, 'error');
            });
        }
    }

    // App Initialization
    document.addEventListener('DOMContentLoaded', () => {
        initElements();
        setupEventListeners();
        // Always start from a clean startup gate. Exam-only dialogs must never
        // be visible when the desktop application is launched.
        [el.modalCalc, el.modalScratch, el.modalAntiCheat, el.modalSubmitConfirm].forEach(modal => {
            if (modal) modal.hidden = true;
        });
        switchView('license');
        checkLicenseStatus();
    });
})();
