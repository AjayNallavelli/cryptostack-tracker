#!/usr/bin/env python3
"""Static site generator for CryptoStack Tracker (adapted from GTMStack Tracker).
Usage: python scripts/build.py [--out dist]"""
import argparse, datetime as dt, html, json, os, re, shutil
from urllib.parse import urlparse
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATS = {
    "Trading terminals & bots": ("trading-terminals", "Web terminals and Telegram bots that execute swaps for you, usually for a per-trade fee."),
    "Scanners & analytics": ("scanners-analytics", "Screeners, explorers and analytics sites for reading token, pair and wallet data."),
    "Wallets": ("wallets", "Self-custody wallets with built-in swaps. You hold the keys; swap fees vary by wallet."),
    "Safety checkers": ("safety-checkers", "Tools that read on-chain risk signals: authorities, liquidity, holders and linked wallets."),
}
STATUS_LABEL = {"verified": "Fees verified", "partial": "Partly verified", "unverified": "Unverified"}
STATUS_HELP = {"verified": "Every fee figure shown was read from the vendor's official page on the date checked.",
               "partial": "Some fee figures were read from an official page; others could not be, and are left blank.",
               "unverified": "No fee figure could be read from an official source, so the fee is left blank."}


def load():
    site = json.loads((ROOT / "site.json").read_text())
    site["base_url"] = os.environ.get("SITE_URL", site["base_url"]).rstrip("/")
    site["base_path"] = urlparse(site["base_url"]).path.rstrip("/")
    tools = json.loads((DATA / "tools.json").read_text())["tools"]
    for t in tools:
        t["slug"] = t["id"]
        t["cat_slug"] = CATS[t["category"]][0]
        t["status_label"] = STATUS_LABEL[t["verification"]]
        t["status_help"] = STATUS_HELP[t["verification"]]
        if t["verification"] == "unverified":
            assert not t["fees_summary"], f"{t['id']}: unverified tools must not carry a fee summary"
    pairs = []
    by_id = {t["id"]: t for t in tools}
    for p in json.loads((DATA / "compares.json").read_text())["pairs"]:
        a, b = by_id[p["a"]], by_id[p["b"]]
        pairs.append({"slug": f"{a['id']}-vs-{b['id']}", "a": a, "b": b, "notes": p["notes"],
                      "category": a["category"] if a["category"] == b["category"] else f"{a['category']} / {b['category']}"})
    for t in tools:
        t["pairs"] = [p for p in pairs if t in (p["a"], p["b"])]
    pages = json.loads((DATA / "pages.json").read_text())
    log = sorted(json.loads((DATA / "changelog.json").read_text()), key=lambda c: c["date"], reverse=True)
    paper = json.loads((DATA / "paper_calls.json").read_text())
    rules = json.loads((DATA / "rules.json").read_text())
    return site, tools, pairs, pages, log, paper, rules


ROOT_REL = re.compile(r'((?:href|src|action)=")/(?!/)')


def prefix_links(text, base_path):
    """Rewrite root-relative URLs (href="/x") to live under the site's sub-path."""
    return ROOT_REL.sub(lambda m: m.group(1) + base_path + "/", text) if base_path else text


