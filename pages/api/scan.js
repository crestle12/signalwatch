// pages/api/scan.js
import { fetchTickerData } from "../../lib/yahoo"
import { runAllSignals, compositeScore, riskLevel } from "../../lib/signals"

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end()

  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: "ticker required" })

  try {
    const { fin, quote } = await fetchTickerData(ticker.toUpperCase())
    const signals = runAllSignals(fin, quote)
    const comp    = compositeScore(signals)
    const risk    = riskLevel(comp)

    const confirmed = signals.filter(s => s.verdict === "CONFIRMED")
    const topFlags  = confirmed
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.name)

    return res.status(200).json({
      ticker:          quote.ticker,
      name:            quote.longName,
      sector:          quote.sector,
      industry:        quote.industry,
      market_cap:      quote.marketCap,
      price:           quote.currentPrice || quote.regularMarketPrice,
      composite_score: comp,
      risk_level:      risk,
      top_flags:       topFlags,
      signals,
      scanned_at:      new Date().toISOString(),
    })
  } catch (err) {
    console.error(`Scan error for ${ticker}:`, err)
    return res.status(500).json({ error: err.message || "Scan failed" })
  }
}
