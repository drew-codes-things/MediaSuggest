<div align="center">

# MediaRecommender

**A browser tool that picks a random Movie, TV Show, or Anime recommendation based on your chosen genre, powered by TMDB.**

[![JavaScript](https://img.shields.io/badge/javascript-drew?style=flat-square&logo=javascript&logoColor=F7DF1E&color=000000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML](https://img.shields.io/badge/html-drew?style=flat-square&logo=html5&logoColor=FFFFFF&color=E34C26)](https://html.spec.whatwg.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

Pick a media type, optionally filter by genre, and get an instant recommendation. No account, no install, no tracking. The app is also live at [mediarec.drew-gnr.xyz](https://mediarec.drew-gnr.xyz/).

---

## How It Works

- **Movies, TV Shows and Anime** all come from TMDB via a Cloudflare Worker at `api.drew-gnr.xyz/tmdb` (source in [`worker/worker.js`](worker/worker.js)). The Worker handles the API key server-side so no credentials are exposed in the client. It only answers browser requests from the origins listed in `ALLOWED_ORIGINS` at the top of the worker (plus `localhost` for development), so other sites cannot spend the TMDB quota.
- **Anime** is Japanese-language animated TV on TMDB, so it uses TMDB's TV genres. If a genre mix is narrow enough that a random page would be empty, the Worker retries within the pages that actually exist.
- Already-seen titles, **everything in your watchlist**, and anything you've marked **Seen it** or **Not interested** are excluded from later fetches, so you won't get the same result twice in a row or be recommended something you've already dealt with.

---

## Layout

The UI uses a two-panel layout:

- **Before a recommendation** - the input card sits centred on screen by itself.
- **After clicking Recommend** - the result panel animates in to the right, creating a side-by-side 50/50 split across the full page width.
- On screens narrower than 860px the panels stack vertically.

---

## Media Types and Genres

### Movies

`action` `adventure` `animation` `comedy` `crime` `documentary` `drama` `fantasy` `history` `horror` `music` `mystery` `romance` `sci-fi` `thriller` `western`

### TV Shows

`action` `animation` `comedy` `crime` `documentary` `drama` `fantasy` `history` `mystery` `sci-fi` `thriller`

TMDB's TV genres are coarser than its movie ones, so some share a genre: action and adventure both mean "Action & Adventure", fantasy and sci-fi both mean "Sci-Fi & Fantasy", history means "War & Politics", and thriller uses "Mystery".

### Anime

`action` `adventure` `comedy` `crime` `drama` `family` `fantasy` `mystery` `sci-fi`

---

## Result Card

Each recommendation shows:

- Title and poster image
- Type badge (`Movie`, `TV Show`, `Anime`), release year, and TMDB score
- Up to 4 genre badges
- Synopsis / description
- **Add to Watchlist** button to save the result to your session watchlist
- **Try another** button to fetch a new result without changing your selections
- **Seen it** / **Not interested** - never suggest this title again and move straight on to the next one. Both are remembered in your browser, listed under *Seen & not interested*, and each can be undone

---

## Watchlist

A watchlist appears below the result card once you save your first item. It is **persisted to `localStorage`**, so it survives refreshes and browser restarts. Each entry shows the title, type, year, and score. Items can be removed individually or cleared all at once.

- **Shuffle** - pick a random title from your watchlist as the current result
- **Import / Export** - export as `.txt`, `.csv`, or `.json`; import any of those back in (duplicates are skipped)
- **Share** - copy a permalink (`?pick=…`) that reopens the current recommendation for anyone who visits it

---

## Usage

Visit [mediarec.drew-gnr.xyz](https://mediarec.drew-gnr.xyz/), or serve the folder locally (the Worker rejects the `null` origin a `file://` page sends, so open it through a local server):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

1. Select a media type (`Movie`, `TV Show`, `Anime`)
2. Click a genre pill to filter (optional - click again to deselect)
3. Click **Recommend me something**
4. Optionally save the result to your watchlist or hit **Try another**

---

## Get the Code

Clone with git:

```bash
git clone https://github.com/drew-codes-things/MediaSuggest.git
```

Or with the [GitHub CLI](https://cli.github.com/):

```bash
gh repo clone drew-codes-things/MediaSuggest
```

## License

MIT - made by [Drew](https://github.com/drew-codes-things)
