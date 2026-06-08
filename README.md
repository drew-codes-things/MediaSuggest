<div align="center">

# MediaRecommender

**A browser tool that picks a random Movie, TV Show, or Anime recommendation based on your chosen genre, powered by TMDB and Jikan.**

[![JavaScript](https://img.shields.io/badge/javascript-drew?style=flat-square&logo=javascript&logoColor=F7DF1E&color=000000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML](https://img.shields.io/badge/html-drew?style=flat-square&logo=html5&logoColor=FFFFFF&color=E34C26)](https://html.spec.whatwg.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

Pick a media type, optionally filter by genre, and get an instant recommendation. No account, no install, no tracking. The app is also live at [mediarec.drew-gnr.xyz](https://mediarec.drew-gnr.xyz/).

---

## How It Works

- **Movies and TV Shows** are fetched from TMDB via a Cloudflare Worker at `api.drew-gnr.xyz/tmdb`. The Worker handles the API key server-side so no credentials are exposed in the client.
- **Anime** is fetched directly from the [Jikan v4 API](https://jikan.moe/) (no key required), filtered by MAL genre ID and sorted by score descending with a minimum score of 7. The total available pages are fetched dynamically so results aren't limited to just the first 5 pages.
- Already-seen titles **and everything in your watchlist** are excluded from subsequent fetches so you won't get the same result twice in a row, or be recommended something you've already saved.

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

### Anime

`action` `adventure` `comedy` `drama` `fantasy` `horror` `mystery` `romance` `sci-fi` `thriller` `sports` `music` `mecha` `slice of life`

---

## Result Card

Each recommendation shows:

- Title and poster image
- Type badge (`Movie`, `TV Show`, `Anime`), release year, and TMDB/MAL score
- Up to 4 genre badges
- Synopsis / description
- **Add to Watchlist** button to save the result to your session watchlist
- **Try another** button to fetch a new result without changing your selections

---

## Watchlist

A watchlist appears below the result card once you save your first item. It is **persisted to `localStorage`**, so it survives refreshes and browser restarts. Each entry shows the title, type, year, and score. Items can be removed individually or cleared all at once.

- **Shuffle** - pick a random title from your watchlist as the current result
- **Import / Export** - export as `.txt`, `.csv`, or `.json`; import any of those back in (duplicates are skipped)
- **Share** - copy a permalink (`?pick=…`) that reopens the current recommendation for anyone who visits it

---

## Usage

Open `index.html` in any modern browser, or visit [mediarec.drew-gnr.xyz](https://mediarec.drew-gnr.xyz/).

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
