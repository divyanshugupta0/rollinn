// School scoped teacher directory. Student queries are constrained by assigned section.
document.addEventListener('DOMContentLoaded', () => {
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm = v => String(v == null ? '' : v).trim().replace(/^section\s+/i, '').toLowerCase();
    const values = v => Array.isArray(v) ? v.flatMap(values) : (v && typeof v === 'object' ? Object.entries(v).filter(([,x])=>x===true || (x && typeof x==='object')).map(([k])=>k) : (typeof v==='string' ? v.split(',').map(x=>x.trim()).filter(Boolean) : []));
    const style = document.createElement('style');
    style.textContent = `.sr-shell{color:#24392e}.sr-hero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:18px;margin:18px 0;padding:23px;border:1px solid #dfebe2;border-radius:18px;background:linear-gradient(120deg,#fff,#eff8f1);box-shadow:0 10px 28px #1e412c0d}.sr-kicker{margin:0 0 6px;color:#287451;font-size:10px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.sr-hero h2{margin:0;font-size:23px}.sr-hero p{margin:7px 0 0;color:#718178;font-size:13px}.sr-count{min-width:112px;padding:12px 17px;border:1px solid #dcebe0;border-radius:13px;background:#fff;text-align:center}.sr-count b{display:block;color:#196c49;font-size:24px}.sr-count span{color:#718178;font-size:11px;font-weight:700}.sr-filters{display:grid;grid-template-columns:minmax(190px,.7fr) minmax(230px,1.3fr) auto;align-items:end;gap:12px;margin-bottom:12px;padding:16px;border:1px solid #e1ebe4;border-radius:14px;background:#fff}.sr-field label{display:block;margin-bottom:6px;color:#596d61;font-size:11px;font-weight:750}.sr-field input,.sr-field select{width:100%;height:42px;padding:0 12px;border:1px solid #dce8df;border-radius:9px;background:#fff;color:#2d4236;font:inherit;font-size:13px}.sr-refresh{display:inline-flex!important;width:auto!important;min-height:42px;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid #d5e7da;border-radius:9px;background:#f4faf5;color:#196c49;font-size:12px;font-weight:750;white-space:nowrap;cursor:pointer}.sr-assignment{margin:0 0 12px;color:#718178;font-size:12px}.sr-error{color:#a24b43}.sr-table-wrap{overflow:auto;border:1px solid #e1eae3;border-radius:14px;background:#fff}.sr-table{width:100%;min-width:680px;border-collapse:collapse;text-align:left}.sr-table th{padding:12px 14px;background:#f4f8f5;color:#68796f;font-size:10px;letter-spacing:.07em;text-transform:uppercase}.sr-table td{padding:12px 14px;border-top:1px solid #edf1ee;color:#30443a;font-size:12px}.sr-name{font-weight:750}.sr-sub{display:block;margin-top:3px;color:#7b8980;font-size:11px}.sr-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#edf6ef;color:#236b49;font-size:11px;font-weight:700}.sr-details-btn{border:0;background:transparent;color:#176b4d;font:inherit;font-weight:750;cursor:pointer}.sr-detail-row td{background:#fafcfb;color:#637469}.sr-empty{padding:36px 18px;border:1px solid #e1eae3;border-radius:14px;background:#fff;color:#718178;text-align:center}.sr-empty i{display:block;margin-bottom:9px;color:#49936a;font-size:23px}.sr-empty strong{display:block;margin-bottom:5px;color:#30473a}.sr-detail-row[hidden]{display:none!important}@media(max-width:760px){.sr-hero{grid-template-columns:1fr;padding:17px}.sr-count{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px}.sr-count b{font-size:19px}.sr-filters{grid-template-columns:1fr;padding:12px}.sr-refresh{width:100%!important}.sr-hero h2{font-size:20px}}`;
    document.head.appendChild(style);

    let menu = document.querySelector('.sidebar-menu [data-section="students"]');
    const nav = document.querySelector('.sidebar-menu');
    if (!menu && nav) { menu=document.createElement('div'); menu.className='menu-item'; menu.dataset.section='students'; menu.innerHTML='<i class="fas fa-user-graduate"></i><span>Students Record</span>'; nav.insertBefore(menu,nav.querySelector('[data-section="reports"]')||null); }
    let section = document.getElementById('studentsSection');
    if (!section || !section.querySelector('.sr-shell')) {
        if (!section) { section=document.createElement('section'); section.id='studentsSection'; }
        section.className='section-container';
        section.innerHTML='<div class="header"><h1><i class="fas fa-user-graduate"></i> Students Record</h1><div class="teacher-info"><i class="fas fa-user-tie"></i></div></div><div class="sr-shell"><div class="sr-hero"><div><p class="sr-kicker">School directory · assigned sections</p><h2>Student records</h2><p>Details for students in sections assigned to you by your administrator.</p></div><div class="sr-count"><b id="srCount">0</b><span>Students</span></div></div><div class="sr-filters"><div class="sr-field"><label for="srSection">Assigned section</label><select id="srSection"><option value="">All my sections</option></select></div><div class="sr-field"><label for="srSearch">Find a student</label><input id="srSearch" type="search" autocomplete="off" placeholder="Search name, roll number, or email"></div><button class="sr-refresh" id="srRefresh" type="button"><i class="fas fa-rotate-right"></i> Refresh records</button></div><p class="sr-assignment" id="srAssignment" role="status" aria-live="polite">Sign in to load assigned sections.</p><div id="srResults"></div></div>';
        if (!section.isConnected) {
            const reports=document.getElementById('reportsSection'), settings=document.getElementById('settingsSection');
            (reports||settings||document.querySelector('.main-content .container'))?.insertBefore(section,reports||settings||null);
        }
    }
    if (menu) menu.addEventListener('click', event => {
        event.preventDefault();
        if (typeof window.switchTeacherSection === 'function') {
            window.switchTeacherSection('students');
            return;
        }
        document.querySelectorAll('.main-content .section-container').forEach(panel => {
            const active = panel === section;
            panel.classList.toggle('active', active);
            panel.style.display = active ? 'block' : 'none';
            panel.setAttribute('aria-hidden', String(!active));
        });
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            const active = item === menu;
            item.classList.toggle('active', active);
            if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
        });
    });
    const select=section.querySelector('#srSection'), search=section.querySelector('#srSearch'), results=section.querySelector('#srResults'), assignment=section.querySelector('#srAssignment'), count=section.querySelector('#srCount');
    const assignedFields=['assignedSections','sectionsAssigned','sectionAssignments'];
    function teacherRefs(record){
        const found=[];
        ['teacherId','assignedTeacherId','teacherUid','assignedToTeacherId','teacherIds','assignedTeacherIds'].forEach(k=>found.push(...values(record?.[k])));
        ['teacher','assignedTeacher','teachers'].forEach(k=>{const v=record?.[k]; if(typeof v==='string')found.push(v); else if(Array.isArray(v))v.forEach(x=>found.push(typeof x==='string'?x:(x?.uid||x?.id||x?.email||''))); else if(v&&typeof v==='object')found.push(v.uid||v.id||v.email||'');});
        return found.map(x=>String(x).trim().toLowerCase());
    }
    function assignedSections(profile, classes, locations){
        const found=new Set(); assignedFields.forEach(k=>values(profile[k]).forEach(x=>found.add(String(x).trim())));
        [classes,locations].forEach(records=>Object.values(records||{}).forEach(record=>{
            if(!record || (record.schoolId&&record.schoolId!==profile.schoolId))return;
            const refs=teacherRefs(record), ids=[profile.id,profile.email].filter(Boolean).map(x=>String(x).trim().toLowerCase());
            if(!ids.some(id=>refs.includes(id)))return;
            values(record.section||record.sections||record.grade).forEach(x=>found.add(String(x).trim()));
        }));
        return [...found].filter(Boolean).filter(x=>norm(x)!=='general');
    }
    let state={students:[],sections:[],loading:false};
    function render(){
        const term=search.value.trim().toLowerCase(), chosen=norm(select.value);
        const rows=state.students.filter(s=>!chosen||norm(s.section)===chosen).filter(s=>!term||[s.name,s.fullName,s.displayName,s.email,s.rollNumber,s.rollNo,s.admissionNumber,s.admissionNo,s.id].some(v=>String(v||'').toLowerCase().includes(term))).sort((a,b)=>String(a.name||a.fullName||'').localeCompare(String(b.name||b.fullName||'')));
        count.textContent=rows.length;
        if(state.loading){results.innerHTML='<div class="sr-empty"><i class="fas fa-spinner fa-spin"></i><strong>Loading student records</strong>Please wait.</div>';return;}
        if(!state.sections.length){results.innerHTML='<div class="sr-empty"><i class="fas fa-lock"></i><strong>No sections assigned</strong>Your administrator has not assigned specific sections to your account. Student records remain hidden until then.</div>';return;}
        if(!rows.length){results.innerHTML='<div class="sr-empty"><i class="fas fa-user-graduate"></i><strong>No matching students</strong>No student records were found for the selected section and search.</div>';return;}
        results.innerHTML='<div class="sr-table-wrap"><table class="sr-table"><thead><tr><th>Student</th><th>Section</th><th>Roll / admission</th><th>Email</th><th></th></tr></thead><tbody>'+rows.map((s,i)=>{
            const name=esc(s.name||s.fullName||s.displayName||'Student'), id=esc(s.id), sec=esc(s.section||'—'), roll=esc(s.rollNumber||s.rollNo||s.admissionNumber||s.admissionNo||'—'), email=esc(s.email||'—');
            const detail=[s.email&&`Email: ${esc(s.email)}`,(s.phone||s.phoneNumber)&&`Phone: ${esc(s.phone||s.phoneNumber)}`,s.className&&`Class: ${esc(s.className)}`,s.grade&&`Grade: ${esc(s.grade)}`,`Section: ${sec}`,`Roll / admission: ${roll}`].filter(Boolean).join(' · ');
            return `<tr><td><span class="sr-name">${name}</span><span class="sr-sub">Student ID: ${id}</span></td><td><span class="sr-pill">${sec}</span></td><td>${roll}</td><td>${email}</td><td><button type="button" class="sr-details-btn" data-detail="${i}" aria-expanded="false">View details</button></td></tr><tr class="sr-detail-row" data-detail-row="${i}" hidden><td colspan="5">${detail}</td></tr>`;
        }).join('')+'</tbody></table></div>';
        results.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>{const row=results.querySelector(`[data-detail-row="${btn.dataset.detail}"]`),open=row.hidden;row.hidden=!open;btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'Hide details':'View details';}));
    }
    async function load(user){
        if(!user){state={students:[],sections:[],loading:false};assignment.textContent='Sign in to view assigned student records.';select.replaceChildren(new Option('All my sections',''));render();return;}
        state.loading=true;assignment.classList.remove('sr-error');assignment.textContent='Verifying teacher and assigned sections…';render();
        try{
            const ps=await firebase.database().ref(`users/${user.uid}`).once('value'), profile=ps.val()||{};
            if(profile.role!=='teacher')throw new Error('Teacher account required.');
            profile.id=user.uid;profile.email=profile.email||user.email||'';
            if(!profile.schoolId)throw new Error('Your teacher account is not assigned to a school.');
            const [cs,ls]=await Promise.all([firebase.database().ref(`schoolClasses/${profile.schoolId}`).once('value'),firebase.database().ref(`schoolLocations/${profile.schoolId}`).once('value')]);
            const sections=assignedSections(profile,cs.val()||{},ls.val()||{});
            const unique=[...new Map(sections.map(x=>[norm(x),x])).values()];
            select.replaceChildren(new Option('All my sections',''));unique.sort((a,b)=>a.localeCompare(b)).forEach(x=>select.add(new Option(x,x)));
            if(!unique.length){state={students:[],sections:[],loading:false};assignment.textContent='No section assignments were found on your teacher profile or teacher-assigned school classes/locations.';render();return;}
            state={students:[],sections:unique,loading:true};
            assignment.textContent=`Loading records for ${unique.length} assigned section${unique.length===1?'':'s'}…`;render();
            const querySections=[...new Set(unique.flatMap(sectionName=>[sectionName,sectionName.replace(/^section\s+/i,'')]))];
            const snapshots=await Promise.all(querySections.map(sectionName=>firebase.database().ref(`schoolUsers/${profile.schoolId}`).orderByChild('section').equalTo(sectionName).once('value')));
            const seen=new Set();
            snapshots.forEach(snap=>snap.forEach(child=>{const person=child.val()||{};if(person.schoolId!==profile.schoolId||(person.role&&person.role!=='student')||!unique.some(x=>norm(x)===norm(person.section))||seen.has(child.key))return;seen.add(child.key);state.students.push({...person,id:child.key});}));
            state.loading=false;assignment.textContent=`${unique.length} assigned section${unique.length===1?'':'s'} · ${state.students.length} student${state.students.length===1?'':'s'} loaded`;render();
        }catch(error){console.error('Unable to load assigned student records:',error);state={students:[],sections:[],loading:false};select.replaceChildren(new Option('All my sections',''));assignment.textContent=error.message||'Unable to verify teacher access.';assignment.classList.add('sr-error');render();}
    }
    select.addEventListener('change',render);search.addEventListener('input',render);section.querySelector('#srRefresh').addEventListener('click',()=>load(firebase.auth().currentUser));
    firebase.auth().onAuthStateChanged(user=>load(user));
});
