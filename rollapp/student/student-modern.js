/* ==========================================================================
   RollCall Student Portal - Realtime Firebase Controller
   No Sample Data • All Data Loaded Directly from Firebase RTDB
   ========================================================================== */

(function () {
    'use strict';

    // State
    const state = {
        activeTab: 'tab-overview',
        currentUser: null,
        schoolType: '',
        mobileAttendanceEnabled: false,
        locations: {},
        attendanceRecords: [],
        subjectStats: {},
        overallStats: { attended: 0, total: 0, percentage: 0 },
        leaveRequests: [],
        studentTests: [],
        studentTestsFilter: 'all',
        studentTestsSubject: 'all',
        studentTestsSearch: '',
        loadedTabs: new Set()
    };

    function loadStableStudentReference(path, ttlMs, force = false) {
        const reference = firebase.database().ref(path);
        const loadFromFirebase = () => reference.once('value').then(snapshot => snapshot.val() || {});
        return window.RollCallStudentDataCache
            ? window.RollCallStudentDataCache.getOrLoad(`rtdb:${path}`, loadFromFirebase, { ttlMs, force })
            : loadFromFirebase();
    }

    // Initialize once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        initLiveClock();
        initNavigationTabs();
        initMobileSidebar();
        initNotificationsDrawer();
        initTodayScheduleControls();
        initAnnouncementsControls();
        initBunkCalculator();
        initLeavePortal();
        initDigitalIdCard();
        initProfileAndSecurity();
        initInlineForgotPassword();
        interceptLegacyButtons();
        observeUserSession();
        loadFirebaseAnnouncements();
        initAttendanceRecordsModule();
        initStudentTimetableModule();
        loadClassTeacherInfo();
        initStudentTestsControls();
    });

    /* ==========================================================================
       Live Clock & Date Ticker
       ========================================================================== */
    function initLiveClock() {
        const timeEl = document.getElementById('live-clock-ticker');
        const dateEl = document.getElementById('live-date-ticker');

        function updateTime() {
            const now = new Date();
            if (timeEl) {
                timeEl.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            }
            if (dateEl) {
                dateEl.innerText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            }
        }
        updateTime();
        setInterval(updateTime, 1000);
    }

    /* ==========================================================================
       Navigation Tabs (Segmented Pill Design & Mobile Sidebar)
       ========================================================================== */
    function initNavigationTabs() {
        const tabBtns = document.querySelectorAll('.nav-tab-btn');
        const tabIds = new Set([...document.querySelectorAll('.student-tab-panel')].map(panel => panel.id));

        const tabFromUrl = () => {
            const requestedTab = window.location.hash.replace(/^#/, '');
            return tabIds.has(requestedTab) ? requestedTab : 'tab-overview';
        };

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab) {
                    switchTab(targetTab);
                }
            });
        });

        // Jump buttons
        document.querySelectorAll('[data-jump-tab]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const jump = el.getAttribute('data-jump-tab');
                if (jump) switchTab(jump);
            });
        });

        window.addEventListener('popstate', () => switchTab(tabFromUrl(), { fromHistory: true }));
        window.addEventListener('hashchange', () => switchTab(tabFromUrl(), { fromHistory: true }));
        if (window.location.hash) switchTab(tabFromUrl(), { fromHistory: true });
    }

    /* ==========================================================================
       Mobile Navigation Sidebar Drawer
       ========================================================================== */
    function initMobileSidebar() {
        const toggleBtn = document.getElementById('mobile-sidebar-toggle');
        const closeBtn = document.getElementById('mobile-sidebar-close');
        const drawer = document.getElementById('mobile-sidebar-drawer');
        const backdrop = document.getElementById('mobile-sidebar-backdrop');
        const navBtns = document.querySelectorAll('.mobile-sidebar-tab');
        const logoutBtn = document.getElementById('mobile-sidebar-logout');

        function openSidebar() {
            if (drawer) drawer.classList.add('open');
            if (backdrop) backdrop.classList.add('open');
            document.body.classList.add('mobile-sidebar-active');
        }

        function closeSidebar() {
            if (drawer) drawer.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
            document.body.classList.remove('mobile-sidebar-active');
        }

        if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
        if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
        if (backdrop) backdrop.addEventListener('click', closeSidebar);

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab) {
                    switchTab(targetTab);
                    closeSidebar();
                }
            });
        });

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                closeSidebar();
                const mainLogout = document.getElementById('logout-btn');
                if (mainLogout) mainLogout.click();
            });
        }
    }

    function switchTab(tabId, options = {}) {
        if (tabId === 'tab-attendance' && !state.mobileAttendanceEnabled) {
            showModernToast('Mobile attendance is not available for school accounts.', 'info');
            tabId = 'tab-overview';
        }
        if (tabId === 'tab-analytics' && state.schoolType === 'school') {
            tabId = 'tab-overview';
        }
        if (!options.fromHistory && state.activeTab !== tabId) {
            const nextUrl = `${window.location.pathname}${window.location.search}#${tabId}`;
            window.history.pushState({ studentTab: tabId }, '', nextUrl);
        }
        state.activeTab = tabId;

        // Update desktop nav buttons
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        // Update mobile sidebar buttons
        document.querySelectorAll('.mobile-sidebar-tab').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        // Update panels
        document.querySelectorAll('.student-tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === tabId);
        });

        // Load each panel only on first visit; its rendered content remains cached while hidden.
        const shouldLoadPanel = !state.loadedTabs.has(tabId) || options.forceReload === true;
        if (!shouldLoadPanel) return;
        state.loadedTabs.add(tabId);
        if (tabId === 'tab-overview' || tabId === 'tab-home') {
            loadFirebaseAnnouncements();
        } else if (tabId === 'tab-history') {
            loadAttendanceHistory();
        } else if (tabId === 'tab-timetable') {
            renderStudentTimetable();
        } else if (tabId === 'tab-analytics') {
            renderSubjectAnalytics();
        } else if (tabId === 'tab-homework') {
            const curUser = state.currentUser || window.currentUser;
            if (curUser && (!state.studentHomework || state.studentHomework.length === 0)) initStudentHomeworkSync(curUser);
            renderStudentHomework();
        } else if (tabId === 'tab-tests') {
            const curUser = state.currentUser || window.currentUser;
            if (curUser && (!state.studentTests || state.studentTests.length === 0)) initStudentTestsSync(curUser);
            renderStudentTests();
        } else if (tabId === 'tab-profile') {
            renderProfileDetails();
            if (typeof window.loadProfileData === 'function') window.loadProfileData();
        }
    }
    window.switchStudentTab = switchTab;

    /* ==========================================================================
       Slide-out Notifications Drawer (Popup-Free)
       ========================================================================== */
    function initNotificationsDrawer() {
        const drawer = document.getElementById('notifications-drawer');
        const backdrop = document.getElementById('drawer-backdrop');
        const bellBtn = document.getElementById('notifications-btn');
        const closeBtn = document.getElementById('drawer-close-btn');

        function openDrawer() {
            if (drawer) drawer.classList.add('open');
            if (backdrop) backdrop.classList.add('open');
            loadFirebaseNotifications();
        }

        function closeDrawer() {
            if (drawer) drawer.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
        }

        if (bellBtn) {
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDrawer();
            });
        }

        if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
        if (backdrop) backdrop.addEventListener('click', closeDrawer);
    }

    /* ==========================================================================
       Observe Firebase Auth & RTDB Session
       ========================================================================== */
    function observeUserSession() {
        // Poll for window.currentUser or firebase.auth()
        const checkInterval = setInterval(() => {
            const user = window.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
            if (user) {
                state.currentUser = user;
                clearInterval(checkInterval);
                initFirebaseDataSync(user);
            }
        }, 600);
    }

    function initFirebaseDataSync(user) {
        if (!window.firebase?.database) return;
        const db = firebase.database();
        const uid = user.uid;

        // 1. Sync User Profile from RTDB
        db.ref(`users/${uid}`).on('value', (snap) => {
            const userData = snap.val();
            if (userData) {
                state.currentUser = { ...state.currentUser, ...userData };
                loadSchoolMode(state.currentUser);
                updateHeaderProfile(state.currentUser);
                renderDigitalId();
                renderProfileDetails();
                loadClassTeacherInfo();
                initStudentHomeworkSync(state.currentUser);
                initStudentTestsSync(state.currentUser);
                if (userData.schoolId || userData.instituteId) {
                    initStudentTimetableVersionSync(userData.schoolId || userData.instituteId);
                }
            }
        });
        initStudentHomeworkSync(user);
        initStudentTestsSync(user);
        if (user.schoolId || user.instituteId) {
            initStudentTimetableVersionSync(user.schoolId || user.instituteId);
        }

        // 2. Sync Real Class Locations & Today's Schedule from RTDB
        db.ref('locations').on('value', (snap) => {
            state.locations = snap.val() || {};
            renderTodayScheduleFromDB();
            loadStudentAttendanceRecords();
        });

        // 3. Sync Attendance Records from RTDB
        db.ref('attendance_by_location').on('value', (snap) => {
            state.attendanceByLocation = snap.val() || {};
            renderTodayScheduleFromDB();
            loadStudentAttendanceRecords();
        });

        // 3b. Sync Today's User Attendance
        const currentTodayKey = getTodayDateString();
        db.ref(`user_attendance/${uid}/${currentTodayKey}`).on('value', (snap) => {
            state.userAttendanceToday = snap.val() || {};
            renderTodayScheduleFromDB();
        });

        // 4. Sync Leave Requests from RTDB
        db.ref(`leave_requests/${uid}`).on('value', (snap) => {
            const data = snap.val() || {};
            state.leaveRequests = Object.keys(data).map(k => ({ id: k, ...data[k] }));
            renderLeaveRequests();
        });

        // 5. Sync Announcements (Campus wide) from RTDB in real time
        db.ref('announcements').on('value', () => loadFirebaseAnnouncements());

        // 6. Sync Notifications from RTDB in real time
        db.ref('notifications').on('value', () => loadFirebaseNotifications());
        if (uid) {
            db.ref(`notifications/${uid}`).on('value', () => loadFirebaseNotifications());
        }

        // Shared Admin & Teacher Timetable Version Sync
        function initStudentTimetableVersionSync(targetSchoolId) {
            const sid = String(targetSchoolId || '').trim();
            if (!sid || !window.RollCallTimetableCache) return;
            window.RollCallTimetableCache.subscribeVersion(sid, (updatedTimetables, version) => {
                console.log(`[Timetable Cache] Shared admin version ${version} received for school:`, sid);
                state.schoolTimetables = updatedTimetables || {};
                state.timetableVersion = version;
                if (typeof timetableState !== 'undefined') {
                    timetableState.schedules = updatedTimetables || {};
                }
                renderTodayScheduleFromDB();
                if (typeof renderTimetableGrid === 'function' && document.getElementById('tt-grid-container')) {
                    renderTimetableGrid();
                }
            });
        }

        let schoolModeLoadPromise = null;
        function loadSchoolMode(profile) {
            const schoolId = String(profile?.schoolId || '').trim();
            if (!schoolId || schoolModeLoadPromise) return schoolModeLoadPromise;
            schoolModeLoadPromise = loadStableStudentReference(`schools/${schoolId}/type`, 12 * 60 * 60 * 1000)
                .then(value => {
                    state.schoolType = String(value || '').trim().toLowerCase();
                    state.mobileAttendanceEnabled = state.schoolType !== 'school';
                    const isSchoolMode = state.schoolType === 'school';
                    document.body.classList.toggle('student-school-mode', isSchoolMode);
                    document.documentElement.dataset.institutionType = state.schoolType || 'college';
                    if (isSchoolMode && state.activeTab === 'tab-attendance') {
                        switchTab('tab-overview');
                    }
                    if (isSchoolMode && state.activeTab === 'tab-analytics') {
                        switchTab('tab-overview');
                    }
                    applyProfileInstitutionMode(isSchoolMode);
                    renderTodayScheduleFromDB();
                    renderDigitalId();
                    renderProfileDetails();
                })
                .catch(error => {
                    console.error('Could not determine the institution mode:', error);
                    state.mobileAttendanceEnabled = false;
                });
            return schoolModeLoadPromise;
        }
        window.rollCallStudentMode = {
            isMobileAttendanceEnabled: () => state.mobileAttendanceEnabled,
            isSchoolMode: () => state.schoolType === 'school'
        };
    }

    /* ==========================================================================
       Header & Profile Updates
       ========================================================================== */
    function updateHeaderProfile(user) {
        const nameEl = document.getElementById('user-name');
        const heroNameEl = document.getElementById('hero-user-name');
        const avatarEl = document.getElementById('user-profile-img');
        const mobileNameEl = document.getElementById('mobile-sidebar-user-name');
        const mobileAvatarEl = document.getElementById('mobile-sidebar-avatar');

        if (nameEl && user.name) nameEl.innerText = user.name;
        if (heroNameEl && user.name) heroNameEl.innerText = user.name;
        if (mobileNameEl && user.name) mobileNameEl.innerText = user.name;
        if (avatarEl && user.profilePhoto) avatarEl.src = user.profilePhoto;
        if (mobileAvatarEl && user.profilePhoto) mobileAvatarEl.src = user.profilePhoto;
    }

    function applyProfileInstitutionMode(isSchoolMode) {
        const setHidden = (id, hidden) => {
            const element = document.getElementById(id);
            if (element) element.hidden = hidden;
        };

        setHidden('prof-hero-univ-tag', isSchoolMode);
        setHidden('prof-row-univ-roll', isSchoolMode);
        setHidden('prof-row-dept', isSchoolMode);
        setHidden('prof-row-batch', isSchoolMode);
        setHidden('prof-row-eligibility', isSchoolMode);
        setHidden('prof-hardware-security-card', isSchoolMode);
        setHidden('prof-biometric-security-card', isSchoolMode);
        setHidden('prof-edit-univ-roll-group', isSchoolMode);
        setHidden('prof-edit-year-group', isSchoolMode);
        setHidden('prof-edit-dept-group', isSchoolMode);
        setHidden('prof-edit-batch-group', isSchoolMode);

        const courseLabel = document.getElementById('prof-course-label');
        const editCourseLabel = document.getElementById('prof-edit-course-label');
        const academicCardTitle = document.querySelector('#prof-row-univ-roll')
            ?.closest('.profile-detail-card')
            ?.querySelector('.panel-header .panel-title');
        if (courseLabel) courseLabel.innerHTML = `<i class="fas fa-book-open"></i> ${isSchoolMode ? 'Class' : 'Course / Program'}`;
        if (editCourseLabel) editCourseLabel.innerHTML = `<i class="fas fa-book"></i> ${isSchoolMode ? 'Class' : 'Course / Program'}`;
        if (academicCardTitle) academicCardTitle.innerHTML = `<i class="fas fa-graduation-cap"></i> ${isSchoolMode ? 'School Details' : 'Academic Credentials'}`;
    }

    /* ==========================================================================
       Load Real Attendance & Compute Stats from RTDB (Zero Dummy Data)
       ========================================================================== */
    function normalizeAttendanceStatus(value, fallback = 'present') {
        const raw = typeof value === 'object' && value !== null ? (value.status ?? value.attendanceStatus) : value;
        if (typeof raw === 'boolean') return raw ? 'present' : 'absent';
        const status = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (['absent', 'notpresent', 'notmarked', 'missed', 'unmarked', 'notattended'].includes(status)) return 'absent';
        if (['late', 'delayed'].includes(status)) return 'late';
        if (['present', 'attended', 'marked', 'ontime', 'verified'].includes(status)) return 'present';
        return fallback;
    }

    function isPresentAttendance(value) {
        if (value === null || value === undefined || value === false) return false;
        if (typeof value === 'object' && value !== null && !('status' in value) && !('attendanceStatus' in value)) return true;
        return ['present', 'late'].includes(normalizeAttendanceStatus(value, 'absent'));
    }

    function loadStudentAttendanceRecords() {
        if (!state.currentUser || !window.firebase?.database) return;
        const db = firebase.database();
        const uid = state.currentUser.uid;
        const studentSection = (state.currentUser.section || '').trim().toLowerCase();

        Promise.all([
            db.ref('attendance_by_location').once('value'),
            db.ref('locations').once('value')
        ]).then(([attSnap, locSnap]) => {
            const globalAtt = attSnap.val() || {};
            const locations = locSnap.val() || {};

            let totalConducted = 0;
            let presentCount = 0;
            const subjectMap = {};
            const attendedDates = [];

            // Process all locations matching student section
            Object.keys(globalAtt).forEach(locId => {
                const locDates = globalAtt[locId];
                const locMeta = locations[locId] || { name: 'Class Session' };
                const locSection = String(locMeta.section || '').trim().toLowerCase();

                // Relevance check: same section or general
                const isRelevant = !locSection || locSection === 'general' || locSection.includes(studentSection);

                if (isRelevant) {
                    const subjectTitle = locMeta.name || 'Subject Class';
                    if (!subjectMap[subjectTitle]) {
                        subjectMap[subjectTitle] = { attended: 0, total: 0, code: locMeta.subjectCode || '' };
                    }

                    Object.keys(locDates).forEach(dateStr => {
                        const sessionAttendees = locDates[dateStr];
                        totalConducted++;
                        subjectMap[subjectTitle].total++;

                        if (sessionAttendees && isPresentAttendance(sessionAttendees[uid])) {
                            presentCount++;
                            subjectMap[subjectTitle].attended++;
                            attendedDates.push(new Date(dateStr).getTime());
                        }
                    });
                }
            });

            // Calculate overall percentage
            const percentage = totalConducted > 0 ? Math.round((presentCount / totalConducted) * 100) : 0;
            state.overallStats = { attended: presentCount, total: totalConducted, percentage };
            state.subjectStats = subjectMap;

            // Compute consecutive streak
            attendedDates.sort((a, b) => b - a);
            let streak = 0;
            if (attendedDates.length > 0) {
                streak = calculateStreak(attendedDates);
            }

            // Update KPI cards in Overview Tab
            updateOverviewKPIs(presentCount, totalConducted, percentage, streak);
            if (state.schoolType !== 'school') {
                renderSubjectAnalytics();
                updateBunkPredictorOptions();
                renderProfileEligibility();
            }
        }).catch(err => {
            console.error('Attendance sync error:', err);
        });
    }

    function calculateStreak(dates) {
        if (!dates || dates.length === 0) return 0;
        let count = 1;
        const oneDayMs = 24 * 60 * 60 * 1000;
        for (let i = 0; i < dates.length - 1; i++) {
            const diff = Math.round((dates[i] - dates[i + 1]) / oneDayMs);
            if (diff === 1) {
                count++;
            } else if (diff > 1) {
                break;
            }
        }
        return count;
    }

    function updateOverviewKPIs(attended, total, percentage, streak) {
        const kpiAttended = document.getElementById('kpi-attended-classes');
        const kpiTotal = document.getElementById('kpi-total-classes');
        const gaugeText = document.getElementById('overview-gauge-text');
        const gaugeCircle = document.getElementById('overview-gauge-circle');
        const streakEl = document.getElementById('overview-streak-count');

        if (kpiAttended) kpiAttended.innerText = `${percentage}%`;
        if (kpiTotal) kpiTotal.innerText = `${attended} / ${total}`;
        if (gaugeText) gaugeText.innerText = `${percentage}%`;
        if (streakEl) streakEl.innerText = `${streak} Days`;

        if (gaugeCircle) {
            const circumference = 2 * Math.PI * 28;
            const offset = circumference - (percentage / 100) * circumference;
            gaugeCircle.style.strokeDashoffset = offset;
        }
    }

    /* ==========================================================================
       Today's Schedule Rendered from RTDB (Only Held or Added Today)
       ========================================================================== */
    function getTodayDateString(d = new Date()) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function isSameDateAsToday(dateVal) {
        if (!dateVal) return false;
        const d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
        if (isNaN(d.getTime())) return false;
        const today = new Date();
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth() === today.getMonth() &&
               d.getDate() === today.getDate();
    }

    function parseTimeToday(timeVal) {
        if (!timeVal) return null;
        if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
            return new Date(timeVal);
        }
        if (typeof timeVal === 'string') {
            const trimmed = timeVal.trim();
            if (/^\d+$/.test(trimmed)) {
                return new Date(Number(trimmed));
            }
            if (trimmed.includes('-') || trimmed.includes('/')) {
                const parsed = new Date(trimmed);
                if (!isNaN(parsed.getTime())) return parsed;
            }
            const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
            if (match) {
                let hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const meridian = match[3] ? match[3].toUpperCase() : null;
                if (meridian === 'PM' && hours < 12) hours += 12;
                if (meridian === 'AM' && hours === 12) hours = 0;
                if (!meridian && hours >= 1 && hours <= 6) hours += 12;
                const d = new Date();
                d.setHours(hours, minutes, 0, 0);
                return d;
            }
        }
        return null;
    }

    function isClassForToday(cls, todayStr) {
        if (!cls) return false;

        // 1. HELD TODAY: Attendance records exist for today in global records
        const attByLoc = state.attendanceByLocation || {};
        const locAttToday = attByLoc[cls.id]?.[todayStr];
        if (locAttToday && Object.keys(locAttToday).length > 0) {
            return true;
        }

        // Current student marked attendance today for this class
        const uid = state.currentUser?.uid;
        if (uid && state.userAttendanceToday?.[cls.id]) {
            return true;
        }
        if (uid && locAttToday?.[uid]) {
            return true;
        }

        // Explicitly held today according to date fields
        if (cls.lastHeld && isSameDateAsToday(cls.lastHeld)) return true;
        if (cls.heldAt && isSameDateAsToday(cls.heldAt)) return true;

        // 2. ADDED TODAY: Class was added or scheduled for today
        if (cls.createdAt && isSameDateAsToday(cls.createdAt)) return true;
        if (cls.created_at && isSameDateAsToday(cls.created_at)) return true;
        if (cls.addedAt && isSameDateAsToday(cls.addedAt)) return true;
        if (cls.timestamp && isSameDateAsToday(cls.timestamp)) return true;
        if (cls.activatedAt && isSameDateAsToday(cls.activatedAt)) return true;
        if (cls.startedAt && isSameDateAsToday(cls.startedAt)) return true;
        if (cls.updatedAt && isSameDateAsToday(cls.updatedAt) && (cls.status === 'active' || cls.isActive === true)) return true;

        // Explicit schedule dates matching today
        if (cls.date === todayStr || isSameDateAsToday(cls.date)) return true;
        if (cls.scheduledDate === todayStr || isSameDateAsToday(cls.scheduledDate)) return true;
        if (cls.startDate === todayStr || isSameDateAsToday(cls.startDate)) return true;
        if (cls.scheduledStart && isSameDateAsToday(cls.scheduledStart)) return true;
        if (cls.expiresAt && isSameDateAsToday(cls.expiresAt)) return true;

        // Strictly false if not held today and not added today.
        return false;
    }

    function isClassActiveNow(cls) {
        if (!cls) return false;
        // Explicitly inactive
        if (cls.status === 'inactive' || cls.isActive === false) return false;

        const now = Date.now();

        // Check if expired
        if (cls.expiresAt) {
            const expTime = new Date(cls.expiresAt).getTime();
            if (expTime && now > expTime) return false;
        }

        // Check start and end time if specified
        let startTime = parseTimeToday(cls.scheduledStart || cls.startTime);
        let endTime = parseTimeToday(cls.scheduledEnd || cls.endTime);

        if (startTime && endTime && endTime.getTime() <= startTime.getTime()) {
            endTime = new Date(endTime.getTime() + 12 * 60 * 60 * 1000);
        }

        if (startTime && now < startTime.getTime()) {
            return false; // Upcoming, not started yet
        }

        if (endTime && now > endTime.getTime()) {
            return false; // Ended
        }

        // Active status or within valid time window
        if (cls.status === 'active' || cls.isActive === true) {
            return true;
        }

        if (startTime && endTime && now >= startTime.getTime() && now <= endTime.getTime()) {
            return true;
        }

        return false;
    }

    function isClassUpcoming(cls) {
        if (!cls) return false;
        if (cls.status === 'inactive' || cls.isActive === false) return false;
        const now = Date.now();
        const startTime = parseTimeToday(cls.scheduledStart || cls.startTime);
        if (startTime && now < startTime.getTime()) {
            return true;
        }
        return false;
    }

    function parseTimeToMinutes(timeVal) {
        if (!timeVal) return null;
        if (typeof timeVal === 'number') {
            const d = new Date(timeVal);
            return d.getHours() * 60 + d.getMinutes();
        }
        const s = String(timeVal).trim().toLowerCase();
        const isPM = s.includes('pm');
        const isAM = s.includes('am');
        const clean = s.replace(/[^\d:]/g, '');
        const parts = clean.split(':');
        if (parts.length < 2) return null;
        let h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) || 0;
        if (isNaN(h)) return null;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        // In school schedules, hours 1 to 6 without explicit AM/PM are afternoon (1 PM to 6 PM)
        if (!isPM && !isAM && h >= 1 && h <= 6) {
            h += 12;
        }
        return h * 60 + m;
    }

    function formatTimeDisplay(timeStr) {
        if (!timeStr) return '';
        const s = String(timeStr).trim();
        if (/am|pm/i.test(s)) return s;
        const parts = s.split(':');
        if (parts.length >= 2) {
            let h = parseInt(parts[0], 10);
            const m = parts[1].padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h}:${m} ${ampm}`;
        }
        return s;
    }

    async function renderTodayScheduleFromDB() {
        const container = document.getElementById('today-schedule-list');
        if (!container) return;

        const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
        const schoolId = user?.schoolId || '';
        const isSchoolMode = window.rollCallStudentMode?.isSchoolMode?.() === true || state.schoolType === 'school' || user?.registrationType === 'school' || user?.institutionType === 'school';

        // In School Mode: Load from School Timetable for today's day of week
        if (isSchoolMode && schoolId && window.firebase?.database) {
            await renderSchoolTodaySchedule(container, user, schoolId);
            return;
        }

        // --- College / Location-Based Mode ---
        renderCollegeTodaySchedule(container, user);
    }

    async function renderSchoolTodaySchedule(container, user, schoolId) {
        const db = firebase.database();
        const now = new Date();
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayDayKey = dayKeys[now.getDay()];

        if (todayDayKey === 'sun') {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 28px; color: var(--sp-text-muted);">
                    <i class="fas fa-mug-hot" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-warning);"></i>
                    No classes scheduled for Sunday (Weekend).
                </div>`;
            return;
        }

        let settings = state.timetableSettings;
        let timetables = state.schoolTimetables;

        if (!settings || !timetables) {
            try {
                const settingsPromise = loadStableStudentReference(`schoolTimetableSettings/${schoolId}`, 15 * 60 * 1000);
                const timetablesPromise = window.RollCallTimetableCache
                    ? window.RollCallTimetableCache.syncTimetables(schoolId)
                    : db.ref(`schoolTimetables/${schoolId}`).once('value').then(s => ({ timetables: s.val() || {} }));

                const [settingsData, cacheResult] = await Promise.all([
                    settingsPromise,
                    timetablesPromise
                ]);
                settings = settingsData || {};
                timetables = cacheResult.timetables || {};
                state.timetableSettings = settings;
                state.schoolTimetables = timetables;
                if (cacheResult.version) {
                    state.timetableVersion = cacheResult.version;
                }
            } catch (err) {
                console.error('Error fetching timetable for today schedule:', err);
            }
        }

        settings = settings || {};
        timetables = timetables || {};
        const periods = Array.isArray(settings.periods) ? settings.periods : [];

        // Match student's assigned class/section
        const userSection = (user?.section || '').trim().toLowerCase();
        const userClassId = user?.enrolledClassId || user?.classId || '';
        const userClassName = (user?.className || '').trim().toLowerCase();

        let matchedTimetable = null;

        // 1. Try classId + section match
        if (userClassId && timetables[userClassId]) {
            const classSecs = timetables[userClassId];
            Object.values(classSecs).forEach(sched => {
                if (!matchedTimetable && sched && (String(sched.section || '').trim().toLowerCase() === userSection || !userSection)) {
                    matchedTimetable = sched;
                }
            });
            if (!matchedTimetable) {
                matchedTimetable = Object.values(classSecs)[0] || null;
            }
        }

        // 2. Search all classes for section match
        if (!matchedTimetable && userSection) {
            Object.values(timetables).forEach(secMap => {
                if (!matchedTimetable && secMap && typeof secMap === 'object') {
                    Object.values(secMap).forEach(sched => {
                        if (!matchedTimetable && sched && String(sched.section || '').trim().toLowerCase() === userSection) {
                            matchedTimetable = sched;
                        }
                    });
                }
            });
        }

        // 3. Search by className match
        if (!matchedTimetable && userClassName) {
            Object.values(timetables).forEach(secMap => {
                if (!matchedTimetable && secMap && typeof secMap === 'object') {
                    Object.values(secMap).forEach(sched => {
                        if (!matchedTimetable && sched && String(sched.className || '').trim().toLowerCase() === userClassName) {
                            matchedTimetable = sched;
                        }
                    });
                }
            });
        }

        // 4. Fallback to first available timetable
        if (!matchedTimetable) {
            for (const secMap of Object.values(timetables)) {
                if (secMap && typeof secMap === 'object') {
                    const first = Object.values(secMap)[0];
                    if (first) {
                        matchedTimetable = first;
                        break;
                    }
                }
            }
        }

        const todaySlots = matchedTimetable?.slots?.[todayDayKey] || {};
        const todayClasses = [];

        periods.forEach(p => {
            const slot = todaySlots[p.id];
            if (slot && slot.subject) {
                todayClasses.push({
                    periodId: p.id,
                    periodName: p.name || 'Period',
                    start: p.start || '09:00',
                    end: p.end || '10:00',
                    subject: slot.subject,
                    teacherName: slot.teacherName || 'Faculty Assigned',
                    room: slot.room || 'Classroom',
                    section: matchedTimetable.section || user?.section || 'Class'
                });
            }
        });

        if (todayClasses.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 28px; color: var(--sp-text-muted);">
                    <i class="fas fa-calendar-check" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-primary);"></i>
                    No classes scheduled for today in timetable.
                </div>`;
            return;
        }

        const curMinutes = now.getHours() * 60 + now.getMinutes();
        let futureCount = 0;

        container.innerHTML = todayClasses.map(cls => {
            let startM = parseTimeToMinutes(cls.start);
            let endM = parseTimeToMinutes(cls.end);

            if (startM === null) startM = 0;
            if (endM === null) endM = startM + 60;
            if (endM <= startM) endM += 12 * 60; // Rolled over noon, e.g. 12:00 to 1:00

            const isRunning = startM <= curMinutes && curMinutes < endM;
            const isPrevious = curMinutes >= endM;
            const isFuture = curMinutes < startM;

            let cardClass = 'schedule-card-item';
            let statusBadgeHtml = '';
            let cardTitle = `${cls.subject} (${cls.start} – ${cls.end})`;

            if (isRunning) {
                // Currently running class: flickering filled background in school mode
                cardClass += ' school-running-flicker';
                statusBadgeHtml = `
                    <div class="schedule-status-badge school-live-flicker-badge">
                        <span class="school-flicker-dot"></span>
                        <span>Ongoing Class</span>
                    </div>`;
                cardTitle = `Currently Running: ${cls.subject} (Ends in ${endM - curMinutes}m)`;
            } else if (isPrevious) {
                // Previous interval class: turned-down tile, subdued & completed
                cardClass += ' school-previous-tile';
                statusBadgeHtml = `
                    <div class="schedule-status-badge school-past-badge">
                        <i class="fas fa-check-circle"></i>
                        <span>Completed</span>
                    </div>`;
                cardTitle = `Previous Class: ${cls.subject} (Ended at ${formatTimeDisplay(cls.end)})`;
            } else if (isFuture) {
                // Future class of today: vibrant colourful tile
                const colorIdx = futureCount % 6;
                futureCount++;
                cardClass += ` school-future-tile school-future-color-${colorIdx}`;
                statusBadgeHtml = `
                    <div class="schedule-status-badge school-future-badge">
                        <i class="fas fa-clock"></i>
                        <span>Upcoming</span>
                    </div>`;
                cardTitle = `Upcoming: ${cls.subject} (Starts in ${startM - curMinutes}m)`;
            }

            return `
                <div class="${cardClass}" 
                     data-class-name="${encodeURIComponent(cls.subject)}"
                     data-period-id="${cls.periodId}"
                     title="${cardTitle}">
                    <div class="schedule-time-box">
                        <span class="time-start">${formatTimeDisplay(cls.start)}</span>
                        <span class="time-end">${formatTimeDisplay(cls.end)}</span>
                    </div>
                    <div class="schedule-details">
                        <div class="subject-name">${escapeHtml(cls.subject)}</div>
                        <div class="teacher-room">
                            <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(cls.teacherName)}</span>
                            <span><i class="fas fa-door-open"></i> ${escapeHtml(cls.room)}</span>
                            <span><i class="fas fa-layer-group"></i> ${escapeHtml(cls.periodName)}</span>
                        </div>
                    </div>
                    <div class="schedule-action-col">
                        ${isRunning ? '<span class="status-tag tag-now"><span class="school-flicker-dot"></span> Active Now</span>' : ''}
                        ${statusBadgeHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Attach click toasts for school cards
        container.querySelectorAll('.schedule-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const subject = decodeURIComponent(card.getAttribute('data-class-name') || 'Class');
                if (card.classList.contains('school-running-flicker')) {
                    showModernToast(`${subject} is currently in session right now.`, 'info', 2500);
                } else if (card.classList.contains('school-previous-tile')) {
                    showModernToast(`${subject} class interval has already concluded.`, 'info', 2200);
                } else if (card.classList.contains('school-future-tile')) {
                    showModernToast(`${subject} is scheduled for later today.`, 'info', 2200);
                }
            });
        });
    }

    function renderCollegeTodaySchedule(container, user) {
        const locations = state.locations || {};
        const studentSection = (user?.section || '').trim().toLowerCase();
        const uid = user?.uid;
        const todayStr = getTodayDateString();

        const todaySchedule = [];

        Object.keys(locations).forEach(id => {
            const loc = locations[id];
            const locSec = String(loc.section || '').trim().toLowerCase();
            
            const attendedToday = !!(uid && (isPresentAttendance(state.attendanceByLocation?.[id]?.[todayStr]?.[uid]) || isPresentAttendance(state.userAttendanceToday?.[id])));
            const matchesSection = attendedToday || !locSec || locSec === 'general' || locSec === 'all' || !studentSection || locSec.includes(studentSection) || studentSection.includes(locSec);

            if (matchesSection && isClassForToday({ id, ...loc }, todayStr)) {
                todaySchedule.push({ id, ...loc });
            }
        });

        if (todaySchedule.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 28px; color: var(--sp-text-muted);">
                    <i class="fas fa-calendar-check" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-primary);"></i>
                    No classes held or added today.
                </div>`;
            return;
        }

        // Sort: Active classes first, then upcoming, then present/absent
        todaySchedule.sort((a, b) => {
            const aActive = isClassActiveNow(a) ? 1 : 0;
            const bActive = isClassActiveNow(b) ? 1 : 0;
            return bActive - aActive;
        });

        container.innerHTML = todaySchedule.map(cls => {
            const start = cls.scheduledStart || cls.startTime || '10:00 AM';
            const end = cls.scheduledEnd || cls.endTime || '11:30 AM';
            const safeClassName = cls.name || 'Lecture Session';

            const locAttToday = (state.attendanceByLocation?.[cls.id]?.[todayStr]) || {};
            const locAttendance = uid ? locAttToday[uid] : null;
            const userAttendance = uid ? state.userAttendanceToday?.[cls.id] : null;
            const attendanceRecord = locAttendance ?? userAttendance;
            const hasAttendanceRecord = attendanceRecord !== null && attendanceRecord !== undefined;
            const isMarkedInLoc = isPresentAttendance(locAttendance);
            const isMarkedInUser = isPresentAttendance(userAttendance);
            const isMarked = isMarkedInLoc || isMarkedInUser;
            const isExplicitlyAbsent = hasAttendanceRecord && normalizeAttendanceStatus(attendanceRecord, 'absent') === 'absent';

            const active = isClassActiveNow(cls);
            const upcoming = isClassUpcoming(cls);

            let statusTagHtml = '';
            let actionHtml = '';
            let cardClass = 'schedule-card-item';
            let cardStatus = 'absent';
            let cardTitle = safeClassName;
            let canClickToMark = false;

            if (isMarked) {
                cardStatus = 'present';
                actionHtml = `
                    <div class="schedule-status-badge present">
                        <i class="fas fa-check-circle"></i>
                        <span>Present</span>
                    </div>`;
                cardClass += ' attended-card';
                cardTitle = `Attendance Marked: Present for ${safeClassName}`;
            } else if (active && !isExplicitlyAbsent) {
                cardStatus = 'active';
                statusTagHtml = '<span class="status-tag tag-now"><span class="school-flicker-dot"></span> Active Now</span>';
                actionHtml = `
                    <div class="schedule-mark-attendance-btn">
                        <span>Mark Attendance</span>
                        <i class="fas fa-arrow-right"></i>
                    </div>`;
                cardClass += ' active-now clickable-class-schedule-card school-running-flicker';
                cardTitle = `Click to Mark Attendance for ${safeClassName}`;
                canClickToMark = true;
            } else if (upcoming && !isExplicitlyAbsent) {
                cardStatus = 'upcoming';
                actionHtml = `
                    <div class="schedule-status-badge upcoming">
                        <i class="fas fa-clock"></i>
                        <span>Upcoming</span>
                    </div>`;
                cardClass += ' upcoming-card';
                cardTitle = `${safeClassName} scheduled to start at ${start}`;
            } else {
                cardStatus = 'absent';
                actionHtml = `
                    <div class="schedule-status-badge absent">
                        <i class="fas fa-times-circle"></i>
                        <span>Absent</span>
                    </div>`;
                cardClass += ' absent-card';
                cardTitle = `Attendance Not Marked: Absent for ${safeClassName}`;
            }

            return `
                <div class="${cardClass}" 
                     data-class-id="${cls.id}" 
                     data-class-name="${encodeURIComponent(safeClassName)}"
                     data-can-mark="${canClickToMark}"
                     data-status="${cardStatus}"
                     title="${cardTitle}">
                    <div class="schedule-time-box">
                        <span class="time-start">${start}</span>
                        <span class="time-end">${end}</span>
                    </div>
                    <div class="schedule-details">
                        <div class="subject-name">${safeClassName}</div>
                        <div class="teacher-room">
                            <span><i class="fas fa-chalkboard-teacher"></i> ${cls.teacherName || 'Faculty'}</span>
                            <span><i class="fas fa-location-dot"></i> Section ${cls.section || 'General'}</span>
                        </div>
                    </div>
                    <div class="schedule-action-col">
                        ${statusTagHtml}
                        ${actionHtml}
                    </div>
                </div>`;
        }).join('');

        // Attach click listeners to cards
        container.querySelectorAll('.schedule-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const canMark = card.getAttribute('data-can-mark') === 'true';
                const status = card.getAttribute('data-status');
                const classId = card.getAttribute('data-class-id');
                const className = decodeURIComponent(card.getAttribute('data-class-name') || 'Class');

                if (canMark) {
                    switchTab('tab-attendance');

                    const locSelect = document.getElementById('location-select') || document.getElementById('class-select');
                    if (locSelect && classId) {
                        locSelect.value = classId;
                        locSelect.dispatchEvent(new Event('change'));
                    }

                    showModernToast(`Navigated to Mark Attendance for ${className}`, 'info', 2500);

                    const targetSec = document.getElementById('scanner-container') || document.getElementById('tab-attendance');
                    if (targetSec) {
                        setTimeout(() => targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
                    }
                } else if (status === 'present') {
                    showModernToast(`Attendance marked for ${className}: Present`, 'success', 2200);
                } else if (status === 'absent') {
                    showModernToast(`Session ended. Attendance not marked: Absent`, 'error', 2200);
                } else if (status === 'upcoming') {
                    showModernToast(`${className} is scheduled for later today.`, 'info', 2200);
                }
            });
        });
    }
    window.renderTodaySchedule = renderTodayScheduleFromDB;

    /* ==========================================================================
       Rate Limiter Utility for Refresh Actions
       ========================================================================== */
    const refreshCooldownMap = new Map();

    function withRateLimit(btnElement, cooldownMs = 4000, actionLabel = 'Refresh', onAllowed) {
        if (!btnElement) return;
        const key = btnElement.id || actionLabel;
        const now = Date.now();
        const lastCall = refreshCooldownMap.get(key) || 0;
        const elapsed = now - lastCall;

        if (elapsed < cooldownMs) {
            const secondsLeft = Math.ceil((cooldownMs - elapsed) / 1000);
            showModernToast(`Please wait ${secondsLeft}s before refreshing ${actionLabel.toLowerCase()} again.`, 'warning', 1800);
            return;
        }

        refreshCooldownMap.set(key, now);

        const icon = btnElement.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        btnElement.classList.add('refresh-cooldown');
        btnElement.setAttribute('aria-disabled', 'true');

        const release = () => {
            const passed = Date.now() - now;
            const remaining = Math.max(0, cooldownMs - passed);
            setTimeout(() => {
                btnElement.classList.remove('refresh-cooldown');
                btnElement.removeAttribute('aria-disabled');
                if (icon) icon.classList.remove('fa-spin');
            }, remaining);
        };

        try {
            const res = onAllowed();
            if (res && typeof res.then === 'function') {
                res.finally(() => {
                    release();
                });
            } else {
                release();
            }
        } catch (err) {
            release();
            throw err;
        }
    }

    function initTodayScheduleControls() {
        const refreshBtn = document.getElementById('refresh-classes-btn');
        if (refreshBtn && !refreshBtn.dataset.listenerBound) {
            refreshBtn.dataset.listenerBound = 'true';
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                withRateLimit(refreshBtn, 4000, 'Schedule', async () => {
                    try {
                        if (window.firebase?.database && state.currentUser?.uid) {
                            const db = firebase.database();
                            const uid = state.currentUser.uid;
                            const schoolId = state.currentUser.schoolId;
                            const todayKey = getTodayDateString();
                            const promises = [
                                db.ref('locations').once('value'),
                                db.ref('attendance_by_location').once('value'),
                                db.ref(`user_attendance/${uid}/${todayKey}`).once('value')
                            ];
                            if (schoolId) {
                                promises.push(db.ref(`schoolTimetableSettings/${schoolId}`).once('value'));
                                promises.push(window.RollCallTimetableCache
                                    ? window.RollCallTimetableCache.syncTimetables(schoolId, true)
                                    : db.ref(`schoolTimetables/${schoolId}`).once('value').then(s => ({ timetables: s.val() || {} }))
                                );
                            }
                            const results = await Promise.all(promises);
                            state.locations = results[0].val() || {};
                            state.attendanceByLocation = results[1].val() || {};
                            state.userAttendanceToday = results[2].val() || {};
                            if (results[3]) state.timetableSettings = results[3].val() || {};
                            if (results[4]) {
                                state.schoolTimetables = results[4].timetables || results[4].val?.() || {};
                                if (results[4].version) state.timetableVersion = results[4].version;
                            }
                        }
                        await renderTodayScheduleFromDB();
                        loadStudentAttendanceRecords();
                        showModernToast("Schedule refreshed successfully", "success", 1800);
                    } catch (err) {
                        console.error("Error refreshing schedule:", err);
                        renderTodayScheduleFromDB();
                        showModernToast("Schedule updated", "info", 1800);
                    }
                });
            });
        }

        // Live Periodic Ticker: Update active period status automatically every 30 seconds
        if (!window._schoolTodayScheduleTicker) {
            window._schoolTodayScheduleTicker = setInterval(() => {
                if (state.activeTab === 'tab-overview' || state.activeTab === 'tab-home') {
                    renderTodayScheduleFromDB();
                }
            }, 30000);
        }
    }

    /* ==========================================================================
       Campus Announcements from RTDB (Realtime & Auto-Loading)
       ========================================================================== */
    const ANNOUNCEMENTS_CACHE_KEY = 'rollcall_announcements_cache_v1';
    let announcementsListenerAttached = false;
    let announcementsRetryTimer = null;

    function formatTimeAgo(ts) {
        if (!ts) return 'Recent';
        let timeNum = (typeof ts === 'number') ? ts : new Date(ts).getTime();
        if (isNaN(timeNum)) return String(ts);
        const diff = Math.floor((Date.now() - timeNum) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        if (diff < 172800) return 'Yesterday';
        return new Date(timeNum).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function getAnnouncementIcon(category, type) {
        const text = (String(category || '') + ' ' + String(type || '')).toLowerCase();
        if (text.includes('exam') || text.includes('test') || text.includes('grade') || text.includes('academic')) {
            return '<i class="fas fa-graduation-cap" style="color:var(--sp-primary)"></i>';
        }
        if (text.includes('alert') || text.includes('urgent') || text.includes('warning') || text.includes('important')) {
            return '<i class="fas fa-triangle-exclamation" style="color:var(--sp-warning)"></i>';
        }
        if (text.includes('event') || text.includes('hackathon') || text.includes('workshop') || text.includes('seminar') || text.includes('tech')) {
            return '<i class="fas fa-laptop-code" style="color:var(--sp-info)"></i>';
        }
        if (text.includes('holiday') || text.includes('leave') || text.includes('closure')) {
            return '<i class="fas fa-calendar-day" style="color:var(--sp-success)"></i>';
        }
        return '<i class="fas fa-bullhorn" style="color:var(--sp-primary)"></i>';
    }

    function renderAnnouncementsList(items) {
        const container = document.getElementById('campus-announcements-list');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 24px; color: var(--sp-text-muted);">
                    <i class="fas fa-bullhorn" style="font-size: 1.8rem; margin-bottom: 8px; display: block; color: var(--sp-text-subtle);"></i>
                    No active campus announcements.
                </div>`;
            return;
        }

        // Sort newest first
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        container.innerHTML = items.map(item => `
            <div class="drawer-item">
                <div class="drawer-item-title">${getAnnouncementIcon(item.category, item.type)} ${item.title}</div>
                <div class="drawer-item-desc">${item.desc}</div>
                <div class="drawer-item-time">${formatTimeAgo(item.timestamp)} • ${item.sender}</div>
            </div>
        `).join('');
    }

    function parseAnnouncementsData(annData) {
        if (!annData) return [];
        const items = [];
        Object.keys(annData).forEach(k => {
            const a = annData[k];
            if (!a) return;
            items.push({
                id: k,
                title: a.title || a.subject || 'Campus Announcement',
                desc: a.message || a.desc || a.text || a.content || '',
                timestamp: a.timestamp || a.createdAt || (a.date ? new Date(a.date).getTime() : 0),
                sender: a.sender || a.department || a.sentBy || 'Academic Office',
                category: a.category || a.type || 'General',
                type: a.type || 'info'
            });
        });
        return items;
    }

    function loadCachedAnnouncements() {
        try {
            const raw = localStorage.getItem(ANNOUNCEMENTS_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    renderAnnouncementsList(parsed);
                    return true;
                }
            }
        } catch (e) {
            // ignore cache parse errors
        }
        return false;
    }

    function cacheAnnouncements(items) {
        try {
            if (Array.isArray(items)) {
                localStorage.setItem(ANNOUNCEMENTS_CACHE_KEY, JSON.stringify(items));
            }
        } catch (e) {
            // ignore cache write errors
        }
    }

    function loadFirebaseAnnouncements(isManualRefresh = false) {
        const container = document.getElementById('campus-announcements-list');
        if (!container) return;

        // Display cached announcements immediately so UI is never blank
        if (!isManualRefresh) {
            loadCachedAnnouncements();
        }

        const hasModularDb = window.database && window.ref && (typeof window.onValue === 'function' || typeof window.get === 'function');
        const hasCompatDb = typeof window.firebase !== 'undefined' && typeof window.firebase.database === 'function' && window.firebase.apps && window.firebase.apps.length > 0;

        if (!hasModularDb && !hasCompatDb) {
            // Auto retry shortly when Firebase finishes initializing
            if (announcementsRetryTimer) clearTimeout(announcementsRetryTimer);
            announcementsRetryTimer = setTimeout(() => {
                loadFirebaseAnnouncements(isManualRefresh);
            }, 300);
            return;
        }

        // 1. Modular SDK query & real-time sync
        if (hasModularDb) {
            try {
                const annRef = window.ref(window.database, 'announcements');

                if (!announcementsListenerAttached && typeof window.onValue === 'function') {
                    announcementsListenerAttached = true;
                    window.onValue(annRef, (snapshot) => {
                        const items = parseAnnouncementsData(snapshot.val());
                        cacheAnnouncements(items);
                        renderAnnouncementsList(items);
                    }, (err) => {
                        console.warn('Realtime announcements listener error:', err);
                    });
                }

                if (typeof window.get === 'function') {
                    window.get(annRef).then((snapshot) => {
                        const items = parseAnnouncementsData(snapshot.val());
                        cacheAnnouncements(items);
                        renderAnnouncementsList(items);
                    }).catch((err) => {
                        console.warn('Modular announcements get error:', err);
                    });
                }
                return;
            } catch (e) {
                console.warn('Error querying modular announcements:', e);
            }
        }

        // 2. Fallback to Compat SDK
        if (hasCompatDb) {
            try {
                const db = window.firebase.database();
                const annQuery = db.ref('announcements').limitToLast(25);

                if (!announcementsListenerAttached) {
                    announcementsListenerAttached = true;
                    annQuery.on('value', (snap) => {
                        const items = parseAnnouncementsData(snap.val());
                        cacheAnnouncements(items);
                        renderAnnouncementsList(items);
                    }, (err) => {
                        console.warn('Compat announcements listener error:', err);
                    });
                }

                annQuery.once('value').then((annSnap) => {
                    const items = parseAnnouncementsData(annSnap.val());
                    cacheAnnouncements(items);
                    renderAnnouncementsList(items);
                }).catch((err) => {
                    console.error('Error loading announcements:', err);
                    if (!loadCachedAnnouncements()) {
                        container.innerHTML = `
                            <div class="empty-state" style="text-align: center; padding: 24px; color: var(--sp-text-muted);">
                                <i class="fas fa-triangle-exclamation" style="font-size: 1.8rem; margin-bottom: 8px; display: block; color: var(--sp-warning);"></i>
                                Could not load announcements. Please try again.
                            </div>`;
                    }
                });
            } catch (err) {
                console.error('Compat database query error:', err);
            }
        }
    }
    window.loadFirebaseAnnouncements = loadFirebaseAnnouncements;

    function initAnnouncementsControls() {
        const refreshBtn = document.getElementById('refresh-announcements-btn');
        if (refreshBtn && !refreshBtn.dataset.listenerBound) {
            refreshBtn.dataset.listenerBound = 'true';
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                withRateLimit(refreshBtn, 4000, 'Announcements', async () => {
                    loadFirebaseAnnouncements(true);
                    showModernToast("Announcements updated", "info", 1800);
                });
            });
        }
    }

    /* ==========================================================================
       Class Teacher Section Module
       ========================================================================== */
    async function loadClassTeacherInfo() {
        const container = document.getElementById('overview-class-teacher-body');
        const profField = document.getElementById('prof-val-class-teacher');
        if (!container && !profField) return;

        const user = (state.currentUser && state.currentUser.uid)
            ? state.currentUser
            : (window.currentUser || (window.firebase?.auth && firebase.auth().currentUser) || {});
        if (!user || !user.uid || !window.firebase?.database) return;

        const db = firebase.database();
        const schoolId = user.schoolId || state.currentUser?.schoolId || '';
        const section = String(user.section || state.currentUser?.section || '').trim();
        const classId = user.enrolledClassId || user.classId || state.currentUser?.enrolledClassId || state.currentUser?.classId || '';
        const rawClassName = user.className || state.currentUser?.className || user.courseName || user.course || 'Class';
        const className = formatClassDisplay(rawClassName, 'Class');

        const sectionKey = value => Array.from(new TextEncoder().encode(String(value || '').trim()), byte => byte.toString(16).padStart(2, '0')).join('');

        let teacherData = null;

        try {
            // 1. Try classTeacherAssignments/${schoolId}/${sectionKey(section)}
            if (schoolId && section) {
                const sKey = sectionKey(section);
                const assignSnap = await db.ref(`classTeacherAssignments/${schoolId}/${sKey}`).once('value');
                const assignVal = assignSnap.val();
                if (assignVal && assignVal.teacherId) {
                    teacherData = { ...assignVal };
                }
            }

            // 2. Try classTeacherAssignmentsByClass/${schoolId}/${classId}
            if (!teacherData && schoolId && classId) {
                const byClassSnap = await db.ref(`classTeacherAssignmentsByClass/${schoolId}/${classId}`).once('value');
                const byClassVal = byClassSnap.val() || {};
                const sLower = section.toLowerCase();
                for (const [k, val] of Object.entries(byClassVal)) {
                    if (val && val.teacherId && (String(val.section || '').trim().toLowerCase() === sLower || k.includes(sLower))) {
                        teacherData = { ...val };
                        break;
                    }
                }
            }

            // 3. Fallback: Search users in school for classTeacher role matching this section
            if (!teacherData && schoolId && section) {
                const usersSnap = await db.ref('users').orderByChild('schoolId').equalTo(schoolId).once('value');
                const usersVal = usersSnap.val() || {};
                const sLower = section.toLowerCase();
                for (const [uId, u] of Object.entries(usersVal)) {
                    if (!u || u.role !== 'teacher') continue;
                    const isCT = u.teacherType === 'classTeacher' || u.teacherRole === 'classTeacher' || u.classTeacherEnabled === true;
                    if (!isCT) continue;
                    const assignedSecs = Array.isArray(u.assignedSections)
                        ? u.assignedSections
                        : (u.classTeacherSections ? Object.keys(u.classTeacherSections) : [u.classTeacherSection]);
                    if (assignedSecs.some(sec => String(sec || '').trim().toLowerCase() === sLower)) {
                        teacherData = {
                            teacherId: uId,
                            teacherName: u.name || u.fullName,
                            teacherEmail: u.email,
                            teacherPhone: u.phone || u.mobile,
                            subject: u.subject || u.specialization || u.department,
                            cabin: u.cabin || u.room || u.office,
                            avatar: u.profilePhoto || u.photoURL || u.photoUrl || u.profilePic || u.profileImage || u.avatar || '',
                            section: section,
                            className: className
                        };
                        break;
                    }
                }
            }

            // If teacherId is present, enrich with latest profile from users/${teacherId} and teachers/${teacherId}
            if (teacherData && teacherData.teacherId) {
                const [userSnap, teacherSnap] = await Promise.all([
                    db.ref(`users/${teacherData.teacherId}`).once('value'),
                    db.ref(`teachers/${teacherData.teacherId}`).once('value')
                ]);
                const tUser = { ...(teacherSnap.val() || {}), ...(userSnap.val() || {}) };
                teacherData.name = tUser.name || tUser.fullName || tUser.displayName || teacherData.teacherName || 'Assigned Educator';
                teacherData.email = tUser.email || teacherData.teacherEmail || '';
                teacherData.phone = tUser.phone || tUser.mobile || tUser.phoneNumber || teacherData.teacherPhone || '';
                teacherData.subject = tUser.subject || tUser.specialization || tUser.department || teacherData.subject || '';
                teacherData.cabin = cleanCabinLocation(tUser.cabin || tUser.room || tUser.office || teacherData.cabin);
                teacherData.avatar = tUser.profilePhoto || tUser.photoURL || tUser.photoUrl || tUser.profilePic || tUser.profileImage || tUser.avatar || tUser.photo || teacherData.avatar || '';
            }

        } catch (err) {
            console.error('Error fetching class teacher info:', err);
        }

        currentClassTeacherData = teacherData;
        currentTeacherSection = section;
        currentTeacherClassName = className;

        renderClassTeacherCard(container, profField, teacherData, section, className);
        setupTeacherReviewModalListeners();
    }
    window.loadClassTeacherInfo = loadClassTeacherInfo;

    let currentClassTeacherData = null;
    let currentTeacherSection = '';
    let currentTeacherClassName = '';

    function cleanCabinLocation(val) {
        if (!val) return 'Staff Room';
        if (typeof val === 'object') {
            val = val.name || val.room || val.cabin || val.location || val.title || 'Staff Room';
        }
        let s = String(val).trim();
        // 1. Strip any HTML tags
        s = s.replace(/<[^>]*>/g, ' ');
        // 2. Decode or strip HTML entities and punctuation/symbols
        s = s.replace(/&(quot|amp|lt|gt|#39|#x27);/gi, ' ').replace(/["'<>{}();\\]/g, ' ');
        s = s.replace(/\s+/g, ' ').trim();

        // 3. If it contains "staff" anywhere, it is Staff Room!
        if (/staff/i.test(s)) {
            return 'Staff Room';
        }

        // 4. Clean up any leading "Room", "Cabin", "Office", "R"
        s = s.replace(/^(room|cabin|office|location|loc|r)[\s:.-]*/i, '').trim();

        if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') {
            return 'Staff Room';
        }

        // 5. If it's a number/code like "101" or "B2", format as "Room 101"
        if (/^\d+[A-Z]?$/i.test(s)) {
            return `Room ${s}`;
        }

        return s;
    }

    function formatPhoneNumber(num) {
        if (!num) return '';
        const clean = String(num).trim();
        const match = clean.match(/^(\+91)(\d{5})(\d{5})$/);
        if (match) return `${match[1]} ${match[2]} ${match[3]}`;
        return clean;
    }

    function getTeacherAvatarSvg(name = 'T') {
        const initial = (name.trim().charAt(0) || 'T').toUpperCase();
        const colors = [
            ['#4f46e5', '#3730a3'],
            ['#0891b2', '#0e7490'],
            ['#059669', '#047857'],
            ['#7c3aed', '#6d28d9'],
            ['#d97706', '#b45309']
        ];
        const colorIndex = (initial.charCodeAt(0) || 0) % colors.length;
        const [c1, c2] = colors[colorIndex];
        const rawSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='100%' height='100%' rx='24' fill='url(#g)'/><text x='50%' y='54%' font-family='-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' font-weight='700' font-size='44' fill='#ffffff' dominant-baseline='middle' text-anchor='middle'>${initial}</text></svg>`;
        try {
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(rawSvg)));
        } catch (e) {
            return 'data:image/svg+xml;base64,' + btoa(rawSvg);
        }
    }

    function navigateToLeaveTab() {
        const leaveTabBtn = document.querySelector('[data-tab="tab-leave"]');
        if (leaveTabBtn) {
            leaveTabBtn.click();
        } else {
            const leaveTab = document.getElementById('tab-leave');
            if (leaveTab) {
                document.querySelectorAll('.student-tab-panel').forEach(p => p.classList.remove('active'));
                leaveTab.classList.add('active');
            }
        }
    }

    function openTeacherProfileReview() {
        const modal = document.getElementById('teacher-profile-review-modal');
        if (!modal) return;

        const teacher = currentClassTeacherData;
        const section = currentTeacherSection;
        const className = currentTeacherClassName;

        if (!teacher || !teacher.name) {
            showModernToast('No class teacher assigned yet for this section.', 'info');
            return;
        }

        const name = teacher.name || 'Assigned Educator';
        const email = teacher.email || '';
        const phone = teacher.phone || '';
        const subject = teacher.subject || 'Faculty Mentor';
        const cabin = cleanCabinLocation(teacher.cabin);
        const fallbackSvg = getTeacherAvatarSvg(name);
        const avatar = (teacher.avatar && typeof teacher.avatar === 'string' && (teacher.avatar.startsWith('http') || teacher.avatar.startsWith('data:')))
            ? teacher.avatar
            : fallbackSvg;
        const schoolName = teacher.schoolName || state.currentUser?.schoolName || (state.currentUser?.schoolId ? `School ID: ${state.currentUser.schoolId}` : 'Main Campus');
        const teacherId = teacher.teacherId || '-';

        const avatarEl = document.getElementById('tr-hero-avatar');
        if (avatarEl) {
            avatarEl.src = avatar;
            avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = fallbackSvg; };
        }
        const nameEl = document.getElementById('tr-hero-name');
        if (nameEl) nameEl.textContent = name;

        const roleEl = document.getElementById('tr-hero-role');
        if (roleEl) roleEl.textContent = `Class Teacher • ${className || 'Class'} (${section ? `Sec ${section}` : 'General'})`;

        const classPill = document.getElementById('tr-pill-class');
        if (classPill) classPill.innerHTML = `<i class="fas fa-users-rectangle"></i> ${escapeHtml(className || 'Class')} - Sec ${escapeHtml(section || 'A')}`;

        const cabinEl = document.getElementById('tr-detail-cabin');
        if (cabinEl) cabinEl.textContent = cabin;

        const subjectEl = document.getElementById('tr-detail-subject');
        if (subjectEl) subjectEl.textContent = subject;

        const emailEl = document.getElementById('tr-detail-email');
        if (emailEl) {
            if (email) {
                emailEl.textContent = email;
                emailEl.href = `mailto:${email}`;
                emailEl.style.display = 'inline';
            } else {
                emailEl.textContent = 'Not specified';
                emailEl.removeAttribute('href');
            }
        }

        const phoneEl = document.getElementById('tr-detail-phone');
        if (phoneEl) {
            if (phone) {
                phoneEl.textContent = formatPhoneNumber(phone);
                phoneEl.href = `tel:${phone}`;
                phoneEl.style.display = 'inline';
            } else {
                phoneEl.textContent = 'Not specified';
                phoneEl.removeAttribute('href');
            }
        }

        const schoolEl = document.getElementById('tr-detail-school');
        if (schoolEl) schoolEl.textContent = schoolName;

        modal.style.display = 'flex';
        // Force reflow for CSS transition
        void modal.offsetWidth;
        modal.classList.add('visible');
    }
    window.openTeacherProfileReview = openTeacherProfileReview;

    function closeTeacherProfileReview() {
        const modal = document.getElementById('teacher-profile-review-modal');
        if (modal) {
            modal.classList.remove('visible');
            setTimeout(() => {
                if (!modal.classList.contains('visible')) {
                    modal.style.display = 'none';
                }
            }, 250);
        }
    }
    window.closeTeacherProfileReview = closeTeacherProfileReview;

    function setupTeacherReviewModalListeners() {
        const modal = document.getElementById('teacher-profile-review-modal');
        if (!modal || modal.dataset.reviewListenersAttached === 'true') return;
        modal.dataset.reviewListenersAttached = 'true';

        const closeBtn = document.getElementById('tr-modal-close-btn');
        const dismissBtn = document.getElementById('tr-modal-dismiss-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeTeacherProfileReview);
        if (dismissBtn) dismissBtn.addEventListener('click', closeTeacherProfileReview);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTeacherProfileReview();
        });

        const leaveBtn = document.getElementById('tr-modal-leave-btn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeTeacherProfileReview();
                navigateToLeaveTab();
            });
        }
    }

    function renderClassTeacherCard(container, profField, teacher, section, className) {
        // Connect to Profile & Security tab
        const profViewBtn = document.getElementById('prof-view-ct-btn');
        if (profField) {
            if (teacher && teacher.name) {
                profField.innerHTML = `<strong>${escapeHtml(teacher.name)}</strong>${teacher.subject ? ` <span style="font-size:0.75rem; color:var(--sp-text-muted);">(${escapeHtml(teacher.subject)})</span>` : ''}`;
                if (profViewBtn) {
                    profViewBtn.style.display = 'inline-flex';
                    profViewBtn.onclick = (e) => {
                        e.preventDefault();
                        openTeacherProfileReview();
                    };
                }
            } else {
                profField.textContent = 'Not Assigned Yet';
                if (profViewBtn) profViewBtn.style.display = 'none';
            }
        }

        if (!container) return;

        if (!teacher || !teacher.name) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 16px 12px; color: var(--sp-text-muted);">
                    <i class="fas fa-user-clock" style="font-size: 1.5rem; margin-bottom: 8px; display: block; color: var(--sp-warning);"></i>
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--sp-text-main);">No Class Teacher Assigned</div>
                    <div style="font-size: 0.74rem; margin-top: 4px; line-height: 1.4;">Your section ${escapeHtml(section || '')} does not have a designated class mentor yet.</div>
                </div>
            `;
            return;
        }

        const name = escapeHtml(teacher.name);
        const email = escapeHtml(teacher.email || '');
        const phone = escapeHtml(teacher.phone || '');
        const subject = escapeHtml(teacher.subject || '');
        const cabin = escapeHtml(cleanCabinLocation(teacher.cabin));
        const fallbackSvg = getTeacherAvatarSvg(name);
        const avatar = (teacher.avatar && typeof teacher.avatar === 'string' && (teacher.avatar.startsWith('http') || teacher.avatar.startsWith('data:')))
            ? teacher.avatar
            : fallbackSvg;
        const secLabel = escapeHtml(section ? `Sec ${section}` : 'General');
        const clsLabel = escapeHtml(className || 'Class');

        // Redesigned structured V2 layout: no cramped floating chips
        container.innerHTML = `
            <div class="class-teacher-card-v2">
                <div class="ct-v2-header">
                    <div class="ct-v2-avatar-wrap">
                        <img src="${avatar}" alt="${name}" class="ct-v2-avatar-img" id="ct-v2-avatar-img">
                        <span class="ct-v2-avatar-badge" title="Designated Class Mentor"><i class="fas fa-check"></i></span>
                    </div>
                    <div class="ct-v2-meta">
                        <div class="ct-v2-name-row">
                            <h4 class="ct-v2-name">${name}</h4>
                        </div>
                        <div class="ct-v2-designation">
                            <span class="ct-v2-role-pill">Class Teacher</span>
                            <span class="ct-v2-class-pill">${clsLabel} • ${secLabel}</span>
                        </div>
                    </div>
                </div>

                <div class="ct-v2-info-list">
                    <div class="ct-v2-info-row">
                        <div class="ct-v2-info-icon faculty-room">
                            <i class="fas fa-school"></i>
                        </div>
                        <div class="ct-v2-info-content">
                            <span class="ct-v2-info-label">Faculty Room</span>
                            <span class="ct-v2-info-val">${cabin}</span>
                        </div>
                    </div>

                    ${subject ? `
                    <div class="ct-v2-info-row">
                        <div class="ct-v2-info-icon subject">
                            <i class="fas fa-book-open"></i>
                        </div>
                        <div class="ct-v2-info-content">
                            <span class="ct-v2-info-label">Subject</span>
                            <span class="ct-v2-info-val">${subject}</span>
                        </div>
                    </div>` : ''}

                    ${email ? `
                    <div class="ct-v2-info-row">
                        <div class="ct-v2-info-icon email">
                            <i class="fas fa-envelope"></i>
                        </div>
                        <div class="ct-v2-info-content">
                            <span class="ct-v2-info-label">Email</span>
                            <a href="mailto:${email}" class="ct-v2-info-val ct-v2-link" title="${email}">${email}</a>
                        </div>
                    </div>` : ''}

                    ${phone ? `
                    <div class="ct-v2-info-row">
                        <div class="ct-v2-info-icon phone">
                            <i class="fas fa-phone"></i>
                        </div>
                        <div class="ct-v2-info-content">
                            <span class="ct-v2-info-label">Contact</span>
                            <a href="tel:${phone}" class="ct-v2-info-val ct-v2-link">${escapeHtml(formatPhoneNumber(phone))}</a>
                        </div>
                    </div>` : ''}
                </div>

                <div class="ct-v2-actions">
                    <button type="button" class="ct-v2-btn secondary" id="ct-view-profile-btn">
                        <i class="fas fa-id-card-clip"></i> Full Profile
                    </button>
                    <button type="button" class="ct-v2-btn primary" id="ct-request-leave-btn">
                        <i class="fas fa-paper-plane"></i> Apply Leave
                    </button>
                </div>
            </div>
        `;

        const ctAvatarImg = container.querySelector('#ct-v2-avatar-img');
        if (ctAvatarImg) {
            ctAvatarImg.addEventListener('error', () => {
                ctAvatarImg.src = fallbackSvg;
            }, { once: true });
        }

        const viewProfBtn = container.querySelector('#ct-view-profile-btn');
        if (viewProfBtn) {
            viewProfBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openTeacherProfileReview();
            });
        }

        const leaveBtn = container.querySelector('#ct-request-leave-btn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToLeaveTab();
            });
        }
    }

    /* ==========================================================================
       Student Portal - Homework & Assignments Engine
       Fetches all subject homework for this student's class & section
       ========================================================================== */
    state.studentHomework = [];
    state.completedHomeworkMap = {};
    state.activeHwSubject = 'all';
    state.activeHwFilter = 'all';
    state.hwSearchQuery = '';

    function normSectionVal(val) {
        if (!val) return '';
        let s = String(val).trim().toUpperCase();
        // Remove prefixes like "SECTION ", "SEC. ", "SEC ", "SEC-"
        s = s.replace(/^(SECTION|SEC\.?)\s*[-:]?\s*/i, '').trim();
        // Extract core alphanumeric identifier (e.g., "A" from "A - Science", "B" from "B1")
        const m = s.match(/^[A-Z0-9]+/i);
        return m ? m[0].toUpperCase() : s;
    }

    function extractGradeNumber(str) {
        if (!str) return null;
        const s = String(str).toLowerCase().trim();
        if (/\b(xii|12th|12)\b/i.test(s)) return '12';
        if (/\b(xi|11th|11)\b/i.test(s)) return '11';
        if (/\b(x|10th|10)\b/i.test(s)) return '10';
        if (/\b(ix|9th|9)\b/i.test(s)) return '9';
        if (/\b(viii|8th|8)\b/i.test(s)) return '8';
        if (/\b(vii|7th|7)\b/i.test(s)) return '7';
        if (/\b(vi|6th|6)\b/i.test(s)) return '6';
        if (/\b(v|5th|5)\b/i.test(s)) return '5';
        if (/\b(iv|4th|4)\b/i.test(s)) return '4';
        if (/\b(iii|3rd|3)\b/i.test(s)) return '3';
        if (/\b(ii|2nd|2)\b/i.test(s)) return '2';
        if (/\b(i|1st|1)\b/i.test(s)) return '1';
        const m = s.match(/\d+/);
        return m ? m[0] : null;
    }

    function isHomeworkMatch(hw, studentUser) {
        if (!hw) return false;

        // 1. Section matching
        const hwSec = normSectionVal(hw.section || hw.normSection);
        const stSec = normSectionVal(studentUser.section || studentUser.classSection || studentUser.assignedSection || state.currentUser?.section);

        // If homework explicitly specifies a section and student has a section, they must match unless ALL
        if (hwSec && stSec && hwSec !== 'ALL' && hwSec !== stSec) {
            return false;
        }

        // 2. Direct Class / Course ID matching (authoritative)
        const studentIds = [
            studentUser.classId,
            studentUser.enrolledClassId,
            studentUser.courseId,
            state.currentUser?.classId,
            state.currentUser?.enrolledClassId,
            state.currentUser?.courseId
        ].filter(Boolean).map(x => String(x).toLowerCase().trim());

        const hwIds = [
            hw.classId,
            hw.courseId
        ].filter(Boolean).map(x => String(x).toLowerCase().trim());

        if (hwIds.length > 0 && studentIds.length > 0) {
            const idMatched = hwIds.some(hId => studentIds.includes(hId));
            if (idMatched) return true;
        }

        // 3. Class Name matching
        const studentNames = [
            studentUser.className,
            studentUser.courseName,
            studentUser.course,
            studentUser.class,
            studentUser.assignedClass,
            state.currentUser?.className,
            state.currentUser?.courseName,
            state.currentUser?.course,
            state.currentUser?.class
        ].filter(Boolean).map(x => String(x).toLowerCase().trim());

        const hwName = String(hw.className || hw.courseName || '').toLowerCase().trim();

        // If neither specifies a class constraint, allow by section
        if (!hwName && hwIds.length === 0) return true;
        if (studentNames.length === 0 && studentIds.length === 0) return true;

        if (hwName && studentNames.length > 0) {
            // Direct equality or substring containment
            const directMatch = studentNames.some(stName => {
                if (stName === hwName) return true;
                if (stName.includes(hwName) || hwName.includes(stName)) return true;
                return false;
            });
            if (directMatch) return true;

            // Grade number / Roman numeral matching (e.g. "Class 10" vs "Grade 10" vs "10th" vs "10")
            const hwGrade = extractGradeNumber(hwName);
            if (hwGrade) {
                const gradeMatch = studentNames.some(stName => {
                    const stGrade = extractGradeNumber(stName);
                    return stGrade && stGrade === hwGrade;
                });
                if (gradeMatch) return true;
            }

            // Word token match for college courses (e.g., "Computer Science" vs "B.Tech CSE")
            const cleanTokens = str => str.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
            const hwTokens = cleanTokens(hwName);
            const tokenMatch = studentNames.some(stName => {
                const stTokens = cleanTokens(stName);
                return hwTokens.some(ht => stTokens.includes(ht));
            });
            if (tokenMatch) return true;
        }

        // Fallback: If section matches and hw has generic/open class label
        if (hwSec && stSec && hwSec === stSec) {
            if (!hwName || hwName === 'class' || hwName === 'all' || hwName === 'general') return true;
            if (studentNames.length === 0) return true;
        }

        return false;
    }

    function initStudentHomeworkSync(user) {
        if (!user || !window.firebase?.database) return;
        const db = firebase.database();
        const schoolId = user.schoolId || state.currentUser?.schoolId || window.currentUser?.schoolId;
        
        // If schoolId is not yet available, fetch directly from users/${uid}
        if (!schoolId) {
            if (user.uid) {
                db.ref(`users/${user.uid}/schoolId`).once('value', snap => {
                    const sid = snap.val();
                    if (sid) {
                        if (state.currentUser) state.currentUser.schoolId = sid;
                        initStudentHomeworkSync({ ...user, schoolId: sid });
                    }
                });
            }
            return;
        }

        // 1. Sync student's personal completion status (RTDB + localStorage)
        const localCacheKey = `rollcall_hw_completed_${user.uid}`;
        try {
            const cached = localStorage.getItem(localCacheKey);
            if (cached) state.completedHomeworkMap = JSON.parse(cached);
        } catch (e) {}

        db.ref(`studentHomeworkStatus/${user.uid}`).on('value', snap => {
            const val = snap.val() || {};
            state.completedHomeworkMap = { ...state.completedHomeworkMap, ...val };
            try {
                localStorage.setItem(localCacheKey, JSON.stringify(state.completedHomeworkMap));
            } catch (e) {}
            renderStudentHomework();
            renderOverviewHomeworkWidget();
            updateHomeworkNavBadges();
        });

        // 2. Realtime listener on schoolHomework
        db.ref(`schoolHomework/${schoolId}`).on('value', snapshot => {
            const data = snapshot.val() || {};
            const curStudent = {
                ...state.currentUser,
                ...window.currentUser,
                ...user
            };

            // WORKFLOW:
            // 1. While active (teacher has NOT submitted defaulters yet):
            //    Show as normal detail reference card to students of this class & section (NO buttons).
            // 2. Once teacher submits defaulters (defaultersReviewed === true):
            //    - Non-defaulters: card is removed (they completed it, clean view).
            //    - Defaulters: card is shown with RED BORDER and "You have not completed this homework" (NO buttons).
            state.studentHomework = Object.entries(data).map(([id, item]) => ({
                id,
                ...item
            })).filter(hw => {
                if (!isHomeworkMatch(hw, curStudent)) return false;

                if (hw.defaultersReviewed) {
                    // Only show to defaulters
                    return !!(hw.defaulters && hw.defaulters[curStudent.uid] === true);
                }

                // If not reviewed yet, show as active task reference card
                return true;
            }).sort((a, b) => {
                const aDef = !!(a.defaultersReviewed && a.defaulters && a.defaulters[curStudent.uid]);
                const bDef = !!(b.defaultersReviewed && b.defaulters && b.defaulters[curStudent.uid]);
                if (aDef !== bDef) return aDef ? -1 : 1; // Defaulters shown first

                const dueA = new Date(`${a.dueDate}T${a.dueTime || '23:59'}`).getTime() || 0;
                const dueB = new Date(`${b.dueDate}T${b.dueTime || '23:59'}`).getTime() || 0;
                return dueA - dueB;
            });

            // Update UI
            updateHomeworkNavBadges();
            renderOverviewHomeworkWidget();
            renderStudentHomework();
        });

        // 3. Direct listener on studentHomeworkDefaulters for instant real-time sync
        db.ref(`studentHomeworkDefaulters/${user.uid}`).on('value', () => {
            updateHomeworkNavBadges();
            renderOverviewHomeworkWidget();
            renderStudentHomework();
        });

        // Setup overview "View All" button listener once
        const viewAllBtn = document.getElementById('ov-view-all-hw-btn');
        if (viewAllBtn && viewAllBtn.dataset.bound !== 'true') {
            viewAllBtn.dataset.bound = 'true';
            viewAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab('tab-homework');
            });
        }

        // Setup filter and search listeners
        setupStudentHomeworkControls();
    }
    window.initStudentHomeworkSync = initStudentHomeworkSync;

    function updateHomeworkNavBadges() {
        const totalIncomplete = state.studentHomework.length;
        const navBadge = document.getElementById('nav-hw-badge');
        const mobBadge = document.getElementById('mobile-hw-badge');

        [navBadge, mobBadge].forEach(badge => {
            if (!badge) return;
            if (totalIncomplete > 0) {
                badge.textContent = totalIncomplete > 99 ? '99+' : totalIncomplete;
                badge.style.display = 'inline-flex';
                badge.style.background = '#dc2626';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    function getStudentHwDueMeta(dateStr, timeStr) {
        if (!dateStr) return { status: 'pending', label: 'No Deadline', cls: 'info' };
        const due = new Date(`${dateStr}T${timeStr || '23:59'}`);
        const now = new Date();
        const diffMs = due - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 0) {
            const daysAgo = Math.abs(Math.floor(diffHours / 24));
            return {
                status: 'overdue',
                label: daysAgo <= 1 ? 'Overdue Yesterday' : `Overdue (${daysAgo}d ago)`,
                cls: 'danger',
                isUrgent: true
            };
        }
        if (due.toDateString() === now.toDateString()) {
            return {
                status: 'urgent',
                label: `Due Today at ${timeStr || '23:59'}`,
                cls: 'warning',
                isUrgent: true
            };
        }
        if (diffHours <= 48) {
            return {
                status: 'urgent',
                label: 'Due Tomorrow',
                cls: 'warning',
                isUrgent: true
            };
        }
        const daysLeft = Math.ceil(diffHours / 24);
        return {
            status: 'pending',
            label: `Due in ${daysLeft} days`,
            cls: 'normal',
            isUrgent: false
        };
    }

    function formatDisplayDate(dateStr, timeStr) {
        if (!dateStr) return 'No due date';
        const dt = new Date(`${dateStr}T${timeStr || '23:59'}`);
        if (isNaN(dt.getTime())) return dateStr;
        return dt.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }) + (timeStr ? ` at ${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '');
    }

    function renderOverviewHomeworkWidget() {
        const container = document.getElementById('overview-homework-list');
        if (!container) return;

        if (state.studentHomework.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:18px 12px; color:var(--sp-text-muted); font-size:0.82rem;">
                    <i class="fas fa-circle-check" style="color:var(--sp-success); font-size:1.6rem; display:block; margin-bottom:6px;"></i>
                    All caught up! No active or incomplete assignments.
                </div>
            `;
            return;
        }

        const curUid = state.currentUser?.uid || window.currentUser?.uid;
        const topItems = state.studentHomework.slice(0, 3);
        container.innerHTML = topItems.map(hw => {
            const isDef = !!(hw.defaultersReviewed && hw.defaulters && hw.defaulters[curUid]);
            const dueMeta = getStudentHwDueMeta(hw.dueDate, hw.dueTime);

            return `
                <div class="ov-hw-item" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:${isDef ? '#fef2f2' : 'var(--sp-bg-main)'}; border:1px solid ${isDef ? '#fecaca' : 'var(--sp-border)'}; border-radius:10px; cursor:pointer;" onclick="switchStudentTab('tab-homework')">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <div class="ov-hw-icon" style="width:34px; height:34px; border-radius:8px; background:${isDef ? '#fee2e2' : 'var(--sp-primary-light)'}; color:${isDef ? '#dc2626' : 'var(--sp-primary)'}; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;">
                            <i class="${isDef ? 'fas fa-triangle-exclamation' : 'fas fa-book-open'}"></i>
                        </div>
                        <div style="min-width:0;">
                            <div style="font-weight:700; font-size:0.83rem; color:${isDef ? '#991b1b' : 'var(--sp-text-main)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(hw.title)}
                            </div>
                            <div style="font-size:0.72rem; color:${isDef ? '#b91c1c' : 'var(--sp-text-muted)'};">
                                <span style="font-weight:600; color:${isDef ? '#b91c1c' : 'var(--sp-primary)'};">${escapeHtml(hw.subject || 'Subject')}</span> • ${escapeHtml(hw.teacherName || 'Teacher')}
                            </div>
                        </div>
                    </div>
                    <span class="ov-hw-badge ${isDef ? 'danger' : dueMeta.cls}" style="font-size:0.68rem; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; ${isDef ? 'background:#dc2626; color:#ffffff;' : (dueMeta.isUrgent ? 'background:#fee2e2; color:#b91c1c;' : 'background:var(--sp-bg-card); color:var(--sp-text-muted); border:1px solid var(--sp-border);')}">
                        ${isDef ? 'Incomplete' : dueMeta.label}
                    </span>
                </div>
            `;
        }).join('');
    }

    function renderStudentHomework() {
        const grid = document.getElementById('hw-cards-grid');
        if (!grid) return;

        try {
            const user = state.currentUser || {};
            const curUid = user.uid || window.currentUser?.uid;
            const className = user.courseName || user.className || 'My Class';
            const section = normSectionVal(user.section || user.classSection || 'A');

            const defaulterCount = state.studentHomework.filter(h => h.defaultersReviewed && h.defaulters && h.defaulters[curUid]).length;
            const activeCount = state.studentHomework.length - defaulterCount;

            // Update hero labels
            const classPill = document.getElementById('hw-hero-class-pill');
            const countPill = document.getElementById('hw-hero-count-pill');
            const subtitle = document.getElementById('hw-class-subtitle');

            if (classPill) classPill.innerHTML = `<i class="fas fa-chalkboard"></i> ${escapeHtml(className)} • Sec ${escapeHtml(section)}`;
            if (countPill) {
                if (defaulterCount > 0) {
                    countPill.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${defaulterCount} Incomplete${activeCount > 0 ? ` • ${activeCount} Active` : ''}`;
                    countPill.style.background = '#fee2e2';
                    countPill.style.color = '#b91c1c';
                    countPill.style.borderColor = '#fca5a5';
                } else {
                    countPill.innerHTML = `<i class="fas fa-layer-group"></i> ${state.studentHomework.length} Active Tasks`;
                    countPill.style.background = 'var(--sp-primary-light)';
                    countPill.style.color = 'var(--sp-primary)';
                    countPill.style.borderColor = 'transparent';
                }
            }
            if (subtitle) {
                if (defaulterCount > 0) {
                    subtitle.textContent = `You have ${defaulterCount} incomplete homework assignment(s) marked by your subject teachers.`;
                } else if (state.studentHomework.length > 0) {
                    subtitle.textContent = `Active assignment reference cards for ${className} • Section ${section}.`;
                } else {
                    subtitle.textContent = `All caught up! No active or incomplete homework assignments for your class.`;
                }
            }

            // Dynamic Subject Chips
            const subjectsSet = new Set();
            state.studentHomework.forEach(hw => {
                if (hw.subject) subjectsSet.add(hw.subject);
            });
            renderSubjectChips(Array.from(subjectsSet));

            // Filter by search & subject
            const query = (state.hwSearchQuery || '').trim().toLowerCase();
            const activeSub = state.activeHwSubject || 'all';

            const filtered = state.studentHomework.filter(hw => {
                // Subject filter
                if (activeSub !== 'all' && (hw.subject || '').toLowerCase() !== activeSub.toLowerCase()) {
                    return false;
                }

                // Search query
                if (query) {
                    const combined = `${hw.title} ${hw.subject} ${hw.description} ${hw.teacherName} ${hw.note || ''}`.toLowerCase();
                    if (!combined.includes(query)) return false;
                }

                return true;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="hw-empty-state">
                        <div class="hw-empty-icon" style="background:#dcfce7; color:#166534;"><i class="fas fa-circle-check"></i></div>
                        <h3>All Caught Up!</h3>
                        <p>${state.studentHomework.length === 0 ? "You have no active or incomplete homework assignments for your class." : "No homework matches your selected subject or search filter."}</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = filtered.map(hw => {
                const isDefaulter = !!(hw.defaultersReviewed && hw.defaulters && hw.defaulters[curUid]);
                const dueMeta = getStudentHwDueMeta(hw.dueDate, hw.dueTime);
                const displayDue = formatDisplayDate(hw.dueDate, hw.dueTime);

                // DEFAULTER CARD: Red border, "You have not completed this homework" banner, NO buttons (detail only)
                if (isDefaulter) {
                    return `
                        <div class="hw-card hw-card-defaulter" data-id="${hw.id}" style="border: 2px solid #ef4444; background: #fffcfc; border-radius: 14px; box-shadow: 0 4px 16px rgba(239, 68, 68, 0.12); padding: 18px 20px;">
                            <div class="hw-card-top">
                                <div class="hw-badge-subject">
                                    <i class="fas fa-book"></i> ${escapeHtml(hw.subject || 'Subject')}
                                </div>
                                <span class="hw-tag-status danger" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:800; font-size:0.75rem;">
                                    <i class="fas fa-triangle-exclamation"></i> Incomplete / Defaulter
                                </span>
                            </div>

                            <div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:10px 14px; border-radius:8px; font-weight:700; font-size:0.85rem; display:flex; align-items:center; gap:8px; margin: 12px 0;">
                                <i class="fas fa-circle-xmark" style="color:#dc2626; font-size:1.15rem; flex-shrink:0;"></i>
                                <span>You have not completed this homework</span>
                            </div>

                            <h3 class="hw-card-title">${escapeHtml(hw.title)}</h3>
                            
                            <div class="hw-card-meta-row">
                                <span class="hw-meta-item"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(hw.teacherName || 'Subject Teacher')}</span>
                                <span class="hw-meta-item"><i class="fas fa-calendar-xmark" style="color:#dc2626;"></i> Deadline was: ${displayDue}</span>
                            </div>

                            <div class="hw-card-desc">${escapeHtml(hw.description)}</div>

                            ${hw.note ? `
                                <div class="hw-card-note">
                                    <i class="fas fa-circle-info"></i> <strong>Note:</strong> ${escapeHtml(hw.note)}
                                </div>
                            ` : ''}

                            <div class="hw-card-footer" style="padding-top:12px; border-top:1px dashed #fecaca; font-size:0.76rem; color:#dc2626; font-weight:600; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-circle-info"></i> Detail Reference Card • Please submit your pending homework to your teacher.
                            </div>
                        </div>
                    `;
                }

                // ACTIVE CARD: Normal detail reference card, NO buttons
                return `
                    <div class="hw-card hw-card-active" data-id="${hw.id}">
                        <div class="hw-card-top">
                            <div class="hw-badge-subject">
                                <i class="fas fa-book"></i> ${escapeHtml(hw.subject || 'Subject')}
                            </div>
                            <span class="hw-tag-status ${dueMeta.cls}">
                                ${dueMeta.label}
                            </span>
                        </div>

                        <h3 class="hw-card-title">${escapeHtml(hw.title)}</h3>
                        
                        <div class="hw-card-meta-row">
                            <span class="hw-meta-item"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(hw.teacherName || 'Subject Teacher')}</span>
                            <span class="hw-meta-item"><i class="fas fa-calendar-check"></i> Due: ${displayDue}</span>
                        </div>

                        <div class="hw-card-desc">${escapeHtml(hw.description)}</div>

                        ${hw.note ? `
                            <div class="hw-card-note">
                                <i class="fas fa-circle-info"></i> <strong>Note:</strong> ${escapeHtml(hw.note)}
                            </div>
                        ` : ''}

                        <div class="hw-card-footer" style="padding-top:10px; border-top:1px solid var(--sp-border); color:var(--sp-text-muted); font-size:0.75rem; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-circle-info" style="color:var(--sp-primary);"></i> Assigned task reference. Submit your work in class before the due date.
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Error rendering student homework:', err);
        }
    }
    window.renderStudentHomework = renderStudentHomework;

    function renderSubjectChips(subjects) {
        const container = document.getElementById('hw-subject-chips-bar');
        if (!container) return;

        // Preserve "All Subjects" chip
        let html = `
            <button type="button" class="hw-subject-chip ${state.activeHwSubject === 'all' ? 'active' : ''}" data-subject="all">
                <i class="fas fa-shapes"></i> All Subjects
            </button>
        `;

        subjects.forEach(sub => {
            const isActive = state.activeHwSubject.toLowerCase() === sub.toLowerCase();
            html += `
                <button type="button" class="hw-subject-chip ${isActive ? 'active' : ''}" data-subject="${escapeHtml(sub)}">
                    <i class="fas fa-book"></i> ${escapeHtml(sub)}
                </button>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.hw-subject-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                state.activeHwSubject = chip.getAttribute('data-subject');
                renderStudentHomework();
            });
        });
    }

    function setupStudentHomeworkControls() {
        const searchInput = document.getElementById('hw-search-input');
        if (searchInput && searchInput.dataset.bound !== 'true') {
            searchInput.dataset.bound = 'true';
            searchInput.addEventListener('input', (e) => {
                state.hwSearchQuery = e.target.value;
                renderStudentHomework();
            });
        }

        const filterBtns = document.querySelectorAll('.hw-status-btn');
        filterBtns.forEach(btn => {
            if (btn.dataset.bound === 'true') return;
            btn.dataset.bound = 'true';
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeHwFilter = btn.getAttribute('data-hw-filter');
                renderStudentHomework();
            });
        });
    }

    async function toggleStudentHomework(hwId) {
        if (!state.currentUser?.uid || !hwId) return;
        const uid = state.currentUser.uid;
        const currentlyDone = !!state.completedHomeworkMap[hwId];
        const newStatus = !currentlyDone;

        // Optimistic UI update
        if (newStatus) {
            state.completedHomeworkMap[hwId] = {
                completed: true,
                completedAt: Date.now()
            };
        } else {
            delete state.completedHomeworkMap[hwId];
        }

        try {
            const localCacheKey = `rollcall_hw_completed_${uid}`;
            localStorage.setItem(localCacheKey, JSON.stringify(state.completedHomeworkMap));
        } catch (e) {}

        renderStudentHomework();
        renderOverviewHomeworkWidget();
        updateHomeworkNavBadges();

        if (window.showModernToast) {
            window.showModernToast(newStatus ? 'Marked as completed!' : 'Marked as pending', 'success');
        }

        // Persist to RTDB
        if (window.firebase?.database) {
            const db = firebase.database();
            if (newStatus) {
                await db.ref(`studentHomeworkStatus/${uid}/${hwId}`).set({
                    completed: true,
                    completedAt: firebase.database.ServerValue.TIMESTAMP
                });
            } else {
                await db.ref(`studentHomeworkStatus/${uid}/${hwId}`).remove();
            }
        }
    }

    /* ==========================================================================
       Student Portal - Tests & Assessment Scores Module
       Realtime RTDB synchronization, score formatting, color-coding & filters
       ========================================================================== */
    let studentScoresCache = {}; // testId -> scoreRecord
    let schoolTestsCache = {};   // testId -> testMeta

    function normSecVal(sec) {
        if (!sec) return '';
        let s = String(sec).trim().toUpperCase();
        s = s.replace(/^(SECTION|SEC\.?)\s*[-:]?\s*/i, '').trim();
        const m = s.match(/^[A-Z0-9]+/);
        return m ? m[0] : s;
    }

    function extractStudentSection(st) {
        if (!st) return '';
        const direct = [st.section, st.classSection, st.assignedSection, st.sec, st.studentSection, st.batch];
        for (const f of direct) {
            const val = normSecVal(f);
            if (val) return val;
        }
        const nameFields = [st.className, st.courseName, st.class, st.course, st.assignedClass, st.fullClass];
        for (const name of nameFields) {
            if (!name) continue;
            const str = String(name).trim();
            const mSec = str.match(/(?:section|sec)[\s.:_-]*([a-z0-9]+)/i);
            if (mSec && mSec[1]) return normSecVal(mSec[1]);
            const mParen = str.match(/[\(\[\{]([a-z0-9]+)[\)\]\}]/i);
            if (mParen && mParen[1]) return normSecVal(mParen[1]);
            const mDash = str.match(/(?:\d+|[a-z]+)\s*[-_]\s*([a-z0-9])\b/i);
            if (mDash && mDash[1]) return normSecVal(mDash[1]);
            const mGradeLetter = str.match(/\b(?:\d+|x|xi|xii|ix|viii|vii|vi|v|iv|iii|ii|i)\s+([a-z])\b/i);
            if (mGradeLetter && mGradeLetter[1]) return normSecVal(mGradeLetter[1]);
        }
        return '';
    }

    function getUnifiedStudentUser() {
        const u = {
            ...(window.currentUser || {}),
            ...(state.currentUser || {})
        };
        try {
            if (u.uid && typeof getCachedUserData === 'function') {
                const cached = getCachedUserData(u.uid);
                if (cached) Object.assign(u, cached);
            }
        } catch (e) {}
        return u;
    }

    function isStudentMatchingTest(st, test) {
        if (!st || !test) return false;
        const testSec = normSecVal(test.section || test.normSection);
        const stSec = extractStudentSection(st);

        // 1. Strict Section Isolation:
        // If test specifies a section and it is not 'ALL'
        if (testSec && testSec !== 'ALL') {
            // Student must strictly match this section
            if (!stSec || stSec !== testSec) {
                return false;
            }
        } else if (stSec && testSec && testSec !== 'ALL' && stSec !== testSec) {
            return false;
        }

        // 2. Direct Class / Course ID matching
        const stClassId = String(st.classId || st.enrolledClassId || st.courseId || '').toLowerCase().trim();
        const testClassId = String(test.classId || test.courseId || '').toLowerCase().trim();
        if (stClassId && testClassId && stClassId === testClassId) return true;

        // 3. Class Name matching
        const stNames = [st.className, st.courseName, st.course, st.class, st.assignedClass].filter(Boolean).map(x => String(x).toLowerCase().trim());
        const testName = String(test.className || test.courseName || '').toLowerCase().trim();

        if (testName && stNames.length > 0) {
            const testGrade = extractGradeNumber(testName);
            for (const name of stNames) {
                if (name === testName || name.includes(testName) || testName.includes(name)) {
                    return true;
                }
                if (testGrade) {
                    const stGrade = extractGradeNumber(name);
                    if (stGrade && stGrade === testGrade) {
                        return true;
                    }
                }
            }
        }

        if (!testName && !testClassId && testSec && stSec && testSec === stSec) return true;
        return false;
    }

    function initStudentTestsSync(user) {
        if (!user || !window.firebase?.database) return;
        const db = firebase.database();
        const schoolId = user.schoolId || state.currentUser?.schoolId || window.currentUser?.schoolId;

        if (!schoolId) {
            if (user.uid) {
                db.ref(`users/${user.uid}/schoolId`).once('value', snap => {
                    const sid = snap.val();
                    if (sid) {
                        if (state.currentUser) state.currentUser.schoolId = sid;
                        initStudentTestsSync({ ...user, schoolId: sid });
                    }
                });
            }
            return;
        }

        const uid = user.uid;

        // 1. Sync student's personal scores from schoolStudentScores/${schoolId}/${uid}
        db.ref(`schoolStudentScores/${schoolId}/${uid}`).on('value', snap => {
            studentScoresCache = snap.val() || {};
            rebuildStudentTestsList();
        });

        // 2. Sync all school tests from schoolTests/${schoolId} (captures upcoming scheduled tests)
        db.ref(`schoolTests/${schoolId}`).on('value', snap => {
            schoolTestsCache = snap.val() || {};
            rebuildStudentTestsList();
        });
    }
    window.initStudentTestsSync = initStudentTestsSync;

    function rebuildStudentTestsList() {
        const student = getUnifiedStudentUser();
        const combined = new Map();

        // 1. Process matching school tests
        Object.entries(schoolTestsCache).forEach(([id, test]) => {
            if (isStudentMatchingTest(student, test)) {
                combined.set(id, {
                    testId: id,
                    title: test.title || `${test.subject || 'Class'} Test`,
                    classId: test.classId || '',
                    className: test.className || '',
                    section: test.section || '',
                    subject: test.subject || 'General Assessment',
                    maxMarks: parseFloat(test.maxMarks) || 50,
                    marksObtained: null,
                    isAbsent: false,
                    testDate: test.testDate || '',
                    teacherName: test.teacherName || 'Faculty',
                    isFuture: !!test.isFuture || (test.testDate > getTodayDateString()),
                    status: test.status || 'scheduled'
                });
            }
        });

        // 2. Merge personal scores (overrides with actual marks obtained / absent status)
        Object.entries(studentScoresCache).forEach(([id, score]) => {
            const testMeta = schoolTestsCache[id] || score;
            // Strict section & class isolation: do not display if not matching this student
            if (!isStudentMatchingTest(student, testMeta)) {
                return;
            }

            const existing = combined.get(id) || {};
            combined.set(id, {
                ...existing,
                testId: id,
                title: score.title || existing.title || 'Assessment Test',
                classId: score.classId || existing.classId || '',
                className: score.className || existing.className || '',
                section: score.section || existing.section || '',
                subject: score.subject || existing.subject || 'General Assessment',
                maxMarks: parseFloat(score.maxMarks || existing.maxMarks) || 50,
                marksObtained: (score.marksObtained !== null && score.marksObtained !== undefined) ? parseFloat(score.marksObtained) : null,
                isAbsent: !!score.isAbsent,
                testDate: score.testDate || existing.testDate || '',
                teacherName: score.teacherName || existing.teacherName || 'Faculty',
                isFuture: !!score.isFuture || (score.testDate > getTodayDateString())
            });
        });

        const list = Array.from(combined.values());

        // Sort: Upcoming assessments first (ascending date), then past/scored (descending date)
        const today = getTodayDateString();
        list.sort((a, b) => {
            const aUpcoming = (a.isFuture || a.testDate > today) && a.marksObtained === null && !a.isAbsent;
            const bUpcoming = (b.isFuture || b.testDate > today) && b.marksObtained === null && !b.isAbsent;
            if (aUpcoming && !bUpcoming) return -1;
            if (!aUpcoming && bUpcoming) return 1;
            if (aUpcoming && bUpcoming) {
                return String(a.testDate || '').localeCompare(String(b.testDate || ''));
            }
            return String(b.testDate || '').localeCompare(String(a.testDate || ''));
        });

        state.studentTests = list;
        renderStudentTests();
        renderOverviewTestsWidget();
        updateTestsNavBadges();
    }

    function renderStudentTests() {
        const grid = document.getElementById('st-test-cards-grid');
        if (!grid) return;

        const tests = state.studentTests || [];
        const today = getTodayDateString();

        // Extract distinct subjects
        const subjects = new Set();
        tests.forEach(t => {
            if (t.subject) subjects.add(t.subject.trim());
        });
        renderTestSubjectChips(Array.from(subjects));

        // Filter tests
        const searchQ = (state.studentTestsSearch || '').toLowerCase().trim();
        const activeSub = (state.studentTestsSubject || 'all').toLowerCase();
        const activeFilter = state.studentTestsFilter || 'all';

        const filtered = tests.filter(test => {
            const isScored = test.marksObtained !== null || test.isAbsent;
            const isUpcoming = (test.isFuture || test.testDate > today) && !isScored;

            if (activeFilter === 'upcoming' && !isUpcoming) return false;
            if (activeFilter === 'scored' && !isScored) return false;

            if (activeSub !== 'all' && String(test.subject || '').toLowerCase() !== activeSub) {
                return false;
            }

            if (searchQ) {
                const title = String(test.title || '').toLowerCase();
                const subj = String(test.subject || '').toLowerCase();
                const teacher = String(test.teacherName || '').toLowerCase();
                if (!title.includes(searchQ) && !subj.includes(searchQ) && !teacher.includes(searchQ)) {
                    return false;
                }
            }

            return true;
        });

        // Compute performance stats
        let totalScoredMarks = 0;
        let totalMaxMarks = 0;
        let scoredCount = 0;

        tests.forEach(t => {
            if (t.marksObtained !== null && !t.isAbsent) {
                totalScoredMarks += t.marksObtained;
                totalMaxMarks += t.maxMarks;
                scoredCount++;
            }
        });

        const avgPill = document.getElementById('st-test-avg-pill');
        const countPill = document.getElementById('st-test-count-pill');
        if (avgPill) {
            if (totalMaxMarks > 0) {
                const avgPct = Math.round((totalScoredMarks / totalMaxMarks) * 100);
                avgPill.innerHTML = `<i class="fas fa-chart-line"></i> ${avgPct}% Avg`;
                avgPill.className = `st-test-pill ${avgPct >= 75 ? 'st-test-pill-avg' : (avgPct >= 40 ? 'st-score-badge average' : 'st-score-badge low')}`;
            } else {
                avgPill.innerHTML = '<i class="fas fa-chart-line"></i> -- % Avg';
            }
        }
        if (countPill) {
            countPill.innerHTML = `<i class="fas fa-layer-group"></i> ${tests.length} Tests`;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="st-test-loading-state">
                    <i class="fas fa-clipboard-check" style="font-size:2rem; color:var(--sp-text-muted); margin-bottom:10px; display:block;"></i>
                    <h4 style="margin:0 0 6px 0; color:var(--sp-text-main);">No test assessments found</h4>
                    <p style="margin:0; font-size:0.84rem;">${tests.length === 0 ? 'Your subject teachers have not posted any tests or scores yet.' : 'No tests match your selected filter or search.'}</p>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(test => {
            const isScored = test.marksObtained !== null;
            const isAbsent = test.isAbsent;
            const isFuture = (test.isFuture || test.testDate > today) && !isScored && !isAbsent;

            // Score badge & color coding
            let scoreNumHtml = '';
            let scoreBadgeHtml = '';

            if (isAbsent) {
                scoreNumHtml = `<span class="st-score-num" style="color:#7e22ce;">AB</span> <span class="st-score-total">/ ${test.maxMarks}</span>`;
                scoreBadgeHtml = `<span class="st-score-badge absent"><i class="fas fa-user-xmark"></i> Absent</span>`;
            } else if (isScored) {
                const pct = Math.round((test.marksObtained / test.maxMarks) * 100);
                let badgeClass = 'excellent';
                let label = 'Distinction';
                let icon = 'fa-circle-check';

                if (pct >= 75) {
                    badgeClass = 'excellent';
                    label = `${pct}% Distinction`;
                    icon = 'fa-circle-check';
                } else if (pct >= 40) {
                    badgeClass = 'average';
                    label = `${pct}% Pass`;
                    icon = 'fa-check';
                } else {
                    badgeClass = 'low';
                    label = `${pct}% Needs Imp.`;
                    icon = 'fa-triangle-exclamation';
                }

                scoreNumHtml = `<span class="st-score-num">${test.marksObtained}</span> <span class="st-score-total">/ ${test.maxMarks}</span>`;
                scoreBadgeHtml = `<span class="st-score-badge ${badgeClass}"><i class="fas ${icon}"></i> ${label}</span>`;
            } else {
                scoreNumHtml = `<span class="st-score-num" style="color:#0284c7;">--</span> <span class="st-score-total">/ ${test.maxMarks}</span>`;
                scoreBadgeHtml = `<span class="st-score-badge upcoming"><i class="fas fa-clock"></i> Upcoming</span>`;
            }

            // Date formatting
            const dateBadge = `<span class="st-test-date-badge"><i class="fas fa-calendar-day"></i> ${test.testDate || 'Scheduled'}</span>`;

            html += `
                <div class="st-test-card" id="stTestCard_${test.testId}">
                    <div>
                        <div class="st-test-card-top">
                            <span class="st-test-subject-badge">${escapeHtml(test.subject)}</span>
                            ${dateBadge}
                        </div>
                        <h3 class="st-test-title">${escapeHtml(test.title)}</h3>
                        <div class="st-test-meta-line">
                            <i class="fas fa-chalkboard-user"></i> Faculty: <strong>${escapeHtml(test.teacherName)}</strong>
                        </div>
                    </div>
                    <div class="st-test-score-row">
                        <div class="st-test-score-vals">
                            ${scoreNumHtml}
                        </div>
                        ${scoreBadgeHtml}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }
    window.renderStudentTests = renderStudentTests;

    function renderTestSubjectChips(subjects) {
        const container = document.getElementById('st-test-subject-chips');
        if (!container) return;

        let html = `
            <button type="button" class="st-test-chip ${state.studentTestsSubject === 'all' ? 'active' : ''}" data-subject="all">
                <i class="fas fa-shapes"></i> All Subjects
            </button>
        `;

        subjects.forEach(sub => {
            const isActive = state.studentTestsSubject.toLowerCase() === sub.toLowerCase();
            html += `
                <button type="button" class="st-test-chip ${isActive ? 'active' : ''}" data-subject="${escapeHtml(sub)}">
                    <i class="fas fa-book"></i> ${escapeHtml(sub)}
                </button>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.st-test-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                container.querySelectorAll('.st-test-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.studentTestsSubject = chip.getAttribute('data-subject') || 'all';
                renderStudentTests();
            });
        });
    }

    function renderOverviewTestsWidget() {
        const container = document.getElementById('overview-tests-list');
        if (!container) return;

        const tests = state.studentTests || [];
        if (tests.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:16px; color:var(--sp-text-muted); font-size:0.80rem;">
                    <i class="fas fa-clipboard-check" style="color:var(--sp-primary); margin-bottom:4px; display:block; font-size:1.1rem;"></i>
                    No tests or assessment scores posted yet.
                </div>
            `;
            return;
        }

        const today = getTodayDateString();
        const displayList = tests.slice(0, 3);

        let html = '';
        displayList.forEach(t => {
            const isScored = t.marksObtained !== null;
            const isAbsent = t.isAbsent;
            const isFuture = (t.isFuture || t.testDate > today) && !isScored && !isAbsent;

            let badgeHtml = '';
            if (isAbsent) {
                badgeHtml = `<span class="st-score-badge absent" style="padding:2px 7px; font-size:0.70rem;">AB / ${t.maxMarks}</span>`;
            } else if (isScored) {
                const pct = Math.round((t.marksObtained / t.maxMarks) * 100);
                const cls = pct >= 75 ? 'excellent' : (pct >= 40 ? 'average' : 'low');
                badgeHtml = `<span class="st-score-badge ${cls}" style="padding:2px 7px; font-size:0.70rem;">${t.marksObtained}/${t.maxMarks} (${pct}%)</span>`;
            } else {
                badgeHtml = `<span class="st-score-badge upcoming" style="padding:2px 7px; font-size:0.70rem;">Upcoming • /${t.maxMarks}</span>`;
            }

            html += `
                <div class="ov-test-item" onclick="window.switchStudentTab('tab-tests')">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.82rem; font-weight:700; color:var(--sp-text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHtml(t.title)}
                        </div>
                        <div style="font-size:0.72rem; color:var(--sp-text-muted); display:flex; align-items:center; gap:6px;">
                            <span style="font-weight:600; color:#0284c7;">${escapeHtml(t.subject)}</span> • <span>${t.testDate || 'Scheduled'}</span>
                        </div>
                    </div>
                    <div style="flex-shrink:0;">
                        ${badgeHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }
    window.renderOverviewTestsWidget = renderOverviewTestsWidget;

    function updateTestsNavBadges() {
        const tests = state.studentTests || [];
        const today = getTodayDateString();
        const upcomingCount = tests.filter(t => (t.isFuture || t.testDate >= today) && t.marksObtained === null && !t.isAbsent).length;

        const navBadge = document.getElementById('nav-tests-badge');
        const mobBadge = document.getElementById('mobile-tests-badge');

        [navBadge, mobBadge].forEach(badge => {
            if (!badge) return;
            if (upcomingCount > 0) {
                badge.textContent = upcomingCount > 99 ? '99+' : upcomingCount;
                badge.style.display = 'inline-flex';
                badge.style.background = '#0284c7';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    function initStudentTestsControls() {
        const searchInput = document.getElementById('st-test-search-input');
        if (searchInput && searchInput.dataset.bound !== 'true') {
            searchInput.dataset.bound = 'true';
            searchInput.addEventListener('input', (e) => {
                state.studentTestsSearch = e.target.value;
                renderStudentTests();
            });
        }

        const filterBtns = document.querySelectorAll('.st-test-status-btn');
        filterBtns.forEach(btn => {
            if (btn.dataset.bound === 'true') return;
            btn.dataset.bound = 'true';
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.studentTestsFilter = btn.getAttribute('data-filter') || 'all';
                renderStudentTests();
            });
        });
    }

    function loadFirebaseNotifications() {
        const container = document.getElementById('notifications-container');
        const badge = document.getElementById('notification-badge');
        if (!window.firebase?.database) return;

        const db = firebase.database();
        const uid = state.currentUser?.uid;

        const promises = [
            db.ref('notifications').limitToLast(25).once('value')
        ];
        if (uid) {
            promises.push(db.ref(`notifications/${uid}`).limitToLast(25).once('value'));
        }

        Promise.all(promises).then((snapshots) => {
            const items = [];
            const seenKeys = new Set();

            snapshots.forEach(snap => {
                const data = snap.val() || {};
                Object.keys(data).forEach(k => {
                    const n = data[k];
                    if (!n || seenKeys.has(k)) return;
                    seenKeys.add(k);
                    items.push({
                        id: k,
                        title: n.title || 'Notification',
                        desc: n.message || n.body || n.text || '',
                        timestamp: n.timestamp || (n.date ? new Date(n.date).getTime() : 0),
                        sender: n.sentByEmail || n.sentBy || 'System Alert',
                        type: n.type || 'info',
                        category: n.category || 'Notification'
                    });
                });
            });

            // Update badge count
            if (badge) {
                const count = items.length;
                badge.innerText = count > 99 ? '99+' : count;
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }

            if (!container) return;

            if (items.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 30px; color: var(--sp-text-muted);">
                        <i class="fas fa-bell-slash" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-text-subtle);"></i>
                        No notifications found.
                    </div>`;
                return;
            }

            items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            container.innerHTML = items.map(n => `
                <div class="drawer-item">
                    <div class="drawer-item-title">${getAnnouncementIcon(n.type, n.category)} ${n.title || 'Notification'}</div>
                    <div class="drawer-item-desc">${n.desc}</div>
                    <div class="drawer-item-time">${formatTimeAgo(n.timestamp)} • ${n.sender}</div>
                </div>
            `).join('');
        }).catch(err => {
            console.error('Error loading notifications:', err);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 30px; color: var(--sp-text-muted);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-warning);"></i>
                        Could not load notifications.
                    </div>`;
            }
        });
    }
    window.loadFirebaseNotifications = loadFirebaseNotifications;

    /* ==========================================================================
       Subject-wise Analytics & Health Matrix (From RTDB Data)
       ========================================================================== */
    function renderSubjectAnalytics() {
        const container = document.getElementById('subject-health-container');
        if (!container) return;

        const subjects = state.subjectStats || {};
        const keys = Object.keys(subjects);

        if (keys.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 28px; color: var(--sp-text-muted);">
                    <i class="fas fa-chart-pie" style="font-size: 2.2rem; margin-bottom: 10px; display: block; color: var(--sp-primary);"></i>
                    Attendance analytics will appear here once attendance records are logged.
                </div>`;
            return;
        }

        container.innerHTML = keys.map(name => {
            const s = subjects[name];
            const pct = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0;
            const statusClass = pct >= 75 ? 'progress-safe' : pct >= 65 ? 'progress-warning' : 'progress-danger';
            return `
                <div class="subject-health-row">
                    <div class="subject-health-header">
                        <span>${name}</span>
                        <span><strong>${pct}%</strong> (${s.attended}/${s.total})</span>
                    </div>
                    <div class="health-progress-track">
                        <div class="health-progress-bar ${statusClass}" style="width: ${pct}%"></div>
                    </div>
                </div>`;
        }).join('');
    }

    /* ==========================================================================
       Bunk & Recovery Calculator
       ========================================================================== */
    function initBunkCalculator() {
        const slider = document.getElementById('bunk-sim-slider');
        const sliderVal = document.getElementById('bunk-sim-val');
        const verdictBox = document.getElementById('bunk-verdict-card');
        const subjectSelect = document.getElementById('bunk-subject-select');

        function calculateBunk() {
            if (!slider || !sliderVal || !verdictBox) return;
            const skipCount = parseInt(slider.value) || 0;
            sliderVal.innerText = skipCount;

            const selected = subjectSelect ? subjectSelect.value : 'all';
            let attended = state.overallStats.attended;
            let total = state.overallStats.total;

            if (selected !== 'all' && state.subjectStats[selected]) {
                attended = state.subjectStats[selected].attended;
                total = state.subjectStats[selected].total;
            }

            if (total === 0) {
                verdictBox.className = 'bunk-verdict-card';
                verdictBox.innerHTML = `
                    <i class="fas fa-circle-info" style="font-size: 1.5rem;"></i>
                    <div>
                        <div>No classes recorded yet.</div>
                        <div style="font-size: 0.8rem; opacity: 0.85;">Simulator will calculate dynamically once attendance data is available.</div>
                    </div>`;
                return;
            }

            const newTotal = total + skipCount;
            const newPercentage = Math.round((attended / newTotal) * 100);

            if (newPercentage >= 75) {
                verdictBox.className = 'bunk-verdict-card';
                verdictBox.innerHTML = `
                    <i class="fas fa-circle-check" style="font-size: 1.5rem;"></i>
                    <div>
                        <div>Attendance after skipping <strong>${skipCount}</strong> classes: <strong>${newPercentage}%</strong></div>
                        <div style="font-size: 0.8rem; opacity: 0.85;">Safe zone! You stay above the mandatory 75% threshold.</div>
                    </div>`;
            } else {
                verdictBox.className = 'bunk-verdict-card danger';
                const deficit = Math.ceil((0.75 * newTotal - attended) / 0.25);
                verdictBox.innerHTML = `
                    <i class="fas fa-triangle-exclamation" style="font-size: 1.5rem;"></i>
                    <div>
                        <div>Attendance after skipping <strong>${skipCount}</strong> classes: <strong>${newPercentage}%</strong></div>
                        <div style="font-size: 0.8rem; opacity: 0.85;">Warning: Drops below 75%! You must attend <strong>${Math.max(1, deficit)}</strong> consecutive classes to recover.</div>
                    </div>`;
            }
        }

        if (slider) slider.addEventListener('input', calculateBunk);
        if (subjectSelect) subjectSelect.addEventListener('change', calculateBunk);
    }

    function updateBunkPredictorOptions() {
        const select = document.getElementById('bunk-subject-select');
        if (!select) return;
        const subjects = Object.keys(state.subjectStats || {});

        select.innerHTML = '<option value="all">Overall Aggregate (All Subjects)</option>' +
            subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    /* ==========================================================================
       Leave & OD Portal (Direct RTDB Sync)
       ========================================================================== */
    function initLeavePortal() {
        const form = document.getElementById('leave-request-form');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!state.currentUser || !window.firebase?.database) {
                    showModernToast('Please sign in to submit leave requests.', 'warning');
                    return;
                }

                const type = document.getElementById('leave-type')?.value;
                const from = document.getElementById('leave-from')?.value;
                const to = document.getElementById('leave-to')?.value;
                const reason = document.getElementById('leave-reason')?.value;

                if (!from || !to || !reason) {
                    showModernToast('Please fill all required fields.', 'warning');
                    return;
                }

                const uid = state.currentUser.uid;
                const db = firebase.database();
                try {
                    const profileSnap = await db.ref(`users/${uid}`).once('value');
                    const profile = profileSnap.val() || {};
                    const schoolId = profile.schoolId || state.currentUser.schoolId || '';
                    const section = String(profile.section || state.currentUser.section || '').trim();
                    const sectionKey = Array.from(new TextEncoder().encode(section), byte => byte.toString(16).padStart(2, '0')).join('');
                    if (profile.role !== 'student' || !schoolId || !section) throw new Error('Your school and section must be set on your student profile.');
                    const teacherSnap = await db.ref(`classTeacherAssignments/${schoolId}/${sectionKey}`).once('value');
                    const assignment = teacherSnap.val() || {};
                    if (!assignment.teacherId || assignment.schoolId !== schoolId || String(assignment.section || '').trim().toLowerCase() !== section.toLowerCase()) throw new Error('No class teacher is assigned to your section yet. Please contact your school administrator.');

                    const requestId = db.ref(`leave_requests/${uid}`).push().key;
                    const createdAt = Date.now();
                    const newReq = {
                        type, from, to, reason,
                        status: 'Pending Review', createdAt,
                        requesterRole: 'student', schoolId, section,
                        classTeacherId: assignment.teacherId,
                        studentName: profile.name || state.currentUser.name || 'Student',
                        studentRoll: profile.univRoll || state.currentUser.univRoll || ''
                    };
                    const updates = {};
                    updates[`leave_requests/${uid}/${requestId}`] = newReq;
                    updates[`classTeacherLeaveRequests/${assignment.teacherId}/${requestId}`] = { requestId, studentId: uid, schoolId, section, createdAt, status: 'Pending Review' };
                    updates[`notifications/${assignment.teacherId}/${db.ref(`notifications/${assignment.teacherId}`).push().key}`] = {
                        title: 'Student leave request',
                        message: `${newReq.studentName} submitted a ${type} request for section ${section} (${from} to ${to}).`,
                        type: 'info', category: 'Leave request', senderRole: 'student', senderId: uid, schoolId, section, timestamp: createdAt
                    };
                    await db.ref().update(updates);
                    form.reset();
                    showModernToast(`Leave application sent to your class teacher for section ${section}.`, 'success');
                } catch (err) {
                    showModernToast('Submission error: ' + err.message, 'error');
                }
            });
        }
    }

    function renderLeaveRequests() {
        const listContainer = document.getElementById('leave-history-list');
        const kpiLeaves = document.getElementById('kpi-leaves-taken');
        if (!listContainer) return;

        const requests = state.leaveRequests || [];
        const approvedCount = requests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
        if (kpiLeaves) kpiLeaves.innerText = `${approvedCount} Days`;

        if (requests.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 28px; color: var(--sp-text-muted);">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 8px; display: block; color: var(--sp-text-subtle);"></i>
                    No leave requests submitted yet.
                </div>`;
            return;
        }

        listContainer.innerHTML = requests.map(item => {
            const statusLower = (item.status || '').toLowerCase();
            const badgeClass = statusLower === 'approved' ? 'tag-present' : statusLower === 'rejected' ? 'tag-absent' : 'tag-upcoming';
            return `
                <div class="schedule-card-item">
                    <div class="schedule-details">
                        <div class="subject-name">${item.type}</div>
                        <div class="teacher-room">
                            <i class="fas fa-calendar-alt"></i> ${item.from} to ${item.to} • ${item.reason}
                        </div>
                    </div>
                    <div>
                        <span class="status-tag ${badgeClass}">${item.status || 'Pending'}</span>
                    </div>
                </div>`;
        }).join('');
    }

    /* ==========================================================================
       Digital Student ID (3D Flip Card from RTDB)
       ========================================================================== */
    function initDigitalIdCard() {
        const flipper = document.getElementById('student-id-flipper');
        const flipBtn = document.getElementById('flip-id-btn');

        function toggleFlip() {
            if (flipper) flipper.classList.toggle('flipped');
        }

        if (flipper) flipper.addEventListener('click', toggleFlip);
        if (flipBtn) flipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFlip();
        });
    }

    function renderDigitalId() {
        if (window.currentUser && (!state.currentUser || !state.currentUser.uid)) {
            state.currentUser = window.currentUser;
        }
        const user = (state.currentUser && state.currentUser.uid)
            ? state.currentUser
            : (window.currentUser || (window.firebase?.auth && firebase.auth().currentUser) || state.currentUser || {});
        const authUser = window.firebase?.auth && firebase.auth().currentUser;
        const isSchoolMode = window.rollCallStudentMode?.isSchoolMode?.() === true || state.schoolType === 'school';

        const nameEl = document.getElementById('id-card-name');
        const roleEl = document.getElementById('id-card-role');
        const rollEl = document.getElementById('id-card-roll');
        const univEl = document.getElementById('id-card-univ');
        const secEl = document.getElementById('id-card-sec');
        const photoEl = document.getElementById('id-card-photo');
        const validEl = document.getElementById('id-card-valid');
        const collegeEl = document.getElementById('id-card-college');
        const subtitleEl = document.getElementById('id-card-subtitle');
        const universityRollRow = document.getElementById('id-card-univ-row');
        const validThruRow = document.getElementById('id-card-valid-row');
        const institutionIcon = document.querySelector('.id-college-logo i');
        const codeValEl = document.getElementById('id-card-code-val');
        const bloodEl = document.getElementById('id-card-blood');
        const emergencyEl = document.getElementById('id-card-emergency');
        const qrContainer = document.getElementById('id-card-qr-container');

        // 1. Student Name & Photo
        const displayName = user.name || authUser?.displayName || (user.email ? user.email.split('@')[0] : 'Student');
        if (nameEl) nameEl.innerText = displayName;

        const defaultAvatar = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/person-1824144_960_720.png';
        if (photoEl) photoEl.src = user.profilePhoto || defaultAvatar;

        // 2. Program / Course / Branch
        const courseDisplay = isSchoolMode
            ? formatClassDisplay(user.className || user.courseName || user.course, 'School Student')
            : (user.course || user.department || user.branch || 'Undergraduate Student');
        if (roleEl) roleEl.innerText = courseDisplay;

        // 3. College / Institution / School Name
        const defaultInst = isSchoolMode ? 'ROLLCALL SCHOOL' : 'CAMPUS ACADEMY';
        const instName = user.schoolName || user.school || user.institutionName || user.institution || user.collegeName || defaultInst;
        if (collegeEl) collegeEl.innerText = String(instName).toUpperCase();

        // 4. University Roll & Class Roll
        if (univEl) univEl.innerText = user.univRoll || 'Not Set';
        if (universityRollRow) universityRollRow.hidden = isSchoolMode;
        if (validThruRow) validThruRow.hidden = isSchoolMode;
        if (subtitleEl) subtitleEl.innerText = isSchoolMode ? 'SCHOOL STUDENT ID' : 'STUDENT IDENTITY CARD';
        if (institutionIcon) {
            institutionIcon.classList.toggle('fa-school', isSchoolMode);
            institutionIcon.classList.toggle('fa-university', !isSchoolMode);
        }
        if (rollEl) rollEl.innerText = user.classRoll || 'Not Set';

        // 5. Section
        const cleanCardSec = String(user.section || '').replace(/^(sec|section)\s*/i, '').trim();
        if (secEl) secEl.innerText = cleanCardSec ? `Sec ${cleanCardSec}` : (user.section ? `Sec ${user.section}` : 'N/A');

        // 6. Valid Thru / Academic Batch
        let validThru = user.academicBatch || user.batch;
        if (validThru) {
            const match = String(validThru).match(/\d{4}$/);
            if (match) validThru = match[0];
        } else {
            validThru = (new Date().getFullYear() + 4).toString();
        }
        if (validEl) validEl.innerText = validThru;

        // 7. Encrypted Pass Identifier
        if (codeValEl) {
            codeValEl.innerText = user.univRoll || user.classRoll || (user.uid ? user.uid.slice(0, 10).toUpperCase() : 'ROLLCALL');
        }

        // 8. Back Face: Blood Group, Emergency Contact & Father Details
        if (bloodEl) bloodEl.innerText = user.bloodGroup || user.blood || 'Not Provided';
        if (emergencyEl) emergencyEl.innerText = user.emergencyContact || user.emergency || user.mobile || 'Not Provided';
        const fatherEl = document.getElementById('id-card-father');
        const fatherMobileEl = document.getElementById('id-card-father-mobile');
        const fatherName = user.fatherName || user.father_name || user.fathersName || user.father || user.guardianName || user.parentName || 'Not Provided';
        const fatherMobile = user.fatherMobile || user.fatherMobileNumber || user.fatherPhone || user.guardianMobile || user.guardianPhone || user.parentMobile || 'Not Provided';
        if (fatherEl) fatherEl.innerText = fatherName;
        if (fatherMobileEl) fatherMobileEl.innerText = fatherMobile;

        // 9. Back Face: Live Verification QR Code
        if (qrContainer) {
            const qrPayload = isSchoolMode
                ? `ROLLCALL-PASS|TYPE:SCHOOL|UID:${user.uid || ''}|NAME:${displayName}|CLASS:${courseDisplay}|ROLL:${user.classRoll || ''}|SECTION:${user.section || ''}`
                : `ROLLCALL-PASS|UID:${user.uid || ''}|NAME:${displayName}|UNIV:${user.univRoll || ''}|ROLL:${user.classRoll || ''}|BATCH:${validThru}`;
            if (typeof QRCode !== 'undefined') {
                try {
                    qrContainer.innerHTML = '';
                    new QRCode(qrContainer, {
                        text: qrPayload,
                        width: 76,
                        height: 76,
                        colorDark: '#0f172a',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (e) {
                    qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=76x76&data=${encodeURIComponent(qrPayload)}&color=0f172a&bgcolor=ffffff" alt="Verification QR" style="width:76px;height:76px;border-radius:6px;background:#fff;padding:3px;">`;
                }
            } else {
                qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=76x76&data=${encodeURIComponent(qrPayload)}&color=0f172a&bgcolor=ffffff" alt="Verification QR" style="width:76px;height:76px;border-radius:6px;background:#fff;padding:3px;">`;
            }
        }
    }
    window.renderDigitalId = renderDigitalId;

    /* ==========================================================================
       In-Card Forgot Password (Popup-Free)
       ========================================================================== */
    function initInlineForgotPassword() {
        const forgotLink = document.getElementById('forgot-password-link');
        const backLink = document.getElementById('back-to-login-link');
        const loginFormWrap = document.getElementById('standard-login-fields');
        const resetFormWrap = document.getElementById('inline-reset-fields');

        if (forgotLink && loginFormWrap && resetFormWrap) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                loginFormWrap.style.display = 'none';
                resetFormWrap.style.display = 'block';
            });
        }

        if (backLink && loginFormWrap && resetFormWrap) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                resetFormWrap.style.display = 'none';
                loginFormWrap.style.display = 'block';
            });
        }
    }

    /* ==========================================================================
       Intercept Legacy Buttons (Suppress disruptive popups)
       ========================================================================== */
    function interceptLegacyButtons() {
        const historyBtn = document.getElementById('history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                switchTab('tab-history');
            }, true);
        }

        const profileBtn = document.getElementById('profile-btn');
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                switchTab('tab-profile');
                if (typeof window.loadProfileData === 'function') window.loadProfileData();
            }, true);
        }

        const notificationBtn = document.getElementById('notifications-btn');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                const drawer = document.getElementById('notifications-drawer');
                const backdrop = document.getElementById('drawer-backdrop');
                if (drawer) drawer.classList.add('open');
                if (backdrop) backdrop.classList.add('open');
                loadFirebaseNotifications();
            }, true);
        }
    }

    /* ==========================================================================
       Profile & Security Tab Controller (Comprehensive User Details)
       ========================================================================== */
    function detectClientOS() {
        const ua = navigator.userAgent || '';
        if (/windows phone/i.test(ua)) return 'Windows Phone';
        if (/win(dows)?/i.test(ua)) return 'Windows 11 / 10 (x64)';
        if (/android/i.test(ua)) return 'Android Device';
        if (/ipad|iphone|ipod/i.test(ua)) return 'Apple iOS (Mobile)';
        if (/mac(intosh)?/i.test(ua)) return 'Apple macOS';
        if (/linux/i.test(ua)) return 'Linux / GNU';
        return navigator.platform || 'Universal Desktop';
    }

    function detectClientBrowser() {
        const ua = navigator.userAgent || '';
        if (/edg\//i.test(ua)) return 'Microsoft Edge (Chromium)';
        if (/opr\/|opera/i.test(ua)) return 'Opera Browser';
        if (/chrome|crios/i.test(ua)) return 'Google Chrome';
        if (/firefox|fxios/i.test(ua)) return 'Mozilla Firefox';
        if (/safari/i.test(ua)) return 'Apple Safari';
        return 'Standard Browser Engine';
    }

    function getHardwareFingerprint() {
        if (typeof window.generateDeviceFingerprint === 'function') {
            try {
                const fp = window.generateDeviceFingerprint();
                if (fp) return fp;
            } catch (e) {}
        }
        const stored = localStorage.getItem('rollcall_device_lock_profile_v1');
        if (stored) {
            try {
                const p = JSON.parse(stored);
                if (p.deviceFingerprint) return p.deviceFingerprint;
            } catch (e) {}
        }
        // Fallback robust hash
        const raw = `${navigator.userAgent}-${screen.width}x${screen.height}-${navigator.hardwareConcurrency || 4}-${navigator.language}`;
        return 'HW-' + btoa(raw).replace(/[/+=]/g, '').slice(0, 24);
    }

    function initProfileAndSecurity() {
        // 1. Toggle edit panel
        const toggleEditBtn = document.getElementById('prof-toggle-edit-btn');
        const editPanel = document.getElementById('prof-edit-panel');
        const closeEditBtn = document.getElementById('prof-edit-close-btn');
        const cancelEditBtn = document.getElementById('prof-edit-cancel-btn');
        const submitEditBtn = document.getElementById('prof-edit-submit-btn');

        const sectionKey = value => Array.from(new TextEncoder().encode(String(value || '').trim()), byte => byte.toString(16).padStart(2, '0')).join('');
        async function submitToClassTeacher(db, user, request) {
            const profileSnap = await db.ref(`users/${user.uid}`).once('value');
            const profile = profileSnap.val() || {};
            const schoolId = profile.schoolId || user.schoolId;
            const section = String(profile.section || user.section || '').trim();
            if (profile.role !== 'student' || !schoolId || !section) throw new Error('Your school and section must be set on your student profile before requesting a profile update.');
            const assignmentSnap = await db.ref(`classTeacherAssignments/${schoolId}/${sectionKey(section)}`).once('value');
            const assignment = assignmentSnap.val() || {};
            if (!assignment.teacherId || assignment.schoolId !== schoolId || String(assignment.section || '').trim().toLowerCase() !== section.toLowerCase()) {
                throw new Error('No class teacher is assigned to your section yet. Please contact your school administrator.');
            }
            const requestId = db.ref('profile_update_requests').push().key;
            const timestamp = firebase.database.ServerValue.TIMESTAMP;
            const requestData = {
                ...request,
                userId:user.uid,
                userName:profile.name || user.name || (user.email ? user.email.split('@')[0] : 'Student'),
                userEmail:profile.email || user.email || '',
                schoolId,
                section,
                classTeacherId:assignment.teacherId,
                requestType:request.requestType || 'Profile Details Update',
                timestamp,
                status:'pending'
            };
            const updates = {};
            updates[`profile_update_requests/${requestId}`] = requestData;
            updates[`classTeacherProfileRequests/${assignment.teacherId}/${requestId}`] = {
                requestId,
                studentId:user.uid,
                schoolId,
                section,
                timestamp,
                status:'pending'
            };
            updates[`notifications/${assignment.teacherId}/${db.ref(`notifications/${assignment.teacherId}`).push().key}`] = {
                title:'Student profile request',
                message:`${requestData.userName} submitted a ${requestData.requestType.toLowerCase()} for section ${section}.`,
                type:'info', category:'Profile request', timestamp,
                senderRole:'student', senderId:user.uid, schoolId, section
            };
            await db.ref().update(updates);
            return {requestId, section};
        }

        let isEditMode = false;
        const avatarBadge = document.getElementById('prof-avatar-edit-badge');
        const avatarInput = document.getElementById('prof-avatar-file-input');

        function setEditMode(active) {
            isEditMode = !!active;
            if (isEditMode) {
                if (editPanel) editPanel.style.display = 'block';
                if (avatarBadge) avatarBadge.style.display = 'flex';
                if (avatarInput) avatarInput.disabled = false;
                if (toggleEditBtn) {
                    toggleEditBtn.innerHTML = '<i class="fas fa-eye"></i> View Full Preview';
                    toggleEditBtn.classList.add('prof-mode-previewing');
                }
            } else {
                if (editPanel) editPanel.style.display = 'none';
                if (avatarBadge) avatarBadge.style.display = 'none';
                if (avatarInput) avatarInput.disabled = true;
                if (toggleEditBtn) {
                    toggleEditBtn.innerHTML = '<i class="fas fa-user-pen"></i> Edit Profile';
                    toggleEditBtn.classList.remove('prof-mode-previewing');
                }
            }
        }
        // Initialize in full preview mode
        setEditMode(false);

        async function openEditPanel() {
            if (!editPanel) return;
            setEditMode(true);
            const user = state.currentUser || {};
            const isSchoolMode = user.registrationType === 'school' || state.schoolType === 'school';
            applyProfileInstitutionMode(isSchoolMode);
            // Populate edit inputs
            const nameIn = document.getElementById('prof-edit-name');
            const emailIn = document.getElementById('prof-edit-email');
            const mobIn = document.getElementById('prof-edit-mobile');
            const emIn = document.getElementById('prof-edit-emergency');
            const rollIn = document.getElementById('prof-edit-roll');
            const univIn = document.getElementById('prof-edit-univ-roll');
            const secIn = document.getElementById('prof-edit-section');
            const courseIn = document.getElementById('prof-edit-course');
            const deptIn = document.getElementById('prof-edit-dept');
            const bloodIn = document.getElementById('prof-edit-blood');
            const batchIn = document.getElementById('prof-edit-batch');

            const authUser = window.firebase?.auth && firebase.auth().currentUser;
            if (nameIn) nameIn.value = user.name || authUser?.displayName || '';
            if (emailIn) emailIn.value = user.email || authUser?.email || '';
            if (mobIn) mobIn.value = user.mobile || user.mobileNumber || user.phoneNumber || user.phoneNo || user.phone || user.contactNumber || '';
            if (emIn) emIn.value = user.emergencyContact || user.emergency || '';
            if (rollIn) rollIn.value = user.classRoll || user.classRollNo || user.class_roll || user.rollNumber || user.rollNo || user.roll || '';
            if (univIn) univIn.value = user.univRoll || '';
            if (secIn && courseIn && window.rollCallStudentCourseCatalog) {
                try {
                    await window.rollCallStudentCourseCatalog.configure({
                        schoolId: user.schoolId || '',
                        courseSelectId: 'prof-edit-course',
                        yearSelectId: 'prof-edit-year',
                        sectionSelectId: 'prof-edit-section',
                        courseId: user.courseId || user.courseName || user.course || '',
                        year: String(user.academicYear || user.year || ''),
                        section: user.section || '',
                        institutionType: isSchoolMode ? 'school' : 'university'
                    });
                } catch (error) { console.error('Could not load the school course list for profile editing:', error); }
            }
            if (deptIn) deptIn.value = user.department || user.branch || '';
            if (bloodIn) bloodIn.value = user.bloodGroup || user.blood || '';
            if (batchIn) batchIn.value = user.batch || user.academicBatch || '';

            editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function closeEditPanel() {
            setEditMode(false);
        }

        if (toggleEditBtn) {
            toggleEditBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isEditMode) {
                    closeEditPanel();
                } else {
                    openEditPanel();
                }
            });
        }
        if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditPanel);
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditPanel);

        // 2. Submit edit profile request
        if (submitEditBtn) {
            submitEditBtn.addEventListener('click', async () => {
                const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
                if (!user || !user.uid) {
                    showModernToast('Please sign in to update credentials.', 'warning');
                    return;
                }

                const creditsLeft = Math.max(3 - Number(user.profileUpdateUsed || 0), 0);
                if (creditsLeft <= 0) {
                    showModernToast('Update limit reached (3/3 used). Contact admin.', 'error');
                    return;
                }

                const deptVal = (document.getElementById('prof-edit-dept')?.value || '').trim();
                const bloodVal = (document.getElementById('prof-edit-blood')?.value || '').trim();
                const batchVal = (document.getElementById('prof-edit-batch')?.value || '').trim();
                const selectedCourseId = document.getElementById('prof-edit-course')?.value || '';
                const isSchoolMode = user.registrationType === 'school' || state.schoolType === 'school';
                const academicYear = isSchoolMode ? 1 : Number(document.getElementById('prof-edit-year')?.value || 0);
                let courseRecord = null;
                try { courseRecord = await window.rollCallStudentCourseCatalog?.getCourse(user.schoolId || '', selectedCourseId); }
                catch (error) { console.error('Could not verify the selected course:', error); }
                const selectedSection = document.getElementById('prof-edit-section')?.value || '';
                if (!courseRecord || !academicYear || !(Array.isArray(courseRecord.sectionsByYear?.[String(academicYear)]) && courseRecord.sectionsByYear[String(academicYear)].includes(selectedSection))) {
                    showModernToast('Select a course, academic year, and section from your school catalogue.', 'warning');
                    return;
                }

                const updatedData = {
                    name: (document.getElementById('prof-edit-name')?.value || '').trim(),
                    mobile: (document.getElementById('prof-edit-mobile')?.value || '').trim(),
                    emergencyContact: (document.getElementById('prof-edit-emergency')?.value || '').trim(),
                    classRoll: (document.getElementById('prof-edit-roll')?.value || '').trim(),
                    ...(!isSchoolMode ? {univRoll: (document.getElementById('prof-edit-univ-roll')?.value || '').trim()} : {}),
                    section: selectedSection,
                    courseId: selectedCourseId,
                    course: courseRecord.courseName || '',
                    courseName: courseRecord.courseName || '',
                    courseNickname: courseRecord.courseNickname || '',
                    ...(isSchoolMode
                        ? {className: courseRecord.courseName || ''}
                        : {academicYear, year: academicYear, batch: courseRecord.batch || '', department: deptVal, branch: deptVal}),
                    bloodGroup: bloodVal,
                    ...(!isSchoolMode ? {batch: batchVal, academicBatch: batchVal} : {}),
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };

                if (!updatedData.name) {
                    showModernToast('Full Name cannot be empty.', 'warning');
                    return;
                }

                submitEditBtn.disabled = true;
                submitEditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

                try {
                    const db = firebase.database();
                    // Route profile changes through the class teacher assigned to this student's section.
                    const routed = await submitToClassTeacher(db, user, {
                        requestType: 'Profile Details Update',
                        currentData: {
                            name: user.name || '',
                            email: user.email || '',
                            mobile: user.mobile || user.mobileNumber || user.phoneNumber || user.phoneNo || user.phone || user.contactNumber || '',
                            classRoll: user.classRoll || user.classRollNo || user.class_roll || user.rollNumber || user.rollNo || user.roll || '',
                            section: user.section || '',
                            courseId: user.courseId || '',
                            course: user.course || '',
                            bloodGroup: user.bloodGroup || user.blood || '',
                            ...(isSchoolMode
                                ? {className: user.className || user.courseName || user.course || ''}
                                : {
                                    univRoll: user.univRoll || '',
                                    academicYear: user.academicYear || user.year || '',
                                    year: user.academicYear || user.year || '',
                                    department: user.department || user.branch || '',
                                    branch: user.branch || user.department || '',
                                    batch: user.batch || user.academicBatch || '',
                                    academicBatch: user.academicBatch || user.batch || ''
                                })
                        },
                        requestedData: updatedData
                    });

                    // Consume credit
                    await db.ref(`users/${user.uid}/profileUpdateUsed`).transaction(curr => (Number(curr || 0) + 1));

                    showModernToast(`Profile update request sent to your class teacher for section ${routed.section}.`, 'success');
                    closeEditPanel();
                } catch (err) {
                    console.error('Update request failed:', err);
                    showModernToast('Failed to submit request: ' + err.message, 'error');
                } finally {
                    submitEditBtn.disabled = false;
                    submitEditBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Update Request';
                }
            });
        }

        // 3. Avatar photo upload trigger - only permitted when Edit Profile mode is active
        if (avatarInput) {
            avatarInput.addEventListener('change', async (e) => {
                if (!isEditMode || avatarInput.disabled) {
                    showModernToast('Please click "Edit Profile" before updating your photo.', 'warning');
                    avatarInput.value = '';
                    return;
                }
                const file = e.target.files?.[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    showModernToast('Please select a valid image file.', 'warning');
                    return;
                }
                if (file.size > 2 * 1024 * 1024) {
                    showModernToast('Photo must be smaller than 2MB.', 'warning');
                    return;
                }

                const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
                if (!user || !user.uid) return;

                showModernToast('Uploading photo for your class teacher to review...', 'info');

                try {
                    let photoUrl = null;
                    if (typeof window.uploadProfilePhoto === 'function') {
                        const result = await window.uploadProfilePhoto(file, user.uid);
                        photoUrl = result.publicUrl;
                    } else {
                        // Base64 fallback preview
                        photoUrl = await new Promise((res, rej) => {
                            const reader = new FileReader();
                            reader.onload = ev => res(ev.target.result);
                            reader.onerror = rej;
                            reader.readAsDataURL(file);
                        });
                    }

                    if (photoUrl) {
                        const db = firebase.database();
                        // Route profile photo changes to the class teacher assigned to the student's section.
                        const routed = await submitToClassTeacher(db, user, {
                            requestType: 'Profile Photo Update',
                            currentData: {
                                profilePhoto: user.profilePhoto || ''
                            },
                            requestedData: {
                                profilePhoto: photoUrl
                            }
                        });

                        showModernToast(`Profile photo request sent to your class teacher for section ${routed.section}.`, 'success');
                    }
                } catch (err) {
                    console.error('Photo upload error:', err);
                    showModernToast('Photo upload request failed: ' + err.message, 'error');
                } finally {
                    avatarInput.value = '';
                }
            });
        }

        // 4. Copy Hardware Fingerprint Button
        const copyFpBtn = document.getElementById('prof-copy-device-id');
        if (copyFpBtn) {
            copyFpBtn.addEventListener('click', () => {
                const fp = getHardwareFingerprint();
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(fp).then(() => {
                        showModernToast('Hardware Device Lock ID copied to clipboard!', 'success');
                    }).catch(() => {
                        showModernToast(fp, 'info');
                    });
                } else {
                    showModernToast(fp, 'info');
                }
            });
        }

        // 5. Request Device Transfer / Reset
        const devResetBtn = document.getElementById('prof-btn-request-device-reset');
        if (devResetBtn) {
            devResetBtn.addEventListener('click', async () => {
                const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
                if (!user || !user.uid) return;

                if (!confirm('Do you want to submit a request to unlink your current device and register a new one?')) {
                    return;
                }

                try {
                    const db = firebase.database();
                    await db.ref(`device_unlock_requests/${user.uid}`).set({
                        email: user.email || '',
                        name: user.name || '',
                        univRoll: user.univRoll || '',
                        deviceFingerprint: getHardwareFingerprint(),
                        platform: detectClientOS(),
                        browser: detectClientBrowser(),
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
                        status: 'pending'
                    });
                    showModernToast('Device transfer request sent to College Admin for approval.', 'success');
                } catch (err) {
                    showModernToast('Failed to submit device request: ' + err.message, 'error');
                }
            });
        }

        // Render initial data if user is already in session
        renderProfileDetails();
    }

    function renderProfileDetails() {
        if (window.currentUser && (!state.currentUser || !state.currentUser.uid)) {
            state.currentUser = window.currentUser;
        }
        const user = (state.currentUser && state.currentUser.uid)
            ? state.currentUser
            : (window.currentUser || (window.firebase?.auth && firebase.auth().currentUser) || state.currentUser || {});
        const authUser = window.firebase?.auth && firebase.auth().currentUser;
        const isSchoolMode = state.schoolType === 'school' || user.registrationType === 'school';
        const mobile = user.mobile || user.mobileNumber || user.phoneNumber || user.phoneNo || user.phone || user.contactNumber || '';
        const classRoll = user.classRoll || user.classRollNo || user.class_roll || user.rollNumber || user.rollNo || user.roll || '';
        const dateOfBirth = user.dateOfBirth || user.dob || user.birthDate || '';
        const formatDateOfBirth = value => {
            const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const date = match
                ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
                : new Date(value);
            return Number.isNaN(date.getTime())
                ? 'Not provided'
                : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        };
        applyProfileInstitutionMode(isSchoolMode);

        // --- 1. HERO BANNER ---
        const heroAvatar = document.getElementById('prof-hero-avatar');
        const heroName = document.getElementById('prof-hero-name');
        const heroDept = document.getElementById('prof-hero-dept');
        const heroUniv = document.getElementById('prof-hero-univ');
        const heroRoll = document.getElementById('prof-hero-roll');
        const heroSec = document.getElementById('prof-hero-sec');
        const creditsCount = document.getElementById('prof-credits-count');

        const defaultAvatar = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/person-1824144_960_720.png';
        if (heroAvatar) heroAvatar.src = user.profilePhoto || defaultAvatar;
        if (heroName) heroName.innerText = user.name || authUser?.displayName || (user.email ? user.email.split('@')[0] : 'Student');
        const cleanHeroSec = String(user.section || '').replace(/^(sec|section)\s*/i, '').trim();
        if (heroDept) heroDept.innerText = isSchoolMode
            ? formatClassDisplay(user.className || user.courseName || user.course, 'Not assigned')
            : (user.course || user.department || user.branch || 'B.Tech Computer Science & Engineering');
        if (heroUniv) heroUniv.innerText = user.univRoll || 'Not Assigned';
        if (heroRoll) heroRoll.innerText = classRoll || 'Not Assigned';
        if (heroSec) heroSec.innerText = cleanHeroSec || user.section || 'A';

        const usedCredits = Number(user.profileUpdateUsed || 0);
        const creditsLeft = Math.max(3 - usedCredits, 0);
        if (creditsCount) creditsCount.innerText = `${creditsLeft}/3`;

        // --- 2. CARD 1: PERSONAL & CONTACT INFO ---
        const valName = document.getElementById('prof-val-name');
        const valEmail = document.getElementById('prof-val-email');
        const valMobile = document.getElementById('prof-val-mobile');
        const valEmergency = document.getElementById('prof-val-emergency');
        const valBlood = document.getElementById('prof-val-blood');
        const valStatus = document.getElementById('prof-val-status');

        if (valName) valName.innerText = user.name || authUser?.displayName || '-';
        if (valEmail) valEmail.innerText = user.email || authUser?.email || '-';
        if (valMobile) valMobile.innerText = mobile || 'Not Registered';
        const valDateOfBirth = document.getElementById('prof-val-date-of-birth');
        if (valDateOfBirth) valDateOfBirth.innerText = dateOfBirth ? formatDateOfBirth(dateOfBirth) : 'Not provided';
        if (valEmergency) valEmergency.innerText = user.emergencyContact || user.emergency || mobile || 'Not Provided';
        if (valBlood) valBlood.innerText = user.bloodGroup || user.blood || 'Not Provided';
        if (valStatus) {
            if (user.blocked === true) {
                valStatus.innerHTML = '<span class="badge-status-pill danger"><i class="fas fa-ban"></i> Account Suspended</span>';
            } else {
                valStatus.innerHTML = '<span class="badge-status-pill success"><i class="fas fa-circle-check"></i> Active (Good Standing)</span>';
            }
        }

        // --- 3. CARD 2: ACADEMIC CREDENTIALS ---
        const valUnivRoll = document.getElementById('prof-val-univ-roll');
        const valClassRoll = document.getElementById('prof-val-class-roll');
        const valCourse = document.getElementById('prof-val-course');
        const valDept = document.getElementById('prof-val-dept');
        const valSection = document.getElementById('prof-val-section');
        const valBatch = document.getElementById('prof-val-batch');

        if (valUnivRoll) valUnivRoll.innerText = user.univRoll || 'Not Set';
        if (valClassRoll) valClassRoll.innerText = classRoll || 'Not Set';
        if (valCourse) valCourse.innerText = isSchoolMode
            ? formatClassDisplay(user.className || user.courseName || user.course, 'Not assigned')
            : (user.course || 'B.Tech Computer Science & Engineering');
        if (valDept) valDept.innerText = user.department || user.branch || 'Computer Science & Engineering';
        const cleanValSec = String(user.section || '').replace(/^(sec|section)\s*/i, '').trim();
        if (valSection) valSection.innerText = cleanValSec ? `Section ${cleanValSec}` : (user.section ? `Section ${user.section}` : 'Section A');
        if (valBatch) valBatch.innerText = user.academicBatch || user.batch || '2023 - 2027';

        if (!isSchoolMode) renderProfileEligibility();

        // --- 4. CARD 3: HARDWARE LOCK & SECURITY ---
        const osEl = document.getElementById('prof-val-os');
        const brEl = document.getElementById('prof-val-browser');
        const dispEl = document.getElementById('prof-val-display');
        const tzEl = document.getElementById('prof-val-tz');
        const lastLoginEl = document.getElementById('prof-val-last-login');

        if (!isSchoolMode && osEl) osEl.innerText = detectClientOS();
        if (!isSchoolMode && brEl) brEl.innerText = detectClientBrowser();
        if (!isSchoolMode && dispEl) dispEl.innerText = `${window.screen.width} × ${window.screen.height} (${window.screen.colorDepth}-bit)`;
        if (!isSchoolMode && tzEl) {
            tzEl.innerText = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : 'UTC';
        }
        if (!isSchoolMode && lastLoginEl) {
            if (authUser?.metadata?.lastSignInTime) {
                lastLoginEl.innerText = new Date(authUser.metadata.lastSignInTime).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            } else {
                lastLoginEl.innerText = 'Active Now (Secure Session)';
            }
        }

        // --- 5. CARD 4: BIOMETRIC CREDENTIALS ---
        const faceStatusEl = document.getElementById('prof-val-face-status');
        const createdAtEl = document.getElementById('prof-val-created-at');

        if (faceStatusEl && !isSchoolMode) {
            renderFaceIdStatus(user, faceStatusEl);
        }
        if (!isSchoolMode && createdAtEl) {
            if (authUser?.metadata?.creationTime) {
                createdAtEl.innerText = new Date(authUser.metadata.creationTime).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
            } else {
                createdAtEl.innerText = 'Academic Year 2023-24';
            }
        }
    }

    async function renderFaceIdStatus(user, faceStatusEl) {
        if (!faceStatusEl) return;
        const uid = user?.uid || (window.firebase?.auth && firebase.auth().currentUser?.uid);
        if (!uid) {
            faceStatusEl.innerHTML = '<span class="badge-status-pill warning"><i class="fas fa-user-slash"></i> Please Sign In</span>';
            return;
        }

        let isEnrolled = Boolean(user.faceDescriptor || user.faceData || user.facialVector || user.faceRegistered);

        if (!isEnrolled && window.firebase?.database) {
            try {
                const snap = await firebase.database().ref(`users/${uid}/faceDescriptor`).once('value');
                if (snap.exists() && snap.val()) {
                    isEnrolled = true;
                    user.faceDescriptor = snap.val();
                }
            } catch (err) {
                console.warn('Face ID check error:', err);
            }
        }

        if (isEnrolled) {
            faceStatusEl.innerHTML = '<span class="badge-status-pill success"><i class="fas fa-circle-check"></i> Enrolled</span>';
        } else {
            faceStatusEl.innerHTML = `
                <button type="button" class="modern-btn-primary" id="btn-register-face-prof" style="padding: 6px 14px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fas fa-camera"></i> Register Face ID
                </button>
            `;
            const regBtn = document.getElementById('btn-register-face-prof');
            if (regBtn) {
                regBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    regBtn.disabled = true;
                    regBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Launching...';

                    try {
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let accessToken = '';
                        for (let i = 0; i < 32; i++) {
                            accessToken += chars.charAt(Math.floor(Math.random() * chars.length));
                        }
                        accessToken += '_' + Date.now();

                        const db = firebase.database();
                        await db.ref(`faceRegistrationTokens/${accessToken}`).set({
                            uid: uid,
                            email: user.email || (window.firebase?.auth && firebase.auth().currentUser?.email) || '',
                            name: user.name || (window.firebase?.auth && firebase.auth().currentUser?.displayName) || '',
                            classRoll: user.classRoll || '',
                            univRoll: user.univRoll || '',
                            createdAt: Date.now(),
                            expiresAt: Date.now() + (10 * 60 * 1000)
                        });

                        window.location.href = `face-attendance.html?token=${accessToken}`;
                    } catch (err) {
                        console.error('Error starting face registration:', err);
                        showModernToast('Failed to start face registration: ' + err.message, 'error');
                        regBtn.disabled = false;
                        regBtn.innerHTML = '<i class="fas fa-camera"></i> Register Face ID';
                    }
                });
            }
        }
    }

    function renderProfileEligibility() {
        const elBadge = document.getElementById('prof-val-eligibility');
        if (!elBadge) return;
        const pct = state.overallStats?.percentage || 0;
        const total = state.overallStats?.total || 0;

        if (total === 0) {
            elBadge.innerHTML = '<span class="badge-status-pill warning"><i class="fas fa-clock"></i> Computing Sessions...</span>';
        } else if (pct >= 75) {
            elBadge.innerHTML = `<span class="badge-status-pill success"><i class="fas fa-circle-check"></i> Eligible for Exams (${pct}%)</span>`;
        } else {
            elBadge.innerHTML = `<span class="badge-status-pill danger"><i class="fas fa-triangle-exclamation"></i> Attendance Alert (${pct}% &lt; 75%)</span>`;
        }
    }
    window.renderProfileDetails = renderProfileDetails;

    /* ==========================================================================
       Toast Helper
       ========================================================================== */
    function showModernToast(message, type = 'info', duration = 3500) {
        let container = document.getElementById('sp-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sp-toast-container';
            container.className = 'sp-toast-container';
            document.body.appendChild(container);
        }

        const icons = {
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-circle-xmark',
            info: 'fa-circle-info'
        };

        const toast = document.createElement('div');
        toast.className = `sp-toast toast-${type}`;
        toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    /* ==========================================================================
       Attendance Records & History Ledger (Enterprise Redesign)
       ========================================================================== */
    let historyState = {
        allRecords: [],
        filteredRecords: [],
        selectedMonth: 'all',
        selectedYear: new Date().getFullYear(),
        statusFilter: 'all',
        searchQuery: '',
        isLoading: false
    };

    function initAttendanceRecordsModule() {
        const monthSelect = document.getElementById('history-month');
        const yearSelect = document.getElementById('history-year');
        const refreshBtn = document.getElementById('ar-btn-refresh');
        const exportBtn = document.getElementById('ar-btn-export');
        const applyBtn = document.getElementById('load-history-btn');
        const searchInput = document.getElementById('ar-search-input');
        const chipContainer = document.getElementById('ar-filter-chips');

        const currentYear = new Date().getFullYear();
        historyState.selectedYear = currentYear;

        // Populate Years (Current - 2 to Current + 1)
        if (yearSelect) {
            yearSelect.innerHTML = '';
            for (let y = currentYear - 2; y <= currentYear + 1; y++) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.innerText = y;
                if (y === currentYear) opt.selected = true;
                yearSelect.appendChild(opt);
            }
            yearSelect.addEventListener('change', () => {
                historyState.selectedYear = parseInt(yearSelect.value) || currentYear;
                loadAttendanceHistory();
            });
        }

        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                historyState.selectedMonth = monthSelect.value;
                loadAttendanceHistory();
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (monthSelect) historyState.selectedMonth = monthSelect.value;
                if (yearSelect) historyState.selectedYear = parseInt(yearSelect.value) || currentYear;
                loadAttendanceHistory();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                withRateLimit(refreshBtn, 4000, 'Attendance Records', async () => {
                    await loadAttendanceHistory(true);
                });
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                exportAttendanceToCSV();
            });
        }

        if (chipContainer) {
            chipContainer.querySelectorAll('.ar-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    chipContainer.querySelectorAll('.ar-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    historyState.statusFilter = chip.getAttribute('data-filter') || 'all';
                    applyClientAttendanceFilter();
                });
            });
        }

        if (searchInput) {
            let debounceTimer = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    historyState.searchQuery = (searchInput.value || '').trim().toLowerCase();
                    applyClientAttendanceFilter();
                }, 200);
            });
        }
    }

    function normalizeSectionKeys(sectionValue) {
        if (!sectionValue) return [];
        let list = [];
        if (Array.isArray(sectionValue)) {
            list = sectionValue;
        } else if (typeof sectionValue === 'object') {
            const values = Object.values(sectionValue);
            const keys = Object.keys(sectionValue);
            if (values.length && values.every(v => typeof v === 'boolean')) {
                list = keys.filter(k => sectionValue[k]);
            } else {
                list = values;
            }
        } else if (typeof sectionValue === 'string') {
            const trimmed = sectionValue.trim();
            if (trimmed) {
                list = trimmed.includes(',') ? trimmed.split(',') : [trimmed];
            }
        }
        return list.map(v => {
            let s = String(v).trim().toLowerCase();
            if (s.startsWith('section ')) s = s.slice(8).trim();
            return s;
        }).filter(Boolean);
    }

    async function loadAttendanceHistory(forceRefresh = false) {
        const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
        if (!user || !window.firebase?.database) return;
        const uid = user.uid;
        const db = firebase.database();
        const listEl = document.getElementById('history-list');

        if (listEl) {
            listEl.innerHTML = `
                <div class="ar-empty-state-card">
                    <i class="fas fa-spinner fa-spin ar-empty-state-icon"></i>
                    <h4 class="ar-empty-title">Loading Attendance Ledger...</h4>
                    <p class="ar-empty-desc">Fetching latest session records from database.</p>
                </div>
            `;
        }

        try {
            historyState.isLoading = true;
            const monthVal = historyState.selectedMonth;
            const yearVal = historyState.selectedYear;

            // Fetch global attendance, locations, and user direct attendance records
            const schoolId = user.schoolId || '';
            const fetchPromises = [
                db.ref('attendance_by_location').once('value'),
                db.ref('locations').once('value'),
                db.ref(`user_attendance/${uid}`).once('value')
            ];

            if (schoolId) {
                fetchPromises.push(loadStableStudentReference(`schoolCourses/${schoolId}`, 30 * 60 * 1000, forceRefresh));
                fetchPromises.push(loadStableStudentReference(`schoolClasses/${schoolId}`, 30 * 60 * 1000, forceRefresh));
            }

            const results = await Promise.all(fetchPromises);
            const globalAtt = results[0].val() || {};
            const locations = results[1].val() || {};
            const userDirectAtt = results[2].val() || {};
            const courses = results[3] || {};
            const classes = results[4] || {};

            const userSectionKeys = normalizeSectionKeys(user.section || '');
            const recordsMap = new Map();

            // 1. Ingest direct user logs (from face biometrics / mobile attendance)
            Object.entries(userDirectAtt).forEach(([dateStr, sessionObj]) => {
                if (!sessionObj || typeof sessionObj !== 'object') return;
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return;
                if (d.getFullYear() !== yearVal) return;
                if (monthVal !== 'all' && d.getMonth() !== parseInt(monthVal)) return;

                Object.entries(sessionObj).forEach(([locOrSessionId, record]) => {
                    if (!record || typeof record !== 'object') return;
                    const key = `${dateStr}_${locOrSessionId}`;
                    const locMeta = locations[locOrSessionId] || courses[locOrSessionId] || {};
                    const className = record.locationName || record.className || locMeta.name || locMeta.courseName || 'Class Session';
                    const subject = record.subject || locMeta.subject || className;
                    const teacher = record.teacherName || locMeta.teacherName || 'Faculty In-Charge';
                    const time = record.time || '09:00 AM';
                    const timestamp = record.timestamp || d.getTime();
                    const status = normalizeAttendanceStatus(record, 'present');
                    const attendanceType = record.attendanceType || 'Face AI / Verified';

                    recordsMap.set(key, {
                        id: key,
                        date: dateStr,
                        dateObj: d,
                        className,
                        subject,
                        teacherName: teacher,
                        time,
                        timestamp,
                        status,
                        attendanceType,
                        sessionType: record.sessionType || 'Lecture'
                    });
                });
            });

            // 2. Ingest global attendance by location / class
            Object.entries(globalAtt).forEach(([locId, dateSessions]) => {
                if (!dateSessions || typeof dateSessions !== 'object') return;
                const locMeta = locations[locId] || courses[locId] || classes[locId] || {};
                const locName = locMeta.name || locMeta.courseName || locMeta.className || 'Class Session';
                const locSectionKeys = normalizeSectionKeys(locMeta.section);

                Object.entries(dateSessions).forEach(([dateStr, attendees]) => {
                    if (!attendees || typeof attendees !== 'object') return;
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return;
                    if (d.getFullYear() !== yearVal) return;
                    if (monthVal !== 'all' && d.getMonth() !== parseInt(monthVal)) return;

                    const key = `${dateStr}_${locId}`;
                    const meta = attendees._meta || {};
                    const className = meta.className || meta.subjectName || locName;
                    const subject = meta.subjectName || locMeta.subject || className;
                    const teacher = meta.teacherName || locMeta.teacherName || 'Faculty In-Charge';
                    const time = meta.time || locMeta.time || 'Scheduled Slot';
                    const sessionType = meta.sessionType || 'Lecture';

                    const attendeesList = Object.entries(attendees).filter(([k]) => k !== '_meta');
                    const hasUserAttendee = attendees[uid] !== undefined;

                    // Section relevance check
                    const hasPeerInUserSection = userSectionKeys.length > 0 && attendeesList.some(([, attVal]) => {
                        const peerSec = attVal?.section || (typeof attVal === 'object' ? attVal.section : null);
                        if (!peerSec) return false;
                        const peerKeys = normalizeSectionKeys(peerSec);
                        return userSectionKeys.some(k => peerKeys.includes(k));
                    });
                    const isGeneral = locSectionKeys.includes('general') || locName.toLowerCase().includes('general');

                    if (hasUserAttendee || hasPeerInUserSection || isGeneral) {
                        if (recordsMap.has(key)) {
                            return;
                        }

                        let status = 'absent';
                        let attendanceType = 'Missed';
                        let timestamp = d.getTime();

                        if (hasUserAttendee) {
                            const userAtt = attendees[uid];
                            if (typeof userAtt === 'string') {
                                status = normalizeAttendanceStatus(userAtt, 'absent');
                                attendanceType = 'Class Roll Call';
                            } else if (typeof userAtt === 'object' && userAtt !== null) {
                                status = normalizeAttendanceStatus(userAtt, 'present');
                                attendanceType = userAtt.attendanceType || 'Class Roll Call';
                                if (userAtt.time) time = userAtt.time;
                                if (userAtt.timestamp) timestamp = userAtt.timestamp;
                            }
                        }

                        recordsMap.set(key, {
                            id: key,
                            date: dateStr,
                            dateObj: d,
                            className,
                            subject,
                            teacherName: teacher,
                            time,
                            timestamp,
                            status,
                            attendanceType,
                            sessionType
                        });
                    }
                });
            });

            // Convert to array and sort descending (newest first)
            const allRecords = Array.from(recordsMap.values()).sort((a, b) => b.timestamp - a.timestamp);
            historyState.allRecords = allRecords;

            // Update KPI counters based on current records
            updateHistoryKPIs(allRecords);

            // Apply client-side chips/search filters
            applyClientAttendanceFilter();

            if (forceRefresh) {
                showModernToast('Attendance ledger refreshed.', 'success', 2500);
            }
        } catch (err) {
            console.error('Error fetching attendance history:', err);
            if (listEl) {
                listEl.innerHTML = `
                    <div class="ar-empty-state-card">
                        <i class="fas fa-triangle-exclamation ar-empty-state-icon" style="color:var(--sp-danger)"></i>
                        <h4 class="ar-empty-title">Failed to Load Records</h4>
                        <p class="ar-empty-desc">${err.message || 'Please check your connection and try again.'}</p>
                        <button type="button" class="ar-apply-btn" onclick="window.loadAttendanceHistory(true)">Try Again</button>
                    </div>
                `;
            }
        } finally {
            historyState.isLoading = false;
        }
    }

    function updateHistoryKPIs(records) {
        const statTotal = document.getElementById('stat-total');
        const statPresent = document.getElementById('stat-present');
        const statAbsent = document.getElementById('stat-absent');
        const statPercentage = document.getElementById('stat-percentage');
        const statBadge = document.getElementById('stat-status-badge');

        const total = records.length;
        const present = records.filter(r => r.status === 'present').length;
        const late = records.filter(r => r.status === 'late').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const effective = present + late;
        const percentage = total > 0 ? Math.round((effective / total) * 100) : 0;

        if (statTotal) statTotal.innerText = total;
        if (statPresent) statPresent.innerText = late > 0 ? `${present} (+${late} Late)` : present;
        if (statAbsent) statAbsent.innerText = absent;
        if (statPercentage) statPercentage.innerText = `${percentage}%`;

        if (statBadge) {
            if (total === 0) {
                statBadge.className = 'ar-badge-status';
                statBadge.innerText = 'No Data';
                statBadge.style.background = 'rgba(148, 163, 184, 0.15)';
                statBadge.style.color = 'var(--sp-text-muted)';
            } else if (percentage >= 75) {
                statBadge.className = 'ar-badge-status safe';
                statBadge.innerText = 'Safe (≥75%)';
                statBadge.style.background = '';
                statBadge.style.color = '';
            } else if (percentage >= 60) {
                statBadge.className = 'ar-badge-status warning';
                statBadge.innerText = 'At Risk (<75%)';
                statBadge.style.background = '';
                statBadge.style.color = '';
            } else {
                statBadge.className = 'ar-badge-status danger';
                statBadge.innerText = 'Critical (<60%)';
                statBadge.style.background = '';
                statBadge.style.color = '';
            }
        }
    }

    function applyClientAttendanceFilter() {
        const { allRecords, statusFilter, searchQuery } = historyState;
        let filtered = allRecords.slice();

        // 1. Status Filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(r => r.status === statusFilter);
        }

        // 2. Search Query
        if (searchQuery) {
            filtered = filtered.filter(r => {
                const text = `${r.className} ${r.subject} ${r.teacherName} ${r.date} ${r.time} ${r.status} ${r.attendanceType}`.toLowerCase();
                return text.includes(searchQuery);
            });
        }

        historyState.filteredRecords = filtered;
        renderAttendanceRecordsTable(filtered);
    }

    function renderAttendanceRecordsTable(records) {
        const listEl = document.getElementById('history-list');
        if (!listEl) return;

        if (records.length === 0) {
            listEl.innerHTML = `
                <div class="ar-empty-state-card">
                    <i class="fas fa-clipboard-question ar-empty-state-icon"></i>
                    <h4 class="ar-empty-title">No Records Found</h4>
                    <p class="ar-empty-desc">No attendance logs match your current filter and search criteria.</p>
                </div>
            `;
            return;
        }

        let rowsHtml = '';
        records.forEach(r => {
            const d = r.dateObj || new Date(r.date);
            const dateStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
            const timeStr = r.time || (r.timestamp && !isNaN(Number(r.timestamp)) ? new Date(Number(r.timestamp)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Scheduled');

            let statusBadge = '';
            if (r.status === 'present') {
                statusBadge = '<span class="ar-status-badge present"><i class="fas fa-circle-check"></i> Present</span>';
            } else if (r.status === 'late') {
                statusBadge = '<span class="ar-status-badge late"><i class="fas fa-clock"></i> Late</span>';
            } else if (r.status === 'excused') {
                statusBadge = '<span class="ar-status-badge excused"><i class="fas fa-file-medical"></i> Excused</span>';
            } else {
                statusBadge = '<span class="ar-status-badge absent"><i class="fas fa-circle-xmark"></i> Absent</span>';
            }

            // Session type styling & icon
            const sType = String(r.sessionType || 'Lecture');
            const sTypeLower = sType.toLowerCase();
            let sessionClass = 'lecture';
            let sessionIcon = 'fas fa-chalkboard';
            if (sTypeLower.includes('lab') || sTypeLower.includes('practical')) {
                sessionClass = 'lab';
                sessionIcon = 'fas fa-flask';
            } else if (sTypeLower.includes('exam') || sTypeLower.includes('test')) {
                sessionClass = 'exam';
                sessionIcon = 'fas fa-file-pen';
            } else if (sTypeLower.includes('tutorial')) {
                sessionClass = 'tutorial';
                sessionIcon = 'fas fa-book-reader';
            }

            const cleanClass = formatClassDisplay(r.className || 'Class');

            // Exact timestamp if recorded
            const exactTime = r.timestamp && !isNaN(Number(r.timestamp))
                ? new Date(Number(r.timestamp)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                : '';

            rowsHtml += `
                <tr>
                    <td>
                        <div class="ar-date-cell">
                            <span class="ar-date-main">${dateStr}</span>
                            <span class="ar-time-sub"><i class="far fa-clock"></i> ${escapeHtml(timeStr)} · ${weekday}</span>
                        </div>
                    </td>
                    <td>
                        <div class="ar-subject-main">
                            ${escapeHtml(r.subject || r.className || 'Class Session')}
                        </div>
                        <div class="ar-teacher-sub">
                            <i class="fas fa-chalkboard-user"></i>
                            <span>${escapeHtml(r.teacherName || 'Faculty In-Charge')}</span>
                        </div>
                    </td>
                    <td>
                        <span class="ar-class-pill">
                            <i class="fas fa-graduation-cap"></i> ${escapeHtml(cleanClass)}
                        </span>
                    </td>
                    <td>
                        <span class="ar-session-badge ${sessionClass}">
                            <i class="${sessionIcon}"></i> ${escapeHtml(sType)}
                        </span>
                    </td>
                    <td>
                        ${statusBadge}
                    </td>
                    <td>
                        <div class="ar-method-cell">
                            <span class="ar-method-tag">
                                <i class="fas fa-shield-halved"></i> ${escapeHtml(r.attendanceType || 'Verified')}
                            </span>
                            ${exactTime ? `<span class="ar-timestamp-sub" title="Audit Timestamp"><i class="fas fa-fingerprint"></i> ${exactTime}</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        listEl.innerHTML = `
            <div class="ar-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Scroll table horizontally to view complete record details</div>
            <table class="ar-records-table">
                <thead>
                    <tr>
                        <th>Date &amp; Time</th>
                        <th>Subject &amp; Faculty</th>
                        <th>Class / Course</th>
                        <th>Session Type</th>
                        <th>Status</th>
                        <th>Verification &amp; Audit</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    }

    function exportAttendanceToCSV() {
        const records = historyState.filteredRecords || historyState.allRecords || [];
        if (records.length === 0) {
            showModernToast('No attendance records to export.', 'warning');
            return;
        }

        const headers = ['Date', 'Day', 'Time', 'Class / Course', 'Subject', 'Session Type', 'Teacher', 'Status', 'Verification Method', 'Audit Timestamp'];
        const csvRows = [headers.join(',')];

        records.forEach(r => {
            const d = r.dateObj || new Date(r.date);
            const dateStr = d.toISOString().split('T')[0];
            const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
            const exactTimestamp = r.timestamp && !isNaN(Number(r.timestamp))
                ? new Date(Number(r.timestamp)).toISOString()
                : '';
            const row = [
                `"${dateStr}"`,
                `"${weekday}"`,
                `"${(r.time || '').replace(/"/g, '""')}"`,
                `"${(formatClassDisplay(r.className) || '').replace(/"/g, '""')}"`,
                `"${(r.subject || '').replace(/"/g, '""')}"`,
                `"${(r.sessionType || 'Lecture').replace(/"/g, '""')}"`,
                `"${(r.teacherName || '').replace(/"/g, '""')}"`,
                `"${(r.status || '').toUpperCase()}"`,
                `"${(r.attendanceType || '').replace(/"/g, '""')}"`,
                `"${exactTimestamp}"`
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        const fileName = `Attendance_Report_${historyState.selectedYear}_${historyState.selectedMonth}.csv`;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showModernToast('Attendance statement downloaded.', 'success');
    }

    /* ==========================================================================
       Weekly Class Timetable Module (Interactive Responsive Grid)
       ========================================================================== */
    const DAYS_CONFIG = [
        ['mon', 'Monday', 'Mon'],
        ['tue', 'Tuesday', 'Tue'],
        ['wed', 'Wednesday', 'Wed'],
        ['thu', 'Thursday', 'Thu'],
        ['fri', 'Friday', 'Fri'],
        ['sat', 'Saturday', 'Sat']
    ];

    let timetableState = {
        scopeList: [],
        selectedKey: '',
        settings: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], periods: [], lunchBreak: { enabled: false } },
        schedules: {},
        courses: {},
        subjectAssignments: {},
        isLoading: false,
        mobileView: 'day', // 'day' | 'grid'
        selectedDayKey: null
    };

    function initStudentTimetableModule() {
        const sectionSelect = document.getElementById('tt-section-select');
        const refreshBtn = document.getElementById('tt-btn-refresh');
        const printBtn = document.getElementById('tt-btn-print');
        const gridEl = document.getElementById('tt-grid-container');

        if (sectionSelect) {
            sectionSelect.addEventListener('change', () => {
                timetableState.selectedKey = sectionSelect.value;
                renderTimetableGrid();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                withRateLimit(refreshBtn, 4000, 'Timetable', async () => {
                    await renderStudentTimetable(true);
                });
            });
        }

        if (printBtn) {
            printBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.print();
            });
        }

        // Delegate click events for mobile view switcher and day chips
        if (gridEl) {
            gridEl.addEventListener('click', (e) => {
                const switchBtn = e.target.closest('.tt-view-switch-btn');
                if (switchBtn) {
                    e.preventDefault();
                    const view = switchBtn.dataset.view;
                    if (view && (view === 'day' || view === 'grid')) {
                        timetableState.mobileView = view;
                        renderTimetableGrid();
                    }
                    return;
                }

                const dayChip = e.target.closest('.tt-day-chip');
                if (dayChip) {
                    e.preventDefault();
                    const day = dayChip.dataset.day;
                    if (day) {
                        timetableState.selectedDayKey = day;
                        renderTimetableGrid();
                    }
                    return;
                }
            });
        }
    }

    async function renderStudentTimetable(forceRefresh = false) {
        const user = state.currentUser || (window.firebase?.auth && firebase.auth().currentUser);
        if (!user || !window.firebase?.database) return;
        const schoolId = user.schoolId || user.instituteId;
        const gridEl = document.getElementById('tt-grid-container');
        const sectionSelect = document.getElementById('tt-section-select');

        if (!schoolId) {
            if (gridEl) {
                gridEl.innerHTML = `
                    <div class="ar-empty-state-card">
                        <i class="fas fa-calendar-xmark ar-empty-state-icon" style="color:var(--sp-warning)"></i>
                        <h4 class="ar-empty-title">Class Schedule Unavailable</h4>
                        <p class="ar-empty-desc">Your student profile is not linked to an organization timetable.</p>
                    </div>
                `;
            }
            if (sectionSelect) {
                sectionSelect.innerHTML = '<option value="">No school assigned</option>';
                sectionSelect.disabled = true;
            }
            return;
        }

        if (gridEl) {
            gridEl.innerHTML = `
                <div class="ar-empty-state-card">
                    <i class="fas fa-spinner fa-spin ar-empty-state-icon"></i>
                    <h4 class="ar-empty-title">Loading Class Timetable...</h4>
                    <p class="ar-empty-desc">Syncing bell schedules and room assignments.</p>
                </div>
            `;
        }

        try {
            timetableState.isLoading = true;
            const db = firebase.database();

            const settingsPromise = loadStableStudentReference(`schoolTimetableSettings/${schoolId}`, 15 * 60 * 1000, forceRefresh);
            const timetablesPromise = window.RollCallTimetableCache
                ? window.RollCallTimetableCache.syncTimetables(schoolId, forceRefresh)
                : db.ref(`schoolTimetables/${schoolId}`).once('value').then(s => ({ timetables: s.val() || {} }));
            const coursesPromise = loadStableStudentReference(`schoolCourses/${schoolId}`, 30 * 60 * 1000, forceRefresh);
            const subjectAssignmentsPromise = db.ref(`subjectTeacherAssignments/${schoolId}`).once('value');

            const [config, cacheResult, courses, subjectAssignmentsSnap] = await Promise.all([
                settingsPromise,
                timetablesPromise,
                coursesPromise,
                subjectAssignmentsPromise
            ]);

            const timetables = cacheResult.timetables || {};
            const subjectAssignments = subjectAssignmentsSnap.val() || {};

            state.timetableSettings = config;
            state.schoolTimetables = timetables;
            if (cacheResult.version) {
                state.timetableVersion = cacheResult.version;
            }

            timetableState.settings = {
                days: Array.isArray(config.days) && config.days.length ? config.days : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
                periods: Array.isArray(config.periods) ? config.periods : [],
                lunchBreak: config.lunchBreak || { enabled: false }
            };
            timetableState.schedules = timetables;
            timetableState.courses = courses;
            timetableState.subjectAssignments = subjectAssignments;

            // Build list of all class sections in the school
            const userSection = (user.section || '').trim().toLowerCase();
            const userClassId = user.enrolledClassId || user.classId || '';

            const scopeMap = new Map();

            // From timetables:
            Object.entries(timetables).forEach(([classId, sections]) => {
                if (!sections || typeof sections !== 'object') return;
                Object.entries(sections).forEach(([secKey, sched]) => {
                    if (!sched || typeof sched !== 'object') return;
                    const className = formatClassDisplay(sched.className || courses[classId]?.courseName, 'Class');
                    const secName = sched.section || '';
                    const year = sched.year || '';
                    const value = `${classId}|${secKey}`;
                    scopeMap.set(value, {
                        classId,
                        sectionKey: secKey,
                        className,
                        section: secName,
                        year,
                        value,
                        isUserSection: (secName.toLowerCase() === userSection) || (classId === userClassId)
                    });
                });
            });

            // From courses:
            Object.entries(courses).forEach(([classId, course]) => {
                const courseName = course.courseName || course.name || 'Class';
                const courseSections = Array.isArray(course.sections) ? course.sections : [];
                courseSections.forEach(sec => {
                    const secName = typeof sec === 'string' ? sec : (sec.name || '');
                    const secYear = typeof sec === 'object' ? (sec.year || '') : '';
                    if (!secName) return;
                    const secKey = secName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const value = `${classId}|${secKey}`;
                    if (!scopeMap.has(value)) {
                        scopeMap.set(value, {
                            classId,
                            sectionKey: secKey,
                            className: formatClassDisplay(courseName, 'Class'),
                            section: secName,
                            year: secYear,
                            value,
                            isUserSection: secName.toLowerCase() === userSection
                        });
                    }
                });
            });

            const scopeList = Array.from(scopeMap.values()).sort((a, b) =>
                a.className.localeCompare(b.className) || a.section.localeCompare(b.section)
            );
            timetableState.scopeList = scopeList;

            // Populate Section Dropdown
            if (sectionSelect) {
                if (scopeList.length === 0) {
                    sectionSelect.innerHTML = '<option value="">No schedules configured</option>';
                    sectionSelect.disabled = true;
                } else {
                    sectionSelect.disabled = false;
                    let optionsHtml = '';

                    // My Class Section vs Other Sections
                    const myClassItems = scopeList.filter(s => s.isUserSection);
                    const otherItems = scopeList.filter(s => !s.isUserSection);

                    if (myClassItems.length > 0) {
                        optionsHtml += `<optgroup label="My Class Section">` +
                            myClassItems.map(item => `<option value="${item.value}">${escapeHtml(item.className)} · Sec ${escapeHtml(item.section)}</option>`).join('') +
                            `</optgroup>`;
                    }
                    if (otherItems.length > 0) {
                        optionsHtml += `<optgroup label="All School Sections (${otherItems.length})">` +
                            otherItems.map(item => `<option value="${item.value}">${escapeHtml(item.className)} · Sec ${escapeHtml(item.section)}</option>`).join('') +
                            `</optgroup>`;
                    }

                    sectionSelect.innerHTML = optionsHtml;

                    // Choose selected
                    if (timetableState.selectedKey && scopeList.some(s => s.value === timetableState.selectedKey)) {
                        sectionSelect.value = timetableState.selectedKey;
                    } else if (myClassItems.length > 0) {
                        sectionSelect.value = myClassItems[0].value;
                        timetableState.selectedKey = myClassItems[0].value;
                    } else if (scopeList.length > 0) {
                        sectionSelect.value = scopeList[0].value;
                        timetableState.selectedKey = scopeList[0].value;
                    }
                }
            }

            renderTimetableGrid();

            if (forceRefresh) {
                showModernToast('Timetable refreshed.', 'success', 2500);
            }
        } catch (err) {
            console.error('Error rendering student timetable:', err);
            if (gridEl) {
                gridEl.innerHTML = `
                    <div class="ar-empty-state-card">
                        <i class="fas fa-triangle-exclamation ar-empty-state-icon" style="color:var(--sp-danger)"></i>
                        <h4 class="ar-empty-title">Failed to Load Timetable</h4>
                        <p class="ar-empty-desc">${err.message || 'Please verify internet connection.'}</p>
                    </div>
                `;
            }
        } finally {
            timetableState.isLoading = false;
        }
    }

    function renderTimetableGrid() {
        const gridEl = document.getElementById('tt-grid-container');
        const badgeText = document.getElementById('tt-class-name-display');
        const todayIndicator = document.getElementById('tt-today-name');
        const liveBanner = document.getElementById('tt-live-banner');
        const liveInfo = document.getElementById('tt-live-info');
        if (!gridEl) return;

        const { scopeList, selectedKey, settings, schedules, courses } = timetableState;
        const currentItem = scopeList.find(s => s.value === selectedKey);

        if (!currentItem) {
            gridEl.innerHTML = `
                <div class="ar-empty-state-card">
                    <i class="fas fa-calendar-day ar-empty-state-icon"></i>
                    <h4 class="ar-empty-title">No Timetable Selected</h4>
                    <p class="ar-empty-desc">Please choose a class section from the dropdown above.</p>
                </div>
            `;
            return;
        }

        // Update badge text in header
        if (badgeText) {
            badgeText.innerText = `${currentItem.className} · Sec ${currentItem.section}${currentItem.year ? ' (' + currentItem.year + ')' : ''}`;
        }

        // Today info & Live detection
        const now = new Date();
        const daysMapShort = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const currentDayKey = daysMapShort[now.getDay()];
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        if (todayIndicator) {
            todayIndicator.innerText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }

        const timetable = schedules[currentItem.classId]?.[currentItem.sectionKey] || {};
        const periods = settings.periods || [];
        const days = settings.days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const lunchBreak = settings.lunchBreak || { enabled: false };

        if (periods.length === 0) {
            gridEl.innerHTML = `
                <div class="ar-empty-state-card">
                    <i class="fas fa-clock ar-empty-state-icon"></i>
                    <h4 class="ar-empty-title">Schedule Periods Not Configured</h4>
                    <p class="ar-empty-desc">Your institution has not set up schedule bell timings yet.</p>
                </div>
            `;
            return;
        }

        // Check if there is an active live class right now in this section
        let liveClassFound = null;
        if (currentDayKey !== 'sun') {
            periods.forEach(p => {
                if (p.start && p.end && p.start <= currentTimeStr && currentTimeStr < p.end) {
                    const slot = timetable.slots?.[currentDayKey]?.[p.id];
                    if (slot && slot.subject) {
                        liveClassFound = { period: p, slot };
                    }
                }
            });
        }

        if (liveBanner) {
            if (liveClassFound) {
                liveBanner.style.display = 'flex';
                if (liveInfo) {
                    liveInfo.innerHTML = `<strong>${escapeHtml(liveClassFound.slot.subject)}</strong> · ${liveClassFound.slot.room ? 'Room ' + escapeHtml(liveClassFound.slot.room) + ' · ' : ''}${liveClassFound.period.start} – ${liveClassFound.period.end}${liveClassFound.slot.teacherName ? ' · ' + escapeHtml(liveClassFound.slot.teacherName) : ''}`;
                }
            } else {
                liveBanner.style.display = 'none';
            }
        }

        // Build Table Columns
        const columns = [];
        periods.forEach(period => {
            columns.push({ type: 'period', period });
            if (lunchBreak.enabled && lunchBreak.afterPeriodId === period.id) {
                columns.push({ type: 'lunch' });
            }
        });

        // Header HTML
        const headerCols = columns.map(col => {
            if (col.type === 'lunch') {
                return `<th>${escapeHtml(lunchBreak.label || 'Lunch Break')}<span class="tt-period-time-sub">${lunchBreak.start || ''}–${lunchBreak.end || ''}</span></th>`;
            }
            return `<th>${escapeHtml(col.period.name || 'Period')}<span class="tt-period-time-sub">${col.period.start && col.period.end ? `${col.period.start}–${col.period.end}` : '—'}</span></th>`;
        }).join('');

        const headerHtml = `
            <thead>
                <tr>
                    <th class="tt-day-col-header">Day</th>
                    ${headerCols}
                </tr>
            </thead>
        `;

        // Rows HTML
        const daysMeta = new Map(DAYS_CONFIG.map(([k, name, short]) => [k, { name, short }]));
        let rowsHtml = '';

        days.forEach(dayKey => {
            const meta = daysMeta.get(dayKey) || { name: dayKey.toUpperCase(), short: dayKey.toUpperCase() };
            const isToday = dayKey === currentDayKey;

            const cellsHtml = columns.map(col => {
                if (col.type === 'lunch') {
                    return `
                        <td>
                            <div class="tt-lunch-card">
                                <i class="fas fa-utensils"></i>
                                <span>${escapeHtml(lunchBreak.label || 'Recess / Lunch')}</span>
                                <span style="font-size:0.68rem; opacity:0.8;">${lunchBreak.duration ? lunchBreak.duration + ' min' : ''}</span>
                            </div>
                        </td>
                    `;
                }

                const period = col.period;
                const slot = timetable.slots?.[dayKey]?.[period.id];
                const isLiveNow = isToday && period.start && period.end && period.start <= currentTimeStr && currentTimeStr < period.end;

                if (!slot || !slot.subject) {
                    return `
                        <td>
                            <div class="tt-empty-slot">
                                <span>Free Period</span>
                            </div>
                        </td>
                    `;
                }

                const subjectName = slot.subject;
                const teacherName = slot.teacherName || 'Faculty Assigned';
                const roomName = slot.room || 'Classroom';

                return `
                    <td>
                        <div class="tt-slot-card ${isLiveNow ? 'tt-live-period' : ''}">
                            ${isLiveNow ? '<span class="tt-live-badge"><i class="fas fa-satellite-dish"></i> Live Now</span>' : ''}
                            <div class="tt-slot-subject">${escapeHtml(subjectName)}</div>
                            <div class="tt-slot-meta">
                                <div class="tt-slot-meta-item">
                                    <i class="fas fa-chalkboard-user"></i>
                                    <span>${escapeHtml(teacherName)}</span>
                                </div>
                                <div class="tt-slot-meta-item">
                                    <i class="fas fa-door-open"></i>
                                    <span>${escapeHtml(roomName)}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                `;
            }).join('');

            rowsHtml += `
                <tr class="${isToday ? 'tt-today-row' : ''}">
                    <td class="tt-day-cell">
                        <span class="tt-day-full">${escapeHtml(meta.name)}</span>
                        <span class="tt-day-short">${escapeHtml(meta.short)}</span>
                        ${isToday ? '<span class="tt-today-badge">Today</span>' : ''}
                    </td>
                    ${cellsHtml}
                </tr>
            `;
        });

        // 5. Build Mobile Cards for Active Selected Day
        if (!timetableState.selectedDayKey || !days.includes(timetableState.selectedDayKey)) {
            timetableState.selectedDayKey = days.includes(currentDayKey) ? currentDayKey : (days[0] || 'mon');
        }
        if (!timetableState.mobileView) {
            timetableState.mobileView = 'day';
        }

        const activeMobileDay = timetableState.selectedDayKey;
        const isMobileDayToday = activeMobileDay === currentDayKey;

        let mobileCardsHtml = '';
        columns.forEach((col, idx) => {
            if (col.type === 'lunch') {
                mobileCardsHtml += `
                    <div class="tt-mobile-lunch-card">
                        <div class="tt-mobile-lunch-icon"><i class="fas fa-utensils"></i></div>
                        <div>
                            <div class="tt-mobile-lunch-title">${escapeHtml(lunchBreak.label || 'Recess / Lunch Interval')}</div>
                            <div class="tt-mobile-lunch-time">${lunchBreak.start && lunchBreak.end ? `${lunchBreak.start} – ${lunchBreak.end}` : ''}${lunchBreak.duration ? ' · ' + lunchBreak.duration + ' mins' : ''}</div>
                        </div>
                    </div>
                `;
                return;
            }

            const period = col.period;
            const slot = timetable.slots?.[activeMobileDay]?.[period.id];
            const isLiveNow = isMobileDayToday && period.start && period.end && period.start <= currentTimeStr && currentTimeStr < period.end;
            const timeRange = period.start && period.end ? `${period.start} – ${period.end}` : 'Time not set';

            if (!slot || !slot.subject) {
                mobileCardsHtml += `
                    <div class="tt-mobile-period-card empty-card">
                        <div class="tt-mobile-period-top">
                            <span class="tt-mobile-period-name"><i class="fas fa-layer-group"></i> ${escapeHtml(period.name || `Period ${idx + 1}`)}</span>
                            <span class="tt-mobile-time-pill"><i class="far fa-clock"></i> ${timeRange}</span>
                        </div>
                        <div class="tt-mobile-empty-text"><i class="far fa-calendar-minus"></i> Free Period / No Class Scheduled</div>
                    </div>
                `;
                return;
            }

            const subjectName = slot.subject;
            const teacherName = slot.teacherName || 'Faculty Assigned';
            const roomName = slot.room || 'Classroom';

            mobileCardsHtml += `
                <div class="tt-mobile-period-card ${isLiveNow ? 'live-card' : ''}">
                    ${isLiveNow ? '<div class="tt-mobile-live-badge"><i class="fas fa-satellite-dish"></i> Live Ongoing Class</div>' : ''}
                    <div class="tt-mobile-period-top">
                        <span class="tt-mobile-period-name"><i class="fas fa-layer-group"></i> ${escapeHtml(period.name || `Period ${idx + 1}`)}</span>
                        <span class="tt-mobile-time-pill"><i class="far fa-clock"></i> ${timeRange}</span>
                    </div>
                    <div class="tt-mobile-subject-title">${escapeHtml(subjectName)}</div>
                    <div class="tt-mobile-meta-row">
                        <div class="tt-mobile-meta-pill">
                            <i class="fas fa-chalkboard-user"></i>
                            <span>${escapeHtml(teacherName)}</span>
                        </div>
                        <div class="tt-mobile-meta-pill">
                            <i class="fas fa-door-open"></i>
                            <span>${escapeHtml(roomName)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        gridEl.innerHTML = `
            <!-- Mobile View Switcher (Visible on Mobile) -->
            <div class="tt-view-switch-bar">
                <button type="button" class="tt-view-switch-btn ${timetableState.mobileView === 'day' ? 'active' : ''}" data-view="day">
                    <i class="fas fa-calendar-day"></i> Day View
                </button>
                <button type="button" class="tt-view-switch-btn ${timetableState.mobileView === 'grid' ? 'active' : ''}" data-view="grid">
                    <i class="fas fa-table-cells"></i> Weekly Matrix
                </button>
            </div>

            <!-- Mobile Day Strip (Visible on Mobile) -->
            <div class="tt-mobile-day-strip ${timetableState.mobileView === 'grid' ? 'mobile-hidden' : ''}" role="tablist">
                ${days.map(dayKey => {
                    const meta = daysMeta.get(dayKey) || { name: dayKey.toUpperCase(), short: dayKey.toUpperCase() };
                    const isDayToday = dayKey === currentDayKey;
                    const isSelected = dayKey === timetableState.selectedDayKey;
                    return `
                        <button type="button" class="tt-day-chip ${isSelected ? 'active' : ''} ${isDayToday ? 'is-today' : ''}" data-day="${dayKey}">
                            <span class="tt-day-chip-name">${escapeHtml(meta.short)}</span>
                            ${isDayToday ? '<span class="tt-day-chip-badge">Today</span>' : ''}
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Mobile Day Cards (Visible on Mobile in Day View) -->
            <div class="tt-mobile-day-container ${timetableState.mobileView === 'grid' ? 'mobile-hidden' : ''}">
                <div class="tt-mobile-day-header">
                    <div class="tt-mobile-day-title">
                        <i class="fas fa-calendar-check"></i>
                        <span>${escapeHtml(daysMeta.get(timetableState.selectedDayKey)?.name || 'Schedule')}</span>
                    </div>
                    ${timetableState.selectedDayKey === currentDayKey ? '<span class="tt-mobile-today-pill"><i class="fas fa-bolt"></i> Today</span>' : ''}
                </div>
                <div class="tt-mobile-cards-list">
                    ${mobileCardsHtml}
                </div>
            </div>

            <!-- Full Weekly Matrix Table (Always on Desktop, toggleable on Mobile) -->
            <div class="tt-grid-matrix-container ${timetableState.mobileView === 'day' ? 'mobile-hidden' : ''}">
                <div class="tt-mobile-scroll-hint"><i class="fas fa-arrows-left-right"></i> Swipe horizontally to view all periods</div>
                <table class="tt-grid-table">
                    ${headerHtml}
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    /**
     * Formats class/grade cleanly without duplicate "Class Class" repetitions.
     * E.g.: "Class 10" -> "Class 10", "10" -> "Class 10", "Class Class 10" -> "Class 10",
     *       "Grade 10" -> "Grade 10", "School Student" -> "School Student"
     */
    function formatClassDisplay(rawVal, defaultVal = 'Not assigned') {
        if (rawVal === undefined || rawVal === null) return defaultVal;
        let val = String(rawVal).trim();
        if (!val || val.toLowerCase() === 'not assigned' || val.toLowerCase() === 'not set') return defaultVal;

        if (/^(school\s+student|undergraduate\s+student|student)$/i.test(val)) {
            return val;
        }

        // Collapse any duplicated "Class " repetitions at the beginning
        val = val.replace(/^(class\s*)+/i, '').trim();

        // Collapse any duplicated "Grade " repetitions
        val = val.replace(/^(grade\s*)+/i, 'Grade ').trim();

        if (!val) return defaultVal;

        // If it starts with Grade/Standard/Std, preserve as-is
        if (/^(grade|standard|std)\b/i.test(val)) {
            return val;
        }

        // Return with single clean "Class " prefix
        return `Class ${val}`;
    }

    // Window Exports & Bridges
    window.showModernToast = showModernToast;
    window.studentLoadAttendanceHistory = loadAttendanceHistory;
    window.loadAttendanceHistory = loadAttendanceHistory;
    window.studentInitHistoryControls = initAttendanceRecordsModule;
    window.studentRenderTimetable = renderStudentTimetable;
    window.renderStudentTimetable = renderStudentTimetable;
    window._rollcallStudentState = state;

})();
