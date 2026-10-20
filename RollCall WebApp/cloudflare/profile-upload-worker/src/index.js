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
const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';
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

async function generatePasswordResetLink(env, email) {
    const accessToken = await getFirebaseAccessToken(env);
    if (!env.FIREBASE_API_KEY) throw new Error('Firebase Web API key is not configured.');
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
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
            htmlContent: `<p>We received a request to reset your RollCall password.</p><p><a href="${escapeHtml(resetLink)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
            textContent: `We received a request to reset your RollCall password.\n\nReset password: ${resetLink}\n\nIf you did not request this, you can ignore this email.`
        })
    });
    if (!response.ok) {
        console.error('Brevo password reset email delivery failed:', response.status);
        throw new Error('The password reset email could not be sent.');
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

async function handlePasswordReset(request, env, origin) {
    const payload = await readJsonWithinLimit(request, 4096);
    if (!payload) return response({ error: 'Invalid password reset request.' }, 400, origin);

    const email = String(payload.email || '').trim().toLowerCase();
    const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        (targetUid && !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid))) {
        return response({ error: 'Enter a valid email address.' }, 400, origin);
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
        if (resetLink) await sendBrevoPasswordReset(env, email, resetLink);
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
    if (!extension || !Number.isInteger(contentLength) || contentLength < 1 || contentLength > MAX_BYTES) {
        return uploadResponse({ error: 'Invalid image type or size.' }, 400, origin);
    }

    const key = `profile-photos/${encodeURIComponent(caller.uid)}/${crypto.randomUUID()}.${extension}`;
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
        if (url.pathname === '/firebase-config') {
            if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
            return firebaseConfigScript(request, env);
        }
        if (request.method === 'OPTIONS') {
            if (!allowedOrigin) return new Response(null, { status: 403 });
            return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
        }

        if (url.pathname.endsWith('/password-reset')) {
            if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
            if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);
            return handlePasswordReset(request, env, allowedOrigin);
        }
        if (request.method === 'GET' && (url.pathname.startsWith('/file/') || url.searchParams.has('key'))) {
            return getProfilePhoto(allowedOrigin, env, url);
        }
        if (!allowedOrigin) return response({ error: 'Origin is not allowed.' }, 403);
        if (request.method === 'POST' && url.searchParams.get('action') !== 'upload') {
            return createProfileUpload(request, env, allowedOrigin);
        }
        if (request.method === 'PUT' && url.searchParams.get('action') === 'upload') {
            return uploadProfilePhoto(request, env, allowedOrigin, url);
        }
        return response({ error: 'Not found.' }, 404, allowedOrigin);
    }
};
