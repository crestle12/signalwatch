import { useState, useEffect, useRef, useCallback } from "react"
import Head from "next/head"

// ── Constants ─────────────────────────────────────────────────────────────────
const RC = { CRITICAL:"#e24b4a", HIGH:"#ef9f27", MEDIUM:"#378add", LOW:"#4b5363" }
const RB = { CRITICAL:"rgba(226,75,74,0.12)", HIGH:"rgba(239,159,39,0.12)",
             MEDIUM:"rgba(55,138,221,0.12)", LOW:"rgba(100,100,100,0.08)" }
const SC = { critical:"#e24b4a", high:"#ef9f27", medium:"#378add" }
const CACHE_KEY = "sw_scan_"
const CACHE_TTL = 6 * 60 * 60 * 1000  // 6 hours

function today() { return new Date().toISOString().split("T")[0] }

function fmtMcap(v) {
  if (!v) return "—"
  return v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskBadge({ risk, small }) {
  return (
    <span style={{
      fontFamily:"monospace", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase",
      fontSize: small ? 9 : 10, padding: small ? "2px 6px" : "4px 10px",
      borderRadius:3, background:RB[risk], color:RC[risk],
      border:`1px solid ${RC[risk]}30`,
    }}>{risk}</span>
  )
}

function ScoreMeter({ score, risk, size = 48 }) {
  const r = (size / 2) - 5
  const circ = 2 * Math.PI * r
  const fill = (score / 10) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RC[risk]} strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize:size/4, fontFamily:"monospace", fontWeight:700, fill:RC[risk] }}>
        {score?.toFixed(1)}
      </text>
    </svg>
  )
}

