const FIREBASE_KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPES = new Map([
    ['image/webp', 'webp'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png']
]);
const allowOrigins = new Set([
    'http://localhost:3000',
    'https://rollinn.netlify.app',
    'https://geetakalp.onrender.com',
    'https://rollcall.codesynq.me'
]);
const FIREBASE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
const RESET_MESSAGE = 'If an account exists for that email, password reset instructions will be sent.';
let firebaseAccessToken = null;
let firebaseAccessTokenExpiresAt = 0;

function response(body, status, origin = null) {
    const headers = new Headers({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        headers.set('Access-Control-Max-Age', '600');
        headers.set('Vary', 'Origin');
    }
    if (body !== null) headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function allowedOrigins(env) {
    const configuredOrigins = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    return new Set([...allowOrigins, ...configuredOrigins]);
}

function firebaseConfigScript(request, env) {
    const configVariables = {
        apiKey: 'FIREBASE_API_KEY',
        authDomain: 'FIREBASE_AUTH_DOMAIN',
        databaseURL: 'FIREBASE_DATABASE_URL',
        projectId: 'FIREBASE_PROJECT_ID',
        storageBucket: 'FIREBASE_STORAGE_BUCKET',
        messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
        appId: 'FIREBASE_APP_ID'
    };
    const missing = Object.values(configVariables).filter(key => !env[key]?.trim());
    if (missing.length) {
        return new Response(`throw new Error(${JSON.stringify(`Firebase Worker configuration is missing: ${missing.join(', ')}`)});`, {
            status: 503,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/javascript; charset=utf-8',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    }

    const config = Object.fromEntries(
        Object.entries(configVariables).map(([key, envKey]) => [key, env[envKey].trim()])
    );
    if (env.FIREBASE_MEASUREMENT_ID?.trim()) config.measurementId = env.FIREBASE_MEASUREMENT_ID.trim();
    const workerUrl = new URL(request.url);
    config.profileUploadWorkerUrl = `${workerUrl.origin}/`;
    config.profilePhotoPublicBaseUrl = env.PUBLIC_BASE_URL?.trim() || `${workerUrl.origin}/file`;

    return new Response(
        `window.ROLLCALL_FIREBASE_CONFIG = Object.freeze(${JSON.stringify(config)});`,
        {
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/javascript; charset=utf-8',
                'X-Content-Type-Options': 'nosniff'
            }
        }
    );
}

function decodeBase64Url(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function verifyFirebaseToken(token, projectId) {
    const parts = token.split('.');
    if (parts.length !== 3 || !projectId) return null;

    let header;
    let claims;
    try {
        header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
        claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    } catch (error) {
        return null;
    }

    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        claims.iss !== `https://securetoken.google.com/${projectId}` ||
        claims.aud !== projectId || typeof claims.sub !== 'string' ||
        claims.sub.length === 0 || claims.sub.length > 128 ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > Date.now() / 1000 + 60 ||
        !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 ||
        !Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 60) {
        return null;
    }

    const keysResponse = await fetch(FIREBASE_KEYS_URL, {
        cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!keysResponse.ok) throw new Error('Firebase signing keys are temporarily unavailable.');
    const keySet = await keysResponse.json();
    const jwk = keySet.keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
    );
    const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        decodeBase64Url(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? { uid: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' } : null;
}

function encodeBase64Url(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getFirebaseAccessToken(env) {
    if (firebaseAccessToken && firebaseAccessTokenExpiresAt > Date.now() + 60_000) return firebaseAccessToken;
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
    } catch (error) {
        throw new Error('Firebase service account configuration is invalid.');
    }
    if (!serviceAccount.client_email || !serviceAccount.private_key ||
        serviceAccount.project_id !== env.FIREBASE_PROJECT_ID) {
        throw new Error('Firebase service account configuration is incomplete.');
    }

    const now = Math.floor(Date.now() / 1000);
    const unsignedToken = `${encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${encodeBase64Url(JSON.stringify({
        iss: serviceAccount.client_email,
        aud: FIREBASE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
        scope: FIREBASE_AUTH_SCOPE
    }))}`;
    const privateKeyBytes = Uint8Array.from(
        atob(String(serviceAccount.private_key).replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
        character => character.charCodeAt(0)
    );
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(unsignedToken)
    );
    const assertion = `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
    const response = await fetch(FIREBASE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.access_token !== 'string') {
        throw new Error('Firebase service authentication failed.');
    }
    firebaseAccessToken = result.access_token;
    firebaseAccessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
    return firebaseAccessToken;
}

async function readDatabaseProfile(env, path, token) {
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${baseUrl}/${encodedPath}.json?auth=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Firebase profile authorization could not be verified.');
    return response.json();
}

async function findTargetProfile(env, email, targetUid, token) {
    if (targetUid) {
        const profile = await readDatabaseProfile(env, `users/${targetUid}`, token);
        return profile && typeof profile === 'object' ? { uid: targetUid, ...profile } : null;
    }

    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const query = new URLSearchParams({
        orderBy: '"email"',
        equalTo: JSON.stringify(email),
        auth: token
    });
    const response = await fetch(`${baseUrl}/users.json?${query.toString()}`);
    if (!response.ok) throw new Error('Firebase profile authorization could not be verified.');
    const profiles = await response.json();
    if (!profiles || typeof profiles !== 'object') return null;
    const match = Object.entries(profiles).find(([, profile]) =>
        String(profile?.email || '').toLowerCase() === email
    );
    return match ? { uid: match[0], ...match[1] } : null;
}

async function isAuthorizedReset(env, caller, email, targetUid, idToken) {
    if (!caller) return !targetUid;
    if (caller.email && caller.email.toLowerCase() === email) return !targetUid || targetUid === caller.uid;
    if (!targetUid && !idToken) return false;

    const [callerProfile, targetProfile] = await Promise.all([
        readDatabaseProfile(env, `users/${caller.uid}`, idToken),
        findTargetProfile(env, email, targetUid, idToken)
    ]);
    if (!callerProfile || String(callerProfile.role || '').toLowerCase() !== 'admin') return false;
    return Boolean(
        targetProfile &&
        String(targetProfile.email || '').toLowerCase() === email &&
        callerProfile.schoolId &&
        String(callerProfile.schoolId) === String(targetProfile.schoolId)
    );
}

async function readDatabaseWithAccessToken(env, path, accessToken) {
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const encodedPath = path ? `${path.split('/').map(encodeURIComponent).join('/')}.json` : '.json';
    const url = new URL(`${baseUrl}/${encodedPath}`);
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url);
    if (!response.ok) {
        const details = (await response.text().catch(() => '')).slice(0, 500);
        console.error('Firebase service-account database read failed:', response.status, details);
        throw new Error(`Firebase teacher data could not be verified (database HTTP ${response.status}).`);
    }
    return response.json();
}

async function updateDatabaseWithAccessToken(env, updates, accessToken) {
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const url = new URL(`${baseUrl}/.json`);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('print', 'silent');
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    if (!response.ok) {
        console.error('Firebase teacher data cleanup failed:', response.status);
        throw new Error('Teacher data cleanup failed. Retry the deletion to finish cleanup.');
    }
}

async function updateDatabaseWithIdToken(env, updates, idToken) {
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const url = new URL(`${baseUrl}/.json`);
    url.searchParams.set('auth', idToken);
    url.searchParams.set('print', 'silent');
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    if (!response.ok) {
        const details = await response.text().catch(() => '');
        console.error('Firebase student cleanup write failed:', response.status, details.slice(0, 500));
        throw new Error(`Student data cleanup failed (Firebase ${response.status}). Check the admin write rules and retry.`);
    }
}

async function lookupFirebaseAccount(projectId, uid, accessToken) {
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:lookup`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ localId: [uid] })
        }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error('Firebase teacher account lookup failed:', response.status);
        throw new Error('The teacher authentication account could not be verified.');
    }
    return Array.isArray(result.users) ? result.users[0] || null : null;
}

async function deleteFirebaseAccount(projectId, uid, accessToken) {
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ localIds: [uid], force: true })
        }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || (Array.isArray(result.errors) && result.errors.length)) {
        console.error('Firebase teacher account deletion failed:', response.status);
        throw new Error('The teacher authentication account could not be deleted. Teacher data was not removed.');
    }
}

async function lookupFirebaseAccounts(projectId, uids, accessToken) {
    const accounts = [];
    for (let index = 0; index < uids.length; index += 100) {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:lookup`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ localId: uids.slice(index, index + 100) })
            }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('Firebase school account lookup failed:', response.status);
            throw new Error('School authentication accounts could not be verified; no school data was deleted.');
        }
        accounts.push(...(Array.isArray(result.users) ? result.users : []));
    }
    return accounts;
}

async function deleteFirebaseAccounts(projectId, uids, accessToken) {
    for (let index = 0; index < uids.length; index += 1000) {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ localIds: uids.slice(index, index + 1000), force: true })
            }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || (Array.isArray(result.errors) && result.errors.length)) {
            console.error('Firebase school authentication deletion failed:', response.status);
            throw new Error('Email was accepted, but some authentication accounts could not be deleted. School data is retained; retry deletion to continue.');
        }
    }
}

function safeDatabaseChildKey(value) {
    return String(value).replace(/[.#$\[\]/]/g, character => encodeURIComponent(character));
}

function getOwnedProfilePhotoKey(env, value, targetUid) {
    const reference = String(value || '').trim();
    if (!reference) return '';

    let key = reference;
    if (/^https:\/\//i.test(reference)) {
        let photoUrl;
        let publicBase;
        try {
            photoUrl = new URL(reference);
            publicBase = new URL(env.PUBLIC_BASE_URL);
        } catch (error) {
            return '';
        }
        const basePath = publicBase.pathname.replace(/\/$/, '');
        if (photoUrl.origin !== publicBase.origin) return '';
        if ((photoUrl.pathname !== basePath && !photoUrl.pathname.startsWith(`${basePath}/`)) ||
            photoUrl.search || photoUrl.hash || photoUrl.username || photoUrl.password) return '';
        key = photoUrl.pathname.slice(`${basePath}/`.length);
    } else if (reference.startsWith('/')) {
        let photoUrl;
        let publicBase;
        try {
            publicBase = new URL(env.PUBLIC_BASE_URL);
            photoUrl = new URL(reference, publicBase.origin);
        } catch (error) {
            throw new Error('The profile photo URL is invalid; no data was deleted.');
        }
        const basePath = publicBase.pathname.replace(/\/$/, '');
        if (photoUrl.origin !== publicBase.origin || !photoUrl.pathname.startsWith(`${basePath}/`) || photoUrl.search || photoUrl.hash) {
            throw new Error('The profile photo URL is outside the configured R2 domain; no data was deleted.');
        }
        key = photoUrl.pathname.slice(`${basePath}/`.length);
    }

    try {
        key = key.split('/').map(part => decodeURIComponent(part)).join('/');
    } catch (error) {
        throw new Error('The profile photo reference is malformed; no data was deleted.');
    }

    const safeUid = String(targetUid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^profile-photos/${safeUid}/[0-9a-f-]{36}\\.(?:webp|jpg|png)$`, 'i').test(key) ||
        key.split('/').some(part => part === '.' || part === '..')) {
        throw new Error('The profile photo reference is invalid; no data was deleted.');
    }
    return key;
}

