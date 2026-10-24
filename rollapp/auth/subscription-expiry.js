(function () {
    const GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;
    const OVERLAY_ID = 'rollcall-subscription-expiry-overlay';
    const expiryTimers = new Map();
    const displayedInCurrentLoad = new Set();

    function getSubscriptionState(school) {
        const endAt = Date.parse(school?.subscription?.endDate || '');
        if (!Number.isFinite(endAt)) return { expired: false, graceEnded: false, endAt: null, graceEndsAt: null };
        const graceEndsAt = endAt + GRACE_PERIOD_MS;
        const now = Date.now();
        return {
            expired: now >= endAt,
            graceEnded: now >= graceEndsAt,
            endAt,
            graceEndsAt
        };
    }

    function subscriptionPlanCategory(school) {
        const institutionType = String(school?.institutionType || school?.type || '').trim().toLowerCase();
        if (institutionType === 'erp') return 'erp';
        return institutionType === 'college' || institutionType === 'university' ? 'college' : 'school';
    }

    function pricingPlanCategory(plan) {
        const category = String(plan?.productType || '').trim().toLowerCase();
        if (['school', 'college', 'erp'].includes(category)) return category;
        return plan?.erpPlan === true ? 'erp' : 'school';
    }

    function installStyles() {
        if (document.getElementById('rollcall-subscription-expiry-styles')) return;
        const style = document.createElement('style');
        style.id = 'rollcall-subscription-expiry-styles';
        style.textContent = `
            #${OVERLAY_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483000;
                display: grid;
                place-items: center;
                overflow-y: auto;
                padding: 24px;
                background: rgba(8, 15, 30, .88);
                backdrop-filter: blur(8px);
                font-family: Inter, system-ui, sans-serif;
            }
            #${OVERLAY_ID} .expiry-dialog {
                width: min(100%, 560px);
                padding: clamp(24px, 5vw, 42px);
                border: 1px solid #dbe4f0;
                border-radius: 24px;
                background: #fff;
                box-shadow: 0 28px 100px rgba(0, 0, 0, .35);
                color: #172033;
            }
            #${OVERLAY_ID} .expiry-icon {
                display: grid;
                width: 58px;
                height: 58px;
                place-items: center;
                margin-bottom: 20px;
                border-radius: 18px;
                color: #a16207;
                background: #fef3c7;
                font-size: 24px;
            }
            #${OVERLAY_ID}[data-locked="true"] .expiry-icon {
                color: #b91c1c;
                background: #fee2e2;
            }
            #${OVERLAY_ID} h1 {
                margin: 0 0 10px;
                color: #111827;
                font-size: clamp(1.5rem, 5vw, 2rem);
                line-height: 1.2;
            }
            #${OVERLAY_ID} p {
                color: #526174;
                line-height: 1.6;
            }
            #${OVERLAY_ID} .expiry-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 8px 18px;
                margin: 20px 0;
                padding: 14px 16px;
                border: 1px solid #e5eaf1;
                border-radius: 12px;
                background: #f8fafc;
                color: #334155;
                font-size: .88rem;
            }
            #${OVERLAY_ID} .expiry-plan {
                margin-top: 20px;
            }
            #${OVERLAY_ID} .expiry-plan label {
                display: block;
                margin-bottom: 8px;
                color: #334155;
                font-size: .9rem;
                font-weight: 700;
            }
            #${OVERLAY_ID} .expiry-plan select {
                width: 100%;
                min-height: 48px;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                color: #172033;
                background: #fff;
                font: inherit;
            }
            #${OVERLAY_ID} .expiry-plan select:focus {
                outline: 3px solid rgba(29, 78, 216, .18);
                border-color: #1d4ed8;
            }
            #${OVERLAY_ID} .expiry-plan-note {
                margin: 8px 0 0;
                font-size: .84rem;
            }
            #${OVERLAY_ID} .expiry-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 24px;
            }
            #${OVERLAY_ID} button {
                min-height: 46px;
                padding: 11px 16px;
                border: 0;
                border-radius: 11px;
                cursor: pointer;
                font: inherit;
                font-weight: 700;
            }
            #${OVERLAY_ID} button:disabled {
                cursor: wait;
                opacity: .65;
            }
            #${OVERLAY_ID} .expiry-primary {
                color: #fff;
                background: #1d4ed8;
            }
            #${OVERLAY_ID} .expiry-secondary {
                border: 1px solid #cbd5e1;
                color: #334155;
                background: #fff;
            }
            #${OVERLAY_ID} .expiry-message {
                min-height: 1.4em;
                margin: 14px 0 0;
                font-size: .88rem;
            }
            @media (max-width: 520px) {
                #${OVERLAY_ID} { padding: 12px; }
                #${OVERLAY_ID} .expiry-dialog { border-radius: 18px; }
                #${OVERLAY_ID} .expiry-actions { flex-direction: column; }
                #${OVERLAY_ID} .expiry-actions button { width: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    function scheduleNextExpiryTransition({ user, profile, role }, state) {
        const timerKey = user.uid;
        const previousTimer = expiryTimers.get(timerKey);
        if (previousTimer) clearTimeout(previousTimer);
        expiryTimers.delete(timerKey);

        const nextTransition = !state.expired ? state.endAt : (!state.graceEnded ? state.graceEndsAt : null);
        if (!nextTransition) return;

        const delay = Math.min(Math.max(nextTransition - Date.now() + 50, 50), 2147483000);
        const timer = setTimeout(() => {
            expiryTimers.delete(timerKey);
            if (firebase.auth().currentUser?.uid !== user.uid) return;
            showStaffExpiryOverlay({ user, profile, role }).catch(error => {
                console.error('Could not update the subscription expiry overlay:', error);
            });
        }, delay);
        expiryTimers.set(timerKey, timer);
    }

    function createOverlay({ locked, school, state, counter, user, profile, role, plans, plansError }) {
        installStyles();
        document.getElementById(OVERLAY_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.dataset.locked = String(locked);
        overlay.dataset.userId = user.uid;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', `${OVERLAY_ID}-title`);

        const dialog = document.createElement('section');
        dialog.className = 'expiry-dialog';
        const icon = document.createElement('div');
        icon.className = 'expiry-icon';
        icon.innerHTML = `<i class="fas ${locked ? 'fa-lock' : 'fa-clock'}" aria-hidden="true"></i>`;
        const title = document.createElement('h1');
        title.id = `${OVERLAY_ID}-title`;
        title.textContent = locked ? 'Subscription grace period ended' : 'Subscription has expired';
        const description = document.createElement('p');
        description.textContent = locked
            ? `${school.name || 'Your institution'}'s subscription has been expired for more than five days. Staff access is paused until the owner renews the subscription.`
            : `${school.name || 'Your institution'}'s subscription has ended. You can continue using the portal during the five-day grace period. This reminder will appear again the next time you sign in or refresh the portal.`;

        const meta = document.createElement('div');
        meta.className = 'expiry-meta';
        const expiryDate = document.createElement('span');
        const formattedEnd = Number.isFinite(state.endAt)
            ? new Date(state.endAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Not available';
        expiryDate.textContent = `Ended: ${formattedEnd}`;
        const counterLabel = document.createElement('span');
        counterLabel.textContent = counter === null
            ? 'Reminder display count could not be recorded.'
            : `Reminder displayed ${counter} ${counter === 1 ? 'time' : 'times'}`;
        meta.append(expiryDate, counterLabel);

        const planPicker = document.createElement('div');
        planPicker.className = 'expiry-plan';
        const planLabel = document.createElement('label');
        planLabel.htmlFor = `${OVERLAY_ID}-plan`;
        planLabel.textContent = 'Select an active subscription plan to request';
        const planSelect = document.createElement('select');
        planSelect.id = `${OVERLAY_ID}-plan`;
        planSelect.name = 'requestedPlan';
        const planNote = document.createElement('p');
        planNote.className = 'expiry-plan-note';
        if (plansError) {
            planSelect.disabled = true;
            planNote.textContent = `Active plans could not be loaded: ${plansError}`;
        } else if (!plans.length) {
            planSelect.disabled = true;
            planNote.textContent = 'No active main plans are currently available. Contact the institution owner.';
        } else {
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = `${plan.name} · ${plan.currency} ${Number(plan.price).toLocaleString()} · ${plan.durationMonths} months · ${Number(plan.studentCapacity).toLocaleString()} student records · ${Number(plan.teacherCapacity).toLocaleString()} teacher accounts`;
                planSelect.appendChild(option);
            });
            planNote.textContent = 'Top-ups are not listed because they can only be added to a main subscription plan.';
        }
        planPicker.append(planLabel, planSelect, planNote);

        const actions = document.createElement('div');
        actions.className = 'expiry-actions';
        const message = document.createElement('p');
        message.className = 'expiry-message';
        message.setAttribute('role', 'status');
        message.setAttribute('aria-live', 'polite');

        const requestButton = document.createElement('button');
        requestButton.type = 'button';
        requestButton.className = 'expiry-primary';
        requestButton.textContent = 'Send plan request to owner';
        requestButton.disabled = !plans.length || Boolean(plansError);
        requestButton.addEventListener('click', async () => {
            const selectedPlan = plans.find(plan => plan.id === planSelect.value);
            if (!selectedPlan) {
                message.textContent = 'Select an active plan before sending your request.';
                return;
            }
            requestButton.disabled = true;
            message.textContent = 'Sending your request...';
            try {
                const ownerId = String(school.ownerId || '').trim();
                if (!ownerId) throw new Error('The institution owner could not be identified. Contact support.');
                const requestRef = firebase.database().ref(`subscriptionResubscribeRequests/${profile.schoolId}/${user.uid}`);
                const request = {
                    schoolId: profile.schoolId,
                    schoolName: school.name || '',
                    schoolCode: school.code || '',
                    ownerId,
                    requestedBy: user.uid,
                    requesterName: profile.name || user.displayName || user.email || 'Staff member',
                    requesterEmail: profile.email || user.email || '',
                    requesterRole: role,
                    subscriptionEndDate: school.subscription?.endDate || '',
                    requestedPlan: {
                        id: selectedPlan.id,
                        name: selectedPlan.name,
                        price: selectedPlan.price,
                        currency: selectedPlan.currency,
                        durationMonths: selectedPlan.durationMonths,
                        studentCapacity: selectedPlan.studentCapacity,
                        teacherCapacity: selectedPlan.teacherCapacity
                    },
                    status: 'pending',
                    requestedAt: Date.now()
                };
                const result = await requestRef.transaction(current => {
                    if (current?.status === 'pending') return;
                    return request;
                });
                message.textContent = result.committed
                    ? `Request for ${selectedPlan.name} sent to the owner.`
                    : 'A re-subscription request from this account is already pending with the owner.';
                requestButton.textContent = result.committed ? 'Request sent' : 'Request already pending';
            } catch (error) {
                console.error('Could not send re-subscription request:', error);
                message.textContent = error.message || 'Could not send your request. Please try again.';
                requestButton.disabled = false;
            }
        });
        actions.appendChild(requestButton);

        if (!locked) {
            const continueButton = document.createElement('button');
            continueButton.type = 'button';
            continueButton.className = 'expiry-secondary';
            continueButton.textContent = 'Continue to portal';
            continueButton.addEventListener('click', () => {
                overlay.remove();
                document.body.classList.remove('subscription-expiry-overlay-open');
            });
            overlay.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    continueButton.click();
                }
            });
            actions.appendChild(continueButton);
        }

        dialog.append(icon, title, description, meta, planPicker, actions, message);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        document.body.classList.add('subscription-expiry-overlay-open');
    }

    async function showStaffExpiryOverlay({ user, profile, role }) {
        if (!user?.uid || !profile?.schoolId || !window.firebase?.database || !window.firebase?.auth) {
            throw new Error('A signed-in staff account linked to an institution is required.');
        }
        const schoolSnapshot = await firebase.database().ref(`schools/${profile.schoolId}`).once('value');
        const school = schoolSnapshot.val();
        if (!school) throw new Error('The linked institution could not be loaded.');
        const state = getSubscriptionState(school);
        scheduleNextExpiryTransition({ user, profile, role }, state);
        if (!state.expired) return { expired: false };
        const displayKey = `${user.uid}:${state.graceEnded ? 'locked' : 'grace'}`;
        if (displayedInCurrentLoad.has(displayKey)) return { expired: true, graceEnded: state.graceEnded, school };
        displayedInCurrentLoad.add(displayKey);

        let plans = [];
        let plansError = '';
        try {
            const ownerId = String(school.ownerId || '').trim();
            if (!ownerId) throw new Error('The institution owner could not be identified.');
            const plansSnapshot = await firebase.database().ref(`owners/${ownerId}/pricingPlans`).once('value');
            const category = subscriptionPlanCategory(school);
            plans = Object.entries(plansSnapshot.val() || {})
                .map(([id, plan]) => ({ id, ...plan }))
                .filter(plan => plan.active !== false && plan.type !== 'topup' &&
                    pricingPlanCategory(plan) === category &&
                    String(plan.name || '').trim())
                .map(plan => ({
                    id: plan.id,
                    name: String(plan.name).trim(),
                    price: Number(plan.price || 0),
                    currency: String(plan.currency || 'INR'),
                    durationMonths: Number(plan.durationMonths || 0),
                    studentCapacity: Number(plan.studentCapacity || 0),
                    teacherCapacity: Number(plan.teacherCapacity || 0)
                }))
                .filter(plan => Number.isFinite(plan.price) && plan.price >= 0 && Number.isFinite(plan.durationMonths) && plan.durationMonths > 0);
        } catch (error) {
            console.error('Could not load active subscription plans for the renewal request:', error);
            plansError = error.message || 'Please try again later.';
        }

        let counter = null;
        try {
            const countRef = firebase.database().ref(`subscriptionExpiryOverlayCounts/${profile.schoolId}/${user.uid}`);
            const result = await countRef.transaction(current => ({
                count: (Number(current?.count) || 0) + 1,
                lastShownAt: Date.now(),
                role
            }));
            counter = Number(result.snapshot.val()?.count) || 1;
        } catch (error) {
            console.error('Could not record subscription expiry reminder display count:', error);
        }
        createOverlay({
            locked: state.graceEnded,
            school,
            state,
            counter,
            user,
            profile,
            role,
            plans,
            plansError
        });
        return { expired: true, graceEnded: state.graceEnded, school };
    }

    function clearStaffExpiryState(uid) {
        const userIds = uid ? [uid] : [...expiryTimers.keys()];
        userIds.forEach(userId => {
            const timer = expiryTimers.get(userId);
            if (timer) clearTimeout(timer);
            expiryTimers.delete(userId);
            displayedInCurrentLoad.delete(`${userId}:grace`);
            displayedInCurrentLoad.delete(`${userId}:locked`);
        });
        if (!uid || document.getElementById(OVERLAY_ID)?.dataset.userId === uid) {
            document.getElementById(OVERLAY_ID)?.remove();
            document.body.classList.remove('subscription-expiry-overlay-open');
        }
    }

    window.RollCallSubscriptionExpiry = {
        getSubscriptionState,
        showStaffExpiryOverlay,
        clearStaffExpiryState
    };
})();
