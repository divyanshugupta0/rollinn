/**
 * RollCall Client-Side Playwright Automation Runner
 * --------------------------------------------------------------------------
 * Automatically fetches automation scripts from Firebase Realtime Database
 * targeted for this portal ('student', 'teacher', or 'admin') and executes
 * them in-browser with a complete Playwright-compatible browser API emulator.
 *
 * Supported Playwright APIs:
 *   - page.click(selector, options)
 *   - page.dblclick(selector)
 *   - page.fill(selector, value)
 *   - page.type(selector, text, options)
 *   - page.check(selector) / page.uncheck(selector)
 *   - page.selectOption(selector, value)
 *   - page.waitForSelector(selector, options)
 *   - page.waitForTimeout(ms)
 *   - page.waitForFunction(fn, arg, options)
 *   - page.textContent(selector)
 *   - page.innerText(selector)
 *   - page.innerHTML(selector)
 *   - page.getAttribute(selector, name)
 *   - page.isVisible(selector)
 *   - page.isEnabled(selector)
 *   - page.isChecked(selector)
 *   - page.locator(selector)
 *   - page.evaluate(fn, ...args)
 *   - page.goto(url) / page.reload()
 *   - page.title() / page.url()
 *   - expect(actual).toBe / toEqual / toContain / toBeTruthy / toBeVisible ...
 *   - runner.log(msg, level)
 *
 * Telemetry:
 *   Reports execution results, logs, and errors back to Firebase at:
 *   `playwrightExecutions/{scriptId}/{executionId}`
 */

