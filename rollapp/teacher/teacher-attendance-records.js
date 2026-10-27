/* Admin-style daily attendance records for the authenticated teacher's school. */
(function () {
    'use strict';
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
    const dateKey = date => {
        const d = new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    let schoolId = '';
    let classes = [];
    let studentsById = {};
    let displayedRows = [];
    let institutionType = 'school';

    function isSchoolMode() {
        return institutionType === 'school' || institutionType === 'k12';
    }

    function updateModeCopy() {
        const school = isSchoolMode();
        const description = document.getElementById('tarDescription');
        const locationLabel = document.getElementById('tarLocationLabel');
        const locationSelect = document.getElementById('tarLocation');
        if (description) description.textContent = school ? 'Manage daily attendance for your school' : 'Manage daily attendance for your college';
        if (locationLabel) locationLabel.textContent = school ? 'Class / section' : 'Class / location';
        if (locationSelect?.options?.[0]) locationSelect.options[0].textContent = school ? 'All classes and sections' : 'All classes and locations';
    }

    function belongsToSchool(item) {
        if (!item || !schoolId) return false;
        const owner = item.schoolId || item.institutionId || item.organizationId;
        return !owner || String(owner) === String(schoolId);
    }

    function makePanel() {
        const section = document.getElementById('attendanceSection');
        if (!section || document.getElementById('teacherAdminRecords')) return;
        const panel = document.createElement('section');
        panel.id = 'teacherAdminRecords';
        panel.className = 'teacher-admin-records';
        panel.innerHTML = `
            <header class="tar-header">
                <div class="tar-title"><span class="tar-icon"><i class="fas fa-clipboard-list"></i></span><div><h2 id="tarTitle">Attendance Records</h2><p id="tarDescription">Manage daily attendance</p></div></div>
                <button type="button" class="tar-button tar-button-light" id="tarExport"><i class="fas fa-file-export"></i> Export Data</button>
            </header>
            <div class="tar-filters">
                <label><span><i class="fas fa-calendar-alt"></i> Select date</span><input type="date" id="tarDate"></label>
                <label><span><i class="fas fa-map-marker-alt"></i> <span id="tarLocationLabel">Class / location</span></span><select id="tarLocation"><option value="all">All classes and locations</option></select></label>
                <label><span><i class="fas fa-filter"></i> Status</span><select id="tarStatus"><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option><option value="onDuty">On duty</option><option value="unmarked">Unmarked</option></select></label>
                <button type="button" class="tar-button tar-button-primary" id="tarLoad"><i class="fas fa-search"></i> Load records</button>
            </div>
            <div class="tar-summary" aria-live="polite">
                <div><span>Students</span><strong id="tarTotal">—</strong></div><div><span>Present</span><strong id="tarPresent">—</strong></div><div><span>Absent</span><strong id="tarAbsent">—</strong></div><div><span>Late</span><strong id="tarLate">—</strong></div><div><span>Excused</span><strong id="tarExcused">—</strong></div><div><span>Attendance rate</span><strong id="tarRate">—</strong></div>
            </div>
            <div class="tar-search"><i class="fas fa-search"></i><input id="tarSearch" type="search" placeholder="Search name, email, roll number or student ID" aria-label="Search attendance records"><span id="tarResultCount"></span></div>
            <div id="tarResults" class="tar-results"><div class="tar-empty"><i class="fas fa-calendar-check"></i><h3>Choose a date to load records</h3><p>Attendance records will appear here, grouped by class.</p></div></div>`;
        const header = section.querySelector(':scope > .header');
        const locationManager = section.querySelector('.location-manager');
        if (locationManager) section.insertBefore(panel, locationManager);
        else if (header) header.insertAdjacentElement('afterend', panel);
        else section.prepend(panel);
        setTimeout(() => {
            const currentManager = section.querySelector('.location-manager');
            if (currentManager && currentManager.parentNode === section && panel.isConnected) section.insertBefore(panel, currentManager);
        }, 0);
        addStyles();
        document.getElementById('tarLoad').addEventListener('click', loadRecords);
        document.getElementById('tarDate').addEventListener('change', loadRecords);
        document.getElementById('tarLocation').addEventListener('change', renderRows);
        document.getElementById('tarStatus').addEventListener('change', renderRows);
        document.getElementById('tarSearch').addEventListener('input', renderRows);
        document.getElementById('tarExport').addEventListener('click', exportRows);
        document.getElementById('tarDate').value = dateKey(new Date());
    }

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
        .teacher-admin-records{margin:0 0 22px;padding:22px;background:#fff;border:1px solid #e0e9e2;border-radius:18px;box-shadow:0 8px 24px rgba(24,50,34,.055);color:#26372c;overflow:hidden}
        .tar-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}.tar-title{display:flex;align-items:center;gap:13px;min-width:0}.tar-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:#e8f4eb;color:#176b4d;font-size:18px;flex:0 0 auto}.tar-title h2{margin:0;font-size:20px;color:#22372a}.tar-title p{margin:4px 0 0;color:#78857c;font-size:13px}.tar-header .tar-button{width:auto!important;min-width:0!important;flex:0 0 auto!important;white-space:nowrap}
        .tar-button{min-height:42px;padding:0 15px;border-radius:10px;border:1px solid #dce6df;background:#fff;color:#33473b;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.tar-button:hover{filter:brightness(.97)}.tar-button-primary{background:#176b4d;color:#fff;border-color:#176b4d}.tar-filters{display:grid;grid-template-columns:1fr 1.25fr 1fr auto;gap:12px;padding:16px;background:#f7faf8;border:1px solid #e7eee9;border-radius:14px;align-items:end}.tar-filters label{display:grid;gap:7px;min-width:0}.tar-filters label span{font-size:11px;font-weight:750;color:#5f7065}.tar-filters label i{color:#176b4d;margin-right:5px}.tar-filters input,.tar-filters select,.tar-search input{width:100%;height:43px;padding:0 12px;border:1px solid #dce6df;border-radius:9px;background:#fff;color:#27382e;font:inherit;min-width:0}.tar-summary{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));gap:10px;margin:16px 0}.tar-summary div{padding:14px;border:1px solid #e6ede8;border-radius:12px;background:#fff}.tar-summary span{display:block;color:#77847b;font-size:11px}.tar-summary strong{display:block;margin-top:5px;color:#1f3e2c;font-size:22px}.tar-search{display:flex;align-items:center;gap:9px;margin:10px 0 14px;padding:0 12px;border:1px solid #e1e9e3;border-radius:10px;background:#fff}.tar-search>i{color:#718078}.tar-search input{border:0;outline:0;flex:1}.tar-search span{white-space:nowrap;color:#758178;font-size:12px}.tar-results{overflow:auto}.tar-group{margin:14px 0 18px;border:1px solid #e3ebe5;border-radius:13px;overflow:hidden}.tar-group-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 16px;background:#f4f8f5}.tar-group-heading strong{font-size:14px}.tar-group-heading span{color:#758178;font-size:12px}.tar-table{width:100%;border-collapse:collapse;min-width:660px}.tar-table th{padding:11px 14px;text-align:left;background:#fbfcfb;color:#68776d;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #e7ede8}.tar-table td{padding:12px 14px;border-bottom:1px solid #edf1ee;font-size:13px}.tar-table tr:last-child td{border-bottom:0}.tar-student{font-weight:700;color:#283b30}.tar-muted{display:block;color:#87928a;font-size:11px;margin-top:3px}.tar-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef2ef;color:#59675e;font-size:11px;font-weight:750}.tar-badge.present{background:#e9f6ec;color:#176b4d}.tar-badge.absent{background:#fff0ee;color:#b14840}.tar-badge.late{background:#fff6df;color:#976911}.tar-empty{padding:38px 20px;text-align:center;color:#758178;border:1px dashed #dce6df;border-radius:13px}.tar-empty i{font-size:25px;color:#a3b2a7}.tar-empty h3{margin:10px 0 5px;color:#33443a;font-size:15px}.tar-empty p{margin:0;font-size:12px}
        @media(max-width:860px){.tar-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tar-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:560px){.teacher-admin-records{padding:14px;border-radius:14px}.tar-header{align-items:flex-start;flex-direction:column}.tar-header .tar-button{width:100%}.tar-filters{grid-template-columns:1fr}.tar-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.tar-search{padding-left:9px}.tar-search span{font-size:10px}}
        `;
        document.head.appendChild(style);
    }

    async function initializeForTeacher() {
        makePanel();
        if (!window.firebase || !firebase.auth().currentUser) return;
        try {
            const user = firebase.auth().currentUser;
            const profileSnap = await firebase.database().ref('users/' + user.uid).once('value');
            const profile = profileSnap.val();
            if (!profile || profile.role !== 'teacher' || !profile.schoolId) {
                document.getElementById('tarResults').innerHTML = '<div class="tar-empty"><i class="fas fa-lock"></i><h3>School assignment required</h3><p>Your teacher account must be assigned to a school before attendance records can be displayed.</p></div>';
                return;
            }
            schoolId = profile.schoolId;
            const [institutionSnap, locationsSnap, classesSnap, studentsSnap] = await Promise.all([
                firebase.database().ref(`schools/${schoolId}`).once('value'),
                firebase.database().ref(`schoolLocations/${schoolId}`).once('value'),
                firebase.database().ref(`schoolClasses/${schoolId}`).once('value'),
                firebase.database().ref(`schoolUsers/${schoolId}`).once('value')
            ]);
            const institution = institutionSnap.val() || {};
            institutionType = String(institution.type || institution.institutionType || profile.institutionType || 'school').toLowerCase();
            updateModeCopy();
            classes = [];
            [locationsSnap, classesSnap].forEach(snapshot => snapshot.forEach(child => {
                const item = child.val() || {};
                item.id = item.id || child.key;
                if (belongsToSchool(item) && !classes.some(existing => existing.id === item.id)) classes.push(item);
            }));
            studentsById = {};
            studentsSnap.forEach(child => {
                const student = child.val() || {};
                if (!belongsToSchool(student)) return;
                studentsById[student.id || child.key] = student;
            });

            // School Mode attendance is stored against the generated
            // class-section card id (ct_<class>_<section>), not the raw
            // schoolClasses key. Reuse the same card source used by the
            // attendance sheet so records query the exact saved path.
            if (isSchoolMode() && typeof window.loadSchoolClassCards === 'function') {
                try {
                    await window.loadSchoolClassCards();
                    const generatedCards = Array.isArray(window._teacherClassCards) ? window._teacherClassCards : [];
                    if (generatedCards.length) {
                        classes = generatedCards
                            .filter(card => belongsToSchool(card))
                            .map(card => ({
                                ...card,
                                id: card.id,
                                name: card.name || `${card.className || 'Class'} · Section ${card.section || ''}`,
                                className: card.className || card.name || 'Class'
                            }));
                    }
                } catch (error) {
                    console.warn('Could not load generated school class cards for records:', error);
                }
            }
            const select = document.getElementById('tarLocation');
            select.innerHTML = `<option value="all">${isSchoolMode() ? 'All classes and sections' : 'All classes and locations'}</option>`;
            classes.sort((a, b) => String(a.name || a.className || '').localeCompare(String(b.name || b.className || ''))).forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name || item.className || item.location || 'Class';
                select.appendChild(option);
            });
            await loadRecords();
        } catch (error) {
            console.error('Unable to initialize teacher attendance records:', error);
            const results = document.getElementById('tarResults');
            if (results) results.innerHTML = `<div class="tar-empty"><i class="fas fa-triangle-exclamation"></i><h3>Records could not be loaded</h3><p>${esc(error.message || 'Please try again.')}</p></div>`;
        }
    }

    async function loadRecords() {
        const host = document.getElementById('tarResults');
        if (!host) return;
        if (!schoolId) {
            host.innerHTML = '<div class="tar-empty"><i class="fas fa-spinner fa-spin"></i><h3>Loading school records</h3></div>';
            return;
        }
        host.innerHTML = '<div class="tar-empty"><i class="fas fa-spinner fa-spin"></i><h3>Loading attendance records</h3></div>';
        const date = document.getElementById('tarDate').value;
        try {
            const selectedClass = document.getElementById('tarLocation').value;
            const targetClasses = selectedClass === 'all' ? classes : classes.filter(item => item.id === selectedClass);
            const snapshots = await Promise.all(targetClasses.map(item => firebase.database().ref(`attendance_by_location/${item.id}/${date}`).once('value')));
            displayedRows = [];
            snapshots.forEach((snapshot, index) => {
                const session = snapshot.val();
                    if (!session || !session._meta || String(session._meta.schoolId || '') !== String(schoolId)) return;
                const item = targetClasses[index];
                Object.keys(session).forEach(key => {
                    if (key.startsWith('_') || key.endsWith('_record') || key.endsWith('_remark') || key.endsWith('_verification')) return;
                    const student = studentsById[key] || {};
                    const detail = session[key + '_record'] || {};
                    const rawRecord = session[key];
                    let status = String(detail.status || (rawRecord && typeof rawRecord === 'object' ? rawRecord.status || rawRecord.attendanceStatus : rawRecord) || 'unmarked').toLowerCase();
                    if (status === 'onduty') status = 'onDuty';
                    displayedRows.push({ classId: item.id, className: session._meta.className || item.name || item.className || item.location || 'Class', studentId: key, name: student.name || student.fullName || 'Student', email: student.email || '', roll: student.classRoll || student.univRoll || student.registrationId || '', status, time: detail.updatedAt ? new Date(detail.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (rawRecord && typeof rawRecord === 'object' && rawRecord.time || ''), verification: detail.verificationStatus || session[key + '_verification'] || 'notRequired', remark: detail.remark || session[key + '_remark'] || '' });
                });
            });
            renderRows();
        } catch (error) {
            host.innerHTML = `<div class="tar-empty"><i class="fas fa-circle-exclamation"></i><h3>Records could not be loaded</h3><p>${esc(error.message || 'Check your connection and try again.')}</p></div>`;
        }
    }

    function renderRows() {
        const host = document.getElementById('tarResults');
        if (!host) return;
        const filter = document.getElementById('tarStatus').value;
        const query = document.getElementById('tarSearch').value.trim().toLowerCase();
        const rows = displayedRows.filter(row => (filter === 'all' || row.status === filter) && (!query || [row.name,row.email,row.roll,row.studentId,row.className].join(' ').toLowerCase().includes(query)));
        const counts = {present:0,absent:0,late:0,excused:0,onDuty:0,unmarked:0};
        displayedRows.forEach(row => { if (Object.prototype.hasOwnProperty.call(counts,row.status)) counts[row.status]++; });
        const total = displayedRows.length;
        [['tarTotal',total],['tarPresent',counts.present],['tarAbsent',counts.absent],['tarLate',counts.late],['tarExcused',counts.excused+counts.onDuty],['tarRate',(total ? Math.round((counts.present+counts.late)/total*100) : 0)+'%']].forEach(([id,value]) => { document.getElementById(id).textContent = value; });
        document.getElementById('tarResultCount').textContent = rows.length + ' records';
        if (!rows.length) { host.innerHTML = `<div class="tar-empty"><i class="fas fa-inbox"></i><h3>${displayedRows.length ? 'No matching records' : 'No attendance records for this date'}</h3><p>${displayedRows.length ? 'Try changing the status or search filter.' : 'Choose another date or select a class with saved attendance.'}</p></div>`; return; }
        const grouped = {};
        rows.forEach(row => (grouped[row.classId] ||= {name:row.className,rows:[]}).rows.push(row));
        host.innerHTML = Object.values(grouped).map(group => `<section class="tar-group"><header class="tar-group-heading"><strong><i class="fas fa-map-marker-alt" style="color:#176b4d;margin-right:7px"></i>${esc(group.name)}</strong><span>${group.rows.length} student records</span></header><table class="tar-table"><thead><tr><th>Student</th><th>Roll number</th><th>Status</th><th>Check-in</th><th>Verification</th><th>Remarks</th></tr></thead><tbody>${group.rows.map(row => `<tr><td><span class="tar-student">${esc(row.name)}</span><span class="tar-muted">${esc(row.email || row.studentId)}</span></td><td>${esc(row.roll || '—')}</td><td><span class="tar-badge ${esc(row.status)}">${esc(row.status === 'onDuty' ? 'On duty' : row.status.charAt(0).toUpperCase()+row.status.slice(1))}</span></td><td>${esc(row.time || '—')}</td><td>${esc(row.verification)}</td><td>${esc(row.remark || '—')}</td></tr>`).join('')}</tbody></table></section>`).join('');
    }

    function exportRows() {
        const rows = displayedRows.filter(row => {
            const filter = document.getElementById('tarStatus').value;
            const query = document.getElementById('tarSearch').value.trim().toLowerCase();
            return (filter === 'all' || row.status === filter) && (!query || [row.name,row.email,row.roll,row.studentId,row.className].join(' ').toLowerCase().includes(query));
        });
        if (!rows.length) return;
        const csv = [['Class','Date','Student','Email','Roll number','Status','Check-in','Verification','Remarks'], ...rows.map(row => [row.className, document.getElementById('tarDate').value, row.name, row.email, row.roll, row.status, row.time, row.verification, row.remark])].map(record => record.map(value => '"' + String(value == null ? '' : value).replace(/"/g,'""') + '"').join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = 'attendance-' + document.getElementById('tarDate').value + '.csv'; link.click(); URL.revokeObjectURL(url);
    }

    document.addEventListener('DOMContentLoaded', function () {
        makePanel();
        if (!window.firebase) return;
        firebase.auth().onAuthStateChanged(user => { if (user) initializeForTeacher(); });
    });
}());
