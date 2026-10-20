(function () {
    const SECTION_ID = 'manage-teachers-section-active';
    let activeRoot = null;
    let activeSchoolId = null;
    let teachers = [];

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function hasClassTeacherRole(teacher) {
        const roles = Array.isArray(teacher.roles)
            ? teacher.roles
            : (teacher.roles && typeof teacher.roles === 'object' ? Object.keys(teacher.roles).filter(role => teacher.roles[role]) : []);
        return teacher.teacherType === 'classTeacher' || teacher.classTeacherEnabled === true || roles.includes('classTeacher');
    }

    function status(message, kind = 'info') {
        const output = activeRoot?.querySelector('#mtStatus');
        if (!output) return;
        output.textContent = message;
        output.className = `mt-3 mb-0 text-${kind === 'error' ? 'danger' : kind === 'success' ? 'success' : 'muted'}`;
    }

    function previewProfilePhoto() {
        const input = activeRoot?.querySelector('#mtProfilePhoto');
        const preview = activeRoot?.querySelector('#mtPhotoPreview');
        const file = input?.files?.[0];
        if (!preview) return;
        if (!file) {
            preview.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';
            return;
        }
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            input.value = '';
            preview.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';
            status('Choose an image file smaller than 2 MB.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const image = document.createElement('img');
            image.src = String(reader.result || '');
            image.alt = 'Selected teacher profile photo';
            preview.replaceChildren(image);
            status('Profile picture selected. It will upload to R2 when you create the account.');
        };
        reader.onerror = () => {
            input.value = '';
            status('Could not read the selected image. Please choose it again.', 'error');
        };
        reader.readAsDataURL(file);
    }

    async function compressProfilePhoto(file) {
        if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            throw new Error('Choose a valid image smaller than 2 MB.');
        }
        const objectUrl = URL.createObjectURL(file);
        let image;
        try {
            image = await new Promise((resolve, reject) => {
                const element = new Image();
                element.onload = () => resolve(element);
                element.onerror = () => reject(new Error('The selected profile picture could not be decoded.'));
                element.src = objectUrl;
            });
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
        const scale = Math.min(1, 640 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Could not prepare the profile picture for upload.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
        if (webp) return webp;
        const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        return jpeg || file;
    }

    async function uploadTeacherProfilePhoto(file, userId) {
        return window.RollCallProfileUpload.upload(await compressProfilePhoto(file), firebase.auth().currentUser);
    }

    async function getAdminContext() {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('Your administrator session has expired. Sign in again.');
        const snapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
        const profile = snapshot.val() || {};
        if (String(profile.role || '').toLowerCase() !== 'admin') throw new Error('Administrator access is required.');
        const schoolId = String(profile.schoolId || user.uid).trim();
        if (!schoolId) throw new Error('Your administrator account is not linked to a school.');
        return { user, profile, schoolId };
    }

    function renderDirectory() {
        const directory = activeRoot?.querySelector('#mtDirectory');
        if (!directory) return;
        const search = String(activeRoot.querySelector('#mtSearch')?.value || '').trim().toLowerCase();
        const filtered = teachers.filter(teacher => `${teacher.name || ''} ${teacher.email || ''}`.toLowerCase().includes(search));
        const count = activeRoot.querySelector('#mtTeacherCount');
        if (count) count.textContent = String(teachers.length);
        if (!filtered.length) {
            directory.innerHTML = `<div class="alert alert-light">${search ? 'No teachers match your search.' : 'No teacher accounts are linked to this school yet.'}</div>`;
            return;
        }

        directory.innerHTML = `
            <div class="mt-table-wrap">
                <table class="mt-table">
                    <thead><tr><th>Teacher</th><th>Account role</th><th>Account actions</th></tr></thead>
                    <tbody>${filtered.map(teacher => `
                        <tr data-teacher-id="${escapeHtml(teacher.id)}">
                            <td><div class="mt-person">${escapeHtml(teacher.name || 'Unnamed teacher')}</div><div class="mt-email">${escapeHtml(teacher.email || 'No email on profile')}</div></td>
                            <td><span class="mt-role-badge">${hasClassTeacherRole(teacher) ? 'Class Teacher' : 'Teacher'}</span></td>
                            <td><div class="mt-actions"><button type="button" class="btn btn-sm btn-outline-secondary mt-reset-password">Send password reset</button></div></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        filtered.forEach(teacher => {
            const row = directory.querySelector(`tr[data-teacher-id="${CSS.escape(teacher.id)}"]`);
            row.querySelector('.mt-reset-password').addEventListener('click', () => sendPasswordReset(teacher));
        });
    }

    async function loadTeachers() {
        const directory = activeRoot?.querySelector('#mtDirectory');
        if (!directory) return;
        directory.innerHTML = '<p class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading teachers...</p>';
        try {
            const context = await getAdminContext();
            activeSchoolId = context.schoolId;
            const snapshot = await firebase.database().ref('users').orderByChild('role').equalTo('teacher').once('value');
            teachers = [];
            snapshot.forEach(child => {
                const teacher = child.val() || {};
                if (String(teacher.schoolId || '').trim() === activeSchoolId) {
                    teachers.push({ ...teacher, id: child.key });
                }
            });
            teachers.sort((left, right) => String(left.name || left.email || '').localeCompare(String(right.name || right.email || '')));
            renderDirectory();
            status('');
        } catch (error) {
            console.error('Could not load school teachers:', error);
            directory.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Could not load teachers.')}</div>`;
            status(error.message || 'Could not load teachers.', 'error');
        }
    }

    async function createTeacher(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const name = activeRoot.querySelector('#mtName').value.trim();
        const email = activeRoot.querySelector('#mtEmail').value.trim().toLowerCase();
        const phone = activeRoot.querySelector('#mtPhone').value.trim();
        const designation = activeRoot.querySelector('#mtDesignation').value.trim();
        const subjectsTaught = activeRoot.querySelector('#mtSubjects').value.split(',').map(subject => subject.trim()).filter(Boolean);
        const password = activeRoot.querySelector('#mtPassword').value;
        const profilePhotoFile = activeRoot.querySelector('#mtProfilePhoto').files?.[0] || null;
        const button = activeRoot.querySelector('#mtCreateButton');
        if (!name || !email || !phone || !designation || !subjectsTaught.length || password.length < 8 || !profilePhotoFile) {
            return status('Complete all required teacher details, select a profile picture, and use a password with at least 8 characters.', 'error');
        }
        if (!profilePhotoFile.type.startsWith('image/') || profilePhotoFile.size > 2 * 1024 * 1024) {
            return status('Choose a valid profile picture smaller than 2 MB.', 'error');
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        let temporaryApp = null;
        let createdUser = null;
        try {
            const context = await getAdminContext();
            activeSchoolId = context.schoolId;
            const database = firebase.database();

            const appName = `adminTeacher-${activeSchoolId}-${Date.now()}`;
            temporaryApp = firebase.initializeApp(firebase.app().options, appName);
            const credential = await temporaryApp.auth().createUserWithEmailAndPassword(email, password);
            createdUser = credential.user;
            button.innerHTML = '<i class="fas fa-cloud-upload-alt fa-spin"></i> Uploading profile picture...';
            const uploadedPhoto = await uploadTeacherProfilePhoto(profilePhotoFile, createdUser.uid);
            await createdUser.updateProfile({ displayName: name, photoURL: uploadedPhoto.publicUrl });
            const profile = {
                uid: createdUser.uid,
                name,
                username: email.split('@')[0],
                email: createdUser.email || email,
                phone,
                designation,
                subjectsTaught,
                profilePhoto: uploadedPhoto.publicUrl,
                profilePhotoKey: uploadedPhoto.key,
                profilePhotoUpdatedAt: Date.now(),
                role: 'teacher',
                schoolId: activeSchoolId,
                schoolName: context.profile.schoolName || context.profile.school?.name || '',
                createdAt: new Date().toISOString(),
                createdBy: context.user.uid
            };
            await database.ref(`users/${createdUser.uid}`).set(profile);
            form.reset();
            activeRoot.querySelector('#mtPhotoPreview').innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';
            await loadTeachers();
            status(`Teacher account created for ${name} with the Teacher role and profile details. Share the temporary password securely.`, 'success');
        } catch (error) {
            console.error('Could not create teacher account:', error);
            if (createdUser) {
                try { await createdUser.delete(); }
                catch (cleanupError) { console.error('Could not remove the unlinked teacher account:', cleanupError); }
            }
            status(error.message || 'Could not create the teacher account.', 'error');
        } finally {
            if (temporaryApp) {
                await temporaryApp.auth().signOut().catch(error => console.warn('Temporary teacher session could not be signed out.', error));
                await temporaryApp.delete().catch(error => console.warn('Temporary teacher app could not be deleted.', error));
            }
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-user-plus"></i> Create teacher account';
        }
    }

    async function sendPasswordReset(teacher) {
        try {
            const context = await getAdminContext();
            if (String(teacher.schoolId || '').trim() !== context.schoolId) throw new Error('You can manage only teachers assigned to your school.');
            if (!teacher.email) throw new Error('This teacher account has no email address for password recovery.');
            await window.RollCallPasswordReset.send(teacher.email, {
                user: context.user,
                targetUid: teacher.uid || teacher.id
            });
            status('If an account exists for that email, password reset instructions will be sent.', 'success');
        } catch (error) {
            console.error('Could not send teacher password reset email:', error);
            status(error.message || 'Could not send the password reset email.', 'error');
        }
    }

    function mount(root) {
        activeRoot = root || document.getElementById(SECTION_ID);
        if (!activeRoot || activeRoot.dataset.teacherManagerMounted === 'true') return;
        activeRoot.dataset.teacherManagerMounted = 'true';
        activeRoot.querySelector('#mtCreateForm')?.addEventListener('submit', createTeacher);
        activeRoot.querySelector('#mtProfilePhoto')?.addEventListener('change', previewProfilePhoto);
        activeRoot.querySelector('#mtRefresh')?.addEventListener('click', loadTeachers);
        activeRoot.querySelector('#mtSearch')?.addEventListener('input', renderDirectory);
        loadTeachers();
    }

    window.AdminPanelAPI?.register('manage-teachers', mount, { contentSized: true });
})();
