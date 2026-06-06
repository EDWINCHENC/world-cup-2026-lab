# Historical Data

## Primary source

- Repository: `martj42/international_results`
- URL: https://github.com/martj42/international_results
- License: CC0-1.0
- Local raw file: `data/raw/international-results/results.csv`

The dataset contains men's full international match results, including tournament,
location, score, and neutral-venue information. Future fixtures with missing scores
are retained in the raw source but excluded from generated historical features.

## Refresh

```bash
npm run data:history
```

The import script parses the raw CSV, applies tournament importance and a 2.5-year
recency half-life, then writes browser-ready features to:

`src/data/history-features.json`
