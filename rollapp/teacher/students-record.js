// School-scoped student directory with filters, export, paging, and cached profile images.
document.addEventListener('DOMContentLoaded', () => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const norm = value => String(value ?? '').trim().replace(/^section\s+/i, '').toLowerCase();
    const values = value => Array.isArray(value) ? value.flatMap(values) :
        (value && typeof value === 'object' ? Object.entries(value).filter(([, item]) => item === true || (item && typeof item === 'object')).map(([key]) => key) :
            (typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : []));
    const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

    const style = document.createElement('style');
    style.textContent = `
        .sr-shell{color:#24392e;min-width:0}.sr-hero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:18px;margin:18px 0;padding:23px;border:1px solid #dfebe2;border-radius:18px;background:linear-gradient(120deg,#fff,#eff8f1);box-shadow:0 10px 28px #1e412c0d}.sr-kicker{margin:0 0 6px;color:#287451;font-size:10px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.sr-hero h2{margin:0;font-size:23px}.sr-hero p{margin:7px 0 0;color:#718178;font-size:13px}.sr-count{min-width:112px;padding:12px 17px;border:1px solid #dcebe0;border-radius:13px;background:#fff;text-align:center}.sr-count b{display:block;color:#196c49;font-size:24px}.sr-count span{color:#718178;font-size:11px;font-weight:700}.sr-count small{display:block;color:#7b8980;font-size:10px}.sr-filters{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));align-items:end;gap:10px;margin-bottom:10px;padding:15px;border:1px solid #e1ebe4;border-radius:14px;background:#fff}.sr-field{min-width:0}.sr-field label{display:block;margin-bottom:6px;color:#596d61;font-size:11px;font-weight:750}.sr-field input,.sr-field select{width:100%;height:42px;padding:0 11px;border:1px solid #dce8df;border-radius:9px;background:#fff;color:#2d4236;font:inherit;font-size:13px;min-width:0}.sr-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}.sr-actions{display:flex;gap:8px}.sr-refresh,.sr-button{display:inline-flex!important;min-height:40px;align-items:center;justify-content:center;gap:7px;padding:0 13px;border:1px solid #d5e7da;border-radius:9px;background:#f4faf5;color:#196c49;font:inherit;font-size:12px;font-weight:750;white-space:nowrap;cursor:pointer}.sr-button.secondary{background:#fff;color:#52665a}.sr-button:disabled{opacity:.5;cursor:not-allowed}.sr-assignment{margin:0;color:#718178;font-size:12px}.sr-error{color:#a24b43}.sr-table-wrap{overflow:auto;border:1px solid #e1eae3;border-radius:14px;background:#fff}.sr-table{width:100%;min-width:760px;border-collapse:collapse;text-align:left}.sr-table th{padding:12px 14px;background:#f4f8f5;color:#68796f;font-size:10px;letter-spacing:.07em;text-transform:uppercase}.sr-table td{padding:11px 14px;border-top:1px solid #edf1ee;color:#30443a;font-size:12px}.sr-student{display:flex;align-items:center;gap:10px;min-width:190px}.sr-avatar{display:block;flex:0 0 42px;width:42px;height:42px;border-radius:50%;object-fit:cover;background:#e7f2e9}.sr-avatar-fallback{display:grid;place-items:center;color:#196c49;font-size:13px;font-weight:800}.sr-student-copy{min-width:0}.sr-name{font-weight:750;overflow-wrap:anywhere}.sr-sub{display:block;margin-top:3px;color:#7b8980;font-size:11px;overflow-wrap:anywhere}.sr-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#edf6ef;color:#236b49;font-size:11px;font-weight:700}.sr-details-btn{border:0;background:transparent;color:#176b4d;font:inherit;font-weight:750;cursor:pointer}.sr-detail-row td{background:#fafcfb;color:#637469}.sr-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sr-detail-grid span{display:block;color:#7b8980;font-size:10px}.sr-detail-grid strong{display:block;margin-top:3px;color:#405449;font-size:12px;font-weight:650;overflow-wrap:anywhere}.sr-pagination{display:flex;align-items:center;justify-content:center;gap:12px;padding:13px}.sr-page-label{color:#637469;font-size:12px}.sr-empty{padding:36px 18px;border:1px solid #e1eae3;border-radius:14px;background:#fff;color:#718178;text-align:center}.sr-empty i{display:block;margin-bottom:9px;color:#49936a;font-size:23px}.sr-empty strong{display:block;margin-bottom:5px;color:#30473a}.sr-detail-row[hidden]{display:none!important}
        @media(max-width:900px){.sr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:680px){.sr-hero{grid-template-columns:1fr;padding:16px}.sr-count{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px}.sr-count b{font-size:19px}.sr-count small{display:none}.sr-hero h2{font-size:20px}.sr-filters{grid-template-columns:1fr;padding:12px}.sr-toolbar{align-items:stretch;flex-direction:column}.sr-actions{display:grid;grid-template-columns:1fr 1fr}.sr-actions button{width:100%}.sr-refresh{width:100%}.sr-table-wrap{overflow:visible;border:0;background:transparent}.sr-table{display:block;width:100%;min-width:0}.sr-table thead{display:none}.sr-table tbody{display:grid;gap:10px}.sr-table tr:not(.sr-detail-row){display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding:13px;border:1px solid #e1eae3;border-radius:13px;background:#fff}.sr-table tr:not(.sr-detail-row) td{min-width:0;padding:0;border:0;overflow-wrap:anywhere}.sr-table tr:not(.sr-detail-row) td:first-child{grid-column:1/-1;padding-bottom:9px;border-bottom:1px solid #edf1ee}.sr-table tr:not(.sr-detail-row) td:first-child .sr-student{min-width:0}.sr-table tr:not(.sr-detail-row) td:nth-child(2)::before,.sr-table tr:not(.sr-detail-row) td:nth-child(3)::before,.sr-table tr:not(.sr-detail-row) td:nth-child(4)::before{display:block;margin-bottom:4px;color:#718178;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.sr-table tr:not(.sr-detail-row) td:nth-child(2)::before{content:'Section'}.sr-table tr:not(.sr-detail-row) td:nth-child(3)::before{content:'Roll / admission'}.sr-table tr:not(.sr-detail-row) td:nth-child(4)::before{content:'Email'}.sr-table tr:not(.sr-detail-row) td:last-child{grid-column:1/-1;text-align:right}.sr-detail-row{display:block;border:1px solid #e1eae3;border-radius:12px;overflow:hidden}.sr-detail-row td{display:block;padding:12px!important;border:0}.sr-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sr-pagination{gap:8px;flex-wrap:wrap}}
        @media(max-width:380px){.sr-table tr:not(.sr-detail-row){grid-template-columns:1fr}.sr-table tr:not(.sr-detail-row) td:first-child,.sr-table tr:not(.sr-detail-row) td:last-child{grid-column:1}.sr-detail-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);

    const nav = document.querySelector('.sidebar-menu');
    let menu = nav?.querySelector('[data-section="students"]');
    if (!menu && nav) {
        menu = document.createElement('div'); menu.className = 'menu-item'; menu.dataset.section = 'students';
        menu.innerHTML = '<i class="fas fa-user-graduate"></i><span>Students Record</span>';
        nav.insertBefore(menu, nav.querySelector('[data-section="reports"]') || null);
    }

    let section = document.getElementById('studentsSection');
    if (!section || !section.querySelector('.sr-shell')) {
        if (!section) { section = document.createElement('section'); section.id = 'studentsSection'; }
        section.className = 'section-container';
        section.innerHTML = `
            <div class="header"><h1><i class="fas fa-user-graduate"></i> Students Record</h1><div class="teacher-info"><i class="fas fa-user-tie"></i></div></div>
            <div class="sr-shell">
                <div class="sr-hero"><div><p class="sr-kicker">School directory · assigned sections</p><h2>Student records</h2><p>Search and review student details for sections assigned to you.</p></div><div class="sr-count"><b id="srCount">0</b><span>Students shown</span><small id="srTotal">0 total records</small></div></div>
                <div class="sr-filters">
                    <div class="sr-field"><label for="srClass">Class / course</label><select id="srClass"><option value="">All my classes</option></select></div>
                    <div class="sr-field"><label for="srSection">Section</label><select id="srSection"><option value="">All my sections</option></select></div>
                    <div class="sr-field"><label for="srStatus">Account status</label><select id="srStatus"><option value="all">All students</option><option value="active">Active</option><option value="blocked">Blocked</option></select></div>
                    <div class="sr-field"><label for="srSort">Sort by</label><select id="srSort"><option value="name">Student name</option><option value="roll">Roll / admission number</option></select></div>
                    <div class="sr-field" style="grid-column:1/-1"><label for="srSearch">Search students</label><input id="srSearch" type="search" autocomplete="off" placeholder="Name, roll, email, phone, or guardian"></div>
                </div>
                <div class="sr-toolbar"><p class="sr-assignment" id="srAssignment" role="status" aria-live="polite">Sign in to load assigned sections.</p><div class="sr-actions"><button class="sr-button secondary" id="srClear" type="button"><i class="fas fa-filter-circle-xmark"></i> Clear filters</button><button class="sr-button" id="srExport" type="button"><i class="fas fa-file-export"></i> Export CSV</button><button class="sr-refresh" id="srRefresh" type="button"><i class="fas fa-rotate-right"></i> Refresh records</button></div></div>
                <div id="srResults"></div>
            </div>`;
        if (!section.isConnected) {
            const reports = document.getElementById('reportsSection'), settings = document.getElementById('settingsSection');
            (reports || settings || document.querySelector('.main-content .container'))?.insertBefore(section, reports || settings || null);
        }
    }

    if (menu) menu.addEventListener('click', event => {
        event.preventDefault();
        if (typeof window.switchTeacherSection === 'function') window.switchTeacherSection('students');
        else {
            document.querySelectorAll('.main-content .section-container').forEach(panel => {
                const active = panel === section; panel.classList.toggle('active', active); panel.style.display = active ? 'block' : 'none';
            });
        }
    });

    const classSelect = section.querySelector('#srClass');
    const sectionSelect = section.querySelector('#srSection');
    const statusSelect = section.querySelector('#srStatus');
    const sortSelect = section.querySelector('#srSort');
    const search = section.querySelector('#srSearch');
    const results = section.querySelector('#srResults');
    const assignment = section.querySelector('#srAssignment');
    const count = section.querySelector('#srCount');
    const total = section.querySelector('#srTotal');
    const state = { students: [], sections: [], loading: false, photosReady: false, page: 1, pageSize: 25 };

    function teacherRefs(record) {
        const found = [];
        ['teacherId', 'assignedTeacherId', 'teacherUid', 'assignedToTeacherId', 'teacherIds', 'assignedTeacherIds'].forEach(key => found.push(...values(record?.[key])));
        ['teacher', 'assignedTeacher', 'teachers'].forEach(key => {
            const value = record?.[key];
            if (typeof value === 'string') found.push(value);
            else if (Array.isArray(value)) value.forEach(item => found.push(typeof item === 'string' ? item : (item?.uid || item?.id || item?.email || '')));
            else if (value && typeof value === 'object') found.push(value.uid || value.id || value.email || '');
        });
        return found.map(value => String(value).trim().toLowerCase());
    }

    function assignedClassSections(profile, assignments) {
        const found = [];
        Object.entries(assignments || {}).forEach(([classId, sections]) => Object.values(sections || {}).forEach(record => {
            if (!record || String(record.teacherId || '') !== profile.id ||
                (record.schoolId && String(record.schoolId) !== String(profile.schoolId))) return;
            const section = String(record.section || '').trim();
            if (!section || norm(section) === 'general') return;
            found.push({
                classId: String(record.classId || classId).trim(),
                className: String(record.className || '').trim(),
                section,
                year: String(record.year || '').trim()
            });
        }));
        return [...new Map(found.map(item => [`${item.classId.toLowerCase()}|${norm(item.section)}`, item])).values()];
    }

    function studentMatchesAssignments(student, assigned) {
        const ids = [student.classId, student.courseId, student.enrolledClassId].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
        const names = [student.className, student.courseName, student.course, student.class, student.grade].map(normalizeName).filter(Boolean);
        const sectionName = norm(student.section);
        return assigned.some(item => norm(item.section) === sectionName && (
            (ids.length && ids.includes(item.classId.toLowerCase())) ||
            (!ids.length && item.className && names.includes(normalizeName(item.className)))
        ));
    }

    function getPhotoUrl(student) {
        const photo = String(student.profilePhoto || student.photoURL || student.photoUrl || student.profilePic || student.profileImage || student.avatar || student.photo || '').trim();
        if (/^https:\/\//i.test(photo)) return photo;
        const key = String(student.profilePhotoKey || photo).trim().replace(/^\/+/, '');
        const base = String(window.ROLLCALL_FIREBASE_CONFIG?.profilePhotoPublicBaseUrl || '').trim();
        if (!key || !base) return '';
        try { return new URL(key.split('/').map(encodeURIComponent).join('/'), base.endsWith('/') ? base : `${base}/`).href; }
        catch (_) { return ''; }
    }

    const photoKey = student => `teacher-student:${student.id}:${student.profilePhotoKey || getPhotoUrl(student)}`;
    async function cachePhotos(students) {
        const photos = students.map(student => ({ student, url: getPhotoUrl(student) })).filter(item => item.url);
        if (!photos.length) return;
        assignment.textContent = `Caching ${photos.length} student photos on this device…`;
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(5, photos.length) }, async () => {
            while (next < photos.length) {
                const item = photos[next++];
                item.student.photoCached = await window.RollCallImageCache?.cacheUrl(photoKey(item.student), item.url) || false;
            }
        }));
        state.photosReady = true;
        assignment.textContent = `${state.students.length} assigned student records loaded. Photos are cached for faster return visits.`;
        render();
    }

    function filteredStudents() {
        const term = search.value.trim().toLowerCase();
        let rows = state.students.filter(student =>
            (!classSelect.value || student.classFilterKey === classSelect.value) &&
            (!sectionSelect.value || norm(student.section) === norm(sectionSelect.value)) &&
            (statusSelect.value === 'all' || (statusSelect.value === 'blocked') === Boolean(student.blockRecord)) &&
            (!term || [student.name, student.fullName, student.displayName, student.email, student.phone, student.mobile, student.fatherName, student.motherName, student.classRoll, student.rollNumber, student.rollNo, student.admissionNumber, student.admissionNo].some(value => String(value || '').toLowerCase().includes(term)))
        );
        rows.sort((a, b) => sortSelect.value === 'roll'
            ? String(a.classRoll || a.rollNumber || a.rollNo || a.admissionNumber || a.admissionNo || '').localeCompare(String(b.classRoll || b.rollNumber || b.rollNo || b.admissionNumber || b.admissionNo || ''), undefined, { numeric: true })
            : String(a.name || a.fullName || a.displayName || '').localeCompare(String(b.name || b.fullName || b.displayName || '')));
        return rows;
    }

    function render() {
        const rows = filteredStudents();
        const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
        state.page = Math.min(state.page, pageCount);
        const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
        count.textContent = String(rows.length);
        total.textContent = `${state.students.length} total records`;
        if (state.loading) { results.innerHTML = '<div class="sr-empty"><i class="fas fa-spinner fa-spin"></i><strong>Loading student records</strong>Please wait.</div>'; return; }
        if (!state.sections.length) { results.innerHTML = '<div class="sr-empty"><i class="fas fa-lock"></i><strong>No sections assigned</strong>Your administrator has not assigned specific sections to your account. Student records remain hidden until then.</div>'; return; }
        if (!rows.length) { results.innerHTML = '<div class="sr-empty"><i class="fas fa-user-graduate"></i><strong>No matching students</strong>Try changing the class, section, status, or search filters.</div>'; return; }

        results.innerHTML = `<div class="sr-table-wrap"><table class="sr-table"><thead><tr><th>Student</th><th>Section</th><th>Roll / admission</th><th>Email</th><th>Access</th><th></th></tr></thead><tbody>${pageRows.map((student, index) => {
            const name = student.name || student.fullName || student.displayName || 'Student';
            const url = getPhotoUrl(student);
            const avatar = url && state.photosReady
                ? `<img class="sr-avatar" data-photo-url="${esc(url)}" data-image-cache-key="${esc(photoKey(student))}" data-preview-details="${esc(`${student.className || student.courseName || student.course || student.class || student.grade || ''}${student.section ? ` · Section ${student.section}` : ''}`)}" alt="${esc(name)} profile photo. Click to preview." role="button" tabindex="0" loading="lazy">`
                : `<span class="sr-avatar sr-avatar-fallback" aria-hidden="true">${esc(name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'S')}</span>`;
            const sectionName = student.section || '—';
            const roll = student.classRoll || student.rollNumber || student.rollNo || student.admissionNumber || student.admissionNo || '—';
            const blocked = Boolean(student.blockRecord);
            const details = [
                ['Email', student.email], ['Mobile', student.mobile || student.phone || student.phoneNumber],
                ['Father / guardian', student.fatherName || student.guardianName], ['Mother', student.motherName],
                ['Date of birth', student.dateOfBirth || student.dob || student.birthDate],
                ['Class', student.className || student.courseName || student.course || student.class || student.grade],
                ['Section', sectionName], ['Roll / admission', roll], ['University roll', student.univRoll],
                ['Academic year', student.academicYear || student.year], ['Status', blocked ? `Blocked${student.blockRecord.reason ? ` · ${student.blockRecord.reason}` : ''}` : 'Active']
            ].filter(([, value]) => value).map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
            const detailId = `sr-detail-${state.page}-${index}`;
            return `<tr><td><span class="sr-student">${avatar}<span class="sr-student-copy"><span class="sr-name">${esc(name)}</span><span class="sr-sub">${esc(student.className || student.courseName || student.course || student.class || student.grade || 'Student')}</span></span></span></td><td><span class="sr-pill">${esc(sectionName)}</span></td><td>${esc(roll)}</td><td>${esc(student.email || '—')}</td><td><span class="sr-pill" style="${blocked ? 'background:#fff2e2;color:#915e13' : ''}">${blocked ? 'Blocked' : 'Active'}</span></td><td><button type="button" class="sr-details-btn" data-detail="${detailId}" aria-expanded="false">Details</button></td></tr><tr class="sr-detail-row" id="${detailId}" hidden><td colspan="6"><div class="sr-detail-grid">${details}</div></td></tr>`;
        }).join('')}</tbody></table></div><div class="sr-pagination"><button class="sr-button secondary" type="button" data-page="prev" ${state.page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Previous</button><span class="sr-page-label">Page ${state.page} of ${pageCount} · ${rows.length} students</span><button class="sr-button secondary" type="button" data-page="next" ${state.page >= pageCount ? 'disabled' : ''}>Next <i class="fas fa-chevron-right"></i></button></div>`;

        results.querySelectorAll('.sr-avatar:not(.sr-avatar-fallback)').forEach(image => {
            const url = image.dataset.photoUrl;
            window.RollCallImageCache?.apply(image, url, image.dataset.imageCacheKey || url);
            const openPreview = () => window.TeacherStudentPhotoPreview?.open({
                src: image.currentSrc || image.src || url,
                name: image.alt.replace(/ profile photo\. Click to preview\.$/, ''),
                details: image.dataset.previewDetails || ''
            });
            image.addEventListener('click', openPreview);
            image.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPreview(); }
            });
            image.addEventListener('error', () => {
                const fallback = document.createElement('span'); fallback.className = 'sr-avatar sr-avatar-fallback'; fallback.setAttribute('aria-hidden', 'true');
                fallback.textContent = (image.alt || 'S').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(); image.replaceWith(fallback);
            }, { once: true });
        });
        results.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => {
            const row = document.getElementById(button.dataset.detail); if (!row) return;
            const open = row.hidden; row.hidden = !open; button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Hide details' : 'Details';
        }));
        results.querySelector('[data-page="prev"]')?.addEventListener('click', () => { state.page--; render(); });
        results.querySelector('[data-page="next"]')?.addEventListener('click', () => { state.page++; render(); });
    }

    function exportCsv() {
        const rows = filteredStudents();
        if (!rows.length) { assignment.textContent = 'There are no filtered records to export.'; return; }
        const columns = [
            ['Name', student => student.name || student.fullName || student.displayName], ['Email', student => student.email],
            ['Mobile', student => student.mobile || student.phone || student.phoneNumber], ['Class', student => student.className || student.courseName || student.course || student.class || student.grade],
            ['Section', student => student.section], ['Roll', student => student.classRoll || student.rollNumber || student.rollNo || student.admissionNumber || student.admissionNo],
            ['University roll', student => student.univRoll], ['Date of birth', student => student.dateOfBirth || student.dob || student.birthDate],
            ['Father or guardian', student => student.fatherName || student.guardianName], ['Status', student => student.blockRecord ? 'Blocked' : 'Active']
        ];
        const csvCell = value => {
            let text = String(value ?? '');
            if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        const csv = [columns.map(([label]) => label), ...rows.map(student => columns.map(([, value]) => value(student) || ''))]
            .map(row => row.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'assigned-students.csv'; link.click(); URL.revokeObjectURL(url);
        assignment.textContent = `Exported ${rows.length} filtered student record${rows.length === 1 ? '' : 's'}.`;
    }

    async function load(user) {
        if (!user) {
            Object.assign(state, { students: [], sections: [], loading: false, photosReady: false, page: 1 });
            assignment.textContent = 'Sign in to view assigned student records.'; classSelect.replaceChildren(new Option('All my classes', '')); sectionSelect.replaceChildren(new Option('All my sections', '')); render(); return;
        }
        state.loading = true; state.students = []; state.sections = []; state.photosReady = false; state.page = 1;
        assignment.classList.remove('sr-error'); assignment.textContent = 'Verifying teacher and assigned sections…'; render();
        try {
            const profileSnapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
            const profile = profileSnapshot.val() || {};
            if (String(profile.role || '').toLowerCase() !== 'teacher') throw new Error('Teacher account required.');
            profile.id = user.uid; profile.email = profile.email || user.email || '';
            if (!profile.schoolId) throw new Error('Your teacher account is not assigned to a school.');
            const [assignmentSnapshot, studentSnapshot, blockedSnapshot] = await Promise.all([
                firebase.database().ref(`classTeacherAssignmentsByClass/${profile.schoolId}`).once('value'),
                firebase.database().ref(`schoolUsers/${profile.schoolId}`).once('value'),
                firebase.database().ref('blockedUsers').once('value')
            ]);
            const blocked = blockedSnapshot.val() || {};
            const assigned = assignedClassSections(profile, assignmentSnapshot.val() || {});
            const sections = [...new Map(assigned.map(item => [norm(item.section), item.section])).values()];
            const uniqueSections = [...new Map(sections.map(value => [norm(value), value])).values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            sectionSelect.replaceChildren(new Option('All my sections', ''));
            uniqueSections.forEach(value => sectionSelect.add(new Option(value, value)));
            if (!uniqueSections.length) throw new Error('No class and section assignments were found for your teacher account.');

            studentSnapshot.forEach(child => {
                const student = child.val() || {};
                if ((student.schoolId && String(student.schoolId).trim() !== String(profile.schoolId)) ||
                    (student.role && String(student.role).toLowerCase() !== 'student') ||
                    !studentMatchesAssignments(student, assigned)) return;
                const className = student.className || student.courseName || student.course || student.class || student.grade || 'Class';
                const classFilterKey = normalizeName(student.classId || student.courseId || student.enrolledClassId || className);
                const sharedBlock = blocked[child.key];
                const blockRecord = sharedBlock && String(sharedBlock.schoolId || '').trim() === String(profile.schoolId) && String(sharedBlock.role || '').toLowerCase() === 'student'
                    ? sharedBlock
                    : student.blocked === true && String(student.blockedSchoolId || '').trim() === String(profile.schoolId) &&
                        (!student.blockedRole || String(student.blockedRole).toLowerCase() === 'student')
                        ? { reason: student.blockedReason || '' } : null;
                state.students.push({ ...student, id: child.key, className, classFilterKey, blockRecord });
            });
            const classes = [...new Map(state.students.map(student => [student.classFilterKey, student.className])).entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
            classSelect.replaceChildren(new Option('All my classes', ''));
            classes.forEach(([key, label]) => classSelect.add(new Option(label, key)));
            state.sections = uniqueSections; state.loading = false;
            assignment.textContent = `${state.students.length} students across ${classes.length} classes and ${uniqueSections.length} assigned sections.`;
            render();
            void cachePhotos(state.students);
        } catch (error) {
            console.error('Unable to load assigned student records:', error);
            Object.assign(state, { students: [], sections: [], loading: false, photosReady: false });
            classSelect.replaceChildren(new Option('All my classes', '')); sectionSelect.replaceChildren(new Option('All my sections', ''));
            assignment.textContent = error.message || 'Unable to verify teacher access.'; assignment.classList.add('sr-error'); render();
        }
    }

    [classSelect, sectionSelect, statusSelect, sortSelect].forEach(input => input.addEventListener('change', () => { state.page = 1; render(); }));
    search.addEventListener('input', () => { state.page = 1; render(); });
    section.querySelector('#srRefresh').addEventListener('click', () => load(firebase.auth().currentUser));
    section.querySelector('#srExport').addEventListener('click', exportCsv);
    section.querySelector('#srClear').addEventListener('click', () => {
        classSelect.value = ''; sectionSelect.value = ''; statusSelect.value = 'all'; sortSelect.value = 'name'; search.value = ''; state.page = 1; render();
    });
    firebase.auth().onAuthStateChanged(user => load(user));
});
