(function () {
    const MAX_BYTES = 2 * 1024 * 1024;
    const allowedTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);

    async function upload(blob, user) {
        if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_BYTES) {
            throw new Error('Choose an image smaller than 2 MB.');
        }
        if (!allowedTypes.has(blob.type)) {
            throw new Error('The prepared profile image format is not supported.');
        }
        if (!user || typeof user.getIdToken !== 'function') {
            throw new Error('Your sign-in session has expired. Sign in again.');
        }

        const config = window.ROLLCALL_FIREBASE_CONFIG || {};
        const endpoint = String(config.profileUploadWorkerUrl || '').trim();
        const publicBaseUrl = String(config.profilePhotoPublicBaseUrl || '').trim();
        if (!endpoint || !publicBaseUrl) {
            throw new Error('The secure profile-photo upload service is not configured.');
        }

        let workerUrl;
        let publicBase;
        try {
            workerUrl = new URL(endpoint);
            publicBase = new URL(publicBaseUrl);
        } catch (error) {
            throw new Error('The secure profile-photo upload service has an invalid URL.');
        }
        if (workerUrl.protocol !== 'https:' || workerUrl.username || workerUrl.password ||
            workerUrl.search || workerUrl.hash || publicBase.protocol !== 'https:' ||
            publicBase.username || publicBase.password || publicBase.search || publicBase.hash) {
            throw new Error('The secure profile-photo upload service must use valid HTTPS URLs.');
        }

        const token = await user.getIdToken();
        const contentType = blob.type;
        const fileName = `profile.${contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : 'jpg'}`;
        const signedResponse = await fetch(workerUrl.href, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: user.uid,
                contentType,
                contentLength: blob.size,
                fileName
            }),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer'
        });
        let result;
        try {
            result = await signedResponse.json();
        } catch (error) {
            throw new Error('The secure profile-photo upload service returned an invalid response.');
        }
        if (!signedResponse.ok) throw new Error(result?.error || 'The secure profile-photo upload failed.');
        if (!result || typeof result.uploadUrl !== 'string' ||
            typeof result.publicUrl !== 'string' || typeof result.key !== 'string') {
            throw new Error('The secure upload service returned an invalid response.');
        }

        let uploadUrl;
        let photoUrl;
        try {
            uploadUrl = new URL(result.uploadUrl);
            photoUrl = new URL(result.publicUrl);
        } catch (error) {
            throw new Error('The secure upload service returned an invalid URL.');
        }
        if (uploadUrl.protocol !== 'https:' || uploadUrl.origin !== workerUrl.origin ||
            uploadUrl.pathname !== workerUrl.pathname ||
            photoUrl.protocol !== 'https:' || photoUrl.username || photoUrl.password ||
            photoUrl.search || photoUrl.hash || photoUrl.origin !== publicBase.origin ||
            !photoUrl.pathname.startsWith(`${publicBase.pathname.replace(/\/$/, '')}/`)) {
            throw new Error('The upload or photo URL is outside the configured worker/storage domain.');
        }

        const uploadResponse = await fetch(uploadUrl.href, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: blob,
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer'
        });
        if (!uploadResponse.ok) throw new Error('The secure profile-photo upload failed.');
        return { publicUrl: photoUrl.href, key: result.key };
    }

    window.RollCallProfileUpload = Object.freeze({ upload });
})();
