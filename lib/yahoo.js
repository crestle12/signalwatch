// lib/yahoo.js
// Fetches financial data from Financial Modeling Prep (FMP) free API.

const FMP_KEY  = process.env.FMP_API_KEY
const FMP_BASE = "https://financialmodelingprep.com/api/v3"

async function fmpGet(path) {
  const url = `${FMP_BASE}${path}&apikey=${FMP_KEY}`
  const res  = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`FMP error ${res.status} for ${path}`)
  return res.json()
}

export async function fetchTickerData(ticker) {
  const t = ticker.toUpperCase()

  const [profile, income, balance, cashflow] = await Promise.all([
    fmpGet(`/profile/${t}?`),
    fmpGet(`/income-statement/${t}?limit=5&`),
    fmpGet(`/balance-sheet-statement/${t}?limit=5&`),
    fmpGet(`/cash-flow-statement/${t}?limit=5&`),
  ])

  const p = profile?.[0] || {}

  function extract(arr, key) {
    return (arr || []).map(r => {
      const v = r[key]
      return typeof v === "number" ? v : null
    })
  }

  const fin = {
    annualRevenue:            extract(income,   "revenue"),
    annualGrossProfit:        extract(income,   "grossProfit"),
    annualOperatingIncome:    extract(income,   "operatingIncome"),
    annualNetIncome:          extract(income,   "netIncome"),
    annualEbitda:             extract(income,   "ebitda"),
    annualInterestExpense:    extract(income,   "interestExpense"),
    annualRdExpense:          extract(income,   "researchAndDevelopmentExpenses"),
    annualSgaExpense:         extract(income,   "sellingGeneralAndAdministrativeExpenses"),
    annualTotalDebt:          extract(balance,  "totalDebt"),
    annualNetReceivables:     extract(balance,  "netReceivables"),
    annualInventory:          extract(balance,  "inventory"),
    annualGoodwill:           extract(balance,  "goodwill"),
    annualTotalAssets:        extract(balance,  "totalAssets"),
    annualCurrentAssets:      extract(balance,  "totalCurrentAssets"),
    annualCurrentLiabilities: extract(balance,  "totalCurrentLiabilities"),
    annualOperatingCashFlow:  extract(cashflow, "operatingCashFlow"),
    annualCapEx:              extract(cashflow, "capitalExpenditure"),
  }

  const quote = {
    ticker:              t,
    longName:            p.companyName || t,
    sector:              p.sector      || "",
    industry:            p.industry    || "",
    marketCap:           p.mktCap      || 0,
    currentPrice:        p.price       || 0,
    shortPercentOfFloat: 0,
    shortRatio:          0,
    heldPercentInsiders: null,
    auditRisk:           null,
    boardRisk:           null,
    compensationRisk:    null,
    recommendationMean:  null,
    targetMeanPrice:     null,
    regularMarketPrice:  p.price || 0,
  }

  return { fin, quote }
}