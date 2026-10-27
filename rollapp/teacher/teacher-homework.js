// ==========================================================================
// Teacher Portal - Homework & Assignments Management Module
// Allows subject teachers to assign and manage homework for their classes.
// ==========================================================================
(() => {
    function initializeTeacherHomework() {
        const sidebar = document.querySelector('.sidebar-menu');
        const container = document.querySelector('.main-content .container') || document.querySelector('.main-content');
        if (!sidebar || !container) return;
        if (!window.firebase?.database || !window.firebase?.auth) {
            window.addEventListener('load', initializeTeacherHomework, { once: true });
            return;
        }

        // Avoid duplicate initialization
        if (document.getElementById('homeworkSection')) return;

        // Ensure sidebar menu item has the exact matching FontAwesome icon
        let nav = sidebar.querySelector('[data-section="homework"]');
        if (nav) {
            nav.innerHTML = '<i class="fas fa-book"></i><span>Homework</span>';
        } else {
            nav = document.createElement('div');
            nav.className = 'menu-item';
            nav.dataset.section = 'homework';
            nav.innerHTML = '<i class="fas fa-book"></i><span>Homework</span>';
            
            // Insert right after classes
            const anchor = sidebar.querySelector('[data-section="classes"]');
            if (anchor && anchor.nextSibling) {
                sidebar.insertBefore(nav, anchor.nextSibling);
            } else {
                sidebar.appendChild(nav);
            }
        }

        // Inject Professional CSS
        const style = document.createElement('style');
        style.id = 'teacher-homework-styles';
        style.textContent = `
            .thm-shell {
                max-width: 1300px;
                margin: 0 auto;
                color: #1e293b;
                padding-bottom: 40px;
                width: 100%;
            }

            /* Professional Header */
            .thm-header-wrap {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 20px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 22px 28px;
                margin: 6px 0 22px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
                position: relative;
                overflow: hidden;
            }
            .thm-header-wrap::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 4px;
                height: 100%;
                background: #166534;
            }
            .thm-header-kicker {
                font-size: 0.72rem;
                font-weight: 700;
                color: #166534;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 4px;
            }
            .thm-header-title {
                font-size: 1.45rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 6px 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .thm-header-title i {
                color: #166534;
            }
            .thm-header-subtitle {
                margin: 0;
                color: #64748b;
                font-size: 0.88rem;
                line-height: 1.45;
            }
            .thm-header-actions {
                flex-shrink: 0;
            }

            /* Buttons */
            .thm-btn-primary {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 22px;
                border: none;
                border-radius: 10px;
                background: #166534;
                color: #ffffff;
                font-size: 0.88rem;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(22, 101, 52, 0.22);
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                white-space: nowrap;
                width: auto;
            }
            .thm-btn-primary:hover {
                background: #14532d;
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(22, 101, 52, 0.3);
            }
            .thm-btn-cancel {
                padding: 10px 18px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                border-radius: 9px;
                font-size: 0.84rem;
                font-weight: 600;
                color: #475569;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .thm-btn-cancel:hover {
                background: #f1f5f9;
                color: #1e293b;
            }

            /* Metric KPI Cards */
            .thm-stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 16px;
                margin-bottom: 22px;
            }
            .thm-stat-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 18px 20px;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
                transition: all 0.2s ease;
            }
            .thm-stat-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0,0,0,0.06);
                border-color: #cbd5e1;
            }
            .thm-stat-icon {
                width: 46px;
                height: 46px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.25rem;
                flex-shrink: 0;
            }
            .thm-stat-icon.green { background: #dcfce7; color: #166534; }
            .thm-stat-icon.amber { background: #fef3c7; color: #b45309; }
            .thm-stat-icon.blue { background: #e0f2fe; color: #0369a1; }
            .thm-stat-icon.purple { background: #f3e8ff; color: #7e22ce; }
            .thm-stat-meta .thm-stat-val {
                font-size: 1.55rem;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.1;
            }
            .thm-stat-meta .thm-stat-lbl {
                font-size: 0.74rem;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-top: 3px;
            }

            /* Unified Toolbar */
            .thm-toolbar {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                padding: 12px 18px;
                margin-bottom: 22px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
                flex-wrap: wrap;
            }
            .thm-filters-left {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .thm-select-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
            }
            .thm-select-wrap i {
                position: absolute;
                left: 12px;
                color: #64748b;
                font-size: 0.82rem;
                pointer-events: none;
            }
            .thm-select-wrap .thm-select {
                padding-left: 32px;
                padding-right: 28px;
                height: 38px;
                border: 1px solid #cbd5e1;
                border-radius: 9px;
                background: #ffffff;
                color: #1e293b;
                font-size: 0.84rem;
                font-weight: 500;
                outline: none;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .thm-select-wrap .thm-select:focus {
                border-color: #166534;
                box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
            }
            .thm-filters-right {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .thm-status-tabs {
                display: inline-flex;
                background: #f1f5f9;
                border-radius: 9px;
                padding: 3px;
                gap: 2px;
            }
            .thm-tab-btn {
                padding: 6px 14px;
                border: none;
                background: transparent;
                border-radius: 7px;
                font-size: 0.80rem;
                font-weight: 600;
                color: #64748b;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .thm-tab-btn.active {
                background: #ffffff;
                color: #166534;
                font-weight: 700;
                box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            }
            .thm-search-wrap {
                position: relative;
                width: 220px;
            }
            .thm-search-wrap i {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #94a3b8;
                font-size: 0.84rem;
                pointer-events: none;
            }
            .thm-search-wrap .thm-input {
                width: 100%;
                height: 38px;
                padding: 0 12px 0 34px;
                border: 1px solid #cbd5e1;
                border-radius: 9px;
                background: #ffffff;
                color: #1e293b;
                font-size: 0.84rem;
                outline: none;
                transition: all 0.2s ease;
            }
            .thm-search-wrap .thm-input:focus {
                border-color: #166534;
                box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
            }

            /* Cards Grid */
            .thm-cards-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                gap: 18px;
            }
            .thm-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 20px 22px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-shadow: 0 2px 10px rgba(0,0,0,0.03);
                transition: all 0.25s ease;
                position: relative;
                border-left: 4px solid #166534;
            }
            .thm-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 10px 25px rgba(0,0,0,0.08);
                border-color: #cbd5e1;
                border-left-color: #166534;
            }
            .thm-card-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 14px;
            }
            .thm-badge-class {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 4px 10px;
                border-radius: 7px;
                font-size: 0.76rem;
                font-weight: 700;
                background: #f1f5f9;
                color: #334155;
            }
            .thm-badge-subject {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 4px 10px;
                border-radius: 7px;
                font-size: 0.76rem;
                font-weight: 700;
                background: #e0f2fe;
                color: #0369a1;
            }
            .thm-badge-status {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.72rem;
                font-weight: 700;
                padding: 3px 9px;
                border-radius: 999px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }
            .thm-badge-status.active { background: #dcfce7; color: #166534; }
            .thm-badge-status.today { background: #fef3c7; color: #b45309; }
            .thm-badge-status.past { background: #fee2e2; color: #b91c1c; }
            .thm-card-title {
                font-size: 1.08rem;
                font-weight: 800;
                color: #0f172a;
                margin: 0 0 10px 0;
                line-height: 1.4;
            }
            .thm-card-desc {
                font-size: 0.85rem;
                color: #475569;
                line-height: 1.55;
                margin: 0 0 16px 0;
                background: #f8fafc;
                border: 1px solid #f1f5f9;
                border-radius: 9px;
                padding: 10px 12px;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                white-space: pre-wrap;
            }
            .thm-card-due-box {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 9px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.80rem;
                margin-bottom: 14px;
            }
            .thm-due-label {
                color: #64748b;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .thm-due-val {
                font-weight: 700;
                color: #0f172a;
            }
            .thm-card-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                border-top: 1px dashed #e2e8f0;
                padding-top: 14px;
            }
            .thm-action-btn {
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 14px;
                font-size: 0.80rem;
                font-weight: 600;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #334155;
            }
            .thm-action-btn:hover {
                border-color: #166534;
                color: #166534;
                background: #f0fdf4;
            }
            .thm-action-btn.delete {
                flex: 0 0 auto;
                width: 38px;
                height: 38px;
                padding: 0;
                color: #dc2626;
                border-color: #fecaca;
            }
            .thm-action-btn.delete:hover {
                background: #fee2e2;
                border-color: #ef4444;
            }
            .thm-action-btn.defaulters {
                background: #eff6ff;
                border-color: #bfdbfe;
                color: #1d4ed8;
                font-weight: 700;
            }
            .thm-action-btn.defaulters:hover {
                background: #dbeafe;
                border-color: #3b82f6;
                color: #1e40af;
            }
            .thm-action-btn.defaulters.reviewed {
                background: #fef2f2;
                border-color: #fecaca;
                color: #b91c1c;
            }
            .thm-action-btn.defaulters.reviewed:hover {
                background: #fee2e2;
                border-color: #ef4444;
                color: #991b1b;
            }

            /* Empty State */
            .thm-empty {
                grid-column: 1 / -1;
                background: #ffffff;
                border: 2px dashed #cbd5e1;
                border-radius: 18px;
                padding: 54px 24px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            .thm-empty-icon {
                width: 68px;
                height: 68px;
                border-radius: 50%;
                background: #dcfce7;
                color: #166534;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 1.85rem;
                margin-bottom: 16px;
            }
            .thm-empty h3 {
                margin: 0 0 8px 0;
                color: #0f172a;
                font-size: 1.25rem;
                font-weight: 800;
            }
            .thm-empty p {
                margin: 0 0 20px 0;
                color: #64748b;
                font-size: 0.90rem;
                max-width: 440px;
                line-height: 1.5;
            }
            .thm-empty .thm-btn-primary {
                width: auto;
                min-width: 200px;
                padding: 11px 24px;
            }

            /* Modal Styles */
            .thm-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(4px);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 16px;
            }
            .thm-modal-overlay.active { display: flex; }
            .thm-modal-card {
                background: #ffffff;
                border-radius: 18px;
                max-width: 580px;
                width: 100%;
                max-height: 92vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                display: flex;
                flex-direction: column;
            }
            .thm-modal-header {
                padding: 18px 24px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #f8fafc;
                border-radius: 18px 18px 0 0;
            }
            .thm-modal-header h3 {
                margin: 0;
                color: #14532d;
                font-size: 1.15rem;
                font-weight: 800;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .thm-modal-close {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                cursor: pointer;
                color: #64748b;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            .thm-modal-close:hover {
                background: #fee2e2;
                color: #dc2626;
                border-color: #ef4444;
            }
            .thm-modal-body {
                padding: 22px 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .thm-form-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .thm-form-group label {
                font-size: 0.78rem;
                font-weight: 700;
                color: #334155;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }
            .thm-form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            .thm-textarea {
                min-height: 110px;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-family: inherit;
                font-size: 0.85rem;
                outline: none;
                resize: vertical;
            }
            .thm-textarea:focus {
                border-color: #166534;
                box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
            }
            .thm-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                background: #f8fafc;
                border-radius: 0 0 18px 18px;
            }

            /* Responsive */
            @media (max-width: 1024px) {
                .thm-stats-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
            @media (max-width: 768px) {
                .thm-header-wrap {
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 18px 20px;
                }
                .thm-header-actions, .thm-header-actions .thm-btn-primary {
                    width: 100%;
                }
                .thm-toolbar {
                    flex-direction: column;
                    align-items: stretch;
                }
                .thm-filters-left, .thm-filters-right {
                    width: 100%;
                }
                .thm-select-wrap, .thm-select-wrap .thm-select {
                    width: 100%;
                }
                .thm-search-wrap {
                    width: 100%;
                }
                .thm-status-tabs {
                    width: 100%;
                    display: flex;
                }
                .thm-tab-btn {
                    flex: 1;
                    text-align: center;
                }
                .thm-stats-grid {
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .thm-cards-grid {
                    grid-template-columns: 1fr;
                }
                .thm-form-row {
                    grid-template-columns: 1fr;
                }
            }
            /* Compact mobile workspace: keep the assignment list primary and
               reduce decorative space around stats and controls. */
            @media (max-width: 560px) {
                .thm-shell { padding: 0 0 22px; }
                .thm-header-wrap {
                    min-height: 58px;
                    flex-direction: row;
                    align-items: center;
                    gap: 10px;
                    padding: 11px 12px 11px 15px;
                    margin: 0 0 10px;
                    border-radius: 12px;
                }
                .thm-header-wrap::before { width: 3px; }
                .thm-header-kicker { display: none; }
                .thm-header-title {
                    margin: 0;
                    font-size: 1rem;
                    line-height: 1.2;
                    gap: 7px;
                }
                .thm-header-title i { font-size: .9rem; }
                .thm-header-subtitle { display: none; }
                .thm-header-actions { width: auto; }
                .thm-header-actions .thm-btn-primary {
                    width: 36px;
                    height: 36px;
                    padding: 0;
                    border-radius: 9px;
                    font-size: 0;
                    box-shadow: none;
                    display: grid !important;
                    place-items: center !important;
                    line-height: 1 !important;
                }
                .thm-header-actions .thm-btn-primary i {
                    display: block;
                    width: 1em;
                    height: 1em;
                    margin: 0 !important;
                    font-size: .9rem;
                    line-height: 1 !important;
                    text-align: center;
                }
                .thm-stats-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 6px;
                    margin-bottom: 10px;
                }
                .thm-stat-card {
                    min-width: 0;
                    min-height: 58px;
                    padding: 8px 5px;
                    flex-direction: column;
                    justify-content: center;
                    gap: 3px;
                    border-radius: 10px;
                    box-shadow: none;
                }
                .thm-stat-card:hover { transform: none; box-shadow: none; }
                .thm-stat-icon {
                    width: 22px;
                    height: 22px;
                    border-radius: 6px;
                    font-size: .7rem;
                }
                .thm-stat-meta { text-align: center; min-width: 0; }
                .thm-stat-meta .thm-stat-val { font-size: 1rem; }
                .thm-stat-meta .thm-stat-lbl {
                    margin-top: 1px;
                    font-size: .48rem;
                    letter-spacing: .02em;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .thm-toolbar {
                    padding: 8px;
                    margin-bottom: 10px;
                    gap: 8px;
                    border-radius: 10px;
                    box-shadow: none;
                }
                .thm-filters-left, .thm-filters-right { gap: 6px; }
                .thm-filters-left { display: grid; grid-template-columns: 1fr 1fr; }
                .thm-select-wrap, .thm-select-wrap .thm-select { min-width: 0; width: 100%; }
                .thm-select-wrap .thm-select { height: 34px; padding-left: 27px; padding-right: 5px; font-size: .72rem; }
                .thm-select-wrap i { left: 8px; font-size: .7rem; }
                .thm-filters-right { display: grid; grid-template-columns: 1fr; }
                .thm-status-tabs { width: 100%; }
                .thm-tab-btn { padding: 6px 5px; font-size: .7rem; }
                .thm-search-wrap { width: 100%; }
                .thm-search-wrap .thm-input { height: 34px; font-size: .75rem; }
                .thm-cards-grid { gap: 8px; }
                .thm-card {
                    padding: 12px;
                    border-radius: 11px;
                    border-left-width: 3px;
                    box-shadow: none;
                }
                .thm-card:hover { transform: none; box-shadow: none; }
                .thm-card-head { margin-bottom: 8px; gap: 5px; }
                .thm-badge-class, .thm-badge-subject { padding: 3px 6px; font-size: .62rem; }
                .thm-badge-status { padding: 3px 6px; font-size: .58rem; }
                .thm-card-title { margin-bottom: 7px; font-size: .94rem; }
                .thm-card-desc { margin-bottom: 9px; padding: 7px 8px; font-size: .75rem; -webkit-line-clamp: 2; }
                .thm-card-due-box { margin-bottom: 9px; padding: 7px 8px; font-size: .7rem; }
                .thm-card-actions { padding-top: 9px; gap: 5px; }
                .thm-action-btn { padding: 7px 5px; font-size: .68rem; }
                .thm-action-btn.delete { width: 32px; height: 32px; }
                .thm-modal-overlay { padding: 0; align-items: stretch; }
                .thm-modal-card { max-width: none; max-height: 100dvh; height: 100dvh; border-radius: 0; }
                .thm-modal-header { padding: 13px 15px; border-radius: 0; }
                .thm-modal-body { padding: 15px; gap: 12px; overflow-y: auto; }
                .thm-modal-footer { padding: 11px 15px; border-radius: 0; }
                .thm-modal-footer .thm-btn-primary, .thm-modal-footer .thm-btn-cancel { flex: 1; }
                #thmDefaultersModal .thm-modal-card {
                    max-width: none !important;
                    width: 100%;
                    height: 100svh !important;
                    min-height: 100svh !important;
                    max-height: 100svh !important;
                    border-radius: 0;
                    display: flex !important;
                    flex-direction: column !important;
                    overflow: hidden !important;
                }
                #thmDefaultersModal.active { align-items: stretch; padding: 0; }
                #thmDefaultersModal .thm-modal-header {
                    padding: 12px 14px;
                    border-radius: 0;
                    min-height: 58px;
                }
                #thmDefaultersModal .thm-modal-header h3 { font-size: .92rem !important; }
                #thmDefaultersModal .thm-modal-header p { font-size: .68rem !important; }
                #thmDefaultersModal .thm-modal-body {
                    flex: 1 1 auto !important;
                    min-height: 0;
                    max-height: none !important;
                    overflow-y: auto;
                    padding: 12px !important;
                }
                #thmDefaultersModal .thm-modal-body > div:first-child {
                    flex-direction: column !important;
                    align-items: stretch !important;
                    gap: 8px !important;
                }
                #thmDefaultersModal .thm-modal-body > div:first-child > div:first-child { min-width: 0 !important; }
                #thmDefaultersModal .thm-modal-body > div:first-child > div:last-child {
                    width: 100%;
                    display: grid !important;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px !important;
                }
                #thmDefaultersModal .thm-modal-body > div:first-child button {
                    min-width: 0;
                    padding: 7px 5px !important;
                    font-size: .68rem !important;
                }
                #thmDefaultersModal .thm-modal-body > div:nth-child(2) {
                    padding: 8px 9px !important;
                    font-size: .7rem !important;
                    align-items: flex-start !important;
                }
                #thmDefaultersModal .thm-def-student-item { padding: 9px 10px !important; gap: 7px; }
                #thmDefaultersModal .thm-def-student-item > div:first-child { gap: 8px !important; }
                #thmDefaultersModal .thm-def-student-item > div:first-child > div:first-child { width: 30px !important; height: 30px !important; }
                #thmDefaultersModal .thm-def-status-pill { padding: 3px 6px !important; font-size: .62rem !important; }
                #thmDefaultersModal .thm-modal-footer {
                    flex: 0 0 auto !important;
                    display: flex !important;
                    position: relative;
                    z-index: 2;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: 0;
                }
                #thmDefaultersModal .thm-modal-footer > div:last-child { width: 100%; display: grid !important; grid-template-columns: 1fr 1.4fr; gap: 7px !important; }
                #thmDefaultersModal .thm-modal-footer button { width: 100%; min-height: 38px; padding: 8px 5px; font-size: .75rem; }
                #thmModal .thm-modal-card {
                    max-width: none !important;
                    width: 100%;
                    height: 100dvh;
                    max-height: 100dvh;
                    border-radius: 0;
                }
                #thmModal .thm-modal-header {
                    padding: 13px 15px;
                    min-height: 56px;
                    border-radius: 0;
                }
                #thmModal .thm-modal-header h3 { font-size: .95rem; }
                #thmModal form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
                #thmModal .thm-modal-body {
                    flex: 1;
                    min-height: 0;
                    max-height: none;
                    overflow-y: auto;
                    padding: 14px 15px;
                    gap: 12px;
                }
                #thmModal .thm-form-group { gap: 5px; }
                #thmModal .thm-form-group label { font-size: .7rem; }
                #thmModal .thm-input, #thmModal .thm-textarea {
                    width: 100%;
                    box-sizing: border-box;
                    font-size: 16px;
                }
                #thmModal .thm-textarea { min-height: 130px; }
                #thmModal .thm-modal-footer {
                    padding: 10px 15px;
                    border-radius: 0;
                    gap: 7px;
                }
                #thmModal .thm-modal-footer .thm-btn-cancel,
                #thmModal .thm-modal-footer .thm-btn-primary {
                    flex: 1;
                    min-height: 40px;
                    padding: 9px 7px;
                    font-size: .76rem;
                }
            }
            /* All homework dialogs use the full viewport on phones. Keep
               this shared rule last so section/container styles cannot clip
               the edit, create, or defaulter page. */
            @media (max-width: 768px) {
                #thmModal.active,
                #thmDefaultersModal.active {
                    position: fixed !important;
                    inset: 0 !important;
                    width: 100vw !important;
                    height: 100svh !important;
                    min-height: 100svh !important;
                    max-height: 100svh !important;
                    padding: 0 !important;
                    display: flex !important;
                    align-items: stretch !important;
                    justify-content: stretch !important;
                    overflow: hidden !important;
                    z-index: 100000 !important;
                }
                #thmModal.active .thm-modal-card,
                #thmDefaultersModal.active .thm-modal-card {
                    width: 100% !important;
                    max-width: none !important;
                    height: 100svh !important;
                    min-height: 100svh !important;
                    max-height: 100svh !important;
                    margin: 0 !important;
                    border-radius: 0 !important;
                    overflow: hidden !important;
                }
                #thmModal.active .thm-modal-body,
                #thmDefaultersModal.active .thm-modal-body {
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                    max-height: none !important;
                    overflow-y: auto !important;
                    -webkit-overflow-scrolling: touch;
                }
                #thmModal.active .thm-modal-footer,
                #thmDefaultersModal.active .thm-modal-footer {
                    flex: 0 0 auto !important;
                    visibility: visible !important;
                    padding-bottom: max(10px, env(safe-area-inset-bottom, 10px)) !important;
                }
            }
        `;
        document.head.appendChild(style);

        // Add Section Panel Container
        const panel = document.createElement('section');
        panel.id = 'homeworkSection';
        panel.className = 'section-container';
        panel.setAttribute('aria-label', 'Homework Management');
        panel.innerHTML = `
            <div class="thm-shell">
                <div class="thm-header-wrap">
                    <div class="thm-header-info">
                        <div class="thm-header-kicker"><i class="fas fa-graduation-cap"></i> Academic Management</div>
                        <h1 class="thm-header-title"><i class="fas fa-book"></i> Class Homework &amp; Assignments</h1>
                        <p class="thm-header-subtitle">Assign homework to your classes, specify submission instructions, and track student tasks in real time.</p>
                    </div>
                    <div class="thm-header-actions">
                        <button type="button" class="thm-btn-primary" id="thmCreateBtn">
                            <i class="fas fa-plus"></i> Assign New Homework
                        </button>
                    </div>
                </div>

                <div class="thm-stats-grid">
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon green"><i class="fas fa-list-check"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatActive">0</div>
                            <div class="thm-stat-lbl">Active Homework</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon amber"><i class="fas fa-clock"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatToday">0</div>
                            <div class="thm-stat-lbl">Due Today</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon blue"><i class="fas fa-chalkboard-user"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatClasses">0</div>
                            <div class="thm-stat-lbl">Classes Covered</div>
                        </div>
                    </div>
                    <div class="thm-stat-card">
                        <div class="thm-stat-icon purple"><i class="fas fa-layer-group"></i></div>
                        <div class="thm-stat-meta">
                            <div class="thm-stat-val" id="thmStatTotal">0</div>
                            <div class="thm-stat-lbl">Total Assigned</div>
                        </div>
                    </div>
                </div>

                <div class="thm-toolbar">
                    <div class="thm-filters-left">
                        <div class="thm-select-wrap">
                            <i class="fas fa-users-rectangle"></i>
                            <select class="thm-select" id="thmFilterClass">
                                <option value="">All My Classes</option>
                            </select>
                        </div>
                        <div class="thm-select-wrap">
                            <i class="fas fa-book"></i>
                            <select class="thm-select" id="thmFilterSubject">
                                <option value="">All Subjects</option>
                            </select>
                        </div>
                    </div>
                    <div class="thm-filters-right">
                        <div class="thm-status-tabs">
                            <button type="button" class="thm-tab-btn active" data-status="all">All</button>
                            <button type="button" class="thm-tab-btn" data-status="active">Active</button>
                            <button type="button" class="thm-tab-btn" data-status="past">Past Due</button>
                        </div>
                        <div class="thm-search-wrap">
                            <i class="fas fa-search"></i>
                            <input type="text" class="thm-input" id="thmSearchInput" placeholder="Search homework...">
                        </div>
                    </div>
                </div>

                <div class="thm-cards-grid" id="thmCardsGrid">
                    <div class="thm-empty">
                        <div class="thm-empty-icon"><i class="fas fa-spinner fa-spin"></i></div>
                        <h3>Loading assignments...</h3>
                    </div>
                </div>
            </div>

            <!-- Create / Edit Homework Modal -->
            <div class="thm-modal-overlay" id="thmModal">
                <div class="thm-modal-card">
                    <div class="thm-modal-header">
                        <h3 id="thmModalTitle"><i class="fas fa-pencil"></i> Assign New Homework</h3>
                        <button type="button" class="thm-modal-close" id="thmModalCloseBtn">&times;</button>
                    </div>
                    <form id="thmForm">
                        <input type="hidden" id="thmEditId" value="">
                        <div class="thm-modal-body">
                            <div class="thm-form-row">
                                <div class="thm-form-group">
                                    <label for="thmFormClass"><i class="fas fa-chalkboard"></i> Target Class & Section *</label>
                                    <select class="thm-select" id="thmFormClass" required>
                                        <option value="">Select Class & Section</option>
                                    </select>
                                </div>
                                <div class="thm-form-group">
                                    <label for="thmFormSubject"><i class="fas fa-book"></i> Subject *</label>
                                    <input type="text" class="thm-input" id="thmFormSubject" required placeholder="e.g. Mathematics, Physics">
                                </div>
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormTitle"><i class="fas fa-heading"></i> Homework Title / Topic *</label>
                                <input type="text" class="thm-input" id="thmFormTitle" required placeholder="e.g. Chapter 4: Calculus Practice Problems">
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormDesc"><i class="fas fa-align-left"></i> Assignment Details & Instructions *</label>
                                <textarea class="thm-textarea" id="thmFormDesc" required placeholder="Specify question numbers, exercises, reading materials, or instructions for the students..."></textarea>
                            </div>

                            <div class="thm-form-row">
                                <div class="thm-form-group">
                                    <label for="thmFormDueDate"><i class="fas fa-calendar-day"></i> Due Date *</label>
                                    <input type="date" class="thm-input" id="thmFormDueDate" required>
                                </div>
                                <div class="thm-form-group">
                                    <label for="thmFormDueTime"><i class="fas fa-clock"></i> Due Time *</label>
                                    <input type="time" class="thm-input" id="thmFormDueTime" value="23:59" required>
                                </div>
                            </div>

                            <div class="thm-form-group">
                                <label for="thmFormNote"><i class="fas fa-note-sticky"></i> Submission Note / Instructions (Optional)</label>
                                <input type="text" class="thm-input" id="thmFormNote" placeholder="e.g. Submit in assignment notebook in next period">
                            </div>
                        </div>
                        <div class="thm-modal-footer">
                            <button type="button" class="thm-btn-cancel" id="thmModalCancelBtn">Cancel</button>
                            <button type="submit" class="thm-btn-primary" id="thmModalSubmitBtn">
                                <i class="fas fa-paper-plane"></i> Publish Homework
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Mark Defaulters Modal -->
            <div class="thm-modal-overlay" id="thmDefaultersModal">
                <div class="thm-modal-card" style="max-width: 650px;">
                    <div class="thm-modal-header" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff;">
                        <div>
                            <h3 id="thmDefModalTitle" style="color: #fff; margin: 0; font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-user-check"></i> Mark Homework Defaulters
                            </h3>
                            <p id="thmDefModalSubtitle" style="margin: 4px 0 0; font-size: 0.8rem; color: #94a3b8;"></p>
                        </div>
                        <button type="button" class="thm-modal-close" id="thmDefModalCloseBtn" style="color: #94a3b8; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2);">&times;</button>
                    </div>
                    <div class="thm-modal-body" style="max-height: 60vh; overflow-y: auto; padding: 18px 22px;">
                        <!-- Quick actions bar -->
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
                            <div style="position: relative; flex: 1; min-width: 200px;">
                                <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem;"></i>
                                <input type="text" id="thmDefSearchInput" class="thm-input" placeholder="Search by student name or roll..." style="padding-left: 32px; font-size: 0.82rem;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button type="button" class="thm-action-btn" id="thmDefSelectAllBtn" style="padding: 6px 12px; font-size: 0.78rem;">
                                    <i class="fas fa-check-double"></i> Select All
                                </button>
                                <button type="button" class="thm-action-btn" id="thmDefClearAllBtn" style="padding: 6px 12px; font-size: 0.78rem;">
                                    <i class="fas fa-check"></i> All Completed (0 Defaulters)
                                </button>
                            </div>
                        </div>

                        <!-- Info Alert -->
                        <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-circle-info" style="font-size: 1.1rem; color: #3b82f6; flex-shrink: 0;"></i>
                            <span>Checked students will see an <strong>Incomplete / Defaulter</strong> homework card. Unchecked students completed the task and will have <strong>zero clutter</strong> (no card).</span>
                        </div>

                        <!-- Students List -->
                        <div id="thmDefStudentsList" style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="text-align: center; padding: 24px; color: #64748b;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 1.4rem;"></i>
                                <p style="margin-top: 8px; font-size: 0.85rem;">Loading class students...</p>
                            </div>
                        </div>
                    </div>
                    <div class="thm-modal-footer" style="justify-content: space-between;">
                        <div id="thmDefSummaryCount" style="font-size: 0.85rem; font-weight: 700; color: #334155;">
                            0 Defaulters selected
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="thm-btn-cancel" id="thmDefCancelBtn">Cancel</button>
                            <button type="button" class="thm-btn-primary" id="thmDefSubmitBtn" style="background: #dc2626; border-color: #b91c1c;">
                                <i class="fas fa-save"></i> Save Defaulters
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(panel);

        // Keep modal overlays outside section containers. The teacher panel
        // has mobile width/overflow rules that can otherwise constrain a
        // fixed dialog to the content column instead of the device viewport.
        ['thmModal', 'thmDefaultersModal'].forEach(id => {
            const modal = panel.querySelector('#' + id);
            if (modal) document.body.appendChild(modal);
        });

        // Sidebar click handler
        nav.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.switchTeacherSection === 'function') {
                window.switchTeacherSection('homework');
            } else {
                document.querySelectorAll('.main-content .section-container').forEach(s => s.classList.remove('active'));
                panel.classList.add('active');
                sidebar.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                nav.classList.add('active');
            }
        });

        // App state
        let currentTeacher = null;
        let schoolId = '';
        let myClassesMap = new Map(); // key -> { classId, className, section, year, subject }
        let homeworkList = [];
        let activeStatusFilter = 'all';

        const db = firebase.database();

        function safeKey(str) {
            return String(str || '').replace(/[.#$\[\]/]/g, '_').trim();
        }

        function normSec(sec) {
            return String(sec || '').trim().replace(/^section\s+/i, '').toUpperCase();
        }

        function formatDisplayDate(dateStr, timeStr) {
            if (!dateStr) return '';
            const dt = new Date(`${dateStr}T${timeStr || '23:59'}`);
            if (isNaN(dt.getTime())) return dateStr;
            return dt.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }) + (timeStr ? ` at ${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '');
        }

        function getDueStatus(dateStr, timeStr) {
            if (!dateStr) return { status: 'active', label: 'Active', cls: 'active' };
            const due = new Date(`${dateStr}T${timeStr || '23:59'}`);
            const now = new Date();
            const diffHours = (due - now) / (1000 * 60 * 60);

            if (diffHours < 0) {
                return { status: 'past', label: 'Past Due', cls: 'past' };
            }
            if (due.toDateString() === now.toDateString() || (diffHours >= 0 && diffHours <= 18)) {
                return { status: 'today', label: 'Due Today', cls: 'today' };
            }
            return { status: 'active', label: 'Active', cls: 'active' };
        }

        // Resolves teacher's classes across all RTDB assignments
        async function loadTeacherClasses(user, profile) {
            schoolId = profile.schoolId || '';
            if (!schoolId) return;

            myClassesMap.clear();

            try {
                const [
                    coursesSnap,
                    schoolClassesSnap,
                    subjAssignSnap,
                    classTeacherSnap,
                    timetablesSnap
                ] = await Promise.all([
                    db.ref(`schoolCourses/${schoolId}`).once('value'),
                    db.ref(`schoolClasses/${schoolId}`).once('value'),
                    db.ref(`subjectTeacherAssignments/${schoolId}`).once('value'),
                    db.ref(`classTeacherAssignmentsByClass/${schoolId}`).once('value'),
                    db.ref(`schoolTimetables/${schoolId}`).once('value')
                ]);

                const courses = coursesSnap.val() || {};
                const schoolClasses = schoolClassesSnap.val() || {};
                const subjAssignments = subjAssignSnap.val() || {};
                const ctAssignments = classTeacherSnap.val() || {};
                const timetables = timetablesSnap.val() || {};

                const teacherDefaultSubject = profile.subject || profile.department || '';

                // 1. Subject Teacher Assignments
                Object.entries(subjAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, subjects]) => {
                        Object.entries(subjects || {}).forEach(([subKey, item]) => {
                            if (item?.teacherId === user.uid || item?.teacherEmail === user.email) {
                                const className = item.className || courses[clsId]?.courseName || 'Class';
                                const section = item.section || secKey;
                                const key = `${clsId}_${normSec(section)}`;
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className,
                                    section: normSec(section),
                                    year: item.year || '',
                                    subject: item.subjectName || item.subject || teacherDefaultSubject
                                });
                            }
                        });
                    });
                });

                // 2. Class Teacher Assignments
                Object.entries(ctAssignments).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, item]) => {
                        if (item?.teacherId === user.uid) {
                            const className = item.className || courses[clsId]?.courseName || 'Class';
                            const section = item.section || secKey;
                            const key = `${clsId}_${normSec(section)}`;
                            if (!myClassesMap.has(key)) {
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className,
                                    section: normSec(section),
                                    year: item.year || '',
                                    subject: teacherDefaultSubject
                                });
                            }
                        }
                    });
                });

                // 3. Timetable Slots
                Object.entries(timetables).forEach(([clsId, sections]) => {
                    Object.entries(sections || {}).forEach(([secKey, schedule]) => {
                        const sec = schedule.section || secKey;
                        const key = `${clsId}_${normSec(sec)}`;
                        Object.values(schedule?.slots || {}).forEach(periods => {
                            Object.values(periods || {}).forEach(slot => {
                                if (slot?.teacherId === user.uid) {
                                    const className = schedule.className || courses[clsId]?.courseName || 'Class';
                                    const existing = myClassesMap.get(key) || {
                                        classId: clsId,
                                        className,
                                        section: normSec(sec),
                                        year: schedule.year || '',
                                        subject: slot.subject || teacherDefaultSubject
                                    };
                                    if (slot.subject && !existing.subject) {
                                        existing.subject = slot.subject;
                                    }
                                    myClassesMap.set(key, existing);
                                }
                            });
                        });
                    });
                });

                // 4. Fallback from SchoolClasses or Courses if empty
                if (myClassesMap.size === 0) {
                    Object.entries(schoolClasses).forEach(([clsId, clsData]) => {
                        if (clsData.teacherId === user.uid || clsData.teacherEmail === user.email || !clsData.teacherId) {
                            const secs = Array.isArray(clsData.sections) ? clsData.sections : (clsData.section ? [clsData.section] : ['A']);
                            secs.forEach(s => {
                                const key = `${clsId}_${normSec(s)}`;
                                myClassesMap.set(key, {
                                    classId: clsId,
                                    className: clsData.className || clsData.name || 'Class',
                                    section: normSec(s),
                                    year: '',
                                    subject: clsData.subject || teacherDefaultSubject
                                });
                            });
                        }
                    });
                }

                // If still empty, add default assigned class from profile
                if (myClassesMap.size === 0 && (profile.assignedClass || profile.className)) {
                    const assignedSecs = Array.isArray(profile.assignedSections) ? profile.assignedSections : (profile.section ? [profile.section] : ['A']);
                    assignedSecs.forEach(s => {
                        const key = `class_${normSec(s)}`;
                        myClassesMap.set(key, {
                            classId: profile.classId || '',
                            className: profile.assignedClass || profile.className || 'Class',
                            section: normSec(s),
                            year: '',
                            subject: teacherDefaultSubject
                        });
                    });
                }
            } catch (err) {
                console.warn('Could not populate teacher classes fully:', err);
            }

            // Populate Dropdowns in UI
            populateClassDropdowns();
        }

        function populateClassDropdowns() {
            const formSelect = document.getElementById('thmFormClass');
            const filterSelect = panel.querySelector('#thmFilterClass');
            const filterSubject = panel.querySelector('#thmFilterSubject');

            if (!formSelect || !filterSelect) return;

            // Clear options
            formSelect.innerHTML = '<option value="">-- Select Class & Section --</option>';
            filterSelect.innerHTML = '<option value="">All My Classes</option>';

            const subjectsSet = new Set();

            Array.from(myClassesMap.entries()).forEach(([key, cls]) => {
                const label = `${cls.className} • Sec ${cls.section}${cls.subject ? ` (${cls.subject})` : ''}`;
                
                // Form select
                const opt1 = document.createElement('option');
                opt1.value = key;
                opt1.textContent = label;
                formSelect.appendChild(opt1);

                // Filter select
                const opt2 = document.createElement('option');
                opt2.value = key;
                opt2.textContent = label;
                filterSelect.appendChild(opt2);

                if (cls.subject) subjectsSet.add(cls.subject);
            });

            // Populate subjects filter
            if (filterSubject) {
                filterSubject.innerHTML = '<option value="">All Subjects</option>';
                subjectsSet.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.textContent = sub;
                    filterSubject.appendChild(opt);
                });
            }
        }

        // Realtime sync of homework items for this teacher & school
        function listenToHomework() {
            if (!schoolId || !currentTeacher) return;

            db.ref(`schoolHomework/${schoolId}`).on('value', snapshot => {
                const val = snapshot.val() || {};
                homeworkList = Object.entries(val)
                    .map(([id, item]) => ({ id, ...item }))
                    .filter(item => item.teacherId === currentTeacher.uid || item.teacherEmail === currentTeacher.email)
                    .sort((a, b) => {
                        const dateA = new Date(`${a.dueDate}T${a.dueTime || '23:59'}`).getTime() || 0;
                        const dateB = new Date(`${b.dueDate}T${b.dueTime || '23:59'}`).getTime() || 0;
                        return dateB - dateA;
                    });

                renderCards();
                updateStats();
            });
        }

        function updateStats() {
            const total = homeworkList.length;
            let active = 0;
            let dueToday = 0;
            const uniqueClasses = new Set();

            homeworkList.forEach(hw => {
                const status = getDueStatus(hw.dueDate, hw.dueTime);
                if (status.status === 'active' || status.status === 'today') active++;
                if (status.status === 'today') dueToday++;
                uniqueClasses.add(`${hw.className}_${hw.section}`);
            });

            panel.querySelector('#thmStatTotal').textContent = total;
            panel.querySelector('#thmStatActive').textContent = active;
            panel.querySelector('#thmStatToday').textContent = dueToday;
            panel.querySelector('#thmStatClasses').textContent = uniqueClasses.size;
        }

        function renderCards() {
            const grid = panel.querySelector('#thmCardsGrid');
            if (!grid) return;

            const selectedClass = panel.querySelector('#thmFilterClass')?.value || '';
            const selectedSubject = panel.querySelector('#thmFilterSubject')?.value || '';
            const query = (panel.querySelector('#thmSearchInput')?.value || '').trim().toLowerCase();

            const filtered = homeworkList.filter(item => {
                // Class filter
                if (selectedClass) {
                    const itemKey = `${item.classId || item.className}_${normSec(item.section)}`;
                    if (itemKey !== selectedClass && `${item.className}_${normSec(item.section)}` !== selectedClass) {
                        return false;
                    }
                }
                // Subject filter
                if (selectedSubject && item.subject.toLowerCase() !== selectedSubject.toLowerCase()) {
                    return false;
                }
                // Status tab filter
                const dueInfo = getDueStatus(item.dueDate, item.dueTime);
                if (activeStatusFilter === 'active' && dueInfo.status === 'past') return false;
                if (activeStatusFilter === 'past' && dueInfo.status !== 'past') return false;

                // Search query
                if (query) {
                    const matchText = `${item.title} ${item.description} ${item.subject} ${item.className} ${item.section}`.toLowerCase();
                    if (!matchText.includes(query)) return false;
                }

                return true;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="thm-empty">
                        <div class="thm-empty-icon"><i class="fas fa-clipboard-check"></i></div>
                        <h3>No homework assigned yet</h3>
                        <p>${homeworkList.length === 0 ? "You haven't assigned any homework yet. Click below to create your first class assignment." : "No assignments match your selected filters or search query."}</p>
                        <button type="button" class="thm-btn-primary" id="thmEmptyAddBtn">
                            <i class="fas fa-plus"></i> Assign New Homework
                        </button>
                    </div>
                `;
                grid.querySelector('#thmEmptyAddBtn')?.addEventListener('click', openCreateModal);
                return;
            }

            grid.innerHTML = filtered.map(hw => {
                const dueInfo = getDueStatus(hw.dueDate, hw.dueTime);
                const displayDue = formatDisplayDate(hw.dueDate, hw.dueTime);

                const hasDefaulters = !!hw.defaultersReviewed;
                const defaultersCount = hw.defaultersCount ?? (hw.defaulters ? Object.keys(hw.defaulters).length : 0);

                return `
                    <div class="thm-card" data-id="${hw.id}">
                        <div>
                            <div class="thm-card-head">
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    <span class="thm-badge-class">
                                        <i class="fas fa-users"></i> ${escapeHtml(hw.className || 'Class')} • Sec ${escapeHtml(hw.section || 'All')}
                                    </span>
                                    <span class="thm-badge-subject">
                                        <i class="fas fa-book"></i> ${escapeHtml(hw.subject || 'General')}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                                    ${hasDefaulters ? `
                                        <span class="thm-badge-status" style="background:#fef2f2; color:#b91c1c; border-color:#fecaca; font-weight:700;">
                                            <i class="fas fa-user-xmark"></i> ${defaultersCount} Defaulter${defaultersCount === 1 ? '' : 's'}
                                        </span>
                                    ` : ''}
                                    <span class="thm-badge-status ${dueInfo.cls}">
                                        ${dueInfo.label}
                                    </span>
                                </div>
                            </div>

                            <h3 class="thm-card-title">${escapeHtml(hw.title)}</h3>
                            <p class="thm-card-desc">${escapeHtml(hw.description)}</p>
                        </div>

                        <div>
                            <div class="thm-card-due-box">
                                <span class="thm-due-label">
                                    <i class="fas fa-calendar-check"></i> Due Date:
                                </span>
                                <span class="thm-due-val">${displayDue}</span>
                            </div>

                            ${hw.note ? `
                                <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 12px; display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-circle-info"></i> ${escapeHtml(hw.note)}
                                </div>
                            ` : ''}

                            <div class="thm-card-actions">
                                <button type="button" class="thm-action-btn defaulters ${hasDefaulters ? 'reviewed' : ''}" data-id="${hw.id}">
                                    <i class="fas fa-user-check"></i> ${hasDefaulters ? 'Edit Defaulters' : 'Mark Defaulters'}
                                </button>
                                <button type="button" class="thm-action-btn edit-btn" data-id="${hw.id}">
                                    <i class="fas fa-pen-to-square"></i> Edit
                                </button>
                                <button type="button" class="thm-action-btn delete-btn delete" data-id="${hw.id}" title="Delete Homework">
                                    <i class="fas fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind card buttons
            grid.querySelectorAll('.defaulters').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const item = homeworkList.find(x => x.id === id);
                    if (item) openDefaultersModal(item);
                });
            });

            grid.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const item = homeworkList.find(x => x.id === id);
                    if (item) openEditModal(item);
                });
            });

            grid.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this homework assignment?')) {
                        try {
                            await db.ref(`schoolHomework/${schoolId}/${id}`).remove();
                            if (window.showToast) window.showToast('Homework deleted successfully.', 'info');
                        } catch (e) {
                            alert('Failed to delete homework: ' + e.message);
                        }
                    }
                });
            });
        }

        function escapeHtml(str) {
            return String(str || '').replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // Modal Management
        const modal = document.getElementById('thmModal');
        const form = modal?.querySelector('#thmForm');

        function openCreateModal() {
            form.reset();
            modal.querySelector('#thmEditId').value = '';
            modal.querySelector('#thmModalTitle').innerHTML = '<i class="fas fa-pencil"></i> Assign New Homework';
            modal.querySelector('#thmModalSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Publish Homework';

            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            modal.querySelector('#thmFormDueDate').value = dateStr;
            modal.querySelector('#thmFormDueDate').min = new Date().toISOString().split('T')[0];
            modal.querySelector('#thmFormDueTime').value = '23:59';

            // Auto-fill subject if class selected
            const classSelect = modal.querySelector('#thmFormClass');
            classSelect.dispatchEvent(new Event('change'));

            modal.classList.add('active');
        }

        function openEditModal(item) {
            modal.querySelector('#thmEditId').value = item.id;
            modal.querySelector('#thmModalTitle').innerHTML = '<i class="fas fa-pen-to-square"></i> Edit Homework';
            modal.querySelector('#thmModalSubmitBtn').innerHTML = '<i class="fas fa-check"></i> Save Changes';

            const classSelect = modal.querySelector('#thmFormClass');
            const targetKey = `${item.classId || item.className}_${normSec(item.section)}`;
            classSelect.value = targetKey;

            modal.querySelector('#thmFormSubject').value = item.subject || '';
            modal.querySelector('#thmFormTitle').value = item.title || '';
            modal.querySelector('#thmFormDesc').value = item.description || '';
            modal.querySelector('#thmFormDueDate').value = item.dueDate || '';
            modal.querySelector('#thmFormDueTime').value = item.dueTime || '23:59';
            modal.querySelector('#thmFormNote').value = item.note || '';

            modal.classList.add('active');
        }

        function closeModal() {
            modal.classList.remove('active');
        }

        // Event Listeners for UI
        panel.querySelector('#thmCreateBtn')?.addEventListener('click', openCreateModal);
        modal?.querySelector('#thmModalCloseBtn')?.addEventListener('click', closeModal);
        modal?.querySelector('#thmModalCancelBtn')?.addEventListener('click', closeModal);

        // When Class selection changes in form, prefill subject if mapped
        modal?.querySelector('#thmFormClass')?.addEventListener('change', (e) => {
            const key = e.target.value;
            const cls = myClassesMap.get(key);
            const subInput = modal.querySelector('#thmFormSubject');
            if (cls && cls.subject && !subInput.value) {
                subInput.value = cls.subject;
            }
        });

        // Form Submit
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = modal.querySelector('#thmModalSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const editId = modal.querySelector('#thmEditId').value;
                const classKey = modal.querySelector('#thmFormClass').value;
                const selectedCls = myClassesMap.get(classKey) || {};

                const title = modal.querySelector('#thmFormTitle').value.trim();
                const subject = modal.querySelector('#thmFormSubject').value.trim();
                const description = modal.querySelector('#thmFormDesc').value.trim();
                const dueDate = modal.querySelector('#thmFormDueDate').value;
                const dueTime = modal.querySelector('#thmFormDueTime').value || '23:59';
                const note = modal.querySelector('#thmFormNote').value.trim();

                const homeworkId = editId || db.ref(`schoolHomework/${schoolId}`).push().key;

                const payload = {
                    id: homeworkId,
                    schoolId: schoolId,
                    teacherId: currentTeacher.uid,
                    teacherName: currentTeacher.name || currentTeacher.displayName || 'Subject Teacher',
                    teacherEmail: currentTeacher.email || '',
                    classId: selectedCls.classId || '',
                    className: selectedCls.className || 'Class',
                    section: selectedCls.section || 'A',
                    normSection: normSec(selectedCls.section || 'A'),
                    subject: subject,
                    title: title,
                    description: description,
                    dueDate: dueDate,
                    dueTime: dueTime,
                    note: note,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };

                if (!editId) {
                    payload.createdAt = firebase.database.ServerValue.TIMESTAMP;
                }

                // Save to canonical schoolHomework node
                await db.ref(`schoolHomework/${schoolId}/${homeworkId}`).update(payload);

                // Index by class
                const indexKey = `${selectedCls.classId || selectedCls.className}_${normSec(selectedCls.section || 'A')}`;
                await db.ref(`schoolClassHomework/${schoolId}/${safeKey(indexKey)}/${homeworkId}`).set(true);

                closeModal();
                if (window.showToast) {
                    window.showToast(editId ? 'Homework updated successfully!' : 'Homework published to student portal!', 'success');
                } else {
                    alert(editId ? 'Homework updated!' : 'Homework published successfully!');
                }
            } catch (err) {
                console.error('Failed to save homework:', err);
                alert('Error: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Homework';
            }
        });

        // Search & Filter listeners
        panel.querySelector('#thmFilterClass')?.addEventListener('change', renderCards);
        panel.querySelector('#thmFilterSubject')?.addEventListener('change', renderCards);
        panel.querySelector('#thmSearchInput')?.addEventListener('input', renderCards);

        panel.querySelectorAll('.thm-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.thm-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeStatusFilter = btn.getAttribute('data-status');
                renderCards();
            });
        });

        // ==========================================
        // DEFAULTERS MODAL LOGIC & BACKGROUND SYNC
        // ==========================================
        let activeDefaultersHw = null;
        let activeClassStudents = [];
        let selectedDefaultersMap = {};

        const defModal = document.getElementById('thmDefaultersModal');
        const defCloseBtn = defModal?.querySelector('#thmDefModalCloseBtn');
        const defCancelBtn = defModal?.querySelector('#thmDefCancelBtn');
        const defSubmitBtn = defModal?.querySelector('#thmDefSubmitBtn');
        const defSearchInput = defModal?.querySelector('#thmDefSearchInput');
        const defSelectAllBtn = defModal?.querySelector('#thmDefSelectAllBtn');
        const defClearAllBtn = defModal?.querySelector('#thmDefClearAllBtn');

        function closeDefaultersModal() {
            if (defModal) defModal.classList.remove('active');
            activeDefaultersHw = null;
            activeClassStudents = [];
            selectedDefaultersMap = {};
        }

        defCloseBtn?.addEventListener('click', closeDefaultersModal);
        defCancelBtn?.addEventListener('click', closeDefaultersModal);
        defModal?.addEventListener('click', (e) => {
            if (e.target === defModal) closeDefaultersModal();
        });

        defSelectAllBtn?.addEventListener('click', () => {
            activeClassStudents.forEach(st => {
                selectedDefaultersMap[st.id] = true;
            });
            renderDefaultersList();
        });

        defClearAllBtn?.addEventListener('click', () => {
            selectedDefaultersMap = {};
            renderDefaultersList();
        });

        defSearchInput?.addEventListener('input', () => {
            renderDefaultersList();
        });

        defSubmitBtn?.addEventListener('click', saveDefaulters);

        function openDefaultersModal(item) {
            activeDefaultersHw = item;
            selectedDefaultersMap = { ...(item.defaulters || {}) };

            if (!defModal) return;

            defModal.querySelector('#thmDefModalTitle').innerHTML = `<i class="fas fa-user-check"></i> Mark Defaulters: ${escapeHtml(item.title)}`;
            defModal.querySelector('#thmDefModalSubtitle').textContent = `Target: ${item.className || 'Class'} • Section ${item.section || 'All'} • Due: ${formatDisplayDate(item.dueDate, item.dueTime)}`;

            if (defSearchInput) defSearchInput.value = '';

            const listEl = defModal.querySelector('#thmDefStudentsList');
            listEl.innerHTML = `
                <div style="text-align: center; padding: 28px 16px; color: #64748b;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: #166534;"></i>
                    <p style="margin-top: 10px; font-size: 0.85rem;">Loading students for ${escapeHtml(item.className || 'Class')} - Sec ${escapeHtml(item.section || 'All')}...</p>
                </div>
            `;

            defModal.classList.add('active');

            loadStudentsForHomework(item).then(students => {
                activeClassStudents = students;
                renderDefaultersList();
            }).catch(err => {
                console.error('Error loading students for defaulters:', err);
                listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#dc2626;"><i class="fas fa-exclamation-circle"></i> Error loading students: ${escapeHtml(err.message)}</div>`;
            });
        }

        async function loadStudentsForHomework(hw) {
            if (!schoolId) return [];
            let students = [];

            const snap = await db.ref(`schoolUsers/${schoolId}`).once('value');
            if (snap.exists()) {
                snap.forEach(child => {
                    const st = child.val() || {};
                    st.id = child.key;
                    if (st.role && st.role !== 'student') return;
                    if (isStudentInClassSection(st, hw)) {
                        students.push(st);
                    }
                });
            }

            if (students.length === 0) {
                const uSnap = await db.ref('users').orderByChild('schoolId').equalTo(schoolId).once('value');
                if (uSnap.exists()) {
                    uSnap.forEach(child => {
                        const st = child.val() || {};
                        st.id = child.key;
                        if (st.role && st.role !== 'student') return;
                        if (isStudentInClassSection(st, hw)) {
                            students.push(st);
                        }
                    });
                }
            }

            students.sort((a, b) => {
                const rollA = parseInt(a.classRoll || a.univRoll, 10);
                const rollB = parseInt(b.classRoll || b.univRoll, 10);
                if (!isNaN(rollA) && !isNaN(rollB)) return rollA - rollB;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });

            return students;
        }

        function isStudentInClassSection(st, hw) {
            if (!st || !hw) return false;
            
            const hwSec = normSec(hw.section || hw.normSection);
            const stSec = normSec(st.section || st.classSection || st.assignedSection);
            if (hwSec && stSec && hwSec !== 'ALL' && hwSec !== stSec) {
                return false;
            }

            const stClassId = String(st.classId || st.enrolledClassId || st.courseId || '').toLowerCase().trim();
            const hwClassId = String(hw.classId || hw.courseId || '').toLowerCase().trim();
            if (stClassId && hwClassId && stClassId === hwClassId) return true;

            const stNames = [st.className, st.courseName, st.course, st.class].filter(Boolean).map(x => String(x).toLowerCase().trim());
            const hwName = String(hw.className || hw.courseName || '').toLowerCase().trim();

            if (!hwName && !hwClassId) return true;
            if (stNames.length === 0 && !stClassId) return true;

            if (hwName && stNames.length > 0) {
                const directMatch = stNames.some(name => name === hwName || name.includes(hwName) || hwName.includes(name));
                if (directMatch) return true;

                const hwNum = (hwName.match(/\d+/) || [])[0];
                if (hwNum) {
                    const numMatch = stNames.some(name => (name.match(/\d+/) || [])[0] === hwNum);
                    if (numMatch) return true;
                }
            }

            if (hwSec && stSec && hwSec === stSec) return true;
            return false;
        }

        function renderDefaultersList() {
            if (!defModal) return;
            const listEl = defModal.querySelector('#thmDefStudentsList');
            const searchVal = (defSearchInput?.value || '').trim().toLowerCase();

            const filteredStudents = activeClassStudents.filter(st => {
                if (!searchVal) return true;
                const name = String(st.name || st.displayName || '').toLowerCase();
                const roll = String(st.classRoll || st.univRoll || '').toLowerCase();
                return name.includes(searchVal) || roll.includes(searchVal);
            });

            if (filteredStudents.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 24px; color: #64748b;">
                        <i class="fas fa-users-slash" style="font-size: 1.6rem; color: #94a3b8; margin-bottom: 8px;"></i>
                        <p style="margin: 0; font-size: 0.85rem;">${activeClassStudents.length === 0 ? "No students found enrolled in this class & section." : "No students match your search filter."}</p>
                    </div>
                `;
                updateDefaultersCounter();
                return;
            }

            listEl.innerHTML = filteredStudents.map(st => {
                const isDef = !!selectedDefaultersMap[st.id];
                const rollDisplay = st.classRoll ? `Roll: ${escapeHtml(st.classRoll)}` : (st.univRoll ? `Univ: ${escapeHtml(st.univRoll)}` : '');
                const avatar = st.profilePhoto || st.photoURL || '';

                return `
                    <div class="thm-def-student-item ${isDef ? 'defaulter' : ''}" data-uid="${st.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:${isDef ? '#fef2f2' : '#ffffff'}; border:1px solid ${isDef ? '#fecaca' : '#e2e8f0'}; border-radius:10px; cursor:pointer; transition:all 0.15s ease;">
                        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                            <div style="width:34px; height:34px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                ${avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user" style="color:#64748b; font-size:0.85rem;"></i>`}
                            </div>
                            <div style="min-width:0;">
                                <div style="font-weight:700; font-size:0.85rem; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${escapeHtml(st.name || st.displayName || 'Student')}
                                </div>
                                <div style="font-size:0.75rem; color:#64748b;">
                                    ${rollDisplay ? `<span>${rollDisplay}</span> • ` : ''}<span>Sec ${escapeHtml(st.section || 'A')}</span>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span class="thm-def-status-pill" style="font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:999px; ${isDef ? 'background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;' : 'background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;'}">
                                ${isDef ? '<i class="fas fa-xmark"></i> Defaulter' : '<i class="fas fa-check"></i> Completed'}
                            </span>
                            <input type="checkbox" class="thm-def-checkbox" data-uid="${st.id}" ${isDef ? 'checked' : ''} style="width:18px; height:18px; accent-color:#dc2626; cursor:pointer;">
                        </div>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.thm-def-student-item').forEach(itemEl => {
                itemEl.addEventListener('click', (e) => {
                    const uid = itemEl.getAttribute('data-uid');
                    const chk = itemEl.querySelector('.thm-def-checkbox');
                    if (e.target !== chk) {
                        chk.checked = !chk.checked;
                    }
                    if (chk.checked) {
                        selectedDefaultersMap[uid] = true;
                    } else {
                        delete selectedDefaultersMap[uid];
                    }
                    updateDefaultersRowStyle(itemEl, chk.checked);
                    updateDefaultersCounter();
                });
            });

            updateDefaultersCounter();
        }

        function updateDefaultersRowStyle(itemEl, isDef) {
            itemEl.style.background = isDef ? '#fef2f2' : '#ffffff';
            itemEl.style.borderColor = isDef ? '#fecaca' : '#e2e8f0';
            const pill = itemEl.querySelector('.thm-def-status-pill');
            if (pill) {
                pill.style.background = isDef ? '#fee2e2' : '#f1f5f9';
                pill.style.color = isDef ? '#b91c1c' : '#64748b';
                pill.style.borderColor = isDef ? '#fca5a5' : '#e2e8f0';
                pill.innerHTML = isDef ? '<i class="fas fa-xmark"></i> Defaulter' : '<i class="fas fa-check"></i> Completed';
            }
        }

        function updateDefaultersCounter() {
            if (!defModal) return;
            const count = Object.keys(selectedDefaultersMap).length;
            const total = activeClassStudents.length;
            const counterEl = defModal.querySelector('#thmDefSummaryCount');
            if (counterEl) {
                counterEl.innerHTML = `<span style="color:#dc2626;">${count} Defaulter${count === 1 ? '' : 's'}</span> out of ${total} total students`;
            }
        }

        async function saveDefaulters() {
            if (!activeDefaultersHw || !schoolId) return;
            defSubmitBtn.disabled = true;
            defSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const hwId = activeDefaultersHw.id;
                const defaultersMap = { ...selectedDefaultersMap };
                const count = Object.keys(defaultersMap).length;

                // 1. Update homework document in RTDB
                await db.ref(`schoolHomework/${schoolId}/${hwId}`).update({
                    defaulters: defaultersMap,
                    defaultersReviewed: true,
                    defaultersCount: count,
                    defaultersUpdatedAt: firebase.database.ServerValue.TIMESTAMP
                });

                // 2. Multi-path atomic background update for students:
                // Only defaulters have a reference! Non-defaulters have the reference removed.
                const updates = {};
                activeClassStudents.forEach(st => {
                    if (defaultersMap[st.id]) {
                        updates[`studentHomeworkDefaulters/${st.id}/${hwId}`] = {
                            homeworkId: hwId,
                            title: activeDefaultersHw.title,
                            subject: activeDefaultersHw.subject || 'General',
                            dueDate: activeDefaultersHw.dueDate || '',
                            dueTime: activeDefaultersHw.dueTime || '',
                            teacherName: activeDefaultersHw.teacherName || 'Subject Teacher',
                            markedAt: firebase.database.ServerValue.TIMESTAMP
                        };
                    } else {
                        updates[`studentHomeworkDefaulters/${st.id}/${hwId}`] = null;
                    }
                });

                await db.ref().update(updates);

                closeDefaultersModal();
                if (window.showToast) {
                    window.showToast(`Defaulters submitted: ${count} student(s) marked incomplete.`, 'success');
                } else {
                    alert(`Defaulters updated successfully! ${count} student(s) marked as incomplete.`);
                }
            } catch (err) {
                console.error('Error saving defaulters:', err);
                alert('Failed to save defaulters: ' + err.message);
            } finally {
                defSubmitBtn.disabled = false;
                defSubmitBtn.innerHTML = '<i class="fas fa-save"></i> Save Defaulters';
            }
        }

        // Auth state handler
        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                nav.style.display = 'none';
                return;
            }
            try {
                const snap = await db.ref(`users/${user.uid}`).once('value');
                const profile = snap.val() || {};
                if (profile.role !== 'teacher') {
                    nav.style.display = 'none';
                    return;
                }
                currentTeacher = { uid: user.uid, ...profile };
                nav.style.display = 'flex';

                await loadTeacherClasses(user, profile);
                listenToHomework();
            } catch (e) {
                console.error('Teacher homework initialization error:', e);
            }
        });
    }

    // Auto boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTeacherHomework);
    } else {
        initializeTeacherHomework();
    }
})();
