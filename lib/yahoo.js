const AV_KEY  = process.env.ALPHAVANTAGE_API_KEY
const AV_BASE = "https://www.alphavantage.co/query"

async function avGet(params) {
  const url = new URL(AV_BASE)
  Object.entries({ ...params, apikey: AV_KEY }).forEach(([k,v]) => url.searchParams.set(k,v))
  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`AV error ${res.status}`)
  return res.json()
}

function extractAnnual(data, key) {
  if (!data?.annualReports) return []
  return data.annualReports.slice(0,5).map(r => {
    const v = r[key]
    if (!v || v === "None") return null
    return parseFloat(v)
  })
}

export async function fetchTickerData(ticker) {
  const t = ticker.toUpperCase()

  const [overview, income, balance, cashflow] = await Promise.all([
    avGet({ function: "OVERVIEW",                    symbol: t }),
    avGet({ function: "INCOME_STATEMENT",            symbol: t }),
    avGet({ function: "BALANCE_SHEET",               symbol: t }),
    avGet({ function: "CASH_FLOW",                   symbol: t }),
  ])

  if (overview?.Note || overview?.Information) {
    throw new Error("Alpha Vantage rate limit hit — try again in a minute")
  }

  const fin = {
    annualRevenue:            extractAnnual(income,   "totalRevenue"),
    annualGrossProfit:        extractAnnual(income,   "grossProfit"),
    annualOperatingIncome:    extractAnnual(income,   "operatingIncome"),
    annualNetIncome:          extractAnnual(income,   "netIncome"),
    annualEbitda:             extractAnnual(income,   "ebitda"),
    annualInterestExpense:    extractAnnual(income,   "interestExpense"),
    annualRdExpense:          extractAnnual(income,   "researchAndDevelopmentExpenses"),
    annualSgaExpense:         extractAnnual(income,   "sellingGeneralAndAdministrative"),
    annualTotalDebt:          extractAnnual(balance,  "shortLongTermDebtTotal"),
    annualNetReceivables:     extractAnnual(balance,  "currentNetReceivables"),
    annualInventory:          extractAnnual(balance,  "inventory"),
    annualGoodwill:           extractAnnual(balance,  "goodwill"),
    annualTotalAssets:        extractAnnual(balance,  "totalAssets"),
    annualCurrentAssets:      extractAnnual(balance,  "totalCurrentAssets"),
    annualCurrentLiabilities: extractAnnual(balance,  "totalCurrentLiabilities"),
    annualOperatingCashFlow:  extractAnnual(cashflow, "operatingCashflow"),
    annualCapEx:              extractAnnual(cashflow, "capitalExpenditures"),
  }

  const price  = parseFloat(overview.AnalystTargetPrice || 0)
  const target = parseFloat(overview.AnalystTargetPrice || 0)

  const quote = {
    ticker:              t,
    longName:            overview.Name        || t,
    sector:              overview.Sector      || "",
    industry:            overview.Industry    || "",
    marketCap:           parseFloat(overview.MarketCapitalization || 0),
    currentPrice:        parseFloat(overview["50DayMovingAverage"] || 0),
    shortPercentOfFloat: parseFloat(overview.ShortPercentOutstanding || 0),
    shortRatio:          parseFloat(overview.ShortRatio || 0),
    heldPercentInsiders: parseFloat(overview.PercentInsiders || 0) / 100,
    auditRisk:           null,
    boardRisk:           null,
    compensationRisk:    null,
    recommendationMean:  null,
    targetMeanPrice:     parseFloat(overview.AnalystTargetPrice || 0),
    regularMarketPrice:  parseFloat(overview["50DayMovingAverage"] || 0),
  }

  return { fin, quote }
}