// pages/api/scan-all.js
// Scans the full watchlist in parallel batches.
// Called once on dashboard load (results cached in localStorage for the day).

import { fetchTickerData } from "../../lib/yahoo"
import { runAllSignals, compositeScore, riskLevel } from "../../lib/signals"

export const config = { maxDuration: 60 } // Vercel Pro; free tier = 10s

const WATCHLIST = [
  "AMZN","WMT","TGT","COST","HD","NKE","SBUX","MCD",
  "DG","DLTR","KSS","M","GPS","ANF",
  "AAPL","MSFT","GOOGL","META","NVDA","INTC","AMD","QCOM",
  "IBM","HPQ","DELL","CSCO","ORCL","ADBE","CRM",
  "SNAP","RBLX","ZM","DOCU",
  "JNJ","PFE","MRK","ABBV","BMY","AMGN","GILD","BIIB",
  "HCA","CVS","WBA","ABC",
  "JPM","BAC","WFC","GS","MS","C","AXP","COF","DFS",
  "XOM","CVX","COP","OXY","DVN","HAL","SLB",
  "BA","GE","HON","CAT","MMM","FDX","UPS","DAL","UAL","AAL",
  "F","GM","RIVN","TSLA",
  "DIS","NFLX","PARA","WBD","T","VZ","LUMN",
  "SPG","MAC",
  "PTON","BYND","OPEN","COIN","UPST","AFRM","HOOD",
]

async function scanOne(ticker) {
  try {
    const { fin, quote } = await fetchTickerData(ticker)
    if (quote.marketCap < 200_000_000) return null
    const signals = runAllSignals(fin, quote)
    const comp    = compositeScore(signals)
    const risk    = riskLevel(comp)
    const topFlags = signals
      .filter(s => s.verdict === "CONFIRMED")
      .sort((a,b) => b.score - a.score)
      .slice(0,3)
      .map(s => s.name)
    return { ticker, name: quote.longName, sector: quote.sector,
             market_cap: quote.marketCap,
             price: quote.currentPrice || quote.regularMarketPrice,
             composite_score: comp, risk_level: risk, top_flags: topFlags, signals }
  } catch {
    return null
  }
}

async function batchMap(items, fn, batchSize = 8) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    // Small pause between batches to avoid rate limiting
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, 300))
  }
  return results
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end()

  const results = await batchMap(WATCHLIST, scanOne, 8)
  const valid   = results
    .filter(Boolean)
    .sort((a,b) => b.composite_score - a.composite_score)

  return res.status(200).json({
    scan_date:     new Date().toISOString().split("T")[0],
    total_scanned: valid.length,
    results:       valid,
  })
}
