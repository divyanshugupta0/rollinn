(function () {
    const GENERIC_MESSAGE = 'If an account exists for that email, password reset instructions will be sent.';

    async function send(email, options = {}) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            throw new Error('Enter a valid email address.');
        }

        const config = window.ROLLCALL_FIREBASE_CONFIG || {};
        const workerUrl = String(config.profileUploadWorkerUrl || '').trim();
        if (!workerUrl) throw new Error('The secure password reset service is not configured.');

        let endpoint;
        try {
            endpoint = new URL(workerUrl);
        } catch (error) {
            throw new Error('The secure password reset service has an invalid URL.');
        }
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
            throw new Error('The secure password reset service must use a valid HTTPS URL.');
        }
        endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/password-reset`;

        const user = options.user || window.firebase?.auth?.()?.currentUser || window.auth?.currentUser || null;
        const headers = { 'Content-Type': 'application/json' };
        if (user && typeof user.getIdToken === 'function') {
            headers.Authorization = `Bearer ${await user.getIdToken()}`;
        }

        const response = await fetch(endpoint.href, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: normalizedEmail,
                targetUid: options.targetUid ? String(options.targetUid) : undefined
            }),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer'
        });
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error('The password reset service returned an invalid response.');
        }
        if (!response.ok) {
            throw new Error(result?.error || 'Could not send password reset instructions.');
        }
        return result?.message || GENERIC_MESSAGE;
    }

    window.RollCallPasswordReset = Object.freeze({ send });
})();
