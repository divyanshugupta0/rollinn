(function () {
    const SECTION_ID = 'manage-teachers-section-active';
    let activeRoot = null;
    let activeSchoolId = null;
    let teachers = [];
    let teacherActionMenu = null;
    let activeActionTrigger = null;
    const pendingPasswordResets = new Set();
    let deletingTeacher = false;
    let teacherPendingDeletion = null;

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

    function teacherSubjects(teacher) {
        const subjects = Array.isArray(teacher.subjectsTaught)
            ? teacher.subjectsTaught
            : String(teacher.subjectsTaught || '').split(',');
        return subjects.map(subject => String(subject).trim()).filter(Boolean);
    }

    function formatCreatedDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? '—'
            : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    }

    function profilePhotoUrl(teacher) {
        const value = String(teacher.profilePhoto || teacher.photoURL || '').trim();
        if (!value) return '';
        try {
            const url = new URL(value, window.location.href);
            return url.protocol === 'https:' ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function renderTeacherPhoto(teacher) {
        const photoUrl = profilePhotoUrl(teacher);
        return photoUrl
            ? `<button type="button" class="mt-photo-trigger" data-photo-url="${escapeHtml(photoUrl)}" data-photo-key="${escapeHtml(teacher.profilePhotoKey || photoUrl)}" aria-label="View ${escapeHtml(teacher.name || 'teacher')} profile photo" title="View profile photo"><img class="mt-avatar" src="${escapeHtml(photoUrl)}" alt="" loading="lazy"></button>`
            : '<span class="mt-avatar mt-avatar-fallback" aria-hidden="true"><i class="fas fa-user"></i></span>';
    }

    function closeTeacherActionMenu(restoreFocus = false) {
        if (!teacherActionMenu || teacherActionMenu.hidden) return;
        teacherActionMenu.hidden = true;
        teacherActionMenu.removeAttribute('data-teacher-id');
        activeActionTrigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) activeActionTrigger?.focus();
        activeActionTrigger = null;
    }

    function positionTeacherActionMenu(trigger) {
        const rect = trigger.getBoundingClientRect();
        const menuRect = teacherActionMenu.getBoundingClientRect();
        const margin = 8;
        const gap = 6;
        const left = Math.max(
            margin,
            Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - margin)
        );
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow >= menuRect.height + gap || rect.top < menuRect.height + gap
            ? Math.min(rect.bottom + gap, window.innerHeight - menuRect.height - margin)
            : rect.top - menuRect.height - gap;
        teacherActionMenu.style.left = `${left}px`;
        teacherActionMenu.style.top = `${Math.max(margin, top)}px`;
    }

    function openTeacherActionMenu(trigger) {
        if (!teacherActionMenu || trigger.disabled || pendingPasswordResets.size || deletingTeacher) return;
        if (activeActionTrigger === trigger && !teacherActionMenu.hidden) {
            closeTeacherActionMenu();
            return;
        }
        closeTeacherActionMenu();
        activeActionTrigger = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        teacherActionMenu.dataset.teacherId = trigger.closest('tr[data-teacher-id]')?.dataset.teacherId || '';
        teacherActionMenu.hidden = false;
        positionTeacherActionMenu(trigger);
        teacherActionMenu.querySelector('button')?.focus({ preventScroll: true });
    }

    function createTeacherActionMenu() {
        teacherActionMenu = document.createElement('div');
        teacherActionMenu.id = 'mtTeacherActionMenu';
        teacherActionMenu.className = 'mt-floating-action-menu';
        teacherActionMenu.setAttribute('role', 'menu');
        teacherActionMenu.setAttribute('aria-label', 'Teacher actions');
        teacherActionMenu.hidden = true;
        teacherActionMenu.innerHTML = `
            <button type="button" role="menuitem" data-action="password-reset">
                <i class="fas fa-key" aria-hidden="true"></i>
                <span>Send password reset link</span>
            </button>
            <button type="button" class="mt-menu-delete" role="menuitem" data-action="delete-teacher">
                <i class="fas fa-trash-alt" aria-hidden="true"></i>
                <span>Delete teacher</span>
            </button>`;
        teacherActionMenu.addEventListener('click', handleTeacherActionMenuClick);
        teacherActionMenu.addEventListener('keydown', event => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                teacherActionMenu.querySelector('[role="menuitem"]')?.focus();
            }
        });
        document.body.appendChild(teacherActionMenu);
    }

    function handleTeacherActionMenuClick(event) {
        const photoTrigger = event.target.closest('.mt-photo-trigger');
        if (photoTrigger) {
            event.preventDefault();
            const photoUrl = photoTrigger.dataset.photoUrl;
            if (typeof window.showProfilePhotoPreview === 'function') {
                window.showProfilePhotoPreview(
                    photoUrl,
                    photoTrigger.dataset.photoKey || photoUrl,
                    'Teacher profile photo'
                );
            } else if (photoUrl) {
                window.open(photoUrl, '_blank', 'noopener,noreferrer');
            }
            return;
        }
        if (event.target.closest('.mt-action-trigger')) {
            event.preventDefault();
            openTeacherActionMenu(event.target.closest('.mt-action-trigger'));
            return;
        }
        if (teacherActionMenu?.contains(event.target)) {
            const teacher = teachers.find(item => item.id === teacherActionMenu.dataset.teacherId);
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (teacher && action === 'delete-teacher') {
                closeTeacherActionMenu(true);
                openTeacherDeleteDialog(teacher);
            } else if (teacher && action === 'password-reset') {
                sendPasswordReset(teacher, event.target.closest('[data-action]'));
            }
            return;
        }
        if (!teacherActionMenu?.hidden && !teacherActionMenu.contains(event.target)) {
            closeTeacherActionMenu();
        }
    }

    function status(message, kind = 'info') {
        const createDialog = activeRoot?.querySelector('#mtCreateDialog');
        const output = createDialog?.open
            ? createDialog.querySelector('#mtCreateStatus')
            : activeRoot?.querySelector('#mtStatus');
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
        closeTeacherActionMenu();
        const search = String(activeRoot.querySelector('#mtSearch')?.value || '').trim().toLowerCase();
        const filtered = teachers.filter(teacher => [
            teacher.name,
            teacher.email,
            teacher.phone || teacher.mobile,
            teacher.designation,
            ...teacherSubjects(teacher)
        ].join(' ').toLowerCase().includes(search));
        const count = activeRoot.querySelector('#mtTeacherCount');
        if (count) count.textContent = String(teachers.length);
        if (!filtered.length) {
            directory.innerHTML = `<div class="alert alert-light">${search ? 'No teachers match your search.' : 'No teacher accounts are linked to this school yet.'}</div>`;
            return;
        }

        directory.innerHTML = `
            <div class="mt-table-wrap">
                <table class="mt-table">
                    <thead><tr>
                        <th scope="col">Teacher</th>
                        <th scope="col">Email</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Designation</th>
                        <th scope="col">Subjects taught</th>
                        <th scope="col">Account role</th>
                        <th scope="col">Added</th>
                        <th scope="col"><span class="visually-hidden">Actions</span></th>
                    </tr></thead>
                    <tbody>${filtered.map(teacher => `
                        <tr data-teacher-id="${escapeHtml(teacher.id)}">
                            <td><div class="mt-teacher-cell">${renderTeacherPhoto(teacher)}<span class="mt-person">${escapeHtml(teacher.name || 'Unnamed teacher')}</span></div></td>
                            <td class="mt-email-cell">${escapeHtml(teacher.email || '—')}</td>
                            <td>${escapeHtml(teacher.phone || teacher.mobile || '—')}</td>
                            <td>${escapeHtml(teacher.designation || '—')}</td>
                            <td>${teacherSubjects(teacher).length
                                ? teacherSubjects(teacher).map(subject => `<span class="mt-subject">${escapeHtml(subject)}</span>`).join(' ')
                                : '—'}</td>
                            <td><span class="mt-role-badge">${hasClassTeacherRole(teacher) ? 'Class Teacher' : 'Teacher'}</span></td>
                            <td>${escapeHtml(formatCreatedDate(teacher.createdAt))}</td>
                            <td class="mt-action-cell">
                                <button type="button" class="mt-action-trigger" ${pendingPasswordResets.size ? 'disabled' : ''} aria-label="Actions for ${escapeHtml(teacher.name || teacher.email || 'teacher')}" aria-haspopup="menu" aria-expanded="false" aria-controls="mtTeacherActionMenu" title="Teacher actions">
                                    <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function openTeacherDeleteDialog(teacher) {
        const dialog = activeRoot?.querySelector('#mtDeleteDialog');
        if (!dialog) return;
        teacherPendingDeletion = teacher;
        dialog.querySelector('#mtDeleteTeacherName').textContent = teacher.name || 'Unnamed teacher';
        const confirmationValue = String(teacher.email || teacher.uid || teacher.id || '').trim();
        dialog.querySelector('#mtDeleteTeacherEmail').textContent = teacher.email
            ? teacher.email
            : `Account ID: ${teacher.uid || teacher.id || 'unknown'}`;
        dialog.querySelector('#mtDeleteConfirmLabel').textContent = teacher.email
            ? 'Type the teacher’s email to confirm'
            : 'Type the teacher’s account ID to confirm';
        const confirmInput = dialog.querySelector('#mtDeleteConfirmEmail');
        confirmInput.value = '';
        confirmInput.placeholder = confirmationValue;
        dialog.querySelector('#mtDeleteStatus').textContent = '';
        dialog.querySelector('#mtDeleteConfirmButton').disabled = !confirmationValue;
        dialog.showModal();
        confirmInput.focus();
    }

    async function deleteTeacherAccount(event) {
        event.preventDefault();
        if (deletingTeacher || !teacherPendingDeletion) return;
        const dialog = activeRoot?.querySelector('#mtDeleteDialog');
        const confirmInput = dialog?.querySelector('#mtDeleteConfirmEmail');
        const confirmButton = dialog?.querySelector('#mtDeleteConfirmButton');
        const statusOutput = dialog?.querySelector('#mtDeleteStatus');
        const teacher = teacherPendingDeletion;
        const confirmationValue = String(teacher.email || teacher.uid || teacher.id || '').trim().toLowerCase();
        if (!dialog || !confirmInput || !confirmButton || !statusOutput) return;
        if (!confirmationValue || confirmInput.value.trim().toLowerCase() !== confirmationValue) {
            statusOutput.textContent = 'Enter the exact email address or account ID shown above to confirm deletion.';
            statusOutput.className = 'mt-status text-danger';
            return;
        }

        deletingTeacher = true;
        closeTeacherActionMenu();
        activeRoot?.querySelectorAll('.mt-action-trigger').forEach(item => { item.disabled = true; });
        confirmButton.disabled = true;
        confirmInput.disabled = true;
        confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Deleting teacher…';
        statusOutput.textContent = 'Removing the teacher account and profile…';
        statusOutput.className = 'mt-status text-muted';

        try {
            const context = await getAdminContext();
            const endpointValue = String(window.ROLLCALL_FIREBASE_CONFIG?.profileUploadWorkerUrl || '').trim();
            const endpoint = new URL(endpointValue);
            if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
                endpoint.search || endpoint.hash) {
                throw new Error('The secure teacher deletion service must use a valid HTTPS URL.');
            }
            endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/delete-teacher`;

            const response = await fetch(endpoint.href, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${await context.user.getIdToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetUid: teacher.uid || teacher.id }),
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer'
            });
            let result;
            try {
                result = await response.json();
            } catch (error) {
                throw new Error('The teacher deletion service returned an invalid response.');
            }
            if (!response.ok) throw new Error(result?.error || 'Could not delete the teacher account.');

            teachers = teachers.filter(item => item.id !== teacher.id);
            dialog.close();
            teacherPendingDeletion = null;
            renderDirectory();
            status(result.message || 'Teacher account deleted. Attendance history was retained.', 'success');
        } catch (error) {
            console.error('Could not delete school teacher:', error);
            statusOutput.textContent = error.message || 'Could not delete the teacher account.';
            statusOutput.className = 'mt-status text-danger';
        } finally {
            deletingTeacher = false;
            confirmInput.disabled = false;
            confirmButton.disabled = confirmInput.value.trim().toLowerCase() !== confirmationValue;
            confirmButton.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> Permanently delete teacher';
            if (!pendingPasswordResets.size) {
                activeRoot?.querySelectorAll('.mt-action-trigger').forEach(item => { item.disabled = false; });
                teacherActionMenu?.querySelectorAll('button').forEach(item => { item.disabled = false; });
            }
        }
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
        const dob = activeRoot.querySelector('#mtDob')?.value?.trim() || '';
        const password = activeRoot.querySelector('#mtPassword').value;
        const profilePhotoFile = activeRoot.querySelector('#mtProfilePhoto').files?.[0] || null;
        const button = activeRoot.querySelector('#mtCreateButton');
        if (!name || !email || !dob || !phone || !designation || !subjectsTaught.length || password.length < 8 || !profilePhotoFile) {
            return status('Complete all required teacher details (including date of birth), select a profile picture, and use a password with at least 8 characters.', 'error');
        }
        if (dob > new Date().toISOString().split('T')[0]) {
            return status('Teacher date of birth cannot be in the future.', 'error');
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
                dob,
                dateOfBirth: dob,
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
            activeRoot.querySelector('#mtCreateDialog')?.close();
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

    async function sendPasswordReset(teacher, actionButton) {
        const teacherId = String(teacher.id || teacher.uid || '');
        if (!teacherId || pendingPasswordResets.size) return;

        pendingPasswordResets.add(teacherId);
        activeRoot?.querySelectorAll('.mt-action-trigger').forEach(item => { item.disabled = true; });
        teacherActionMenu?.querySelectorAll('button').forEach(item => { item.disabled = true; });
        if (actionButton) {
            actionButton.disabled = true;
            actionButton.setAttribute('aria-busy', 'true');
            actionButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Sending reset link…</span>';
        }
        status(`Sending password reset link to ${teacher.email || 'teacher'}…`);

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
        } finally {
            pendingPasswordResets.delete(teacherId);
            if (actionButton?.isConnected) {
                actionButton.disabled = false;
                actionButton.removeAttribute('aria-busy');
                actionButton.innerHTML = '<i class="fas fa-key" aria-hidden="true"></i><span>Send password reset link</span>';
            }
            if (!pendingPasswordResets.size) {
                activeRoot?.querySelectorAll('.mt-action-trigger').forEach(item => { item.disabled = false; });
                teacherActionMenu?.querySelectorAll('button').forEach(item => { item.disabled = false; });
            }
            if (teacherActionMenu?.dataset.teacherId === teacherId) {
                closeTeacherActionMenu(true);
            }
        }
    }

    function mount(root) {
        activeRoot = root || document.getElementById(SECTION_ID);
        if (!activeRoot || activeRoot.dataset.teacherManagerMounted === 'true') return;
        activeRoot.dataset.teacherManagerMounted = 'true';
        createTeacherActionMenu();
        activeRoot.addEventListener('click', handleTeacherActionMenuClick);
        activeRoot.querySelector('#mtAddTeacher')?.addEventListener('click', () => {
            activeRoot.querySelector('#mtCreateDialog')?.showModal();
        });
        const deleteDialog = activeRoot.querySelector('#mtDeleteDialog');
        deleteDialog?.querySelectorAll('.mt-delete-dialog-close').forEach(button => {
            button.addEventListener('click', () => deleteDialog.close());
        });
        deleteDialog?.addEventListener('click', event => {
            if (event.target === deleteDialog) deleteDialog.close();
        });
        deleteDialog?.querySelector('#mtDeleteConfirmEmail')?.addEventListener('input', event => {
            const confirmationValue = String(
                teacherPendingDeletion?.email || teacherPendingDeletion?.uid || teacherPendingDeletion?.id || ''
            ).trim().toLowerCase();
            const confirmButton = event.currentTarget.closest('form')?.querySelector('#mtDeleteConfirmButton');
            if (confirmButton) {
                confirmButton.disabled = deletingTeacher || !confirmationValue ||
                    event.currentTarget.value.trim().toLowerCase() !== confirmationValue;
            }
        });
        const createDialog = activeRoot.querySelector('#mtCreateDialog');
        createDialog?.querySelector('.mt-create-dialog-close')?.addEventListener('click', () => createDialog.close());
        createDialog?.addEventListener('click', event => {
            if (event.target === createDialog) createDialog.close();
        });
        document.addEventListener('click', event => {
            if (!activeRoot?.contains(event.target) && !teacherActionMenu?.contains(event.target)) {
                closeTeacherActionMenu();
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && teacherActionMenu && !teacherActionMenu.hidden) {
                closeTeacherActionMenu(true);
            }
        });
        window.addEventListener('resize', () => closeTeacherActionMenu());
        window.addEventListener('scroll', () => closeTeacherActionMenu(), true);
        activeRoot.querySelector('#mtCreateForm')?.addEventListener('submit', createTeacher);
        activeRoot.querySelector('#mtDeleteForm')?.addEventListener('submit', deleteTeacherAccount);
        activeRoot.querySelector('#mtProfilePhoto')?.addEventListener('change', previewProfilePhoto);
        activeRoot.querySelector('#mtRefresh')?.addEventListener('click', loadTeachers);
        activeRoot.querySelector('#mtSearch')?.addEventListener('input', renderDirectory);
        loadTeachers();
    }

    window.AdminPanelAPI?.register('manage-teachers', mount, { contentSized: true });
})();
