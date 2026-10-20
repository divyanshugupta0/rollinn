document.addEventListener('DOMContentLoaded', () => {
    const auth = window.firebase?.auth?.();
    const database = window.firebase?.database?.();
    const form = document.getElementById('profileSettingsForm');
    const card = form?.closest('.teacher-setting-card');
    if (!auth || !database || !form || !card) return;

    const fields = ['settingsName', 'settingsPhone', 'settingsDesignation', 'settingsSubjects']
        .map(id => document.getElementById(id)).filter(Boolean);
    const photoInput = document.getElementById('settingsProfilePic');
    const photoPreview = document.getElementById('profilePicPreview');
    const email = document.getElementById('settingsEmail');
    const alertBox = document.getElementById('settingsAlert');
    const submit = form.querySelector('[type="submit"]');
    const heading = card.querySelector('h2');
    let user = null;
    let profile = {};
    let editing = false;

    const message = (text, type = 'success') => {
        if (!alertBox) return;
        alertBox.textContent = text;
        alertBox.className = `alert alert-${type}`;
        alertBox.style.display = 'block';
        window.setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
    };
    const showPhoto = value => {
        if (!photoPreview) return;
        photoPreview.replaceChildren();
        if (!value) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-user teacher-photo-empty';
            icon.setAttribute('aria-hidden', 'true');
            photoPreview.append(icon);
            return;
        }
        const image = document.createElement('img');
        image.src = value;
        image.alt = 'Teacher profile photo';
        photoPreview.append(image);
    };
    const populate = () => {
        document.getElementById('settingsName').value = profile.name || user?.displayName || '';
        document.getElementById('settingsPhone').value = profile.phone || profile.mobile || '';
        document.getElementById('settingsDesignation').value = profile.designation || '';
        const subjects = profile.subjectsTaught ?? profile.subjects ?? '';
        document.getElementById('settingsSubjects').value = Array.isArray(subjects) ? subjects.join(', ') : String(subjects || '');
        if (email) email.value = profile.email || user?.email || '';
        showPhoto(profile.profilePhoto || profile.photoURL || profile.profilePic || '');
    };
    const mode = enabled => {
        editing = enabled;
        fields.forEach(field => {
            field.readOnly = !enabled;
            field.setAttribute('aria-readonly', String(!enabled));
        });
        if (photoInput) photoInput.disabled = !enabled;
        edit.hidden = enabled;
        cancel.hidden = !enabled;
        if (submit) submit.hidden = !enabled;
        form.classList.toggle('is-editing', enabled);
    };

    const actions = document.createElement('div');
    actions.className = 'teacher-profile-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'teacher-profile-edit';
    edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i> Edit details';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'teacher-profile-cancel';
    cancel.textContent = 'Cancel';
    cancel.hidden = true;
    actions.append(edit, cancel);
    heading?.append(actions);
    if (submit) {
        submit.hidden = true;
        submit.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Save changes';
    }
    if (email) email.readOnly = true;
    mode(false);

    const accessCard = document.createElement('section');
    accessCard.className = 'teacher-setting-card teacher-school-access-card';
    accessCard.innerHTML = '<h2><i class="fas fa-shield-alt" aria-hidden="true"></i> School &amp; access</h2><div class="teacher-access-grid"></div><p class="teacher-access-note">School membership and assigned sections are managed by your school administrator.</p>';
    document.querySelector('#settingsSection .teacher-settings-grid')?.append(accessCard);
    const renderAccess = () => {
        const sectionList = Array.isArray(profile.assignedSections)
            ? profile.assignedSections.join(', ')
            : (profile.assignedSections && typeof profile.assignedSections === 'object'
                ? Object.keys(profile.assignedSections).filter(key => profile.assignedSections[key]).join(', ')
                : 'Managed by administrator');
        const rows = [
            ['Account role', 'Teacher'],
            ['School', profile.schoolName || profile.school || (profile.schoolId ? 'School account' : 'Not assigned')],
            ['Assigned sections', sectionList || 'Managed by administrator']
        ];
        const grid = accessCard.querySelector('.teacher-access-grid');
        grid.replaceChildren();
        rows.forEach(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'teacher-access-item';
            const caption = document.createElement('span');
            caption.textContent = label;
            const detail = document.createElement('strong');
            detail.textContent = value;
            item.append(caption, detail);
            grid.append(item);
        });
    };
    const compressProfilePhoto = async file => {
        if (!file || file.size > 2 * 1024 * 1024) throw new Error('Choose an image smaller than 2 MB.');
        const image = await new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const element = new Image();
            element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
            element.onerror = error => { URL.revokeObjectURL(objectUrl); reject(error); };
            element.src = objectUrl;
        });
        const scale = Math.min(1, 640 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d', { alpha: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8)) || file;
    };
    const uploadProfilePhoto = async file => {
        return window.RollCallProfileUpload.upload(await compressProfilePhoto(file), user);
    };

    edit.addEventListener('click', () => mode(true));
    cancel.addEventListener('click', () => { populate(); if (photoInput) photoInput.value = ''; mode(false); });
    photoInput?.addEventListener('change', () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            message('Choose an image file up to 2 MB.', 'error');
            photoInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => showPhoto(String(reader.result || ''));
        reader.readAsDataURL(file);
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!editing || !user) return;
        const name = document.getElementById('settingsName').value.trim();
        if (!name) { message('Enter your full name before saving.', 'error'); return; }
        const selectedPhoto = photoInput?.files?.[0] || null;
        let uploadedPhoto = null;
        if (selectedPhoto) {
            if (submit) submit.disabled = true;
            if (submit) submit.innerHTML = '<i class="fas fa-cloud-upload-alt fa-spin"></i> Uploading photo…';
            try { uploadedPhoto = await uploadProfilePhoto(selectedPhoto); }
            catch (error) {
                if (submit) { submit.disabled = false; submit.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Save changes'; }
                message(error.message || 'Unable to upload the profile photo.', 'error');
                return;
            }
        }
        const profilePhoto = uploadedPhoto?.publicUrl || profile.profilePhoto || profile.photoURL || profile.profilePic || '';
        const profilePhotoKey = uploadedPhoto ? uploadedPhoto.key : (profile.profilePhotoKey || null);
        const updates = {
            name,
            phone: document.getElementById('settingsPhone').value.trim(),
            designation: document.getElementById('settingsDesignation').value.trim(),
            subjectsTaught: document.getElementById('settingsSubjects').value.split(',').map(value => value.trim()).filter(Boolean),
            profilePhoto,
            profilePhotoKey,
            profilePhotoUpdatedAt: uploadedPhoto ? Date.now() : (profile.profilePhotoUpdatedAt || null),
            profileUpdatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
        try {
            await database.ref(`users/${user.uid}`).update(updates);
            if (user.updateProfile) await user.updateProfile({ displayName: name, photoURL: profilePhoto || null });
            profile = { ...profile, ...updates };
            populate();
            if (photoInput) photoInput.value = '';
            document.querySelectorAll('#teacherInfo,#attendanceTeacherInfo,#classesTeacherInfo,#reportsTeacherInfo,#settingsTeacherInfo').forEach(element => {
                const icon = document.createElement('i');
                icon.className = 'fas fa-user-tie';
                element.replaceChildren(icon, document.createTextNode(` Teacher: ${name}`));
            });
            const sidebarName = document.getElementById('sidebarUserName');
            if (sidebarName) sidebarName.textContent = name;
            mode(false);
            message('Your profile details have been saved.');
        } catch (error) {
            console.error('Could not save teacher details:', error);
            message(error.message || 'Unable to save your details. Please try again.', 'error');
        } finally {
            if (submit) { submit.disabled = false; submit.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Save changes'; }
        }
    });

    auth.onAuthStateChanged(async signedInUser => {
        user = signedInUser;
        if (!user) { profile = {}; populate(); renderAccess(); mode(false); return; }
        try {
            const snapshot = await database.ref(`users/${user.uid}`).once('value');
            const loaded = snapshot.val() || {};
            if (loaded.role !== 'teacher') return;
            profile = loaded;
            populate();
            renderAccess();
            mode(false);
        } catch (error) {
            console.error('Could not load teacher details:', error);
            message('Could not load your account details. Refresh and try again.', 'error');
        }
    });

    const notifications = ['emailNotifications', 'attendanceReminders', 'reportNotifications', 'systemUpdates'];
    const notificationForm = document.getElementById('notificationSettingsForm');
    const appearanceForm = document.getElementById('appearanceSettingsForm');
    const applyAppearance = preferences => {
        const appearance = preferences.appearance || {};
        document.body.classList.toggle('teacher-theme-dark', appearance.theme === 'dark');
        document.body.classList.remove('teacher-font-small', 'teacher-font-large');
        if (appearance.fontSize === 'small') document.body.classList.add('teacher-font-small');
        if (appearance.fontSize === 'large') document.body.classList.add('teacher-font-large');
    };
    notificationForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!user) return;
        const value = Object.fromEntries(notifications.map(id => [id, Boolean(document.getElementById(id)?.checked)]));
        try {
            await database.ref(`users/${user.uid}/teacherSettings/notifications`).set(value);
            message('Notification preferences saved.');
        } catch (error) {
            message(error.message || 'Unable to save notification preferences.', 'error');
        }
    });
    appearanceForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!user) return;
        const appearance = {
            theme: document.getElementById('themeSelect')?.value || 'light',
            fontSize: document.getElementById('fontSizeSelect')?.value || 'medium'
        };
        try {
            await database.ref(`users/${user.uid}/teacherSettings/appearance`).set(appearance);
            applyAppearance({ appearance });
            message('Appearance preferences saved.');
        } catch (error) {
            message(error.message || 'Unable to save appearance preferences.', 'error');
        }
    });
    const settingsReference = user => database.ref(`users/${user.uid}/teacherSettings`);
    const loadPreferences = async signedInUser => {
        if (!signedInUser) return;
        try {
            const snapshot = await settingsReference(signedInUser).once('value');
            const preferences = snapshot.val() || {};
            notifications.forEach(id => {
                if (preferences.notifications?.[id] !== undefined) document.getElementById(id).checked = Boolean(preferences.notifications[id]);
            });
            if (preferences.appearance?.theme) document.getElementById('themeSelect').value = preferences.appearance.theme;
            if (preferences.appearance?.fontSize) document.getElementById('fontSizeSelect').value = preferences.appearance.fontSize;
            applyAppearance(preferences);
        } catch (error) {
            console.error('Could not load teacher preferences:', error);
        }
    };
    auth.onAuthStateChanged(loadPreferences);

    document.getElementById('changePasswordForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const oldPassword = document.getElementById('currentPassword')?.value || '';
        const newPassword = document.getElementById('newPassword')?.value || '';
        const confirmPassword = document.getElementById('confirmPassword')?.value || '';
        if (!user) return;
        if (newPassword.length < 8) { message('Use at least 8 characters for the new password.', 'error'); return; }
        if (newPassword !== confirmPassword) { message('The new password and confirmation do not match.', 'error'); return; }
        try {
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword);
            await user.reauthenticateWithCredential(credential);
            await user.updatePassword(newPassword);
            event.currentTarget.reset();
            message('Your password has been updated.');
        } catch (error) {
            console.error('Could not change teacher password:', error);
            message(error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' ? 'The current password is incorrect.' : (error.message || 'Unable to update your password.'), 'error');
        }
    });
});

