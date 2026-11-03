const CONFIG = {
    WORKER_URL:       'https://api.drew-gnr.xyz/tmdb',
    MAX_SKIP:         10,
    MAX_EXCLUDE_SENT: 150,
    MAX_FETCH_TRIES:  4,
};

const GENRES = {
    movie: ['action','adventure','animation','comedy','crime','documentary','drama','fantasy','history','horror','music','mystery','romance','sci-fi','thriller','western'],
    tv:    ['action','animation','comedy','crime','documentary','drama','fantasy','history','mystery','sci-fi','thriller'],
    anime: ['action','adventure','comedy','crime','drama','family','fantasy','mystery','sci-fi'],
};

let selectedType   = 'movie';
let selectedGenres = new Set();
let loading        = false;
let lastResult    = null;
let seenTitles    = [];
let watchlist     = [];
let hiddenTitles  = [];

const stage         = document.querySelector('.stage');
const genreGrid     = document.getElementById('genre-grid');
const btnRecommend  = document.getElementById('btn-recommend');
const btnText       = document.getElementById('btn-text');
const resultCard    = document.getElementById('result-card');
const resultInner   = document.getElementById('result-inner');
const btnAgain      = document.getElementById('btn-again');
const watchlistCard = document.getElementById('watchlist-card');
const watchlistEl   = document.getElementById('watchlist');
const toastEl       = document.getElementById('toast');

const WATCHLIST_KEY = 'mediarec_watchlist';
const HIDDEN_KEY    = 'mediarec_hidden';
const HIDDEN_REASONS = { watched: 'Seen it', dismissed: 'Not interested' };
const hiddenCard    = document.getElementById('hidden-card');
const hiddenCount   = document.getElementById('hidden-count');
const hiddenListEl  = document.getElementById('hidden-list');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

function safePosterUrl(url) {
    return typeof url === 'string' && url.startsWith('https://') ? url : '';
}

function typeLabelFor(type) {
    const name = String(type || 'movie');
    return name === 'tv' ? 'TV Show' : name.charAt(0).toUpperCase() + name.slice(1);
}

function saveWatchlist() {
    try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist)); } catch (_) {}
}

function loadWatchlist() {
    try {
        const raw = localStorage.getItem(WATCHLIST_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data)) watchlist = data;
        }
    } catch (_) {}
}

function saveHidden() {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenTitles)); } catch (_) {}
}

function loadHidden() {
    try {
        const data = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
        if (Array.isArray(data)) hiddenTitles = data.filter(h => h && h.title && HIDDEN_REASONS[h.reason]);
    } catch (_) {}
}

function isHidden(item) {
    return hiddenTitles.some(h => h.title === item.title && h.type === (item.type || 'movie'));
}

function hideCurrent(reason) {
    if (!lastResult) return;
    if (!isHidden(lastResult)) {
        hiddenTitles.unshift({ title: lastResult.title, type: lastResult.type || 'movie', year: lastResult.year || null, reason, at: Date.now() });
        saveHidden();
        renderHidden();
    }
    showToast(`${HIDDEN_REASONS[reason]}: we won't suggest ${lastResult.title} again.`, true);
    recommend();
}

function unhide(index) {
    hiddenTitles.splice(index, 1);
    saveHidden();
    renderHidden();
}

function renderHidden() {
    hiddenListEl.innerHTML = '';
    hiddenCount.textContent = String(hiddenTitles.length);
    hiddenCard.hidden = hiddenTitles.length === 0;
    hiddenTitles.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'watchlist-item';
        const meta = [typeLabelFor(item.type), item.year, HIDDEN_REASONS[item.reason]].filter(Boolean).join(' · ');
        li.innerHTML = `
            <div class="watchlist-info">
                <span class="watchlist-title">${escapeHtml(item.title)}</span>
                <span class="watchlist-meta">${escapeHtml(meta)}</span>
            </div>
            <button class="btn-remove btn-unhide" aria-label="Suggest ${escapeHtml(item.title)} again">Undo</button>
        `;
        li.querySelector('.btn-unhide').addEventListener('click', () => unhide(idx));
        hiddenListEl.appendChild(li);
    });
}

