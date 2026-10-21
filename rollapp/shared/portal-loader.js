(() => {
    const loader = document.getElementById('page-loader');
    if (!loader || loader.dataset.dismissHandlerAttached === 'true') return;
    loader.dataset.dismissHandlerAttached = 'true';

    const dismiss = () => {
        if (!loader.isConnected || loader.classList.contains('loader-hidden')) return;
        window.setTimeout(() => {
            loader.classList.add('loader-hidden');
            window.setTimeout(() => loader.remove(), 480);
        }, 650);
    };

    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, { once: true });
})();
