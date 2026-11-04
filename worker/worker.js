const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

const GENRES = {
    movie: {
        action: '28', adventure: '12', animation: '16', comedy: '35', crime: '80', documentary: '99', drama: '18',
        fantasy: '14', history: '36', horror: '27', music: '10402', mystery: '9648', romance: '10749',
        'sci-fi': '878', thriller: '53', western: '37'
    },
    tv: {
        action: '10759', animation: '16', comedy: '35', crime: '80', documentary: '99', drama: '18',
        fantasy: '10765', history: '10768', mystery: '9648', 'sci-fi': '10765', thriller: '80|9648'
    }
};

const MIN_VOTES = { movie: 300, tv: 150 };
const MAX_PAGE = 20;
const PER_GROUP = 8;
const pageCounts = new Map();

function allowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || 'https://mediarec.drew-gnr.xyz')
        .split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Vary': 'Origin' };
    if (origin && allowedOrigins(env).includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Max-Age'] = '86400';
    }
    return headers;
}

function json(body, status, request, env) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...corsHeaders(request, env)
        }
    });
}

function randomInt(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
}

async function tmdb(path, params, env, fetchImpl) {
    const url = new URL(TMDB + path);
    Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
    const headers = { Accept: 'application/json' };
    if (env.TMDB_TOKEN) headers.Authorization = 'Bearer ' + env.TMDB_TOKEN;
    else url.searchParams.set('api_key', env.TMDB_API_KEY);
    const res = await fetchImpl(url.toString(), { headers, cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!res.ok) {
        const err = new Error(res.status === 401 ? 'The TMDB key was turned down.' : 'TMDB answered with an error (' + res.status + ').');
        err.status = 502;
        throw err;
    }
    return res.json();
}

function providerGroup(list) {
    return (Array.isArray(list) ? list : [])
        .slice()
        .sort((a, b) => (a.display_priority || 99) - (b.display_priority || 99))
        .slice(0, PER_GROUP)
        .map(p => ({ name: String(p.provider_name || ''), logo: p.logo_path ? IMG + 'w92' + p.logo_path : null }))
        .filter(p => p.name);
}

function providersFor(details, region) {
    const all = details['watch/providers'] && details['watch/providers'].results;
    const here = all && all[region];
    if (!here) return { region, link: null, stream: [], free: [], rent: [], buy: [] };
    const free = providerGroup([...(here.free || []), ...(here.ads || [])]);
    const seen = new Set();
    return {
        region,
        link: typeof here.link === 'string' ? here.link : null,
        stream: providerGroup(here.flatrate),
        free: free.filter(p => !seen.has(p.name) && seen.add(p.name)),
        rent: providerGroup(here.rent),
        buy: providerGroup(here.buy)
    };
}

function trailerFor(details) {
    const videos = (details.videos && details.videos.results) || [];
    const youtube = videos.filter(v => v.site === 'YouTube' && v.key);
    const pick = youtube.find(v => v.type === 'Trailer' && v.official)
        || youtube.find(v => v.type === 'Trailer')
        || youtube.find(v => v.type === 'Teaser');
    return pick ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(pick.key) : null;
}

async function pickTitle(type, genreId, exclude, region, env, fetchImpl) {
    const cacheKey = type + ':' + (genreId || 'any');
    const known = pageCounts.get(cacheKey) || 5;
    const params = {
        language: 'en-GB',
        region,
        watch_region: region,
        include_adult: 'false',
        sort_by: 'popularity.desc',
        'vote_count.gte': MIN_VOTES[type],
        'vote_average.gte': '6.5',
        with_genres: genreId
    };
    let page = 1 + randomInt(Math.min(known, MAX_PAGE));
    let data = await tmdb('/discover/' + type, { ...params, page }, env, fetchImpl);
    if (typeof data.total_pages === 'number') pageCounts.set(cacheKey, Math.max(1, Math.min(data.total_pages, MAX_PAGE)));
    if ((!data.results || !data.results.length) && page !== 1) {
        page = 1;
        data = await tmdb('/discover/' + type, { ...params, page }, env, fetchImpl);
    }
    const results = (data.results || []).filter(r => r && r.id);
    if (!results.length) {
        const err = new Error('Nothing turned up for that genre. Try another one.');
        err.status = 404;
        throw err;
    }
    const nameOf = r => String(r.title || r.name || '').toLowerCase();
    const fresh = results.filter(r => !exclude.has(nameOf(r)));
    const pool = fresh.length ? fresh : results;
    return pool[randomInt(pool.length)];
}

export async function handle(request, env, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== 'GET') return json({ error: 'Only GET is supported.' }, 405, request, env);
    if (!env.TMDB_TOKEN && !env.TMDB_API_KEY) return json({ error: 'The recommender is not set up yet.' }, 500, request, env);

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'movie';
    if (!GENRES[type]) return json({ error: 'Type must be movie or tv.' }, 400, request, env);
    const genre = (url.searchParams.get('genre') || '').toLowerCase();
    if (genre && !GENRES[type][genre]) return json({ error: 'That genre is not available for this type.' }, 400, request, env);
    const regionParam = (url.searchParams.get('region') || '').toUpperCase();
    const region = /^[A-Z]{2}$/.test(regionParam) ? regionParam : (env.REGION || 'GB');
    const exclude = new Set((url.searchParams.get('exclude') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 50));

    try {
        const pick = await pickTitle(type, genre ? GENRES[type][genre] : '', exclude, region, env, doFetch);
        const details = await tmdb('/' + type + '/' + pick.id, { language: 'en-GB', append_to_response: 'watch/providers,videos' }, env, doFetch);
        const date = details.release_date || details.first_air_date || '';
        return json({
            id: details.id,
            type,
            title: details.title || details.name || pick.title || pick.name || 'Untitled',
            year: /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
            score: typeof details.vote_average === 'number' && details.vote_average > 0 ? details.vote_average.toFixed(1) : null,
            genres: (details.genres || []).map(g => g.name).filter(Boolean),
            desc: details.overview || '',
            poster: details.poster_path ? IMG + 'w500' + details.poster_path : null,
            link: 'https://www.themoviedb.org/' + type + '/' + details.id,
            trailer: trailerFor(details),
            providers: providersFor(details, region)
        }, 200, request, env);
    } catch (error) {
        return json({ error: error.status ? error.message : 'Could not reach TMDB. Try again in a moment.' }, error.status || 502, request, env);
    }
}

export default {
    fetch(request, env) {
        return handle(request, env);
    }
};
