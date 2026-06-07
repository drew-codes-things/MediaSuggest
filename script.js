const CONFIG = {
    WORKER_URL:     'https://api.drew-gnr.xyz/tmdb',
    JIKAN_BASE:     'https://api.jikan.moe/v4',
    JIKAN_DELAY_MS: 400,
    MAX_SKIP:       10,
};

const GENRES = {
    movie: ['action','adventure','animation','comedy','crime','documentary','drama','fantasy','history','horror','music','mystery','romance','sci-fi','thriller','western'],
    tv:    ['action','animation','comedy','crime','documentary','drama','fantasy','history','mystery','sci-fi','thriller'],
    anime: [
        { name: 'action',        id: 1  },
        { name: 'adventure',     id: 2  },
        { name: 'comedy',        id: 4  },
        { name: 'drama',         id: 8  },
        { name: 'fantasy',       id: 10 },
        { name: 'horror',        id: 14 },
        { name: 'mystery',       id: 7  },
        { name: 'romance',       id: 22 },
        { name: 'sci-fi',        id: 24 },
        { name: 'thriller',      id: 41 },
        { name: 'sports',        id: 30 },
        { name: 'music',         id: 19 },
        { name: 'mecha',         id: 18 },
        { name: 'slice of life', id: 36 },
    ]
};

let selectedType  = 'movie';
let selectedGenre = null;
let loading       = false;
let lastResult    = null;
let seenTitles    = [];
let watchlist     = [];

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function excludedTitles() {
    return new Set([...seenTitles, ...watchlist.map(w => w.title)]);
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
    selectedGenre = null;
    const list = type === 'anime'
        ? GENRES.anime.map(g => g.name)
        : GENRES[type];
    list.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'genre-btn';
        btn.textContent = g.charAt(0).toUpperCase() + g.slice(1);
        btn.dataset.genre = g;
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                selectedGenre = null;
            } else {
                document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedGenre = g;
            }
        });
        genreGrid.appendChild(btn);
    });
}

function setLoading(on) {
    loading = on;
    btnRecommend.disabled = on;
    btnText.innerHTML = on
        ? '<span class="spinner"></span> Finding something...'
        : 'Recommend me something';
}

function showResult({ title, year, score, genres, desc, poster, type }) {
    lastResult = { title, year, score, genres, desc, poster, type };

    seenTitles.push(title);
    if (seenTitles.length > CONFIG.MAX_SKIP) seenTitles.shift();

    const typeLabel   = type === 'tv' ? 'TV Show' : type.charAt(0).toUpperCase() + type.slice(1);
    const genreBadges = (genres || []).slice(0, 4).map(g =>
        `<span class="badge badge-genre">${g}</span>`).join('');
    const scoreBadge  = score ? `<span class="badge badge-score">★ ${score}</span>` : '';
    const yearBadge   = year  ? `<span class="badge badge-year">${year}</span>`  : '';

    resultInner.innerHTML = `
        <img class="result-poster${poster ? '' : ' hidden'}" src="${poster || ''}" alt="${title} poster" loading="lazy" onerror="this.classList.add('hidden')">
        <h3 class="result-title">${title}</h3>
        <div class="result-meta">
            <span class="badge badge-type">${typeLabel}</span>
            ${yearBadge}${scoreBadge}${genreBadges}
        </div>
        <p class="result-desc">${desc || 'No description available.'}</p>
    `;

    if (!stage.classList.contains('has-result')) {
        stage.classList.add('has-result');
    } else {
        resultCard.style.animation = 'none';
        void resultCard.offsetWidth;
        resultCard.style.animation = '';
    }
}

function showError(msg) {
    resultInner.innerHTML = `<p class="error-msg">${msg}</p>`;
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
        const type = w.type === 'tv' ? 'TV Show' : w.type.charAt(0).toUpperCase() + w.type.slice(1);
        const meta = [type, w.year, w.score ? `${w.score}/10` : null].filter(Boolean).join(' · ');
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
        const typeLabel = item.type === 'tv' ? 'TV Show' : item.type.charAt(0).toUpperCase() + item.type.slice(1);
        const meta = [typeLabel, item.year, item.score ? '★ ' + item.score : null].filter(Boolean).join(' · ');
        li.innerHTML = `
            <div class="watchlist-info">
                <span class="watchlist-title">${item.title}</span>
                <span class="watchlist-meta">${meta}</span>
            </div>
            <button class="btn-remove" aria-label="Remove ${item.title}">
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

async function fetchAnime() {
    let maxPages = 5;
    if (selectedGenre) {
        const genreObj = GENRES.anime.find(g => g.name === selectedGenre);
        const gid = genreObj ? genreObj.id : 1;
        try {
            const infoRes = await fetch(
                `${CONFIG.JIKAN_BASE}/anime?genres=${gid}&order_by=score&sort=desc&min_score=7&limit=1`
            );
            if (infoRes.ok) {
                const info = await infoRes.json();
                maxPages = Math.min(info.pagination?.last_visible_page ?? 5, 20);
            }
        } catch (_) {}
        await sleep(CONFIG.JIKAN_DELAY_MS);
    }

    const page = Math.floor(Math.random() * maxPages) + 1;
    let url;
    if (selectedGenre) {
        const genreObj = GENRES.anime.find(g => g.name === selectedGenre);
        const gid = genreObj ? genreObj.id : 1;
        url = `${CONFIG.JIKAN_BASE}/anime?genres=${gid}&order_by=score&sort=desc&min_score=7&page=${page}&limit=25`;
    } else {
        url = `${CONFIG.JIKAN_BASE}/top/anime?page=${page}&limit=25&type=tv`;
    }

    const res = await fetch(url);
    if (res.status === 429) throw new Error('Anime API rate limit hit - slow down a bit and try again.');
    if (!res.ok) throw new Error('Could not reach anime database.');
    const json = await res.json();

    let items = json.data;
    if (!items || items.length === 0) throw new Error('No anime found for that genre.');

    const excluded = excludedTitles();
    const fresh = items.filter(a => !excluded.has(a.title_english || a.title));
    const pool  = fresh.length > 0 ? fresh : items;
    const pick  = pool[Math.floor(Math.random() * pool.length)];

    return {
        type:   'anime',
        title:  pick.title_english || pick.title,
        year:   pick.aired?.prop?.from?.year ?? null,
        score:  pick.score ? pick.score.toFixed(1) : null,
        genres: (pick.genres || []).map(g => g.name),
        desc:   pick.synopsis ? pick.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : '',
        poster: pick.images?.jpg?.large_image_url ?? null,
    };
}

async function fetchFromWorker() {
    const params = new URLSearchParams({ type: selectedType });
    if (selectedGenre) params.set('genre', selectedGenre);
    const excluded = [...excludedTitles()];
    if (excluded.length > 0) params.set('exclude', excluded.join(','));

    const res  = await fetch(`${CONFIG.WORKER_URL}?${params}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Worker returned an error.');
    return json;
}

async function recommend() {
    if (loading) return;
    setLoading(true);
    try {
        const result = selectedType === 'anime'
            ? await fetchAnime()
            : await fetchFromWorker();
        showResult(result);
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
});
