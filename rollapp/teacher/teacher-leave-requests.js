// Teacher leave applications are routed to the administrator for the teacher's school.
(() => {
  function initializeTeacherLeaveRequests() {
    const sidebar = document.querySelector('.sidebar-menu');
    const container = document.querySelector('.main-content .container');
    if (!sidebar || !container || !window.firebase?.database || !window.firebase?.auth) return;
    if (document.getElementById('teacherLeaveRequestsSection')) return;

    const style = document.createElement('style');
    style.textContent = `.tlr-shell{max-width:1100px;margin:0 auto;color:#263b30}.tlr-hero,.tlr-card{background:#fff;border:1px solid #deebe1;border-radius:18px;padding:22px;margin:16px 0;box-shadow:0 10px 28px #1835220a}.tlr-hero{background:linear-gradient(115deg,#fff,#eff8f1)}.tlr-hero h2{margin:0;font-size:24px}.tlr-hero p,.tlr-muted{color:#718178;line-height:1.55}.tlr-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tlr-field{display:grid;gap:6px}.tlr-field.wide{grid-column:1/-1}.tlr-field label{font-size:12px;font-weight:750;color:#52665a}.tlr-field input,.tlr-field select,.tlr-field textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d8e6dc;border-radius:10px;background:#fff;font:inherit;color:#263b30}.tlr-field textarea{min-height:110px;resize:vertical}.tlr-submit{padding:12px 18px;border:0;border-radius:10px;background:#176d4d;color:#fff;font:inherit;font-weight:750;cursor:pointer}.tlr-submit:disabled{opacity:.6;cursor:wait}.tlr-alert{margin-top:10px;min-height:20px;font-size:13px;color:#637469}.tlr-alert.error{color:#a13f39}.tlr-alert.success{color:#176d4d}.tlr-table-wrap{overflow:auto}.tlr-table{width:100%;border-collapse:collapse;min-width:600px}.tlr-table th,.tlr-table td{padding:12px;text-align:left;border-bottom:1px solid #e8eee9;font-size:13px}.tlr-table th{color:#637469;background:#f6faf6}.tlr-status{font-size:11px;font-weight:800;text-transform:uppercase}.tlr-status.pending{color:#9a6b0b}.tlr-status.approved{color:#176d4d}.tlr-status.rejected{color:#a13f39}@media(max-width:680px){.tlr-form{grid-template-columns:1fr}.tlr-field.wide{grid-column:auto}.tlr-card,.tlr-hero{padding:16px}}`;
    document.head.appendChild(style);

    let nav = sidebar.querySelector('[data-section="teacherLeaveRequests"]');
    if (!nav) {
      nav = document.createElement('div'); nav.className = 'menu-item'; nav.dataset.section = 'teacherLeaveRequests';
      nav.innerHTML = '<i class="fas fa-file-signature"></i><span>My Leave Requests</span>';
      sidebar.insertBefore(nav, sidebar.querySelector('[data-section="settings"]') || null);
    }
    const panel = document.createElement('section'); panel.id = 'teacherLeaveRequestsSection'; panel.className = 'section-container';
    panel.innerHTML = `<div class="tlr-shell"><div class="header"><h1><i class="fas fa-file-signature"></i> My Leave Requests</h1><div class="teacher-info" id="tlrTeacherInfo"></div></div><div class="tlr-hero"><h2>Request time away</h2><p>Your request is sent privately to the administrator of your school. You can follow its status below.</p></div><div class="tlr-card"><form id="tlrForm" class="tlr-form"><div class="tlr-field"><label for="tlrType">Request type</label><select id="tlrType" required><option value="Casual Leave">Casual Leave</option><option value="Medical Leave">Medical Leave</option><option value="On-Duty (OD)">On-Duty (OD)</option><option value="Emergency Leave">Emergency Leave</option><option value="Other">Other</option></select></div><div class="tlr-field"><label for="tlrFrom">From</label><input id="tlrFrom" type="date" required></div><div class="tlr-field"><label for="tlrTo">To</label><input id="tlrTo" type="date" required></div><div class="tlr-field wide"><label for="tlrReason">Reason</label><textarea id="tlrReason" maxlength="2000" required placeholder="Add the details your administrator needs to review"></textarea></div><div class="tlr-field wide"><button id="tlrSubmit" class="tlr-submit" type="submit"><i class="fas fa-paper-plane"></i> Send request to school admin</button><div id="tlrAlert" class="tlr-alert" role="status" aria-live="polite"></div></div></form></div><div class="tlr-card"><h2>My requests</h2><p class="tlr-muted">Only requests submitted by your account are shown here.</p><div id="tlrHistory" class="tlr-table-wrap">Loading requests…</div></div></div>`;
    container.appendChild(panel);

    const show = (target) => {
      document.querySelectorAll('.main-content .section-container').forEach(section => {
        const active = section === target;
        section.classList.toggle('active', active);
        section.style.display = active ? 'block' : 'none';
        section.setAttribute('aria-hidden', String(!active));
      });
      sidebar.querySelectorAll('.menu-item').forEach(item => {
        const active = item === nav;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
      });
    nav.addEventListener('click', event => {
        event.preventDefault();
        if (typeof window.switchTeacherSection === 'function') {
            window.switchTeacherSection('teacherLeaveRequests');
            return;
        }
        event.stopPropagation();
        show(panel);
    });
    const db = firebase.database();
    const status = document.getElementById('tlrAlert');
    let uid = '', schoolId = '', teacherProfile = {};
    function renderHistory(data) {
      const entries = Object.entries(data || {}).map(([id, row]) => ({ id, ...row })).sort((a,b) => (Number(b.createdAt)||0)-(Number(a.createdAt)||0));
      const target = document.getElementById('tlrHistory');
      if (!entries.length) { target.innerHTML = '<div class="tlr-muted">You have not submitted any leave requests.</div>'; return; }
      target.innerHTML = `<table class="tlr-table"><thead><tr><th>Type</th><th>Dates</th><th>Reason</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${entries.map(row => { const state=String(row.status||'Pending Review'); const cls=state.toLowerCase().includes('approv')?'approved':state.toLowerCase().includes('reject')?'rejected':'pending'; return `<tr><td>${escapeHtml(row.type||'Leave')}</td><td>${escapeHtml(row.from||'')} – ${escapeHtml(row.to||'')}</td><td>${escapeHtml(row.reason||'')}</td><td>${new Date(Number(row.createdAt)||Date.now()).toLocaleDateString()}</td><td><span class="tlr-status ${cls}">${escapeHtml(state)}</span>${row.rejectionReason?`<div class="tlr-muted">${escapeHtml(row.rejectionReason)}</div>`:''}</td></tr>`; }).join('')}</tbody></table>`;
    }
    function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    firebase.auth().onAuthStateChanged(async user => {
      if (!user) { nav.style.display='none'; return; }
      uid=user.uid;
      try {
        const snap=await db.ref(`users/${uid}`).once('value'); teacherProfile=snap.val()||{};
        if (teacherProfile.role !== 'teacher' || !teacherProfile.schoolId) { nav.style.display='none'; return; }
        schoolId=String(teacherProfile.schoolId); nav.style.display='flex';
        document.getElementById('tlrTeacherInfo').textContent=teacherProfile.name||user.displayName||user.email||'Teacher';
        db.ref(`teacher_leave_requests/${schoolId}/${uid}`).on('value',s=>renderHistory(s.val()),err=>{document.getElementById('tlrHistory').textContent='Could not load requests: '+err.message;});
      } catch (error) { nav.style.display='none'; status.textContent='Could not load your teacher profile.'; }
    });
    document.getElementById('tlrForm').addEventListener('submit', async event => {
      event.preventDefault();
      const submit=document.getElementById('tlrSubmit');
      const from=document.getElementById('tlrFrom').value, to=document.getElementById('tlrTo').value, reason=document.getElementById('tlrReason').value.trim();
      if (!uid||!schoolId) { status.textContent='Your teacher account is not linked to a school.'; status.className='tlr-alert error'; return; }
      if (to < from) { status.textContent='The end date must be on or after the start date.'; status.className='tlr-alert error'; return; }
      submit.disabled=true; status.textContent='Sending request…'; status.className='tlr-alert';
      try {
        const ref=db.ref(`teacher_leave_requests/${schoolId}/${uid}`).push(); const createdAt=Date.now();
        const request={requesterRole:'teacher',teacherId:uid,schoolId,teacherName:teacherProfile.name||firebase.auth().currentUser?.displayName||'',teacherEmail:firebase.auth().currentUser?.email||teacherProfile.email||'',type:document.getElementById('tlrType').value,from,to,reason,status:'Pending Review',createdAt};
        await ref.set(request);
        const noticeRef=db.ref('notifications').push();
        await noticeRef.set({recipientType:'specific',recipients:[schoolId],type:'leave_request',header:'Teacher leave request',body:`${request.teacherName||request.teacherEmail||'A teacher'} submitted ${request.type} (${from} to ${to}).`,senderRole:'teacher',senderId:uid,schoolId,timestamp:createdAt});
        event.target.reset(); status.textContent='Request sent to your school administrator.'; status.className='tlr-alert success';
      } catch(error) { status.textContent='Could not send request: '+error.message; status.className='tlr-alert error'; }
      finally { submit.disabled=false; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeTeacherLeaveRequests, {once:true}); else initializeTeacherLeaveRequests();
})();
