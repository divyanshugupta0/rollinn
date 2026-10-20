/* Real reports from school-owned attendance sessions; no generated sample data. */
document.addEventListener('DOMContentLoaded', function () {
    let reportRows = [];
    const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const alertReport = (message, type) => {
        const el = document.getElementById('reportsAlert');
        if (!el) return;
        el.textContent = message;
        el.className = 'alert alert-' + (type || 'info');
        el.style.display = 'block';
    };
    async function collectRows() {
        if (typeof currentTeacher === 'undefined' || !currentTeacher || !currentTeacher.schoolId) throw new Error('Your teacher account has no school assignment.');
        const classId = document.getElementById('reportClassSelect')?.value || 'all';
        const from = document.getElementById('reportStartDate')?.value || '';
        const to = document.getElementById('reportEndDate')?.value || '';
        const classes = (activeClasses || []).filter(item => item.schoolId === currentTeacher.schoolId || (item.locationData && item.locationData.schoolId === currentTeacher.schoolId));
        const targets = classId === 'all' ? classes : classes.filter(item => item.id === classId);
        const all = [];
        for (const cls of targets) {
            const snap = await firebase.database().ref('attendance_by_location/' + cls.id).once('value');
            if (!snap.exists()) continue;
            snap.forEach(daySnap => {
                const data = daySnap.val() || {};
                const meta = data._meta || {};
                const date = String(meta.date || daySnap.key);
                if (meta.schoolId !== currentTeacher.schoolId) return;
                if (from && date < from || to && date > to) return;
                Object.keys(data).forEach(studentId => {
                    if (studentId === '_meta' || studentId.endsWith('_record') || studentId.endsWith('_remark') || studentId.endsWith('_verification')) return;
                    const record = data[studentId + '_record'] || {};
                    const status = String(record.status || data[studentId] || 'unmarked');
                    all.push({ date, classId: cls.id, className: cls.name || cls.className || cls.location || cls.id, studentId, status, time: record.updatedAt ? new Date(record.updatedAt).toLocaleTimeString() : (meta.time || ''), actorId: record.actorId || meta.teacherId || '' });
                });
            });
        }
        return all;
    }
    function render(rows, type) {
        const host = document.getElementById('reportResults');
        const counts = rows.reduce((sum, row) => { sum[row.status] = (sum[row.status] || 0) + 1; return sum; }, {});
        const present = (counts.present || 0) + (counts.late || 0);
        const marked = rows.filter(row => row.status !== 'unmarked').length;
        const totalSessions = new Set(rows.map(row => row.classId + '|' + row.date)).size;
        const values = { totalPresentCount: present, totalAbsentCount: counts.absent || 0, attendanceRateValue: (marked ? Math.round(present / marked * 100) : 0) + '%', totalClassesCount: totalSessions };
        Object.keys(values).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = values[id]; });
        if (!rows.length) {
            host.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No school-owned attendance records match these filters.</p></div>';
            return;
        }
        let body = '';
        if (type === 'summary') {
            const sessions = {};
            rows.forEach(row => { const key = row.className + '|' + row.date; (sessions[key] ||= {className:row.className,date:row.date,present:0,absent:0,total:0}); sessions[key].total++; if (['present','late'].includes(row.status)) sessions[key].present++; if (row.status === 'absent') sessions[key].absent++; });
            body = Object.values(sessions).map(s => '<tr><td>'+escapeHtml(s.className)+'</td><td>'+escapeHtml(s.date)+'</td><td>'+s.present+'</td><td>'+s.absent+'</td><td>'+ (s.total ? Math.round(s.present/s.total*100) : 0) +'%</td></tr>').join('');
            host.innerHTML = '<h3>Attendance summary</h3><div class="rc-report-scroll"><table class="report-table"><thead><tr><th>Class</th><th>Date</th><th>Present / late</th><th>Absent</th><th>Rate</th></tr></thead><tbody>'+body+'</tbody></table></div>';
        } else if (type === 'student') {
            const people = {};
            rows.forEach(r => { const p = people[r.studentId] ||= {id:r.studentId,present:0,absent:0,total:0,last:''}; p.total++; if (['present','late'].includes(r.status)) p.present++; if (r.status==='absent') p.absent++; if (r.date>p.last) p.last=r.date; });
            body = Object.values(people).map(p => '<tr><td>'+escapeHtml(p.id)+'</td><td>'+p.present+'</td><td>'+p.absent+'</td><td>'+Math.round(p.present/p.total*100)+'%</td><td>'+escapeHtml(p.last)+'</td></tr>').join('');
            host.innerHTML = '<h3>Student-wise attendance (IDs only)</h3><div class="rc-report-scroll"><table class="report-table"><thead><tr><th>Student ID</th><th>Present / late</th><th>Absent</th><th>Rate</th><th>Last session</th></tr></thead><tbody>'+body+'</tbody></table></div>';
        } else {
            body = rows.map(r => '<tr><td>'+escapeHtml(r.date)+'</td><td>'+escapeHtml(r.className)+'</td><td>'+escapeHtml(r.studentId)+'</td><td>'+escapeHtml(r.status)+'</td><td>'+escapeHtml(r.time)+'</td></tr>').join('');
            host.innerHTML = '<h3>Attendance register</h3><div class="rc-report-scroll"><table class="report-table"><thead><tr><th>Date</th><th>Class</th><th>Student ID</th><th>Status</th><th>Time</th></tr></thead><tbody>'+body+'</tbody></table></div>';
        }
        const charts = document.getElementById('reportCharts');
        if (charts) { charts.style.display = 'block'; charts.innerHTML = '<div class="chart-container"><h3>Recorded statuses</h3><p>Present/late: '+present+' · Absent: '+(counts.absent||0)+' · Excused: '+((counts.excused||0)+(counts.onDuty||0))+' · Unmarked: '+(counts.unmarked||0)+'</p></div>'; }
    }
    document.getElementById('generateReportBtn')?.addEventListener('click', async function () {
        const host = document.getElementById('reportResults');
        host.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Loading saved attendance...</p></div>';
        try {
            const select = document.getElementById('reportClassSelect');
            const selected = select?.value || 'all';
            if (select && select.options.length <= 1) (activeClasses || []).filter(item => item.schoolId === currentTeacher.schoolId || (item.locationData && item.locationData.schoolId === currentTeacher.schoolId)).forEach(item => select.add(new Option(item.name || item.className || item.location || item.id, item.id)));
            if (select && selected !== 'all') select.value = selected;
            reportRows = await collectRows();
            render(reportRows, document.getElementById('reportType')?.value || 'summary');
            alertReport('Report generated from saved attendance records.', 'success');
        }
        catch (error) { host.innerHTML = '<div class="empty-state">'+escapeHtml(error.message || 'Unable to load report')+'</div>'; alertReport(error.message || 'Report failed.', 'error'); }
    });
    document.getElementById('exportReportBtn')?.addEventListener('click', function () {
        if (!reportRows.length) return alertReport('Generate a report with matching records before exporting.', 'error');
        const csv = [['Date','Class','Student ID','Status','Time','Actor'], ...reportRows.map(r => [r.date,r.className,r.studentId,r.status,r.time,r.actorId])].map(row => row.map(value => '"' + String(value == null ? '' : value).replace(/"/g,'""') + '"').join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = 'rollcall-attendance.csv'; link.click(); URL.revokeObjectURL(url);
        alertReport('CSV exported from saved attendance records.', 'success');
    });
    document.getElementById('printReportBtn')?.addEventListener('click', () => window.print());
    document.getElementById('emailReportBtn')?.addEventListener('click', () => alertReport('Email delivery is not configured for this project.', 'info'));
    const style = document.createElement('style');
    style.textContent = '.rc-report-scroll{overflow:auto}.rc-report-scroll table{width:100%;border-collapse:collapse}.rc-report-scroll th,.rc-report-scroll td{padding:10px;border-bottom:1px solid #e5ebe7;text-align:left}.rc-report-scroll th{background:#f4f8f5}';
    document.head.appendChild(style);
});
