import assert from 'assert';
import { handle } from '../worker/worker.js';

const env = { TMDB_TOKEN: 'test-token', ALLOWED_ORIGINS: 'https://mediarec.drew-gnr.xyz' };
const calls = [];

function discover(page) {
    return { page, total_pages: 3, results: [
        { id: 11, title: 'Seen Before' },
        { id: 22, title: 'Fresh Pick' }
    ] };
}

const details = {
    id: 22, title: 'Fresh Pick', release_date: '2021-05-04', vote_average: 7.86, overview: 'A story.',
    poster_path: '/p.jpg', genres: [{ id: 18, name: 'Drama' }, { id: 9648, name: 'Mystery' }],
    videos: { results: [
        { site: 'YouTube', key: 'teaser1', type: 'Teaser' },
        { site: 'YouTube', key: 'tr<1>', type: 'Trailer', official: true }
    ] },
    'watch/providers': { results: { GB: {
        link: 'https://www.themoviedb.org/movie/22/watch?locale=GB',
        flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg', display_priority: 2 }, { provider_name: 'BBC iPlayer', logo_path: '/b.jpg', display_priority: 1 }],
        free: [{ provider_name: 'Channel 4', logo_path: '/c.jpg', display_priority: 3 }],
        ads: [{ provider_name: 'Channel 4', logo_path: '/c.jpg', display_priority: 3 }],
        rent: [{ provider_name: 'Apple TV', logo_path: null, display_priority: 4 }],
        buy: [{ provider_name: 'Rakuten TV', logo_path: null, display_priority: 5 }, { provider_name: 'Sky Store', logo_path: null }, { provider_name: 'Amazon Video', logo_path: null, display_priority: 0 }]
    } } }
};

async function fakeFetch(url, init) {
    calls.push({ url, init });
    const u = new URL(url);
    if (u.pathname.startsWith('/3/discover/')) return new Response(JSON.stringify(discover(Number(u.searchParams.get('page')))), { status: 200 });
    const m = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
    if (m) return new Response(JSON.stringify({ ...details, id: Number(m[2]), title: m[2] === '11' ? 'Seen Before' : details.title }), { status: 200 });
    return new Response('{}', { status: 404 });
}

const origin = { Origin: 'https://mediarec.drew-gnr.xyz' };
let res = await handle(new Request('https://api.drew-gnr.xyz/tmdb?type=movie&genre=mystery&exclude=Seen%20Before', { headers: origin }), env, fakeFetch);
assert.strictEqual(res.status, 200);
assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://mediarec.drew-gnr.xyz');
let body = await res.json();
assert.strictEqual(body.title, 'Fresh Pick', 'excluded titles are skipped');
assert.strictEqual(body.year, 2021);
assert.strictEqual(body.score, '7.9');
assert.deepStrictEqual(body.genres, ['Drama', 'Mystery']);
assert.strictEqual(body.poster, 'https://image.tmdb.org/t/p/w500/p.jpg');
assert.strictEqual(body.link, 'https://www.themoviedb.org/movie/22');
assert.strictEqual(body.trailer, 'https://www.youtube.com/watch?v=tr%3C1%3E', 'official trailer preferred and key encoded');
assert.strictEqual(body.providers.region, 'GB');
assert.deepStrictEqual(body.providers.stream.map(p => p.name), ['BBC iPlayer', 'Netflix'], 'sorted by priority');
assert.deepStrictEqual(body.providers.free.map(p => p.name), ['Channel 4'], 'free and ad-supported merged without repeats');
assert.strictEqual(body.providers.rent[0].logo, null);
assert.deepStrictEqual(body.providers.buy.map(p => p.name), ['Amazon Video', 'Rakuten TV', 'Sky Store'], 'priority 0 is the top provider, a missing priority goes last');

const discoverCall = calls.find(c => c.url.includes('/discover/movie'));
const dUrl = new URL(discoverCall.url);
assert.strictEqual(dUrl.searchParams.get('with_genres'), '9648');
assert.strictEqual(dUrl.searchParams.get('include_adult'), 'false');
assert.strictEqual(dUrl.searchParams.get('api_key'), null, 'bearer token is not put in the URL');
assert.strictEqual(discoverCall.init.headers.Authorization, 'Bearer test-token');

calls.length = 0;
res = await handle(new Request('https://api.drew-gnr.xyz/tmdb?type=tv&genre=thriller&region=us'), { TMDB_API_KEY: 'k' }, fakeFetch);
assert.strictEqual(res.status, 200);
assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null, 'no CORS header without an allowed origin');
body = await res.json();
assert.strictEqual(body.providers.region, 'US');
assert.deepStrictEqual(body.providers.stream, [], 'no providers for a region TMDB has nothing for');
assert.strictEqual(new URL(calls[0].url).searchParams.get('with_genres'), '80|9648');
assert.strictEqual(new URL(calls[0].url).searchParams.get('api_key'), 'k');

calls.length = 0;
res = await handle(new Request('https://x/tmdb?type=movie', { headers: { Origin: 'https://evil.example' } }), env, fakeFetch);
assert.strictEqual(res.status, 403, 'a browser on another site is refused');
assert.strictEqual(calls.length, 0, 'and TMDB is not called for it');
res = await handle(new Request('https://x/tmdb', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, fakeFetch);
assert.strictEqual(res.status, 403);

calls.length = 0;
res = await handle(new Request('https://x/tmdb?type=constructor'), env, fakeFetch);
assert.strictEqual(res.status, 400, 'an inherited object name is not a type');
res = await handle(new Request('https://x/tmdb?type=movie&genre=constructor'), env, fakeFetch);
assert.strictEqual(res.status, 400, 'or a genre');
res = await handle(new Request('https://x/tmdb?type=movie&genre=__proto__'), env, fakeFetch);
assert.strictEqual(res.status, 400);
assert.strictEqual(calls.length, 0, 'TMDB is not called for them');

res = await handle(new Request('https://x/tmdb?type=anime'), env, fakeFetch);
assert.strictEqual(res.status, 400);
res = await handle(new Request('https://x/tmdb?type=tv&genre=horror'), env, fakeFetch);
assert.strictEqual(res.status, 400);
res = await handle(new Request('https://x/tmdb?type=movie'), {}, fakeFetch);
assert.strictEqual(res.status, 500);
assert.match((await res.json()).error, /not set up/);
res = await handle(new Request('https://x/tmdb', { method: 'POST' }), env, fakeFetch);
assert.strictEqual(res.status, 405);
res = await handle(new Request('https://x/tmdb', { method: 'OPTIONS', headers: origin }), env, fakeFetch);
assert.strictEqual(res.status, 204);
assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');

res = await handle(new Request('https://x/tmdb?type=movie'), env, async () => new Response('{}', { status: 401 }));
assert.strictEqual(res.status, 502);
assert.match((await res.json()).error, /key/);
res = await handle(new Request('https://x/tmdb?type=movie'), env, async () => { throw new TypeError('network'); });
assert.strictEqual(res.status, 502);
res = await handle(new Request('https://x/tmdb?type=movie'), env, async () => new Response(JSON.stringify({ results: [], total_pages: 0 }), { status: 200 }));
assert.strictEqual(res.status, 404);

console.log('worker.test.mjs: all tests passed');