const teacherSettingsStyle = document.createElement('style');
teacherSettingsStyle.textContent = `
body.teacher-authenticated #settingsSection { width:100%;max-width:none;min-height:calc(100vh - 36px); }
body.teacher-authenticated #settingsSection .settings-form { background:transparent;border:0;box-shadow:none;padding:20px 0 32px; }
body.teacher-authenticated #settingsSection .teacher-settings-grid { grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch; }
body.teacher-authenticated #settingsSection .teacher-setting-card { padding:22px; }
body.teacher-authenticated #settingsSection .teacher-setting-card h2 { min-height:38px; }
body.teacher-authenticated #settingsSection .teacher-profile-actions { display:flex;gap:8px;margin-left:auto; }
body.teacher-authenticated #settingsSection .teacher-profile-edit,body.teacher-authenticated #settingsSection .teacher-profile-cancel { display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:0 12px;border:1px solid #d6e5d9;border-radius:9px;background:#fff;color:#176b4d;font-size:12px;font-weight:700;cursor:pointer; }
body.teacher-authenticated #settingsSection .teacher-profile-edit:hover,body.teacher-authenticated #settingsSection .teacher-profile-cancel:hover { background:#eef7f0;border-color:#a9cfb3; }
body.teacher-authenticated #settingsSection .teacher-setting-card input:not([type=checkbox]):not([type=file]),body.teacher-authenticated #settingsSection .teacher-setting-card select { width:100%;min-width:0; }
body.teacher-authenticated #settingsSection #profileSettingsForm input[readonly],body.teacher-authenticated #settingsSection #profileSettingsForm input:disabled { border-color:#e5ece6;background:#f6f9f6;color:#35463a;cursor:default; }
body.teacher-authenticated #settingsSection #profileSettingsForm.is-editing input:not([type=file]) { background:#fff;border-color:#b9d8c2; }
body.teacher-authenticated #settingsSection #profileSettingsForm .form-group:has(#settingsProfilePic) { grid-column:1/-1;display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px; }
body.teacher-authenticated #settingsSection .image-preview { width:72px;height:72px;margin:0;background:#f0f6f1; }
body.teacher-authenticated #settingsSection .teacher-photo-empty { color:#91a99a;font-size:24px; }
body.teacher-authenticated #settingsSection .teacher-school-access-card { grid-column:1/-1; }
body.teacher-authenticated #settingsSection .teacher-access-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px; }
body.teacher-authenticated #settingsSection .teacher-access-item { min-width:0;padding:14px;border:1px solid #e6eee7;border-radius:12px;background:#f8fbf8; }
body.teacher-authenticated #settingsSection .teacher-access-item span { display:block;margin-bottom:7px;color:#718078;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em; }
body.teacher-authenticated #settingsSection .teacher-access-item strong { display:block;color:#253a2d;font-size:14px;overflow-wrap:anywhere; }
body.teacher-authenticated #settingsSection .teacher-access-note { margin:14px 0 0;color:#718078;font-size:12px; }
body.teacher-authenticated #settingsSection .teacher-setting-card [hidden] { display:none!important; }
body.teacher-authenticated.teacher-theme-dark { background:#15221a;color:#e6eee8; }
body.teacher-authenticated.teacher-theme-dark .section-container,body.teacher-authenticated.teacher-theme-dark #settingsSection .teacher-setting-card { background:#1d2d23;color:#e6eee8;border-color:#354b3a; }
body.teacher-authenticated.teacher-theme-dark #settingsSection .teacher-setting-card h2,body.teacher-authenticated.teacher-theme-dark #settingsSection .teacher-access-item strong { color:#e6eee8; }
body.teacher-authenticated.teacher-theme-dark #settingsSection .teacher-access-item,body.teacher-authenticated.teacher-theme-dark #settingsSection input[readonly] { background:#24372a;color:#dce8de;border-color:#405745; }
body.teacher-authenticated.teacher-font-small { font-size:14px; }
body.teacher-authenticated.teacher-font-large { font-size:18px; }
@media(max-width:760px) { body.teacher-authenticated #settingsSection .teacher-settings-grid { grid-template-columns:1fr; } body.teacher-authenticated #settingsSection .teacher-school-access-card { grid-column:auto; } body.teacher-authenticated #settingsSection .teacher-access-grid { grid-template-columns:1fr; } body.teacher-authenticated #settingsSection .teacher-setting-card { padding:16px; } body.teacher-authenticated #settingsSection .teacher-setting-card h2 { font-size:15px; } }
`;
teacherSettingsStyle.id = 'teacher-settings-profile-styles';
document.head.append(teacherSettingsStyle);
