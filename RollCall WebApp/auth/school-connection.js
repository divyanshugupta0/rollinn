(function () {
    const APP_CONFIG = window.ROLLCALL_FIREBASE_CONFIG;
    let modalPromise = null;
    const schoolAccessWatches = new Map();

    function ensureDialog() {
        let dialog = document.getElementById('requiredSchoolCodeDialog');
        if (dialog) return dialog;
        dialog = document.createElement('div');
        dialog.id = 'requiredSchoolCodeDialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'requiredSchoolCodeTitle');
        dialog.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;padding:20px;background:rgba(12,31,24,.72);backdrop-filter:blur(5px);';
        dialog.innerHTML = `<div style="width:min(100%,480px);background:#fff;border-radius:20px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.28);font:15px/1.5 system-ui,sans-serif;color:#1b3026"><div style="width:48px;height:48px;border-radius:14px;background:#e8f4eb;color:#176b4d;display:grid;place-items:center;font-size:22px;margin-bottom:18px">⌂</div><h2 id="requiredSchoolCodeTitle" style="font-size:24px;margin:0 0 8px">Connect your account to a school</h2><p style="margin:0 0 20px;color:#65766d">Your staff account needs to be connected to its registered school before you can open the portal. Enter the school code provided by your school administrator.</p><form id="requiredSchoolCodeForm"><label for="requiredSchoolCodeInput" style="display:block;font-weight:650;margin-bottom:7px">School code</label><input id="requiredSchoolCodeInput" autocomplete="organization" required maxlength="48" style="width:100%;height:48px;border:1px solid #cedbd2;border-radius:10px;padding:0 13px;font:inherit;text-transform:uppercase;box-sizing:border-box"><p id="requiredSchoolCodeError" role="status" style="min-height:23px;color:#b42318;margin:8px 0 14px"></p><button type="submit" style="width:100%;height:48px;border:0;border-radius:10px;background:#176b4d;color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer">Connect to school</button></form><p style="font-size:12px;color:#75847b;margin:16px 0 0">This required step stays open until your school code is verified.</p></div>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); } });
        dialog.addEventListener('click', event => { if (event.target === dialog) event.preventDefault(); });
        return dialog;
    }

    function schoolStatusAllowsAccess(school) {
        if (!school || !['active', 'approved'].includes(String(school.status || 'active').toLowerCase())) return false;
        const subscription = school.subscription || {};
        if (String(subscription.status || 'active').toLowerCase() === 'inactive') return false;
        return true;
    }

    function databaseAdapter() {
        if (window.__rollCallSchoolDatabase) return window.__rollCallSchoolDatabase;
        const db = firebase.database();
        return {
            read: path => db.ref(path).once('value'),
            write: (path, data) => db.ref(path).set(data),
            update: (path, data) => db.ref(path).update(data),
            watch: (path, callback) => db.ref(path).on('value', callback)
        };
    }

    function watchSchoolAccess(user, schoolId) {
        if (schoolAccessWatches.has(user.uid)) return;
        const db = databaseAdapter();
        const listener = db.watch(`schools/${schoolId}`, snapshot => {
            if (!snapshot.exists() || !schoolStatusAllowsAccess(snapshot.val())) {
                const activeUser = firebase.auth().currentUser;
                if (activeUser && activeUser.uid === user.uid) {
                    window.alert('School access has been deactivated. You are being signed out.');
                    firebase.auth().signOut();
                }
            }
        });
        schoolAccessWatches.set(user.uid, { listener });
    }

    window.requireSchoolConnection = async function (user, profile) {
        if (!user || !profile || !['admin', 'teacher'].includes(String(profile.role || '').toLowerCase())) return profile || null;
        const db = databaseAdapter();
        let currentSchoolId = String(profile.schoolId || '').trim();
        if (currentSchoolId) {
            try {
                const snapshot = await db.read(`schools/${currentSchoolId}`);
                if (snapshot.exists()) {
                    if (!schoolStatusAllowsAccess(snapshot.val())) {
                        window.alert('This school account is inactive. Contact the school administrator.');
                        return null;
                    }
                    watchSchoolAccess(user, currentSchoolId);
                    return profile;
                }
            } catch (error) {
                console.warn('Could not verify the school status.', error);
                throw new Error(`Could not verify school ${currentSchoolId}: ${error.code || error.message || 'database read failed'}.`);
            }
        }
        if (modalPromise) return modalPromise;
        const dialog = ensureDialog();
        dialog.style.display = 'grid';
        const input = dialog.querySelector('#requiredSchoolCodeInput');
        const error = dialog.querySelector('#requiredSchoolCodeError');
        const form = dialog.querySelector('form');
        input.focus();
        modalPromise = new Promise(resolve => {
            form.onsubmit = async event => {
                event.preventDefault();
                error.textContent = '';
                const button = form.querySelector('button');
                button.disabled = true; button.textContent = 'Verifying…';
                try {
                    const code = input.value.trim().toUpperCase().replace(/\s+/g, '-');
                    const match = await db.read('schools');
                    if (!match.exists()) throw new Error('No registered school matches this code. Check it with your administrator.');
                    const [schoolId, school] = Object.entries(match.val()).find(([, item]) => String(item?.code || '').toUpperCase() === code) || [];
                    if (!schoolId || !school) throw new Error('No registered school matches this code. Check it with your administrator.');
                    if (!schoolStatusAllowsAccess(school)) throw new Error('This school is inactive. Contact the school owner.');
                    const patch = { schoolId, schoolCode: code, schoolName: school.name || '', schoolJoinedAt: Date.now() };
                    await db.update(`users/${user.uid}`, patch);
                    Object.assign(profile, patch);
                    watchSchoolAccess(user, schoolId);
                    dialog.style.display = 'none';
                    modalPromise = null;
                    resolve(profile);
                } catch (failure) {
                    error.textContent = failure.message || 'Could not verify this school code.';
                    button.disabled = false; button.textContent = 'Connect to school';
                }
            };
        });
        return modalPromise;
    };
})();
