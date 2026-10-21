// Loads the bounded remote-support agent.
(() => {
    const loader = document.currentScript;
    if (!loader || window.__rollCallSupportLoaderStarted) return;
    window.__rollCallSupportLoaderStarted = true;
    const agent = document.createElement('script');
    agent.src = new URL('remote-support-agent.js', loader.src).href;
    agent.async = true;
    document.head.appendChild(agent);
})();