function SignalRow({ sig }) {
  const scoreColor = sig.score >= 7 ? "#e24b4a" : sig.score >= 4 ? "#ef9f27"
                   : sig.score >= 2 ? "#378add" : "#4b5363"
  const vc = {
    CONFIRMED:{ bg:"rgba(226,75,74,0.08)", c:"#e24b4a" },
    PARTIAL:  { bg:"rgba(239,159,39,0.08)", c:"#ef9f27" },
    ABSENT:   { bg:"rgba(74,222,128,0.06)", c:"#4ade80" },
    NO_DATA:  { bg:"rgba(100,100,100,0.08)", c:"#4b5363" },
  }[sig.verdict] || { bg:"rgba(100,100,100,0.08)", c:"#4b5363" }
  const leftC = sig.verdict === "CONFIRMED" ? (SC[sig.severity]||"#e24b4a")
              : sig.verdict === "PARTIAL"   ? "#3a3f4a" : "transparent"
  return (
    <div style={{ background:"#0e1015", border:"1px solid rgba(255,255,255,0.06)",
                  borderRadius:7, padding:"11px 14px", borderLeft:`3px solid ${leftC}` }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5, gap:8 }}>
        <span style={{ fontSize:12, fontWeight:500 }}>{sig.name}</span>
        <span style={{ fontFamily:"monospace", fontSize:8, fontWeight:700, letterSpacing:".06em",
                       padding:"2px 6px", borderRadius:3, textTransform:"uppercase",
                       background:vc.bg, color:vc.c }}>
          {sig.verdict.replace("_"," ")}
        </span>
      </div>
      <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.5, marginBottom:7 }}>{sig.detail}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${sig.score*10}%`, background:scoreColor, borderRadius:2 }} />
        </div>
        <span style={{ fontFamily:"monospace", fontSize:10, color:"#4b5363", width:28, textAlign:"right" }}>
          {sig.score?.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

function AnalysisPanel({ result, onClose }) {
  const [text,    setText]    = useState("")
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    setText(""); setLoading(true); setError(null)
    let cancelled = false

    fetch("/api/analyze", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ result }),
    }).then(async res => {
      if (!res.ok) throw new Error(await res.text())
      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      setLoading(false)
      while (true) {
        const { done, value } = await reader.read()
        if (done || cancelled) break
        setText(t => t + dec.decode(value))
        endRef.current?.scrollIntoView({ behavior:"smooth" })
      }
    }).catch(e => { if (!cancelled) setError(e.message); setLoading(false) })

    return () => { cancelled = true }
  }, [result.ticker])

  // Simple markdown-ish rendering
  function renderText(raw) {
    return raw.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return (
        <div key={i} style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                              letterSpacing:".1em", textTransform:"uppercase",
                              color:"#4b5363", marginTop:20, marginBottom:8,
                              paddingBottom:6, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          {line.slice(3)}
        </div>
      )
      if (line.startsWith("**") && line.endsWith("**")) return (
        <div key={i} style={{ fontWeight:600, color:"#e8eaf0", marginBottom:4 }}>
          {line.slice(2,-2)}
        </div>
      )
      if (line.startsWith("• ") || line.startsWith("- ")) return (
        <div key={i} style={{ color:"#9ca3af", fontSize:13, lineHeight:1.6,
                              paddingLeft:14, position:"relative", marginBottom:3 }}>
          <span style={{ position:"absolute", left:0, color:"#4b5363" }}>·</span>
          {line.slice(2)}
        </div>
      )
      if (!line.trim()) return <div key={i} style={{ height:6 }} />
      return <div key={i} style={{ color:"#9ca3af", fontSize:13, lineHeight:1.7, marginBottom:2 }}>{line}</div>
    })
  }

  return (
    <div style={{ background:"#111318", border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:10, overflow:"hidden", marginTop:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 16px", background:"rgba(255,255,255,0.03)",
                    borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                       letterSpacing:".1em", textTransform:"uppercase", color:"#4b5363" }}>
          Claude Analysis — {result.ticker}
        </span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#4b5363",
                                           cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>
      </div>
      <div style={{ padding:"16px 20px", maxHeight:480, overflowY:"auto" }}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:10, color:"#4b5363",
                        fontFamily:"monospace", fontSize:11 }}>
            <span style={{ animation:"pulse 1.5s infinite" }}>◆</span> Analyzing {result.ticker}...
          </div>
        )}
        {error && <div style={{ color:"#e24b4a", fontSize:12, fontFamily:"monospace" }}>Error: {error}</div>}
        {text && renderText(text)}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [scanData,  setScanData]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [filter,    setFilter]    = useState("ALL")
  const [search,    setSearch]    = useState("")
  const [showAnalysis, setShowAnalysis] = useState(false)

  // ── Single ticker scan ────────────────────────────────────────────────────
  const [singleTicker, setSingleTicker] = useState("")
  const [scanning, setScanning]         = useState(false)

  async function scanTicker(ticker) {
    if (!ticker.trim()) return
    setScanning(true); setError(null)
    try {
      const res  = await fetch(`/api/scan?ticker=${ticker.trim().toUpperCase()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSelected(data)
      setShowAnalysis(false)
      // Add to scan results if not present
      setScanData(prev => {
        if (!prev) return { scan_date: today(), total_scanned:1, results:[data] }
        const exists = prev.results.find(r => r.ticker === data.ticker)
        const results = exists
          ? prev.results.map(r => r.ticker === data.ticker ? data : r)
          : [data, ...prev.results]
        return { ...prev, results }
      })
    } catch(e) {
      setError(e.message)
    } finally {
      setScanning(false)
    }
  }

  // ── Full watchlist scan ───────────────────────────────────────────────────
  async function runFullScan(force = false) {
    const cacheKey = CACHE_KEY + today()
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) { setScanData(JSON.parse(cached)); return }
      } catch {}
    }
    setLoading(true); setError(null)
    try {
      const res  = await fetch("/api/scan-all")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setScanData(data)
      try { localStorage.setItem(cacheKey, JSON.stringify(data)) } catch {}
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runFullScan() }, [])

  const results = (scanData?.results || []).filter(r => {
    if (filter !== "ALL" && r.risk_level !== filter) return false
    const q = search.toUpperCase()
    if (q && !r.ticker.includes(q) && !r.name?.toUpperCase().includes(q)) return false
    return true
  })

  const critical = (scanData?.results||[]).filter(r=>r.risk_level==="CRITICAL").length
  const high     = (scanData?.results||[]).filter(r=>r.risk_level==="HIGH").length

  return (
    <>
      <Head>
        <title>SignalWatch — Failure Signal Scanner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0a0b0d; color:#e8eaf0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#0a0b0d; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        tr:hover td { background:rgba(255,255,255,0.02) !important; }
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>

        {/* ── Topbar ── */}
        <div style={{ borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"13px 28px",
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      background:"#0e1015", flexWrap:"wrap", gap:12, position:"sticky",
                      top:0, zIndex:100 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:14 }}>📉</span>
            <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700,
                           letterSpacing:".1em", textTransform:"uppercase" }}>SignalWatch</span>
            {scanData && (
              <span style={{ fontFamily:"monospace", fontSize:10, color:"#4b5363",
                             marginLeft:8, letterSpacing:".04em" }}>
                {scanData.scan_date} · {scanData.total_scanned} companies
              </span>
            )}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {/* Single ticker search */}
            <div style={{ display:"flex", gap:0 }}>
              <input
                value={singleTicker}
                onChange={e => setSingleTicker(e.target.value)}
                onKeyDown={e => e.key==="Enter" && scanTicker(singleTicker)}
                placeholder="Scan any ticker..."
                style={{ fontFamily:"monospace", fontSize:11, padding:"6px 12px",
                         border:"1px solid rgba(255,255,255,0.12)", borderRight:"none",
                         borderRadius:"4px 0 0 4px", background:"#181b22",
                         color:"#e8eaf0", outline:"none", width:160 }}
              />
              <button onClick={() => scanTicker(singleTicker)} disabled={scanning}
                style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                         letterSpacing:".06em", padding:"6px 12px",
                         border:"1px solid rgba(255,255,255,0.12)", borderRadius:"0 4px 4px 0",
                         background:scanning?"#181b22":"#e8eaf0", color:scanning?"#4b5363":"#0a0b0d",
                         cursor:scanning?"not-allowed":"pointer" }}>
                {scanning ? "..." : "SCAN"}
              </button>
            </div>
            <button onClick={() => runFullScan(true)} disabled={loading}
              style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                       letterSpacing:".06em", padding:"6px 14px", borderRadius:4,
                       border:"1px solid rgba(255,255,255,0.12)", background:"transparent",
                       color:loading?"#4b5363":"#9ca3af", cursor:loading?"not-allowed":"pointer" }}>
              {loading ? "SCANNING..." : "↻ REFRESH"}
            </button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        {scanData && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)",
                        borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
            {[["Total Scanned", scanData.total_scanned, "#e8eaf0"],
              ["Critical Risk", critical, "#e24b4a"],
              ["High Risk",     high,     "#ef9f27"],
              ["Scan Date",     scanData.scan_date, "#378add"]
            ].map(([label, val, color]) => (
              <div key={label} style={{ padding:"14px 24px",
                                        borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontFamily:"monospace", fontSize:9, fontWeight:700,
                              letterSpacing:".1em", textTransform:"uppercase",
                              color:"#4b5363", marginBottom:5 }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:600, color }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Main two-column layout ── */}
        <div style={{ display:"flex", flex:1, minHeight:0 }}>

          {/* Left — results list */}
          <div style={{ width: selected ? "420px" : "100%", flexShrink:0,
                        borderRight: selected ? "1px solid rgba(255,255,255,0.07)" : "none",
                        overflow:"auto", transition:"width .2s" }}>

            {/* Filters */}
            <div style={{ padding:"12px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)",
                          display:"flex", gap:6, flexWrap:"wrap", alignItems:"center",
                          position:"sticky", top:0, background:"#0a0b0d", zIndex:10 }}>
              <span style={{ fontFamily:"monospace", fontSize:9, color:"#4b5363",
                             letterSpacing:".1em", textTransform:"uppercase" }}>Filter</span>
              {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  fontFamily:"monospace", fontSize:9, fontWeight:700, letterSpacing:".06em",
                  padding:"3px 9px", borderRadius:3, cursor:"pointer",
                  border:`1px solid ${filter===f?"#e8eaf0":"rgba(255,255,255,0.1)"}`,
                  background: filter===f?"#e8eaf0":"transparent",
                  color: filter===f?"#0a0b0d":"#6b7280",
                }}>{f}</button>
              ))}
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search..." style={{
                  marginLeft:4, fontFamily:"monospace", fontSize:11, padding:"3px 9px",
                  borderRadius:3, border:"1px solid rgba(255,255,255,0.1)",
                  background:"#111318", color:"#e8eaf0", width:120, outline:"none",
                }} />
            </div>

            {/* Loading */}
            {loading && !scanData && (
              <div style={{ padding:60, textAlign:"center", color:"#4b5363",
                            fontFamily:"monospace", fontSize:11 }}>
                <div style={{ fontSize:20, marginBottom:12, animation:"spin 2s linear infinite",
                              display:"inline-block" }}>◈</div>
                <div>SCANNING WATCHLIST...</div>
                <div style={{ marginTop:6, fontSize:10 }}>This takes about 30 seconds</div>
              </div>
            )}

            {error && (
              <div style={{ margin:20, padding:14, background:"rgba(226,75,74,0.08)",
                            border:"1px solid rgba(226,75,74,0.2)", borderRadius:6,
                            color:"#e24b4a", fontSize:12, fontFamily:"monospace" }}>
                Error: {error}
              </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead style={{ position:"sticky", top:44, zIndex:5 }}>
                  <tr style={{ background:"#0e1015", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                    {["#","Ticker","Company","Score","Risk","Top Signals"].map(h => (
                      <th key={h} style={{ padding:"8px 14px", textAlign:"left",
                                           fontFamily:"monospace", fontSize:9, fontWeight:700,
                                           letterSpacing:".08em", textTransform:"uppercase",
                                           color:"#4b5363" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const isActive = selected?.ticker === r.ticker
                    return (
                      <tr key={r.ticker} onClick={() => {
                            setSelected(r); setShowAnalysis(false)
                          }}
                        style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer",
                                 background: isActive ? "rgba(55,138,221,0.07)" : "transparent",
                                 borderLeft: isActive ? "2px solid #378add" : "2px solid transparent" }}>
                        <td style={{ padding:"11px 14px", fontFamily:"monospace",
                                     fontSize:10, color:"#4b5363" }}>{i+1}</td>
                        <td style={{ padding:"11px 14px", fontFamily:"monospace",
                                     fontWeight:700, fontSize:13 }}>{r.ticker}</td>
                        <td style={{ padding:"11px 14px", color:"#9ca3af", maxWidth:180,
                                     overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {r.name}
                        </td>
                        <td style={{ padding:"11px 14px" }}>
                          <ScoreMeter score={r.composite_score} risk={r.risk_level} size={38} />
                        </td>
                        <td style={{ padding:"11px 14px" }}>
                          <RiskBadge risk={r.risk_level} small />
                        </td>
                        <td style={{ padding:"11px 14px", fontSize:11, color:"#6b7280",
                                     maxWidth:240, overflow:"hidden", textOverflow:"ellipsis",
                                     whiteSpace:"nowrap" }}>
                          {(r.top_flags||[]).join(" · ")}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {!loading && results.length === 0 && scanData && (
              <div style={{ padding:40, textAlign:"center", color:"#4b5363",
                            fontFamily:"monospace", fontSize:11 }}>
                No results match your filters.
              </div>
            )}
          </div>

          {/* Right — detail panel */}
          {selected && (
            <div style={{ flex:1, overflow:"auto", padding:"24px 28px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                            marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontFamily:"monospace", fontSize:24, fontWeight:700 }}>
                    {selected.ticker}
                  </span>
                  <RiskBadge risk={selected.risk_level} />
                </div>
                <button onClick={() => setSelected(null)} style={{
                  background:"none", border:"none", color:"#4b5363", cursor:"pointer",
                  fontSize:18, lineHeight:1
                }}>✕</button>
              </div>

              <div style={{ fontSize:14, color:"#9ca3af", marginBottom:6 }}>{selected.name}</div>
              <div style={{ display:"flex", gap:20, marginBottom:24, flexWrap:"wrap" }}>
                {[["Sector", selected.sector], ["Market Cap", fmtMcap(selected.market_cap)],
                  ["Price", `$${selected.price?.toFixed(2)}`],
                  ["Signals Fired", `${(selected.signals||[]).filter(s=>s.verdict==="CONFIRMED").length}/12`]
                ].map(([l,v]) => (
                  <div key={l}>
                    <div style={{ fontFamily:"monospace", fontSize:9, fontWeight:700,
                                  letterSpacing:".1em", textTransform:"uppercase",
                                  color:"#4b5363", marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Score + top flags */}
              <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
                <div style={{ background:"#111318", border:"1px solid rgba(255,255,255,0.07)",
                              borderRadius:10, padding:"16px 20px", display:"flex",
                              alignItems:"center", gap:14, flex:1, minWidth:200 }}>
                  <ScoreMeter score={selected.composite_score} risk={selected.risk_level} size={64} />
                  <div>
                    <div style={{ fontFamily:"monospace", fontSize:9, fontWeight:700,
                                  letterSpacing:".1em", textTransform:"uppercase",
                                  color:"#4b5363", marginBottom:6 }}>Composite Score</div>
                    <div style={{ fontSize:12, color:RC[selected.risk_level], fontWeight:500 }}>
                      {selected.risk_level} RISK
                    </div>
                  </div>
                </div>
                {(selected.top_flags||[]).length > 0 && (
                  <div style={{ background:"#111318", border:"1px solid rgba(255,255,255,0.07)",
                                borderRadius:10, padding:"16px 20px", flex:2, minWidth:200 }}>
                    <div style={{ fontFamily:"monospace", fontSize:9, fontWeight:700,
                                  letterSpacing:".1em", textTransform:"uppercase",
                                  color:"#4b5363", marginBottom:10 }}>Top Flags</div>
                    {selected.top_flags.map(f => (
                      <div key={f} style={{ fontSize:12, color:"#e24b4a", marginBottom:5,
                                            display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ color:"#e24b4a", fontSize:8 }}>▲</span> {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Claude Analysis button */}
              <div style={{ marginBottom:20 }}>
                <button onClick={() => setShowAnalysis(v => !v)} style={{
                  fontFamily:"monospace", fontSize:11, fontWeight:700, letterSpacing:".06em",
                  textTransform:"uppercase", padding:"10px 20px", borderRadius:6,
                  border:"none", background: showAnalysis ? "#2a2f3a" : "#378add",
                  color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:8,
                }}>
                  {showAnalysis ? "✕ Hide Analysis" : "⚡ Analyze with Claude"}
                </button>
              </div>

              {showAnalysis && (
                <AnalysisPanel result={selected} onClose={() => setShowAnalysis(false)} />
              )}

              {/* 12 signals */}
              <div style={{ fontFamily:"monospace", fontSize:10, fontWeight:700,
                            letterSpacing:".1em", textTransform:"uppercase", color:"#4b5363",
                            marginBottom:14, paddingBottom:8, marginTop: showAnalysis ? 20 : 0,
                            borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                12-Signal Breakdown
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(290px,1fr))",
                            gap:8 }}>
                {(selected.signals||[]).map(sig => <SignalRow key={sig.signal_id} sig={sig} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