function excludedTitles() {
    const recentHidden = hiddenTitles
        .filter(h => h.type === selectedType)
        .slice(0, CONFIG.MAX_EXCLUDE_SENT)
        .map(h => h.title);
    return new Set([...seenTitles, ...watchlist.map(w => w.title), ...recentHidden]);
}

function showToast(msg, success = false) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (success ? ' success' : '');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function buildGenreButtons(type) {
    genreGrid.innerHTML = '';
    selectedGenres.clear();
    GENRES[type].forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'genre-btn';
        btn.textContent = g.charAt(0).toUpperCase() + g.slice(1);
        btn.dataset.genre = g;
        btn.addEventListener('click', () => {
            if (selectedGenres.has(g)) {
                selectedGenres.delete(g);
                btn.classList.remove('active');
            } else {
                selectedGenres.add(g);
                btn.classList.add('active');
            }
        });
        genreGrid.appendChild(btn);
    });
}

function setActionsVisible(visible) {
    resultCard.querySelectorAll('.result-actions').forEach(row => {
        row.style.visibility = visible ? '' : 'hidden';
    });
}

function showSkeleton() {
    if (!stage.classList.contains('has-result')) stage.classList.add('has-result');
    resultInner.innerHTML = `
        <div class="skel skel-poster"></div>
        <div class="skel skel-title"></div>
        <div class="skel skel-meta"></div>
        <div class="skel skel-line"></div>
        <div class="skel skel-line skel-short"></div>
        <div class="skel skel-line skel-shorter"></div>
    `;
    setActionsVisible(false);
}

function setLoading(on) {
    loading = on;
    btnRecommend.disabled = on;
    btnText.textContent = on ? 'Finding something...' : 'Recommend me something';
    if (on) showSkeleton();
}

function showResult({ title, year, score, genres, desc, poster, type }) {
    lastResult = { title, year, score, genres, desc, poster, type };

    seenTitles.push(title);
    if (seenTitles.length > CONFIG.MAX_SKIP) seenTitles.shift();

    const posterUrl   = safePosterUrl(poster);
    const genreBadges = (Array.isArray(genres) ? genres : []).slice(0, 4).map(g =>
        `<span class="badge badge-genre">${escapeHtml(g)}</span>`).join('');
    const scoreBadge  = score ? `<span class="badge badge-score">★ ${escapeHtml(score)}</span>` : '';
    const yearBadge   = year  ? `<span class="badge badge-year">${escapeHtml(year)}</span>`  : '';

    resultInner.innerHTML = `
        <img class="result-poster${posterUrl ? '' : ' hidden'}" src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)} poster" loading="lazy">
        <h3 class="result-title">${escapeHtml(title)}</h3>
        <div class="result-meta">
            <span class="badge badge-type">${escapeHtml(typeLabelFor(type))}</span>
            ${yearBadge}${scoreBadge}${genreBadges}
        </div>
        <p class="result-desc">${escapeHtml(desc || 'No description available.')}</p>
    `;
    const posterImg = resultInner.querySelector('.result-poster');
    posterImg.addEventListener('error', () => posterImg.classList.add('hidden'));

    setActionsVisible(true);
    if (!stage.classList.contains('has-result')) {
        stage.classList.add('has-result');
    } else {
        resultCard.style.animation = 'none';
        void resultCard.offsetWidth;
        resultCard.style.animation = '';
    }
}

function showError(msg) {
    resultInner.innerHTML = `<p class="error-msg">${escapeHtml(msg)}</p>`;
    setActionsVisible(true);
    stage.classList.add('has-result');
}

