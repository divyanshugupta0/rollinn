// Keep every teacher panel header on the same profile name, including panels
// mounted after the initial dashboard render.
(() => {
    let teacherName = '';
    let updateQueued = false;

    const cleanName = value => String(value || '')
        .replace(/^\s*teacher\s*:\s*/i, '')
        .replace(/\bLoading\.{0,3}/gi, '')
        .replace(/^\s*Faculty\s*$/i, '')
        .trim();

    function renderHeader(info) {
        if (!info || !info.isConnected) return;

        let name = teacherName;
        if (!name) {
            const copy = info.cloneNode(true);
            copy.querySelectorAll('.header-dropdown').forEach(dropdown => dropdown.remove());
            copy.querySelectorAll('i').forEach(icon => icon.remove());
            name = cleanName(copy.textContent);
        }

        const dropdowns = Array.from(info.querySelectorAll('.header-dropdown'));
        const dropdown = dropdowns.shift() || null;
        dropdowns.forEach(extra => extra.remove());
        const menu = dropdown || document.createElement('div');
        if (!dropdown) {
            menu.className = 'header-dropdown';
            menu.innerHTML = '<div class="dropdown-item header-logout-btn"><i class="fas fa-sign-out-alt"></i><span>Logout</span></div>';
        }
        const logoutItem = menu.querySelector('.header-logout-btn');
        if (logoutItem && !logoutItem.dataset.teacherLogoutBound) {
            logoutItem.dataset.teacherLogoutBound = 'true';
            logoutItem.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                window.performLogout?.(event);
            });
        }

        if (info.id !== 'teacherInfo' && !info.dataset.teacherDropdownBound) {
            info.dataset.teacherDropdownBound = 'true';
            info.addEventListener('click', event => {
                if (event.target.closest('.header-logout-btn')) return;
                document.querySelectorAll('.teacher-info .header-dropdown.show').forEach(open => {
                    if (!info.contains(open)) open.classList.remove('show');
                });
                info.querySelector('.header-dropdown')?.classList.toggle('show');
            });
        }
        const icon = info.querySelector('i.fa-user-tie') || document.createElement('i');
        icon.className = 'fas fa-user-tie';
        const label = info.querySelector('.teacher-name') || document.createElement('span');
        label.className = 'teacher-name';
        if (label.textContent !== name) label.textContent = name;
        label.hidden = !name;

        const expected = [icon, label, menu];
        const hasExpectedChildren = info.children.length === expected.length &&
            expected.every((child, index) => info.children[index] === child);
        if (!hasExpectedChildren) info.replaceChildren(...expected);
        label.hidden = !name;
    }

    function updateAll() {
        document.querySelectorAll('.teacher-info').forEach(renderHeader);
    }

    function queueUpdate() {
        if (updateQueued) return;
        updateQueued = true;
        queueMicrotask(() => {
            updateQueued = false;
            updateAll();
        });
    }

    window.updateTeacherHeaderName = name => {
        teacherName = cleanName(name);
        updateAll();
    };

    const observer = new MutationObserver(records => {
        const affected = new Set();
        const collect = node => {
            if (!(node instanceof Element)) return;
            const parentHeader = node.closest('.teacher-info');
            if (parentHeader) affected.add(parentHeader);
            if (node.matches('.teacher-info')) affected.add(node);
            node.querySelectorAll('.teacher-info').forEach(info => affected.add(info));
        };
        records.forEach(record => {
            collect(record.target);
            record.addedNodes.forEach(collect);
        });
        if (affected.size) queueUpdate();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    document.addEventListener('click', event => {
        if (event.target.closest('.teacher-info')) return;
        document.querySelectorAll('.teacher-info .header-dropdown.show').forEach(menu => menu.classList.remove('show'));
    });

    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            teacherName = '';
            updateAll();
            return;
        }
        firebase.database().ref(`users/${user.uid}`).once('value')
            .then(snapshot => {
                const profile = snapshot.val() || {};
                window.updateTeacherHeaderName(profile.name || user.displayName || user.email || 'Teacher');
            })
            .catch(error => console.warn('Could not load teacher header name:', error));
    });
})();
