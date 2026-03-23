# SignalWatch Personal — Deploy to Vercel in 5 minutes

## What you're deploying
A personal web app that:
- Scans 80+ stocks daily against 12 failure signals (free, uses Yahoo Finance)
- Shows a ranked dashboard in your browser
- Analyzes any company with Claude — streaming analysis, right in the app
- Remembers today's scan in your browser so it's instant on reload

---

## Step 1 — Get your API keys (2 minutes)

**Anthropic API key** (for the Claude analysis feature):
1. Go to console.anthropic.com
2. Sign in / create account
3. Click "API Keys" → "Create Key"
4. Copy it — looks like: sk-ant-api03-...

---

## Step 2 — Put the code on GitHub (1 minute)

1. Go to github.com and sign in (create free account if needed)
2. Click the + icon → "New repository"
3. Name it "signalwatch" → click "Create repository"
4. On your Mac, open Terminal and run:

```bash
cd ~/Downloads/signalwatch-personal   # or wherever you unzipped it
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/signalwatch.git
git push -u origin main
```

---

## Step 3 — Deploy to Vercel (2 minutes)

1. Go to vercel.com → Sign in with GitHub
2. Click "Add New Project"
3. Find your "signalwatch" repo → click "Import"
4. Before clicking Deploy, click "Environment Variables" and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your sk-ant-... key
5. Click "Deploy"

That's it. Vercel gives you a URL like:
`https://signalwatch-yourname.vercel.app`

Bookmark it. Every time you open it, it loads today's scan automatically.

---

## Using the app

**Dashboard** — opens to today's ranked scan. Cached for 6 hours so reloads are instant.

**Filter** — click CRITICAL / HIGH / MEDIUM to filter the list.

**Scan any ticker** — type any ticker in the top search box (e.g. NVDA, SNAP) and hit SCAN. Works for any public company, not just the watchlist.

**Detail view** — click any row to see the full 12-signal breakdown on the right.

**Analyze with Claude** — click the blue button in the detail panel. Claude streams a full forensic analysis right in the app — takes about 15 seconds.

---

## Add tickers to your watchlist

Open `pages/api/scan-all.js` in any text editor.
Find the `WATCHLIST = [` array near the top.
Add or remove tickers. Push to GitHub — Vercel redeploys automatically.

---

## Costs

- Vercel hosting: **free** (Hobby plan is plenty)
- Yahoo Finance data: **free** (no key needed)
- Claude analysis: Anthropic API — roughly $0.01–0.03 per analysis.
  A month of daily use costs less than $1.

---

## Troubleshooting

**"Analysis failed" error**
→ Check your ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables

**Scan returns no data for a ticker**
→ Yahoo Finance occasionally rate-limits. Wait a minute and try again.

**Vercel function timeout on full scan**
→ Free Vercel plan has 10-second function timeout. The scan-all route
   uses batching but may time out on slow connections.
   Fix: upgrade to Vercel Pro ($20/mo) for 60s timeout,
   OR reduce the WATCHLIST array to ~40 tickers.
