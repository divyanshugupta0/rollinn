(function () {
    'use strict';

    function normalizeMobile(value) {
        return String(value ?? '').replace(/\D/g, '');
    }

    function isMobileIdentifier(value) {
        return /^\d{10}$/.test(normalizeMobile(value));
    }

    async function resolveEmail(identifier, loadUsers, allowedRoles) {
        const value = String(identifier ?? '').trim();
        if (!isMobileIdentifier(value)) return value.toLowerCase();

        const mobile = normalizeMobile(value);
        const roles = new Set((allowedRoles || []).map(role => String(role).toLowerCase()));
        const users = await loadUsers();
        const entries = Array.isArray(users) ? users : Object.values(users || {});
        const match = entries.find(user => {
            const role = String(user?.role || '').toLowerCase();
            const userMobile = normalizeMobile(user?.mobile || user?.phone || user?.phoneNumber);
            return (!roles.size || roles.has(role)) && userMobile === mobile;
        });

        const email = String(match?.email || '').trim().toLowerCase();
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
        return `mobile.${mobile}@rollcall.local`;
    }

    window.RollCallPortalLogin = { normalizeMobile, isMobileIdentifier, resolveEmail };
})();
