// lib/yahoo.js
// Fetches financial data from Yahoo Finance's public JSON endpoints.
// No API key needed — same data yfinance uses under the hood.

const YF_BASE = "https://query2.finance.yahoo.com"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
}

async function yfFetch(url) {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Yahoo Finance error ${res.status} for ${url}`)
  return res.json()
}

// Map Yahoo Finance statement keys to our normalised field names
function extractAnnual(statements, key) {
  if (!statements?.length) return []
  return statements.map(s => {
    const val = s[key]?.raw ?? s[key]
    return typeof val === "number" ? val : null
  }).filter((v, i, arr) => i < 5) // max 5 years
}

export async function fetchTickerData(ticker) {
  const t = ticker.toUpperCase()

  // Fetch quote summary (financials + quote data in one call)
  const url = `${YF_BASE}/v10/finance/quoteSummary/${t}?modules=` +
    "incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory," +
    "defaultKeyStatistics,summaryDetail,financialData,recommendationTrend," +
    "assetProfile"

  const data = await yfFetch(url)
  const result = data?.quoteSummary?.result?.[0]
  if (!result) throw new Error(`No data returned for ${t}`)

  const inc  = result.incomeStatementHistory?.incomeStatementHistory   ?? []
  const bal  = result.balanceSheetHistory?.balanceSheetHistory          ?? []
  const cf   = result.cashflowStatementHistory?.cashflowStatementHistory ?? []
  const ks   = result.defaultKeyStatistics ?? {}
  const fd   = result.financialData        ?? {}
  const ap   = result.assetProfile         ?? {}
  const sd   = result.summaryDetail        ?? {}

  // Build normalised financials object
  const fin = {
    annualRevenue:           extractAnnual(inc, "totalRevenue"),
    annualGrossProfit:       extractAnnual(inc, "grossProfit"),
    annualOperatingIncome:   extractAnnual(inc, "operatingIncome"),
    annualNetIncome:         extractAnnual(inc, "netIncome"),
    annualEbitda:            extractAnnual(inc, "ebitda"),
    annualInterestExpense:   extractAnnual(inc, "interestExpense"),
    annualRdExpense:         extractAnnual(inc, "researchDevelopment"),
    annualSgaExpense:        extractAnnual(inc, "sellingGeneralAdministrative"),
    annualTotalDebt:         extractAnnual(bal, "totalDebt").length
                               ? extractAnnual(bal, "totalDebt")
                               : extractAnnual(bal, "longTermDebt"),
    annualNetReceivables:    extractAnnual(bal, "netReceivables"),
    annualInventory:         extractAnnual(bal, "inventory"),
    annualGoodwill:          extractAnnual(bal, "goodwill"),
    annualTotalAssets:       extractAnnual(bal, "totalAssets"),
    annualCurrentAssets:     extractAnnual(bal, "totalCurrentAssets"),
    annualCurrentLiabilities:extractAnnual(bal, "totalCurrentLiabilities"),
    annualOperatingCashFlow: extractAnnual(cf, "totalCashFromOperatingActivities"),
    annualCapEx:             extractAnnual(cf, "capitalExpenditures"),
  }

  // Quote object (mirrors what yfinance .info returns)
  const quote = {
    ticker:                 t,
    longName:               ap.longName || ks.longName || t,
    sector:                 ap.sector   || "",
    industry:               ap.industry || "",
    marketCap:              ks.marketCap?.raw ?? 0,
    currentPrice:           fd.currentPrice?.raw ?? sd.regularMarketPrice?.raw ?? 0,
    shortPercentOfFloat:    ks.shortPercentOfFloat?.raw ?? 0,
    shortRatio:             ks.shortRatio?.raw ?? 0,
    heldPercentInsiders:    ks.heldPercentInsiders?.raw ?? null,
    auditRisk:              ks.auditRisk ?? null,
    boardRisk:              ks.boardRisk ?? null,
    compensationRisk:       ks.compensationRisk ?? null,
    recommendationMean:     fd.recommendationMean?.raw ?? null,
    targetMeanPrice:        fd.targetMeanPrice?.raw ?? null,
    regularMarketPrice:     sd.regularMarketPrice?.raw ?? 0,
  }

  return { fin, quote }
}
