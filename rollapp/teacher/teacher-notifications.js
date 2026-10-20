// Teacher notices are delivered only to students in sections explicitly assigned
// on the teacher's users/{uid} profile by the school administrator.
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('notificationsSection');
    const nav = document.querySelector('.sidebar-menu [data-section="notifications"]');
    if (!panel || !nav || !window.firebase?.database || !window.firebase?.auth) return;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const norm = value => String(value ?? '').trim().replace(/^section\s+/i, '').toLowerCase();
    const sectionValues = value => Array.isArray(value)
        ? value.flatMap(sectionValues)
        : value && typeof value === 'object'
            ? Object.entries(value).filter(([, enabled]) => enabled === true || (enabled && typeof enabled === 'object')).map(([name]) => name)
            : typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];

    const style = document.createElement('style');
    style.textContent = `
      .tn-shell{width:100%;max-width:none;color:#24392e}.tn-shell,.tn-shell *{box-sizing:border-box}.tn-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:18px 0;padding:24px 26px;border:1px solid #deebe1;border-radius:20px;background:linear-gradient(115deg,#fff,#eff8f1);box-shadow:0 12px 30px #21452c0b}
      .tn-kicker{margin:0 0 7px;color:#23734e;font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.tn-hero h2{margin:0;color:#1d3428;font-size:25px;text-align:left!important}.tn-hero p{margin:8px 0 0;color:#718178;font-size:13px;line-height:1.5}.tn-scope{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;padding:10px 14px;border:1px solid #d7e9dc;border-radius:999px;background:#fff;color:#176b49;font-size:12px;font-weight:750}
      .tn-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.9fr);gap:16px;align-items:start}.tn-card{min-width:0;padding:22px;border:1px solid #e0eae3;border-radius:17px;background:#fff;box-shadow:0 10px 26px #1d38250a}.tn-card h3{margin:0 0 5px;font-size:17px}.tn-muted{margin:0 0 18px;color:#77867d;font-size:12px;line-height:1.5}.tn-field{margin-top:15px}.tn-field>label{display:block;margin-bottom:7px;color:#52665a;font-size:12px;font-weight:750}.tn-field input,.tn-field textarea,.tn-field select{width:100%;padding:12px 13px;border:1px solid #dce7df;border-radius:10px;background:#fff;color:#263b30;font:inherit;font-size:13px;outline:none}.tn-field input:focus,.tn-field textarea:focus,.tn-field select:focus{border-color:#50a478;box-shadow:0 0 0 3px #50a47820}.tn-field textarea{min-height:128px;resize:vertical;line-height:1.5}.tn-section-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;max-height:190px;overflow:auto;padding:10px;border:1px solid #dce7df;border-radius:11px;background:#fbfdfb}.tn-section-choice{display:flex;align-items:center;gap:9px;min-width:0;padding:10px 11px;border:1px solid #e2ebe4;border-radius:9px;background:#fff;color:#385044;font-size:12px;font-weight:700;cursor:pointer}.tn-section-choice:has(input:checked){border-color:#84c29a;background:#f0f8f2;color:#176b49}.tn-section-choice input{width:16px;height:16px;margin:0;accent-color:#176d4d;flex:0 0 auto}.tn-section-choice span{overflow-wrap:anywhere}.tn-help{display:block;margin-top:6px;color:#78877e;font-size:11px;line-height:1.45}.tn-actions{display:flex;align-items:center;gap:12px;margin-top:17px}.tn-send{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#176d4d;color:#fff;font:inherit;font-size:13px;font-weight:750;box-shadow:0 8px 18px #176d4d20;cursor:pointer}.tn-send:disabled{opacity:.55;cursor:not-allowed}.tn-status{min-height:18px;color:#65776c;font-size:12px}.tn-status.error{color:#a5433b}.tn-status.success{color:#176d4d}.tn-reach{display:flex;align-items:center;gap:12px;margin:14px 0 0;padding:14px;border-radius:12px;background:#f3f8f4}.tn-reach-icon{display:grid;width:40px;height:40px;place-items:center;border-radius:12px;background:#e4f2e8;color:#20734f}.tn-reach strong{display:block;font-size:14px}.tn-reach span{display:block;margin-top:3px;color:#78877e;font-size:11px}.tn-note{padding:13px;border:1px solid #e3ece5;border-radius:11px;background:#f8fbf8;color:#718178;font-size:12px;line-height:1.55}.tn-empty{padding:22px;border:1px dashed #d9e5dc;border-radius:12px;color:#77867c;font-size:13px;text-align:center}.tn-history-row{padding:13px 0;border-bottom:1px solid #edf2ee}.tn-history-row:last-child{border-bottom:0}.tn-history-row strong{display:block;color:#2b4135;font-size:13px}.tn-history-row p{margin:5px 0;color:#718178;font-size:12px;line-height:1.45;white-space:pre-wrap}.tn-history-row small{color:#89958d;font-size:10px}
      @media(max-width:850px){.tn-grid{grid-template-columns:1fr}.tn-hero{align-items:flex-start;flex-direction:column;padding:19px}.tn-hero h2{font-size:22px}.tn-card{padding:17px}}@media(max-width:480px){.tn-actions{align-items:stretch;flex-direction:column}.tn-send{width:100%}.tn-scope{white-space:normal}}
    `;
    document.head.appendChild(style);

    panel.innerHTML = `<div class="tn-shell">
      <div class="header"><h1><i class="fas fa-bell"></i> Notifications</h1><div class="teacher-info" id="tnTeacherInfo"></div></div>
      <section class="tn-hero"><div><p class="tn-kicker">Section communication</p><h2>Send a class update</h2><p>Share an announcement with students in the sections assigned to you by your administrator.</p></div><span class="tn-scope"><i class="fas fa-shield-alt"></i> Assigned sections only</span></section>
      <div class="tn-grid"><section class="tn-card"><h3><i class="fas fa-paper-plane" style="color:#20734f;margin-right:7px"></i>Compose notification</h3><p class="tn-muted">Choose one or more of your assigned sections. Only student accounts from your school in those sections can receive this message.</p>
        <form id="tnForm"><fieldset class="tn-field" style="padding:0;border:0;margin-left:0;margin-right:0"><legend style="margin-bottom:7px;color:#52665a;font-size:12px;font-weight:750">Recipient sections</legend><div id="tnSections" class="tn-section-list" role="group" aria-describedby="tnSectionHelp"></div><span class="tn-help" id="tnSectionHelp">Select one section to target only that class, or select multiple assigned sections.</span></fieldset>
        <div class="tn-reach" aria-live="polite"><span class="tn-reach-icon"><i class="fas fa-user-graduate"></i></span><div><strong id="tnRecipientCount">0 students</strong><span id="tnRecipientHint">Select sections to estimate recipients.</span></div></div>
        <div class="tn-field"><label for="tnTitle">Subject</label><input id="tnTitle" maxlength="100" required placeholder="e.g. Room change for tomorrow"></div>
        <div class="tn-field"><label for="tnType">Priority</label><select id="tnType"><option value="info">Standard update</option><option value="warning">Important</option><option value="urgent">Urgent</option></select></div>
        <div class="tn-field"><label for="tnMessage">Message</label><textarea id="tnMessage" maxlength="2000" required placeholder="Write a clear message for your students..."></textarea><span class="tn-help">Maximum 2,000 characters. Messages are sent as plain text.</span></div>
        <div class="tn-actions"><button class="tn-send" id="tnSend" type="submit"><i class="fas fa-paper-plane"></i> Send to selected sections</button><span class="tn-status" id="tnStatus" role="status" aria-live="polite"></span></div></form>
      </section><aside class="tn-card"><h3>Delivery scope</h3><p class="tn-muted">Your recipient list is checked against your school and current section assignments before sending.</p><div class="tn-note"><i class="fas fa-lock" style="color:#20734f"></i> A message is delivered to each matching student's own notification inbox. It is not published as a campus-wide announcement.</div><h3 style="margin-top:22px">Sent this session</h3><p class="tn-muted">Recent messages sent from this page remain visible here until you leave or refresh.</p><div class="tn-empty" id="tnHistory">No messages sent in this session.</div></aside></div>
    </div>`;

    let assigned = [];
    let schoolId = '';
    let profile = null;
    let refreshEstimate = 0;
    const select = panel.querySelector('#tnSections');
    const countEl = panel.querySelector('#tnRecipientCount');
    const hintEl = panel.querySelector('#tnRecipientHint');
    const statusEl = panel.querySelector('#tnStatus');
    const sendButton = panel.querySelector('#tnSend');
    const historyEl = panel.querySelector('#tnHistory');

    function selectedSections() { return Array.from(select.querySelectorAll('input[name="tnSection"]:checked')).map(input => input.value); }
    function setStatus(message, kind = '') { statusEl.textContent = message; statusEl.className = `tn-status ${kind}`; }

    function setTeacherInfo(user, teacherProfile) {
        const info = panel.querySelector('#tnTeacherInfo');
        if (info) info.innerHTML = `<span><i class="fas fa-user"></i> ${esc(teacherProfile.name || user.displayName || user.email || 'Teacher')}</span>`;
    }

    async function loadAssignedSections(user) {
        assigned = []; schoolId = ''; profile = null;
        select.replaceChildren();
        countEl.textContent = '0 students';
        hintEl.textContent = 'Verifying your section assignments…';
        sendButton.disabled = true;
        if (!user) { hintEl.textContent = 'Sign in with your teacher account to continue.'; return; }
        try {
            const db = firebase.database();
            const snap = await db.ref(`users/${user.uid}`).once('value');
            const data = snap.val() || {};
            if (data.role !== 'teacher') throw new Error('A teacher account is required.');
            if (!data.schoolId) throw new Error('Your teacher profile is not linked to a school.');
            profile = {...data, id:user.uid, email:data.email || user.email || ''};
            schoolId = String(data.schoolId);
            const assignedRaw = data.assignedSections ?? data.sectionsAssigned ?? data.sectionAssignments ?? [];
            assigned = [...new Map(sectionValues(assignedRaw).filter(value => String(value).trim() && norm(value) !== 'general').map(value => [norm(value),String(value).trim()])).values()];
            // Include sections found on classes/locations explicitly assigned to this teacher,
            // matching the existing teacher directory's assignment resolution.
            const [classesSnap, locationsSnap] = await Promise.all([
                db.ref(`schoolClasses/${schoolId}`).once('value'),
                db.ref(`schoolLocations/${schoolId}`).once('value')
            ]);
            const identity = [user.uid, data.email || user.email].filter(Boolean).map(value => String(value).trim().toLowerCase());
            const isAssignedRecord = record => {
                if (!record || (record.schoolId && String(record.schoolId) !== schoolId)) return false;
                const refs = [];
                ['teacherId','assignedTeacherId','teacherUid','assignedToTeacherId','teacherIds','assignedTeacherIds'].forEach(key => refs.push(...sectionValues(record[key])));
                ['teacher','assignedTeacher','teachers'].forEach(key => {
                    const value = record[key];
                    if (typeof value === 'string') refs.push(value);
                    else if (Array.isArray(value)) value.forEach(item => refs.push(typeof item === 'string' ? item : (item?.uid || item?.id || item?.email || '')));
                    else if (value && typeof value === 'object') refs.push(value.uid || value.id || value.email || '');
                });
                return identity.some(id => refs.some(ref => String(ref).trim().toLowerCase() === id));
            };
            [classesSnap.val() || {}, locationsSnap.val() || {}].forEach(records => Object.values(records).forEach(record => {
                if (isAssignedRecord(record)) sectionValues(record.section || record.sections || record.grade).forEach(value => {
                    if (String(value).trim() && norm(value) !== 'general' && !assigned.some(existing => norm(existing) === norm(value))) assigned.push(String(value).trim());
                });
            }));
            assigned.sort((a,b)=>a.localeCompare(b));
            assigned.forEach((section, index) => {
                const label = document.createElement('label'); label.className = 'tn-section-choice';
                const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'tnSection'; input.value = section; input.id = `tnSectionOption${index}`;
                const text = document.createElement('span'); text.textContent = section;
                label.append(input, text); select.append(label);
            });
            if (!assigned.length) {
                const empty = document.createElement('div'); empty.className = 'tn-help'; empty.textContent = 'No sections assigned'; select.append(empty);
                hintEl.textContent = 'Your administrator has not assigned sections to your teacher account.';
                setStatus('No sections are available for sending.');
                return;
            }
            hintEl.textContent = `${assigned.length} section${assigned.length === 1 ? '' : 's'} assigned by your administrator.`;
            sendButton.disabled = false;
            setTeacherInfo(user, data);
        } catch (error) {
            console.error('Could not load teacher notification scope:', error);
            hintEl.textContent = error.message || 'Could not verify your assigned sections.';
            setStatus('Notifications are unavailable until your assignment can be verified.', 'error');
        }
    }

    async function findRecipients(sectionNames) {
        const valid = sectionNames.filter(name => assigned.some(own => norm(own) === norm(name)));
        if (!valid.length || !schoolId) return [];
        const snapshots = await Promise.all(valid.flatMap(name => {
            const bareName = name.replace(/^section\s+/i, '');
            const candidates = [...new Set([name, bareName, `Section ${bareName}`])];
            return candidates.map(section => firebase.database().ref(`schoolUsers/${schoolId}`).orderByChild('section').equalTo(section).once('value'));
        }));
        const recipients = new Map();
        snapshots.forEach(snapshot => snapshot.forEach(child => {
            const student = child.val() || {};
            if (student.schoolId !== schoolId || (student.role && student.role !== 'student')) return;
            const ownSection = assigned.find(name => norm(name) === norm(student.section));
            if (!ownSection || !valid.some(name => norm(name) === norm(ownSection))) return;
            recipients.set(child.key, {id:child.key, section:ownSection});
        }));
        return [...recipients.values()];
    }

    async function updateEstimate() {
        const generation = ++refreshEstimate;
        const sections = selectedSections();
        if (!sections.length) { countEl.textContent = '0 students'; hintEl.textContent = 'Select sections to estimate recipients.'; return; }
        countEl.textContent = '…'; hintEl.textContent = 'Checking students in selected sections…';
        try {
            const recipients = await findRecipients(sections);
            if (generation !== refreshEstimate) return;
            countEl.textContent = `${recipients.length} student${recipients.length === 1 ? '' : 's'}`;
            hintEl.textContent = recipients.length ? `in ${sections.length} selected section${sections.length === 1 ? '' : 's'}` : 'No matching student records were found.';
        } catch (error) {
            if (generation !== refreshEstimate) return;
            countEl.textContent = 'Unavailable'; hintEl.textContent = 'Could not estimate recipients. You can retry by changing sections.';
            console.warn('Recipient estimate failed:', error);
        }
    }

    select.addEventListener('change', updateEstimate);
    panel.querySelector('#tnForm').addEventListener('submit', async event => {
        event.preventDefault();
        const user = firebase.auth().currentUser;
        const title = panel.querySelector('#tnTitle').value.trim();
        const message = panel.querySelector('#tnMessage').value.trim();
        const type = panel.querySelector('#tnType').value;
        const sections = selectedSections();
        if (!user || !title || !message || !sections.length) { setStatus('Choose sections and enter a subject and message.', 'error'); return; }
        sendButton.disabled = true;
        sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying and sending…';
        setStatus('Refreshing your admin-assigned sections and recipient list…');
        try {
            // Revalidate all authorization data immediately before delivery.
            const freshSnap = await firebase.database().ref(`users/${user.uid}`).once('value');
            const fresh = freshSnap.val() || {};
            if (fresh.role !== 'teacher' || !fresh.schoolId || String(fresh.schoolId) !== schoolId) throw new Error('Your teacher or school assignment changed. Refresh the page and retry.');
            const currentSections = sectionValues(fresh.assignedSections).filter(value => String(value).trim() && norm(value) !== 'general');
            const currentKeys = new Set(currentSections.map(norm));
            if (sections.some(section => !currentKeys.has(norm(section)))) throw new Error('One or more selected sections are no longer assigned to you. Refresh the page and retry.');
            const recipients = await findRecipients(sections);
            if (!recipients.length) throw new Error('No students were found in those assigned sections. No notification was sent.');

            const now = Date.now();
            const root = firebase.database().ref();
            const updates = {};
            recipients.forEach(recipient => {
                const key = firebase.database().ref(`notifications/${recipient.id}`).push().key;
                updates[`notifications/${recipient.id}/${key}`] = {
                    title, header:title, message, body:message, type,
                    timestamp:now, sentBy:user.uid, sentByEmail:fresh.email || user.email || '',
                    category:'Teacher message', senderRole:'teacher', schoolId,
                    section:recipient.section, read:false
                };
            });
            await root.update(updates);
            const row = document.createElement('div');
            row.className = 'tn-history-row';
            const subject = document.createElement('strong'); subject.textContent = title;
            const body = document.createElement('p'); body.textContent = message;
            const meta = document.createElement('small'); meta.textContent = `${new Date(now).toLocaleString()} · ${sections.join(', ')} · ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`;
            row.append(subject, body, meta);
            if (historyEl.classList.contains('tn-empty')) { historyEl.className = ''; historyEl.replaceChildren(); }
            historyEl.prepend(row);
            panel.querySelector('#tnTitle').value = '';
            panel.querySelector('#tnMessage').value = '';
            select.querySelectorAll('input[name="tnSection"]').forEach(input => { input.checked = false; });
            await updateEstimate();
            setStatus(`Sent to ${recipients.length} student${recipients.length === 1 ? '' : 's'} in your selected sections.`, 'success');
        } catch (error) {
            console.error('Teacher section notification failed:', error);
            setStatus(error.message || 'The notification could not be sent.', 'error');
        } finally {
            sendButton.disabled = assigned.length === 0;
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> Send to selected sections';
        }
    });

    nav.addEventListener('click', event => {
        event.preventDefault();
        document.querySelectorAll('.main-content .section-container').forEach(section => {
            const active = section === panel;
            section.classList.toggle('active', active);
            section.style.display = active ? 'block' : 'none';
            section.setAttribute('aria-hidden', String(!active));
        });
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            const active = item === nav;
            item.classList.toggle('active', active);
            if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
        });
    });

    firebase.auth().onAuthStateChanged(loadAssignedSections);
});
