/**
 * Manage Batches & Academic Intake Assignment
 * RollCall Admin Portal
 */
(function () {
    const SECTION_ID = 'manage-batches-section-active';
    let activeRoot = null;
    let activeSchoolId = null;
    let students = [];
    let batches = new Set();
    let classMap = new Map(); // className -> array of student objects
    let selectedStudentIds = new Set();
    let courseBatches = new Set();
    let isLoading = false;

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function escapeCsv(str) {
        const val = String(str ?? '').replace(/"/g, '""');
        return `"${val}"`;
    }

    function notify(message, type = 'info') {
        if (typeof showAlert === 'function') {
            showAlert(message, type);
        } else {
            alert(message);
        }
    }

    async function getAdminContext() {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('Your administrator session has expired. Please sign in again.');
        const snapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
        const profile = snapshot.val() || {};
        if (String(profile.role || '').toLowerCase() !== 'admin') {
            throw new Error('Administrator access is required.');
        }
        const schoolId = String(profile.schoolId || user.uid).trim();
        if (!schoolId) {
            throw new Error('Your administrator account is not linked to an active school.');
        }
        return { user, profile, schoolId };
    }

    async function loadSchoolData() {
        if (isLoading) return;
        isLoading = true;
        renderLoading(true);

        try {
            const context = await getAdminContext();
            activeSchoolId = context.schoolId;

            const [usersSnap, schoolSnap] = await Promise.all([
                firebase.database().ref('users').orderByChild('schoolId').equalTo(activeSchoolId).once('value'),
                firebase.database().ref(`schools/${activeSchoolId}`).once('value')
            ]);

            students = [];
            batches = new Set();
            classMap = new Map();
            courseBatches = new Set();

            // Extract course catalog batches if available
            const schoolData = schoolSnap.val() || {};
            const courses = schoolData.courseCatalog || {};
            Object.values(courses).forEach(c => {
                if (c && c.batchStart && c.batchEnd) {
                    const b = `${c.batchStart}-${c.batchEnd}`;
                    courseBatches.add(b);
                    batches.add(b);
                }
            });

            // Parse students
            usersSnap.forEach(child => {
                const u = child.val() || {};
                if (String(u.role || '').toLowerCase() === 'student' && String(u.schoolId || '').trim() === activeSchoolId) {
                    const sClass = String(u.class || u.className || 'Unassigned').trim();
                    const sSection = String(u.section || '').trim();
                    const fullClass = sSection ? `${sClass} (${sSection})` : sClass;
                    const studentBatch = String(u.academicBatch || u.batch || '').trim();

                    if (studentBatch) {
                        batches.add(studentBatch);
                    }

                    const studentObj = {
                        id: child.key,
                        name: u.name || 'Unnamed Student',
                        email: u.email || '—',
                        class: sClass,
                        section: sSection,
                        fullClass: fullClass,
                        classRoll: u.classRoll || u.rollNo || '—',
                        univRoll: u.universityRoll || u.univRoll || u.enrollmentNumber || '—',
                        batch: studentBatch,
                        photoURL: u.profilePhoto || u.photoURL || ''
                    };

                    students.push(studentObj);

                    if (!classMap.has(fullClass)) {
                        classMap.set(fullClass, []);
                    }
                    classMap.get(fullClass).push(studentObj);
                }
            });

            // Sort students alphabetically by name
            students.sort((a, b) => a.name.localeCompare(b.name));

            // Clean stale selected IDs
            selectedStudentIds = new Set([...selectedStudentIds].filter(id => students.some(s => s.id === id)));

            renderStats();
            renderClassQuickAssign();
            populateFilterDropdowns();
            renderTable();
            updateBulkBar();
        } catch (err) {
            console.error('Error loading students for batches:', err);
            notify(err.message || 'Could not load student batch data.', 'error');
        } finally {
            isLoading = false;
            renderLoading(false);
        }
    }

    function renderLoading(loading) {
        const refreshBtn = activeRoot?.querySelector('#mbRefreshBtn');
        if (refreshBtn) {
            refreshBtn.disabled = loading;
            refreshBtn.innerHTML = loading
                ? '<i class="fas fa-spinner fa-spin"></i><span>Loading...</span>'
                : '<i class="fas fa-rotate"></i><span>Refresh</span>';
        }
    }

    function renderStats() {
        if (!activeRoot) return;
        const total = students.length;
        const assigned = students.filter(s => s.batch).length;
        const unassigned = total - assigned;
        const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;

        const totalEl = activeRoot.querySelector('#mbStatTotal');
        const assignedEl = activeRoot.querySelector('#mbStatAssigned');
        const assignedPctEl = activeRoot.querySelector('#mbStatAssignedPct');
        const unassignedEl = activeRoot.querySelector('#mbStatUnassigned');
        const batchesEl = activeRoot.querySelector('#mbStatBatches');

        if (totalEl) totalEl.textContent = total.toLocaleString();
        if (assignedEl) assignedEl.textContent = assigned.toLocaleString();
        if (assignedPctEl) assignedPctEl.textContent = `${pct}% Assigned`;
        if (unassignedEl) unassignedEl.textContent = unassigned.toLocaleString();
        if (batchesEl) batchesEl.textContent = batches.size.toLocaleString();
    }

    function renderClassQuickAssign() {
        if (!activeRoot) return;
        const classSelect = activeRoot.querySelector('#mbQuickClassSelect');
        const batchSelect = activeRoot.querySelector('#mbQuickBatchSelect');
        const customBatchInput = activeRoot.querySelector('#mbQuickCustomBatch');
        const previewNote = activeRoot.querySelector('#mbQuickPreviewNote');

        if (!classSelect || !batchSelect) return;

        // Populate classes
        const sortedClasses = Array.from(classMap.keys()).sort();
        let classHtml = '<option value="">-- Choose Class / Section --</option>';
        sortedClasses.forEach(cls => {
            const count = classMap.get(cls)?.length || 0;
            classHtml += `<option value="${escapeHtml(cls)}">${escapeHtml(cls)} (${count} students)</option>`;
        });
        classSelect.innerHTML = classHtml;

        // Populate batches
        populateBatchSelectOptions(batchSelect);

        // Update preview note on class change
        const updateNote = () => {
            const chosenClass = classSelect.value;
            if (!chosenClass) {
                if (previewNote) previewNote.innerHTML = '<i class="fas fa-info-circle text-primary"></i> Select a class to see student counts and assign in 1 click.';
                return;
            }
            const classStudents = classMap.get(chosenClass) || [];
            const withBatch = classStudents.filter(s => s.batch).length;
            const withoutBatch = classStudents.length - withBatch;

            if (previewNote) {
                previewNote.innerHTML = `<i class="fas fa-users text-primary"></i> <strong>${classStudents.length}</strong> students in <strong>${escapeHtml(chosenClass)}</strong> (${withBatch} currently assigned, <span class="${withoutBatch > 0 ? 'text-danger fw-bold' : 'text-success'}">${withoutBatch} unassigned</span>).`;
            }
        };

        classSelect.onchange = updateNote;

        // Toggle custom batch input when "-- Custom Batch --" selected
        batchSelect.onchange = () => {
            if (customBatchInput) {
                customBatchInput.style.display = batchSelect.value === '__custom__' ? 'block' : 'none';
                if (batchSelect.value === '__custom__') customBatchInput.focus();
            }
        };

        // Wire 1-Click Button
        const assignBtn = activeRoot.querySelector('#mbAssignClassBtn');
        if (assignBtn) {
            assignBtn.onclick = handleQuickClassAssign;
        }
    }

    function populateBatchSelectOptions(selectElement, includeUnassignedOption = false) {
        if (!selectElement) return;
        const sortedBatches = Array.from(batches).filter(Boolean).sort().reverse();
        let html = '<option value="">-- Select Batch --</option>';
        if (includeUnassignedOption) {
            html += '<option value="__unassigned_only__">⚠️ Unassigned Students Only</option>';
        }
        sortedBatches.forEach(b => {
            html += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`;
        });
        html += '<option value="__custom__">+ Enter Custom Batch...</option>';
        selectElement.innerHTML = html;
    }

    function populateFilterDropdowns() {
        if (!activeRoot) return;
        const classFilter = activeRoot.querySelector('#mbClassFilter');
        const batchFilter = activeRoot.querySelector('#mbBatchFilter');

        if (classFilter) {
            const prev = classFilter.value;
            let html = '<option value="">All Classes &amp; Sections</option>';
            Array.from(classMap.keys()).sort().forEach(cls => {
                html += `<option value="${escapeHtml(cls)}" ${cls === prev ? 'selected' : ''}>${escapeHtml(cls)} (${classMap.get(cls)?.length})</option>`;
            });
            classFilter.innerHTML = html;
        }

        if (batchFilter) {
            const prev = batchFilter.value;
            let html = '<option value="">All Batches</option>';
            html += `<option value="__unassigned__" ${prev === '__unassigned__' ? 'selected' : ''}>⚠️ Unassigned Only</option>`;
            Array.from(batches).filter(Boolean).sort().reverse().forEach(b => {
                const count = students.filter(s => s.batch === b).length;
                html += `<option value="${escapeHtml(b)}" ${b === prev ? 'selected' : ''}>${escapeHtml(b)} (${count})</option>`;
            });
            batchFilter.innerHTML = html;
        }

        // Also update bulk action bar batch options
        const bulkSelect = activeRoot.querySelector('#mbBulkBatchSelect');
        if (bulkSelect) {
            populateBatchSelectOptions(bulkSelect);
        }
    }

    async function handleQuickClassAssign() {
        const classSelect = activeRoot.querySelector('#mbQuickClassSelect');
        const batchSelect = activeRoot.querySelector('#mbQuickBatchSelect');
        const customInput = activeRoot.querySelector('#mbQuickCustomBatch');
        const btn = activeRoot.querySelector('#mbAssignClassBtn');

        const chosenClass = classSelect?.value;
        if (!chosenClass) {
            return notify('Please select a Class or Section first.', 'warning');
        }

        let targetBatch = batchSelect?.value;
        if (targetBatch === '__custom__') {
            targetBatch = customInput?.value.trim();
        }
        if (!targetBatch) {
            return notify('Please choose or enter a Batch name (e.g. 2024-2028).', 'warning');
        }

        const classStudents = classMap.get(chosenClass) || [];
        if (!classStudents.length) {
            return notify(`No students found in class "${chosenClass}".`, 'warning');
        }

        const confirmMsg = `Are you sure you want to assign Batch "${targetBatch}" to ALL ${classStudents.length} students in "${chosenClass}" in 1 click?`;
        if (!window.confirm(confirmMsg)) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Assigning...';

        try {
            const updates = {};
            const timestamp = new Date().toISOString();
            classStudents.forEach(s => {
                updates[`users/${s.id}/academicBatch`] = targetBatch;
                updates[`users/${s.id}/batch`] = targetBatch;
                updates[`users/${s.id}/lastUpdated`] = timestamp;
                updates[`schoolUsers/${activeSchoolId}/${s.id}/academicBatch`] = targetBatch;
                updates[`schoolUsers/${activeSchoolId}/${s.id}/batch`] = targetBatch;
            });

            await firebase.database().ref().update(updates);

            notify(`Successfully assigned Batch "${targetBatch}" to all ${classStudents.length} students in ${chosenClass}!`, 'success');
            await loadSchoolData();
        } catch (err) {
            console.error('Error assigning batch to class:', err);
            notify(`Failed to assign batch: ${err.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Assign to All in Class';
            }
        }
    }

    function getFilteredStudents() {
        const search = String(activeRoot?.querySelector('#mbSearchInput')?.value || '').trim().toLowerCase();
        const classVal = activeRoot?.querySelector('#mbClassFilter')?.value || '';
        const batchVal = activeRoot?.querySelector('#mbBatchFilter')?.value || '';

        return students.filter(s => {
            if (classVal && s.fullClass !== classVal) return false;
            if (batchVal === '__unassigned__') {
                if (s.batch) return false;
            } else if (batchVal && s.batch !== batchVal) {
                return false;
            }
            if (search) {
                const matchName = s.name.toLowerCase().includes(search);
                const matchEmail = s.email.toLowerCase().includes(search);
                const matchRoll = s.classRoll.toLowerCase().includes(search) || s.univRoll.toLowerCase().includes(search);
                const matchBatch = s.batch.toLowerCase().includes(search);
                if (!matchName && !matchEmail && !matchRoll && !matchBatch) return false;
            }
            return true;
        });
    }

    function renderTable() {
        const tbody = activeRoot?.querySelector('#mbStudentTableBody');
        const countBadge = activeRoot?.querySelector('#mbVisibleCount');
        if (!tbody) return;

        const filtered = getFilteredStudents();
        if (countBadge) countBadge.textContent = `${filtered.length} of ${students.length}`;

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="mb-empty-state">
                            <div class="mb-empty-icon"><i class="fas fa-user-slash"></i></div>
                            <h5>No students found</h5>
                            <p>No students match the current search or filter criteria.</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        let html = '';
        filtered.forEach(s => {
            const isChecked = selectedStudentIds.has(s.id);
            const batchBadge = s.batch
                ? `<span class="mb-batch-badge"><i class="fas fa-tag"></i> ${escapeHtml(s.batch)}</span>`
                : `<span class="mb-batch-badge unassigned"><i class="fas fa-exclamation-triangle"></i> Unassigned</span>`;

            const avatar = `<div class="mb-student-avatar-fallback">${escapeHtml(s.name ? s.name.charAt(0).toUpperCase() : 'S')}</div>`;

            html += `
                <tr class="${isChecked ? 'selected' : ''}" data-student-id="${escapeHtml(s.id)}">
                    <td>
                        <input type="checkbox" class="mb-checkbox mb-student-checkbox" data-student-id="${escapeHtml(s.id)}" ${isChecked ? 'checked' : ''} aria-label="Select ${escapeHtml(s.name)}">
                    </td>
                    <td>
                        <div class="mb-student-cell">
                            ${avatar}
                            <div>
                                <span class="mb-student-name">${escapeHtml(s.name)}</span>
                                <span class="mb-student-email">${escapeHtml(s.email)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="mb-class-pill">${escapeHtml(s.fullClass)}</span>
                    </td>
                    <td>
                        <div style="font-size:0.82rem;">
                            <div>Roll: <strong>${escapeHtml(s.classRoll)}</strong></div>
                            ${s.univRoll && s.univRoll !== '—' ? `<div class="text-muted" style="font-size:0.75rem;">Univ: ${escapeHtml(s.univRoll)}</div>` : ''}
                        </div>
                    </td>
                    <td>${batchBadge}</td>
                    <td class="text-end">
                        <button type="button" class="mb-row-action-btn mb-quick-edit-btn" data-student-id="${escapeHtml(s.id)}" title="Change batch for ${escapeHtml(s.name)}">
                            <i class="fas fa-pen me-1"></i>Set Batch
                        </button>
                    </td>
                </tr>`;
        });

        tbody.innerHTML = html;

        // Wire row checkbox listeners
        tbody.querySelectorAll('.mb-student-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.studentId;
                if (e.target.checked) selectedStudentIds.add(id);
                else selectedStudentIds.delete(id);
                const tr = e.target.closest('tr');
                if (tr) tr.classList.toggle('selected', e.target.checked);
                updateBulkBar();
                updateSelectAllMasterCheckbox();
            });
        });

        // Wire quick edit buttons
        tbody.querySelectorAll('.mb-quick-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.studentId;
                const student = students.find(item => item.id === id);
                if (student) promptIndividualBatchAssign(student);
            });
        });

        updateSelectAllMasterCheckbox();
    }

    function updateSelectAllMasterCheckbox() {
        const master = activeRoot?.querySelector('#mbSelectAllMaster');
        if (!master) return;
        const visible = getFilteredStudents();
        if (!visible.length) {
            master.checked = false;
            master.indeterminate = false;
            return;
        }
        const visibleSelectedCount = visible.filter(s => selectedStudentIds.has(s.id)).length;
        if (visibleSelectedCount === 0) {
            master.checked = false;
            master.indeterminate = false;
        } else if (visibleSelectedCount === visible.length) {
            master.checked = true;
            master.indeterminate = false;
        } else {
            master.checked = false;
            master.indeterminate = true;
        }
    }

    function updateBulkBar() {
        const bar = activeRoot?.querySelector('#mbBulkBar');
        const countSpan = activeRoot?.querySelector('#mbBulkSelectedCount');
        if (!bar) return;

        const count = selectedStudentIds.size;
        if (count > 0) {
            bar.style.display = 'flex';
            if (countSpan) countSpan.textContent = `${count} Student${count === 1 ? '' : 's'} Selected`;
        } else {
            bar.style.display = 'none';
        }
    }

    async function applyBatchToSelected() {
        const bulkSelect = activeRoot?.querySelector('#mbBulkBatchSelect');
        const customInput = activeRoot?.querySelector('#mbBulkCustomBatch');
        if (!selectedStudentIds.size) return notify('Please select at least one student.', 'warning');

        let targetBatch = bulkSelect?.value;
        if (targetBatch === '__custom__') {
            targetBatch = customInput?.value.trim();
        }
        if (!targetBatch) {
            return notify('Please choose or enter a Batch to assign.', 'warning');
        }

        const count = selectedStudentIds.size;
        if (!window.confirm(`Assign batch "${targetBatch}" to the ${count} selected student(s)?`)) return;

        try {
            const updates = {};
            const timestamp = new Date().toISOString();
            selectedStudentIds.forEach(id => {
                const s = students.find(item => item.id === id);
                if (!s) return;
                updates[`users/${id}/academicBatch`] = targetBatch;
                updates[`users/${id}/batch`] = targetBatch;
                updates[`users/${id}/lastUpdated`] = timestamp;
                updates[`schoolUsers/${activeSchoolId}/${id}/academicBatch`] = targetBatch;
                updates[`schoolUsers/${activeSchoolId}/${id}/batch`] = targetBatch;
            });

            await firebase.database().ref().update(updates);
            notify(`Batch "${targetBatch}" assigned to ${count} students.`, 'success');
            selectedStudentIds.clear();
            await loadSchoolData();
        } catch (err) {
            console.error('Error applying batch:', err);
            notify(`Failed to apply batch: ${err.message}`, 'error');
        }
    }

    async function clearBatchFromSelected() {
        if (!selectedStudentIds.size) return notify('No students selected.', 'warning');
        const count = selectedStudentIds.size;
        if (!window.confirm(`Are you sure you want to remove the assigned batch from ${count} selected student(s)?`)) return;

        try {
            const updates = {};
            const timestamp = new Date().toISOString();
            selectedStudentIds.forEach(id => {
                const s = students.find(item => item.id === id);
                if (!s) return;
                updates[`users/${id}/academicBatch`] = null;
                updates[`users/${id}/batch`] = null;
                updates[`users/${id}/lastUpdated`] = timestamp;
                updates[`schoolUsers/${activeSchoolId}/${id}/academicBatch`] = null;
                updates[`schoolUsers/${activeSchoolId}/${id}/batch`] = null;
            });

            await firebase.database().ref().update(updates);
            notify(`Batch cleared from ${count} students.`, 'success');
            selectedStudentIds.clear();
            await loadSchoolData();
        } catch (err) {
            console.error('Error clearing batch:', err);
            notify(`Failed to clear batch: ${err.message}`, 'error');
        }
    }

    function promptIndividualBatchAssign(student) {
        const modalId = 'mbIndividualModal';
        document.getElementById(modalId)?.remove();

        const sortedBatches = Array.from(batches).filter(Boolean).sort().reverse();
        let optionsHtml = '<option value="">-- No Batch (Unassigned) --</option>';
        sortedBatches.forEach(b => {
            optionsHtml += `<option value="${escapeHtml(b)}" ${student.batch === b ? 'selected' : ''}>${escapeHtml(b)}</option>`;
        });
        optionsHtml += '<option value="__custom__">+ Enter Custom Batch...</option>';

        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.className = 'mb-modal-overlay';
        overlay.innerHTML = `
            <div class="mb-modal-card">
                <div class="mb-modal-header">
                    <h4><i class="fas fa-user-graduate text-primary me-2"></i>Assign Batch</h4>
                    <button type="button" class="mb-modal-close" id="mbIndCloseBtn">&times;</button>
                </div>
                <div class="mb-modal-body">
                    <div style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                        <div style="font-weight:700;font-size:1rem;color:#0f172a;">${escapeHtml(student.name)}</div>
                        <div class="text-muted" style="font-size:0.85rem;">${escapeHtml(student.email)} · ${escapeHtml(student.fullClass)}</div>
                        <div style="font-size:0.82rem;margin-top:4px;">Current Batch: <strong>${escapeHtml(student.batch || 'None (Unassigned)')}</strong></div>
                    </div>
                    <div class="mb-input-group">
                        <label for="mbIndBatchSelect">Select Target Batch</label>
                        <select id="mbIndBatchSelect" class="mb-select">
                            ${optionsHtml}
                        </select>
                        <input type="text" id="mbIndCustomInput" class="mb-input mt-2" placeholder="e.g. 2024-2028" style="display:none;">
                    </div>
                </div>
                <div class="mb-modal-footer">
                    <button type="button" class="mb-btn mb-btn-outline" id="mbIndCancelBtn">Cancel</button>
                    <button type="button" class="mb-btn mb-btn-primary" id="mbIndSaveBtn"><i class="fas fa-save"></i> Save Batch</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const sel = overlay.querySelector('#mbIndBatchSelect');
        const customIn = overlay.querySelector('#mbIndCustomInput');
        const close = () => overlay.remove();

        overlay.querySelector('#mbIndCloseBtn').onclick = close;
        overlay.querySelector('#mbIndCancelBtn').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        sel.onchange = () => {
            customIn.style.display = sel.value === '__custom__' ? 'block' : 'none';
            if (sel.value === '__custom__') customIn.focus();
        };

        overlay.querySelector('#mbIndSaveBtn').onclick = async () => {
            let finalBatch = sel.value;
            if (finalBatch === '__custom__') finalBatch = customIn.value.trim();
            const btn = overlay.querySelector('#mbIndSaveBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const timestamp = new Date().toISOString();
                await firebase.database().ref().update({
                    [`users/${student.id}/academicBatch`]: finalBatch || null,
                    [`users/${student.id}/batch`]: finalBatch || null,
                    [`users/${student.id}/lastUpdated`]: timestamp,
                    [`schoolUsers/${activeSchoolId}/${student.id}/academicBatch`]: finalBatch || null,
                    [`schoolUsers/${activeSchoolId}/${student.id}/batch`]: finalBatch || null
                });
                notify(`Updated batch for ${student.name}.`, 'success');
                close();
                await loadSchoolData();
            } catch (err) {
                console.error('Error updating individual batch:', err);
                notify(`Failed: ${err.message}`, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Save Batch';
            }
        };
    }

    function openManageBatchesModal() {
        const modalId = 'mbDirectoryModal';
        document.getElementById(modalId)?.remove();

        const sortedBatches = Array.from(batches).filter(Boolean).sort().reverse();
        let itemsHtml = '';
        sortedBatches.forEach(b => {
            const count = students.filter(s => s.batch === b).length;
            itemsHtml += `
                <div class="mb-distribution-item">
                    <div>
                        <strong><i class="fas fa-tag text-primary me-2"></i>${escapeHtml(b)}</strong>
                        <div class="text-muted" style="font-size:0.8rem;">${count} student${count === 1 ? '' : 's'} assigned</div>
                    </div>
                    <button type="button" class="mb-btn mb-btn-outline mb-migrate-trigger" data-batch="${escapeHtml(b)}" style="padding:4px 10px;font-size:0.8rem;">
                        <i class="fas fa-exchange-alt me-1"></i>Rename / Migrate
                    </button>
                </div>`;
        });

        if (!itemsHtml) {
            itemsHtml = '<p class="text-muted text-center py-3">No batches currently exist.</p>';
        }

        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.className = 'mb-modal-overlay';
        overlay.innerHTML = `
            <div class="mb-modal-card" style="max-width:580px;">
                <div class="mb-modal-header">
                    <h4><i class="fas fa-layer-group text-primary me-2"></i>School Batches Directory</h4>
                    <button type="button" class="mb-modal-close" id="mbDirCloseBtn">&times;</button>
                </div>
                <div class="mb-modal-body">
                    <p class="text-muted" style="font-size:0.85rem;margin-top:0;">View all batches in your school or migrate students from one batch to another.</p>
                    <div class="mb-distribution-list mb-3">
                        ${itemsHtml}
                    </div>

                    <div style="padding:14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                        <h6 class="fw-bold mb-2 text-primary"><i class="fas fa-exchange-alt me-1"></i>Batch Migration Tool</h6>
                        <p class="text-muted small mb-2">Change an entire batch name across all enrolled students (e.g. migrate <em>2024</em> to <em>2024-2028</em>).</p>
                        <div class="row g-2">
                            <div class="col-sm-5">
                                <label class="small fw-bold">From Batch</label>
                                <select id="mbMigrateFrom" class="mb-select">
                                    <option value="">-- Select --</option>
                                    ${sortedBatches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-sm-5">
                                <label class="small fw-bold">To New Batch</label>
                                <input type="text" id="mbMigrateTo" class="mb-input" placeholder="e.g. 2024-2028">
                            </div>
                            <div class="col-sm-2 d-flex align-items-end">
                                <button type="button" class="mb-btn mb-btn-primary w-100" id="mbMigrateSubmitBtn" style="padding:10px 4px;justify-content:center;">Migrate</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mb-modal-footer">
                    <button type="button" class="mb-btn mb-btn-outline" id="mbDirDoneBtn">Close</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#mbDirCloseBtn').onclick = close;
        overlay.querySelector('#mbDirDoneBtn').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        // Handle inline migrate trigger click
        overlay.querySelectorAll('.mb-migrate-trigger').forEach(btn => {
            btn.onclick = () => {
                const b = btn.dataset.batch;
                const fromSelect = overlay.querySelector('#mbMigrateFrom');
                if (fromSelect) fromSelect.value = b;
                overlay.querySelector('#mbMigrateTo')?.focus();
            };
        });

        // Handle migrate submission
        overlay.querySelector('#mbMigrateSubmitBtn').onclick = async () => {
            const fromBatch = overlay.querySelector('#mbMigrateFrom')?.value;
            const toBatch = overlay.querySelector('#mbMigrateTo')?.value.trim();

            if (!fromBatch) return notify('Select the source batch to migrate from.', 'warning');
            if (!toBatch) return notify('Enter the new target batch name.', 'warning');
            if (fromBatch === toBatch) return notify('Source and target batch names are identical.', 'warning');

            const affected = students.filter(s => s.batch === fromBatch);
            if (!affected.length) return notify(`No students currently assigned to batch "${fromBatch}".`, 'warning');

            if (!window.confirm(`Migrate all ${affected.length} students from Batch "${fromBatch}" to "${toBatch}"?`)) return;

            const submitBtn = overlay.querySelector('#mbMigrateSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const updates = {};
                const timestamp = new Date().toISOString();
                affected.forEach(s => {
                    updates[`users/${s.id}/academicBatch`] = toBatch;
                    updates[`users/${s.id}/batch`] = toBatch;
                    updates[`users/${s.id}/lastUpdated`] = timestamp;
                });

                await firebase.database().ref().update(updates);
                notify(`Successfully migrated ${affected.length} students to Batch "${toBatch}".`, 'success');
                close();
                await loadSchoolData();
            } catch (err) {
                console.error('Error migrating batch:', err);
                notify(`Migration failed: ${err.message}`, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Migrate';
            }
        };
    }

    function exportRosterCSV() {
        const filtered = getFilteredStudents();
        if (!filtered.length) {
            return notify('No student records to export.', 'warning');
        }

        const headers = ['Student Name', 'Email', 'Class', 'Section', 'Class Roll', 'University Roll', 'Academic Batch'];
        const rows = filtered.map(s => [
            escapeCsv(s.name),
            escapeCsv(s.email),
            escapeCsv(s.class),
            escapeCsv(s.section),
            escapeCsv(s.classRoll),
            escapeCsv(s.univRoll),
            escapeCsv(s.batch || 'Unassigned')
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute('href', url);
        link.setAttribute('download', `student_batches_${activeSchoolId || 'school'}_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notify(`Exported ${filtered.length} student batch records to CSV.`, 'success');
    }

    function setupEventListeners() {
        if (!activeRoot) return;

        // Refresh button
        activeRoot.querySelector('#mbRefreshBtn')?.addEventListener('click', loadSchoolData);

        // Manage batches directory button
        activeRoot.querySelector('#mbManageBatchesModalBtn')?.addEventListener('click', openManageBatchesModal);

        // Export CSV button
        activeRoot.querySelector('#mbExportCsvBtn')?.addEventListener('click', exportRosterCSV);

        // Search & Filters
        activeRoot.querySelector('#mbSearchInput')?.addEventListener('input', renderTable);
        activeRoot.querySelector('#mbClassFilter')?.addEventListener('change', renderTable);
        activeRoot.querySelector('#mbBatchFilter')?.addEventListener('change', renderTable);

        // Master select all checkbox
        activeRoot.querySelector('#mbSelectAllMaster')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            const visible = getFilteredStudents();
            visible.forEach(s => {
                if (checked) selectedStudentIds.add(s.id);
                else selectedStudentIds.delete(s.id);
            });
            renderTable();
            updateBulkBar();
        });

        // Quick selection buttons
        activeRoot.querySelector('#mbSelectAllBtn')?.addEventListener('click', () => {
            const visible = getFilteredStudents();
            visible.forEach(s => selectedStudentIds.add(s.id));
            renderTable();
            updateBulkBar();
        });

        activeRoot.querySelector('#mbSelectUnassignedBtn')?.addEventListener('click', () => {
            const visible = getFilteredStudents();
            visible.forEach(s => {
                if (!s.batch) selectedStudentIds.add(s.id);
            });
            renderTable();
            updateBulkBar();
        });

        activeRoot.querySelector('#mbDeselectAllBtn')?.addEventListener('click', () => {
            selectedStudentIds.clear();
            renderTable();
            updateBulkBar();
        });

        // Bulk bar buttons
        activeRoot.querySelector('#mbBulkApplyBtn')?.addEventListener('click', applyBatchToSelected);
        activeRoot.querySelector('#mbBulkClearBtn')?.addEventListener('click', clearBatchFromSelected);
        activeRoot.querySelector('#mbBulkCancelBtn')?.addEventListener('click', () => {
            selectedStudentIds.clear();
            renderTable();
            updateBulkBar();
        });

        const bulkSelect = activeRoot.querySelector('#mbBulkBatchSelect');
        const bulkCustom = activeRoot.querySelector('#mbBulkCustomBatch');
        if (bulkSelect && bulkCustom) {
            bulkSelect.addEventListener('change', () => {
                bulkCustom.style.display = bulkSelect.value === '__custom__' ? 'block' : 'none';
                if (bulkSelect.value === '__custom__') bulkCustom.focus();
            });
        }
    }

    function mount(root) {
        activeRoot = root || document.getElementById(SECTION_ID);
        if (!activeRoot) return;

        // Ensure scrolling is enabled on the admin content wrapper
        const content = document.getElementById('content-wrapper');
        if (content) {
            content.style.removeProperty('overflow-y');
            content.style.removeProperty('height');
            content.style.removeProperty('max-height');
            content.style.setProperty('overflow-y', 'auto', 'important');
            content.style.setProperty('height', '100vh', 'important');
            content.style.setProperty('max-height', '100vh', 'important');
            content.style.setProperty('min-height', '0', 'important');
        }

        setupEventListeners();
        loadSchoolData();
    }

    window.initManageBatchesSection = mount;
    window.AdminPanelAPI?.register('manage-batches', mount, { contentSized: false });
})();
