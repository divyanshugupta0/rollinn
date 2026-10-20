// Class teachers review profile requests from students in their own assigned sections.
function initializeClassTeacherRequests() {
    const sidebar = document.querySelector('.sidebar-menu');
    const container = document.querySelector('.main-content .container');
    if (!sidebar || !container) return;
    if (!window.firebase?.database || !window.firebase?.auth) {
        window.addEventListener('load', initializeClassTeacherRequests, {once:true});
        return;
    }

    const style = document.createElement('style');
    style.textContent = `
      .ctpr-shell{width:100%;max-width:none;color:#253a2e}.ctpr-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:18px 0;padding:24px 26px;border:1px solid #dcebe0;border-radius:19px;background:linear-gradient(115deg,#fff,#edf7ef);box-shadow:0 12px 30px #21452c0b}.ctpr-kicker{margin:0 0 6px;color:#23734e;font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.ctpr-hero h2{margin:0;color:#1e3428;font-size:24px;text-align:left!important}.ctpr-hero p{margin:8px 0 0;color:#718178;font-size:13px;line-height:1.5}.ctpr-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #d7e9dc;border-radius:999px;background:white;color:#176b49;font-size:12px;font-weight:750}.ctpr-toolbar,.ctpr-list{padding:19px;border:1px solid #e0eae3;border-radius:16px;background:#fff;box-shadow:0 10px 26px #1d38250a}.ctpr-toolbar{display:grid;grid-template-columns:minmax(200px,1fr) auto;gap:12px;align-items:end;margin-bottom:14px}.ctpr-toolbar label{display:block;margin-bottom:6px;color:#566b5e;font-size:12px;font-weight:750}.ctpr-toolbar select{width:100%;height:43px;padding:0 12px;border:1px solid #dce7df;border-radius:9px;background:#fff;color:#293e32;font:inherit;font-size:13px}.ctpr-refresh{height:43px;padding:0 15px;border:1px solid #d5e7da;border-radius:9px;background:#f4faf5;color:#196c49;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.ctpr-tabs{display:flex;gap:8px;margin:0 0 12px;padding:6px;border:1px solid #e0eae3;border-radius:12px;background:#fff}.ctpr-tab{padding:10px 14px;border:0;border-radius:8px;background:transparent;color:#637469;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.ctpr-tab.active{background:#eaf5ed;color:#176b49}.ctpr-list{display:grid;gap:12px}.ctpr-request{padding:17px;border:1px solid #e4ece5;border-radius:13px;background:#fff}.ctpr-request-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ctpr-request h3{margin:0;color:#253b30;font-size:15px}.ctpr-meta{margin:5px 0 12px;color:#77867d;font-size:11px}.ctpr-status{padding:5px 9px;border-radius:999px;background:#fff5df;color:#8b620c;font-size:10px;font-weight:800;text-transform:uppercase}.ctpr-changes{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin:12px 0}.ctpr-change{padding:10px 11px;border-radius:9px;background:#f5f8f5;color:#637469;font-size:11px;overflow-wrap:anywhere}.ctpr-change b{display:block;margin-bottom:4px;color:#354c3e;font-size:10px;text-transform:capitalize}.ctpr-change img{display:block;max-width:120px;max-height:100px;margin-top:6px;border-radius:8px;object-fit:cover}.ctpr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ctpr-actions button{min-height:38px;padding:0 13px;border:0;border-radius:8px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.ctpr-approve{background:#176d4d;color:#fff}.ctpr-reject{background:#fff0ef;color:#a13f39}.ctpr-actions button:disabled{opacity:.6;cursor:wait}.ctpr-empty{padding:44px 18px;border:1px dashed #dce8df;border-radius:13px;color:#74847a;text-align:center;font-size:13px}.ctpr-empty i{display:block;margin-bottom:10px;color:#4f9b6c;font-size:25px}.ctpr-message{min-height:20px;margin:12px 0;color:#68796f;font-size:12px}.ctpr-message.error{color:#a13f39}.ctpr-message.success{color:#176d4d}
      @media(max-width:720px){.ctpr-hero{align-items:flex-start;flex-direction:column;padding:18px}.ctpr-hero h2{font-size:21px}.ctpr-toolbar{grid-template-columns:1fr;padding:13px}.ctpr-refresh{width:100%}.ctpr-list{padding:12px}.ctpr-request{padding:13px}.ctpr-request-head{flex-direction:column}.ctpr-actions button{flex:1}}
    `;
    document.head.appendChild(style);

    let nav = sidebar.querySelector('[data-section="class-teacher-requests"]');
    if (!nav) {
        nav = document.createElement('div');
        nav.className = 'menu-item'; nav.dataset.section = 'class-teacher-requests'; nav.style.display = 'none';
        nav.innerHTML = '<i class="fas fa-user-check"></i><span>Student Requests</span>';
        sidebar.insertBefore(nav, sidebar.querySelector('[data-section="reports"]') || null);
    }
    let panel = document.getElementById('classTeacherRequestsSection');
    if (!panel) {
        panel = document.createElement('section'); panel.id = 'classTeacherRequestsSection'; panel.className = 'section-container'; panel.setAttribute('aria-label','Student Requests');
        panel.innerHTML = `<div class="ctpr-shell"><div class="header"><h1><i class="fas fa-user-check"></i> Student Requests</h1><div class="teacher-info" id="ctprTeacherInfo"></div></div>
          <section class="ctpr-hero"><div><p class="ctpr-kicker">Class teacher workspace</p><h2>Review student changes</h2><p>Requests are limited to students whose current section is assigned to you as class teacher.</p></div><span class="ctpr-pill"><i class="fas fa-lock"></i> Assigned sections only</span></section>
          <div class="ctpr-toolbar"><div><label for="ctprSection">Filter by your section</label><select id="ctprSection"><option value="">All my class-teacher sections</option></select></div><button id="ctprRefresh" class="ctpr-refresh" type="button"><i class="fas fa-rotate-right"></i> Refresh requests</button></div>
          <div class="ctpr-tabs" role="tablist"><button type="button" class="ctpr-tab active" data-ctpr-kind="profile" role="tab" aria-selected="true">Profile requests</button><button type="button" class="ctpr-tab" data-ctpr-kind="leave" role="tab" aria-selected="false">Leave requests</button></div>
          <p class="ctpr-message" id="ctprMessage" role="status" aria-live="polite"></p><div id="ctprList" class="ctpr-list"><div class="ctpr-empty"><i class="fas fa-spinner fa-spin"></i>Loading assigned requests…</div></div></div>`;
        container.appendChild(panel);
    }

    const select = panel.querySelector('#ctprSection');
    const list = panel.querySelector('#ctprList');
    const message = panel.querySelector('#ctprMessage');
    let teacherId = '';
    let schoolId = '';
    let sections = [];
    let requests = [];
    let activeKind = 'profile';

    const norm = value => String(value || '').trim().replace(/^section\s+/i,'').toLowerCase();
    const sectionKey = value => Array.from(new TextEncoder().encode(String(value || '').trim()), byte => byte.toString(16).padStart(2,'0')).join('');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const values = value => Array.isArray(value) ? value.flatMap(values) : value && typeof value === 'object' ? Object.entries(value).filter(([,on])=>on===true || (on && typeof on==='object')).map(([key])=>key) : typeof value==='string' ? value.split(',').map(x=>x.trim()).filter(Boolean) : [];
    const hasClassTeacherRole = teacher => {
        const roles = Array.isArray(teacher?.roles) ? teacher.roles : (teacher?.roles && typeof teacher.roles === 'object' ? Object.keys(teacher.roles).filter(role => teacher.roles[role]) : []);
        return teacher?.teacherType === 'classTeacher' || teacher?.teacherRole === 'classTeacher' || teacher?.classTeacherEnabled === true || teacher?.isClassTeacher === true || roles.includes('classTeacher');
    };
    const classTeacherSectionValues = teacher => values(teacher?.classTeacherSections).length ? values(teacher.classTeacherSections) : (hasClassTeacherRole(teacher) ? values(teacher?.assignedSections) : []);
    const format = value => {
        const date = new Date(Number(value) || value || Date.now());
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    };
    function setMessage(text, kind='') { message.textContent = text; message.className = `ctpr-message ${kind}`; }

    function render() {
        const chosen = norm(select.value);
        const visible = requests.filter(request => request.kind === activeKind && (!chosen || norm(request.section) === chosen));
        if (!sections.length) { list.innerHTML = '<div class="ctpr-empty"><i class="fas fa-user-shield"></i>No class-teacher sections are assigned to this account. Ask your administrator to assign your role and sections.</div>'; return; }
        if (!visible.length) { list.innerHTML = `<div class="ctpr-empty"><i class="fas fa-inbox"></i>No ${activeKind === 'leave' ? 'student leave' : 'student profile'} requests for this section.</div>`; return; }
        list.replaceChildren();
        visible.sort((a,b)=>(Number(b.timestamp)||0)-(Number(a.timestamp)||0)).forEach(request => {
            const card = document.createElement('article'); card.className='ctpr-request';
            const head = document.createElement('div'); head.className='ctpr-request-head';
            const info = document.createElement('div');
            const title=document.createElement('h3'); title.textContent=request.userName || (request.kind === 'leave' ? 'Student leave request' : 'Student profile request');
            const details = request.kind === 'leave' ? `${request.type || 'Leave'} · ${request.from || '—'} to ${request.to || '—'}` : 'Profile details update';
            const meta=document.createElement('p'); meta.className='ctpr-meta'; meta.textContent=`${details} · ${request.userEmail || 'No email'} · Section ${request.section} · ${format(request.timestamp)}`;
            info.append(title,meta);
            const badge=document.createElement('span'); badge.className='ctpr-status'; badge.textContent=request.status || 'pending'; head.append(info,badge); card.append(head);
            if (request.kind === 'leave') {
                const reason=document.createElement('p'); reason.className='ctpr-change'; reason.textContent=`Reason: ${request.reason || 'No reason provided'}`; card.append(reason);
            }
            const changes=document.createElement('div'); changes.className='ctpr-changes';
            const data=request.requestedData || {};
            const before=request.currentData || {};
            Object.entries(data).forEach(([key,value])=>{
                const item=document.createElement('div'); item.className='ctpr-change';
                const label=document.createElement('b'); label.textContent=key.replace(/([A-Z])/g,' $1');
                const old=document.createElement('span'); old.textContent=`Current: ${before[key] == null ? '—' : String(before[key])}`;
                const next=document.createElement('div'); next.textContent=`Requested: ${value == null ? '—' : String(value)}`;
                item.append(label,old,next);
                if (key === 'profilePhoto' && typeof value === 'string' && value.startsWith('https://')) { const image=document.createElement('img'); image.src=value; image.alt='Requested profile photo'; image.loading='lazy'; item.append(image); }
                changes.append(item);
            });
            if (changes.childElementCount) card.append(changes);
            if (String(request.status || '').toLowerCase().startsWith('pending')) {
                const actions=document.createElement('div'); actions.className='ctpr-actions';
                const reject=document.createElement('button'); reject.type='button'; reject.className='ctpr-reject'; reject.textContent='Reject';
                const approve=document.createElement('button'); approve.type='button'; approve.className='ctpr-approve'; approve.textContent=request.kind === 'leave' ? 'Approve leave' : 'Approve and update profile';
                reject.addEventListener('click',()=>decide(request,false,reject,approve));
                approve.addEventListener('click',()=>decide(request,true,reject,approve));
                actions.append(reject,approve); card.append(actions);
            }
            list.append(card);
        });
    }

    async function decide(request, approve, rejectButton, approveButton) {
        if (!String(request.status || '').toLowerCase().startsWith('pending') || !teacherId) return;
        const requestLabel = request.kind === 'leave' ? 'leave request' : 'profile update';
        if (approve && !window.confirm(`Approve ${request.userName || 'this student'}'s ${requestLabel}?`)) return;
        if (!approve && !window.confirm(`Reject ${request.userName || 'this student'}'s ${requestLabel}?`)) return;
        rejectButton.disabled = approveButton.disabled = true;
        setMessage(approve ? 'Applying requested profile changes…' : 'Rejecting request…');
        try {
            const requestPath = request.kind === 'leave' ? `leave_requests/${request.userId}/${request.requestId}` : `profile_update_requests/${request.requestId}`;
            const assignmentKey=sectionKey(request.section);
            const [teacherSnap, requestSnap, studentSnap, assignmentSnap] = await Promise.all([
                firebase.database().ref(`users/${teacherId}`).once('value'),
                firebase.database().ref(requestPath).once('value'),
                firebase.database().ref(`users/${request.userId}`).once('value'),
                firebase.database().ref(`classTeacherAssignments/${schoolId}/${assignmentKey}`).once('value')
            ]);
            const teacher = teacherSnap.val() || {};
            const currentRequest = requestSnap.val() || {};
            const student = studentSnap.val() || {};
            const assignment=assignmentSnap.val()||{};
            const currentSections = values(teacher.classTeacherSections).map(norm);
            if (teacher.role !== 'teacher' || !hasClassTeacherRole(teacher) || String(teacher.schoolId) !== schoolId || !currentSections.includes(norm(request.section))) throw new Error('Your class-teacher assignment changed. Refresh and try again.');
            if (String(currentRequest.status || '').toLowerCase().replace(/\s+/g,'') !== 'pending' && String(currentRequest.status || '').toLowerCase() !== 'pending review') throw new Error('This request is no longer pending.');
            if (request.kind === 'profile' && (currentRequest.classTeacherId !== teacherId || currentRequest.schoolId !== schoolId || norm(currentRequest.section) !== norm(request.section))) throw new Error('This request does not match your current assignment.');
            if (request.kind === 'leave' && (currentRequest.classTeacherId !== teacherId || currentRequest.schoolId !== schoolId || norm(currentRequest.section) !== norm(request.section))) throw new Error('This leave request does not match your current assignment.');
            if (!assignmentSnap.exists() || assignment.teacherId !== teacherId || String(assignment.schoolId) !== schoolId || norm(assignment.section) !== norm(request.section)) throw new Error('You are no longer the assigned class teacher for this section.');
            if (!studentSnap.exists() || student.role !== 'student' || String(student.schoolId) !== schoolId || norm(student.section) !== norm(request.section)) throw new Error('The student is no longer in this assigned section. Ask an administrator to review this request.');

            const now=Date.now();
            const updates={};
            const status=approve?(request.kind === 'leave'?'Approved':'approved'):(request.kind === 'leave'?'Rejected':'rejected');
            if (request.kind === 'leave') {
                updates[`${requestPath}/status`]=status;
                updates[`${requestPath}/reviewedAt`]=now;
                updates[`${requestPath}/reviewedBy`]=teacherId;
                updates[`classTeacherLeaveRequests/${teacherId}/${request.requestId}/status`]=status;
                updates[`classTeacherLeaveRequests/${teacherId}/${request.requestId}/reviewedAt`]=now;
            } else {
                updates[`${requestPath}/status`]=status;
                updates[`${requestPath}/${approve?'approvedAt':'rejectedAt'}`]=now;
                updates[`${requestPath}/${approve?'approvedBy':'rejectedBy'}`]=teacherId;
                updates[`classTeacherProfileRequests/${teacherId}/${request.requestId}/status`]=status;
                updates[`classTeacherProfileRequests/${teacherId}/${request.requestId}/${approve?'approvedAt':'rejectedAt'}`]=now;
            }
            if (approve && request.kind === 'profile') {
                const changes={...(currentRequest.requestedData || {})};
                delete changes.role; delete changes.schoolId; delete changes.uid; delete changes.email;
                if (changes.department && !changes.branch) changes.branch=changes.department;
                if (changes.branch && !changes.department) changes.department=changes.branch;
                if (changes.academicBatch && !changes.batch) changes.batch=changes.academicBatch;
                if (changes.batch && !changes.academicBatch) changes.academicBatch=changes.batch;
                if (changes.bloodGroup && !changes.blood) changes.blood=changes.bloodGroup;
                if (changes.blood && !changes.bloodGroup) changes.bloodGroup=changes.blood;
                changes.updatedAt=now;
                Object.entries(changes).forEach(([key,value])=>{
                    updates[`users/${request.userId}/${key}`]=value;
                    updates[`schoolUsers/${schoolId}/${request.userId}/${key}`]=value;
                });
                updates[`notifications/${request.userId}/${firebase.database().ref(`notifications/${request.userId}`).push().key}`]={title:'Profile request approved',message:'Your class teacher approved your profile update.',type:'success',category:'Profile request',timestamp:now};
            } else {
                const title = request.kind === 'leave' ? `Leave request ${approve ? 'approved' : 'rejected'}` : 'Profile request reviewed';
                const notice = request.kind === 'leave' ? `Your ${request.type || 'leave'} request (${request.from || ''} to ${request.to || ''}) was ${approve ? 'approved' : 'rejected'} by your class teacher.` : 'Your class teacher could not approve your profile update. Please contact your class teacher for details.';
                updates[`notifications/${request.userId}/${firebase.database().ref(`notifications/${request.userId}`).push().key}`]={title,message:notice,type:approve?'success':'warning',category:request.kind === 'leave'?'Leave request':'Profile request',timestamp:now};
            }
            await firebase.database().ref().update(updates);
            request.status=status;
            render();
            setMessage(request.kind === 'leave' ? `Leave request ${approve?'approved':'rejected'}.` : (approve ? 'Approved; the student profile was updated.' : 'Request rejected.'), 'success');
        } catch (error) {
            console.error('Could not review class-teacher request:',error);
            setMessage(error.message || 'Could not update this request.', 'error');
            rejectButton.disabled = approveButton.disabled = false;
        }
    }

    async function load(user) {
        nav.style.display='none';
        requests=[]; sections=[]; teacherId=''; schoolId='';
        if (!user) { render(); return; }
        try {
            const snap=await firebase.database().ref(`users/${user.uid}`).once('value');
            const teacher=snap.val() || {};
            if (teacher.role !== 'teacher' || !hasClassTeacherRole(teacher) || !teacher.schoolId) { render(); return; }
            teacherId=user.uid; schoolId=String(teacher.schoolId);
            nav.style.display='flex';
            const info=panel.querySelector('#ctprTeacherInfo');
            info.textContent=teacher.name || user.displayName || user.email || 'Class teacher';
            sections=[...new Map(classTeacherSectionValues(teacher).filter(value=>String(value).trim()).map(value=>[norm(value),String(value).trim()])).values()];
            if (!sections.length) { render(); return; }
            select.replaceChildren(new Option('All my class-teacher sections',''));
            sections.forEach(section=>select.add(new Option(section,section)));
            const [profileInbox,leaveInbox]=await Promise.all([
                firebase.database().ref(`classTeacherProfileRequests/${teacherId}`).once('value'),
                firebase.database().ref(`classTeacherLeaveRequests/${teacherId}`).once('value')
            ]);
            const pointers=[];
            profileInbox.forEach(child=>{const pointer=child.val()||{};if(pointer.schoolId===schoolId&&sections.some(section=>norm(section)===norm(pointer.section)))pointers.push({...pointer,kind:'profile',requestId:pointer.requestId||child.key});});
            leaveInbox.forEach(child=>{const pointer=child.val()||{};if(pointer.schoolId===schoolId&&sections.some(section=>norm(section)===norm(pointer.section)))pointers.push({...pointer,kind:'leave',requestId:pointer.requestId||child.key});});
            const loaded=await Promise.all(pointers.map(async pointer=>{
                const requestPath=pointer.kind==='leave'?`leave_requests/${pointer.studentId}/${pointer.requestId}`:`profile_update_requests/${pointer.requestId}`;
                const reqSnap=await firebase.database().ref(requestPath).once('value');
                const request=reqSnap.val()||{};
                const targetId=pointer.kind==='leave'?pointer.studentId:request.userId||pointer.studentId;
                if(request.classTeacherId!==teacherId||request.schoolId!==schoolId||!sections.some(section=>norm(section)===norm(request.section)))return null;
                const studentSnap=await firebase.database().ref(`users/${targetId}`).once('value');
                const student=studentSnap.val()||{};
                return {...request,...pointer,...request,requestId:pointer.requestId,userId:targetId,userName:request.studentName||request.userName||student.name||'Student',userEmail:request.userEmail||student.email||'',timestamp:request.createdAt||request.timestamp,kind:pointer.kind};
            }));
            requests=loaded.filter(request=>request && request.userId);
            render();
        } catch(error) {
            console.error('Could not load class-teacher requests:',error);
            list.innerHTML='<div class="ctpr-empty"><i class="fas fa-triangle-exclamation"></i>Requests could not be loaded. Check database access and try again.</div>';
            setMessage('Could not load the class-teacher request inbox.','error');
        }
    }

    nav.addEventListener('click', event=>{
        if (!event.target.closest('[data-section="class-teacher-requests"]')) return;
        event.preventDefault();
        if (typeof window.switchTeacherSection === 'function') {
            window.switchTeacherSection('class-teacher-requests');
        } else {
            document.querySelectorAll('.main-content .section-container').forEach(section=>{
                const active=section===panel; section.classList.toggle('active',active); section.style.display=active?'block':'none'; section.setAttribute('aria-hidden',String(!active));
            });
            document.querySelectorAll('.sidebar-menu .menu-item').forEach(item=>{const active=item===nav;item.classList.toggle('active',active);if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
        }
        load(firebase.auth().currentUser);
    });
    select.addEventListener('change',render);
    panel.querySelectorAll('[data-ctpr-kind]').forEach(button=>button.addEventListener('click',()=>{
        activeKind=button.dataset.ctprKind;
        panel.querySelectorAll('[data-ctpr-kind]').forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
        render();
    }));
    panel.querySelector('#ctprRefresh').addEventListener('click',()=>load(firebase.auth().currentUser));
    firebase.auth().onAuthStateChanged(load);
}
document.addEventListener('DOMContentLoaded', initializeClassTeacherRequests);
