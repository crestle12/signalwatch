// pages/api/analyze.js
// Streams a Claude forensic analysis for a given scan result.
// Uses the Anthropic SDK with streaming so the UI updates in real time.

import Anthropic from "@anthropic-ai/sdk"

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const { result } = req.body
  if (!result) return res.status(400).json({ error: "result required" })

  const confirmed = (result.signals || []).filter(s => s.verdict === "CONFIRMED")
  const partial   = (result.signals || []).filter(s => s.verdict === "PARTIAL")
  const mcap = result.market_cap >= 1e9
    ? `$${(result.market_cap/1e9).toFixed(1)}B`
    : `$${(result.market_cap/1e6).toFixed(0)}M`

  const prompt = `You are a forensic equity analyst and experienced short-seller with 20+ years of experience identifying deteriorating public companies before they collapse.

Analyze this company based on automated signal scoring from public financial data:

**${result.ticker} — ${result.name}**
Sector: ${result.sector} | Market Cap: ${mcap} | Price: $${result.price?.toFixed(2)}
Composite Failure Score: ${result.composite_score?.toFixed(1)}/10 (${result.risk_level} RISK)

**CONFIRMED SIGNALS (${confirmed.length}):**
${confirmed.map(s => `• [${s.name.toUpperCase()}] Score ${s.score}/10 — ${s.detail}`).join("\n") || "None confirmed"}

**PARTIAL SIGNALS (${partial.length}):**
${partial.map(s => `• [${s.name.toUpperCase()}] Score ${s.score}/10 — ${s.detail}`).join("\n") || "None"}

Based on this data and your knowledge of ${result.ticker}'s business:

## 1. What's actually going on
In 2-3 sentences, explain the core business deterioration story in plain English — what is actually breaking and why.

## 2. The 3 most likely catalysts (6-18 months)
List the specific events or data points that would trigger a price decline. Be concrete — mention upcoming earnings dates, debt maturities, market share dynamics, or regulatory risks specific to this company.

## 3. Where the bodies are buried
What are the 2-3 things most investors are overlooking or underestimating about this company's problems?

## 4. The bear case price target
Give a realistic downside scenario with a price target and the assumptions behind it.

## 5. What would kill the short thesis
What specific news or data would invalidate this short thesis? Be honest — what is the biggest risk to being short?

## 6. Overall conviction
Rate: LOW / MEDIUM / HIGH / VERY HIGH — and justify it in one sentence.

Be direct, specific, and opinionated. This is for personal research, not a public report.`

  // Set up streaming response
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Transfer-Encoding", "chunked")

  try {
    const stream = await client.messages.stream({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages:   [{ role: "user", content: prompt }],
    })

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        res.write(chunk.delta.text)
      }
    }
    res.end()
  } catch (err) {
    console.error("Claude API error:", err)
    res.status(500).end("Analysis failed: " + err.message)
  }
}
