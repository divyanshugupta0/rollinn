/* Reports minimal per-session connection details for the owner diagnostics panel. */
(() => {
    'use strict';
    if (window.__rollCallSupportPresenceReady) return;
    window.__rollCallSupportPresenceReady = true;

    function start() {
        if (typeof firebase === 'undefined' || !firebase.apps?.length || !firebase.auth || !firebase.database) return;
        const auth = firebase.auth();
        let priorClientRef = null;
        let presenceTimer = null;
        let connectionRef = null;
        auth.onAuthStateChanged(user => {
            if (presenceTimer) clearInterval(presenceTimer);
            if (priorClientRef) priorClientRef.remove().catch(() => {});
            if (connectionRef) connectionRef.off();
            priorClientRef = null;
            presenceTimer = null;
            connectionRef = null;
            if (!user) return;

            const db = firebase.database();
            let sessionId = sessionStorage.getItem('rcSupportSessionId');
            if (!sessionId) {
                const randomId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
                sessionId = randomId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
                sessionStorage.setItem('rcSupportSessionId',sessionId);
            }
            const clientRef = db.ref(`ownerSupportClients/${user.uid}/${sessionId}`);
            priorClientRef = clientRef;
            const portal = String(window.ROLLCALL_PORTAL || location.pathname.split('/')[1] || 'unknown').slice(0,40);
            const publishPresence = () => clientRef.update({
                uid: user.uid,
                portal,
                page: location.pathname.slice(0,240),
                title: String(document.title || '').slice(0,120),
                online: navigator.onLine !== false,
                viewport: `${Math.max(0, innerWidth)}x${Math.max(0, innerHeight)}`,
                userAgent: String(navigator.userAgent || '').slice(0,220),
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            }).catch(() => {});

            connectionRef = db.ref('.info/connected');
            connectionRef.on('value', connection => {
                if (connection.val() !== true) return;
                clientRef.onDisconnect().remove().then(publishPresence).catch(() => {});
            });
            publishPresence();
            presenceTimer = setInterval(publishPresence,30000);
            window.addEventListener('pagehide', () => {
                if (presenceTimer) clearInterval(presenceTimer);
                clientRef.remove().catch(() => {});
            }, {once:true});
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
})();