async function deleteTeacher(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return uploadResponse({ error: 'Administrator authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('Teacher deletion requester verification failed:', error);
        return uploadResponse({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return uploadResponse({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    const targetUid = String(payload?.targetUid || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === caller.uid) {
        return uploadResponse({ error: 'A valid teacher account must be selected.' }, 400, origin);
    }

    try {
        const callerProfile = await readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1]);
        if (!callerProfile || String(callerProfile.role || '').toLowerCase() !== 'admin') {
            return uploadResponse({ error: 'Administrator access is required.' }, 403, origin);
        }
        const callerSchoolId = String(callerProfile.schoolId || caller.uid);

        const accessToken = await getFirebaseAccessToken(env);
        const [teacherProfile, account] = await Promise.all([
            readDatabaseWithAccessToken(env, `users/${targetUid}`, accessToken),
            lookupFirebaseAccount(env.FIREBASE_PROJECT_ID, targetUid, accessToken)
        ]);
        if (!teacherProfile || String(teacherProfile.role || '').toLowerCase() !== 'teacher' ||
            String(teacherProfile.schoolId || '').trim() !== callerSchoolId.trim()) {
            return uploadResponse({ error: 'You can delete only teacher accounts belonging to your school.' }, 403, origin);
        }
        if (account && teacherProfile.email &&
            String(account.email || '').toLowerCase() !== String(teacherProfile.email).toLowerCase()) {
            return uploadResponse({ error: 'The teacher profile does not match its authentication account.' }, 409, origin);
        }

        const photoKey = String(teacherProfile.profilePhotoKey || '');
        if (photoKey && (!photoKey.startsWith(`profile-photos/${targetUid}/`) ||
            photoKey.split('/').some(part => part === '.' || part === '..'))) {
            return uploadResponse({ error: 'The teacher profile photo reference is invalid; no data was deleted.' }, 409, origin);
        }
        if (photoKey && !env.PROFILE_PHOTOS) {
            return uploadResponse({ error: 'Profile-photo storage is not configured; no data was deleted.' }, 503, origin);
        }

        await updateDatabaseWithAccessToken(env, {
            [`users/${safeDatabaseChildKey(targetUid)}/accountStatus`]: 'deleting',
            [`users/${safeDatabaseChildKey(targetUid)}/deleteRequestedAt`]: Date.now(),
            [`users/${safeDatabaseChildKey(targetUid)}/deleteRequestedBy`]: caller.uid
        }, accessToken);

        if (account) await deleteFirebaseAccount(env.FIREBASE_PROJECT_ID, targetUid, accessToken);

        const updates = {
            [`users/${safeDatabaseChildKey(targetUid)}`]: null,
            [`notifications/${safeDatabaseChildKey(targetUid)}`]: null,
            [`schoolUsers/${safeDatabaseChildKey(teacherProfile.schoolId)}/${safeDatabaseChildKey(targetUid)}`]: null
        };
        const assignments = await readDatabaseWithAccessToken(
            env,
            `classTeacherAssignments/${teacherProfile.schoolId}`,
            accessToken
        );
        if (assignments && typeof assignments === 'object') {
            Object.entries(assignments).forEach(([key, assignment]) => {
                if (assignment?.teacherId === targetUid) {
                    updates[`classTeacherAssignments/${safeDatabaseChildKey(teacherProfile.schoolId)}/${safeDatabaseChildKey(key)}`] = null;
                }
            });
        }

        if (photoKey) {
            try {
                await env.PROFILE_PHOTOS.delete(photoKey);
            } catch (error) {
                console.error('Teacher profile photo cleanup failed:', error);
                return uploadResponse({ error: 'The teacher account was removed, but profile photo cleanup failed. Retry deletion to finish cleanup.' }, 503, origin);
            }
        }

        await updateDatabaseWithAccessToken(env, updates, accessToken);
        return uploadResponse({
            ok: true,
            message: 'Teacher account and profile deleted. Attendance and historical requests/locations were retained.'
        }, 200, origin);
    } catch (error) {
        console.error('Teacher deletion failed:', error);
        return uploadResponse({ error: error.message || 'Teacher deletion failed.' }, 503, origin);
    }
}

async function deleteStudent(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return uploadResponse({ error: 'Administrator authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('Student deletion requester verification failed:', error);
        return uploadResponse({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return uploadResponse({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    const targetUid = String(payload?.targetUid || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === caller.uid) {
        return uploadResponse({ error: 'A valid student account must be selected.' }, 400, origin);
    }

    try {
        const callerProfile = await readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1]);
        if (!callerProfile || String(callerProfile.role || '').toLowerCase() !== 'admin') {
            return uploadResponse({ error: 'Administrator access is required.' }, 403, origin);
        }
        const callerSchoolId = String(callerProfile.schoolId || caller.uid).trim();
        const accessToken = await getFirebaseAccessToken(env);
        const [studentProfile, account] = await Promise.all([
            readDatabaseProfile(env, `users/${targetUid}`, tokenMatch[1]),
            lookupFirebaseAccount(env.FIREBASE_PROJECT_ID, targetUid, accessToken)
        ]);
        if (!studentProfile || String(studentProfile.role || '').toLowerCase() !== 'student' ||
            String(studentProfile.schoolId || '').trim() !== callerSchoolId) {
            return uploadResponse({ error: 'You can delete only student accounts belonging to your school.' }, 403, origin);
        }
        if (account && studentProfile.email &&
            String(account.email || '').toLowerCase() !== String(studentProfile.email).toLowerCase()) {
            return uploadResponse({ error: 'The student profile does not match its authentication account.' }, 409, origin);
        }

        let photoKey;
        try {
            photoKey = getOwnedProfilePhotoKey(env, studentProfile.profilePhotoKey || studentProfile.profilePhoto || '', targetUid);
        } catch (error) {
            return uploadResponse({ error: error.message }, 409, origin);
        }
        if (photoKey && !env.PROFILE_PHOTOS) {
            return uploadResponse({ error: 'Profile-photo storage is not configured; no data was deleted.' }, 503, origin);
        }

        await updateDatabaseWithIdToken(env, {
            [`users/${safeDatabaseChildKey(targetUid)}/accountStatus`]: 'deleting',
            [`users/${safeDatabaseChildKey(targetUid)}/deleteRequestedAt`]: Date.now(),
            [`users/${safeDatabaseChildKey(targetUid)}/deleteRequestedBy`]: caller.uid
        }, tokenMatch[1]);

        if (account) await deleteFirebaseAccount(env.FIREBASE_PROJECT_ID, targetUid, accessToken);
        if (photoKey) {
            try {
                await env.PROFILE_PHOTOS.delete(photoKey);
            } catch (error) {
                console.error('Student profile photo cleanup failed:', error);
                return uploadResponse({ error: 'The student authentication account was removed, but profile photo cleanup failed. Retry deletion to finish cleanup.' }, 503, origin);
            }
        }

        await updateDatabaseWithIdToken(env, {
            [`users/${safeDatabaseChildKey(targetUid)}`]: null,
            [`schoolUsers/${safeDatabaseChildKey(studentProfile.schoolId)}/${safeDatabaseChildKey(targetUid)}`]: null,
            [`notifications/${safeDatabaseChildKey(targetUid)}`]: null
        }, tokenMatch[1]);
        return uploadResponse({
            ok: true,
            message: 'Student authentication account, profile, notifications, and profile photo deleted. Attendance history was retained.'
        }, 200, origin);
    } catch (error) {
        console.error('Student deletion failed:', error);
        return uploadResponse({ error: error.message || 'Student deletion failed.' }, 503, origin);
    }
}

function normalizeAssignmentSection(value) {
    return String(value || '').trim().replace(/^section\s+/i, '').toLowerCase();
}

function normalizeAssignmentName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function teacherHasStudentAssignment(assignments, teacherUid, student) {
    const studentClassIds = [student.classId, student.courseId, student.enrolledClassId]
        .map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    const studentClassNames = [student.className, student.courseName, student.course, student.class, student.grade]
        .map(normalizeAssignmentName).filter(Boolean);
    const studentSection = normalizeAssignmentSection(student.section);
    if (!studentSection) return false;

    return Object.entries(assignments || {}).some(([classId, sections]) =>
        Object.values(sections || {}).some(assignment => {
            if (!assignment || String(assignment.teacherId || '') !== teacherUid ||
                String(assignment.schoolId || student.schoolId || '') !== String(student.schoolId || '')) return false;
            if (normalizeAssignmentSection(assignment.section) !== studentSection) return false;

            const assignedClassId = String(assignment.classId || classId || '').trim().toLowerCase();
            if (studentClassIds.length) return studentClassIds.includes(assignedClassId);
            const assignedClassName = normalizeAssignmentName(assignment.className);
            return Boolean(assignedClassName && studentClassNames.includes(assignedClassName));
        })
    );
}

async function manageTeacherBlockedStudent(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return response({ error: 'Teacher authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('Teacher block requester verification failed:', error);
        return response({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return response({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    const targetUid = String(payload?.targetUid || '').trim();
    const action = String(payload?.action || '').trim().toLowerCase();
    const reason = String(payload?.reason || '').trim().slice(0, 500);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === caller.uid || !['block', 'unblock'].includes(action)) {
        return response({ error: 'Select a valid student and action.' }, 400, origin);
    }

    try {
        const accessToken = await getFirebaseAccessToken(env);
        const [teacher, student, assignments, schoolUser, currentBlock] = await Promise.all([
            readDatabaseWithAccessToken(env, `users/${caller.uid}`, accessToken),
            readDatabaseWithAccessToken(env, `users/${targetUid}`, accessToken),
            readDatabaseWithAccessToken(env, `classTeacherAssignmentsByClass/${String(payload?.schoolId || '').trim()}`, accessToken),
            readDatabaseWithAccessToken(env, `schoolUsers/${String(payload?.schoolId || '').trim()}/${targetUid}`, accessToken),
            readDatabaseWithAccessToken(env, `blockedUsers/${targetUid}`, accessToken)
        ]);
        const schoolId = String(teacher?.schoolId || '').trim();
        if (!teacher || String(teacher.role || '').toLowerCase() !== 'teacher' || !schoolId ||
            String(payload?.schoolId || '').trim() !== schoolId) {
            return response({ error: 'Teacher access for this school could not be verified.' }, 403, origin);
        }
        if (!student || String(student.role || '').toLowerCase() !== 'student' ||
            (student.schoolId && String(student.schoolId).trim() !== schoolId) || !schoolUser ||
            (schoolUser.schoolId && String(schoolUser.schoolId).trim() !== schoolId)) {
            return response({ error: 'You can manage only student accounts belonging to your school.' }, 403, origin);
        }
        // The school-scoped membership record supplies legacy class/section fields when
        // older user profiles do not contain them. Keep the authenticated user role and
        // any explicit school ID authoritative.
        const assignmentStudent = { ...schoolUser, ...student, schoolId };
        ['classId', 'courseId', 'enrolledClassId', 'className', 'courseName', 'course', 'class', 'grade', 'section']
            .forEach(key => {
                if (student[key] == null || String(student[key]).trim() === '') assignmentStudent[key] = schoolUser[key];
            });
        if (!teacherHasStudentAssignment(assignments, caller.uid, assignmentStudent)) {
            return response({ error: 'You can manage only students in your assigned classes and sections.' }, 403, origin);
        }
        if (currentBlock && String(currentBlock.schoolId || '').trim() !== schoolId) {
            return response({ error: 'This account has a block record owned by another school.' }, 409, origin);
        }

        const path = `blockedUsers/${safeDatabaseChildKey(targetUid)}`;
        const userPath = `users/${safeDatabaseChildKey(targetUid)}`;
        const updates = action === 'block'
            ? {
                [path]: {
                    name: String(student.name || student.fullName || ''),
                    email: String(student.email || ''),
                    role: 'student',
                    schoolId,
                    reason,
                    blockedDate: Date.now(),
                    blockedBy: caller.uid
                },
                [`${userPath}/blocked`]: true,
                [`${userPath}/blockedSchoolId`]: schoolId,
                [`${userPath}/blockedRole`]: 'student',
                [`${userPath}/blockedBy`]: caller.uid,
                [`${userPath}/blockedReason`]: reason
            }
            : {
                [path]: null,
                [`${userPath}/blocked`]: false,
                [`${userPath}/blockedSchoolId`]: null,
                [`${userPath}/blockedRole`]: null,
                [`${userPath}/blockedBy`]: null,
                [`${userPath}/blockedReason`]: null
            };
        await updateDatabaseWithAccessToken(env, updates, accessToken);
        return response({ ok: true, action }, 200, origin);
    } catch (error) {
        console.error('Teacher student-block update failed:', error);
        return response({ error: error.message || 'Student access could not be updated.' }, 503, origin);
    }
}

async function sendCustomMail(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return response({ error: 'Owner authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('Custom mail requester verification failed:', error);
        return response({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return response({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 24 * 1024);
    const subject = String(payload?.subject || '').trim();
    const message = String(payload?.message || '').trim();
    const recipientUids = Array.isArray(payload?.recipientUids)
        ? [...new Set(payload.recipientUids.map(uid => String(uid || '').trim()))]
        : [];
    if (!payload || subject.length < 1 || subject.length > 160 || message.length < 1 || message.length > 10000 ||
        !recipientUids.length || recipientUids.length > 100 || recipientUids.some(uid => !/^[A-Za-z0-9_-]{1,128}$/.test(uid))) {
        return response({ error: 'Enter a subject and message, then select between 1 and 100 recipients.' }, 400, origin);
    }

    try {
        const [ownerProfile, userProfile] = await Promise.all([
            readDatabaseProfile(env, `owners/${caller.uid}`, tokenMatch[1]),
            readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1])
        ]);
        const ownerRoles = new Set(['owner', 'platform_owner', 'super_owner']);
        const profileRole = String(userProfile?.role || '').trim().toLowerCase();
        const storedOwnerRole = String(ownerProfile?.role || ownerProfile?.accountType || ownerProfile?.platformRole || '').trim().toLowerCase();
        const isKnownNonOwner = profileRole && !ownerRoles.has(profileRole);
        const hasOwnerRecord = !!ownerProfile && typeof ownerProfile === 'object' && (!storedOwnerRole || ownerRoles.has(storedOwnerRole));
        const hasExplicitOwnerRole = ownerRoles.has(profileRole) || ownerRoles.has(storedOwnerRole);
        if (isKnownNonOwner || (!hasOwnerRecord && !hasExplicitOwnerRole)) {
            return response({ error: 'Platform owner access is required.' }, 403, origin);
        }
        const profiles = await Promise.all(recipientUids.map(async uid => {
            const profile = await readDatabaseProfile(env, `users/${uid}`, tokenMatch[1]);
            return profile && typeof profile === 'object' ? { uid, ...profile } : null;
        }));
        const recipients = [...new Map(profiles
            .filter(profile => profile && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(profile.email || '').trim()))
            .map(profile => [String(profile.email).trim().toLowerCase(), String(profile.email).trim()])).values()];
        if (!recipients.length) return response({ error: 'None of the selected accounts has a valid email address.' }, 400, origin);

        await Promise.all(recipients.map(email => sendBrevoCustomMail(env, email, subject, message)));
        return response({ sent: recipients.length }, 200, origin);
    } catch (error) {
        console.error('Owner custom mail delivery failed:', error);
        return response({ error: error.message || 'Custom mail could not be sent.' }, 503, origin);
    }
}

async function sendSchoolAdminCredentials(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return response({ error: 'Owner authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('School credentials requester verification failed:', error);
        return response({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return response({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    const schoolId = String(payload?.schoolId || '').trim();
    const adminUid = String(payload?.adminUid || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(schoolId) || !/^[A-Za-z0-9_-]{1,128}$/.test(adminUid)) {
        return response({ error: 'A valid school and administrator are required.' }, 400, origin);
    }

    try {
        const [ownerProfile, userProfile] = await Promise.all([
            readDatabaseProfile(env, `owners/${caller.uid}`, tokenMatch[1]),
            readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1])
        ]);
        const ownerRoles = new Set(['owner', 'platform_owner', 'super_owner']);
        const profileRole = String(userProfile?.role || '').trim().toLowerCase();
        const storedOwnerRole = String(ownerProfile?.role || ownerProfile?.accountType || ownerProfile?.platformRole || '').trim().toLowerCase();
        const isKnownNonOwner = profileRole && !ownerRoles.has(profileRole);
        const hasOwnerRecord = !!ownerProfile && typeof ownerProfile === 'object' && (!storedOwnerRole || ownerRoles.has(storedOwnerRole));
        const hasExplicitOwnerRole = ownerRoles.has(profileRole) || ownerRoles.has(storedOwnerRole);
        if (isKnownNonOwner || (!hasOwnerRecord && !hasExplicitOwnerRole)) {
            return response({ error: 'Platform owner access is required.' }, 403, origin);
        }

        const accessToken = await getFirebaseAccessToken(env);
        const [school, admin] = await Promise.all([
            readDatabaseWithAccessToken(env, `schools/${schoolId}`, accessToken),
            readDatabaseWithAccessToken(env, `schoolAdmins/${schoolId}`, accessToken)
        ]);
        const recipientEmail = String(admin?.email || '').trim();
        if (!school || String(school.ownerId || '') !== caller.uid ||
            String(school.contacts?.admin?.uid || '') !== adminUid || String(admin?.authUid || '') !== adminUid ||
            String(school.contacts?.admin?.email || '').toLowerCase() !== recipientEmail.toLowerCase() ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || !admin.password) {
            return response({ error: 'The registered school administrator credentials could not be verified.' }, 403, origin);
        }

        await sendBrevoSchoolAdminCredentials(env, recipientEmail, school, admin);
        return response({ sent: true }, 200, origin);
    } catch (error) {
        console.error('School administrator credentials email failed:', error);
        return response({ error: error.message || 'The administrator credentials email could not be sent.' }, 503, origin);
    }
}

async function generatePasswordResetLink(env, email) {
    if (!env.FIREBASE_PROJECT_ID) throw new Error('Firebase project ID is not configured.');
    const accessToken = await getFirebaseAccessToken(env);
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:sendOobCode`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email, returnOobLink: true })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const errorCode = String(result.error?.message || '');
        if (errorCode.includes('EMAIL_NOT_FOUND') || errorCode.includes('USER_NOT_FOUND')) return null;
        console.error('Firebase password reset link generation failed:', response.status, errorCode || 'unknown error');
        throw new Error('Firebase could not generate a password reset link.');
    }
    if (typeof result.oobLink !== 'string' || !result.oobLink.startsWith('https://')) {
        throw new Error('Firebase did not return a valid password reset link.');
    }
    return result.oobLink;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

async function sendBrevoPasswordReset(env, email, resetLink) {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.BREVO_SENDER_NAME) {
        throw new Error('Brevo sender configuration is incomplete.');
    }
    const safeResetLink = escapeHtml(resetLink);
    const htmlContent = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Reset your RollCall password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">Reset your RollCall password securely.</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
        <tr>
            <td align="center" style="padding:36px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
                    <tr>
                        <td style="padding:28px 36px;background-color:#1e3a8a;">
                            <p style="margin:0;color:#ffffff;font-size:24px;line-height:32px;font-weight:700;letter-spacing:0.2px;">RollCall</p>
                            <p style="margin:4px 0 0;color:#dbeafe;font-size:13px;line-height:20px;">Attendance, made simple</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:36px;">
                            <p style="margin:0 0 12px;color:#2563eb;font-size:13px;line-height:20px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Account security</p>
                            <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;line-height:36px;">Reset your password</h1>
                            <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:26px;">We received a request to reset the password for your RollCall account. Use the button below to choose a new password.</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                                <tr>
                                    <td align="center" style="border-radius:8px;background-color:#2563eb;">
                                        <a href="${safeResetLink}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;border-radius:8px;">Reset password</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:0 0 10px;color:#64748b;font-size:14px;line-height:22px;">If the button doesn’t work, copy and paste this link into your browser:</p>
                            <p style="margin:0 0 24px;word-break:break-all;font-size:13px;line-height:21px;"><a href="${safeResetLink}" style="color:#2563eb;text-decoration:underline;">${safeResetLink}</a></p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:16px;background-color:#f8fafc;border-radius:8px;color:#475569;font-size:14px;line-height:22px;">If you didn’t request a password reset, you can safely ignore this email. Your password will remain unchanged.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#64748b;font-size:12px;line-height:19px;">This is an automated security message from RollCall. Please don’t reply to this email.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    const textContent = `Reset your RollCall password

We received a request to reset the password for your RollCall account. Open this link to choose a new password:
${resetLink}

If you didn’t request a password reset, you can safely ignore this email. Your password will remain unchanged.

This is an automated security message from RollCall. Please don’t reply to this email.`;
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
            to: [{ email }],
            subject: 'Reset your RollCall password',
            htmlContent,
            textContent
        })
    });
    if (!response.ok) {
        console.error('Brevo password reset email delivery failed:', response.status);
        throw new Error('The password reset email could not be sent.');
    }
}

async function sendBrevoCustomMail(env, email, subject, message) {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.BREVO_SENDER_NAME) {
        throw new Error('Brevo sender configuration is incomplete.');
    }
    const safeSubject = escapeHtml(subject);
    const paragraphs = message.split(/\r?\n/).map(line =>
        line ? `<p style="margin:0 0 12px;color:#334155;font-size:16px;line-height:26px;">${escapeHtml(line)}</p>` : '<br>'
    ).join('');
    const htmlContent = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#eaf0f8;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${safeSubject}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eaf0f8" style="width:100%;background-color:#eaf0f8;">
        <tr>
            <td align="center" style="padding:40px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #dbe5f1;border-radius:16px;overflow:hidden;">
                    <tr>
                        <td bgcolor="#173b70" style="padding:26px 36px;background-color:#173b70;border-bottom:4px solid #38bdf8;">
                            <p style="margin:0;color:#ffffff;font-size:24px;line-height:30px;font-weight:700;letter-spacing:0.2px;">RollCall</p>
                            <p style="margin:5px 0 0;color:#dbeafe;font-size:13px;line-height:20px;">Attendance, made simple</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:36px;">
                            <h1 style="margin:0 0 22px;color:#0f172a;font-size:24px;line-height:32px;font-weight:700;">${safeSubject}</h1>
                            <div style="padding:22px 24px;background-color:#f5f8fc;border:1px solid #e3eaf3;border-radius:10px;">
                                ${paragraphs}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td bgcolor="#f8fafc" style="padding:18px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#64748b;font-size:12px;line-height:18px;">This message was sent by the RollCall platform team.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    const textContent = `RollCall\n\n${subject}\n\n${message}`;
    const result = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
            to: [{ email }], subject, htmlContent, textContent
        })
    });
    if (!result.ok) {
        console.error('Brevo custom mail delivery failed:', result.status);
        throw new Error('The custom email could not be delivered.');
    }
}

async function sendBrevoSchoolAdminCredentials(env, email, school, admin) {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.BREVO_SENDER_NAME) {
        throw new Error('Brevo sender configuration is incomplete.');
    }
    const schoolName = escapeHtml(school.name || 'Your school');
    const adminName = escapeHtml(admin.name || school.contacts?.admin?.name || 'Administrator');
    const username = escapeHtml(admin.username || school.contacts?.admin?.username || email);
    const safeEmail = escapeHtml(email);
    const password = escapeHtml(admin.password);
    const subject = `Administrator login details for ${school.name || 'your school'}`;
    const htmlContent = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#eaf0f8;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eaf0f8" style="width:100%;background-color:#eaf0f8;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #dbe5f1;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="#173b70" style="padding:26px 36px;background-color:#173b70;border-bottom:4px solid #38bdf8;"><p style="margin:0;color:#fff;font-size:24px;line-height:30px;font-weight:700;">RollCall</p><p style="margin:5px 0 0;color:#dbeafe;font-size:13px;line-height:20px;">Attendance, made simple</p></td></tr>
<tr><td style="padding:36px;"><p style="margin:0 0 8px;color:#2563eb;font-size:13px;line-height:20px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Administrator account</p><h1 style="margin:0 0 14px;color:#0f172a;font-size:24px;line-height:32px;">Welcome to RollCall, ${adminName}</h1><p style="margin:0 0 22px;color:#475569;font-size:16px;line-height:25px;">The administrator account for <strong>${schoolName}</strong> is ready. Use these details to sign in:</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f8fc" style="width:100%;background-color:#f5f8fc;border:1px solid #e3eaf3;border-radius:10px;"><tr><td style="padding:20px 22px;"><p style="margin:0 0 14px;color:#64748b;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px;">Username</p><p style="margin:-10px 0 18px;color:#0f172a;font-size:16px;line-height:24px;font-weight:700;">${username}</p><p style="margin:0 0 14px;color:#64748b;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px;">Email</p><p style="margin:-10px 0 18px;color:#0f172a;font-size:16px;line-height:24px;">${safeEmail}</p><p style="margin:0 0 14px;color:#64748b;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px;">Temporary password</p><p style="margin:-10px 0 0;color:#0f172a;font-size:16px;line-height:24px;font-weight:700;word-break:break-word;">${password}</p></td></tr></table>
<p style="margin:22px 0 0;color:#475569;font-size:14px;line-height:22px;">For account security, sign in and change the temporary password as soon as possible.</p></td></tr>
<tr><td bgcolor="#f8fafc" style="padding:18px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:12px;line-height:18px;">This message was sent by the RollCall platform team.</p></td></tr>
</table></td></tr></table></body></html>`;
    const textContent = `RollCall administrator account\n\nHello ${admin.name || school.contacts?.admin?.name || 'Administrator'},\n\nThe administrator account for ${school.name || 'your school'} is ready.\n\nUsername: ${admin.username || school.contacts?.admin?.username || email}\nEmail: ${email}\nTemporary password: ${admin.password}\n\nFor account security, sign in and change the temporary password as soon as possible.`;
    const result = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ email }], subject, htmlContent, textContent })
    });
    if (!result.ok) {
        console.error('Brevo administrator credentials email failed:', result.status);
        throw new Error('Brevo could not deliver the administrator credentials email.');
    }
}

async function readJsonWithinLimit(request, maxBytes) {
    const declaredLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
    if (!request.body) return null;

    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        return null;
    }
}

function normalizeDate(str) {
    if (!str) return '';
    const s = String(str).trim();
    const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return s.toLowerCase();
}

const RESET_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;          // 60s minimum between consecutive requests
const RESET_RATE_LIMIT_HOURLY_WINDOW_MS = 60 * 60 * 1000; // 1-hour rolling window
const RESET_RATE_LIMIT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour rolling window
const MAX_RESETS_PER_HOUR = 3;
const MAX_RESETS_PER_DAY = 5;

// Converts an email address to a safe Firebase RTDB child key.
// Firebase RTDB keys cannot contain: . # $ [ ] /
// We replace these with safe literal characters (NOT percent-encoding) so the key
// is stable across URL encode/decode round-trips when accessed via the REST API.
function emailToRtdbKey(email) {
    return String(email).toLowerCase()
        .replace(/\./g, ',')     // dot         → comma
        .replace(/\[/g, '(')    // open bracket → open paren
        .replace(/\]/g, ')')    // close bracket→ close paren
        .replace(/[#$/]/g, '_'); // # $ /        → underscore
}

async function checkPasswordResetRateLimit(env, email) {
    if (!email) return { allowed: true, record: null };

    let accessToken;
    try {
        accessToken = await getFirebaseAccessToken(env);
    } catch (err) {
        console.warn('Rate limit check: failed to get Firebase access token:', err);
        // Cannot read limit record — fail CLOSED to protect against Brevo cost abuse.
        return { allowed: false, error: 'Password reset service is temporarily unavailable. Try again shortly.', status: 503 };
    }

    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) return { allowed: false, error: 'Password reset service is temporarily unavailable. Try again shortly.', status: 503 };

    const key = encodeURIComponent(emailToRtdbKey(email));

    try {
        const readUrl = new URL(`${baseUrl}/passwordResetLimits/${key}.json`);
        readUrl.searchParams.set('access_token', accessToken);

        const fetchResp = await fetch(readUrl);
        if (!fetchResp.ok) {
            console.warn('Rate limit read failed with HTTP', fetchResp.status);
            // Fail CLOSED — treat as if limit is reached so we don't leak emails on error.
            return { allowed: false, error: 'Password reset service is temporarily unavailable. Try again shortly.', status: 503 };
        }

        const limitRecord = await fetchResp.json().catch(() => null);
        const now = Date.now();

        if (!limitRecord || typeof limitRecord !== 'object') {
            // No record yet — this is the first request ever for this email.
            return { allowed: true, record: { requests: [] }, accessToken, baseUrl, key };
        }

        const rawRequests = Array.isArray(limitRecord.requests) ? limitRecord.requests : [];
        const validRequests = rawRequests
            .map(Number)
            .filter(t => Number.isFinite(t) && t > 0 && (now - t) < RESET_RATE_LIMIT_DAILY_WINDOW_MS)
            .sort((a, b) => a - b);

        // All stored requests expired (>24h old) — delete the stale record from Firebase.
        if (validRequests.length === 0 && rawRequests.length > 0) {
            const deleteUrl = new URL(`${baseUrl}/passwordResetLimits/${key}.json`);
            deleteUrl.searchParams.set('access_token', accessToken);
            fetch(deleteUrl, { method: 'DELETE' }).catch(err =>
                console.warn('Failed to delete stale passwordResetLimits record:', err)
            );
            return { allowed: true, record: { requests: [] }, accessToken, baseUrl, key };
        }

        const lastRequestedAt = Number(limitRecord.lastRequestedAt) || (validRequests.length > 0 ? validRequests[validRequests.length - 1] : 0);

        // 1. Cooldown — minimum 60 seconds between consecutive requests
        if (lastRequestedAt > 0 && (now - lastRequestedAt) < RESET_RATE_LIMIT_COOLDOWN_MS) {
            const remainingSeconds = Math.max(1, Math.ceil((RESET_RATE_LIMIT_COOLDOWN_MS - (now - lastRequestedAt)) / 1000));
            return {
                allowed: false,
                error: `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} before requesting another password reset.`,
                status: 429
            };
        }

        // 2. Hourly cap — max 3 requests per rolling 60-minute window
        const hourlyRequests = validRequests.filter(t => (now - t) < RESET_RATE_LIMIT_HOURLY_WINDOW_MS);
        if (hourlyRequests.length >= MAX_RESETS_PER_HOUR) {
            const earliestHourly = hourlyRequests[0];
            const remainingMinutes = Math.max(1, Math.ceil((RESET_RATE_LIMIT_HOURLY_WINDOW_MS - (now - earliestHourly)) / 60000));
            return {
                allowed: false,
                error: `Password reset limit reached (maximum ${MAX_RESETS_PER_HOUR} per hour). Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
                status: 429
            };
        }

        // 3. Daily hard cap — max 5 requests per rolling 24-hour window
        if (validRequests.length >= MAX_RESETS_PER_DAY) {
            const earliestDaily = validRequests[0];
            const remainingHours = Math.max(1, Math.ceil((RESET_RATE_LIMIT_DAILY_WINDOW_MS - (now - earliestDaily)) / 3600000));
            return {
                allowed: false,
                error: `Daily password reset limit exceeded (maximum ${MAX_RESETS_PER_DAY} per day). Please try again in ${remainingHours} hour${remainingHours === 1 ? '' : 's'}.`,
                status: 429
            };
        }

        return { allowed: true, record: { requests: validRequests, lastRequestedAt }, accessToken, baseUrl, key };
    } catch (error) {
        console.warn('Error during password reset rate limit check:', error);
        // Fail CLOSED — unexpected errors must not allow unlimited email sends.
        return { allowed: false, error: 'Password reset service is temporarily unavailable. Try again shortly.', status: 503 };
    }
}

async function recordPasswordResetSuccess(env, email, rateLimitResult) {
    if (!email || !rateLimitResult) return;

    // Reuse the accessToken, baseUrl and key already resolved during the limit check
    // to avoid redundant work and ensure the same path is used for both read and write.
    const { accessToken, baseUrl, key, record: existingRecord } = rateLimitResult;
    if (!accessToken || !baseUrl || !key) return;

    try {
        const now = Date.now();
        const previousRequests = (existingRecord && Array.isArray(existingRecord.requests))
            ? existingRecord.requests.map(Number).filter(t => Number.isFinite(t) && t > 0 && (now - t) < RESET_RATE_LIMIT_DAILY_WINDOW_MS)
            : [];

        previousRequests.push(now);

        const targetUrl = new URL(`${baseUrl}/passwordResetLimits/${key}.json`);
        targetUrl.searchParams.set('access_token', accessToken);
        targetUrl.searchParams.set('print', 'silent');

        const putResponse = await fetch(targetUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email.toLowerCase(),
                lastRequestedAt: now,
                requests: previousRequests,
                updatedAt: new Date(now).toISOString()
            })
        });

        if (!putResponse.ok) {
            console.warn('Failed to persist password reset limit record:', putResponse.status);
        }
    } catch (error) {
        console.warn('Error recording password reset rate limit entry:', error);
    }
}



async function handlePasswordReset(request, env, origin) {
    const payload = await readJsonWithinLimit(request, 4096);
    if (!payload) return response({ error: 'Invalid password reset request.' }, 400, origin);

    const email = String(payload.email || '').trim().toLowerCase();
    const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
    const dob = typeof payload.dob === 'string' ? payload.dob.trim() : '';
    const classRoll = typeof payload.classRoll === 'string' ? payload.classRoll.trim() : '';
    const univRoll = typeof payload.univRoll === 'string' ? payload.univRoll.trim() : '';
    const portal = typeof payload.portal === 'string' ? payload.portal.trim().toLowerCase() : '';
    const isStudentVerification = Boolean(portal === 'student' || dob);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        (targetUid && !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid))) {
        return response({ error: 'Enter a valid email address.' }, 400, origin);
    }

    // Enforce per-account password reset limits to prevent abuse and high Brevo email costs
    const rateLimit = await checkPasswordResetRateLimit(env, email);
    if (!rateLimit.allowed) {
        return response({ error: rateLimit.error }, rateLimit.status || 429, origin);
    }

    if (isStudentVerification) {
        if (!dob) {
            return response({ error: 'Date of birth is required.' }, 400, origin);
        }

        try {
            const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
            if (!baseUrl) throw new Error('Firebase database URL is not configured.');

            // User records are readable by this public password-reset lookup under the deployed
            // RTDB rules. Avoid service-account authorization here so verification does not
            // depend on Worker IAM permissions for a read-only account lookup.
            const query = new URLSearchParams({
                orderBy: '"email"',
                equalTo: JSON.stringify(email)
            });
            const searchResponse = await fetch(`${baseUrl}/users.json?${query.toString()}`);
            if (!searchResponse.ok) {
                console.error('Firebase student lookup failed:', searchResponse.status);
                return response({ error: 'Verification service is temporarily unavailable. Try again shortly.' }, 503, origin);
            }

            const matchedUsers = await searchResponse.json();
            if (!matchedUsers || typeof matchedUsers !== 'object' || Object.keys(matchedUsers).length === 0) {
                return response({ error: 'No student account was found with this email address.' }, 404, origin);
            }

            let studentUser = null;
            let studentUid = null;
            for (const [uid, u] of Object.entries(matchedUsers)) {
                if (u && typeof u === 'object') {
                    studentUid = uid;
                    studentUser = u;
                    break;
                }
            }

            if (!studentUser) {
                return response({ error: 'No student account was found with this email address.' }, 404, origin);
            }

            // Verify credentials against student record in database
            const storedDob = studentUser.dateOfBirth || studentUser.dob || studentUser.birthDate || '';
            const normalizedStoredDob = normalizeDate(storedDob);
            const normalizedInputDob = normalizeDate(dob);

            if (!normalizedStoredDob || normalizedStoredDob !== normalizedInputDob) {
                return response({ error: 'Invalid details. Date of birth does not match our records.' }, 400, origin);
            }

            // Generate password reset link and send via Brevo email
            const resetLink = await generatePasswordResetLink(env, email);
            if (resetLink) {
                await sendBrevoPasswordReset(env, email, resetLink);
                await recordPasswordResetSuccess(env, email, rateLimit);
            } else {
                throw new Error('Failed to generate password reset link.');
            }

            // Record request in passwordResetRequests
            try {
                const accessToken = await getFirebaseAccessToken(env);
                const reqUrl = new URL(`${baseUrl}/passwordResetRequests.json`);
                reqUrl.searchParams.set('access_token', accessToken);
                await fetch(reqUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        dob,
                        studentUid,
                        status: 'sent',
                        timestamp: Date.now(),
                        sentAt: new Date().toISOString(),
                        portal: 'student'
                    })
                });
            } catch (logErr) {
                console.warn('Failed to record password reset request log:', logErr);
            }

            return response({
                message: 'Password reset link has been sent to your registered email address. Please check your inbox.'
            }, 200, origin);
        } catch (error) {
            console.error('Student password reset error:', error);
            return response({ error: error.message || 'Password reset is temporarily unavailable. Try again later.' }, 503, origin);
        }
    }

    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (authorization && !tokenMatch) return response({ error: 'Authentication token is invalid.' }, 401, origin);
    let caller = null;
    if (tokenMatch) {
        try {
            caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
        } catch (error) {
            console.error('Firebase password reset requester verification failed:', error);
            return response({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
        }
        if (!caller) return response({ error: 'Authentication token is invalid or expired.' }, 401, origin);
    }

    try {
        if (caller && (caller.email.toLowerCase() !== email || targetUid !== caller.uid)) {
            const allowed = await isAuthorizedReset(env, caller, email, targetUid, tokenMatch[1]);
            if (!allowed) return response({ error: 'You are not allowed to reset this account password.' }, 403, origin);
        } else if (!caller && targetUid) {
            return response({ error: 'Authentication is required for administrative password resets.' }, 401, origin);
        }

        const resetLink = await generatePasswordResetLink(env, email);
        if (resetLink) {
            await sendBrevoPasswordReset(env, email, resetLink);
            await recordPasswordResetSuccess(env, email, rateLimit);
        }
        return response({ message: RESET_MESSAGE }, 200, origin);
    } catch (error) {
        console.error('Password reset delivery failed:', error);
        return response({ error: 'Password reset is temporarily unavailable. Try again later.' }, 503, origin);
    }
}

async function readBodyWithinLimit(request) {
    const declaredLength = Number(request.headers.get('Content-Length'));
    if (!Number.isFinite(declaredLength) || declaredLength < 1 || declaredLength > MAX_BYTES) return null;
    if (!request.body) return null;

    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    if (length !== declaredLength) return null;

    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function validImage(bytes, contentType) {
    if (contentType === 'image/webp') {
        return bytes.length >= 12 &&
            String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
    }
    if (contentType === 'image/jpeg') {
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (contentType === 'image/png') {
        return bytes.length >= 8 &&
            bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
            bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    }
    return false;
}

function publicPhotoUrl(baseUrl, key) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
        throw new Error('The public photo domain must be an HTTPS base URL.');
    }
    const prefix = base.href.endsWith('/') ? base.href : `${base.href}/`;
    return new URL(key.split('/').map(encodeURIComponent).join('/'), prefix).href;
}

function corsHeaders(origin) {
    const headers = {
        'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

async function signUpload(env, key, contentType, expiresAt) {
    if (!env.R2_UPLOAD_SIGNING_SECRET) throw new Error('R2 upload signing secret is not configured.');
    const secret = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(env.R2_UPLOAD_SIGNING_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'HMAC',
        secret,
        new TextEncoder().encode(`${key}\n${contentType}\n${expiresAt}`)
    );
    return encodeBase64Url(new Uint8Array(signature));
}

async function verifyUploadSignature(env, key, contentType, expiresAt, signature) {
    if (!env.R2_UPLOAD_SIGNING_SECRET || !/^\d+$/.test(expiresAt) ||
        Number(expiresAt) < Date.now() / 1000 || Number(expiresAt) > Date.now() / 1000 + 300) return false;
    const secret = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(env.R2_UPLOAD_SIGNING_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
    try {
        return await crypto.subtle.verify(
            'HMAC',
            secret,
            decodeBase64Url(signature),
            new TextEncoder().encode(`${key}\n${contentType}\n${expiresAt}`)
        );
    } catch (error) {
        return false;
    }
}

function uploadResponse(body, status, origin) {
    return new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(origin),
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function databasePathUrl(env, path, accessToken) {
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Firebase database URL is not configured.');
    const encodedPath = path ? `${path.split('/').map(encodeURIComponent).join('/')}.json` : '.json';
    const url = new URL(`${baseUrl}/${encodedPath}`);
    url.searchParams.set('access_token', accessToken);
    return url;
}

async function readLicenseRecord(env, schoolId, accessToken) {
    const url = databasePathUrl(env, `erpLicenseKeys/${schoolId}`, accessToken);
    const result = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
    if (!result.ok) throw new Error('ERP license data could not be loaded from Firebase.');
    return { record: await result.json(), etag: result.headers.get('ETag') || 'null_etag' };
}

async function updateErpLicenseDatabase(env, updates, accessToken) {
    const result = await fetch(databasePathUrl(env, '', accessToken), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    if (!result.ok) {
        console.error('ERP license Firebase update failed:', result.status);
        throw new Error('ERP license data could not be updated.');
    }
}

async function writeLicenseRecord(env, schoolId, record, etag, accessToken) {
    const result = await fetch(databasePathUrl(env, `erpLicenseKeys/${schoolId}`, accessToken), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(record)
    });
    if (result.status === 412) return false;
    if (!result.ok) throw new Error('ERP license data could not be saved to Firebase.');
    return true;
}

function getLicenseEncryptionKey(env) {
    const value = String(env.ERP_LICENSE_ENCRYPTION_KEY || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) {
        throw new Error('ERP license encryption is not configured.');
    }
    return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}

async function encryptLicenseCode(env, code) {
    const key = await crypto.subtle.importKey('raw', getLicenseEncryptionKey(env), { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(code)
    );
    return { iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(new Uint8Array(ciphertext)) };
}

async function decryptLicenseCode(env, record) {
    const key = await crypto.subtle.importKey('raw', getLicenseEncryptionKey(env), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeBase64Url(record.iv) },
        key,
        decodeBase64Url(record.encryptedCode)
    );
    return new TextDecoder().decode(plaintext);
}

async function hashLicenseCode(code) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeErpDevice(device) {
    if (!device || typeof device !== 'object' || Array.isArray(device)) return null;
    const fields = ['deviceName', 'os', 'osVersion', 'appVersion', 'architecture'];
    const limits = { deviceName: 120, os: 32, osVersion: 120, appVersion: 32, architecture: 32 };
    const normalized = {};
    for (const field of fields) {
        const value = device[field];
        if (typeof value !== 'string' || !value.trim() || value.length > limits[field]) return null;
        normalized[field] = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
        if (!normalized[field]) return null;
    }
    return normalized;
}

async function recordErpDevice(env, schoolId, device, accessToken) {
    const identity = JSON.stringify({
        deviceName: device.deviceName.toLowerCase(),
        os: device.os.toLowerCase(),
        architecture: device.architecture.toLowerCase()
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const deviceId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const path = `erpLicenseDevices/${schoolId}/${deviceId}`;
    const previous = await readDatabaseWithAccessToken(env, path, accessToken);
    const now = Date.now();
    await updateErpLicenseDatabase(env, {
        [path]: {
            ...device,
            firstActivatedAt: Number(previous?.firstActivatedAt) || now,
            lastVerifiedAt: now
        }
    }, accessToken);
}

function subscriptionIsActive(subscription, now = Date.now()) {
    const startsAt = Date.parse(subscription?.startDate || '');
    const expiresAt = Date.parse(subscription?.endDate || '');
    const status = String(subscription?.status || '').toLowerCase();
    return ['active', 'trial', 'trialing'].includes(status) &&
        Number.isFinite(startsAt) && startsAt <= now &&
        Number.isFinite(expiresAt) && expiresAt > now;
}

async function readErpLicenseContext(env, schoolId, accessToken) {
    const school = await readDatabaseWithAccessToken(env, `schools/${schoolId}`, accessToken);
    if (!school || typeof school !== 'object') throw new Error('The linked institution could not be loaded.');
    const ownerId = String(school.ownerId || '').trim();
    if (!ownerId) return { erpMode: false, school, ownerSchool: null, subscription: {} };
    const ownerSchool = await readDatabaseWithAccessToken(env, `owners/${ownerId}/schools/${schoolId}`, accessToken);
    if (!ownerSchool || String(ownerSchool.ownerId || '') !== ownerId) {
        return { erpMode: false, school, ownerSchool: null, subscription: {} };
    }
    const subscription = ownerSchool.subscription || {};
    const institutionType = String(ownerSchool.institutionType || ownerSchool.type || '').trim().toLowerCase();
    if (institutionType !== 'erp') {
        return { erpMode: false, school, ownerSchool, subscription };
    }
    const schoolSubscription = school.subscription || {};
    const planId = String(subscription.planId || '').trim();
    const schoolPlanId = String(schoolSubscription.planId || '').trim();
    const subscriptionStart = Date.parse(subscription.startDate || '');
    const schoolSubscriptionStart = Date.parse(schoolSubscription.startDate || '');
    const subscriptionEnd = Date.parse(subscription.endDate || '');
    const schoolSubscriptionEnd = Date.parse(schoolSubscription.endDate || '');
    if (!planId ||
        planId !== schoolPlanId ||
        !Number.isFinite(subscriptionStart) ||
        subscriptionStart !== schoolSubscriptionStart ||
        !Number.isFinite(subscriptionEnd) ||
        subscriptionEnd !== schoolSubscriptionEnd) {
        return {
            erpMode: true,
            active: false,
            subscriptionRequired: true,
            school,
            ownerSchool,
            ownerId,
            subscription,
            plan: null
        };
    }
    const plan = await readDatabaseWithAccessToken(
        env,
        `owners/${ownerId}/pricingPlans/${subscription.planId}`,
        accessToken
    );
    const planProductType = String(plan?.productType || (plan?.erpPlan === true ? 'erp' : '')).trim().toLowerCase();
    if (!plan || plan.active === false || plan.type === 'topup' || planProductType !== 'erp') {
        return {
            erpMode: true,
            active: false,
            subscriptionRequired: true,
            school,
            ownerSchool,
            ownerId,
            subscription,
            plan: null
        };
    }
    return {
        erpMode: true,
        active: String(ownerSchool.status || '').toLowerCase() === 'active' &&
            String(school.status || '').toLowerCase() === 'active' &&
            subscriptionIsActive(subscription) &&
            subscriptionIsActive(schoolSubscription),
        school,
        ownerSchool,
        ownerId,
        subscription,
        plan
    };
}

async function issuePortalLicense(request, env, origin) {
    const payload = await readJsonWithinLimit(request, 4096);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return uploadResponse({ error: 'Invalid ERP license request.' }, 400, origin);
    }
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return uploadResponse({ error: 'Authentication is required.' }, 401, origin);

    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('ERP license-token verification failed:', error);
        return uploadResponse({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return uploadResponse({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    try {
        const accessToken = await getFirebaseAccessToken(env);
        const profile = await readDatabaseWithAccessToken(env, `users/${caller.uid}`, accessToken);
        const schoolId = String(profile?.schoolId || '').trim();
        if (!schoolId || String(profile?.role || '').toLowerCase() !== 'admin') {
            return uploadResponse({ error: 'Only a school administrator can manage the ERP license.' }, 403, origin);
        }
        const context = await readErpLicenseContext(env, schoolId, accessToken);
        if (context.ownerSchool) {
            const registeredAdminUid = String(context.ownerSchool.contacts?.admin?.uid || context.ownerSchool.admin?.uid || '');
            if (!registeredAdminUid || registeredAdminUid !== caller.uid) {
                return uploadResponse({ error: 'Only the registered school administrator can view the ERP access code.' }, 403, origin);
            }
        }
        if (!context.erpMode) {
            return uploadResponse({ erpMode: false, active: false }, 200, origin);
        }
        const devices = await readDatabaseWithAccessToken(
            env,
            `erpLicenseDevices/${schoolId}`,
            accessToken
        );
        const { school, ownerSchool, subscription, plan } = context;
        const expiresAt = Date.parse(subscription.endDate || '');
        if (!context.active || !Number.isFinite(expiresAt)) {
            return uploadResponse({
                erpMode: true,
                active: false,
                subscriptionRequired: context.subscriptionRequired === true,
                expired: Number.isFinite(expiresAt) && expiresAt <= Date.now(),
                schoolName: String(ownerSchool.name || school.name || ''),
                schoolCode: String(ownerSchool.code || school.code || ''),
                plan: String(subscription.plan || plan?.name || ''),
                planId: String(subscription.planId),
                startDate: String(subscription.startDate || ''),
                endDate: String(subscription.endDate || ''),
                devices: Object.values(devices || {})
                    .filter(device => device && typeof device === 'object')
                    .sort((a, b) => Number(b.lastVerifiedAt || 0) - Number(a.lastVerifiedAt || 0))
            }, 200, origin);
        }

        const previousLicense = await readLicenseRecord(env, schoolId, accessToken);
        const previousRecord = previousLicense.record;
        const previousExpiresAt = Number(previousRecord?.expiresAt);
        const previousLicenseIsCurrent = previousRecord?.active === true &&
            previousRecord.codeHash &&
            Number.isFinite(previousExpiresAt) &&
            previousExpiresAt > Date.now();
        if (
            previousRecord &&
            !previousLicenseIsCurrent &&
            (!Number.isFinite(previousExpiresAt) || expiresAt <= previousExpiresAt)
        ) {
            return uploadResponse({
                erpMode: true,
                active: false,
                renewalRequired: true,
                schoolName: String(ownerSchool.name || school.name || ''),
                schoolCode: String(ownerSchool.code || school.code || ''),
                plan: String(subscription.plan || plan?.name || ''),
                planId: String(subscription.planId),
                startDate: String(subscription.startDate || ''),
                endDate: String(subscription.endDate || ''),
                devices: Object.values(devices || {})
                    .filter(device => device && typeof device === 'object')
                    .sort((a, b) => Number(b.lastVerifiedAt || 0) - Number(a.lastVerifiedAt || 0))
            }, 200, origin);
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { record, etag } = await readLicenseRecord(env, schoolId, accessToken);
            const matchesSubscription = record &&
                record.codeHash &&
                record.active === true &&
                Number(record.expiresAt) > Date.now();
            if (matchesSubscription) {
                const licenseExpiresAt = Math.min(Number(record.expiresAt), expiresAt);
                const licenseEndDate = licenseExpiresAt < Number(record.expiresAt)
                    ? String(subscription.endDate || new Date(licenseExpiresAt).toISOString())
                    : String(record.endDate || new Date(licenseExpiresAt).toISOString());
                const code = await decryptLicenseCode(env, record);
                return uploadResponse({
                    erpMode: true,
                    active: true,
                    code,
                    schoolName: String(ownerSchool.name || school.name || ''),
                    schoolCode: String(ownerSchool.code || school.code || ''),
                    plan: String(subscription.plan || plan.name || ''),
                    planId: String(subscription.planId),
                    price: Number(subscription.price || plan.price || 0),
                    currency: String(subscription.currency || plan.currency || 'INR'),
                    startDate: String(record.startDate || ''),
                    endDate: licenseEndDate,
                    devices: Object.values(devices || {})
                        .filter(device => device && typeof device === 'object')
                        .sort((a, b) => Number(b.lastVerifiedAt || 0) - Number(a.lastVerifiedAt || 0))
                }, 200, origin);
            }

            const code = `RCERP-${encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
            const [codeHash, encrypted] = await Promise.all([hashLicenseCode(code), encryptLicenseCode(env, code)]);
            const recordToSave = {
                schoolId,
                planId: subscription.planId,
                startDate: String(subscription.startDate || ''),
                endDate: String(subscription.endDate || ''),
                expiresAt,
                codeHash,
                iv: encrypted.iv,
                encryptedCode: encrypted.ciphertext,
                createdAt: Date.now(),
                active: true
            };
            if (!await writeLicenseRecord(env, schoolId, recordToSave, etag, accessToken)) continue;
            const indexUpdates = {
                [`erpLicenseCodes/${codeHash}`]: {
                    schoolId,
                    planId: subscription.planId,
                    startDate: String(subscription.startDate || ''),
                    endDate: String(subscription.endDate || ''),
                    expiresAt,
                    active: true
                }
            };
            if (record?.codeHash) indexUpdates[`erpLicenseCodes/${record.codeHash}`] = null;
            await updateErpLicenseDatabase(env, indexUpdates, accessToken);
            return uploadResponse({
                erpMode: true,
                active: true,
                code,
                schoolName: String(ownerSchool.name || school.name || ''),
                schoolCode: String(ownerSchool.code || school.code || ''),
                plan: String(subscription.plan || plan.name || ''),
                planId: String(subscription.planId),
                price: Number(subscription.price || plan.price || 0),
                currency: String(subscription.currency || plan.currency || 'INR'),
                startDate: String(subscription.startDate || ''),
                endDate: String(subscription.endDate || '')
            }, 200, origin);
        }
        return uploadResponse({ error: 'The ERP access code is being updated. Refresh and try again.' }, 409, origin);
    } catch (error) {
        console.error('ERP portal license lookup failed:', error);
        return uploadResponse({ error: error.message || 'The ERP access code could not be loaded.' }, 503, origin);
    }
}

function sanitizeSchoolReportValue(value) {
    if (Array.isArray(value)) return value.map(sanitizeSchoolReportValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !/(?:password|passcode|secret|token|credential|private.?key|api.?key|hash|reset.?link)/i.test(key))
        .map(([key, item]) => [key, sanitizeSchoolReportValue(item)]));
}

function xmlEscape(value) {
    return String(value ?? '').replace(/[<>&"']/g, character => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
    }[character]));
}

function schoolReportChunkEnd(value, start, size) {
    let end = Math.min(start + size, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xD800 && value.charCodeAt(end - 1) <= 0xDBFF) {
        end -= 1;
    }
    return end;
}

function appendSchoolReportJsonRows(rows, label, value, appendRow, encoder) {
    const json = JSON.stringify(sanitizeSchoolReportValue(value), null, 2);
    if (encoder.encode(json).byteLength > 8 * 1024 * 1024) {
        throw new Error('A school data section exceeds the export size limit; no email was sent and no data was deleted.');
    }
    const chunkSize = 30000;
    let offset = 0;
    let part = 1;
    while (offset < json.length) {
        const end = schoolReportChunkEnd(json, offset, chunkSize);
        appendRow(rows, [label, String(part), json.slice(offset, end)]);
        offset = end;
        part += 1;
    }
}

function extractStudentAttendance(schoolData, profiles) {
    const studentStats = new Map();
    const attendanceLogs = [];
    const loggedKeys = new Set();

    const studentMap = new Map();
    (profiles || []).forEach(p => {
        if (p?.uid) studentMap.set(String(p.uid), p);
    });

    const getOrInitStats = uid => {
        if (!studentStats.has(uid)) {
            studentStats.set(uid, { total: 0, present: 0, absent: 0, late: 0, excused: 0 });
        }
        return studentStats.get(uid);
    };

    const recordAttendance = (studentUid, dateStr, classLabel, rawStatus, remarkStr) => {
        if (!studentUid || !dateStr) return;
        const normStatus = String(rawStatus || '').trim().toLowerCase();
        if (!normStatus || normStatus === 'unmarked' || normStatus === 'null') return;

        const uniqueKey = `${studentUid}_${dateStr}_${classLabel}`;
        if (loggedKeys.has(uniqueKey)) return;
        loggedKeys.add(uniqueKey);

        const stats = getOrInitStats(studentUid);
        stats.total += 1;
        if (normStatus === 'present') stats.present += 1;
        else if (normStatus === 'absent') stats.absent += 1;
        else if (normStatus === 'late') stats.late += 1;
        else stats.excused += 1;

        const student = studentMap.get(studentUid) || {};
        const studentName = student.name || student.displayName || student.fullName || studentUid;
        const rollNo = student.classRoll || student.rollNumber || student.rollNo || student.univRoll || '—';

        let displayStatus = 'Present';
        if (normStatus === 'absent') displayStatus = 'Absent';
        else if (normStatus === 'late') displayStatus = 'Late';
        else if (normStatus === 'excused' || normStatus === 'onduty') displayStatus = 'Excused';
        else displayStatus = normStatus.charAt(0).toUpperCase() + normStatus.slice(1);

        attendanceLogs.push({
            date: dateStr,
            studentUid,
            studentName,
            rollNo,
            classLabel: classLabel || student.className || 'Class',
            status: displayStatus,
            remark: remarkStr || '—'
        });
    };

    // 1. Process attendance/${schoolId}
    const schoolAttendanceItem = schoolData.find(item => item.path && item.path.startsWith('attendance/'));
    if (schoolAttendanceItem?.value && typeof schoolAttendanceItem.value === 'object') {
        Object.entries(schoolAttendanceItem.value).forEach(([classId, classSessions]) => {
            if (classSessions && typeof classSessions === 'object') {
                Object.entries(classSessions).forEach(([dateStr, sessionData]) => {
                    if (sessionData && typeof sessionData === 'object') {
                        const meta = sessionData._meta || {};
                        const classLabel = meta.className || meta.name || classId;
                        Object.entries(sessionData).forEach(([key, val]) => {
                            if (key === '_meta' || key.startsWith('_') || key.endsWith('_remark')) return;
                            let studentUid = key;
                            let status = '';
                            let remark = '';
                            if (key.endsWith('_record')) {
                                studentUid = key.slice(0, -7);
                                if (typeof val === 'object' && val !== null) {
                                    status = val.status;
                                    remark = val.remark;
                                }
                            } else if (typeof val === 'string') {
                                status = val;
                                remark = sessionData[key + '_remark'];
                            } else if (typeof val === 'object' && val !== null) {
                                status = val.status;
                                remark = val.remark || val.note;
                            }
                            recordAttendance(studentUid, dateStr, classLabel, status, remark);
                        });
                    }
                });
            }
        });
    }

    // 2. Process attendance_by_location/${locationId}
    const locationAttendanceItems = schoolData.filter(item => item.path && item.path.startsWith('attendance_by_location/'));
    locationAttendanceItems.forEach(item => {
        const locationId = item.path.split('/')[1] || 'Location';
        if (item.value && typeof item.value === 'object') {
            Object.entries(item.value).forEach(([dateStr, sessionData]) => {
                if (sessionData && typeof sessionData === 'object') {
                    const meta = sessionData._meta || {};
                    const classLabel = meta.className || meta.locationName || locationId;
                    Object.entries(sessionData).forEach(([key, val]) => {
                        if (key === '_meta' || key.startsWith('_') || key.endsWith('_remark')) return;
                        let studentUid = key;
                        let status = '';
                        let remark = '';
                        if (typeof val === 'string') {
                            status = val;
                            remark = sessionData[key + '_remark'];
                        } else if (typeof val === 'object' && val !== null) {
                            status = val.status;
                            remark = val.remark || val.note;
                        }
                        recordAttendance(studentUid, dateStr, classLabel, status, remark);
                    });
                }
            });
        }
    });

    // 3. Process user_attendance/${uid}
    const userAttendanceItems = schoolData.filter(item => item.path && item.path.startsWith('user_attendance/'));
    userAttendanceItems.forEach(item => {
        const studentUid = item.path.split('/')[1];
        if (item.value && typeof item.value === 'object') {
            Object.entries(item.value).forEach(([dateStr, dateBucket]) => {
                if (dateBucket && typeof dateBucket === 'object') {
                    Object.entries(dateBucket).forEach(([locId, record]) => {
                        let status = '';
                        let remark = '';
                        let locName = locId;
                        if (typeof record === 'string') {
                            status = record;
                        } else if (typeof record === 'object' && record !== null) {
                            status = record.status;
                            remark = record.remark || record.note;
                            locName = record.locationName || locId;
                        }
                        recordAttendance(studentUid, dateStr, locName, status, remark);
                    });
                }
            });
        }
    });

    // Sort logs: newest date first, then class, then roll number
    attendanceLogs.sort((a, b) => {
        const dateDiff = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateDiff !== 0) return dateDiff;
        const classDiff = String(a.classLabel || '').localeCompare(String(b.classLabel || ''));
        if (classDiff !== 0) return classDiff;
        return String(a.rollNo || '').localeCompare(String(b.rollNo || ''), undefined, { numeric: true });
    });

    return { studentStats, attendanceLogs };
}

function createSchoolSimplifiedCsv(school, profiles, authAccounts, schoolData) {
    const csvEscape = value => {
        if (value === null || value === undefined) return '""';
        const str = String(value).trim();
        return `"${str.replace(/"/g, '""')}"`;
    };

    const { studentStats, attendanceLogs } = extractStudentAttendance(schoolData, profiles);

    const lines = [];

    // 1. School Information Section
    lines.push('=== SCHOOL INFORMATION ===');
    lines.push(['Field', 'Details'].map(csvEscape).join(','));
    lines.push(['School Name', school.name || 'Unnamed School'].map(csvEscape).join(','));
    lines.push(['School Code', school.code || '—'].map(csvEscape).join(','));
    lines.push(['Institution Type', school.type || school.institutionType || '—'].map(csvEscape).join(','));
    lines.push(['Address', school.address?.complete || school.location || '—'].map(csvEscape).join(','));
    lines.push(['City', school.address?.city || '—'].map(csvEscape).join(','));
    lines.push(['State', school.address?.state || '—'].map(csvEscape).join(','));
    lines.push(['PIN / Zip Code', school.address?.zipCode || '—'].map(csvEscape).join(','));
    lines.push(['School Phone', school.contacts?.phone || school.contact || '—'].map(csvEscape).join(','));
    lines.push(['Principal Name', school.contacts?.principal?.name || '—'].map(csvEscape).join(','));
    lines.push(['Principal Email', school.contacts?.principal?.email || '—'].map(csvEscape).join(','));
    lines.push(['Administrator Email', school.contacts?.admin?.email || school.admin?.email || '—'].map(csvEscape).join(','));
    lines.push(['Export & Deletion Date', new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })].map(csvEscape).join(','));
    lines.push('');

    // 2. Summary Statistics
    const students = (profiles || []).filter(p => String(p.role || '').toLowerCase() === 'student');
    const teachers = (profiles || []).filter(p => {
        const r = String(p.role || '').toLowerCase();
        return r === 'teacher' || r === 'staff';
    });
    const admins = (profiles || []).filter(p => String(p.role || '').toLowerCase() === 'admin');

    let totalRecordedPresent = 0;
    let totalRecordedAbsent = 0;
    studentStats.forEach(s => {
        totalRecordedPresent += s.present;
        totalRecordedAbsent += s.absent;
    });
    const totalAttendanceMarks = totalRecordedPresent + totalRecordedAbsent;
    const overallRate = totalAttendanceMarks > 0 ? `${((totalRecordedPresent / totalAttendanceMarks) * 100).toFixed(1)}%` : '—';

    lines.push('=== SUMMARY STATISTICS ===');
    lines.push(['Metric', 'Count / Value'].map(csvEscape).join(','));
    lines.push(['Total Students', students.length].map(csvEscape).join(','));
    lines.push(['Total Teachers / Staff', teachers.length].map(csvEscape).join(','));
    lines.push(['Total Administrators', admins.length].map(csvEscape).join(','));
    lines.push(['Total Linked Accounts', (profiles || []).length].map(csvEscape).join(','));
    lines.push(['Total Attendance Records Logged', attendanceLogs.length].map(csvEscape).join(','));
    lines.push(['Overall Student Attendance Rate', overallRate].map(csvEscape).join(','));
    lines.push('');

    // 3. User Directory (Clean, simplified tabular list with individual student attendance metrics)
    lines.push('=== USERS DIRECTORY & ATTENDANCE SUMMARY ===');
    lines.push([
        'Role',
        'Full Name',
        'Email',
        'Phone Number',
        'Class / Grade',
        'Section',
        'Roll Number / ID',
        'Designation / Subject',
        'Total Sessions',
        'Present',
        'Absent',
        'Late',
        'Attendance %',
        'Account Status'
    ].map(csvEscape).join(','));

    const authMap = new Map();
    (authAccounts || []).forEach(acc => {
        if (acc?.localId) authMap.set(String(acc.localId), acc);
    });

    const roleOrder = { admin: 1, teacher: 2, staff: 2, student: 3 };
    const sortedProfiles = [...(profiles || [])].sort((a, b) => {
        const orderA = roleOrder[String(a.role || '').toLowerCase()] || 4;
        const orderB = roleOrder[String(b.role || '').toLowerCase()] || 4;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''));
    });

    sortedProfiles.forEach(profile => {
        const role = String(profile.role || 'Member').toLowerCase();
        const isStudent = role === 'student';
        const roleLabel = role === 'admin' ? 'Administrator' : (role === 'teacher' ? 'Teacher' : (isStudent ? 'Student' : 'Staff'));
        const name = profile.name || profile.displayName || profile.fullName || '—';
        const email = profile.email || '—';
        const phone = profile.phoneNumber || profile.phone || profile.contact || '—';
        const className = profile.className || profile.class || profile.assignedClass || '—';
        const section = profile.section || '—';
        const rollNo = profile.classRoll || profile.rollNumber || profile.rollNo || profile.univRoll || profile.employeeId || '—';

        let designationSubject = '—';
        if (profile.designation && profile.subjectsTaught) {
            designationSubject = `${profile.designation} (${Array.isArray(profile.subjectsTaught) ? profile.subjectsTaught.join(', ') : profile.subjectsTaught})`;
        } else if (profile.designation) {
            designationSubject = profile.designation;
        } else if (profile.subjectsTaught) {
            designationSubject = Array.isArray(profile.subjectsTaught) ? profile.subjectsTaught.join(', ') : String(profile.subjectsTaught);
        } else if (profile.subject) {
            designationSubject = profile.subject;
        }

        const authAcc = authMap.get(String(profile.uid || ''));
        const status = (authAcc?.disabled === true || String(profile.status || '').toLowerCase() === 'inactive') ? 'Inactive' : 'Active';

        const stats = studentStats.get(String(profile.uid || ''));
        const totalSessions = isStudent ? (stats ? stats.total : 0) : '—';
        const presentDays = isStudent ? (stats ? stats.present : 0) : '—';
        const absentDays = isStudent ? (stats ? stats.absent : 0) : '—';
        const lateDays = isStudent ? (stats ? stats.late : 0) : '—';
        const attendancePercent = isStudent
            ? (stats && stats.total > 0 ? `${((stats.present / stats.total) * 100).toFixed(1)}%` : '0.0%')
            : '—';

        lines.push([
            roleLabel,
            name,
            email,
            phone,
            className,
            section,
            rollNo,
            designationSubject,
            totalSessions,
            presentDays,
            absentDays,
            lateDays,
            attendancePercent,
            status
        ].map(csvEscape).join(','));
    });
    lines.push('');

    // 4. Detailed Day-by-Day Student Attendance Log
    lines.push('=== STUDENT ATTENDANCE LOG (DAY-BY-DAY RECORDS) ===');
    if (attendanceLogs.length === 0) {
        lines.push(['Notice', 'No attendance session records were found for this school.'].map(csvEscape).join(','));
    } else {
        lines.push([
            'Date',
            'Class / Section',
            'Roll Number',
            'Student Name',
            'Attendance Status',
            'Remarks / Notes'
        ].map(csvEscape).join(','));

        attendanceLogs.forEach(entry => {
            lines.push([
                entry.date,
                entry.classLabel,
                entry.rollNo,
                entry.studentName,
                entry.status,
                entry.remark
            ].map(csvEscape).join(','));
        });
    }

    return '\uFEFF' + lines.join('\r\n');
}

function encodeBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}

async function sendSchoolDeletionReport(env, email, schoolName, reportCsv) {
    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.BREVO_SENDER_NAME) {
        throw new Error('Report email configuration is incomplete; no email was sent.');
    }
    const bytes = new TextEncoder().encode(reportCsv);
    if (bytes.length > 8 * 1024 * 1024) {
        throw new Error('The school report exceeds the email attachment limit (8MB); no email was sent.');
    }
    const safeSchoolName = String(schoolName || 'school').replace(/[^A-Za-z0-9_-]+/g, '_');
    const subject = `School record summary: ${schoolName}`;
    const result = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
            to: [{ email }],
            subject,
            textContent: `Hello,\n\nPlease find attached the final data summary report for ${schoolName} in CSV format.\n\nThis file contains a simplified directory of school details, student records, teacher/staff accounts, and administrator information. You can open it directly in Microsoft Excel, Google Sheets, or Numbers.\n\nThank you,\nRollCall Support`,
            attachment: [{
                name: `${safeSchoolName}-summary-report.csv`,
                content: encodeBase64(bytes)
            }]
        })
    });
    if (!result.ok) {
        const responseText = (await result.text().catch(() => '')).slice(0, 400);
        console.error('Brevo school export email failed:', result.status, responseText);
        throw new Error(`The export email was rejected by the mail provider (${result.status}: ${responseText}).`);
    }
}

async function readSchoolUsers(env, schoolId, accessToken) {
    const url = databasePathUrl(env, 'users', accessToken);
    url.searchParams.set('orderBy', JSON.stringify('schoolId'));
    url.searchParams.set('equalTo', JSON.stringify(schoolId));
    const response = await fetch(url);
    if (!response.ok) throw new Error('School user accounts could not be loaded; no deletion was started.');
    return response.json();
}

async function deleteSchoolAfterEmail(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return uploadResponse({ error: 'Owner authentication is required.' }, 401, origin);

    let caller;
    let reportEmailAccepted = false;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('School deletion requester verification failed:', error);
        return uploadResponse({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return uploadResponse({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    const schoolId = String(payload?.schoolId || '').trim();
    const confirmationCode = String(payload?.confirmationCode || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(schoolId)) {
        return uploadResponse({ error: 'A valid school must be selected.' }, 400, origin);
    }

    try {
        const accessToken = await getFirebaseAccessToken(env);
        const [school, ownerSchool, priorJob] = await Promise.all([
            readDatabaseWithAccessToken(env, `schools/${schoolId}`, accessToken),
            readDatabaseWithAccessToken(env, `owners/${caller.uid}/schools/${schoolId}`, accessToken),
            readDatabaseWithAccessToken(env, `schoolDeletionJobs/${schoolId}`, accessToken)
        ]);
        if (!school || !ownerSchool || String(school.ownerId || '') !== caller.uid ||
            String(ownerSchool.ownerId || '') !== caller.uid) {
            return uploadResponse({ error: 'You can delete only a school registered to your owner account.' }, 403, origin);
        }
        if (priorJob?.emailAcceptedAt && priorJob.ownerId !== caller.uid) {
            return uploadResponse({ error: 'A school deletion is already in progress under a different owner account.' }, 409, origin);
        }
        if (confirmationCode !== String(school.code || '')) {
            return uploadResponse({ error: 'The confirmation code does not match this school. No data was deleted.' }, 400, origin);
        }

        const schoolUsers = await readDatabaseWithAccessToken(env, `schoolUsers/${schoolId}`, accessToken);
        const userProfiles = await readSchoolUsers(env, schoolId, accessToken);
        const profileMap = new Map();
        Object.entries(userProfiles || {}).forEach(([uid, profile]) => {
            if (profile && typeof profile === 'object') profileMap.set(uid, { ...profile, uid });
        });
        Object.entries(schoolUsers || {}).forEach(([uid, profile]) => {
            if (profile && typeof profile === 'object' && !profileMap.has(uid)) {
                profileMap.set(uid, { ...profile, uid });
            }
        });

        const schoolAdminRecord = await readDatabaseWithAccessToken(env, `schoolAdmins/${schoolId}`, accessToken);
        const primaryAdminUid = String(
            ownerSchool.contacts?.admin?.uid ||
            ownerSchool.admin?.uid ||
            school.contacts?.admin?.uid ||
            schoolAdminRecord?.authUid ||
            schoolAdminRecord?.uid ||
            ''
        ).trim();
        const schoolAdminAccounts = schoolAdminRecord?.administrators || {};
        const adminUids = new Set([
            primaryAdminUid,
            ...Object.entries(schoolAdminAccounts).flatMap(([uid, admin]) => [
                uid,
                String(admin?.uid || ''),
                String(admin?.authUid || '')
            ])
        ].filter(uid => /^[A-Za-z0-9_-]{1,128}$/.test(uid) && uid !== caller.uid));
        for (const uid of adminUids) {
            if (profileMap.has(uid)) continue;
            const admin = schoolAdminAccounts[uid] || {};
            profileMap.set(uid, {
                ...admin,
                ...(uid === primaryAdminUid ? ownerSchool.contacts?.admin || school.contacts?.admin || schoolAdminRecord || {} : {}),
                uid,
                role: 'admin',
                schoolId
            });
        }
        const profiles = [...profileMap.values()]
            .filter(profile => profile.uid !== caller.uid && String(profile.role || '').toLowerCase() !== 'owner');
        const uids = [...new Set(profiles.map(profile => String(profile.uid || '')).filter(uid => /^[A-Za-z0-9_-]{1,128}$/.test(uid)))];
        if (uids.length !== profiles.length) {
            return uploadResponse({ error: 'One or more school profiles have an invalid account ID. No report was sent and no data was deleted.' }, 409, origin);
        }
        if (uids.length > 10000) {
            return uploadResponse({ error: 'This school has too many linked accounts for a safe single-request deletion. No accounts were deleted.' }, 413, origin);
        }
        if (primaryAdminUid && !uids.includes(primaryAdminUid)) {
            return uploadResponse({ error: 'The registered administrator account could not be safely matched to a school profile. No data was deleted.' }, 409, origin);
        }
        const authAccounts = await lookupFirebaseAccounts(env.FIREBASE_PROJECT_ID, uids, accessToken);
        const recipient = String(
            ownerSchool.contacts?.admin?.email ||
            ownerSchool.admin?.email ||
            school.contacts?.admin?.email ||
            schoolAdminRecord?.email ||
            profiles.find(profile => profile.uid === primaryAdminUid)?.email ||
            ''
        ).trim();
        if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            return uploadResponse({ error: 'The school administrator email is missing or invalid. No report was sent and no data was deleted.' }, 409, origin);
        }

        const schoolRootNames = [
            'schoolClasses', 'schoolCourses', 'courses', 'classTeacherAssignments',
            'classTeacherAssignmentsByClass', 'subjectTeacherAssignments', 'schoolTimetables',
            'schoolTimetablesVersion', 'schoolTimetableSettings', 'schoolHomework',
            'schoolClassHomework', 'schoolLocations', 'schoolSettings',
            'teacher_leave_requests', 'attendance', 'publicCourseCatalog',
            'subscriptionResubscribeRequests', 'subscriptionExpiryOverlayCounts',
            'erpLicenseKeys', 'erpLicenseDevices'
        ];
        const schoolDataPaths = schoolRootNames.map(name => `${name}/${schoolId}`);
        const schoolDataValues = await Promise.all(schoolDataPaths.map(path =>
            readDatabaseWithAccessToken(env, path, accessToken)
        ));
        const schoolData = schoolDataPaths.map((path, index) => ({ path, value: schoolDataValues[index] })).filter(item => item.value != null);
        schoolData.push(
            { path: `owners/${caller.uid}/schools/${schoolId}`, value: ownerSchool },
            { path: `schoolAdmins/${schoolId}`, value: schoolAdminRecord }
        );
        const locationIds = Object.keys(schoolDataValues[schoolRootNames.indexOf('schoolLocations')] || {})
            .filter(id => /^[A-Za-z0-9_-]{1,128}$/.test(id));
        const attendanceByLocation = await Promise.all(locationIds.map(async id => ({
            path: `attendance_by_location/${id}`,
            value: await readDatabaseWithAccessToken(env, `attendance_by_location/${id}`, accessToken)
        })));
        schoolData.push(...attendanceByLocation.filter(item => item.value != null));

        const studentProfiles = profiles.filter(p => String(p.role || '').toLowerCase() === 'student');
        if (studentProfiles.length > 0) {
            const userAttendanceRecords = await Promise.all(
                studentProfiles.slice(0, 100).map(async p => ({
                    path: `user_attendance/${p.uid}`,
                    value: await readDatabaseWithAccessToken(env, `user_attendance/${p.uid}`, accessToken)
                }))
            );
            schoolData.push(...userAttendanceRecords.filter(item => item.value != null));
        }

        const schoolCode = String(school.code || '');
        const reservationPath = schoolCode ? `schoolCodeReservations/${safeDatabaseChildKey(schoolCode)}` : '';
        const codeReservation = reservationPath
            ? await readDatabaseWithAccessToken(env, reservationPath, accessToken)
            : null;
        const schoolDataPathsToRemove = new Set([
            `schools/${schoolId}`,
            `schoolAdmins/${schoolId}`,
            `schoolUsers/${schoolId}`,
            `publicSchools/${schoolId}`,
            `owners/${caller.uid}/schools/${schoolId}`,
            ...schoolDataPaths,
            ...locationIds.flatMap(id => [`locations/${id}`, `attendance_by_location/${id}`]),
            ...uids.flatMap(uid => [
                `users/${uid}`,
                `notifications/${uid}`,
                `user_attendance/${uid}`,
                `leave_requests/${uid}`,
                `device_unlock_requests/${uid}`,
                `classTeacherProfileRequests/${uid}`
            ])
        ]);
        if (codeReservation) {
            schoolData.push({ path: reservationPath, value: codeReservation });
            if (String(codeReservation.ownerId || '') === caller.uid) {
                schoolDataPathsToRemove.add(reservationPath);
            }
        }

        const erpCodeIndexUrl = databasePathUrl(env, 'erpLicenseCodes', accessToken);
        erpCodeIndexUrl.searchParams.set('orderBy', JSON.stringify('schoolId'));
        erpCodeIndexUrl.searchParams.set('equalTo', JSON.stringify(schoolId));
        const erpCodeIndexResponse = await fetch(erpCodeIndexUrl);
        if (!erpCodeIndexResponse.ok) {
            const responseDetails = (await erpCodeIndexResponse.text().catch(() => '')).slice(0, 500);
            console.error('Firebase ERP license-code index lookup failed:', erpCodeIndexResponse.status, responseDetails);
            throw new Error('ERP license data could not be checked; no report was sent and no deletion was started. Check the Worker service-account access and deploy the Firebase rules with the erpLicenseCodes schoolId index.');
        }
        const erpCodeIndex = await erpCodeIndexResponse.json();
        Object.keys(erpCodeIndex || {}).forEach(codeHash => {
            schoolDataPathsToRemove.add(`erpLicenseCodes/${codeHash}`);
            schoolData.push({ path: `erpLicenseCodes/${codeHash}`, value: erpCodeIndex[codeHash] });
        });

        const globalRequestRoots = ['profileRequests', 'profile_update_requests', 'locationRequests', 'announcements'];
        const globalRequestData = await Promise.all(globalRequestRoots.map(root =>
            readDatabaseWithAccessToken(env, root, accessToken)
        ));
        globalRequestRoots.forEach((root, index) => {
            const records = globalRequestData[index];
            Object.entries(records || {}).forEach(([key, record]) => {
                if (String(record?.schoolId || '') === schoolId) {
                    const path = `${root}/${safeDatabaseChildKey(key)}`;
                    schoolDataPathsToRemove.add(path);
                    schoolData.push({ path, value: record });
                }
            });
        });

        const reportCsv = createSchoolSimplifiedCsv(school, profiles, authAccounts, schoolData);
        const exportFileName = `${String(school.name || 'school').replace(/[^A-Za-z0-9_-]+/g, '_')}-summary-report.csv`;
        let emailDeliveryError = null;

        const jobPath = `schoolDeletionJobs/${schoolId}`;
        if (priorJob?.emailAcceptedAt) {
            reportEmailAccepted = true;
            await updateDatabaseWithAccessToken(env, {
                [jobPath]: { ...priorJob, state: 'deleting', retryAt: Date.now() }
            }, accessToken);
        } else {
            try {
                await sendSchoolDeletionReport(env, recipient, String(school.name || 'school'), reportCsv);
                reportEmailAccepted = true;
            } catch (emailErr) {
                console.error('Brevo school export email failed:', emailErr);
                emailDeliveryError = emailErr.message || 'Report email could not be delivered.';
            }

            await updateDatabaseWithAccessToken(env, {
                [jobPath]: {
                    ownerId: caller.uid,
                    schoolId,
                    state: 'deleting',
                    emailAcceptedAt: reportEmailAccepted ? Date.now() : null,
                    emailDeliveryError: emailDeliveryError || null,
                    reportRecipient: recipient,
                    reportAccountCount: profiles.length
                }
            }, accessToken);
        }

        const photoReferences = profiles.map(profile => {
            const storedKey = String(profile.profilePhotoKey || '');
            if (storedKey) return { uid: String(profile.uid || ''), key: storedKey };
            const photoUrl = String(profile.profilePhoto || '');
            if (photoUrl.startsWith('profile-photos/')) {
                return { uid: String(profile.uid || ''), key: photoUrl };
            }
            try {
                const url = new URL(photoUrl);
                const marker = '/file/';
                const markerIndex = url.pathname.indexOf(marker);
                if (markerIndex < 0) return null;
                return {
                    uid: String(profile.uid || ''),
                    key: decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
                };
            } catch (error) {
                return null;
            }
        }).filter(reference => reference?.key);
        const photoKeys = [...new Set(photoReferences
            .filter(reference => /^[A-Za-z0-9_-]{1,128}$/.test(reference.uid) &&
                new RegExp(`^profile-photos/${reference.uid}/[0-9a-f-]+\\.(?:webp|jpg|png)$`, 'i').test(reference.key))
            .map(reference => reference.key))];
        let photoCleanupFailures = photoReferences.length - photoKeys.length;
        let removedProfilePhotos = 0;
        if (photoKeys.length && env.PROFILE_PHOTOS) {
            for (let index = 0; index < photoKeys.length; index += 1000) {
                const batch = photoKeys.slice(index, index + 1000);
                try {
                    await env.PROFILE_PHOTOS.delete(batch);
                    removedProfilePhotos += batch.length;
                } catch (error) {
                    photoCleanupFailures += photoKeys.length - index;
                    console.error('School profile photo cleanup failed:', error);
                    break;
                }
            }
        } else if (photoKeys.length) {
            photoCleanupFailures = photoKeys.length;
        }

        await deleteFirebaseAccounts(
            env.FIREBASE_PROJECT_ID,
            authAccounts.map(account => String(account.localId || '')).filter(Boolean),
            accessToken
        );
        const updates = Object.fromEntries([...schoolDataPathsToRemove].map(path => [`${path}`, null]));
        updates[jobPath] = null;
        await updateDatabaseWithAccessToken(env, updates, accessToken);

        return uploadResponse({
            ok: true,
            emailAccepted: reportEmailAccepted,
            emailDeliveryError: emailDeliveryError || undefined,
            recipient,
            exportData: reportCsv,
            exportFileName,
            deletedAuthenticationAccounts: authAccounts.length,
            deletedProfiles: profiles.length,
            deletedSchoolDataRoots: schoolDataPathsToRemove.size,
            removedProfilePhotos,
            profilePhotoCleanupFailures: photoCleanupFailures,
            message: emailDeliveryError
                ? `School and linked accounts were permanently deleted. (Email warning: ${emailDeliveryError})`
                : (photoCleanupFailures
                    ? 'The report email was accepted and school data/accounts were deleted, but some R2 profile photos could not be removed.'
                    : 'The report email was accepted and the school, linked accounts, and school-scoped data were deleted.')
        }, 200, origin);
    } catch (error) {
        console.error('School export and deletion failed:', error);
        return uploadResponse({
            error: reportEmailAccepted
                ? `${error.message || 'Deletion did not complete.'} The export email was accepted; school deletion may be incomplete. Retry the school deletion action to continue.`
                : error.message || 'School export and deletion failed.'
        }, 503, origin);
    }
}

async function verifyErpLicense(request, env, origin) {
    const payload = await readJsonWithinLimit(request, 4096);
    const code = String(payload?.code || '').trim();
    const schoolCode = String(payload?.schoolCode || '').trim().toUpperCase();
    if (!/^RCERP-[A-Za-z0-9_-]{40,48}$/.test(code) || !/^[A-Z0-9_-]{2,32}$/.test(schoolCode)) {
        return uploadResponse({ valid: false, error: 'Invalid school code or ERP access code.' }, 400, origin);
    }

    try {
        const accessToken = await getFirebaseAccessToken(env);
        const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
        const query = new URLSearchParams({
            orderBy: JSON.stringify('code'),
            equalTo: JSON.stringify(schoolCode),
            access_token: accessToken
        });
        const schoolResponse = await fetch(`${baseUrl}/schools.json?${query}`);
        if (!schoolResponse.ok) throw new Error('School registration could not be verified.');
        const schools = await schoolResponse.json();
        const schoolEntry = Object.entries(schools || {}).find(([, item]) =>
            String(item?.code || '').trim().toUpperCase() === schoolCode
        );
        if (!schoolEntry) return uploadResponse({ valid: false, error: 'School code or ERP access code is invalid.' }, 200, origin);

        const [schoolId, school] = schoolEntry;
        const codeHash = await hashLicenseCode(code);
        const codeRecord = await readDatabaseWithAccessToken(env, `erpLicenseCodes/${codeHash}`, accessToken);
        if (
            codeRecord?.schoolId !== schoolId ||
            codeRecord.active !== true ||
            !Number.isFinite(Number(codeRecord.expiresAt)) ||
            Number(codeRecord.expiresAt) <= Date.now()
        ) {
            return uploadResponse({ valid: false, error: 'School code or ERP access code is invalid.' }, 200, origin);
        }

        const context = await readErpLicenseContext(env, schoolId, accessToken);
        if (!context.erpMode ||
            String(context.ownerSchool?.code || '').trim().toUpperCase() !== schoolCode ||
            !context.active) {
            return uploadResponse({ valid: false, error: 'This ERP license has expired or is inactive.' }, 200, origin);
        }
        const device = normalizeErpDevice(payload?.device);
        if (device) await recordErpDevice(env, schoolId, device, accessToken);
        const recordedExpiresAt = Number(codeRecord.expiresAt);
        const subscriptionExpiresAt = Date.parse(context.subscription.endDate || '');
        const licenseExpiresAt = Math.min(recordedExpiresAt, subscriptionExpiresAt);
        const licenseEndDate = licenseExpiresAt < recordedExpiresAt
            ? String(context.subscription.endDate || new Date(licenseExpiresAt).toISOString())
            : String(codeRecord.endDate || new Date(licenseExpiresAt).toISOString());
        return uploadResponse({
            valid: true,
            license: {
                licenseNo: `RCERP-${codeHash.slice(0, 12).toUpperCase()}`,
                schoolId,
                schoolCode: String(context.ownerSchool.code || ''),
                schoolName: String(context.ownerSchool.name || school.name || ''),
                planId: String(codeRecord.planId || context.subscription.planId),
                plan: String(context.subscription.plan || context.plan.name || ''),
                startDate: String(codeRecord.startDate || context.subscription.startDate || ''),
                endDate: licenseEndDate,
                expiresAt: licenseExpiresAt
            }
        }, 200, origin);
    } catch (error) {
        console.error('ERP license verification failed:', error);
        return uploadResponse({ error: 'ERP license verification is temporarily unavailable.' }, 503, origin);
    }
}

async function cleanupExpiredErpLicenses(env) {
    const accessToken = await getFirebaseAccessToken(env);
    const baseUrl = String(env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
    const now = Date.now();
    const query = new URLSearchParams({
        orderBy: JSON.stringify('expiresAt'),
        endAt: String(now),
        access_token: accessToken
    });
    const result = await fetch(`${baseUrl}/erpLicenseKeys.json?${query}`);
    if (!result.ok) throw new Error('Expired ERP licenses could not be loaded for cleanup.');
    const records = await result.json();
    const updates = {};
    Object.entries(records || {}).forEach(([schoolId, record]) => {
        if (record?.active === true && Number(record.expiresAt) <= now) {
            updates[`erpLicenseKeys/${schoolId}/active`] = false;
            updates[`erpLicenseKeys/${schoolId}/retiredAt`] = now;
            updates[`erpLicenseKeys/${schoolId}/iv`] = null;
            updates[`erpLicenseKeys/${schoolId}/encryptedCode`] = null;
            if (record.codeHash) updates[`erpLicenseCodes/${record.codeHash}`] = null;
        }
    });
    if (Object.keys(updates).length) await updateErpLicenseDatabase(env, updates, accessToken);
}

async function createProfileUpload(request, env, origin) {
    const authorization = request.headers.get('Authorization') || '';
    const tokenMatch = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return uploadResponse({ error: 'Authentication is required.' }, 401, origin);
    let caller;
    try {
        caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error('Firebase upload-token verification failed:', error);
        return uploadResponse({ error: 'Authentication could not be verified. Try again shortly.' }, 503, origin);
    }
    if (!caller) return uploadResponse({ error: 'Authentication token is invalid or expired.' }, 401, origin);

    const payload = await readJsonWithinLimit(request, 4096);
    if (!payload) return uploadResponse({ error: 'Invalid upload request.' }, 400, origin);
    const contentType = String(payload.contentType || '').toLowerCase();
    const extension = CONTENT_TYPES.get(contentType);
    const contentLength = Number(payload.contentLength);
    const targetUid = String(payload.userId || caller.uid).trim();
    if (!extension || !Number.isInteger(contentLength) || contentLength < 1 || contentLength > MAX_BYTES) {
        return uploadResponse({ error: 'Invalid image type or size.' }, 400, origin);
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
        return uploadResponse({ error: 'Invalid profile owner.' }, 400, origin);
    }
    if (targetUid !== caller.uid) {
        try {
            const [ownerProfile, callerProfile, targetProfile] = await Promise.all([
                readDatabaseProfile(env, `owners/${caller.uid}`, tokenMatch[1]),
                readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1]),
                readDatabaseProfile(env, `users/${targetUid}`, tokenMatch[1])
            ]);
            const ownerRoles = new Set(['owner', 'platform_owner', 'super_owner']);
            const profileRole = String(callerProfile?.role || '').trim().toLowerCase();
            const storedOwnerRole = String(ownerProfile?.role || ownerProfile?.accountType || ownerProfile?.platformRole || '').trim().toLowerCase();
            const knownNonOwner = profileRole && !ownerRoles.has(profileRole);
            const hasOwnerRecord = !!ownerProfile && typeof ownerProfile === 'object' && (!storedOwnerRole || ownerRoles.has(storedOwnerRole));
            const explicitOwnerRole = ownerRoles.has(profileRole) || ownerRoles.has(storedOwnerRole);
            if (knownNonOwner || (!hasOwnerRecord && !explicitOwnerRole) || !targetProfile) {
                return uploadResponse({ error: 'Only the platform owner can upload pictures for another account.' }, 403, origin);
            }
        } catch (error) {
            console.error('Owner profile-upload authorization failed:', error);
            return uploadResponse({ error: 'The target account could not be verified.' }, 503, origin);
        }
    }

    const key = `profile-photos/${encodeURIComponent(targetUid)}/${crypto.randomUUID()}.${extension}`;
    const expiresAt = String(Math.floor(Date.now() / 1000) + 300);
    try {
        const signature = await signUpload(env, key, contentType, expiresAt);
        const uploadUrl = new URL(request.url);
        uploadUrl.search = new URLSearchParams({
            action: 'upload',
            key,
            contentType,
            expires: expiresAt,
            signature
        }).toString();
        return uploadResponse({
            uploadUrl: uploadUrl.href,
            key,
            publicUrl: publicPhotoUrl(env.PUBLIC_BASE_URL, key)
        }, 200, origin);
    } catch (error) {
        console.error('Profile upload URL creation failed:', error);
        return uploadResponse({ error: 'Profile-photo storage is not configured correctly.' }, 503, origin);
    }
}

const REMOTE_CAPTURE_ROOT = 'remotePhotoCaptureSessions';
const REMOTE_CAPTURE_TTL_MS = 2 * 60 * 60 * 1000;
const REMOTE_CAPTURE_PAIR_TTL_MS = 5 * 60 * 1000;

async function hashRemoteCaptureSecret(secret) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return encodeBase64Url(new Uint8Array(digest));
}

function remoteCaptureTokenMatches(expected, provided) {
    if (typeof expected !== 'string' || typeof provided !== 'string' || expected.length !== provided.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
    return difference === 0;
}

async function authenticateRemoteCaptureOwner(request, env) {
    const tokenMatch = (request.headers.get('Authorization') || '').match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
    if (!tokenMatch) return null;
    const caller = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_PROJECT_ID);
    if (!caller) return null;
    const [ownerProfile, userProfile] = await Promise.all([
        readDatabaseProfile(env, `owners/${caller.uid}`, tokenMatch[1]),
        readDatabaseProfile(env, `users/${caller.uid}`, tokenMatch[1])
    ]);
    const ownerRoles = new Set(['owner', 'platform_owner', 'super_owner']);
    const profileRole = String(userProfile?.role || '').trim().toLowerCase();
    const storedOwnerRole = String(ownerProfile?.role || ownerProfile?.accountType || ownerProfile?.platformRole || '').trim().toLowerCase();
    const hasOwnerRecord = !!ownerProfile && typeof ownerProfile === 'object' && (!storedOwnerRole || ownerRoles.has(storedOwnerRole));
    const hasOwnerRole = ownerRoles.has(profileRole) || ownerRoles.has(storedOwnerRole);
    if ((profileRole && !ownerRoles.has(profileRole)) || (!hasOwnerRecord && !hasOwnerRole)) return null;
    return { uid: caller.uid, idToken: tokenMatch[1], accessToken: await getFirebaseAccessToken(env) };
}

async function readRemoteCaptureRecord(env, sessionId, accessToken) {
    const result = await fetch(databasePathUrl(env, `${REMOTE_CAPTURE_ROOT}/${sessionId}`, accessToken), {
        headers: { 'X-Firebase-ETag': 'true' }
    });
    if (!result.ok) throw new Error('Remote capture session could not be loaded.');
    return { record: await result.json(), etag: result.headers.get('ETag') || 'null_etag' };
}

async function writeRemoteCaptureRecord(env, sessionId, record, etag, accessToken) {
    const result = await fetch(databasePathUrl(env, `${REMOTE_CAPTURE_ROOT}/${sessionId}`, accessToken), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(record)
    });
    if (result.status === 412) return false;
    if (!result.ok) throw new Error('Remote capture session could not be updated.');
    return true;
}

async function ownerRemoteCapture(request, env, origin, action) {
    try {
        const owner = await authenticateRemoteCaptureOwner(request, env);
        if (!owner) return uploadResponse({ error: 'Authorized platform owner access is required.' }, 403, origin);
        const payload = await readJsonWithinLimit(request, 4096);
        if (action === 'create') {
            const sessionId = crypto.randomUUID();
            const qrToken = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
            const now = Date.now();
            const studentName = String(payload?.studentName || '').trim().slice(0, 120);
            const record = {
                ownerUid: owner.uid,
                status: 'waiting',
                currentStudentName: studentName,
                qrTokenHash: await hashRemoteCaptureSecret(qrToken),
                createdAt: now,
                pairExpiresAt: now + REMOTE_CAPTURE_PAIR_TTL_MS,
                expiresAt: now + REMOTE_CAPTURE_TTL_MS,
                captureSlot: 0,
                captureKey: null
            };
            const saved = await writeRemoteCaptureRecord(env, sessionId, record, 'null_etag', owner.accessToken);
            if (!saved) return uploadResponse({ error: 'Could not create a unique remote capture session.' }, 503, origin);
            return uploadResponse({ sessionId, qrToken, expiresAt: record.expiresAt, captureSlot: record.captureSlot }, 200, origin);
        }

        const sessionId = String(payload?.sessionId || '').trim();
        if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return uploadResponse({ error: 'Invalid remote capture session.' }, 400, origin);
        const { record, etag } = await readRemoteCaptureRecord(env, sessionId, owner.accessToken);
        if (!record && action === 'revoke') return uploadResponse({ status: 'revoked' }, 200, origin);
        if (!record || record.ownerUid !== owner.uid || (record.expiresAt <= Date.now() && action !== 'revoke')) {
            return uploadResponse({ error: 'Remote capture session expired or is unavailable.' }, 410, origin);
        }

        if (action === 'status') {
            return uploadResponse({
                status: record.status,
                deviceName: record.deviceName || '',
                currentStudentName: record.status === 'approved' ? String(record.currentStudentName || '').slice(0, 120) : '',
                pairingCode: record.pairingCode || '',
                pairExpired: record.status === 'waiting' && record.pairExpiresAt <= Date.now(),
                hasCapture: !!record.captureKey,
                captureSlot: Number.isSafeInteger(record.captureSlot) ? record.captureSlot : 0,
                expiresAt: record.expiresAt
            }, 200, origin);
        }

        if (action === 'approve' || action === 'reject') {
            if (record.status !== 'pairing' || !remoteCaptureTokenMatches(record.pairingCode, String(payload?.pairingCode || ''))) {
                return uploadResponse({ error: 'The pending device or pairing code is no longer valid.' }, 409, origin);
            }
            if (action === 'reject') {
                record.status = 'revoked';
                record.qrTokenHash = null;
                record.deviceTokenHash = null;
                record.pairingCode = null;
                const saved = await writeRemoteCaptureRecord(env, sessionId, record, etag, owner.accessToken);
                if (!saved) return uploadResponse({ error: 'Pairing changed. Refresh and try again.' }, 409, origin);
                return uploadResponse({ status: 'revoked' }, 200, origin);
            }
            record.status = 'approved';
            record.pairingCode = null;
            record.approvedAt = Date.now();
            if (!await writeRemoteCaptureRecord(env, sessionId, record, etag, owner.accessToken)) {
                return uploadResponse({ error: 'Pairing changed. Refresh and try again.' }, 409, origin);
            }
            return uploadResponse({ status: 'approved' }, 200, origin);
        }

        if (action === 'take') {
            if (record.status !== 'approved') return uploadResponse({ error: 'Remote camera is not approved.' }, 409, origin);
            if (!record.captureKey) return uploadResponse({ empty: true }, 200, origin);
            const captureKey = record.captureKey;
            const object = await env.PROFILE_PHOTOS.get(captureKey);
            if (!object) return uploadResponse({ error: 'Temporary capture is no longer available.' }, 404, origin);
            const bytes = await object.arrayBuffer();
            await env.PROFILE_PHOTOS.delete(captureKey);
            return new Response(bytes, {
                status: 200,
                headers: {
                    ...corsHeaders(origin),
                    'Cache-Control': 'no-store',
                    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
                    'X-Content-Type-Options': 'nosniff'
                }
            });
        }

        if (action === 'advance') {
            if (record.status !== 'approved') return uploadResponse({ error: 'Remote camera is not approved.' }, 409, origin);
            const captureKey = record.captureKey;
            record.currentStudentName = String(payload?.studentName || '').trim().slice(0, 120);
            record.captureSlot = (Number.isSafeInteger(record.captureSlot) ? record.captureSlot : 0) + 1;
            record.captureKey = null;
            record.captureContentType = null;
            record.captureUploadedAt = null;
            if (!await writeRemoteCaptureRecord(env, sessionId, record, etag, owner.accessToken)) {
                return uploadResponse({ error: 'Capture sequence changed. Try again.' }, 409, origin);
            }
            if (captureKey) await env.PROFILE_PHOTOS.delete(captureKey);
            return uploadResponse({ captureSlot: record.captureSlot }, 200, origin);
        }

        if (action === 'revoke') {
            const captureKey = record.captureKey;
            record.status = 'revoked';
            record.qrTokenHash = null;
            record.deviceTokenHash = null;
            record.pairingCode = null;
            record.captureKey = null;
            if (!await writeRemoteCaptureRecord(env, sessionId, record, etag, owner.accessToken)) {
                return uploadResponse({ error: 'Session changed while closing. Try again.' }, 409, origin);
            }
            if (captureKey) await env.PROFILE_PHOTOS.delete(captureKey);
            await fetch(databasePathUrl(env, `${REMOTE_CAPTURE_ROOT}/${sessionId}`, owner.accessToken), { method: 'DELETE' });
            return uploadResponse({ status: 'revoked' }, 200, origin);
        }
        return uploadResponse({ error: 'Unknown remote capture action.' }, 404, origin);
    } catch (error) {
        console.error('Owner remote photo capture request failed:', error);
        return uploadResponse({ error: error.message || 'Remote photo capture is temporarily unavailable.' }, 503, origin);
    }
}

async function pairRemoteCaptureDevice(request, env, origin) {
    try {
        const payload = await readJsonWithinLimit(request, 4096);
        const sessionId = String(payload?.sessionId || '').trim();
        const qrToken = String(payload?.qrToken || '');
        const deviceToken = String(payload?.deviceToken || '');
        const deviceName = String(payload?.deviceName || 'Camera device').trim().slice(0, 48);
        if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[A-Za-z0-9_-]{40,64}$/.test(qrToken) || !/^[A-Za-z0-9_-]{40,64}$/.test(deviceToken)) {
            return uploadResponse({ error: 'Invalid pairing request.' }, 400, origin);
        }
        const accessToken = await getFirebaseAccessToken(env);
        const { record, etag } = await readRemoteCaptureRecord(env, sessionId, accessToken);
        if (!record || record.status !== 'waiting' || record.expiresAt <= Date.now() || record.pairExpiresAt <= Date.now() ||
            !remoteCaptureTokenMatches(record.qrTokenHash, await hashRemoteCaptureSecret(qrToken))) {
            return uploadResponse({ error: 'This QR code has expired or has already been used.' }, 410, origin);
        }
        const pairingCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
        record.status = 'pairing';
        record.qrTokenHash = null;
        record.deviceTokenHash = await hashRemoteCaptureSecret(deviceToken);
        record.deviceName = deviceName || 'Camera device';
        record.pairingCode = pairingCode;
        record.pairingRequestedAt = Date.now();
        if (!await writeRemoteCaptureRecord(env, sessionId, record, etag, accessToken)) {
            return uploadResponse({ error: 'Another device already requested this QR code.' }, 409, origin);
        }
        return uploadResponse({ status: 'pairing', pairingCode }, 200, origin);
    } catch (error) {
        console.error('Remote photo capture pairing failed:', error);
        return uploadResponse({ error: error.message || 'Could not pair this camera device.' }, 503, origin);
    }
}

async function remoteCaptureDeviceStatus(request, env, origin) {
    const tokenMatch = (request.headers.get('Authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{40,64})$/);
    if (!tokenMatch) return uploadResponse({ error: 'Pairing access is invalid.' }, 401, origin);
    const payload = await readJsonWithinLimit(request, 2048);
    const sessionId = String(payload?.sessionId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return uploadResponse({ error: 'Invalid capture session.' }, 400, origin);
    try {
        const accessToken = await getFirebaseAccessToken(env);
        const { record } = await readRemoteCaptureRecord(env, sessionId, accessToken);
        if (!record || record.expiresAt <= Date.now() || record.status === 'revoked') return uploadResponse({ error: 'Capture access has ended.' }, 410, origin);
        if (!remoteCaptureTokenMatches(record.deviceTokenHash, await hashRemoteCaptureSecret(tokenMatch[1]))) {
            return uploadResponse({ error: 'This device is not paired.' }, 403, origin);
        }
        return uploadResponse({ status: record.status, currentStudentName: record.status === 'approved' ? String(record.currentStudentName || '').slice(0, 120) : '', hasCapture: !!record.captureKey, captureSlot: Number.isSafeInteger(record.captureSlot) ? record.captureSlot : 0, expiresAt: record.expiresAt }, 200, origin);
    } catch (error) {
        console.error('Remote capture device status failed:', error);
        return uploadResponse({ error: 'Could not check capture access.' }, 503, origin);
    }
}

async function receiveRemoteCapture(request, env, origin, url) {
    const tokenMatch = (request.headers.get('Authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{40,64})$/);
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    const slotText = String(url.searchParams.get('slot') || '');
    const captureSlot = /^\d+$/.test(slotText) ? Number(slotText) : -1;
    const contentType = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    const extension = CONTENT_TYPES.get(contentType);
    if (!tokenMatch || !/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isSafeInteger(captureSlot) || captureSlot < 0 || !extension) {
        return uploadResponse({ error: 'Invalid remote photo capture request.' }, 400, origin);
    }
    let temporaryKey = '';
    try {
        const accessToken = await getFirebaseAccessToken(env);
        const initial = await readRemoteCaptureRecord(env, sessionId, accessToken);
        if (!initial.record || initial.record.status !== 'approved' || initial.record.expiresAt <= Date.now() || initial.record.captureSlot !== captureSlot ||
            !remoteCaptureTokenMatches(initial.record.deviceTokenHash, await hashRemoteCaptureSecret(tokenMatch[1]))) {
            return uploadResponse({ error: 'This camera is not authorized for capture.' }, 403, origin);
        }
        if (initial.record.captureKey) return uploadResponse({ error: 'The owner must receive the current image first.' }, 409, origin);
        const bytes = await readBodyWithinLimit(request);
        if (!bytes || !validImage(bytes, contentType)) return uploadResponse({ error: 'Image is invalid or exceeds the 2 MB limit.' }, 413, origin);
        temporaryKey = `remote-photo-captures/${sessionId}/${crypto.randomUUID()}.${extension}`;
        await env.PROFILE_PHOTOS.put(temporaryKey, bytes, { httpMetadata: { contentType } });
        const current = await readRemoteCaptureRecord(env, sessionId, accessToken);
        if (!current.record || current.record.status !== 'approved' || current.record.expiresAt <= Date.now() || current.record.captureSlot !== captureSlot || current.record.captureKey ||
            !remoteCaptureTokenMatches(current.record.deviceTokenHash, await hashRemoteCaptureSecret(tokenMatch[1]))) {
            await env.PROFILE_PHOTOS.delete(temporaryKey);
            return uploadResponse({ error: 'Capture session changed. Ask the owner to reconnect.' }, 409, origin);
        }
        current.record.captureKey = temporaryKey;
        current.record.captureContentType = contentType;
        current.record.captureUploadedAt = Date.now();
        if (!await writeRemoteCaptureRecord(env, sessionId, current.record, current.etag, accessToken)) {
            await env.PROFILE_PHOTOS.delete(temporaryKey);
            return uploadResponse({ error: 'Another capture is waiting for the owner.' }, 409, origin);
        }
        return uploadResponse({ received: true }, 200, origin);
    } catch (error) {
        if (temporaryKey) await env.PROFILE_PHOTOS.delete(temporaryKey).catch(() => {});
        console.error('Remote profile photo receive failed:', error);
        return uploadResponse({ error: 'Photo could not be sent to the owner device.' }, 503, origin);
    }
}

async function cleanupExpiredRemoteCaptureSessions(env) {
    const accessToken = await getFirebaseAccessToken(env);
    const records = await readDatabaseWithAccessToken(env, REMOTE_CAPTURE_ROOT, accessToken);
    const updates = {};
    for (const [sessionId, record] of Object.entries(records || {})) {
        if (!record || Number(record.expiresAt) > Date.now()) continue;
        if (typeof record.captureKey === 'string' && record.captureKey.startsWith(`remote-photo-captures/${sessionId}/`)) {
            await env.PROFILE_PHOTOS.delete(record.captureKey).catch(() => {});
        }
        updates[`${REMOTE_CAPTURE_ROOT}/${sessionId}`] = null;
    }
    if (Object.keys(updates).length) await updateDatabaseWithAccessToken(env, updates, accessToken);
}

async function cleanupOrphanedRemoteCaptureObjects(env) {
    const cutoff = Date.now() - REMOTE_CAPTURE_TTL_MS - 60 * 60 * 1000;
    let cursor;
    do {
        const page = await env.PROFILE_PHOTOS.list({ prefix: 'remote-photo-captures/', cursor, limit: 1000 });
        const expiredKeys = page.objects
            .filter(object => object.uploaded && object.uploaded.getTime() < cutoff)
            .map(object => object.key);
        if (expiredKeys.length) await env.PROFILE_PHOTOS.delete(expiredKeys);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
}

async function uploadProfilePhoto(request, env, origin, url) {
    const key = url.searchParams.get('key') || '';
    const contentType = url.searchParams.get('contentType') || '';
    const expiresAt = url.searchParams.get('expires') || '';
    const signature = url.searchParams.get('signature') || '';
    const extension = CONTENT_TYPES.get(contentType);
    if (!key || !extension || !signature ||
        !new RegExp(`^profile-photos/[A-Za-z0-9_-]{1,128}/[0-9a-f-]+\\.${extension}$`, 'i').test(key)) {
        return uploadResponse({ error: 'Invalid upload URL.' }, 400, origin);
    }
    if (!await verifyUploadSignature(env, key, contentType, expiresAt, signature)) {
        return uploadResponse({ error: 'Upload URL is invalid or expired.' }, 403, origin);
    }
    const bytes = await readBodyWithinLimit(request);
    if (!bytes || !validImage(bytes, contentType)) {
        return uploadResponse({ error: 'Image is invalid or exceeds the 2 MB limit.' }, 413, origin);
    }
    try {
        await env.PROFILE_PHOTOS.put(key, bytes, {
            httpMetadata: {
                contentType,
                cacheControl: 'public, max-age=31536000, immutable'
            }
        });
    } catch (error) {
        console.error('Profile-photo R2 write failed:', error);
        return uploadResponse({ error: 'Photo storage is temporarily unavailable.' }, 503, origin);
    }
    return uploadResponse({ ok: true }, 200, origin);
}

async function getProfilePhoto(origin, env, url) {
    const rawKey = url.pathname.startsWith('/file/')
        ? url.pathname.slice('/file/'.length)
        : url.searchParams.get('key') || '';
    let key;
    try {
        key = decodeURIComponent(rawKey);
    } catch (error) {
        return new Response('Invalid key', { status: 400, headers: corsHeaders(origin) });
    }
    if (!key || key.split('/').some(part => part === '..' || part === '.')) {
        return new Response('Missing or invalid key', { status: 400, headers: corsHeaders(origin) });
    }
    if (key.startsWith('remote-photo-captures/')) {
        return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
    }
    const object = await env.PROFILE_PHOTOS.get(key);
    if (!object) return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
    const headers = new Headers(corsHeaders(origin));
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const origins = allowedOrigins(env);
        const allowedOrigin = origin && origins.has(origin) ? origin : '';
        const url = new URL(request.url);
        const routePath = url.pathname.replace(/\/+$/, '') || '/';
        if (routePath === '/firebase-config') {
            if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
            return firebaseConfigScript(request, env);
        }
        if (request.method === 'OPTIONS') {
            const opaqueErpClient = routePath === '/erp-license/verify' && origin === 'null';
            if (!allowedOrigin && !opaqueErpClient) return new Response(null, { status: 403 });
            return new Response(null, { status: 204, headers: corsHeaders(opaqueErpClient ? 'null' : allowedOrigin) });
        }

        if (routePath.startsWith('/owner/remote-photo-capture/')) {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            const action = routePath.slice('/owner/remote-photo-capture/'.length);
            if (!['create', 'status', 'approve', 'reject', 'take', 'advance', 'revoke'].includes(action)) {
                return uploadResponse({ error: 'Not found.' }, 404, allowedOrigin);
            }
            return ownerRemoteCapture(request, env, allowedOrigin, action);
        }
        if (routePath === '/remote-photo-capture/pair') {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return pairRemoteCaptureDevice(request, env, allowedOrigin);
        }
        if (routePath === '/remote-photo-capture/status') {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return remoteCaptureDeviceStatus(request, env, allowedOrigin);
        }
        if (routePath === '/remote-photo-capture/image') {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'PUT') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return receiveRemoteCapture(request, env, allowedOrigin, url);
        }

        if (routePath === '/owner/delete-school') {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return deleteSchoolAfterEmail(request, env, allowedOrigin);
        }
        if (routePath === '/erp-license/portal') {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return issuePortalLicense(request, env, allowedOrigin);
        }
        if (routePath === '/erp-license/verify') {
            if (origin && !allowedOrigin && origin !== 'null') return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return verifyErpLicense(request, env, origin === 'null' ? 'null' : allowedOrigin);
        }
        if (routePath.endsWith('/password-reset')) {
            if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
            if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return handlePasswordReset(request, env, allowedOrigin);
        }
        if (routePath.endsWith('/delete-teacher')) {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return deleteTeacher(request, env, allowedOrigin);
        }
        if (routePath.endsWith('/delete-student')) {
            if (!allowedOrigin) return uploadResponse({ error: 'Origin is not allowed.' }, 403, null);
            if (request.method !== 'POST') return uploadResponse({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return deleteStudent(request, env, allowedOrigin);
        }
        if (routePath.endsWith('/teacher-block-user')) {
            if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
            if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return manageTeacherBlockedStudent(request, env, allowedOrigin);
        }
        if (routePath.endsWith('/custom-mail')) {
            if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
            if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return sendCustomMail(request, env, allowedOrigin);
        }
        if (routePath.endsWith('/school-admin-credentials')) {
            if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
            if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return sendSchoolAdminCredentials(request, env, allowedOrigin);
        }
        if (request.method === 'GET' && (routePath.startsWith('/file/') || url.searchParams.has('key'))) {
            return getProfilePhoto(allowedOrigin, env, url);
        }
        if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
        if (request.method === 'POST' && routePath === '/' && url.searchParams.get('action') !== 'upload') {
            return createProfileUpload(request, env, allowedOrigin);
        }
        if (request.method === 'PUT' && url.searchParams.get('action') === 'upload') {
            return uploadProfilePhoto(request, env, allowedOrigin, url);
        }
        return response({ error: 'Not found.' }, 404, allowedOrigin);
    },
    async scheduled(_event, env, context) {
        context.waitUntil(Promise.all([
            cleanupExpiredErpLicenses(env).catch(error => console.error('Scheduled ERP license cleanup failed:', error)),
            cleanupExpiredRemoteCaptureSessions(env).catch(error => console.error('Scheduled remote capture cleanup failed:', error)),
            cleanupOrphanedRemoteCaptureObjects(env).catch(error => console.error('Scheduled remote capture object cleanup failed:', error))
        ]));
    }
};
