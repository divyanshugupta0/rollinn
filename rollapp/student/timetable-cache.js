// Timetable Cache Utility for RollCall Student Portal
// Handles versioned IndexedDB caching of school timetables synchronized with Admin Panel & Teacher Portal
(function() {
    'use strict';

    const IDB_NAME = 'RollCall_Timetables_DB';
    const IDB_VERSION = 1;
    const IDB_STORE = 'school_timetables';

    let dbPromise = null;
    const activeListeners = new Map(); // schoolId -> { ref, listener }

    function openIndexedDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('IndexedDB is not supported in this browser.'));
            }
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'schoolId' });
                }
            };
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = event => {
                dbPromise = null;
                reject(event.target.error || new Error('Failed to open IndexedDB.'));
            };
        });
        return dbPromise;
    }

    async function getCachedTimetables(schoolId) {
        if (!schoolId) return null;
        try {
            const db = await openIndexedDB();
            return new Promise(resolve => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(schoolId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (err) {
            console.warn('[Timetable Cache] IndexedDB get error:', err);
            return null;
        }
    }

    async function setCachedTimetables(schoolId, version, timetables) {
        if (!schoolId) return false;
        try {
            const db = await openIndexedDB();
            return new Promise(resolve => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                store.put({
                    schoolId,
                    version: Number(version || 1),
                    timetables: timetables || {},
                    updatedAt: Date.now()
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (err) {
            console.warn('[Timetable Cache] IndexedDB set error:', err);
            return false;
        }
    }

    async function syncTimetables(schoolId, forceRefresh = false) {
        if (!schoolId) return { timetables: {}, version: 1, fromCache: false };
        try {
            const db = firebase.database();
            const versionSnap = await db.ref(`schoolTimetablesVersion/${schoolId}`).once('value');
            const vData = versionSnap.val();
            const remoteVersion = (typeof vData === 'object' && vData !== null)
                ? Number(vData.version || 1)
                : Number(vData || 1);

            let cached = null;
            if (!forceRefresh) {
                cached = await getCachedTimetables(schoolId);
            }

            if (cached && cached.version === remoteVersion && cached.timetables) {
                return {
                    timetables: cached.timetables,
                    version: cached.version,
                    fromCache: true
                };
            }

            // Version mismatch, cache missing, or forceRefresh requested
            const snap = await db.ref(`schoolTimetables/${schoolId}`).once('value');
            const timetables = snap.val() || {};
            await setCachedTimetables(schoolId, remoteVersion, timetables);

            return {
                timetables,
                version: remoteVersion,
                fromCache: false
            };
        } catch (err) {
            console.warn('[Timetable Cache] Sync error, attempting fallback:', err);
            const cached = await getCachedTimetables(schoolId);
            if (cached && cached.timetables) {
                return {
                    timetables: cached.timetables,
                    version: cached.version || 1,
                    fromCache: true
                };
            }
            return { timetables: {}, version: 1, fromCache: false };
        }
    }

    function subscribeVersion(schoolId, onUpdate) {
        if (!schoolId || typeof onUpdate !== 'function') return () => {};
        unsubscribeVersion(schoolId);

        const ref = firebase.database().ref(`schoolTimetablesVersion/${schoolId}`);
        let lastVersion = null;

        const listener = ref.on('value', async snapshot => {
            if (!snapshot.exists()) return;
            const val = snapshot.val();
            const remoteVersion = (typeof val === 'object' && val !== null) ? Number(val.version || 1) : Number(val || 1);
            if (lastVersion === null) {
                lastVersion = remoteVersion;
                return;
            }
            if (remoteVersion !== lastVersion) {
                lastVersion = remoteVersion;
                const result = await syncTimetables(schoolId, true);
                onUpdate(result.timetables, result.version);
            }
        });

        activeListeners.set(schoolId, { ref, listener });

        return () => unsubscribeVersion(schoolId);
    }

    function unsubscribeVersion(schoolId) {
        if (!schoolId) {
            activeListeners.forEach(({ ref, listener }) => ref.off('value', listener));
            activeListeners.clear();
            return;
        }
        if (activeListeners.has(schoolId)) {
            const { ref, listener } = activeListeners.get(schoolId);
            ref.off('value', listener);
            activeListeners.delete(schoolId);
        }
    }

    window.RollCallTimetableCache = {
        openIndexedDB,
        getCachedTimetables,
        setCachedTimetables,
        syncTimetables,
        subscribeVersion,
        unsubscribeVersion
    };
})();