def robots_txt(site):
    return f"# {site['name']}: all crawlers welcome.\nUser-agent: *\nAllow: /\n\nSitemap: {site['base_url']}/sitemap.xml\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "dist"))
    out = Path(ap.parse_args().out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    site, tools, pairs, pages, log, paper, rules = load()
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html", "xml"]))
    env.filters["nicedate"] = lambda d: dt.date.fromisoformat(d).strftime("%b %-d, %Y")
    cats = [{"name": n, "slug": s, "blurb": b, "tools": sorted([t for t in tools if t["category"] == n], key=lambda t: t["name"].lower())}
            for n, (s, b) in CATS.items()]
    last = max(t["date_checked"] for t in tools)
    stats = {"tools": len(tools), "verified": sum(t["verification"] == "verified" for t in tools),
             "partial": sum(t["verification"] == "partial" for t in tools),
             "unverified": sum(t["verification"] == "unverified" for t in tools), "last": last}
    common = dict(site=site, cats=cats, stats=stats, year=dt.date.today().year, pages=pages)
    sitemap = []

    def content(path):  # page bodies may loop over the machine-readable data files
        return Markup(env.from_string(path.read_text()).render(paper=paper, rules=rules))

    def render(tpl, path, sitemap_on=True, lastmod=None, **ctx):
        p = out / path.strip("/") / "index.html" if not path.endswith((".html", ".xml", ".txt")) else out / path.strip("/")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(prefix_links(env.get_template(tpl).render(**common, path=path, **ctx), site["base_path"]))
        if sitemap_on and path.endswith("/"):
            sitemap.append((path, lastmod))

    render("index.html", "/", lastmod=last, tools=sorted(tools, key=lambda t: t["name"].lower()), log=log[:3],
           title=f"{site['name']}: Solana trading tools, fees & safety explained (education only)",
           description=f"An education-only guide to {len(tools)} crypto trading terminals, scanners, wallets and safety checkers: fees from official sources, comparisons, risk-management explainers and guides.")
    for c in cats:
        render("category.html", f"/category/{c['slug']}/", lastmod=last, cat=c,
               title=f"{c['name']}: fees & features compared | {site['name']}",
               description=f"{c['blurb']} {len(c['tools'])} tools, with fees read from official sources and the date checked.")
    for t in tools:
        render("tool.html", f"/tools/{t['slug']}/", lastmod=t["date_checked"], t=t,
               title=f"{t['name']} fees & features (checked {env.filters['nicedate'](t['date_checked'])}) | {site['name']}",
               description=f"{t['name']} ({t['category']}): {t['fees_summary'] or 'fees unverified from an official source'}. Key features, source link and date checked.")
    for p in pairs:
        render("compare.html", f"/compare/{p['slug']}/", lastmod=max(p["a"]["date_checked"], p["b"]["date_checked"]), p=p,
               title=f"{p['a']['name']} vs {p['b']['name']}: fees & features | {site['name']}",
               description=f"{p['a']['name']} vs {p['b']['name']}: published fees, verification status, key features and sources, side by side. Education only.")
    render("compare_index.html", "/compare/", lastmod=last, pairs=pairs, title=f"Tool comparisons | {site['name']}",
           description="Side-by-side comparisons of crypto trading terminals, scanners, wallets and safety checkers.")
    for kind, label in (("strategies", "Strategies"), ("guides", "Guides"), ("case-studies", "Case studies")):
        for a in pages[kind]:
            body = content(ROOT / "content" / kind / f"{a['slug']}.html")
            render("article.html", f"/{kind}/{a['slug']}/", lastmod=a["date_checked"], a=a, kind=kind, kind_label=label, body=body,
                   title=f"{a['title']} | {site['name']}", description=a["summary"])
        render("article_index.html", f"/{kind}/", lastmod=last, kind=kind, kind_label=label, items=pages[kind],
               title=f"{label} | {site['name']}",
               description={"strategies": "Plain-language risk-management concepts. Not advice.",
                            "guides": "How-to guides researched from public docs: rugs, bundles and pump.fun bonding curves.",
                            "case-studies": "Dated post-mortems of paper calls: what happened and which rule would have caught it. Not advice."}[kind])
    for a in pages["standalone"]:  # one-off pages: paper scoreboard, learning log
        render("standalone.html", f"/{a['slug']}/", lastmod=a["date_checked"], a=a,
               body=content(ROOT / "content" / f"{a['slug']}.html"),
               title=f"{a['title']} | {site['name']}", description=a["summary"])
    render("changes.html", "/changes/", lastmod=log[0]["date"], log=log, title=f"What's new | {site['name']}",
           description="A hand-maintained log of changes to the CryptoStack Tracker data and pages.")
    render("methodology.html", "/methodology/", lastmod=last, title=f"Methodology & disclaimer | {site['name']}",
           description="How fees are researched and verified, what the verification labels mean, and why this site is education only.")
    render("404.html", "404.html", title="Page not found", description="Page not found")
    shutil.copytree(ROOT / "static", out / "static")
    (out / "data").mkdir()
    for name in ("tools.json", "paper_calls.json", "rules.json"):
        shutil.copy(DATA / name, out / "data" / name)
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p, lm in sitemap:
        sm.append(f"  <url><loc>{html.escape(site['base_url'] + p)}</loc>" + (f"<lastmod>{lm}</lastmod>" if lm else "") + "</url>")
    sm.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(sm) + "\n")
    (out / "robots.txt").write_text(robots_txt(site))
    (out / ".nojekyll").write_text("")
    print(f"Built {len(sitemap)} sitemap pages ({len(tools)} tools, {len(pairs)} comparisons, "
          f"{len(pages['strategies'])} strategies, {len(pages['guides'])} guides, {len(pages['case-studies'])} case studies, {len(pages['standalone'])} standalone pages) -> {out}")


if __name__ == "__main__":
    main()
