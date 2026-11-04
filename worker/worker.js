const TMDB_BASE = 'https://api.themoviedb.org/3';
const ALLOWED_ORIGINS = ['https://mediarec.drew-gnr.xyz'];
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_RANDOM_PAGE = 5;

const TMDB_GENRES_MOVIE = {
    action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
    documentary: 99, drama: 18, fantasy: 14, history: 36, horror: 27,
    music: 10402, mystery: 9648, romance: 10749, 'sci-fi': 878,
    thriller: 53, western: 37
};

const TMDB_GENRES_TV = {
    action: 10759, adventure: 10759, animation: 16, comedy: 35, crime: 80,
    documentary: 99, drama: 18, family: 10751, fantasy: 10765, history: 10768,
    mystery: 9648, 'sci-fi': 10765, thriller: 9648
};

const ANIMATION_GENRE_ID = 16;

const MEDIA_TYPES = {
    movie: { kind: 'movie', genres: TMDB_GENRES_MOVIE, minVotes: 200, baseGenres: [], language: null },
    tv:    { kind: 'tv',    genres: TMDB_GENRES_TV,    minVotes: 100, baseGenres: [], language: null },
    anime: { kind: 'tv',    genres: TMDB_GENRES_TV,    minVotes: 50,  baseGenres: [ANIMATION_GENRE_ID], language: 'ja' },
};

function allowedOrigin(request) {
    const origin = request.headers.get('Origin');
    if (!origin) return null;
    if (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin)) return origin;
    return undefined;
}

function corsHeaders(origin) {
    const headers = {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
    };
    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers['Access-Control-Max-Age'] = '86400';
    }
    return headers;
}

function jsonResponse(body, status = 200, origin = null) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function tmdbFetch(path, env) {
    const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${env.TMDB_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    return res.json();
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomPage(lastPage) {
    return Math.floor(Math.random() * lastPage) + 1;
}

function discoverPath(media, genreNames, page) {
    const genreIds = new Set([...media.baseGenres, ...genreNames.map(n => media.genres[n]).filter(Boolean)]);
    const params = new URLSearchParams({
        sort_by: 'popularity.desc',
        'vote_count.gte': String(media.minVotes),
        page: String(page),
    });
    if (genreIds.size) params.set('with_genres', [...genreIds].join(','));
    if (media.language) params.set('with_original_language', media.language);
    return `/discover/${media.kind}?${params}`;
}

async function fetchCandidates(media, genreNames, env) {
    const data = await tmdbFetch(discoverPath(media, genreNames, randomPage(MAX_RANDOM_PAGE)), env);
    if (data.results?.length || !data.total_pages) return data.results || [];
    const retry = await tmdbFetch(discoverPath(media, genreNames, randomPage(Math.min(data.total_pages, MAX_RANDOM_PAGE))), env);
    return retry.results || [];
}

async function handleRequest(request, env, origin) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'movie';
    const media = MEDIA_TYPES[type];
    if (!media) return jsonResponse({ error: `Unknown type "${type}"` }, 400, origin);

    const genreRaw = url.searchParams.get('genres') || url.searchParams.get('genre') || '';
    const genreNames = genreRaw.split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
    const excludeRaw = url.searchParams.get('exclude') || '';
    const excluded = new Set(excludeRaw.split(excludeRaw.includes('|') ? '|' : ',').map(t => t.trim()).filter(Boolean));

    const results = await fetchCandidates(media, genreNames, env);
    if (!results.length) return jsonResponse({ error: 'No results found for that genre mix.' }, 404, origin);

    const fresh = results.filter(r => !excluded.has(r.title || r.name));
    const pick = pickRandom(fresh.length ? fresh : results);
    let genres = [];
    try {
        const detail = await tmdbFetch(`/${media.kind}/${pick.id}`, env);
        genres = (detail.genres || []).map(g => g.name);
    } catch (_) {
    }

    return jsonResponse({
        title:  pick.title || pick.name || 'Unknown',
        year:   (pick.release_date || pick.first_air_date || '').slice(0, 4),
        score:  pick.vote_average ? pick.vote_average.toFixed(1) : null,
        genres, desc: pick.overview || '',
        poster: pick.poster_path ? `https://image.tmdb.org/t/p/w500${pick.poster_path}` : null,
        language: pick.original_language || null,
        type
    }, 200, origin);
}

export default {
    async fetch(request, env) {
        const origin = allowedOrigin(request);
        if (origin === undefined) return jsonResponse({ error: 'Origin not allowed' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
        if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, origin);
        try { return await handleRequest(request, env, origin); }
        catch (err) { return jsonResponse({ error: err.message }, 500, origin); }
    }
};
