(function (window) {
    async function check(profile, blockedValue, expectedRole, readProfile) {
        const userRole = String(profile?.role || '').trim().toLowerCase();
        const schoolId = String(profile?.schoolId || '').trim();
        if (userRole !== expectedRole || !schoolId) return { blocked: false, reason: '' };

        const record = blockedValue && typeof blockedValue.val === 'function'
            ? blockedValue.val()
            : blockedValue;
        let applies = false;
        let reason = '';

        const isBlockRecord = record && typeof record === 'object' &&
            (record.blocked === true || Object.prototype.hasOwnProperty.call(record, 'blockedDate') ||
                Object.prototype.hasOwnProperty.call(record, 'blockedBy'));
        if (isBlockRecord &&
            String(record.role || '').trim().toLowerCase() === expectedRole) {
            let blockSchoolId = String(record.schoolId || '').trim();
            if (!blockSchoolId && record.blockedBy && typeof readProfile === 'function') {
                const blocker = await readProfile(String(record.blockedBy));
                if (String(blocker?.role || '').trim().toLowerCase() === 'admin') {
                    blockSchoolId = String(blocker.schoolId || '').trim();
                }
            }
            applies = blockSchoolId === schoolId;
            if (applies) reason = String(record.reason || '').trim();
        }

        const profileBlockSchool = String(profile.blockedSchoolId || '').trim();
        const profileBlockRole = String(profile.blockedRole || '').trim().toLowerCase();
        if (profile.blocked === true && profileBlockSchool === schoolId &&
            (!profileBlockRole || profileBlockRole === expectedRole)) {
            applies = true;
            reason = reason || String(profile.blockedReason || '').trim();
        }

        return { blocked: applies, reason };
    }

    window.RollCallAccountBlockStatus = Object.freeze({ check });
})(window);
