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
    let assignments = {};
    let selectedSection = null;
    let slots = {};
    let saving = false;

    const field = id => root?.querySelector(`#${id}`) || null;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const safeKey = value => Array.from(new TextEncoder().encode(String(value)), byte => byte.toString(16).padStart(2, '0')).join('');
    const sectionKey = section => safeKey(`${section.year || ''}|${section.name}`);
    const subjectKey = subject => safeKey(String(subject).trim().toLocaleLowerCase());
    const classOptionId = item => item.id;
    const selectedClass = () => classes.find(item => item.id === field('tmClassSelect')?.value) || null;
    function status(message, isError = false) {
        const output = field('tmStatus');
        if (!output) return;
        output.textContent = message;
        output.style.color = isError ? '#b42318' : '';
    }
    function classSubjects(record) {
        const value = record?.data.subjects ?? record?.data.subject;
        const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n\r]+/) : [];
        const unique = new Map();
        values.forEach(item => {
            const subject = String(item || '').trim().replace(/\s+/g, ' ');
            if (subject) unique.set(subject.toLocaleLowerCase(), subject);
        });
        return [...unique.values()].sort((a, b) => a.localeCompare(b));
    }
    function sectionsFor(record) {
        const sectionsByYear = record?.data.sectionsByYear || {};
        return Object.entries(sectionsByYear).flatMap(([year, values]) =>
            (Array.isArray(values) ? values : typeof values === 'string' ? values.split(',') : [])
                .map(value => String(value || '').trim())
                .filter(Boolean)
                .map(name => ({ name, year }))
        ).sort((a, b) => Number(a.year) - Number(b.year) || a.name.localeCompare(b.name));
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
                <input type="time" value="${escape(period.start)}" aria-label="Period ${index + 1} start time">
                <input type="time" value="${escape(period.end)}" aria-label="Period ${index + 1} end time">
                <button type="button" class="secondary-btn tm-remove-period" data-index="${index}" aria-label="Remove period ${index + 1}"><i class="fas fa-trash"></i></button>
            </div>`).join('');
    }
    function readPeriodInputs() {
        const rows = [...(field('tmPeriods')?.querySelectorAll('.tm-period-row') || [])];
        periods = rows.map((row, index) => {
            const inputs = row.querySelectorAll('input');
            return {
                id: `p${index + 1}`,
                name: String(inputs[0]?.value || '').trim() || `Period ${index + 1}`,
                start: String(inputs[1]?.value || ''),
                end: String(inputs[2]?.value || '')
            };
        });
    }
    function selectedDays() {
        return [...(field('tmDays')?.querySelectorAll('input:checked') || [])].map(input => input.value);
    }
    function assignmentFor(section, subject) {
        const record = selectedClass();
        return assignments[record?.id]?.[sectionKey(section)]?.[subjectKey(subject)] || null;
    }
    function currentSection() {
        const record = selectedClass();
        return record?.sections.find(section => sectionKey(section) === field('tmSectionSelect')?.value) || null;
    }
    function renderGrid() {
        const wrap = field('tmGridWrap');
        const record = selectedClass();
        const section = currentSection();
        const activeDays = selectedDays();
        if (!wrap) return;
        if (!record || !section) {
            wrap.innerHTML = '<div class="tm-empty">Choose a class and section to edit its timetable.</div>';
            return;
        }
        if (!periods.length || !activeDays.length) {
            wrap.innerHTML = '<div class="tm-empty">Add at least one period and select at least one school day.</div>';
            return;
        }
        const subjects = classSubjects(record);
        const dayLabels = new Map(DAY_OPTIONS);
        const headers = ['<th>Day</th>', ...periods.map(period =>
            `<th>${escape(period.name)}${period.start && period.end ? `<br><small>${escape(period.start)}–${escape(period.end)}</small>` : ''}</th>`
        )].join('');
        const rows = activeDays.map(day => `<tr><td>${escape(dayLabels.get(day) || day)}</td>${periods.map(period => {
            const selected = slots?.[day]?.[period.id]?.subject || '';
            const options = ['<option value="">No lesson</option>', ...subjects.map(subject =>
                `<option value="${escape(subject)}" ${subject === selected ? 'selected' : ''}>${escape(subject)}</option>`
            )].join('');
            const assigned = selected ? assignmentFor(section, selected) : null;
            return `<td><select data-day="${day}" data-period="${period.id}" aria-label="${escape(dayLabels.get(day))}, ${escape(period.name)}">${options}</select>${selected && assigned ? `<small class="tm-slot-teacher">${escape(assigned.teacherName || 'Assigned teacher')}</small>` : selected ? '<small class="tm-slot-unassigned">No subject teacher assigned</small>' : ''}</td>`;
        }).join('')}</tr>`).join('');
        wrap.innerHTML = `<table class="tm-grid"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
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
        const sectionSchedulePath = `schoolTimetables/${schoolId}/${record.id}/${sectionKey(section)}`;
        field('tmGridWrap').innerHTML = '<div class="tm-empty"><i class="fas fa-spinner fa-spin"></i> Loading timetable…</div>';
        try {
            const snapshot = await firebase.database().ref(sectionSchedulePath).once('value');
            const schedule = snapshot.val() || {};
            slots = schedule.slots && typeof schedule.slots === 'object' ? schedule.slots : {};
            renderGrid();
            status('Timetable loaded. Changes are saved when you select Save timetable.');
        } catch (error) {
            console.error('Unable to load class timetable:', error);
            field('tmGridWrap').innerHTML = '<div class="tm-empty">Could not load this section timetable.</div>';
            status(error.message || 'Could not load this timetable.', true);
        }
        updateControls();
    }
    async function loadSchoolData() {
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
            const [settingsSnapshot, classSnapshot, assignmentSnapshot] = await Promise.all([
                firebase.database().ref(`schoolTimetableSettings/${schoolId}`).once('value'),
                firebase.database().ref(`schoolCourses/${schoolId}`).once('value'),
                firebase.database().ref(`subjectTeacherAssignments/${schoolId}`).once('value')
            ]);
            const config = settingsSnapshot.val() || {};
            days = Array.isArray(config.days) ? config.days.filter(day => DAY_OPTIONS.some(([key]) => key === day)) : DAY_OPTIONS.slice(0, 6).map(([key]) => key);
            periods = Array.isArray(config.periods) && config.periods.length
                ? config.periods.map((period, index) => ({id: `p${index + 1}`, name: String(period.name || `Period ${index + 1}`), start: String(period.start || ''), end: String(period.end || '')}))
                : DEFAULT_PERIODS.map(period => ({...period}));
            assignments = assignmentSnapshot.val() || {};
            classes = [];
            classSnapshot.forEach(child => {
                const data = child.val() || {};
                if (!data.courseName || data.active === false) return;
                classes.push({id: child.key, data, sections: sectionsFor({data})});
            });
            classes.sort((a, b) => String(a.data.courseName).localeCompare(String(b.data.courseName)));
            renderDays();
            renderPeriods();
            classSelect.innerHTML = '<option value="">Select a class</option>' + classes.map(item =>
                `<option value="${escape(classOptionId(item))}">${escape(item.data.courseName || item.data.name)}</option>`
            ).join('');
            classSelect.disabled = !classes.length;
            field('tmSectionSelect').innerHTML = '<option value="">Select a class first</option>';
            field('tmSectionSelect').disabled = true;
            renderGrid();
            updateControls();
            status(classes.length ? `Loaded ${classes.length} classes.` : 'No class records with sections are configured. Add classes and sections in Manage Courses first.', !classes.length);
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
        const timedPeriods = [];
        for (const period of periods) {
            const normalized = period.name.toLocaleLowerCase();
            if (!normalized) return status('Every period needs a name.', true);
            if (names.has(normalized)) return status('Period names must be unique.', true);
            names.add(normalized);
            if ((period.start && !period.end) || (!period.start && period.end) || (period.start && period.end && period.start >= period.end)) {
                return status(`Enter valid start and end times for ${period.name}, or leave both times blank.`, true);
            }
            if (period.start && period.end) timedPeriods.push(period);
        }
        timedPeriods.sort((a, b) => a.start.localeCompare(b.start));
        for (let index = 1; index < timedPeriods.length; index++) {
            if (timedPeriods[index].start < timedPeriods[index - 1].end) {
                return status(`${timedPeriods[index - 1].name} and ${timedPeriods[index].name} overlap. Adjust their times before saving.`, true);
            }
        }
        try {
            saving = true;
            updateControls();
            await firebase.database().ref(`schoolTimetableSettings/${schoolId}`).set({
                schoolId,
                days,
                periods,
                updatedAt: Date.now(),
                updatedBy: user.uid
            });
            renderGrid();
            status('School timetable days and periods saved.');
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
            status('Checking teacher availability…');
            const schoolSchedules = await firebase.database().ref(`schoolTimetables/${schoolId}`).once('value');
            const conflicts = [];
            days.forEach(day => periods.forEach(period => {
                const slot = nextSlots[day]?.[period.id];
                if (!slot?.teacherId) return;
                schoolSchedules.forEach(classSchedule => classSchedule.forEach(sectionSchedule => {
                    if (`${classSchedule.key}/${sectionSchedule.key}` === `${record.id}/${sectionKey(section)}`) return;
                    const other = sectionSchedule.val()?.slots?.[day]?.[period.id];
                    if (other?.teacherId === slot.teacherId) conflicts.push(`${slot.teacherName || 'Assigned teacher'} is already scheduled in ${period.name} on ${day}.`);
                }));
            }));
            if (conflicts.length) throw new Error([...new Set(conflicts)].join(' '));
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
        root.querySelector('#tmRefresh')?.addEventListener('click', loadSchoolData);
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
            renderGrid();
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
                if (!assigned) status(`No teacher is assigned to ${subject} in this section. It can be scheduled, but no teacher timetable will include this lesson.`, true);
                else status(`${assigned.teacherName || 'Assigned teacher'} is attached to ${subject}.`);
            }
            renderGrid();
        });
        loadSchoolData();
    }
    window.AdminPanelAPI?.register('manage-timetable', init, {contentSized: true});
});
