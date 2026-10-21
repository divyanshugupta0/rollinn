/* Suppress browser and password-manager autofill on portal search fields. */
(() => {
    'use strict';

    const isSearchField = input => {
        if (!(input instanceof HTMLInputElement)) return false;
        const type = String(input.type || '').toLowerCase();
        if (type === 'search') return true;
        const hint = [input.id, input.name, input.className, input.placeholder, input.getAttribute('aria-label')]
            .filter(value => typeof value === 'string')
            .join(' ');
        return /search|filter|find a student/i.test(hint);
    };

    const disableAutofill = root => {
        if (root instanceof HTMLInputElement && isSearchField(root)) apply(root);
        root.querySelectorAll?.('input').forEach(input => {
            if (isSearchField(input)) apply(input);
        });
    };

    function apply(input) {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('aria-autocomplete', 'none');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
        input.setAttribute('data-bwignore', 'true');
    }

    disableAutofill(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) disableAutofill(node);
    }))).observe(document.documentElement, { childList: true, subtree: true });
})();
