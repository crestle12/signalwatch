// lib/yahoo.js
// Fetches fundamental data from Yahoo Finance via yahoo-finance2.
// No API key needed. Uses fundamentalsTimeSeries for financials
// and quoteSummary for quote/profile data.

import YahooFinance from "yahoo-finance2"

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] })

function fiveYearsAgo() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 6)
  return d.toISOString().split("T")[0]
}

export async function fetchTickerData(ticker) {
  const t = ticker.toUpperCase()

  const [timeSeries, summary] = await Promise.all([
    yf.fundamentalsTimeSeries(t, {
      period1: fiveYearsAgo(),
      period2: new Date().toISOString().split("T")[0],
      type: "annual",
      module: "all",
    }),
    yf.quoteSummary(t, {
      modules: [
        "price",
        "defaultKeyStatistics",
        "assetProfile",
        "financialData",
      ],
    }),
  ])

  // Sort most recent first
  const rows = timeSeries
    .filter(r => r.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)

  function extract(key) {
    return rows.map(r => {
      const v = r[key]
      if (v == null) return null
      return typeof v === "number" ? v : parseFloat(v)
    })
  }

  const fin = {
    annualRevenue:            extract("totalRevenue"),
    annualGrossProfit:        extract("grossProfit"),
    annualOperatingIncome:    extract("operatingIncome"),
    annualNetIncome:          extract("netIncome"),
    annualEbitda:             extract("EBITDA"),
    annualInterestExpense:    extract("interestExpense"),
    annualRdExpense:          extract("researchAndDevelopment"),
    annualSgaExpense:         extract("sellingGeneralAndAdministration"),
    annualTotalDebt:          extract("totalDebt"),
    annualNetReceivables:     extract("receivables"),
    annualInventory:          extract("inventory"),
    annualGoodwill:           extract("goodwill"),
    annualTotalAssets:        extract("totalAssets"),
    annualCurrentAssets:      extract("currentAssets"),
    annualCurrentLiabilities: extract("currentLiabilities"),
    annualOperatingCashFlow:  extract("operatingCashFlow"),
    annualCapEx:              extract("capitalExpenditure"),
  }

  const price    = summary.price ?? {}
  const keyStats = summary.defaultKeyStatistics ?? {}
  const finData  = summary.financialData ?? {}
  const profile  = summary.assetProfile ?? {}

  const quote = {
    ticker:              t,
    longName:            price.longName || price.shortName || t,
    sector:              profile.sector || "",
    industry:            profile.industry || "",
    marketCap:           price.marketCap || 0,
    currentPrice:        finData.currentPrice || price.regularMarketPrice || 0,
    shortPercentOfFloat: keyStats.shortPercentOfFloat || 0,
    shortRatio:          keyStats.shortRatio || 0,
    heldPercentInsiders: keyStats.heldPercentInsiders || 0,
    auditRisk:           profile.auditRisk ?? null,
    boardRisk:           profile.boardRisk ?? null,
    compensationRisk:    profile.compensationRisk ?? null,
    recommendationMean:  finData.recommendationMean ?? null,
    targetMeanPrice:     finData.targetMeanPrice || 0,
    regularMarketPrice:  price.regularMarketPrice || 0,
  }

  return { fin, quote }
}
