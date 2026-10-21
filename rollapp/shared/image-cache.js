/* IndexedDB cache for profile and account photos shared across RollCall portals. */
(function () {
    'use strict';

    const DB_NAME = 'rollcall_profile_images_v1';
    const STORE_NAME = 'images';
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
    const objectUrls = new Map();
    let dbPromise;
    let writesSinceCleanup = 0;

    function openDb() {
        if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                        store.createIndex('savedAt', 'savedAt');
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Unable to open image cache'));
            });
        }
        return dbPromise;
    }

    function read(key) {
        return openDb().then(db => new Promise(resolve => {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
            request.onsuccess = () => {
                const entry = request.result;
                if (!entry || Date.now() - entry.savedAt > MAX_AGE_MS) return resolve(null);
                resolve(entry);
            };
            request.onerror = () => resolve(null);
        }));
    }

    function write(entry) {
        return openDb().then(db => new Promise(resolve => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(entry);
            tx.oncomplete = () => {
                writesSinceCleanup += 1;
                if (writesSinceCleanup >= 25) {
                    writesSinceCleanup = 0;
                    prune(db);
                }
                resolve(true);
            };
            tx.onerror = tx.onabort = () => resolve(false);
        }));
    }

    function prune(db) {
        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const entries = request.result || [];
                entries.sort((a, b) => a.savedAt - b.savedAt);
                let totalBytes = entries.reduce((sum, entry) => sum + (entry.blob?.size || 0), 0);
                const cutoff = Date.now() - MAX_AGE_MS;
                while (entries.length > 500 || totalBytes > 80 * 1024 * 1024 || (entries[0] && entries[0].savedAt < cutoff)) {
                    const oldest = entries.shift();
                    if (!oldest) break;
                    totalBytes -= oldest.blob?.size || 0;
                    store.delete(oldest.key);
                }
            };
        } catch (_) {
            // The browser may refuse cleanup while the page is shutting down.
        }
    }

    function cacheUrl(key, url) {
        if (!key || !url || /^(data:|blob:)/i.test(url)) return Promise.resolve(false);
        return fetch(url, { mode: 'cors', credentials: 'omit' }).then(response => {
            if (!response.ok || response.type === 'opaque') return false;
            const type = response.headers.get('content-type') || '';
            if (!type.startsWith('image/')) return false;
            return response.blob().then(blob => {
                if (!blob.size || blob.size > MAX_IMAGE_BYTES) return false;
                return write({ key, url, blob, type, savedAt: Date.now() });
            });
        }).catch(() => false);
    }

    function cachedObjectUrl(key, entry) {
        if (objectUrls.has(key)) return objectUrls.get(key);
        const url = URL.createObjectURL(entry.blob);
        objectUrls.set(key, url);
        return url;
    }

    function apply(img, url, cacheKey) {
        if (!img || !url) return;
        const key = String(cacheKey || url);
        img.dataset.rcImageCacheKey = key;
        img.dataset.rcImageCacheUrl = url;
        read(key).then(entry => {
            if (!img.isConnected || img.dataset.rcImageCacheUrl !== url) return;
            if (entry && entry.url === url) {
                img.dataset.rcImageCacheHit = 'true';
                img.src = cachedObjectUrl(key, entry);
                return;
            }
            img.dataset.rcImageCacheHit = 'false';
            img.src = url;
        }).catch(() => {
            if (img.isConnected && img.dataset.rcImageCacheUrl === url) img.src = url;
        });
    }
    function isProfileImage(img) {
        const identity = [img.id, img.className, img.alt, img.getAttribute('data-role') || ''].join(' ').toLowerCase();
        if (/(profile|avatar|student|teacher|user|account|person)/.test(identity)) return true;
        return !!img.closest('.user-avatar, .student-avatar, .teacher-avatar, .profile-avatar, .profile-photo, .user-profile, [data-profile-image]');
    }

    function process(img) {
        if (!(img instanceof HTMLImageElement) || !isProfileImage(img)) return;
        const url = img.getAttribute('src') || img.currentSrc || '';
        if (!url || /^(data:|blob:)/i.test(url)) return;
        const current = img.dataset.rcImageCacheUrl;
        if (current === url) return;
        apply(img, url, img.dataset.imageCacheKey || url);
    }

    function scan(root) {
        if (root instanceof HTMLImageElement) process(root);
        root.querySelectorAll?.('img').forEach(process);
    }

    window.RollCallImageCache = Object.freeze({ apply, cacheUrl });

    const start = () => {
        scan(document);
        new MutationObserver(records => records.forEach(record => {
            if (record.type === 'attributes') process(record.target);
            record.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) scan(node);
            });
        })).observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['src', 'srcset']
        });
        document.addEventListener('load', event => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement) || img.dataset.rcImageCacheHit === 'true' || !img.dataset.rcImageCacheKey || !img.dataset.rcImageCacheUrl) return;
            const sourceUrl = img.dataset.rcImageCacheUrl;
            if (img.dataset.rcImageCacheStoredUrl === sourceUrl) return;
            cacheUrl(img.dataset.rcImageCacheKey, sourceUrl).then(stored => {
                if (stored && img.dataset.rcImageCacheUrl === sourceUrl) img.dataset.rcImageCacheStoredUrl = sourceUrl;
            });
        }, true);
        document.addEventListener('error', event => process(event.target), true);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();