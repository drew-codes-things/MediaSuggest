(function (global) {
    'use strict';

    var toastTimer = null;

    function toast(message, kind) {
        var el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.className = 'toast' + (kind === 'ok' ? ' ok' : '');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
    }

    function confirmDialog(options) {
        var opts = options || {};
        return new Promise(function (resolve) {
            var dialog = document.createElement('dialog');
            if (typeof dialog.showModal !== 'function') {
                resolve(window.confirm(opts.text || opts.title || 'Are you sure?'));
                return;
            }
            dialog.className = 'dialog';
            var heading = document.createElement('h2');
            heading.textContent = opts.title || 'Are you sure?';
            var body = document.createElement('p');
            body.textContent = opts.text || '';
            var row = document.createElement('div');
            row.className = 'btn-row';
            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'btn-quiet';
            cancel.textContent = opts.cancel || 'Cancel';
            var ok = document.createElement('button');
            ok.type = 'button';
            ok.className = opts.danger ? 'btn-danger' : 'btn-go';
            ok.textContent = opts.ok || 'Confirm';
            row.append(cancel, ok);
            dialog.append(heading, body, row);
            document.body.appendChild(dialog);

            var settled = false;
            function finish(value) {
                if (settled) return;
                settled = true;
                if (dialog.open) dialog.close();
                dialog.remove();
                resolve(value);
            }
            cancel.addEventListener('click', function () { finish(false); });
            ok.addEventListener('click', function () { finish(true); });
            dialog.addEventListener('cancel', function (event) { event.preventDefault(); finish(false); });
            dialog.addEventListener('click', function (event) { if (event.target === dialog) finish(false); });
            dialog.showModal();
            (opts.danger ? cancel : ok).focus();
        });
    }

    function storageGet(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (error) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function storageRemove(key) {
        try { localStorage.removeItem(key); } catch (error) { return; }
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
            area.remove();
            if (ok) resolve(); else reject(new Error('copy failed'));
        });
    }

    function isTyping(event) {
        var target = event.target;
        if (!target || !target.tagName) return false;
        var tag = target.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    }

    global.ui = {
        toast: toast,
        confirm: confirmDialog,
        get: storageGet,
        set: storageSet,
        remove: storageRemove,
        copy: copyText,
        isTyping: isTyping
    };
})(window);
