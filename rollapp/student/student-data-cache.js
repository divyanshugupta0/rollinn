// IndexedDB cache for relatively stable student portal reference data.
(function () {
    'use strict';

    const DB_NAME = 'RollCall_Student_Reference_Data';
    const DB_VERSION = 1;
    const STORE_NAME = 'reference_data';
    const memory = new Map();
    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        if (!window.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable.'));
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                dbPromise = null;
                reject(request.error || new Error('Could not open the student reference cache.'));
            };
            request.onblocked = () => console.warn('[Student data cache] Database upgrade is blocked by another tab.');
        });
        return dbPromise;
    }

    async function get(key) {
        const memoryEntry = memory.get(key);
        if (memoryEntry) return memoryEntry;
        try {
            const db = await openDb();
            return await new Promise(resolve => {
                const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
                request.onsuccess = () => {
                    const entry = request.result || null;
                    if (entry) memory.set(key, entry);
                    resolve(entry);
                };
                request.onerror = () => resolve(null);
            });
        } catch (error) {
            console.warn('[Student data cache] Read failed; using network:', error);
            return null;
        }
    }

    async function set(key, value) {
        const entry = { key, value, updatedAt: Date.now() };
        memory.set(key, entry);
        try {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(entry);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error || new Error('Could not save cached reference data.'));
                tx.onabort = () => reject(tx.error || new Error('Cached reference data write was cancelled.'));
            });
        } catch (error) {
            console.warn('[Student data cache] Write failed; keeping an in-memory copy:', error);
        }
        return entry;
    }

    async function getOrLoad(key, loader, options = {}) {
        const ttlMs = Math.max(0, Number(options.ttlMs) || 0);
        const cached = await get(key);
        if (!options.force && cached && Date.now() - cached.updatedAt < ttlMs) return cached.value;
        try {
            const value = await loader();
            await set(key, value);
            return value;
        } catch (error) {
            if (cached) {
                console.warn(`[Student data cache] Refresh failed for ${key}; using saved data.`, error);
                return cached.value;
            }
            throw error;
        }
    }

    async function remove(key) {
        memory.delete(key);
        try {
            const db = await openDb();
            await new Promise(resolve => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(key);
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
        } catch (_) { /* Cache removal is best-effort. */ }
    }

    window.RollCallStudentDataCache = { openDb, get, set, getOrLoad, remove };
})();
