/* Standalone owner school registration controller. */
(function () {
    let step = 1;
    let saving = false;
    const DRAFT_KEY = 'rollcall-owner-school-registration-draft';

    const ids = [
        'schoolName', 'schoolType', 'schoolAddress', 'city', 'state', 'zipCode',
        'principalName', 'principalEmail', 'schoolPhone', 'adminName',
        'schoolAdminUsername', 'schoolAdminContactEmail', 'schoolAdminDob', 'schoolAdminPassword',
        'studentCapacity'
    ];

    const value = id => document.getElementById(id)?.value.trim() || '';
    const notify = (message, type = 'info') => typeof showAlert === 'function' ? showAlert(message, type) : window.alert(message);
    const plans = () => Array.isArray(window.ownerPricingPlans) ? window.ownerPricingPlans : [];
    const escape = input => String(input || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

    function readDraft() {
        try {
            return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
        } catch (error) {
            console.warn('Owner registration draft could not be read.', error);
            return {};
        }
    }

    function saveDraft() {
        const form = document.getElementById('schoolRegistrationForm');
        if (!form || saving) return;
        const draft = { step };
        form.querySelectorAll('input, select, textarea').forEach(field => {
            if (!field.id || field.type === 'file' || field.id === 'schoolCode' || field.id === 'schoolAdminPassword') return;
            draft[field.id] = field.type === 'checkbox' ? field.checked : field.value;
        });
        draft.subscriptionPlan = document.querySelector('#schoolRegistrationForm [name="subscriptionPlan"]:checked')?.value || '';
        draft.topups = {};
        form.querySelectorAll('.topup-quantity').forEach(field => {
            const planId = field.closest('[data-plan-id]')?.dataset.planId;
            if (planId) draft.topups[planId] = field.value;
        });
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (error) {
            console.warn('Owner registration draft could not be saved.', error);
        }
    }

    function restoreDraft() {
        const draft = readDraft();
        const form = document.getElementById('schoolRegistrationForm');
        if (!form || !draft || typeof draft !== 'object') return;
        form.querySelectorAll('input, select, textarea').forEach(field => {
            if (!field.id || field.type === 'file' || field.id === 'schoolCode' || field.id === 'schoolAdminPassword') return;
            if (!(field.id in draft)) return;
            if (field.type === 'checkbox') field.checked = draft[field.id] === true;
            else field.value = String(draft[field.id] ?? '');
        });
        if (typeof window.renderSchoolPlanOptions === 'function') {
            window.renderSchoolPlanOptions();
        }
        if (draft.subscriptionPlan) {
            const plan = form.querySelector(`[name="subscriptionPlan"][value="${CSS.escape(String(draft.subscriptionPlan))}"]`);
            if (plan) plan.checked = true;
        }
        Object.entries(draft.topups || {}).forEach(([planId, quantity]) => {
            const field = form.querySelector(`.topup-quantity[data-plan-id="${CSS.escape(planId)}"], [data-plan-id="${CSS.escape(planId)}"] .topup-quantity`);
            if (field) field.value = String(quantity);
        });
        setStep(Number(draft.step) || 1, false);
    }

    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            console.warn('Owner registration draft could not be cleared.', error);
        }
    }

    function setStep(next, persist = true) {
        step = Math.max(1, Math.min(3, next));
        [1, 2, 3].forEach(index => {
            const panel = document.getElementById(`registrationStep${index}`);
            if (panel) {
                panel.hidden = index !== step;
                panel.style.display = index === step ? 'block' : 'none';
            }
        });
        const indicator = document.getElementById('currentStepIndicator');
        const progress = document.getElementById('registrationProgress');
        if (indicator) indicator.textContent = String(step);
        if (progress) progress.style.width = `${step * 33.333}%`;
        if (step === 3 && typeof window.renderSchoolPlanOptions === 'function') {
            window.renderSchoolPlanOptions();
        }
        if (persist) saveDraft();
    }

    function stepFields(number) {
        return number === 1
            ? ['schoolName', 'schoolType', 'schoolAddress', 'city', 'state', 'zipCode']
            : number === 2
                ? ['principalName', 'principalEmail', 'schoolPhone', 'adminName', 'schoolAdminUsername', 'schoolAdminContactEmail', 'schoolAdminDob', 'schoolAdminPassword']
                : ['studentCapacity'];
    }

    function advance() {
        const invalid = stepFields(step).map(id => document.getElementById(id)).find(field => field && !field.checkValidity());
        if (invalid) {
            invalid.reportValidity();
            invalid.focus();
            return;
        }
        setStep(step + 1);
    }

    function reset() {
        document.getElementById('schoolRegistrationForm')?.reset();
        clearDraft();
        setStep(1);
    }

    function randomPart() {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
    }

    async function reserveCode(type) {
        const prefix = type.toLowerCase() === 'college' ? 'COL' : type.toLowerCase() === 'erp' ? 'ERP' : 'SCH';
        const existing = await database.ref('schools').once('value');
        const used = new Set(Object.values(existing.val() || {}).map(item => String(item?.code || '').toUpperCase()));
        for (let attempt = 0; attempt < 30; attempt += 1) {
            const code = `${prefix}-${randomPart()}`;
            if (used.has(code)) continue;
            const result = await database.ref(`schoolCodeReservations/${code}`).transaction(current => current === null ? {
                ownerId: currentUser.uid,
                createdAt: new Date().toISOString()
            } : undefined);
            if (result.committed) return code;
        }
        throw new Error('A unique school code could not be generated. Please try again.');
    }

    const R2_IMAGE_CONFIG = {
        maxBytes: 2 * 1024 * 1024,
        maxDimension: 640,
        outputType: 'image/webp',
        quality: 0.8
    };

    function imageDimensions(width, height) {
        if (!width || !height || (width <= R2_IMAGE_CONFIG.maxDimension && height <= R2_IMAGE_CONFIG.maxDimension)) {
            return { width, height };
        }
        const ratio = Math.min(R2_IMAGE_CONFIG.maxDimension / width, R2_IMAGE_CONFIG.maxDimension / height);
        return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
    }

    async function loadImage(file) {
        if (window.createImageBitmap) {
            try {
                return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (error) {
                try {
                    return await window.createImageBitmap(file);
                } catch (fallbackError) {
                    // Use the HTML image fallback below.
                }
            }
        }
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = error => {
                URL.revokeObjectURL(objectUrl);
                reject(error);
            };
            image.src = objectUrl;
        });
    }

    async function compressImage(file) {
        const image = await loadImage(file);
        const dimensions = imageDimensions(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('The image could not be prepared for upload.');
        context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
        const webp = await new Promise(resolve => canvas.toBlob(resolve, R2_IMAGE_CONFIG.outputType, R2_IMAGE_CONFIG.quality));
        if (webp) return webp;
        const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', R2_IMAGE_CONFIG.quality));
        return jpeg || file;
    }

    async function uploadImage(file, schoolId) {
        if (!file) return '';
        if (!file.type.startsWith('image/')) throw new Error('Select a valid image file.');
        if (file.size > R2_IMAGE_CONFIG.maxBytes) throw new Error('Image size must be less than 2MB.');
        const compressed = await compressImage(file);
        return (await window.RollCallProfileUpload.upload(compressed, currentUser)).publicUrl;
    }

    function selectedPlan() {
        const id = document.querySelector('[name="subscriptionPlan"]:checked')?.value;
        return plans().find(plan => plan.id === id || plan.name === id);
    }

    function topups(start, end) {
        return Array.from(document.querySelectorAll('.topup-quantity')).flatMap(input => {
            const count = Math.max(0, Math.min(99, Number(input.value) || 0));
            const plan = plans().find(item => item.id === input.closest('[data-plan-id]')?.dataset.planId);
            if (!plan) return [];
            const isMonths = plan.topupKind === 'months';
            const isDays = plan.topupKind === 'days';
            const topupKind = isMonths ? 'months' : (isDays ? 'days' : 'capacity');
            return Array.from({ length: count }, () => ({
                planId: plan.id, name: plan.name, topupKind,
                monthsAdded: isMonths ? Number(plan.durationMonths || 0) : 0,
                daysAdded: isDays ? Number(plan.durationDays || plan.daysAdded || 0) : 0,
                studentCapacity: (isMonths || isDays) ? 0 : Number(plan.studentCapacity || 0),
                teacherCapacity: (isMonths || isDays) ? 0 : Number(plan.teacherCapacity || 0),
                price: Number(plan.price || 0),
                listPrice: Number(plan.price || 0), currency: plan.currency || 'INR',
                startDate: start.toISOString(), endDate: end.toISOString(), assignedAt: start.toISOString()
            }));
        });
    }

    function addCalendarMonths(date, months) {
        const result = new Date(date);
        const day = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + Number(months || 0));
        const finalDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(day, finalDay));
        return result;
    }

    function button(label, busy) {
        const element = document.getElementById('registerSchoolBtn');
        if (!element) return;
        element.disabled = busy;
        element.setAttribute('aria-busy', String(busy));
        element.innerHTML = busy ? `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${label}` : '<i class="fas fa-save me-2"></i>Register School';
    }

    function setStatus(message, type = 'danger', details = '') {
        const status = document.getElementById('registrationStatus');
        if (!status) return;
        status.hidden = false;
        status.className = `alert alert-${type} text-start mt-3 mb-0`;
        status.innerHTML = `<strong>${escape(message)}</strong>${details ? `<div class="small mt-1">${escape(details)}</div>` : ''}`;
    }

    function clearStatus() {
        const status = document.getElementById('registrationStatus');
        if (status) {
            status.hidden = true;
            status.textContent = '';
        }
    }

    function errorDetails(error) {
        const code = error?.code ? `Code: ${error.code}. ` : '';
        const message = error?.message || String(error || 'Unknown error.');
        return `${code}${message}`;
    }

    function showCredentials(school, password) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Registration successful</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="alert alert-success">${escape(school.name)} is ready.</div><p>Administrator credentials are shown here and will be emailed to the admin.</p><dl><dt>Name</dt><dd>${escape(school.contacts.admin.name)}</dd><dt>Username</dt><dd>${escape(school.contacts.admin.username)}</dd><dt>Email</dt><dd>${escape(school.contacts.admin.email)}</dd><dt>Password</dt><dd><input class="form-control" value="${escape(password)}" readonly></dd></dl><p id="adminCredentialEmailStatus" class="small mb-0" role="status">Sending credentials email…</p></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Done</button></div></div></div>`;
        document.body.appendChild(modal);
        modal.addEventListener('hidden.bs.modal', () => modal.remove(), { once: true });
        bootstrap.Modal.getOrCreateInstance(modal).show();
        return modal.querySelector('#adminCredentialEmailStatus');
    }

    async function emailAdministratorCredentials(schoolId, adminUid) {
        const user = ownerAuth?.auth().currentUser;
        const workerUrl = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || '').trim();
        if (!user || !workerUrl) throw new Error('The secure email service is unavailable.');
        const endpoint = new URL(workerUrl);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
            throw new Error('The secure email service URL is invalid.');
        }
        endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/school-admin-credentials`;
        const result = await fetch(endpoint.href, {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
            body: JSON.stringify({ schoolId, adminUid })
        });
        const data = await result.json().catch(() => ({}));
        if (!result.ok) throw new Error(data.error || 'The administrator credentials email could not be sent.');
        return data;
    }

    async function createAdministratorAccount({ email, password, name, username, schoolId, schoolName, dob }) {
        if (!ownerAuth?.options || typeof firebase === 'undefined') {
            throw new Error('Firebase Authentication is not available for administrator account creation.');
        }
        const appName = `schoolAdminRegistration-${schoolId}`;
        let adminApp;
        try {
            const existing = firebase.apps.find(app => app.name === appName);
            adminApp = existing || firebase.initializeApp(ownerAuth.options, appName);
            const credential = await adminApp.auth().createUserWithEmailAndPassword(email, password);
            if (name) await credential.user.updateProfile({ displayName: name });
            return {
                uid: credential.user.uid,
                email: credential.user.email || email,
                profile: {
                    uid: credential.user.uid,
                    name,
                    username,
                    email: credential.user.email || email,
                    dob: dob || null,
                    dateOfBirth: dob || null,
                    role: 'admin',
                    schoolId,
                    schoolName,
                    institutionType: value('schoolType').toLowerCase(),
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser.uid
                }
            };
        } finally {
            if (adminApp) {
                await adminApp.auth().signOut().catch(error => console.warn('Administrator registration session could not be signed out.', error));
                await adminApp.delete().catch(error => console.warn('Temporary administrator Firebase app could not be deleted.', error));
            }
        }
    }

    async function register() {
        if (saving) return;
        const form = document.getElementById('schoolRegistrationForm');
        if (!form || !database || !currentUser) {
            setStatus('Registration cannot start.', 'warning', 'Connect the shared database and sign in first.');
            return notify('Connect the shared database and sign in first.', 'danger');
        }
        const invalid = ids.map(id => document.getElementById(id)).find(field => field && !field.value.trim());
        if (invalid) {
            setStep(['schoolName', 'schoolType', 'schoolAddress', 'city', 'state', 'zipCode'].includes(invalid.id) ? 1 : ['principalName', 'principalEmail', 'schoolPhone'].includes(invalid.id) ? 2 : 3);
            invalid.focus();
            setStatus('Registration needs more information.', 'warning', `Complete the highlighted field: ${invalid.id}.`);
            return notify('Complete all required registration fields.', 'warning');
        }
        const invalidConstraint = ids.map(id => document.getElementById(id)).find(field => field && !field.checkValidity());
        if (invalidConstraint) {
            const firstStepFields = ['schoolName', 'schoolType', 'schoolAddress', 'city', 'state', 'zipCode'];
            const secondStepFields = ['principalName', 'principalEmail', 'schoolPhone'];
            setStep(firstStepFields.includes(invalidConstraint.id) ? 1 : secondStepFields.includes(invalidConstraint.id) ? 2 : 3);
            invalidConstraint.reportValidity();
            invalidConstraint.focus();
            return;
        }
        const plan = selectedPlan();
        if (plan && (plan.type === 'topup' || plan.active === false)) {
            setStatus('Registration needs an active main plan.', 'warning', 'Select a main plan in the subscription section before registering.');
            return notify('Select an active main plan.', 'warning');
        }
        saving = true;
        clearStatus();
        button('Preparing registration...', true);
        let stage = 'preparing the registration';
        try {
            const start = new Date();
            const end = plan ? new Date(start) : null;
            if (end) end.setMonth(end.getMonth() + Math.max(1, Number(plan.durationMonths) || 1));
            stage = 'generating a unique school code';
            const code = await reserveCode(value('schoolType'));
            document.getElementById('schoolCode').value = code;
            const selectedTopups = plan ? topups(start, end) : [];
            if (plan?.bonus === true) {
                selectedTopups.push({
                    planId: plan.id,
                    name: `${plan.name} bonus top-up`,
                    studentCapacity: plan.bonusStudentCapacity ?? Number(plan.studentCapacity || 0),
                    teacherCapacity: plan.bonusTeacherCapacity ?? Number(plan.teacherCapacity || 0),
                    price: 0,
                    listPrice: Number(plan.price || 0),
                    currency: plan.currency || 'INR',
                    bonus: true,
                    includedWithPlan: true,
                    startDate: start.toISOString(),
                    endDate: end.toISOString(),
                    assignedAt: start.toISOString()
                });
            }
            const basePlanEnd = end ? new Date(end) : null;
            const termExtensionMonths = selectedTopups.reduce((sum, item) => sum + Number(item.monthsAdded || 0), 0);
            const termExtensionDays = selectedTopups.reduce((sum, item) => sum + Number(item.daysAdded || 0), 0);
            if (termExtensionMonths && end) end.setTime(addCalendarMonths(end, termExtensionMonths).getTime());
            if (termExtensionDays && end) end.setTime(end.getTime() + (termExtensionDays * 86400000));
            selectedTopups.forEach(item => {
                item.startDate = (item.topupKind === 'months' || item.topupKind === 'days') ? basePlanEnd.toISOString() : start.toISOString();
                item.endDate = end.toISOString();
            });
            const image = document.getElementById('schoolAdminPhotoUrl')?.files?.[0];
            const reference = database.ref('schools').push();
            const adminEmail = value('schoolAdminContactEmail').toLowerCase();
            const adminPassword = value('schoolAdminPassword');
            let photoURL = '';
            if (image) {
                stage = 'uploading the administrator image';
                button('Uploading image...', true);
                photoURL = await uploadImage(image, reference.key);
            }
            stage = 'creating the administrator Firebase Authentication account';
            const adminDob = value('schoolAdminDob');
            const administrator = await createAdministratorAccount({
                email: adminEmail,
                password: adminPassword,
                name: value('adminName'),
                username: value('schoolAdminUsername'),
                schoolId: reference.key,
                schoolName: value('schoolName'),
                dob: adminDob
            });
            const subscription = plan ? {
                plan: plan.name,
                planId: plan.id,
                price: (() => {
                    const totals = selectedTopups.reduce((result, item) => {
                        const currency = item.currency || plan.currency || 'INR';
                        result[currency] = Number(result[currency] || 0) + Number(item.price || 0);
                        return result;
                    }, { [plan.currency || 'INR']: Number(plan.price || 0) });
                    return Object.keys(totals).length === 1 ? Object.values(totals)[0] : Number(plan.price || 0);
                })(),
                basePlanPrice: Number(plan.price || 0),
                priceBreakdown: selectedTopups.reduce((totals, item) => {
                    const currency = item.currency || plan.currency || 'INR';
                    totals[currency] = Number(totals[currency] || 0) + Number(item.price || 0);
                    return totals;
                }, { [plan.currency || 'INR']: Number(plan.price || 0) }),
                currency: plan.currency || 'INR',
                durationMonths: Number(plan.durationMonths),
                termExtensionMonths,
                termExtensionDays,
                autoRenew: plan.autoRenew === true,
                studentCapacity: Number(plan.studentCapacity || 0),
                teacherCapacity: Number(plan.teacherCapacity || 0),
                topups: selectedTopups,
                status: 'active',
                startDate: start.toISOString(),
                endDate: end.toISOString()
            } : {
                plan: '',
                planId: '',
                price: 0,
                basePlanPrice: 0,
                priceBreakdown: {},
                currency: '',
                durationMonths: 0,
                termExtensionMonths: 0,
                termExtensionDays: 0,
                autoRenew: false,
                studentCapacity: 0,
                teacherCapacity: 0,
                topups: [],
                status: 'inactive',
                startDate: '',
                endDate: ''
            };
            const school = {
                schoolId: reference.key, name: value('schoolName'), code, type: value('schoolType'), institutionType: value('schoolType').toLowerCase(),
                establishedYear: value('establishedYear'),
                address: { complete: value('schoolAddress'), city: value('city'), state: value('state'), zipCode: value('zipCode') },
                contacts: { principal: { name: value('principalName'), email: value('principalEmail') }, admin: { uid: administrator.uid, name: value('adminName'), username: value('schoolAdminUsername'), email: adminEmail, dob: adminDob, dateOfBirth: adminDob, photoURL }, phone: value('schoolPhone'), alternatePhone: value('alternatePhone') },
                details: { capacity: Number(value('studentCapacity')) || 0, currentStudents: Number(value('currentStudents')) || 0, teacherCount: Number(value('teacherCount')) || 0, accreditation: value('accreditation'), website: value('website') },
                facilities: { library: document.getElementById('hasLibrary')?.checked === true, computerLab: document.getElementById('hasLab')?.checked === true, sports: document.getElementById('hasSports')?.checked === true, transportation: document.getElementById('hasTransport')?.checked === true },
                subscription,
                status: 'Active', ownerId: currentUser.uid, registrationDate: start.toISOString(), lastUpdated: start.toISOString()
            };
            stage = 'saving the school and administrator records';
            button('Saving registration...', true);
            await database.ref().update({
                [`schools/${reference.key}`]: school,
                [`schoolAdmins/${reference.key}`]: { ...school.contacts.admin, authUid: administrator.uid, password: adminPassword, dob: adminDob, dateOfBirth: adminDob, schoolId: reference.key, institutionType: value('schoolType').toLowerCase(), createdAt: start.toISOString() },
                [`users/${administrator.uid}`]: { ...administrator.profile, profilePhoto: photoURL || null },
                [`publicSchools/${reference.key}`]: { name: school.name, code: school.code, type: school.type, institutionType: school.institutionType, status: 'Active', subscriptionEndDate: end?.toISOString() || '', updatedAt: Date.now() }
            });
            stage = 'saving the owner school record';
            await ownerAuth.database().ref(`owners/${currentUser.uid}/schools/${reference.key}`).set(school);
            const administratorPassword = adminPassword;
            form.reset();
            clearDraft();
            setStep(1);
            button('', false);
            clearStatus();
            saving = false;
            const emailStatus = showCredentials(school, administratorPassword);
            try {
                await emailAdministratorCredentials(reference.key, administrator.uid);
                if (emailStatus) {
                    emailStatus.className = 'small text-success mb-0';
                    emailStatus.textContent = `Credentials email sent to ${adminEmail}.`;
                }
                notify(`Registered ${school.name}; the administrator credentials were emailed to ${adminEmail}.`, 'success');
            } catch (emailError) {
                if (emailStatus) {
                    emailStatus.className = 'small text-danger mb-0';
                    emailStatus.textContent = `Registration succeeded, but the credentials email failed: ${emailError.message}`;
                }
                console.error('School registration succeeded, but administrator credentials email failed.', emailError);
                notify(`Registered ${school.name}, but the administrator credentials email failed. ${emailError.message}`, 'warning');
            }
            if (typeof refreshSchoolData === 'function') await refreshSchoolData();
        } catch (error) {
            saving = false;
            button('', false);
            const detail = errorDetails(error);
            setStatus(`Registration failed while ${stage}.`, 'danger', detail);
            console.error('Owner registration failed', { stage, code: error?.code || null, message: error?.message || String(error) });
            notify(`Registration failed while ${stage}. ${detail}`, 'danger');
        }
    }

    function install() {
        const form = document.getElementById('schoolRegistrationForm');
        if (form) form.noValidate = true;
        form?.addEventListener('submit', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (step < 3) advance();
            else register();
        }, true);
        form?.addEventListener('input', saveDraft);
        form?.addEventListener('change', saveDraft);
        document.getElementById('schoolType')?.addEventListener('change', () => {
            if (typeof window.renderSchoolPlanOptions === 'function') {
                window.renderSchoolPlanOptions();
            }
        });
        document.getElementById('registerSchoolBtn')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            register();
        }, true);
        document.getElementById('generateSchoolCodeBtn')?.addEventListener('click', async event => {
            event.preventDefault();
            const field = document.getElementById('schoolCode');
            try {
                if (!database) throw new Error('Connect the database first.');
                field.value = await reserveCode(value('schoolType'));
            } catch (error) {
                notify(error.message, 'warning');
            }
        }, true);
        window.goToRegistration = () => { switchSection('registration'); setStep(1); };
        window.nextRegistrationStep = advance;
        window.prevRegistrationStep = () => setStep(step - 1);
        window.resetRegistrationForm = reset;
        window.completeRegistration = register;
        setStep(1, false);
        restoreDraft();
        window.setTimeout(restoreDraft, 500);
    }
    document.addEventListener('DOMContentLoaded', install);
})();
