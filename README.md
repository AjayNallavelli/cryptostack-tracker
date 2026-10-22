# CryptoStack Tracker

An **education-only** static site that explains crypto trading terminals, scanners, wallets and safety checkers: what each tool does and what it charges, with every fee taken from the vendor's own pages and dated.

Live: https://ajaynallavelli.github.io/cryptostack-tracker/

**Not financial advice. Crypto is high risk.** The site never names coins to buy or gives trading signals.

## How it works

- `data/tools.json`: tools (name, category, vendor URL, fee items, key features, best-for, source URL, `date_checked`, `verification`). Seeded by `scripts/seed_tools.py`.
- `data/compares.json`: hand-picked comparison pairs and factual notes.
- `data/pages.json` + `content/strategies/*.html`, `content/guides/*.html`: strategy explainers and guides, each with sources.
- `data/changelog.json`: the "What's new" log, **maintained by hand**.
- `scripts/build.py` renders `templates/` (Jinja2) into `dist/`, plus `sitemap.xml` and `robots.txt`. `scripts/check_links.py` fails the build on any broken internal link.
- Adapted from the GTMStack Tracker generator, with newsletter, affiliate, featured/sponsor and scraping code removed.

### Fee rules
- Only official sources (vendor site, docs, help centre). Never estimate.
- A fee that can't be read from an official source stays blank; the tool is `unverified` (no fee at all) or `partial` (some fees blank).

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh build    # build + link check
./run.sh serve    # http://localhost:8787
```

## Deploy

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main` (no schedule, no paid services).

## Updating data

1. Re-check a vendor page, edit `scripts/seed_tools.py` (or `data/tools.json`), set `date_checked`.
2. Add an entry to `data/changelog.json`.
3. Push.