function addToWatchlist() {
    if (!lastResult) return;
    if (watchlist.some(w => w.title === lastResult.title && w.type === lastResult.type)) {
        showToast('Already in your watchlist.');
        return;
    }
    watchlist.push(lastResult);
    saveWatchlist();
    renderWatchlist();
    showToast('Added to watchlist!', true);
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportWatchlist() {
    if (!watchlist.length) { showToast('Watchlist is empty.'); return; }
    const lines = watchlist.map(w => {
        const meta = [typeLabelFor(w.type), w.year, w.score ? `${w.score}/10` : null].filter(Boolean).join(' · ');
        return `${w.title} (${meta})`;
    });
    const header = `My Watchlist - ${new Date().toLocaleDateString()}\n${'='.repeat(30)}\n`;
    downloadFile(header + lines.join('\n') + '\n', 'watchlist.txt', 'text/plain;charset=utf-8');
    showToast('Watchlist saved!', true);
}

function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportWatchlistCSV() {
    if (!watchlist.length) { showToast('Watchlist is empty.'); return; }
    const cols = ['title', 'type', 'year', 'score', 'genres'];
    const rows = [cols.join(',')];
    watchlist.forEach(w => {
        rows.push([
            csvCell(w.title), csvCell(w.type), csvCell(w.year),
            csvCell(w.score), csvCell((w.genres || []).join('; '))
        ].join(','));
    });
    downloadFile(rows.join('\n') + '\n', 'watchlist.csv', 'text/csv;charset=utf-8');
    showToast('Watchlist saved!', true);
}

function exportWatchlistJSON() {
    if (!watchlist.length) { showToast('Watchlist is empty.'); return; }
    downloadFile(JSON.stringify(watchlist, null, 2), 'watchlist.json', 'application/json');
    showToast('Watchlist saved!', true);
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
        const cells = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQ) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') inQ = false;
                else cur += c;
            } else if (c === '"') inQ = true;
            else if (c === ',') { cells.push(cur); cur = ''; }
            else cur += c;
        }
        cells.push(cur);
        const obj = {};
        header.forEach((h, i) => obj[h] = cells[i] ?? '');
        return {
            title: obj.title, type: obj.type || 'movie', year: obj.year || null,
            score: obj.score || null, genres: obj.genres ? obj.genres.split(/;\s*/).filter(Boolean) : []
        };
    }).filter(o => o.title);
}

function mergeImported(items) {
    let added = 0;
    items.forEach(it => {
        if (!it || !it.title) return;
        if (!it.type) it.type = 'movie';
        if (watchlist.some(w => w.title === it.title && w.type === it.type)) return;
        watchlist.push(it);
        added++;
    });
    if (added) { saveWatchlist(); renderWatchlist(); }
    showToast(added ? `Imported ${added} title(s).` : 'Nothing new to import.', added > 0);
}

async function importWatchlist(file) {
    try {
        const text = await file.text();
        const name = file.name.toLowerCase();
        if (name.endsWith('.json')) {
            const data = JSON.parse(text);
            mergeImported(Array.isArray(data) ? data : []);
        } else if (name.endsWith('.csv')) {
            mergeImported(parseCSV(text));
        } else {
            const items = text.split(/\r?\n/).map(l => l.trim())
                .filter(l => l && !/^=+$/.test(l) && !/^My Watchlist/i.test(l))
                .map(l => {
                    const m = l.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
                    const title = m ? m[1].trim() : l;
                    const meta = m ? m[2] : '';
                    const typeRaw = (meta.split('·')[0] || '').trim().toLowerCase();
                    const type = typeRaw.includes('tv') ? 'tv' : typeRaw.includes('anime') ? 'anime' : 'movie';
                    return { title, type, year: null, score: null, genres: [] };
                });
            mergeImported(items);
        }
    } catch (_) {
        showToast('Could not read that file.');
    }
}

function shuffleFromWatchlist() {
    if (!watchlist.length) { showToast('Watchlist is empty.'); return; }
    const pick = watchlist[Math.floor(Math.random() * watchlist.length)];
    showResult(pick);
}

function sharePick() {
    if (!lastResult) { showToast('Get a recommendation first.'); return; }
    try {
        const payload = btoa(encodeURIComponent(JSON.stringify(lastResult)));
        const url = `${location.origin}${location.pathname}?pick=${payload}`;
        navigator.clipboard.writeText(url)
            .then(() => showToast('Share link copied!', true))
            .catch(() => showToast('Copy failed - link: ' + url));
    } catch (_) {
        showToast('Could not build a share link.');
    }
}

function loadSharedPick() {
    const param = new URLSearchParams(location.search).get('pick');
    if (!param) return;
    try {
        const data = JSON.parse(decodeURIComponent(atob(param)));
        if (data && data.title) showResult(data);
    } catch (_) {}
}