(function () {
    'use strict';

    if (window.__RollCallPlaywrightRunnerInitialized) {
        return;
    }
    window.__RollCallPlaywrightRunnerInitialized = true;

    // 1. Detect current portal
    function detectPortal() {
        if (window.ROLLCALL_PORTAL) return window.ROLLCALL_PORTAL;
        const path = (window.location.pathname || '').toLowerCase();
        const full = (window.location.href || '').toLowerCase();

        if (path.includes('/admin/') || path.includes('admin.html') || full.includes('/admin')) return 'admin';
        if (path.includes('/teacher/') || path.includes('teacher.html') || full.includes('/teacher')) return 'teacher';
        if (path.includes('/student/') || path.includes('student') || full.includes('/student')) return 'student';
        if (path.includes('/owner/') || path.includes('owner.html') || full.includes('/owner')) return 'owner';

        if (document.title && document.title.toLowerCase().includes('admin')) return 'admin';
        if (document.title && document.title.toLowerCase().includes('teacher')) return 'teacher';
        if (document.title && document.title.toLowerCase().includes('student')) return 'student';

        return 'student'; // Fallback default
    }

    const currentPortal = detectPortal();

    // 2. Playwright Selector Resolution Helper
    function queryElement(selector, root = document) {
        if (!selector || typeof selector !== 'string') return null;
        selector = selector.trim();

        // Support text=... syntax (e.g. text=Save or text="Save Changes")
        if (selector.startsWith('text=')) {
            let targetText = selector.slice(5).trim();
            if ((targetText.startsWith('"') && targetText.endsWith('"')) ||
                (targetText.startsWith("'") && targetText.endsWith("'"))) {
                targetText = targetText.slice(1, -1);
            }
            const allElements = root.querySelectorAll('button, a, span, p, h1, h2, h3, h4, h5, h6, label, div, input[type="button"], input[type="submit"]');
            for (const el of allElements) {
                if (el.textContent && el.textContent.trim().toLowerCase() === targetText.toLowerCase()) {
                    return el;
                }
            }
            for (const el of allElements) {
                if (el.textContent && el.textContent.toLowerCase().includes(targetText.toLowerCase())) {
                    return el;
                }
            }
            return null;
        }

        // Support :has-text(...) pseudo-selector
        const hasTextMatch = selector.match(/^(.*?):has-text\((["']?)(.*?)\2\)$/i);
        if (hasTextMatch) {
            const baseTag = hasTextMatch[1].trim() || '*';
            const searchVal = hasTextMatch[3].trim().toLowerCase();
            const candidates = root.querySelectorAll(baseTag);
            for (const el of candidates) {
                if (el.textContent && el.textContent.toLowerCase().includes(searchVal)) {
                    return el;
                }
            }
            return null;
        }

        // Standard CSS selector
        try {
            return root.querySelector(selector);
        } catch (e) {
            console.warn('[PlaywrightRunner] Invalid selector:', selector, e);
            return null;
        }
    }

    function queryAllElements(selector, root = document) {
        if (!selector || typeof selector !== 'string') return [];
        selector = selector.trim();

        if (selector.startsWith('text=')) {
            const single = queryElement(selector, root);
            return single ? [single] : [];
        }

        try {
            return Array.from(root.querySelectorAll(selector));
        } catch (e) {
            console.warn('[PlaywrightRunner] Invalid selector for queryAll:', selector, e);
            return [];
        }
    }

    // 3. Visual Action Highlighter (Pulse Ring on target element)
    function highlightElement(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        try {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;

            const ring = document.createElement('div');
            ring.className = 'playwright-action-pulse';
            ring.style.position = 'fixed';
            ring.style.left = `${rect.left - 4}px`;
            ring.style.top = `${rect.top - 4}px`;
            ring.style.width = `${rect.width + 8}px`;
            ring.style.height = `${rect.height + 8}px`;
            ring.style.borderRadius = '8px';
            ring.style.border = '2px solid #3b82f6';
            ring.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.8), inset 0 0 10px rgba(59, 130, 246, 0.4)';
            ring.style.pointerEvents = 'none';
            ring.style.zIndex = '9999999';
            ring.style.transition = 'all 0.45s ease-out';
            ring.style.opacity = '1';
            ring.style.transform = 'scale(1)';

            document.body.appendChild(ring);

            requestAnimationFrame(() => {
                ring.style.opacity = '0';
                ring.style.transform = 'scale(1.15)';
            });

            setTimeout(() => {
                ring.remove();
            }, 500);
        } catch (e) {
            // Ignore highlighting failure
        }
    }

    // 4. Playwright Browser API Emulator
    function createPlaywrightPage(logsCollector) {
        function log(msg, type = 'info') {
            const time = new Date().toLocaleTimeString();
            const formatted = `[${time}] [${type.toUpperCase()}] ${msg}`;
            logsCollector.push(formatted);
            console.log(`%c[PlaywrightRunner]%c ${formatted}`, 'color: #3b82f6; font-weight: bold;', 'color: inherit;');
        }

        const page = {
            url() {
                return window.location.href;
            },
            title() {
                return document.title;
            },
            async goto(url) {
                log(`page.goto("${url}")`);
                window.location.href = url;
                await page.waitForTimeout(500);
            },
            async reload() {
                log(`page.reload()`);
                window.location.reload();
            },
            async waitForTimeout(ms) {
                log(`page.waitForTimeout(${ms}ms)`);
                return new Promise(resolve => setTimeout(resolve, ms));
            },
            async waitForSelector(selector, options = {}) {
                const timeout = options.timeout || 10000;
                const state = options.state || 'visible'; // 'visible' | 'hidden' | 'attached'
                const start = Date.now();
                log(`page.waitForSelector("${selector}", state="${state}", timeout=${timeout}ms)`);

                return new Promise((resolve, reject) => {
                    function check() {
                        const el = queryElement(selector);
                        let conditionMet = false;

                        if (state === 'attached') {
                            conditionMet = !!el;
                        } else if (state === 'hidden') {
                            conditionMet = !el || !page.isVisibleElement(el);
                        } else {
                            // visible
                            conditionMet = !!(el && page.isVisibleElement(el));
                        }

                        if (conditionMet) {
                            resolve(el);
                            return;
                        }

                        if (Date.now() - start >= timeout) {
                            reject(new Error(`Timeout ${timeout}ms exceeded while waiting for selector "${selector}" with state "${state}"`));
                            return;
                        }

                        setTimeout(check, 100);
                    }
                    check();
                });
            },
            async waitForFunction(fn, arg, options = {}) {
                const timeout = options.timeout || 10000;
                const start = Date.now();
                log(`page.waitForFunction(fn, timeout=${timeout}ms)`);

                return new Promise((resolve, reject) => {
                    async function check() {
                        try {
                            const res = typeof fn === 'string' ? eval(fn) : await fn(arg);
                            if (res) {
                                resolve(res);
                                return;
                            }
                        } catch (e) {
                            // wait and retry
                        }

                        if (Date.now() - start >= timeout) {
                            reject(new Error(`Timeout ${timeout}ms exceeded while waiting for custom function`));
                            return;
                        }

                        setTimeout(check, 100);
                    }
                    check();
                });
            },
            isVisibleElement(el) {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            },
            async isVisible(selector) {
                const el = queryElement(selector);
                return this.isVisibleElement(el);
            },
            async isEnabled(selector) {
                const el = queryElement(selector);
                return !!(el && !el.disabled);
            },
            async isChecked(selector) {
                const el = queryElement(selector);
                return !!(el && el.checked);
            },
            async click(selector, options = {}) {
                log(`page.click("${selector}")`);
                const el = await page.waitForSelector(selector, { timeout: options.timeout || 8000, state: 'visible' });
                if (!el) throw new Error(`Cannot click: element not found for selector "${selector}"`);

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlightElement(el);
                await page.waitForTimeout(options.delay || 120);

                // Dispatch full realistic mouse click sequence
                const pointerOpts = { bubbles: true, cancelable: true, view: window };
                el.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
                el.dispatchEvent(new MouseEvent('mousedown', pointerOpts));
                if (typeof el.focus === 'function') el.focus();
                el.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
                el.dispatchEvent(new MouseEvent('mouseup', pointerOpts));
                el.dispatchEvent(new MouseEvent('click', pointerOpts));

                log(`Successfully clicked "${selector}"`, 'success');
            },
            async dblclick(selector, options = {}) {
                log(`page.dblclick("${selector}")`);
                await page.click(selector, options);
                await page.click(selector, options);
                const el = queryElement(selector);
                if (el) {
                    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
                }
            },
            async fill(selector, value, options = {}) {
                log(`page.fill("${selector}", "${value}")`);
                const el = await page.waitForSelector(selector, { timeout: options.timeout || 8000, state: 'visible' });
                if (!el) throw new Error(`Cannot fill: element not found for selector "${selector}"`);

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlightElement(el);
                if (typeof el.focus === 'function') el.focus();

                el.value = String(value);

                // Dispatch synthetic events so frameworks & listeners trigger
                el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                log(`Successfully filled "${selector}"`, 'success');
            },
            async type(selector, text, options = {}) {
                log(`page.type("${selector}", "${text}")`);
                const el = await page.waitForSelector(selector, { timeout: options.timeout || 8000, state: 'visible' });
                if (!el) throw new Error(`Cannot type: element not found for selector "${selector}"`);

                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                highlightElement(el);
                if (typeof el.focus === 'function') el.focus();

                const delay = options.delay || 25;
                el.value = '';
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    el.value += char;
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                    if (delay > 0) await page.waitForTimeout(delay);
                }
                el.dispatchEvent(new Event('change', { bubbles: true }));
                log(`Successfully typed text into "${selector}"`, 'success');
            },
            async check(selector) {
                log(`page.check("${selector}")`);
                const el = await page.waitForSelector(selector);
                if (!el.checked) {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            async uncheck(selector) {
                log(`page.uncheck("${selector}")`);
                const el = await page.waitForSelector(selector);
                if (el.checked) {
                    el.checked = false;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            async selectOption(selector, value) {
                log(`page.selectOption("${selector}", "${value}")`);
                const el = await page.waitForSelector(selector);
                el.value = value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            },
            async press(selector, key) {
                log(`page.press("${selector}", "${key}")`);
                const el = queryElement(selector) || document.activeElement;
                if (el) {
                    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
                }
            },
            async textContent(selector) {
                const el = await page.waitForSelector(selector);
                return el ? el.textContent : null;
            },
            async innerText(selector) {
                const el = await page.waitForSelector(selector);
                return el ? el.innerText : null;
            },
            async innerHTML(selector) {
                const el = await page.waitForSelector(selector);
                return el ? el.innerHTML : null;
            },
            async getAttribute(selector, name) {
                const el = await page.waitForSelector(selector);
                return el ? el.getAttribute(name) : null;
            },
            async evaluate(fn, ...args) {
                log(`page.evaluate()`);
                if (typeof fn === 'function') {
                    return await fn(...args);
                }
                return eval(fn);
            },
            locator(selector) {
                return {
                    async click(opts) { return page.click(selector, opts); },
                    async fill(val, opts) { return page.fill(selector, val, opts); },
                    async type(txt, opts) { return page.type(selector, txt, opts); },
                    async textContent() { return page.textContent(selector); },
                    async innerText() { return page.innerText(selector); },
                    async isVisible() { return page.isVisible(selector); },
                    async waitFor(opts) { return page.waitForSelector(selector, opts); },
                    first() {
                        const all = queryAllElements(selector);
                        return all[0] ? page.locator(selector) : null;
                    },
                    last() {
                        const all = queryAllElements(selector);
                        return all.length ? page.locator(selector) : null;
                    },
                    count() {
                        return queryAllElements(selector).length;
                    }
                };
            },
            async injectCSS(cssText) {
                log('page.injectCSS()');
                const styleEl = document.createElement('style');
                styleEl.className = 'pw-injected-style';
                styleEl.textContent = cssText;
                document.head.appendChild(styleEl);
                return styleEl;
            },
            async injectHTML(htmlString, targetSelector = 'body') {
                log(`page.injectHTML("${targetSelector}")`);
                const container = queryElement(targetSelector) || document.body || document.documentElement;
                
                // Create a temporary container to extract elements
                const temp = document.createElement('div');
                temp.innerHTML = htmlString;
                
                // If there are top-level elements, move them directly into container so IDs match instantly
                const addedElements = [];
                while (temp.firstChild) {
                    const child = temp.firstChild;
                    container.appendChild(child);
                    addedElements.push(child);
                }
                
                // Allow a microtask tick for DOM settlement
                await new Promise(r => requestAnimationFrame(r));
                return addedElements[0] || container;
            },
            async showPopupForm(options = {}) {
                const title = options.title || 'Automation Action Required';
                const htmlContent = options.html || '<p>Please confirm action to continue.</p>';
                const customCss = options.css || '';
                const submitText = options.submitText || 'Submit';
                const cancelText = options.cancelText || 'Cancel';
                const firebasePath = options.firebasePath || 'playwrightFormResponses';
                const timeout = options.timeout || 60000;

                log(`page.showPopupForm("${title}")`);

                let customStyleEl = null;
                if (customCss) {
                    customStyleEl = await page.injectCSS(customCss);
                }

                function safeEscape(str) {
                    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                }

                return new Promise(async (resolve, reject) => {
                    const overlay = document.createElement('div');
                    overlay.id = 'pw-client-popup-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100vw';
                    overlay.style.height = '100vh';
                    overlay.style.background = 'rgba(15, 23, 42, 0.72)';
                    overlay.style.backdropFilter = 'blur(6px)';
                    overlay.style.webkitBackdropFilter = 'blur(6px)';
                    overlay.style.zIndex = '10000000';
                    overlay.style.display = 'flex';
                    overlay.style.alignItems = 'center';
                    overlay.style.justifyContent = 'center';
                    overlay.style.padding = '16px';

                    overlay.innerHTML = `
                        <div class="pw-client-popup-card" style="background:#ffffff; border-radius:14px; width:100%; max-width:520px; box-shadow:0 25px 50px rgba(0,0,0,0.3); overflow:hidden; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <div style="background:#1e293b; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; color:#f8fafc;">
                                <strong style="font-size:14px;"><i class="fas fa-layer-group me-2" style="color:#38bdf8;"></i>${safeEscape(title)}</strong>
                                <button type="button" id="pw-popup-close-x" style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer;">✕</button>
                            </div>
                            <form id="pw-client-popup-form" style="padding:18px 20px;">
                                <div class="pw-client-popup-content" style="font-size:13px; color:#334155; margin-bottom:18px;">
                                    ${htmlContent}
                                </div>
                                <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f1f5f9; padding-top:14px;">
                                    <button type="button" id="pw-popup-cancel-btn" style="padding:7px 14px; border-radius:6px; background:#f1f5f9; border:1px solid #cbd5e1; font-size:12.5px; font-weight:500; cursor:pointer; color:#475569;">${safeEscape(cancelText)}</button>
                                    <button type="submit" id="pw-popup-submit-btn" style="padding:7px 16px; border-radius:6px; background:#2563eb; border:none; font-size:12.5px; font-weight:600; cursor:pointer; color:#ffffff;">${safeEscape(submitText)}</button>
                                </div>
                            </form>
                        </div>
                    `;

                    document.body.appendChild(overlay);

                    const form = overlay.querySelector('#pw-client-popup-form');
                    const closeX = overlay.querySelector('#pw-popup-close-x');
                    const cancelBtn = overlay.querySelector('#pw-popup-cancel-btn');

                    let timer = null;
                    if (timeout > 0) {
                        timer = setTimeout(() => {
                            cleanup();
                            reject(new Error(`Popup form timed out after ${timeout}ms`));
                        }, timeout);
                    }

                    function cleanup() {
                        if (timer) clearTimeout(timer);
                        if (overlay && overlay.parentNode) overlay.remove();
                        if (customStyleEl && customStyleEl.parentNode) customStyleEl.remove();
                    }

                    closeX?.addEventListener('click', () => {
                        cleanup();
                        resolve({ cancelled: true, submitted: false });
                    });

                    cancelBtn?.addEventListener('click', () => {
                        cleanup();
                        resolve({ cancelled: true, submitted: false });
                    });

                    form?.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = {};
                        const inputs = form.querySelectorAll('input, select, textarea');
                        inputs.forEach(input => {
                            const key = input.name || input.id;
                            if (key) {
                                if (input.type === 'checkbox') formData[key] = input.checked;
                                else if (input.type === 'radio') {
                                    if (input.checked) formData[key] = input.value;
                                } else {
                                    formData[key] = input.value;
                                }
                            }
                        });

                        const submission = {
                            submitted: true,
                            formData,
                            portal: currentPortal,
                            timestamp: Date.now(),
                            url: window.location.href
                        };

                        if (firebasePath) {
                            try {
                                const db = await getFirebaseDatabase();
                                if (db) {
                                    const schoolId = await detectSchoolId();
                                    const user = firebase.auth && firebase.auth().currentUser;
                                    const record = {
                                        formData,
                                        portal: currentPortal,
                                        schoolId: schoolId || 'all',
                                        userId: user?.uid || null,
                                        userEmail: user?.email || null,
                                        timestamp: Date.now()
                                    };
                                    await db.ref(firebasePath).push(record);
                                    log(`Form submission saved to Firebase path "${firebasePath}"`, 'success');
                                }
                            } catch (err) {
                                console.warn('[PlaywrightRunner] Failed to write form to Firebase:', err);
                            }
                        }

                        cleanup();
                        resolve(submission);
                    });
                });
            },
            $(selector) {
                return queryElement(selector);
            },
            $$(selector) {
                return queryAllElements(selector);
            }
        };

        return page;
    }

    // 5. Playwright expect() Assertion Library
    function createExpectAssertion(logsCollector) {
        return function expect(actual) {
            return {
                toBe(expected) {
                    if (actual !== expected) {
                        const msg = `Assertion Failed: expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    logsCollector.push(`[ASSERTION PASS] Value matches expected: ${JSON.stringify(expected)}`);
                    return true;
                },
                toEqual(expected) {
                    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                        const msg = `Assertion Failed: expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    logsCollector.push(`[ASSERTION PASS] Value equals expected`);
                    return true;
                },
                toContain(expectedSubstring) {
                    const str = String(actual || '');
                    if (!str.includes(expectedSubstring)) {
                        const msg = `Assertion Failed: expected "${str}" to contain "${expectedSubstring}"`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    logsCollector.push(`[ASSERTION PASS] Found "${expectedSubstring}" in content`);
                    return true;
                },
                toBeTruthy() {
                    if (!actual) {
                        const msg = `Assertion Failed: expected value to be truthy, got ${actual}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    logsCollector.push(`[ASSERTION PASS] Value is truthy`);
                    return true;
                },
                toBeFalsy() {
                    if (actual) {
                        const msg = `Assertion Failed: expected value to be falsy, got ${actual}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    logsCollector.push(`[ASSERTION PASS] Value is falsy`);
                    return true;
                },
                toBeGreaterThan(num) {
                    if (Number(actual) <= num) {
                        const msg = `Assertion Failed: expected ${actual} to be greater than ${num}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    return true;
                },
                toBeLessThan(num) {
                    if (Number(actual) >= num) {
                        const msg = `Assertion Failed: expected ${actual} to be less than ${num}`;
                        logsCollector.push(`[ASSERTION ERROR] ${msg}`);
                        throw new Error(msg);
                    }
                    return true;
                },
                get not() {
                    return {
                        toBe(expected) {
                            if (actual === expected) {
                                throw new Error(`Assertion Failed: expected ${JSON.stringify(actual)} NOT to be ${JSON.stringify(expected)}`);
                            }
                            return true;
                        },
                        toContain(sub) {
                            if (String(actual || '').includes(sub)) {
                                throw new Error(`Assertion Failed: expected "${actual}" NOT to contain "${sub}"`);
                            }
                            return true;
                        }
                    };
                }
            };
        };
    }

    // 6. Floating Status Badge & Live Drawer UI
    let runnerBadge = null;
    let runnerDrawer = null;
    let drawerLogsContainer = null;
    let activeStatusText = null;

    function createRunnerUI() {
        if (runnerBadge) return;

        // Scoped Styles for Runner Widget
        const style = document.createElement('style');
        style.textContent = `
            #rollcall-playwright-badge {
                display: none !important;
            }
            #rollcall-playwright-badge:hover {
                transform: translateY(-2px);
                background: rgba(15, 23, 42, 0.98);
                box-shadow: 0 14px 30px -5px rgba(0, 0, 0, 0.45);
            }
            .pw-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 8px #10b981;
                transition: background 0.2s;
            }
            .pw-dot.running {
                background: #3b82f6;
                box-shadow: 0 0 10px #3b82f6;
                animation: pw-pulse 1s infinite alternate;
            }
            .pw-dot.error {
                background: #ef4444;
                box-shadow: 0 0 10px #ef4444;
            }
            @keyframes pw-pulse {
                from { transform: scale(0.9); opacity: 0.7; }
                to { transform: scale(1.3); opacity: 1; }
            }
            #rollcall-playwright-drawer,
            #rollcall-playwright-drawer.show {
                display: none !important;
            }
            .pw-drawer-header {
                padding: 10px 14px;
                background: #1e293b;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                font-size: 12px;
                color: #e2e8f0;
                font-weight: 600;
            }
            .pw-drawer-logs {
                flex: 1;
                padding: 12px;
                overflow-y: auto;
                font-size: 11px;
                line-height: 1.5;
                color: #94a3b8;
                white-space: pre-wrap;
                word-break: break-all;
            }
            .pw-close-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                font-size: 14px;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .pw-close-btn:hover {
                color: #fff;
                background: rgba(255, 255, 255, 0.1);
            }
        `;
        document.head.appendChild(style);

        runnerBadge = document.createElement('div');
        runnerBadge.id = 'rollcall-playwright-badge';
        runnerBadge.title = `Playwright Runner (${currentPortal} portal) - Click to view live logs`;
        runnerBadge.innerHTML = `
            <span class="pw-dot" id="pw-status-dot"></span>
            <span style="font-weight: 600; color: #60a5fa;">Playwright:</span>
            <span id="pw-status-text">Idle</span>
            <span style="opacity: 0.5; font-size: 10px; margin-left: 4px;">[${currentPortal}]</span>
        `;

        runnerDrawer = document.createElement('div');
        runnerDrawer.id = 'rollcall-playwright-drawer';
        runnerDrawer.innerHTML = `
            <div class="pw-drawer-header">
                <span>⚡ Playwright Client Execution Logs (${currentPortal})</span>
                <button class="pw-close-btn" id="pw-close-drawer">✕</button>
            </div>
            <div class="pw-drawer-logs" id="pw-drawer-logs">No automation scripts run yet. Waiting for triggers...</div>
        `;

        document.body.appendChild(runnerBadge);
        document.body.appendChild(runnerDrawer);

        activeStatusText = document.getElementById('pw-status-text');
        drawerLogsContainer = document.getElementById('pw-drawer-logs');

        runnerBadge.addEventListener('click', () => {
            runnerDrawer.classList.toggle('show');
        });

        document.getElementById('pw-close-drawer').addEventListener('click', (e) => {
            e.stopPropagation();
            runnerDrawer.classList.remove('show');
        });
    }

    function updateBadge(state, message) {
        if (!runnerBadge) return;
        const dot = document.getElementById('pw-status-dot');
        if (dot) {
            dot.className = 'pw-dot ' + (state === 'running' ? 'running' : state === 'error' ? 'error' : '');
        }
        if (activeStatusText) {
            activeStatusText.textContent = message || (state === 'running' ? 'Running script...' : 'Ready');
        }
    }

    function appendDrawerLog(text, isError = false) {
        if (!drawerLogsContainer) return;
        if (drawerLogsContainer.textContent === 'No automation scripts run yet. Waiting for triggers...') {
            drawerLogsContainer.textContent = '';
        }
        const line = document.createElement('div');
        line.style.color = isError ? '#f87171' : text.includes('[SUCCESS]') ? '#4ade80' : '#cbd5e1';
        line.style.marginBottom = '4px';
        line.textContent = text;
        drawerLogsContainer.appendChild(line);
        drawerLogsContainer.scrollTop = drawerLogsContainer.scrollHeight;
    }

    // 7. Safe Script Code Normalizer & Execution Engine
    function normalizePlaywrightCode(rawCode) {
        let code = String(rawCode || '').trim();

        // If code is wrapped like: async ({ page, expect }) => { ... }
        // or async function({ page }) { ... }
        const arrowMatch = code.match(/^(?:async\s*)?\(\s*\{?[^}]*\}?\s*\)\s*=>\s*\{([\s\S]*)\}$/);
        if (arrowMatch) {
            return arrowMatch[1];
        }

        const funcMatch = code.match(/^(?:async\s*)?function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*)\}$/);
        if (funcMatch) {
            return funcMatch[1];
        }

        return code;
    }

    // Smart parser for combined automation snippets (HTML + CSS + JS)
    function parseCombinedAutomationSnippet(raw) {
        let text = String(raw || '').trim();

        // If the code is already valid JavaScript (e.g. contains page.injectHTML(`...`)),
        // DO NOT slice into string literals! Return it as-is.
        try {
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            new AsyncFunction('page', 'expect', 'console', 'runner', 'context', normalizePlaywrightCode(text));
            return {
                html: '',
                css: '',
                js: text
            };
        } catch (syntaxErr) {
            // Not valid standalone JS yet, so parse out mixed raw HTML / CSS / JS blocks
        }

        let extractedHtml = '';
        let extractedCss = '';
        let extractedJs = '';

        text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
            extractedCss += '\n' + css;
            return '';
        });

        text = text.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
            extractedJs += '\n' + js;
            return '';
        });

        const htmlStartIndex = text.search(/<(button|div|form|dialog|section|main|header|footer|p|span|table|h[1-6]|ul|ol|input)\b/i);
        if (htmlStartIndex !== -1) {
            const beforeHtml = text.slice(0, htmlStartIndex).trim();
            const fromHtml = text.slice(htmlStartIndex).trim();

            const lastClosingMatches = [...fromHtml.matchAll(/<\/(button|div|form|dialog|section|main|header|footer|p|span|table|h[1-6]|ul|ol)>/gi)];
            if (lastClosingMatches.length > 0) {
                const lastMatch = lastClosingMatches[lastClosingMatches.length - 1];
                const htmlEndIndex = lastMatch.index + lastMatch[0].length;
                extractedHtml = fromHtml.slice(0, htmlEndIndex).trim();
                const afterHtml = fromHtml.slice(htmlEndIndex).trim();

                if (beforeHtml) {
                    extractedJs = beforeHtml + '\n' + extractedJs;
                }

                if (afterHtml.includes('{') && afterHtml.includes('}')) {
                    extractedCss = afterHtml + '\n' + extractedCss;
                } else if (afterHtml) {
                    extractedJs = extractedJs + '\n' + afterHtml;
                }
            } else {
                extractedHtml = fromHtml;
                if (beforeHtml) extractedJs = beforeHtml + '\n' + extractedJs;
            }
        } else {
            extractedJs = text;
        }

        return {
            html: extractedHtml.trim(),
            css: extractedCss.trim(),
            js: extractedJs.trim()
        };
    }

    async function executePlaywrightScript(script) {
        const scriptId = script.id;
        const scriptName = script.name || 'Untitled Script';
        const rawCode = script.code || '';

        updateBadge('running', `Running: ${scriptName.slice(0, 15)}...`);
        appendDrawerLog(`\n========== START SCRIPT: ${scriptName} (${new Date().toLocaleTimeString()}) ==========`);

        const logs = [];
        const startTime = Date.now();
        let executionStatus = 'success';
        let executionError = null;

        const page = createPlaywrightPage(logs);
        const expect = createExpectAssertion(logs);

        const customConsole = {
            log: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(`[CONSOLE.LOG] ${msg}`);
                appendDrawerLog(`[CONSOLE] ${msg}`);
                console.log('[PlaywrightScript]', ...args);
            },
            warn: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(`[CONSOLE.WARN] ${msg}`);
                appendDrawerLog(`[WARN] ${msg}`);
                console.warn('[PlaywrightScript]', ...args);
            },
            error: (...args) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(`[CONSOLE.ERROR] ${msg}`);
                appendDrawerLog(`[ERROR] ${msg}`, true);
                console.error('[PlaywrightScript]', ...args);
            }
        };

        const runner = {
            log: (msg, level = 'info') => {
                logs.push(`[USER LOG] ${msg}`);
                appendDrawerLog(`[${level.toUpperCase()}] ${msg}`);
            },
            portal: currentPortal,
            scriptId,
            scriptName
        };

        try {
            logs.push(`[INFO] Preparing execution for portal "${currentPortal}" on URL: ${window.location.href}`);

            // 1. Detect and auto-extract combined HTML and CSS if present
            const parsedSnippet = parseCombinedAutomationSnippet(rawCode);
            if (parsedSnippet.css) {
                logs.push('[INFO] Injected custom popup CSS styles');
                await page.injectCSS(parsedSnippet.css);
            }
            if (parsedSnippet.html) {
                logs.push('[INFO] Injected custom popup HTML elements');
                await page.injectHTML(parsedSnippet.html);
            }

            const jsBody = parsedSnippet.js || rawCode;
            const normalizedBody = normalizePlaywrightCode(jsBody);

            // Execute in an async context with injected parameters:
            // page, expect, console, runner, context
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const runnerFunction = new AsyncFunction('page', 'expect', 'console', 'runner', 'context', normalizedBody);

            await runnerFunction(page, expect, customConsole, runner, {
                portal: currentPortal,
                url: window.location.href,
                timestamp: Date.now()
            });

            // 2. Auto-open and display popup if overlay or openBtn is present
            const autoOpenBtn = document.getElementById('openPopup') || document.querySelector('.open-btn');
            const autoOverlay = document.getElementById('popupOverlay') || document.querySelector('.popup-overlay');

            if (autoOpenBtn) {
                logs.push('[INFO] Auto-clicking open button (#openPopup) to open popup form');
                try { autoOpenBtn.click(); } catch(e) {}
            }
            if (autoOverlay) {
                autoOverlay.classList.add('active');
                autoOverlay.style.display = 'flex';
                logs.push('[INFO] Popup form (.popup-overlay) activated and displayed on screen');
                const focusInput = autoOverlay.querySelector('input, select, textarea');
                if (focusInput) focusInput.focus();
            }

            // 3. Auto-connect form submission to Firebase Realtime Database
            const autoForm = document.getElementById('parentForm') || (autoOverlay && autoOverlay.querySelector('form'));
            if (autoForm && !autoForm.__rollCallFbHooked) {
                autoForm.__rollCallFbHooked = true;
                autoForm.addEventListener('submit', async (e) => {
                    try {
                        const db = await getFirebaseDatabase();
                        if (db) {
                            const schoolId = await detectSchoolId();
                            const user = firebase.auth && firebase.auth().currentUser;
                            const formData = {};
                            const inputs = autoForm.querySelectorAll('input, select, textarea');
                            inputs.forEach(inp => {
                                const k = inp.name || inp.id;
                                if (k) {
                                    if (inp.type === 'checkbox') formData[k] = inp.checked;
                                    else if (inp.type === 'radio') { if (inp.checked) formData[k] = inp.value; }
                                    else formData[k] = inp.value;
                                }
                            });

                            const rec = {
                                ...formData,
                                portal: currentPortal,
                                schoolId: schoolId || 'all',
                                submittedAt: Date.now(),
                                userUid: user?.uid || null,
                                userEmail: user?.email || null
                            };

                            const path = autoForm.id === 'parentForm' ? 'parentDetails' : 'playwrightFormSubmissions';
                            await db.ref(path).push(rec);

                            const msgEl = autoForm.querySelector('#message') || autoForm.querySelector('.message');
                            if (msgEl) {
                                msgEl.style.color = '#15803d';
                                msgEl.textContent = 'Saved to Firebase successfully! ✓';
                            }
                            appendDrawerLog(`[FIREBASE] Form data saved to "${path}" path in Firebase.`);
                        }
                    } catch (err) {
                        console.warn('[PlaywrightRunner] Error saving form to Firebase:', err);
                    }
                });
            }

            logs.push(`[SUCCESS] Script "${scriptName}" executed successfully in ${Date.now() - startTime}ms`);
            appendDrawerLog(`[SUCCESS] Script completed in ${Date.now() - startTime}ms`);
            updateBadge('success', 'Finished ✓');
            setTimeout(() => updateBadge('idle', 'Ready'), 4000);
        } catch (err) {
            executionStatus = 'error';
            executionError = {
                message: err.message || String(err),
                stack: err.stack || ''
            };
            logs.push(`[ERROR] Execution failed: ${err.message}`);
            if (err.stack) logs.push(`[STACK] ${err.stack}`);
            appendDrawerLog(`[FAILED] ${err.message}`, true);
            updateBadge('error', 'Error ✗');
            console.error('[PlaywrightRunner Execution Error]', err);
            setTimeout(() => updateBadge('idle', 'Ready'), 6000);
        }

        const durationMs = Date.now() - startTime;

        // Telemetry: report execution result to Firebase
        await reportExecutionTelemetry({
            scriptId,
            scriptName,
            portal: currentPortal,
            status: executionStatus,
            durationMs,
            logs,
            error: executionError,
            timestamp: Date.now(),
            url: window.location.href
        });
    }

    // Helper to detect current school ID across student, teacher, and admin portals
    async function detectSchoolId() {
        if (window.ROLLCALL_SCHOOL_ID) return String(window.ROLLCALL_SCHOOL_ID).trim();
        if (window.rollCallAdminMode?.schoolId) return String(window.rollCallAdminMode.schoolId).trim();
        if (window.currentTeacher?.schoolId) return String(window.currentTeacher.schoolId).trim();
        if (window.state?.currentUser?.schoolId) return String(window.state.currentUser.schoolId).trim();
        if (window.currentUser?.schoolId) return String(window.currentUser.schoolId).trim();

        const storageKeys = ['currentSchoolId', 'schoolId', 'adminSchoolId', 'teacherSchoolId', 'studentSchoolId', 'rollcall_school_id'];
        for (const key of storageKeys) {
            const val = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (val) return String(val).trim();
        }

        try {
            const auth = typeof firebase !== 'undefined' && firebase.auth && firebase.auth();
            const user = auth && auth.currentUser;
            if (user && user.uid && firebase.database) {
                const snap = await firebase.database().ref(`users/${user.uid}/schoolId`).once('value');
                if (snap && snap.val()) {
                    return String(snap.val()).trim();
                }
            }
        } catch (e) {
            // ignore
        }

        return null;
    }

    // 8. Firebase Connection & Telemetry Reporter
    async function getFirebaseDatabase() {
        if (typeof firebase !== 'undefined' && firebase.database) {
            if (firebase.apps && firebase.apps.length > 0) {
                return firebase.database();
            }
            if (window.ROLLCALL_FIREBASE_CONFIG) {
                try {
                    firebase.initializeApp(window.ROLLCALL_FIREBASE_CONFIG);
                    return firebase.database();
                } catch (e) {
                    return firebase.database();
                }
            }
        }
        return null;
    }

    async function reportExecutionTelemetry(telemetry) {
        try {
            const db = await getFirebaseDatabase();
            if (!db) {
                console.warn('[PlaywrightRunner] Firebase DB not available to report telemetry.');
                return;
            }

            const currentUser = firebase.auth && firebase.auth().currentUser;
            telemetry.user = currentUser ? {
                uid: currentUser.uid,
                email: currentUser.email || 'anonymous'
            } : null;

            telemetry.schoolId = await detectSchoolId();

            const execRef = db.ref(`playwrightExecutions/${telemetry.scriptId}`).push();
            telemetry.id = execRef.key;

            await execRef.set(telemetry);

            // Also update lastRun summary on the script
            await db.ref(`playwrightScripts/${telemetry.scriptId}/lastRun`).update({
                timestamp: telemetry.timestamp,
                status: telemetry.status,
                portal: telemetry.portal,
                schoolId: telemetry.schoolId || 'all',
                durationMs: telemetry.durationMs,
                executionId: execRef.key
            }).catch(() => { });

        } catch (e) {
            console.warn('[PlaywrightRunner] Telemetry write failed:', e);
        }
    }

    // 9. Real-time Firebase Listener for Scripts
    const executedTriggerMap = new Map();

    async function initFirebaseListener() {
        let attempts = 0;
        const maxAttempts = 30;

        function attemptConnect() {
            attempts++;
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                startListening(firebase.database());
            } else if (attempts < maxAttempts) {
                setTimeout(attemptConnect, 1000);
            } else {
                console.warn('[PlaywrightRunner] Could not detect active Firebase app after 30s. Runner standing by.');
            }
        }

        attemptConnect();
    }

    function startListening(db) {
        if (!db) return;
        const scriptsRef = db.ref('playwrightScripts');

        console.log(`%c[PlaywrightRunner]%c Active on portal: "${currentPortal}". Listening for Firebase triggers...`, 'color: #10b981; font-weight: bold;', 'color: inherit;');

        scriptsRef.on('value', async snapshot => {
            const data = snapshot.val();
            if (!data) return;

            const detectedSchoolId = await detectSchoolId();

            Object.entries(data).forEach(([key, script]) => {
                if (!script) return;
                script.id = script.id || key;

                // 1. Check target portal ('student', 'teacher', 'admin', or 'all')
                const targetPortal = String(script.targetPortal || 'all').toLowerCase();
                const isTargetPortalMatch = targetPortal === 'all' || targetPortal === currentPortal;
                if (!isTargetPortalMatch) return;

                // 2. Check target school ('all' or specific schoolId)
                const targetSchool = String(script.targetSchool || 'all').trim();
                if (targetSchool !== 'all') {
                    // If target school is specified, and current school is detected, check match
                    if (detectedSchoolId && detectedSchoolId !== targetSchool) {
                        return; // Not meant for this school!
                    }
                }

                // 3. Check active status
                if (script.isActive === false) return;

                // 4. Check execution mode & trigger key
                const mode = script.executionMode || 'realtime_trigger';
                const triggerId = String(script.triggerId || script.updatedAt || '0');
                const runKey = `${script.id}_${triggerId}`;

                if (mode === 'once_per_device') {
                    const storageKey = `pw_run_device_${runKey}`;
                    if (localStorage.getItem(storageKey)) return;
                    localStorage.setItem(storageKey, 'true');
                } else if (mode === 'on_page_load') {
                    const sessionKey = `pw_run_session_${runKey}`;
                    if (sessionStorage.getItem(sessionKey)) return;
                    sessionStorage.setItem(sessionKey, 'true');
                } else {
                    // realtime_trigger: run whenever triggerId changes
                    if (executedTriggerMap.has(runKey)) return;
                    executedTriggerMap.set(runKey, true);
                }

                // Execute script after a slight breathing room
                console.log(`[PlaywrightRunner] Trigger received for script "${script.name}" (Portal: "${currentPortal}", School: "${targetSchool}")`);
                setTimeout(() => {
                    executePlaywrightScript(script);
                }, 400);
            });
        }, error => {
            console.warn('[PlaywrightRunner] Firebase listener error:', error);
        });
    }

    // 10. Bootstrap Runner on DOM ready
    function init() {
        createRunnerUI();
        initFirebaseListener();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose manual test trigger on window for debugging
    window.RollCallPlaywrightRunner = {
        portal: currentPortal,
        executeScript: executePlaywrightScript,
        createPage: () => createPlaywrightPage([]),
        createExpect: () => createExpectAssertion([])
    };

})();
