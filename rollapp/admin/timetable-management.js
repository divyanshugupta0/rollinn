document.addEventListener('DOMContentLoaded', () => {
    const DAY_OPTIONS = [
        ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
        ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']
    ];
    const DEFAULT_PERIODS = Array.from({ length: 8 }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Period ${index + 1}`,
        start: '',
        end: ''
    }));
    let root = null;
    let schoolId = '';
    let adminUid = '';
    let classes = [];
    let periods = DEFAULT_PERIODS.map(period => ({ ...period }));
    let days = DAY_OPTIONS.slice(0, 6).map(([key]) => key);
    let lunchBreak = { enabled: true, afterPeriodId: 'p4', duration: 0, customDuration: false, start: '', end: '' };
    let assignments = {};
    let selectedSection = null;
    let slots = {};
    let saving = false;

    // IndexedDB & Versioned Cache variables
    let allSchoolTimetables = {};
    let currentTimetableVersion = 0;
    let versionListenerRef = null;

    const IDB_NAME = 'RollCall_Timetables_DB';
    const IDB_VERSION = 1;
    const IDB_STORE = 'school_timetables';

    function openIndexedDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('IndexedDB is not supported in this environment.'));
            }
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'schoolId' });
                }
            };
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = event => reject(event.target.error || new Error('Failed to open IndexedDB.'));
        });
    }

    async function getCachedTimetables(targetSchoolId) {
        try {
            const db = await openIndexedDB();
            return new Promise(resolve => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(targetSchoolId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (err) {
            console.warn('[Timetable Cache] IndexedDB get error:', err);
            return null;
        }
    }

    async function setCachedTimetables(targetSchoolId, version, timetables) {
        try {
            const db = await openIndexedDB();
            return new Promise(resolve => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                store.put({
                    schoolId: targetSchoolId,
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

    async function syncSchoolTimetables(forceRefresh = false) {
        if (!schoolId) return;
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
                allSchoolTimetables = cached.timetables;
                currentTimetableVersion = cached.version;
            } else {
                const snap = await db.ref(`schoolTimetables/${schoolId}`).once('value');
                allSchoolTimetables = snap.val() || {};
                currentTimetableVersion = remoteVersion;

                if (!versionSnap.exists()) {
                    await db.ref(`schoolTimetablesVersion/${schoolId}`).set({
                        version: remoteVersion,
                        updatedAt: Date.now(),
                        updatedBy: adminUid
                    });
                }

                await setCachedTimetables(schoolId, currentTimetableVersion, allSchoolTimetables);
            }
        } catch (err) {
            console.warn('[Timetable Cache] Sync error:', err);
            if (!allSchoolTimetables || Object.keys(allSchoolTimetables).length === 0) {
                try {
                    const snap = await firebase.database().ref(`schoolTimetables/${schoolId}`).once('value');
                    allSchoolTimetables = snap.val() || {};
                } catch (e) {
                    console.error('Fallback read error:', e);
                }
            }
        }
    }

    function listenToTimetableVersion() {
        if (!schoolId) return;
        if (versionListenerRef) {
            versionListenerRef.off('value');
        }
        versionListenerRef = firebase.database().ref(`schoolTimetablesVersion/${schoolId}`);
        versionListenerRef.on('value', async snapshot => {
            if (!snapshot.exists()) return;
            const val = snapshot.val();
            const remoteVersion = (typeof val === 'object' && val !== null) ? Number(val.version || 1) : Number(val || 1);
            if (remoteVersion !== currentTimetableVersion) {
                console.log(`[Timetable] Remote version changed from ${currentTimetableVersion} to ${remoteVersion}. Syncing cache...`);
                await syncSchoolTimetables(true);
                if (currentSection()) {
                    renderGrid();
                }
            }
        });
    }

    const field = id => root?.querySelector(`#${id}`) || null;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const safeKey = value => Array.from(new TextEncoder().encode(String(value)), byte => byte.toString(16).padStart(2, '0')).join('');
    const sectionKey = section => safeKey(`${section.year || ''}|${section.name}`);
    const subjectKey = subject => safeKey(String(subject).trim().toLocaleLowerCase());
    const classOptionId = item => item.id;
    const selectedClass = () => classes.find(item => item.id === field('tmClassSelect')?.value) || null;
    const timeToMinutes = value => {
        const [hours, minutes] = String(value || '').split(':').map(Number);
        return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : NaN;
    };
    const minutesToTime = value => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

    function calculateIntervals() {
        const start = timeToMinutes(field('tmStartTime')?.value);
        const end = timeToMinutes(field('tmEndTime')?.value);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            throw new Error('Enter a school-day end time later than its start time.');
        }
        const total = end - start;
        const enabled = Boolean(field('tmLunchEnabled')?.checked);
        const afterPeriodId = field('tmLunchAfter')?.value || '';
        const customLunchDuration = String(field('tmLunchDuration')?.value || '').trim();
        const hasCustomLunchDuration = Boolean(customLunchDuration);
        const lunchDuration = enabled
            ? customLunchDuration ? Number(customLunchDuration) : Math.round(total / (periods.length + 1))
            : 0;
        if (enabled && (!Number.isInteger(lunchDuration) || lunchDuration < 1 || lunchDuration > 240 || lunchDuration >= total)) {
            throw new Error('Enter a lunch duration from 1 to 240 minutes.');
        }
        if (enabled && !periods.some(period => period.id === afterPeriodId)) {
            throw new Error('Choose which class interval the lunch break follows.');
        }
        const teachingMinutes = total - lunchDuration;
        if (teachingMinutes < periods.length) {
            throw new Error('The selected day length and lunch duration are too short for the configured class intervals.');
        }
        const baseDuration = Math.floor(teachingMinutes / periods.length);
        const extraMinutes = teachingMinutes % periods.length;
        let cursor = start;
        const calculatedPeriods = periods.map((period, index) => {
            const duration = baseDuration + (index < extraMinutes ? 1 : 0);
            const calculated = {...period, start: minutesToTime(cursor), end: minutesToTime(cursor + duration)};
            cursor += duration;
            if (enabled && period.id === afterPeriodId) {
                lunchBreak = {
                    enabled: true,
                    afterPeriodId,
                    duration: lunchDuration,
                    customDuration: hasCustomLunchDuration,
                    start: minutesToTime(cursor),
                    end: minutesToTime(cursor + lunchDuration)
                };
                cursor += lunchDuration;
            }
            return calculated;
        });
        if (!enabled) lunchBreak = {enabled: false, afterPeriodId: '', duration: 0, customDuration: false, start: '', end: ''};
        if (cursor !== end) throw new Error('Could not fit the class intervals into the selected school-day time range.');
        periods = calculatedPeriods;
        return {periods: calculatedPeriods, lunchBreak: {...lunchBreak}};
    }

    function status(message, isError = false) {
        const output = field('tmStatus');
        if (!output) return;
        output.textContent = message;
        output.style.color = isError ? '#b42318' : '';
    }

    function classSubjects(record) {
        const value = record?.data?.subjects ?? record?.data?.subject;
        let values = [];
        if (Array.isArray(value)) {
            value.forEach(v => {
                if (Array.isArray(v)) values.push(...v);
                else if (typeof v === 'string') values.push(...v.split(/[,\n\r]+/));
                else if (v && typeof v === 'object') values.push(...Object.values(v));
                else if (v) values.push(v);
            });
        } else if (typeof value === 'string') {
            values = value.split(/[,\n\r]+/);
        } else if (value && typeof value === 'object') {
            values = Object.values(value);
        }
        const unique = new Map();
        values.forEach(item => {
            const rawName = (item && typeof item === 'object')
                ? (item.name || item.subject || item.title || item.subjectName || item.value || '')
                : item;
            const subject = String(rawName || '').trim().replace(/\s+/g, ' ');
            if (subject && !unique.has(subject.toLocaleLowerCase())) {
                unique.set(subject.toLocaleLowerCase(), subject);
            }
        });
        return [...unique.values()].sort((a, b) => a.localeCompare(b));
    }

    function sectionsFor(record) {
        const sectionsByYear = record?.data?.sectionsByYear || {};
        const fromYears = Object.entries(sectionsByYear).flatMap(([year, values]) =>
            (Array.isArray(values) ? values : typeof values === 'string' ? values.split(',') : [])
                .map(value => String(value || '').trim())
                .filter(Boolean)
                .map(name => ({ name, year }))
        );
        if (fromYears.length) {
            return fromYears.sort((a, b) => Number(a.year) - Number(b.year) || a.name.localeCompare(b.name));
        }
        const fallbackList = Array.isArray(record?.data?.sections)
            ? record.data.sections
            : typeof (record?.data?.sections || record?.data?.section) === 'string'
                ? (record.data.sections || record.data.section).split(',')
                : [];
        return fallbackList
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .map(name => ({ name, year: '1' }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function renderDays() {
        const container = field('tmDays');
        if (!container) return;
        container.innerHTML = DAY_OPTIONS.map(([key, label]) =>
            `<label><input type="checkbox" value="${key}" ${days.includes(key) ? 'checked' : ''}> ${label}</label>`
        ).join('');
    }

    function renderPeriods() {
        const container = field('tmPeriods');
        if (!container) return;
        container.innerHTML = periods.map((period, index) => `
            <div class="tm-period-row" data-period-index="${index}">
                <input type="text" maxlength="32" value="${escape(period.name)}" aria-label="Period ${index + 1} name" placeholder="Period name">
                <button type="button" class="secondary-btn tm-remove-period" data-index="${index}" aria-label="Remove period ${index + 1}"><i class="fas fa-trash"></i></button>
            </div>`).join('');
        renderLunchOptions();
    }

    function readPeriodInputs() {
        const rows = [...(field('tmPeriods')?.querySelectorAll('.tm-period-row') || [])];
        periods = rows.map((row, index) => {
            const inputs = row.querySelectorAll('input');
            return {
                id: `p${index + 1}`,
                name: String(inputs[0]?.value || '').trim() || `Period ${index + 1}`,
                start: periodStart(index),
                end: periodEnd(index)
            };
        });
    }

    function periodStart(index) { return periods[index]?.start || ''; }
    function periodEnd(index) { return periods[index]?.end || ''; }

    function renderLunchOptions() {
        const select = field('tmLunchAfter');
        if (!select) return;
        const previous = lunchBreak.afterPeriodId || select.value;
        select.innerHTML = periods.map((period, index) =>
            `<option value="${escape(period.id)}">After ${escape(period.name || `Period ${index + 1}`)}</option>`
        ).join('');
        const defaultLunchIndex = Math.max(0, Math.ceil(periods.length / 2) - 1);
        select.value = periods.some(period => period.id === previous) ? previous : (periods[defaultLunchIndex]?.id || '');
        lunchBreak.afterPeriodId = select.value;
        select.disabled = !periods.length || saving;
        const enabled = Boolean(field('tmLunchEnabled')?.checked);
        select.closest('label')?.classList.toggle('tm-disabled', !enabled);
        select.disabled = !enabled || !periods.length || saving;
        const duration = field('tmLunchDuration');
        if (duration) duration.disabled = !enabled || saving;
    }

    function gridColumns() {
        const columns = [];
        periods.forEach(period => {
            columns.push({type: 'period', period});
            if (lunchBreak.enabled && lunchBreak.afterPeriodId === period.id) columns.push({type: 'lunch'});
        });
        return columns;
    }

    function previewIntervals() {
        readPeriodInputs();
        lunchBreak.enabled = Boolean(field('tmLunchEnabled')?.checked);
        lunchBreak.afterPeriodId = String(field('tmLunchAfter')?.value || '');
        try {
            calculateIntervals();
            status('Previewing shared class and lunch intervals. Save intervals to apply them to every class.');
        } catch (error) {
            status(error.message || 'Enter valid school-day intervals.', true);
        }
        renderLunchOptions();
        renderGrid();
    }

    function selectedDays() {
        return [...(field('tmDays')?.querySelectorAll('input:checked') || [])].map(input => input.value);
    }

    function assignmentFor(section, subject) {
        const record = selectedClass();
        return assignments[record?.id]?.[sectionKey(section)]?.[subjectKey(subject)] || null;
    }

    function assignmentForClassSection(classId, sKey, subject) {
        return assignments[classId]?.[sKey]?.[subjectKey(subject)] || null;
    }

    function currentSection() {
        const record = selectedClass();
        return record?.sections.find(section => sectionKey(section) === field('tmSectionSelect')?.value) || null;
    }

    // Conflict detection across all cached school timetables
    function findConflictsForSlot(day, periodId, teacherId, currentClassId, currentSecKey) {
        if (!teacherId || !allSchoolTimetables) return [];
        const conflicts = [];
        
        Object.entries(allSchoolTimetables).forEach(([cId, classSections]) => {
            if (!classSections || typeof classSections !== 'object') return;
            Object.entries(classSections).forEach(([sKey, schedule]) => {
                if (!schedule || typeof schedule !== 'object') return;
                // Exclude the exact class section currently being edited
                if (String(cId) === String(currentClassId) && String(sKey) === String(currentSecKey)) {
                    return;
                }
                const otherSlot = schedule.slots?.[day]?.[periodId];
                if (!otherSlot || !otherSlot.subject) return;

                let otherTeacherId = otherSlot.teacherId;
                let otherTeacherName = otherSlot.teacherName;
                if (!otherTeacherId) {
                    const assigned = assignmentForClassSection(cId, sKey, otherSlot.subject);
                    if (assigned) {
                        otherTeacherId = assigned.teacherId;
                        otherTeacherName = assigned.teacherName;
                    }
                }

                if (otherTeacherId && String(otherTeacherId) === String(teacherId)) {
                    const matchedClass = classes.find(c => String(c.id) === String(cId));
                    const className = schedule.className || matchedClass?.data?.courseName || matchedClass?.data?.name || 'Class';
                    const sectionName = schedule.section || 'Section';
                    conflicts.push({
                        teacherId,
                        teacherName: otherTeacherName || 'Assigned teacher',
                        conflictingClassId: cId,
                        conflictingClassName: className,
                        conflictingSectionKey: sKey,
                        conflictingSection: sectionName,
                        conflictingSubject: otherSlot.subject,
                        day,
                        periodId,
                        periodName: periods.find(p => p.id === periodId)?.name || periodId
                    });
                }
            });
        });

        return conflicts;
    }

    function getAllCurrentConflicts() {
        const record = selectedClass();
        const section = currentSection();
        if (!record || !section) return [];
        const secKey = sectionKey(section);
        const activeDays = selectedDays();
        const result = [];
        const dayLabels = new Map(DAY_OPTIONS);

        activeDays.forEach(day => {
            periods.forEach(period => {
                const slot = slots?.[day]?.[period.id];
                if (!slot || !slot.subject) return;
                const assigned = assignmentFor(section, slot.subject);
                const teacherId = slot.teacherId || assigned?.teacherId;
                if (!teacherId) return;

                const slotConflicts = findConflictsForSlot(day, period.id, teacherId, record.id, secKey);
                slotConflicts.forEach(c => {
                    result.push({
                        ...c,
                        dayLabel: dayLabels.get(day) || day,
                        currentSubject: slot.subject,
                        slotPeriodName: period.name
                    });
                });
            });
        });

        return result;
    }

    function renderConflictBanner() {
        let banner = field('tmConflictBanner');
        if (!banner) {
            const gridWrap = field('tmGridWrap');
            if (gridWrap) {
                banner = document.createElement('div');
                banner.id = 'tmConflictBanner';
                banner.className = 'tm-conflict-banner';
                gridWrap.parentNode.insertBefore(banner, gridWrap);
            }
        }
        if (!banner) return;
        const conflicts = getAllCurrentConflicts();
        if (!conflicts.length) {
            banner.style.display = 'none';
            banner.innerHTML = '';
            return;
        }
        banner.style.display = 'block';
        banner.innerHTML = `
            <div class="tm-conflict-alert">
                <div class="tm-conflict-alert-header">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span><strong>${conflicts.length} Teacher Conflict${conflicts.length === 1 ? '' : 's'} Detected in this Timetable</strong></span>
                </div>
                <p style="margin:4px 0 8px;font-size:0.8rem;color:#771d1d">The assigned teacher is already scheduled in another class at the same time:</p>
                <ul class="tm-conflict-list">
                    ${conflicts.map(c => `<li><strong>${escape(c.dayLabel)} · ${escape(c.slotPeriodName)}:</strong> <span style="font-weight:600">${escape(c.teacherName)}</span> is already scheduled in <strong>${escape(c.conflictingClassName)} · ${escape(c.conflictingSection)}</strong> (Subject: <em>${escape(c.conflictingSubject)}</em>).</li>`).join('')}
                </ul>
            </div>
        `;
    }

    function renderGrid() {
        const wrap = field('tmGridWrap');
        const record = selectedClass();
        const section = currentSection();
        const activeDays = selectedDays();
        if (!wrap) return;
        if (!record || !section) {
            wrap.innerHTML = '<div class="tm-empty">Choose a class and section to edit its timetable.</div>';
            renderConflictBanner();
            return;
        }
        if (!periods.length || !activeDays.length) {
            wrap.innerHTML = '<div class="tm-empty">Add at least one period and select at least one school day.</div>';
            renderConflictBanner();
            return;
        }
        const subjects = classSubjects(record);
        const dayLabels = new Map(DAY_OPTIONS);
        const columns = gridColumns();
        const secKey = sectionKey(section);

        const headers = ['<th>Day</th>', ...columns.map(column => column.type === 'period'
            ? `<th>${escape(column.period.name)}</th>`
            : '<th class="tm-lunch-cell">Lunch break</th>'
        )].join('');
        const intervalRow = `<tr class="tm-interval-row"><td>Class interval</td>${columns.map(column => {
            if (column.type === 'lunch') return `<td class="tm-lunch-cell">${escape(lunchBreak.start)}–${escape(lunchBreak.end)}<br>${lunchBreak.duration} min</td>`;
            const period = column.period;
            return `<td>${period.start && period.end ? `${escape(period.start)}–${escape(period.end)}` : 'Save intervals to calculate'}</td>`;
        }).join('')}</tr>`;

        const rows = activeDays.map(day => `<tr><td>${escape(dayLabels.get(day) || day)}</td>${columns.map(column => {
            if (column.type === 'lunch') return '<td class="tm-lunch-cell">Lunch break</td>';
            const period = column.period;
            const selected = slots?.[day]?.[period.id]?.subject || '';
            const assigned = selected ? assignmentFor(section, selected) : null;
            const teacherId = assigned?.teacherId || slots?.[day]?.[period.id]?.teacherId;
            const conflicts = teacherId ? findConflictsForSlot(day, period.id, teacherId, record.id, secKey) : [];
            const hasConflict = conflicts.length > 0;

            const options = ['<option value="">No lesson</option>', ...subjects.map(subject => {
                const subjAssigned = assignmentFor(section, subject);
                const subjTeacherId = subjAssigned?.teacherId;
                const subjConflicts = subjTeacherId ? findConflictsForSlot(day, period.id, subjTeacherId, record.id, secKey) : [];
                const conflictHint = subjConflicts.length ? ` ⚠️ (Conflict: ${escape(subjConflicts[0].teacherName)} busy in ${escape(subjConflicts[0].conflictingClassName)} ${escape(subjConflicts[0].conflictingSection)})` : '';
                return `<option value="${escape(subject)}" ${subject === selected ? 'selected' : ''}>${escape(subject)}${conflictHint}</option>`;
            })].join('');

            let teacherTag = '';
            if (hasConflict) {
                const c = conflicts[0];
                teacherTag = `<div class="tm-slot-conflict-tag"><i class="fas fa-triangle-exclamation"></i> <strong>Conflict:</strong> ${escape(c.teacherName)} is already teaching <em>${escape(c.conflictingSubject)}</em> in <strong>${escape(c.conflictingClassName)} (${escape(c.conflictingSection)})</strong></div>`;
            } else if (selected && assigned) {
                teacherTag = `<small class="tm-slot-teacher">${escape(assigned.teacherName || 'Assigned teacher')}</small>`;
            } else if (selected) {
                teacherTag = '<small class="tm-slot-unassigned">No subject teacher assigned</small>';
            }

            const cellClass = hasConflict ? ' class="tm-cell-conflict"' : '';
            return `<td${cellClass}><select data-day="${day}" data-period="${period.id}" aria-label="${escape(dayLabels.get(day))}, ${escape(period.name)}">${options}</select>${teacherTag}</td>`;
        }).join('')}</tr>`).join('');

        wrap.innerHTML = `<table class="tm-grid"><thead><tr>${headers}</tr></thead><tbody>${intervalRow}${rows}</tbody></table>`;
        renderConflictBanner();
    }

    function renderSections() {
        const select = field('tmSectionSelect');
        const record = selectedClass();
        if (!select) return;
        const previous = select.value;
        const sections = record?.sections || [];
        select.innerHTML = '<option value="">Select a section</option>' + sections.map(section =>
            `<option value="${sectionKey(section)}">${escape(section.name)}${section.year ? ` · Year ${escape(section.year)}` : ''}</option>`
        ).join('');
        select.disabled = !sections.length || saving;
        select.value = sections.some(section => sectionKey(section) === previous) ? previous : (sections.length === 1 ? sectionKey(sections[0]) : '');
        selectedSection = currentSection();
        slots = {};
        renderGrid();
    }

    function updateControls() {
        const classSelect = field('tmClassSelect');
        const save = field('tmSaveSchedule');
        const record = selectedClass();
        if (classSelect) classSelect.disabled = saving || !classes.length;
        if (save) save.disabled = saving || !record || !currentSection();
        if (field('tmSaveSettings')) field('tmSaveSettings').disabled = saving;
        if (field('tmAddPeriod')) field('tmAddPeriod').disabled = saving || periods.length >= 16;
        if (field('tmRefresh')) field('tmRefresh').disabled = saving;
        ['tmStartTime', 'tmEndTime', 'tmLunchEnabled', 'tmLunchAfter', 'tmLunchDuration'].forEach(id => {
            const input = field(id);
            if (input && id !== 'tmLunchAfter' && id !== 'tmLunchDuration') input.disabled = saving;
        });
        renderLunchOptions();
    }

    async function loadSelectedSchedule() {
        const record = selectedClass();
        const section = currentSection();
        if (!record || !section) {
            slots = {};
            renderGrid();
            updateControls();
            return;
        }

        const secKey = sectionKey(section);
        // Instant load from cached allSchoolTimetables if available
        const cachedSchedule = allSchoolTimetables[record.id]?.[secKey];
        if (cachedSchedule && cachedSchedule.slots && typeof cachedSchedule.slots === 'object') {
            slots = cachedSchedule.slots;
            renderGrid();
            updateControls();
            status('Timetable loaded from cache. Changes are saved when you select Save timetable.');
            return;
        }

        const sectionSchedulePath = `schoolTimetables/${schoolId}/${record.id}/${secKey}`;
        field('tmGridWrap').innerHTML = '<div class="tm-empty"><i class="fas fa-spinner fa-spin"></i> Loading timetable…</div>';
        try {
            const snapshot = await firebase.database().ref(sectionSchedulePath).once('value');
            const schedule = snapshot.val() || {};
            slots = schedule.slots && typeof schedule.slots === 'object' ? schedule.slots : {};
            if (!allSchoolTimetables[record.id]) allSchoolTimetables[record.id] = {};
            allSchoolTimetables[record.id][secKey] = schedule;
            await setCachedTimetables(schoolId, currentTimetableVersion, allSchoolTimetables);
            renderGrid();
            status('Timetable loaded. Changes are saved when you select Save timetable.');
        } catch (error) {
            console.error('Unable to load class timetable:', error);
            field('tmGridWrap').innerHTML = '<div class="tm-empty">Could not load this section timetable.</div>';
            status(error.message || 'Could not load this timetable.', true);
        }
        updateControls();
    }

    async function loadSchoolData(forceRefresh = false) {
        if (!root) return;
        const classSelect = field('tmClassSelect');
        classSelect.disabled = true;
        classSelect.innerHTML = '<option value="">Loading classes…</option>';
        status('Loading your school timetable settings…');
        try {
            const user = firebase.auth().currentUser;
            if (!user) throw new Error('Sign in as an administrator to manage timetables.');
            const profileSnapshot = await firebase.database().ref(`users/${user.uid}`).once('value');
            const profile = profileSnapshot.val() || {};
            if (profile.role !== 'admin') throw new Error('Administrator access is required.');
            schoolId = String(profile.schoolId || user.uid).trim();
            adminUid = user.uid;

            const [settingsSnapshot, classSnapshot, schoolClassesSnap, assignmentSnapshot] = await Promise.all([
                firebase.database().ref(`schoolTimetableSettings/${schoolId}`).once('value'),
                firebase.database().ref(`schoolCourses/${schoolId}`).once('value'),
                firebase.database().ref(`schoolClasses/${schoolId}`).once('value'),
                firebase.database().ref(`subjectTeacherAssignments/${schoolId}`).once('value')
            ]);
            const config = settingsSnapshot.val() || {};
            days = Array.isArray(config.days) ? config.days.filter(day => DAY_OPTIONS.some(([key]) => key === day)) : DAY_OPTIONS.slice(0, 6).map(([key]) => key);
            periods = Array.isArray(config.periods) && config.periods.length
                ? config.periods.map((period, index) => ({id: `p${index + 1}`, name: String(period.name || `Period ${index + 1}`), start: String(period.start || ''), end: String(period.end || '')}))
                : DEFAULT_PERIODS.map(period => ({...period}));
            const savedLunch = config.lunchBreak || {};
            lunchBreak = {
                enabled: savedLunch.enabled !== false,
                afterPeriodId: String(savedLunch.afterPeriodId || 'p4'),
                duration: Number(savedLunch.duration) || 0,
                customDuration: savedLunch.customDuration === true,
                start: String(savedLunch.start || ''),
                end: String(savedLunch.end || '')
            };
            assignments = assignmentSnapshot.val() || {};

            // Merge classes from schoolCourses and schoolClasses
            classes = [];
            const seenClassNames = new Set();
            classSnapshot.forEach(child => {
                const data = child.val() || {};
                const name = data.courseName || data.name;
                if (!name || data.active === false) return;
                seenClassNames.add(String(name).trim().toLowerCase());
                classes.push({id: child.key, data, sections: sectionsFor({data})});
            });
            schoolClassesSnap.forEach(child => {
                const data = child.val() || {};
                const name = data.name || data.courseName || data.className;
                if (!name || data.active === false) return;
                const norm = String(name).trim().toLowerCase();
                if (seenClassNames.has(norm)) return;
                seenClassNames.add(norm);
                classes.push({id: child.key, data, sections: sectionsFor({data})});
            });
            classes.sort((a, b) => String(a.data.courseName || a.data.name).localeCompare(String(b.data.courseName || b.data.name)));

            // Sync all school timetables from IndexedDB or Firebase
            await syncSchoolTimetables(forceRefresh);
            listenToTimetableVersion();

            renderDays();
            renderPeriods();
            field('tmStartTime').value = String(config.startTime || periods[0]?.start || '08:00');
            field('tmEndTime').value = String(config.endTime || periods[periods.length - 1]?.end || '14:00');
            field('tmLunchEnabled').checked = lunchBreak.enabled;
            field('tmLunchDuration').value = savedLunch.customDuration === true && savedLunch.duration ? String(savedLunch.duration) : '';
            renderLunchOptions();
            let intervalError = '';
            try {
                calculateIntervals();
            } catch (error) {
                intervalError = error.message;
            }
            classSelect.innerHTML = '<option value="">Select a class</option>' + classes.map(item =>
                `<option value="${escape(classOptionId(item))}">${escape(item.data.courseName || item.data.name)}</option>`
            ).join('');
            classSelect.disabled = !classes.length;
            field('tmSectionSelect').innerHTML = '<option value="">Select a class first</option>';
            field('tmSectionSelect').disabled = true;
            renderGrid();
            updateControls();
            if (intervalError) status(`Set valid school-day intervals before saving: ${intervalError}`, true);
            else status(classes.length ? `Loaded ${classes.length} classes.` : 'No class records with sections are configured. Add classes and sections in Manage Courses first.', !classes.length);
        } catch (error) {
            console.error('Unable to load timetable settings:', error);
            classes = [];
            classSelect.innerHTML = '<option value="">Classes could not be loaded</option>';
            updateControls();
            status(error.message || 'Could not load timetable settings.', true);
        }
    }

    async function saveSettings() {
        const user = firebase.auth().currentUser;
        if (!user || user.uid !== adminUid || !schoolId) return status('Your admin session changed. Refresh the panel and try again.', true);
        readPeriodInputs();
        days = selectedDays();
        if (!days.length) return status('Select at least one school day.', true);
        if (!periods.length) return status('Add at least one timetable period.', true);
        if (periods.length > 16) return status('A maximum of 16 periods is supported.', true);
        const names = new Set();
        for (const period of periods) {
            const normalized = period.name.toLocaleLowerCase();
            if (!normalized) return status('Every period needs a name.', true);
            if (names.has(normalized)) return status('Period names must be unique.', true);
            names.add(normalized);
        }
        try {
            lunchBreak.enabled = Boolean(field('tmLunchEnabled')?.checked);
            lunchBreak.afterPeriodId = String(field('tmLunchAfter')?.value || '');
            calculateIntervals();
        } catch (error) {
            return status(error.message || 'Enter valid school-day intervals.', true);
        }
        try {
            saving = true;
            updateControls();
            await firebase.database().ref(`schoolTimetableSettings/${schoolId}`).set({
                schoolId,
                days,
                periods,
                startTime: field('tmStartTime').value,
                endTime: field('tmEndTime').value,
                lunchBreak,
                updatedAt: Date.now(),
                updatedBy: user.uid
            });
            renderGrid();
            status('School timetable intervals saved and applied to every class.');
        } catch (error) {
            console.error('Unable to save timetable settings:', error);
            status(error.message || 'Could not save timetable settings.', true);
        } finally {
            saving = false;
            updateControls();
        }
    }

    async function saveSchedule() {
        const user = firebase.auth().currentUser;
        const record = selectedClass();
        const section = currentSection();
        if (!user || user.uid !== adminUid || !record || !section) return status('Select a class and section, then try again.', true);
        if (!periods.length || !days.length) return status('Save timetable days and periods before editing a schedule.', true);
        readPeriodInputs();

        // Check for conflicts before saving
        const currentConflicts = getAllCurrentConflicts();
        if (currentConflicts.length) {
            const summary = currentConflicts.map(c => `• ${c.dayLabel} ${c.slotPeriodName}: ${c.teacherName} is already teaching in ${c.conflictingClassName} (${c.conflictingSection})`).join('\n');
            status(`Cannot save timetable due to ${currentConflicts.length} teacher conflict(s):\n${summary}`, true);
            renderGrid();
            return;
        }

        const nextSlots = {};
        for (const day of days) {
            nextSlots[day] = {};
            periods.forEach(period => {
                const subject = String(slots?.[day]?.[period.id]?.subject || '').trim();
                if (!subject) return;
                const assigned = assignmentFor(section, subject);
                nextSlots[day][period.id] = {
                    subject,
                    teacherId: assigned?.teacherId || '',
                    teacherName: assigned?.teacherName || '',
                    periodName: period.name,
                    start: period.start,
                    end: period.end
                };
            });
        }
        const sectionPath = `schoolTimetables/${schoolId}/${record.id}/${sectionKey(section)}`;
        try {
            saving = true;
            updateControls();
            status('Saving section timetable…');

            // Save timetable in Firebase
            await firebase.database().ref(sectionPath).set({
                schoolId,
                classId: record.id,
                className: record.data.courseName || record.data.name,
                section: section.name,
                year: section.year || '',
                days,
                periods,
                slots: nextSlots,
                updatedAt: Date.now(),
                updatedBy: user.uid
            });

            // Update in-memory allSchoolTimetables
            if (!allSchoolTimetables[record.id]) allSchoolTimetables[record.id] = {};
            allSchoolTimetables[record.id][sectionKey(section)] = {
                schoolId,
                classId: record.id,
                className: record.data.courseName || record.data.name,
                section: section.name,
                year: section.year || '',
                days,
                periods,
                slots: nextSlots,
                updatedAt: Date.now(),
                updatedBy: user.uid
            };

            // Increment version in Firebase
            const nextVersion = (currentTimetableVersion || 0) + 1;
            await firebase.database().ref(`schoolTimetablesVersion/${schoolId}`).set({
                version: nextVersion,
                updatedAt: Date.now(),
                updatedBy: user.uid
            });
            currentTimetableVersion = nextVersion;

            // Update IndexedDB cache with incremented version
            await setCachedTimetables(schoolId, nextVersion, allSchoolTimetables);

            slots = nextSlots;
            renderGrid();
            status('Section timetable saved successfully.');
        } catch (error) {
            console.error('Unable to save section timetable:', error);
            status(error.message || 'Could not save this section timetable.', true);
        } finally {
            saving = false;
            updateControls();
        }
    }

    function init(panel) {
        root = panel;
        if (root.dataset.timetableManagementBound === 'true') return;
        root.dataset.timetableManagementBound = 'true';
        root.querySelector('#tmRefresh')?.addEventListener('click', () => loadSchoolData(true));
        root.querySelector('#tmSaveSettings')?.addEventListener('click', saveSettings);
        root.querySelector('#tmSaveSchedule')?.addEventListener('click', saveSchedule);
        root.querySelector('#tmAddPeriod')?.addEventListener('click', () => {
            readPeriodInputs();
            periods.push({id: `p${periods.length + 1}`, name: `Period ${periods.length + 1}`, start: '', end: ''});
            renderPeriods();
            renderGrid();
            updateControls();
        });
        root.querySelector('#tmPeriods')?.addEventListener('click', event => {
            const button = event.target instanceof Element ? event.target.closest('.tm-remove-period') : null;
            if (!button) return;
            readPeriodInputs();
            if (periods.length <= 1) return status('At least one period is required.', true);
            periods.splice(Number(button.dataset.index), 1);
            periods = periods.map((period, index) => ({...period, id: `p${index + 1}`}));
            renderPeriods();
            renderGrid();
            updateControls();
        });
        root.querySelector('#tmDays')?.addEventListener('change', () => {
            days = selectedDays();
            renderGrid();
            updateControls();
        });
        root.querySelector('#tmPeriods')?.addEventListener('change', () => {
            readPeriodInputs();
            renderLunchOptions();
            previewIntervals();
        });
        ['tmStartTime', 'tmEndTime', 'tmLunchEnabled', 'tmLunchAfter', 'tmLunchDuration'].forEach(id => {
            root.querySelector(`#${id}`)?.addEventListener('change', previewIntervals);
        });
        root.querySelector('#tmPeriods')?.addEventListener('input', event => {
            if (event.target instanceof HTMLInputElement) previewIntervals();
        });
        root.querySelector('#tmClassSelect')?.addEventListener('change', () => {
            const record = selectedClass();
            const sectionSelect = field('tmSectionSelect');
            sectionSelect.innerHTML = record
                ? '<option value="">Select a section</option>' + record.sections.map(section =>
                    `<option value="${sectionKey(section)}">${escape(section.name)}${section.year ? ` · Year ${escape(section.year)}` : ''}</option>`
                ).join('')
                : '<option value="">Select a class first</option>';
            sectionSelect.disabled = !record?.sections.length;
            slots = {};
            renderGrid();
            updateControls();
        });
        root.querySelector('#tmSectionSelect')?.addEventListener('change', loadSelectedSchedule);
        root.querySelector('#tmGridWrap')?.addEventListener('change', event => {
            const select = event.target instanceof HTMLSelectElement ? event.target : null;
            if (!select?.dataset.day || !select.dataset.period) return;
            const {day, period} = select.dataset;
            const subject = select.value;
            if (!slots[day]) slots[day] = {};
            if (!subject) delete slots[day][period];
            else {
                const section = currentSection();
                const assigned = section && assignmentFor(section, subject);
                const periodInfo = periods.find(item => item.id === period);
                slots[day][period] = {
                    subject,
                    teacherId: assigned?.teacherId || '',
                    teacherName: assigned?.teacherName || '',
                    periodName: periodInfo?.name || period,
                    start: periodInfo?.start || '',
                    end: periodInfo?.end || ''
                };
                if (!assigned) {
                    status(`No teacher is assigned to ${subject} in this section. It can be scheduled, but no teacher timetable will include this lesson.`, true);
                } else {
                    const record = selectedClass();
                    const conflicts = assigned.teacherId ? findConflictsForSlot(day, period, assigned.teacherId, record?.id, sectionKey(section)) : [];
                    if (conflicts.length) {
                        const c = conflicts[0];
                        const dayLabel = DAY_OPTIONS.find(([k]) => k === day)?.[1] || day;
                        status(`⚠️ Conflict detected: ${c.teacherName} is already assigned to ${c.conflictingClassName} · Section ${c.conflictingSection} during ${c.periodName} on ${dayLabel}!`, true);
                    } else {
                        status(`${assigned.teacherName || 'Assigned teacher'} is attached to ${subject}.`);
                    }
                }
            }
            renderGrid();
        });
        loadSchoolData();
    }
    window.AdminPanelAPI?.register('manage-timetable', init, {contentSized: true});
});
