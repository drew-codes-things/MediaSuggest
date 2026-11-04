(function () {
    'use strict';

    var CONFIG = {
        workerUrl: 'https://api.drew-gnr.xyz/tmdb',
        jikanBase: 'https://api.jikan.moe/v4',
        jikanGapMs: 400,
        rememberSeen: 15,
        watchlistMax: 200,
        timeoutMs: 15000
    };
    var WATCHLIST_KEY = 'mediasuggest_watchlist';
    var PREFS_KEY = 'mediasuggest_prefs';

    var GENRES = {
        movie: ['action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance', 'sci-fi', 'thriller', 'western'],
        tv: ['action', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'fantasy', 'history', 'mystery', 'sci-fi', 'thriller'],
        anime: [
            { name: 'action', id: 1 }, { name: 'adventure', id: 2 }, { name: 'comedy', id: 4 },
            { name: 'drama', id: 8 }, { name: 'fantasy', id: 10 }, { name: 'horror', id: 14 },
            { name: 'mystery', id: 7 }, { name: 'romance', id: 22 }, { name: 'sci-fi', id: 24 },
            { name: 'thriller', id: 41 }, { name: 'sports', id: 30 }, { name: 'music', id: 19 },
            { name: 'mecha', id: 18 }, { name: 'slice of life', id: 36 }
        ]
    };
    var TYPE_LABELS = { movie: 'Movie', tv: 'TV show', anime: 'Anime' };
    var REGION_NAMES = { GB: 'the UK', US: 'the US', IE: 'Ireland', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand' };
    var PROVIDER_GROUPS = [['stream', 'Stream'], ['free', 'Free'], ['rent', 'Rent'], ['buy', 'Buy']];

    var prefs = ui.get(PREFS_KEY, {});
    var state = {
        type: GENRES[prefs.type] ? prefs.type : 'movie',
        genre: null,
        loading: false,
        current: null,
        seen: { movie: [], tv: [], anime: [] },
        watchlist: sanitizeWatchlist(ui.get(WATCHLIST_KEY, []))
    };

    var genreBox = document.getElementById('genres');
    var goBtn = document.getElementById('recommend');
    var resultBox = document.getElementById('result');
    var listEl = document.getElementById('watchlist');
    var listCount = document.getElementById('watchCount');
    var clearBtn = document.getElementById('clearWatchlist');

    function sanitizeWatchlist(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function (item) { return item && typeof item.title === 'string' && item.title; })
            .slice(0, CONFIG.watchlistMax)
            .map(function (item) {
                return {
                    title: String(item.title).slice(0, 300),
                    year: item.year ? String(item.year).slice(0, 4) : '',
                    type: TYPE_LABELS[item.type] ? item.type : 'movie',
                    score: item.score ? String(item.score).slice(0, 4) : '',
                    link: safeUrl(item.link)
                };
            });
    }

    function safeUrl(value) {
        if (typeof value !== 'string') return '';
        try {
            var url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function fetchJson(url) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, CONFIG.timeoutMs) : null;
        return fetch(url, controller ? { signal: controller.signal } : undefined)
            .then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (body) {
                    return { ok: res.ok, status: res.status, body: body };
                });
            })
            .catch(function (error) {
                if (error && error.name === 'AbortError') throw new Error('That took too long to answer. Try again in a moment.');
                throw new Error('Could not reach the film database. Check your connection and try again.');
            })
            .finally(function () { if (timer) clearTimeout(timer); });
    }

    function capitalise(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

    function genreNames(type) {
        return type === 'anime' ? GENRES.anime.map(function (g) { return g.name; }) : GENRES[type];
    }

    function renderTypes() {
        document.querySelectorAll('[data-type]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.type === state.type));
        });
    }

    function renderGenres() {
        genreBox.textContent = '';
        var any = el('button', 'opt', 'Any genre');
        any.type = 'button';
        any.setAttribute('aria-pressed', String(state.genre === null));
        any.addEventListener('click', function () { state.genre = null; renderGenres(); });
        genreBox.appendChild(any);
        genreNames(state.type).forEach(function (name) {
            var btn = el('button', 'opt', capitalise(name));
            btn.type = 'button';
            btn.setAttribute('aria-pressed', String(state.genre === name));
            btn.addEventListener('click', function () {
                state.genre = state.genre === name ? null : name;
                renderGenres();
            });
            genreBox.appendChild(btn);
        });
    }

    function remember(type, title) {
        var list = state.seen[type];
        list.push(title);
        if (list.length > CONFIG.rememberSeen) list.shift();
    }

    async function fetchAnime() {
        var genre = state.genre ? GENRES.anime.find(function (g) { return g.name === state.genre; }) : null;
        var maxPages = 5;
        if (genre) {
            var info = await fetchJson(CONFIG.jikanBase + '/anime?genres=' + genre.id + '&order_by=score&sort=desc&min_score=7&limit=1');
            if (info.ok && info.body && info.body.pagination) {
                maxPages = Math.max(1, Math.min(info.body.pagination.last_visible_page || 5, 20));
            }
            await sleep(CONFIG.jikanGapMs);
        }
        var page = Math.floor(Math.random() * maxPages) + 1;
        var url = genre
            ? CONFIG.jikanBase + '/anime?genres=' + genre.id + '&order_by=score&sort=desc&min_score=7&page=' + page + '&limit=25'
            : CONFIG.jikanBase + '/top/anime?page=' + page + '&limit=25&type=tv';
        var res = await fetchJson(url);
        if (res.status === 429) throw new Error('The anime database is busy. Wait a few seconds and try again.');
        if (!res.ok) throw new Error('The anime database did not answer properly. Try again in a moment.');
        var items = (res.body && Array.isArray(res.body.data)) ? res.body.data : [];
        if (!items.length) throw new Error('No anime found for that genre.');
        var fresh = items.filter(function (a) { return state.seen.anime.indexOf(a.title_english || a.title) === -1; });
        var pool = fresh.length ? fresh : items;
        var pick = pool[Math.floor(Math.random() * pool.length)];
        return {
            type: 'anime',
            title: pick.title_english || pick.title || 'Untitled',
            year: pick.aired && pick.aired.prop && pick.aired.prop.from ? pick.aired.prop.from.year : null,
            score: typeof pick.score === 'number' ? pick.score.toFixed(1) : null,
            genres: (pick.genres || []).map(function (g) { return g.name; }),
            desc: pick.synopsis ? pick.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim() : '',
            poster: pick.images && pick.images.jpg ? pick.images.jpg.large_image_url : null,
            link: pick.url || '',
            trailer: pick.trailer && pick.trailer.youtube_id ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(pick.trailer.youtube_id) : (pick.trailer && pick.trailer.url) || '',
            malId: typeof pick.mal_id === 'number' ? pick.mal_id : null,
            streaming: null
        };
    }

    function cleanProviders(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var out = { region: /^[A-Z]{2}$/.test(raw.region) ? raw.region : 'GB', link: safeUrl(raw.link) };
        PROVIDER_GROUPS.forEach(function (g) {
            out[g[0]] = (Array.isArray(raw[g[0]]) ? raw[g[0]] : []).slice(0, 8)
                .filter(function (p) { return p && typeof p.name === 'string' && p.name; })
                .map(function (p) { return { name: p.name.slice(0, 60), logo: safeUrl(p.logo) }; });
        });
        return out;
    }

    async function fetchAnimeStreaming(item) {
        if (!item.malId) { item.streaming = []; return; }
        try {
            await sleep(CONFIG.jikanGapMs);
            var res = await fetchJson(CONFIG.jikanBase + '/anime/' + item.malId + '/streaming');
            var list = res.ok && res.body && Array.isArray(res.body.data) ? res.body.data : [];
            item.streaming = list.filter(function (s) { return s && typeof s.name === 'string' && safeUrl(s.url); })
                .slice(0, 10)
                .map(function (s) { return { name: s.name.slice(0, 60), url: safeUrl(s.url) }; });
        } catch (error) {
            item.streaming = [];
        }
    }

    async function fetchFromWorker() {
        var params = new URLSearchParams({ type: state.type });
        if (state.genre) params.set('genre', state.genre);
        if (state.seen[state.type].length) params.set('exclude', state.seen[state.type].join(','));
        var res = await fetchJson(CONFIG.workerUrl + '?' + params.toString());
        if (!res.ok || !res.body || res.body.error || !res.body.title) {
            throw new Error((res.body && res.body.error) || 'The film database did not answer properly. Try again in a moment.');
        }
        var body = res.body;
        return {
            type: state.type,
            title: String(body.title),
            year: body.year || null,
            score: body.score || null,
            genres: Array.isArray(body.genres) ? body.genres : [],
            desc: body.desc || '',
            poster: body.poster || null,
            link: body.link || body.url || '',
            trailer: safeUrl(body.trailer),
            providers: cleanProviders(body.providers)
        };
    }

    function moreInfoLink(item) {
        var direct = safeUrl(item.link);
        if (direct) return direct;
        return 'https://www.themoviedb.org/search?query=' + encodeURIComponent(item.title + (item.year ? ' y:' + item.year : ''));
    }

    function trailerLink(item) {
        var direct = safeUrl(item.trailer);
        if (direct) return direct;
        return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.title + ' ' + (item.year || '') + ' trailer');
    }

    function inWatchlist(item) {
        return state.watchlist.some(function (w) { return w.title === item.title && w.type === item.type; });
    }

    function renderResult(item) {
        resultBox.textContent = '';
        resultBox.classList.remove('is-empty');
        var wrap = el('article', 'result');
        var poster = safeUrl(item.poster);
        if (poster) {
            var img = el('img', 'poster');
            img.src = poster;
            img.alt = item.title + ' poster';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', function () { img.replaceWith(el('div', 'poster poster-missing', 'No poster')); });
            wrap.appendChild(img);
        } else {
            wrap.appendChild(el('div', 'poster poster-missing', 'No poster'));
        }

        var info = el('div', 'result-info');
        info.appendChild(el('h2', 'result-title', item.title));
        var meta = el('div', 'result-meta');
        meta.appendChild(el('span', 'badge signal', TYPE_LABELS[item.type]));
        if (item.year) meta.appendChild(el('span', 'badge', String(item.year)));
        if (item.score) meta.appendChild(el('span', 'badge amber', '★ ' + item.score));
        (item.genres || []).slice(0, 4).forEach(function (g) { meta.appendChild(el('span', 'badge', String(g))); });
        info.appendChild(meta);
        info.appendChild(el('p', 'result-desc', item.desc || 'No description available.'));
        var where = el('section', 'where');
        where.setAttribute('aria-label', 'Where to watch');
        renderWhere(where, item);
        info.appendChild(where);

        var actions = el('div', 'btn-row lg');
        var again = el('button', 'btn-go', 'Another one');
        again.type = 'button';
        again.addEventListener('click', recommend);
        var save = el('button', 'btn-ghost');
        save.type = 'button';
        function syncSave() {
            var saved = inWatchlist(item);
            save.textContent = saved ? 'On your watchlist' : 'Add to watchlist';
            save.setAttribute('aria-pressed', String(saved));
        }
        save.addEventListener('click', function () {
            if (inWatchlist(item)) {
                removeFromWatchlist(item);
                ui.toast('Removed from your watchlist.');
            } else {
                addToWatchlist(item);
                ui.toast('Added to your watchlist.', 'ok');
            }
            syncSave();
        });
        syncSave();
        var more = el('a', 'btn-quiet', item.type === 'anime' ? 'MyAnimeList' : 'More info');
        more.href = moreInfoLink(item);
        more.target = '_blank';
        more.rel = 'noopener noreferrer';
        var trailer = el('a', 'btn-quiet', 'Trailer');
        trailer.href = trailerLink(item);
        trailer.target = '_blank';
        trailer.rel = 'noopener noreferrer';
        actions.append(again, save, more, trailer);
        info.appendChild(actions);
        wrap.appendChild(info);
        resultBox.appendChild(wrap);
        resultBox.focus({ preventScroll: true });
        if (window.matchMedia('(max-width: 900px)').matches) resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function providerChip(p, href) {
        var chip = el(href ? 'a' : 'span', 'provider');
        if (href) {
            chip.href = href;
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
        }
        if (p.logo) {
            var logo = el('img', 'provider-logo');
            logo.src = p.logo;
            logo.alt = '';
            logo.loading = 'lazy';
            logo.referrerPolicy = 'no-referrer';
            logo.addEventListener('error', function () { logo.remove(); });
            chip.appendChild(logo);
        }
        chip.appendChild(el('span', null, p.name));
        return chip;
    }

    function renderWhere(box, item) {
        box.textContent = '';
        if (item.type === 'anime') {
            box.appendChild(el('h3', 'where-title', 'Where to stream'));
            if (item.streaming === null) {
                box.appendChild(el('p', 'where-note', 'Checking streaming services…'));
                return;
            }
            if (!item.streaming.length) {
                box.appendChild(el('p', 'where-note', 'No streaming services listed for this one.'));
                return;
            }
            var row = el('div', 'provider-row');
            item.streaming.forEach(function (s) { row.appendChild(providerChip({ name: s.name }, s.url)); });
            box.appendChild(row);
            box.appendChild(el('p', 'where-note', 'From MyAnimeList. What is available depends on your country.'));
            return;
        }
        var prov = item.providers;
        if (!prov) return;
        var region = REGION_NAMES[prov.region] || prov.region;
        box.appendChild(el('h3', 'where-title', 'Where to watch in ' + region));
        var any = false;
        PROVIDER_GROUPS.forEach(function (g) {
            var list = prov[g[0]];
            if (!list || !list.length) return;
            any = true;
            var group = el('div', 'provider-group');
            group.appendChild(el('span', 'provider-kind', g[1]));
            var row = el('div', 'provider-row');
            list.forEach(function (p) { row.appendChild(providerChip(p, prov.link)); });
            group.appendChild(row);
            box.appendChild(group);
        });
        if (!any) box.appendChild(el('p', 'where-note', 'Not on any streaming, rental or purchase service in ' + region + ' right now.'));
        var note = el('p', 'where-note');
        note.appendChild(document.createTextNode('Availability from '));
        var jw = el('a', null, 'JustWatch');
        jw.href = 'https://www.justwatch.com/';
        jw.target = '_blank';
        jw.rel = 'noopener noreferrer';
        note.appendChild(jw);
        note.appendChild(document.createTextNode(' via TMDB.'));
        box.appendChild(note);
    }

    function renderError(message) {
        resultBox.textContent = '';
        resultBox.classList.remove('is-empty');
        var box = el('div', 'result-error');
        box.appendChild(el('p', null, message));
        var retry = el('button', 'btn-ghost', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', recommend);
        box.appendChild(retry);
        resultBox.appendChild(box);
    }

    function setLoading(on) {
        state.loading = on;
        goBtn.disabled = on;
        goBtn.textContent = '';
        if (on) {
            goBtn.appendChild(el('span', 'spinner'));
            goBtn.appendChild(document.createTextNode(' Finding something…'));
        } else {
            goBtn.textContent = 'Recommend something';
        }
        resultBox.setAttribute('aria-busy', String(on));
    }

    async function recommend() {
        if (state.loading) return;
        setLoading(true);
        try {
            var item = state.type === 'anime' ? await fetchAnime() : await fetchFromWorker();
            remember(item.type, item.title);
            state.current = item;
            renderResult(item);
            if (item.type === 'anime') {
                fetchAnimeStreaming(item).then(function () {
                    var box = resultBox.querySelector('.where');
                    if (state.current === item && box) renderWhere(box, item);
                });
            }
        } catch (error) {
            renderError(error.message || 'Something went wrong. Try again.');
        } finally {
            setLoading(false);
        }
    }

    function saveWatchlist() {
        if (!ui.set(WATCHLIST_KEY, state.watchlist)) ui.toast('Your browser would not save the watchlist.');
    }

    function addToWatchlist(item) {
        if (inWatchlist(item)) return;
        state.watchlist.unshift({
            title: item.title,
            year: item.year ? String(item.year) : '',
            type: item.type,
            score: item.score ? String(item.score) : '',
            link: moreInfoLink(item)
        });
        state.watchlist = state.watchlist.slice(0, CONFIG.watchlistMax);
        saveWatchlist();
        renderWatchlist();
    }

    function removeFromWatchlist(item) {
        state.watchlist = state.watchlist.filter(function (w) { return !(w.title === item.title && w.type === item.type); });
        saveWatchlist();
        renderWatchlist();
    }

    function renderWatchlist() {
        listEl.textContent = '';
        listCount.textContent = state.watchlist.length ? String(state.watchlist.length) : '';
        clearBtn.hidden = state.watchlist.length === 0;
        if (!state.watchlist.length) {
            listEl.appendChild(el('li', 'empty', 'Nothing saved yet. Press "Add to watchlist" on a recommendation to keep it here.'));
            return;
        }
        state.watchlist.forEach(function (item) {
            var li = el('li', 'watch-item');
            var text = el('div', 'watch-text');
            var title = el('a', 'watch-title', item.title);
            title.href = item.link || moreInfoLink(item);
            title.target = '_blank';
            title.rel = 'noopener noreferrer';
            text.appendChild(title);
            text.appendChild(el('span', 'watch-meta', [TYPE_LABELS[item.type], item.year, item.score ? '★ ' + item.score : ''].filter(Boolean).join(' · ')));
            var remove = el('button', 'btn-quiet icon-btn', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove ' + item.title + ' from your watchlist');
            remove.addEventListener('click', function () {
                removeFromWatchlist(item);
                if (state.current && state.current.title === item.title && state.current.type === item.type) renderResult(state.current);
            });
            li.append(text, remove);
            listEl.appendChild(li);
        });
    }

    document.querySelectorAll('[data-type]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (state.type === btn.dataset.type) return;
            state.type = btn.dataset.type;
            state.genre = null;
            ui.set(PREFS_KEY, { type: state.type });
            renderTypes();
            renderGenres();
        });
    });
    goBtn.addEventListener('click', recommend);
    clearBtn.addEventListener('click', function () {
        ui.confirm({ title: 'Clear your watchlist?', text: 'All ' + state.watchlist.length + ' saved titles will be removed from this browser.', ok: 'Clear', danger: true })
            .then(function (yes) {
                if (!yes) return;
                state.watchlist = [];
                saveWatchlist();
                renderWatchlist();
                if (state.current) renderResult(state.current);
                ui.toast('Watchlist cleared.');
            });
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !ui.isTyping(event) && document.activeElement === document.body) recommend();
    });

    renderTypes();
    renderGenres();
    renderWatchlist();
})();
