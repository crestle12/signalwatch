// lib/signals.js
// All 12 failure signal scorers — pure JS, runs in Next.js API routes.
// Data shape mirrors what Yahoo Finance v8 returns via yfinance-compatible fetch.

export const SIGNAL_WEIGHTS = {
  1: 1.5, 2: 1.5, 3: 2.0, 4: 1.8, 5: 1.8,
  6: 1.2, 7: 1.3, 8: 1.0, 9: 1.0, 10: 0.8, 11: 1.0, 12: 0.7,
}

export const SIGNAL_META = [
  { id:1,  name:"Revenue growth stalling",   severity:"critical" },
  { id:2,  name:"Margin compression",        severity:"critical" },
  { id:3,  name:"Free cash flow collapse",   severity:"critical" },
  { id:4,  name:"Debt spiral",               severity:"critical" },
  { id:5,  name:"Accounting red flags",      severity:"critical" },
  { id:6,  name:"Insider selling surge",     severity:"high"     },
  { id:7,  name:"Management instability",    severity:"high"     },
  { id:8,  name:"Guidance language decay",   severity:"high"     },
  { id:9,  name:"Competitive moat erosion",  severity:"high"     },
  { id:10, name:"Rising short interest",     severity:"medium"   },
  { id:11, name:"Credit market warning",     severity:"medium"   },
  { id:12, name:"Industry disruption wave",  severity:"medium"   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(a, b) {
  if (!b || b === 0) return 0
  return (a - b) / Math.abs(b)
}

function result(id, verdict, score, detail) {
  const meta = SIGNAL_META.find(m => m.id === id)
  return { signal_id: id, name: meta.name, severity: meta.severity,
           verdict, score: Math.round(score * 10) / 10, detail }
}

function noData(id) {
  const meta = SIGNAL_META.find(m => m.id === id)
  return { signal_id: id, name: meta.name, severity: meta.severity,
           verdict: "NO_DATA", score: 0, detail: "Insufficient data" }
}

// ── 12 signal scorers ─────────────────────────────────────────────────────────

export function s1_revenueStalling(fin) {
  const revs = fin.annualRevenue?.filter(Boolean) ?? []
  if (revs.length < 3) return noData(1)
  const growths = revs.slice(0,-1).map((r,i) => pct(r, revs[i+1]))
  const g0 = growths[0]
  const decelerating = growths.length >= 2 && growths[0] < growths[1]

  if (g0 < -0.05)
    return result(1, "CONFIRMED", Math.min(10, 7 + Math.abs(g0)*20),
      `Revenue declining ${(g0*100).toFixed(1)}% YoY`)
  if (g0 < 0.03 && decelerating)
    return result(1, "CONFIRMED", 6, `Revenue near-stagnant (${(g0*100).toFixed(1)}%) with deceleration trend`)
  if (decelerating)
    return result(1, "PARTIAL", 3.5, `Growth slowing — currently ${(g0*100).toFixed(1)}% YoY`)
  return result(1, "ABSENT", 0, `Revenue growing ${(g0*100).toFixed(1)}% YoY`)
}

export function s2_marginCompression(fin) {
  const revs  = fin.annualRevenue    ?? []
  const gross = fin.annualGrossProfit ?? []
  const opInc = fin.annualOperatingIncome ?? []

  function margins(num, den) {
    return num.map((n,i) => (n && den[i]) ? n/den[i] : null).filter(x => x !== null)
  }
  const gm = margins(gross, revs)
  const om = margins(opInc,  revs)
  if (gm.length < 2) return noData(2)

  const gmDelta = gm[0] - gm[gm.length-1]
  const omDelta = om.length >= 2 ? om[0] - om[om.length-1] : 0
  let score = 0, flags = []

  if (gmDelta < -0.05) { score += 5; flags.push(`Gross margin compressed ${(gmDelta*100).toFixed(1)}%`) }
  else if (gmDelta < -0.02) { score += 3; flags.push(`Gross margin slipping ${(gmDelta*100).toFixed(1)}%`) }
  if (omDelta < -0.05) { score += 5; flags.push(`Op margin compressed ${(omDelta*100).toFixed(1)}%`) }
  else if (omDelta < -0.02) { score += 2; flags.push(`Op margin under pressure`) }

  score = Math.min(10, score)
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(2, verdict, score, flags.join("; ") || `Margins stable (GM ${(gm[0]*100).toFixed(1)}%)`)
}

export function s3_fcfCollapse(fin) {
  const ni   = fin.annualNetIncome       ?? []
  const ocf  = fin.annualOperatingCashFlow ?? []
  const capex= fin.annualCapEx           ?? []
  if (!ocf.length) return noData(3)

  const fcf0 = (ocf[0] ?? 0) + (capex[0] ?? 0)
  const fcf1 = ocf.length > 1 ? (ocf[1] ?? 0) + (capex[1] ?? 0) : fcf0
  const ni0  = ni[0] ?? 0
  const ocf0 = ocf[0] ?? 0

  let score = 0, flags = []
  if (ni0 > 0 && ocf0 < 0) { score += 7; flags.push("Net income positive but operating cash flow negative") }
  if (fcf0 < 0) { score += 3; flags.push(`FCF negative: $${(fcf0/1e6).toFixed(0)}M`) }
  if (fcf1 > 0 && fcf0 < fcf1 * 0.5) { score += 2; flags.push("FCF fell >50% year-over-year") }

  score = Math.min(10, score)
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(3, verdict, score, flags.join("; ") || `FCF healthy: $${(fcf0/1e6).toFixed(0)}M`)
}

export function s4_debtSpiral(fin) {
  const debt   = fin.annualTotalDebt       ?? []
  const ebitda = fin.annualEbitda          ?? []
  const ebit   = fin.annualOperatingIncome ?? []
  const intExp = fin.annualInterestExpense ?? []
  const revs   = fin.annualRevenue         ?? []

  const td0    = debt[0]   ?? 0
  const td1    = debt[1]   || 1
  const ebd    = ebitda[0] ?? 0
  const eb0    = ebit[0]   ?? 0
  const ie0    = Math.abs(intExp[0] ?? 0)
  const r0     = revs[0]   ?? 0
  const r1     = revs[1]   || 1

  let score = 0, flags = []

  if (ebd > 0) {
    const de = td0 / ebd
    if (de > 6)   { score += 5; flags.push(`Debt/EBITDA critical: ${de.toFixed(1)}x`) }
    else if (de > 4) { score += 3; flags.push(`Debt/EBITDA elevated: ${de.toFixed(1)}x`) }
    else if (de > 2.5) { score += 1; flags.push(`Debt/EBITDA rising: ${de.toFixed(1)}x`) }
  }
  if (ie0 > 0) {
    const cov = eb0 / ie0
    if (cov < 1)  { score += 5; flags.push(`Cannot cover interest: ${cov.toFixed(1)}x`) }
    else if (cov < 2) { score += 3; flags.push(`Weak coverage: ${cov.toFixed(1)}x`) }
    else if (cov < 3) { score += 1; flags.push(`Coverage tightening: ${cov.toFixed(1)}x`) }
  }
  const debtGrowth = pct(td0, td1)
  const revGrowth  = pct(r0, r1)
  if (debtGrowth > 0.2 && debtGrowth > revGrowth + 0.1)
    { score += 1; flags.push(`Debt growing ${(debtGrowth*100).toFixed(0)}% vs revenue ${(revGrowth*100).toFixed(0)}%`) }

  score = Math.min(10, score)
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(4, verdict, score, flags.join("; ") || "Debt levels manageable")
}

export function s5_accountingFlags(fin) {
  const rec  = fin.annualNetReceivables ?? []
  const inv  = fin.annualInventory      ?? []
  const revs = fin.annualRevenue        ?? []
  const gw   = fin.annualGoodwill       ?? []
  const ta   = fin.annualTotalAssets    ?? []

  if (rec.length < 2 || revs.length < 2) return noData(5)

  const recG = pct(rec[0], rec[1])
  const invG = inv.length >= 2 ? pct(inv[0], inv[1]) : 0
  const revG = pct(revs[0], revs[1])
  const gwPct= (ta[0] && gw[0]) ? gw[0]/ta[0] : 0

  let score = 0, flags = []
  if (recG > revG + 0.15) { score += 4; flags.push(`Receivables +${(recG*100).toFixed(0)}% vs revenue +${(revG*100).toFixed(0)}%`) }
  if (inv.length >= 2 && invG > revG + 0.2) { score += 3; flags.push(`Inventory buildup: +${(invG*100).toFixed(0)}% vs revenue +${(revG*100).toFixed(0)}%`) }
  if (gwPct > 0.5) { score += 3; flags.push(`Goodwill ${(gwPct*100).toFixed(0)}% of assets — impairment risk`) }
  else if (gwPct > 0.35) { score += 1; flags.push(`Goodwill elevated: ${(gwPct*100).toFixed(0)}% of assets`) }

  score = Math.min(10, score)
  const verdict = score >= 5 ? "CONFIRMED" : score >= 2 ? "PARTIAL" : "ABSENT"
  return result(5, verdict, score, flags.join("; ") || "No major accounting anomalies")
}

export function s6_insiderSelling(quote) {
  const held = quote.heldPercentInsiders
  if (held == null) return noData(6)
  const pct100 = held < 1 ? held * 100 : held
  let score = 0, detail = ""
  if (pct100 < 0.5)      { score = 7; detail = `Insiders hold only ${pct100.toFixed(1)}% — near-zero skin in game` }
  else if (pct100 < 2.0) { score = 4; detail = `Very low insider ownership: ${pct100.toFixed(1)}%` }
  else if (pct100 < 5.0) { score = 2; detail = `Below-average insider ownership: ${pct100.toFixed(1)}%` }
  else { detail = `Insider ownership healthy: ${pct100.toFixed(1)}%` }
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(6, verdict, score, detail)
}

export function s7_managementInstability(quote) {
  const audit = quote.auditRisk
  const comp  = quote.compensationRisk
  const board = quote.boardRisk
  if (audit == null) return noData(7)

  let score = 0, flags = []
  if (audit >= 8)      { score += 4; flags.push(`High audit risk: ${audit}/10`) }
  else if (audit >= 6) { score += 2; flags.push(`Elevated audit risk: ${audit}/10`) }
  if (comp  >= 8)      { score += 3; flags.push(`Compensation risk: ${comp}/10`) }
  if (board >= 8)      { score += 2; flags.push(`Board governance risk: ${board}/10`) }

  score = Math.min(10, score)
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(7, verdict, score, flags.join("; ") || `Governance acceptable (audit: ${audit})`)
}

export function s8_guidanceDecay(quote) {
  const rec     = quote.recommendationMean
  const current = quote.currentPrice || quote.regularMarketPrice || 0
  const target  = quote.targetMeanPrice || 0
  if (!rec || !current) return noData(8)

  let score = 0, flags = []
  if (rec >= 3.8)      { score += 5; flags.push(`Analyst consensus near sell (${rec.toFixed(1)}/5.0)`) }
  else if (rec >= 3.2) { score += 3; flags.push(`Analyst sentiment weakening (${rec.toFixed(1)}/5.0)`) }
  else if (rec >= 2.8) { score += 1; flags.push(`Mixed sentiment (${rec.toFixed(1)}/5.0)`) }

  if (target && current) {
    const upside = (target - current) / current
    if (upside < -0.10) { score += 4; flags.push(`Consensus target $${target.toFixed(0)} is ${Math.abs(upside*100).toFixed(0)}% BELOW current price`) }
    else if (upside < 0){ score += 2; flags.push(`Consensus target below current ($${target.toFixed(0)})`) }
  }
  score = Math.min(10, score)
  const verdict = score >= 5 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(8, verdict, score, flags.join("; ") || `Analyst sentiment neutral (${rec.toFixed(1)}/5.0)`)
}

export function s9_moatErosion(fin) {
  const revs  = fin.annualRevenue     ?? []
  const gross = fin.annualGrossProfit ?? []
  const rd    = fin.annualRdExpense   ?? []

  const margins = gross.map((g,i) => (g && revs[i]) ? g/revs[i] : null).filter(x => x !== null)
  if (margins.length < 3) return noData(9)

  const trend = margins[0] - margins[margins.length-1]
  let score = 0, flags = []

  if (trend < -0.08)      { score += 6; flags.push(`Pricing power eroding — GM down ${(trend*100).toFixed(1)}%`) }
  else if (trend < -0.04) { score += 3; flags.push(`Gross margin under pressure (${(trend*100).toFixed(1)}% trend)`) }
  else if (trend < -0.02) { score += 1; flags.push(`Slight margin erosion`) }

  if (rd.length >= 2 && revs[0] && revs[rd.length-1]) {
    const rdNow  = rd[0]  / revs[0]
    const rdPrev = rd[rd.length-1] / revs[rd.length-1]
    if (rdNow < rdPrev - 0.03) { score += 2; flags.push("R&D declining as % of revenue") }
  }
  score = Math.min(10, score)
  const verdict = score >= 5 ? "CONFIRMED" : score >= 2 ? "PARTIAL" : "ABSENT"
  return result(9, verdict, score, flags.join("; ") || `Moat intact (GM ${(margins[0]*100).toFixed(1)}%)`)
}

export function s10_shortInterest(quote) {
  const sp    = (quote.shortPercentOfFloat || 0) * 100
  const ratio = quote.shortRatio || 0
  if (!sp) return noData(10)

  let score = 0, detail = ""
  if (sp > 25)      { score = 9; detail = `Extreme short interest: ${sp.toFixed(1)}% of float` }
  else if (sp > 15) { score = 7; detail = `Very high short interest: ${sp.toFixed(1)}% of float` }
  else if (sp > 8)  { score = 4; detail = `Elevated short interest: ${sp.toFixed(1)}%` }
  else if (sp > 4)  { score = 2; detail = `Moderate short interest: ${sp.toFixed(1)}%` }
  else              { detail = `Low short interest: ${sp.toFixed(1)}%` }

  if (ratio > 10) { score = Math.min(10, score + 2); detail += ` — ${ratio.toFixed(0)} days to cover` }
  const verdict = score >= 6 ? "CONFIRMED" : score >= 3 ? "PARTIAL" : "ABSENT"
  return result(10, verdict, score, detail)
}

export function s11_creditWarning(fin) {
  const ebit   = fin.annualOperatingIncome ?? []
  const intExp = fin.annualInterestExpense ?? []
  const ca     = fin.annualCurrentAssets  ?? []
  const cl     = fin.annualCurrentLiabilities ?? []

  let score = 0, flags = []
  if (intExp[0] && Math.abs(intExp[0]) > 0) {
    const ie0  = Math.abs(intExp[0])
    const cov0 = (ebit[0] ?? 0) / ie0
    const ie1  = intExp[1] ? Math.abs(intExp[1]) : ie0
    const cov1 = ebit[1] ? (ebit[1] / ie1) : cov0

    if (cov0 < 1.0)      { score += 8; flags.push(`Cannot service debt (${cov0.toFixed(1)}x coverage)`) }
    else if (cov0 < 2.0) { score += 5; flags.push(`Dangerously low coverage: ${cov0.toFixed(1)}x`) }
    else if (cov0 < 3.0) { score += 3; flags.push(`Weak coverage: ${cov0.toFixed(1)}x`) }
    if (cov0 < cov1 - 1) { score += 1; flags.push(`Coverage deteriorating: ${cov1.toFixed(1)}x → ${cov0.toFixed(1)}x`) }
  }
  if (ca[0] && cl[0] && cl[0] > 0) {
    const cr = ca[0] / cl[0]
    if (cr < 1.0)      { score += 2; flags.push(`Current ratio below 1.0 — liquidity stress`) }
    else if (cr < 1.2) { score += 1; flags.push(`Current ratio tight: ${cr.toFixed(2)}`) }
  }
  score = Math.min(10, score)
  const verdict = score >= 5 ? "CONFIRMED" : score >= 2 ? "PARTIAL" : "ABSENT"
  return result(11, verdict, score, flags.join("; ") || "Credit position healthy")
}

export function s12_disruption(fin, quote) {
  const revs   = (fin.annualRevenue ?? []).filter(Boolean)
  const sector = quote.sector || ""
  const sga    = fin.annualSgaExpense ?? []

  const HIGH_RISK = new Set(["Communication Services","Consumer Cyclical",
                              "Consumer Defensive","Real Estate","Energy","Utilities"])
  let score = 0, flags = []

  if (revs.length >= 3) {
    const cagr = Math.pow(revs[0] / revs[revs.length-1], 1/(revs.length-1)) - 1
    if (cagr < -0.05)      { score += 5; flags.push(`Structural decline — ${(cagr*100).toFixed(1)}% CAGR`) }
    else if (cagr < 0.01)  { score += 2; flags.push(`Revenue stagnating — ${(cagr*100).toFixed(1)}% CAGR`) }
  }
  if (HIGH_RISK.has(sector)) { score += 2; flags.push(`High-disruption sector: ${sector}`) }
  if (sga.length >= 2 && fin.annualRevenue?.[0] && fin.annualRevenue?.[1]) {
    const sgaNow  = Math.abs(sga[0]) / fin.annualRevenue[0]
    const sgaPrev = Math.abs(sga[1]) / fin.annualRevenue[1]
    if (sgaNow > sgaPrev + 0.04) { score += 2; flags.push("SG&A growing faster than revenue") }
  }
  score = Math.min(10, score)
  const verdict = score >= 5 ? "CONFIRMED" : score >= 2 ? "PARTIAL" : "ABSENT"
  return result(12, verdict, score, flags.join("; ") || "No major disruption signals")
}

// ── Composite ─────────────────────────────────────────────────────────────────

export function compositeScore(signals) {
  let ws = 0, wt = 0
  for (const s of signals) {
    if (s.verdict === "NO_DATA") continue
    const w = SIGNAL_WEIGHTS[s.signal_id] ?? 1
    ws += s.score * w
    wt += 10 * w
  }
  return wt ? Math.round((ws / wt) * 100) / 10 : 0
}

export function riskLevel(score) {
  if (score >= 7.0) return "CRITICAL"
  if (score >= 5.0) return "HIGH"
  if (score >= 3.0) return "MEDIUM"
  return "LOW"
}

export function runAllSignals(fin, quote) {
  return [
    s1_revenueStalling(fin),
    s2_marginCompression(fin),
    s3_fcfCollapse(fin),
    s4_debtSpiral(fin),
    s5_accountingFlags(fin),
    s6_insiderSelling(quote),
    s7_managementInstability(quote),
    s8_guidanceDecay(quote),
    s9_moatErosion(fin),
    s10_shortInterest(quote),
    s11_creditWarning(fin),
    s12_disruption(fin, quote),
  ]
}