function setupConnectivity() {
    let badge = document.getElementById('offlineBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'offlineBadge';
        badge.className = 'offline-badge';
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-live', 'polite');
        badge.textContent = 'Offline - your watchlist is saved locally';
        document.body.appendChild(badge);
    }
    const update = () => { badge.style.display = navigator.onLine ? 'none' : 'block'; };
    window.addEventListener('online', () => { update(); showToast('Back online.', true); });
    window.addEventListener('offline', () => { update(); showToast('You are offline - watchlist is saved locally.'); });
    update();
}

function renderWatchlist() {
    watchlistEl.innerHTML = '';
    if (watchlist.length === 0) {
        watchlistCard.style.display = 'none';
        return;
    }
    watchlistCard.style.display = 'block';
    watchlist.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'watchlist-item';
        const meta = [typeLabelFor(item.type), item.year, item.score ? '★ ' + item.score : null].filter(Boolean).join(' · ');
        li.innerHTML = `
            <div class="watchlist-info">
                <span class="watchlist-title">${escapeHtml(item.title)}</span>
                <span class="watchlist-meta">${escapeHtml(meta)}</span>
            </div>
            <button class="btn-remove" aria-label="Remove ${escapeHtml(item.title)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        li.querySelector('.btn-remove').addEventListener('click', () => {
            watchlist.splice(idx, 1);
            saveWatchlist();
            renderWatchlist();
        });
        watchlistEl.appendChild(li);
    });
}

async function fetchFromWorker() {
    const params = new URLSearchParams({ type: selectedType });
    if (selectedGenres.size) params.set('genres', [...selectedGenres].join(','));
    const excluded = [...excludedTitles()];
    if (excluded.length > 0) params.set('exclude', excluded.join(','));

    const res  = await fetch(`${CONFIG.WORKER_URL}?${params}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Worker returned an error.');
    return json;
}

async function fetchUnhidden() {
    for (let attempt = 0; attempt < CONFIG.MAX_FETCH_TRIES; attempt++) {
        const result = await fetchFromWorker();
        if (!isHidden(result)) return result;
    }
    throw new Error("Everything we found is marked as seen or not interested. Try other genres, or undo some in the list below.");
}

async function recommend() {
    if (loading) return;
    setLoading(true);
    try {
        showResult(await fetchUnhidden());
    } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
    } finally {
        setLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    buildGenreButtons(selectedType);
    loadWatchlist();
    renderWatchlist();
    loadHidden();
    renderHidden();
    loadSharedPick();
    setupConnectivity();

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            selectedType = btn.dataset.type;
            buildGenreButtons(selectedType);
        });
    });

    btnRecommend.addEventListener('click', recommend);
    btnAgain.addEventListener('click', recommend);
    document.getElementById('btn-watchlist').addEventListener('click', addToWatchlist);

    document.getElementById('btn-share').addEventListener('click', sharePick);
    document.getElementById('btn-seen').addEventListener('click', () => hideCurrent('watched'));
    document.getElementById('btn-dismiss').addEventListener('click', () => hideCurrent('dismissed'));
    document.getElementById('btn-clear-hidden').addEventListener('click', () => {
        hiddenTitles = [];
        saveHidden();
        renderHidden();
        showToast('Seen and dismissed list cleared.');
    });

    document.getElementById('btn-export-watchlist').addEventListener('click', exportWatchlist);
    document.getElementById('btn-export-csv').addEventListener('click', exportWatchlistCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportWatchlistJSON);
    document.getElementById('btn-shuffle-watchlist').addEventListener('click', shuffleFromWatchlist);

    const importInput = document.getElementById('import-input');
    document.getElementById('btn-import-watchlist').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', e => {
        if (e.target.files[0]) importWatchlist(e.target.files[0]);
        e.target.value = '';
    });

    document.getElementById('btn-clear-watchlist').addEventListener('click', () => {
        watchlist = [];
        saveWatchlist();
        renderWatchlist();
        showToast('Watchlist cleared.');
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) {
            e.preventDefault();
            recommend();
        }
    });
});
