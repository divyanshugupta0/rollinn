(() => {
    function ensureDialog() {
        let dialog = document.getElementById('teacher-student-photo-preview');
        if (dialog) return dialog;
        const style = document.createElement('style');
        style.textContent = `
            .tsp-overlay{position:fixed;inset:0;z-index:1600;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(12,20,32,.78);backdrop-filter:blur(6px)}
            .tsp-overlay.visible{display:flex}.tsp-dialog{position:relative;display:grid;grid-template-rows:minmax(0,1fr) auto;width:min(100%,720px);max-height:92vh;overflow:hidden;border:1px solid rgba(255,255,255,.25);border-radius:20px;background:#101827;box-shadow:0 30px 90px rgba(0,0,0,.4)}
            .tsp-image-wrap{display:grid;place-items:center;min-height:180px;padding:22px}.tsp-image{display:block;max-width:100%;max-height:calc(92vh - 140px);object-fit:contain;border-radius:12px;background:#fff}.tsp-caption{padding:15px 20px 18px;color:#fff;text-align:center}.tsp-caption strong{display:block;font-size:16px}.tsp-caption span{display:block;margin-top:4px;color:#c5cfdd;font-size:12px}.tsp-close{position:absolute;top:12px;right:12px;display:grid;place-items:center;width:40px;height:40px;border:1px solid rgba(255,255,255,.25);border-radius:50%;color:#fff;background:rgba(15,23,42,.72);font-size:20px;cursor:pointer}
            .sr-avatar,.tb-avatar{cursor:zoom-in}
            @media(max-width:600px){.tsp-overlay{align-items:center;padding:12px}.tsp-dialog{width:100%;max-height:90vh;border-radius:16px}.tsp-image-wrap{padding:12px}.tsp-image{max-height:calc(90vh - 115px)}.tsp-caption{padding:12px}}
        `;
        document.head.appendChild(style);
        document.body.insertAdjacentHTML('beforeend', `<div class="tsp-overlay" id="teacher-student-photo-preview" aria-hidden="true"><div class="tsp-dialog" role="dialog" aria-modal="true" aria-label="Student profile photo"><button class="tsp-close" type="button" aria-label="Close photo preview">&times;</button><div class="tsp-image-wrap"><img class="tsp-image" alt=""></div><div class="tsp-caption"><strong></strong><span></span></div></div></div>`);
        dialog = document.getElementById('teacher-student-photo-preview');
        const close = () => {
            dialog.classList.remove('visible');
            dialog.setAttribute('aria-hidden', 'true');
        };
        dialog.querySelector('.tsp-close').addEventListener('click', close);
        dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && dialog.classList.contains('visible')) close(); });
        return dialog;
    }

    window.TeacherStudentPhotoPreview = {
        open({ src, name = 'Student', details = '' } = {}) {
            if (!src) return;
            const dialog = ensureDialog();
            const image = dialog.querySelector('.tsp-image');
            image.alt = `${name} profile photo`;
            image.src = src;
            dialog.querySelector('.tsp-caption strong').textContent = name;
            dialog.querySelector('.tsp-caption span').textContent = details;
            dialog.classList.add('visible');
            dialog.setAttribute('aria-hidden', 'false');
            dialog.querySelector('.tsp-close').focus();
        }
    };
})();
