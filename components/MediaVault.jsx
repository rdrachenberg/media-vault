"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchMovies, getMovieDetails, aiLookup } from "@/lib/api";
import { STAR_WARS_SEED } from "@/lib/seed-data";

const FORMATS = ["All", "DVD", "Blu-ray", "VHS", "4K UHD"];
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// ── Visual Helpers ──────────────────────────────────────────────────────────
const ScanLine = () => <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)", pointerEvents: "none", zIndex: 1 }} />;

const FilmGrain = () => <div style={{ position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents: "none", zIndex: 9999, opacity: 0.5 }} />;

function PosterImage({ url, title, size = "card" }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const h = size === "detail" ? 280 : 180;
  useEffect(() => { setFailed(false); setLoaded(false); }, [url]);

  return (
    <div style={{ height: h, overflow: "hidden", position: "relative", borderBottom: "1px solid rgba(245,197,24,0.1)", background: "#0a0a14" }}>
      {(!url || failed || !loaded) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size === "detail" ? 72 : 48, background: "linear-gradient(135deg, rgba(245,197,24,0.05), rgba(0,0,0,0.3))" }}>
          <ScanLine />{["🎬", "📼", "🎞️", "🎥", "🎭", "🍿"][Math.abs(title?.charCodeAt(0) || 0) % 6]}
        </div>
      )}
      {url && !failed && (
        <>
          <img src={url} alt={title} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 0.9 : 0, transition: "opacity 0.4s ease" }} />
          {loaded && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(transparent, rgba(10,10,20,0.8))" }} />}
        </>
      )}
    </div>
  );
}

// ── AI Loading ──────────────────────────────────────────────────────────────
function AILoadingOverlay({ query }) {
  const [dots, setDots] = useState("");
  const [phase, setPhase] = useState(0);
  const phases = ["Searching the web", "Finding movie details", "Locating poster art", "Assembling data"];
  useEffect(() => {
    const a = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    const b = setInterval(() => setPhase(p => (p + 1) % 4), 2200);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 20 }}>
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(245,197,24,0.2)", borderTop: "2px solid #f5c518", borderRadius: "50%", animation: "aiSpin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 8, border: "2px solid rgba(245,197,24,0.1)", borderBottom: "2px solid #f5c518", borderRadius: "50%", animation: "aiSpin 1.5s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🤖</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#f5c518", fontSize: 13, margin: 0, letterSpacing: 1 }}>{phases[phase]}{dots}</p>
        <p style={{ color: "#555", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>"{query}"</p>
      </div>
    </div>
  );
}

// ── Barcode Scanner ─────────────────────────────────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("Initializing camera...");
  const [hasCamera, setHasCamera] = useState(true);
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); setStatus("Point camera at barcode..."); }
      } catch { if (!cancelled) { setHasCamera(false); setStatus("Camera unavailable — enter UPC manually"); } }
    })();
    return () => { cancelled = true; if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  useEffect(() => {
    if (!("BarcodeDetector" in window) || !hasCamera) return;
    let active = true;
    const detector = new BarcodeDetector({ formats: ["ean_13", "upc_a", "ean_8", "upc_e"] });
    const interval = setInterval(async () => {
      if (!active || !videoRef.current || videoRef.current.readyState !== 4) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
          clearInterval(interval);
          onDetected(barcodes[0].rawValue);
        }
      } catch { }
    }, 300);
    return () => { active = false; clearInterval(interval); };
  }, [hasCamera, onDetected]);

  const cleanup = () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  const submit = () => { const c = code.trim(); if (c.length >= 8) { cleanup(); onDetected(c); } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <button onClick={() => { cleanup(); onClose(); }} style={{ position: "absolute", top: 20, right: 20, background: "none", border: "1px solid #ff4444", color: "#ff4444", padding: "8px 16px", cursor: "pointer", fontSize: 14, fontFamily: "inherit", letterSpacing: 2 }}>✕ Close</button>
      {hasCamera && (
        <div style={{ position: "relative", width: "90%", maxWidth: 500, aspectRatio: "4/3", borderRadius: 4, overflow: "hidden", border: "2px solid #f5c518" }}>
          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />
          <div style={{ position: "absolute", inset: "20%", border: "2px solid #f5c518", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#f5c518", animation: "scanPulse 2s ease-in-out infinite" }} />
          </div>
        </div>
      )}
      <p style={{ color: "#f5c518", marginTop: 20, fontSize: 14, letterSpacing: 1 }}>{status}</p>
      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Enter UPC manually"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #444", color: "#f5c518", padding: "10px 16px", fontSize: 16, width: 220, fontFamily: "inherit", borderRadius: 4, outline: "none" }} />
        <button onClick={submit} style={{ background: "#f5c518", color: "#0a0a0a", border: "none", padding: "10px 20px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, borderRadius: 4 }}>LOOKUP</button>
      </div>
    </div>
  );
}

// ── Media Card ──────────────────────────────────────────────────────────────
function MediaCard({ item, onClick, index }) {
  const fc = { "DVD": "#c084fc", "Blu-ray": "#38bdf8", "VHS": "#f97316", "4K UHD": "#22d3ee" }[item.format] || "#aaa";
  return (
    <div onClick={() => onClick(item)} style={{
      background: "linear-gradient(145deg,#1a1a2e,#16213e)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: 6,
      cursor: "pointer", transition: "all 0.3s ease", animation: `fadeSlideIn 0.4s ease ${index * 0.04}s both`, overflow: "hidden",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "rgba(245,197,24,0.5)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(245,197,24,0.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(245,197,24,0.15)"; e.currentTarget.style.boxShadow = "none"; }}>
      <PosterImage url={item.poster_url} title={item.title} size="card" />
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ background: fc, color: "#000", fontSize: 9, padding: "2px 8px", borderRadius: 3, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>{item.format}</span>
          <span style={{ background: "rgba(255,255,255,0.08)", color: "#999", fontSize: 9, padding: "2px 8px", borderRadius: 3, letterSpacing: 1 }}>{item.year}</span>
        </div>
        <h3 style={{ color: "#e8e8e8", fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4, fontFamily: "'Anybody',sans-serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</h3>
        <p style={{ color: "#666", fontSize: 10, margin: "6px 0 0", letterSpacing: 0.5 }}>{item.collection}</p>
      </div>
    </div>
  );
}

// ── Detail Modal ────────────────────────────────────────────────────────────
function DetailModal({ item, onClose, onDelete }) {
  if (!item) return null;
  const fc = { "DVD": "#c084fc", "Blu-ray": "#38bdf8", "VHS": "#f97316", "4K UHD": "#22d3ee" }[item.format] || "#aaa";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "linear-gradient(160deg,#1a1a2e,#0f0f23)", border: "1px solid rgba(245,197,24,0.25)", borderRadius: 10, maxWidth: 480, width: "100%", overflow: "hidden", animation: "modalIn 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <PosterImage url={item.poster_url} title={item.title} size="detail" />
        <div style={{ padding: "24px 28px 28px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ background: fc, color: "#000", fontSize: 10, padding: "3px 10px", borderRadius: 3, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>{item.format}</span>
            <span style={{ background: "rgba(255,255,255,0.08)", color: "#aaa", fontSize: 10, padding: "3px 10px", borderRadius: 3 }}>{item.rating}</span>
            <span style={{ background: "rgba(255,255,255,0.05)", color: "#777", fontSize: 10, padding: "3px 10px", borderRadius: 3 }}>{item.runtime} min</span>
          </div>
          <h2 style={{ color: "#f5c518", fontSize: 20, fontWeight: 700, margin: "0 0 4px", fontFamily: "'Anybody',sans-serif", lineHeight: 1.3 }}>{item.title}</h2>
          <p style={{ color: "#666", fontSize: 11, margin: "0 0 16px" }}>{item.year} · {item.director} · {item.collection}</p>
          {item.synopsis && <p style={{ color: "#999", fontSize: 12, lineHeight: 1.7, margin: "0 0 16px", borderLeft: "2px solid rgba(245,197,24,0.3)", paddingLeft: 14 }}>{item.synopsis}</p>}
          {item.cast && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#555", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Cast</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {item.cast.split(",").map((n, i) => <span key={i} style={{ background: "rgba(255,255,255,0.05)", color: "#bbb", fontSize: 11, padding: "4px 10px", borderRadius: 20 }}>{n.trim()}</span>)}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", fontSize: 12, marginBottom: 20 }}>
            {[["Genre", item.genre], ["UPC", item.upc]].map(([l, v]) => <div key={l}><div style={{ color: "#555", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>{l}</div><div style={{ color: "#ccc" }}>{v}</div></div>)}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.3)", color: "#f5c518", padding: "10px", cursor: "pointer", borderRadius: 4, fontSize: 12, letterSpacing: 1 }}>CLOSE</button>
            <button onClick={() => onDelete(item.upc)} style={{ flex: 1, background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.3)", color: "#ff4444", padding: "10px", cursor: "pointer", borderRadius: 4, fontSize: 12, letterSpacing: 1 }}>REMOVE</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Modal ───────────────────────────────────────────────────────────────
function AddModal({ onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("tmdb");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [format, setFormat] = useState("Blu-ray");
  const [upc, setUpc] = useState("");
  const abortRef = useRef(null);
  const fs = { background: "rgba(255,255,255,0.05)", border: "1px solid #333", color: "#e8e8e8", padding: "8px 12px", fontSize: 13, width: "100%", fontFamily: "inherit", borderRadius: 4, outline: "none", boxSizing: "border-box" };

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults([]); setSelected(null);
    try {
      if (mode === "tmdb") {
        const r = await searchMovies(query.trim());
        if (r.length === 0) setError("No results. Try AI Search instead.");
        else setResults(r.slice(0, 8));
      } else {
        abortRef.current = new AbortController();
        const r = await aiLookup(query.trim(), abortRef.current.signal);
        if (r.found === false) setError(r.suggestion || "Not found.");
        else setSelected(r);
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Search failed.");
    }
    setLoading(false);
  };

  const selectResult = async (movie) => {
    setLoading(true);
    try {
      const detail = await getMovieDetails(movie.id);
      setSelected(detail);
    } catch (err) { setError(err.message || "Failed to load details"); }
    setLoading(false);
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd({
      upc: upc || Date.now().toString(), title: selected.title,
      year: parseInt(selected.year) || new Date().getFullYear(), format,
      director: selected.director || "Unknown", runtime: selected.runtime || 0,
      genre: selected.genre || "", rating: selected.rating || "NR",
      synopsis: selected.synopsis || "", cast: selected.cast || "",
      poster_url: selected.poster_url || "", collection: selected.collection || "Standalone",
      tmdb_id: selected.tmdb_id || null,
    });
  };

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "linear-gradient(160deg,#1a1a2e,#0f0f23)", border: "1px solid rgba(245,197,24,0.25)", borderRadius: 10, maxWidth: 520, width: "100%", animation: "modalIn 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header + mode toggle */}
        <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
          <h2 style={{ color: "#f5c518", fontFamily: "'Anybody',sans-serif", margin: "0 0 12px", fontSize: 20 }}>Add Movie</h2>
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: 3 }}>
            {[["tmdb", "🎬 TMDB"], ["ai", "🤖 AI Search"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setResults([]); setSelected(null); setError(null); }}
                style={{ flex: 1, background: mode === m ? "rgba(245,197,24,0.2)" : "transparent", border: mode === m ? "1px solid rgba(245,197,24,0.3)" : "1px solid transparent", color: mode === m ? "#f5c518" : "#666", padding: "6px 12px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, borderRadius: 3, transition: "all 0.2s" }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 28px" }}>
          {/* Search bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && doSearch()}
              placeholder={mode === "tmdb" ? "Search by title..." : "Describe the movie..."} style={{ ...fs, flex: 1, fontSize: 14, padding: "10px 14px" }} autoFocus />
            <button onClick={doSearch} disabled={loading || !query.trim()}
              style={{ background: loading ? "#333" : "#f5c518", color: loading ? "#666" : "#0a0a0a", border: "none", padding: "10px 20px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, borderRadius: 4, whiteSpace: "nowrap" }}>
              {loading ? "..." : "SEARCH"}
            </button>
          </div>

          {loading && mode === "ai" && <AILoadingOverlay query={query} />}
          {loading && mode === "tmdb" && <div style={{ textAlign: "center", padding: 30 }}><div style={{ width: 28, height: 28, margin: "0 auto", border: "2px solid rgba(245,197,24,0.2)", borderTop: "2px solid #f5c518", borderRadius: "50%", animation: "aiSpin 1s linear infinite" }} /><p style={{ color: "#666", fontSize: 11, marginTop: 12 }}>Searching TMDB...</p></div>}
          {error && <div style={{ background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: 6, padding: "14px 16px", marginBottom: 16 }}><p style={{ color: "#ff6b6b", fontSize: 12, margin: 0 }}>{error}</p></div>}

          {/* TMDB poster grid */}
          {results.length > 0 && !selected && !loading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 10, marginBottom: 16 }}>
              {results.map(r => (
                <div key={r.id} onClick={() => selectResult(r)} style={{ cursor: "pointer", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(245,197,24,0.1)", transition: "all 0.2s", background: "#0f0f23" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,197,24,0.4)"; e.currentTarget.style.transform = "scale(1.03)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(245,197,24,0.1)"; e.currentTarget.style.transform = "scale(1)"; }}>
                  {r.poster_url ? <img src={r.poster_url} alt={r.title} style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, background: "rgba(245,197,24,0.05)" }}>🎬</div>}
                  <div style={{ padding: "6px 8px" }}>
                    <p style={{ color: "#ccc", fontSize: 10, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>{r.title}</p>
                    <p style={{ color: "#555", fontSize: 9, margin: "2px 0 0" }}>{(r.release_date || "").slice(0, 4)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected movie preview */}
          {selected && !loading && (
            <div style={{ background: "rgba(245,197,24,0.04)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "flex" }}>
                <div style={{ width: 120, minHeight: 160, flexShrink: 0, background: "#0a0a14" }}>
                  {selected.poster_url ? <img src={selected.poster_url} alt={selected.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🎬</div>}
                </div>
                <div style={{ padding: "14px 16px", flex: 1, minWidth: 0 }}>
                  <h3 style={{ color: "#f5c518", fontSize: 15, fontWeight: 700, margin: "0 0 4px", fontFamily: "'Anybody',sans-serif", lineHeight: 1.3 }}>{selected.title}</h3>
                  <p style={{ color: "#888", fontSize: 11, margin: "0 0 8px" }}>{selected.year} · {selected.director}</p>
                  <p style={{ color: "#666", fontSize: 11, margin: "0 0 8px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{selected.synopsis}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[selected.genre, selected.rating, selected.runtime && `${selected.runtime}m`].filter(Boolean).map((t, i) => <span key={i} style={{ background: "rgba(255,255,255,0.06)", color: "#999", fontSize: 9, padding: "2px 8px", borderRadius: 3 }}>{t}</span>)}
                  </div>
                  {selected.cast && <p style={{ color: "#555", fontSize: 10, margin: "8px 0 0" }}>{selected.cast}</p>}
                </div>
              </div>
              <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(245,197,24,0.1)", display: "flex", gap: 10, alignItems: "center" }}>
                <select value={format} onChange={e => setFormat(e.target.value)} style={{ ...fs, width: "auto", flex: "0 0 auto", cursor: "pointer", padding: "6px 10px", fontSize: 11 }}>
                  {["DVD", "Blu-ray", "VHS", "4K UHD"].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input type="text" value={upc} onChange={e => setUpc(e.target.value.replace(/\D/g, ""))} placeholder="UPC (optional)" style={{ ...fs, flex: 1, padding: "6px 10px", fontSize: 11 }} />
                <button onClick={handleAdd} style={{ background: "#f5c518", color: "#0a0a0a", border: "none", padding: "8px 18px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, borderRadius: 4, whiteSpace: "nowrap" }}>ADD TO VAULT</button>
              </div>
            </div>
          )}

          {!loading && !selected && results.length === 0 && !error && (
            <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>{mode === "tmdb" ? "🎬" : "🔍"}</div>
              <p style={{ fontSize: 11, letterSpacing: 1, color: "#444" }}>{mode === "tmdb" ? "Search TMDB for any movie" : "Type a title — Claude searches the web"}</p>
            </div>
          )}
        </div>
        <div style={{ padding: "16px 28px", borderTop: "1px solid rgba(245,197,24,0.06)", display: "flex", justifyContent: "space-between" }}>
          {selected && <button onClick={() => { setSelected(null); setResults([]); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 11, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, padding: 0 }}>← BACK</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #333", color: "#888", padding: "8px 20px", cursor: "pointer", borderRadius: 4, fontSize: 11, letterSpacing: 1 }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function MediaVault() {
  const [library, setLibrary] = useState(STAR_WARS_SEED);
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("All");
  const [collectionFilter, setCollectionFilter] = useState("All");
  const [scanning, setScanning] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [sortBy, setSortBy] = useState("year");
  const [enriching, setEnriching] = useState(false);

  const showToast = useCallback((msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }, []);

  // Auto-fetch poster URLs for seed items on mount
  useEffect(() => {
    let cancelled = false;
    async function enrichPosters() {
      // Deduplicate by tmdb_id so we don't fetch the same movie twice
      const needPosters = [];
      const seenIds = new Set();
      for (const item of STAR_WARS_SEED) {
        if (!item.poster_url && item.tmdb_id && !seenIds.has(item.tmdb_id)) {
          seenIds.add(item.tmdb_id);
          needPosters.push(item);
        }
      }
      if (needPosters.length === 0) return;
      setEnriching(true);
      const posterMap = {}; // tmdb_id -> poster_url
      // Fetch in parallel batches of 4 to be polite to the API
      for (let i = 0; i < needPosters.length; i += 4) {
        const batch = needPosters.slice(i, i + 4);
        const results = await Promise.allSettled(
          batch.map(item =>
            getMovieDetails(item.tmdb_id).then(d => ({ tmdb_id: item.tmdb_id, poster_url: d.poster_url }))
          )
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.poster_url) {
            posterMap[r.value.tmdb_id] = r.value.poster_url;
          }
        }
      }
      if (cancelled) return;
      // Update library with fetched poster URLs
      setLibrary(prev => prev.map(item => {
        if (!item.poster_url && item.tmdb_id && posterMap[item.tmdb_id]) {
          return { ...item, poster_url: posterMap[item.tmdb_id] };
        }
        return item;
      }));
      setEnriching(false);
    }
    enrichPosters();
    return () => { cancelled = true; };
  }, []);
  const collections = ["All", ...new Set(library.map(m => m.collection))];

  const filtered = library.filter(m => {
    const q = search.toLowerCase();
    return (!search || m.title.toLowerCase().includes(q) || m.director.toLowerCase().includes(q) || m.upc.includes(search) || m.collection.toLowerCase().includes(q) || (m.cast || "").toLowerCase().includes(q))
      && (formatFilter === "All" || m.format === formatFilter) && (collectionFilter === "All" || m.collection === collectionFilter);
  }).sort((a, b) => sortBy === "year" ? b.year - a.year : sortBy === "title" ? a.title.localeCompare(b.title) : b.runtime - a.runtime);

  const handleBarcodeScan = (code) => { setScanning(false); const f = library.find(m => m.upc === code); if (f) { setSelectedItem(f); showToast(`Found: ${f.title}`, "success"); } else { showToast(`UPC ${code} not found — add it`, "warning"); setShowAddModal(true); } };
  const handleAdd = (item) => { if (library.find(m => m.upc === item.upc)) { showToast("Duplicate UPC", "warning"); return; } setLibrary(prev => [...prev, item]); setShowAddModal(false); showToast(`Added: ${item.title}`, "success"); };
  const handleDelete = (upc) => { const i = library.find(m => m.upc === upc); setLibrary(prev => prev.filter(m => m.upc !== upc)); setSelectedItem(null); showToast(`Removed: ${i?.title}`, "info"); };

  const stats = { total: library.length, dvd: library.filter(m => m.format === "DVD").length, bluray: library.filter(m => m.format === "Blu-ray").length, vhs: library.filter(m => m.format === "VHS").length, runtime: library.reduce((a, m) => a + m.runtime, 0) };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#0a0a14,#0d0d1a 50%,#0a0a14)", position: "relative" }}>
      <FilmGrain />

      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 2000, padding: "10px 24px", borderRadius: 6, background: toast.type === "success" ? "#065f46" : toast.type === "warning" ? "#78350f" : "#1e293b", border: `1px solid ${toast.type === "success" ? "#10b981" : toast.type === "warning" ? "#f59e0b" : "#475569"}`, color: "#fff", fontSize: 13, letterSpacing: 0.5, animation: "toastIn 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>{toast.msg}</div>}

      {enriching && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1500, height: 3, background: "rgba(245,197,24,0.1)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: "30%", background: "#f5c518", borderRadius: 2, animation: "enrichSlide 1.2s ease-in-out infinite" }} />
          <style>{`@keyframes enrichSlide { 0% { transform: translateX(-100%) } 100% { transform: translateX(433%) } }`}</style>
        </div>
      )}

      <header style={{ padding: "32px 24px 24px", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ fontFamily: "'Anybody',sans-serif", fontSize: 32, fontWeight: 900, margin: 0, color: "#f5c518", letterSpacing: -1, animation: "flicker 4s infinite", textShadow: "0 0 20px rgba(245,197,24,0.3)" }}>MEDIA VAULT</h1>
              <p style={{ color: "#555", fontSize: 11, margin: "4px 0 0", letterSpacing: 3, textTransform: "uppercase" }}>AI-Powered Physical Media Catalog</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setScanning(true)} style={{ background: "#f5c518", color: "#0a0a0a", border: "none", padding: "10px 20px", fontSize: 12, cursor: "pointer", fontWeight: 700, letterSpacing: 1.5, borderRadius: 4, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>⊞</span> SCAN</button>
              <button onClick={() => setShowAddModal(true)} style={{ background: "linear-gradient(135deg,rgba(245,197,24,0.15),rgba(245,197,24,0.05))", color: "#f5c518", border: "1px solid rgba(245,197,24,0.3)", padding: "10px 20px", fontSize: 12, cursor: "pointer", fontWeight: 700, letterSpacing: 1.5, borderRadius: 4, display: "flex", alignItems: "center", gap: 8 }}>+ ADD</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 20, flexWrap: "wrap" }}>
            {[["Total", stats.total, "#f5c518"], ["DVD", stats.dvd, "#c084fc"], ["Blu-ray", stats.bluray, "#38bdf8"], ["VHS", stats.vhs, "#f97316"], ["Hours", Math.floor(stats.runtime / 60), "#22d3ee"]].map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ color: c, fontSize: 20, fontWeight: 700, fontFamily: "'Anybody',sans-serif" }}>{v}</span>
                <span style={{ color: "#555", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(245,197,24,0.06)", background: "rgba(0,0,0,0.2)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, director, cast, UPC..."
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #222", color: "#e8e8e8", padding: "8px 14px", fontSize: 13, flex: "1 1 200px", minWidth: 180, borderRadius: 4, outline: "none" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FORMATS.map(f => <button key={f} onClick={() => setFormatFilter(f)} style={{ background: formatFilter === f ? "rgba(245,197,24,0.2)" : "rgba(255,255,255,0.03)", border: `1px solid ${formatFilter === f ? "rgba(245,197,24,0.4)" : "#222"}`, color: formatFilter === f ? "#f5c518" : "#666", padding: "6px 12px", fontSize: 10, cursor: "pointer", letterSpacing: 1, borderRadius: 3 }}>{f}</button>)}
          </div>
          <select value={collectionFilter} onChange={e => setCollectionFilter(e.target.value)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #222", color: "#aaa", padding: "7px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}>
            {collections.map(c => <option key={c} value={c}>{c === "All" ? "All Collections" : c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #222", color: "#aaa", padding: "7px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer" }}>
            <option value="year">Sort: Year</option><option value="title">Sort: Title</option><option value="runtime">Sort: Runtime</option>
          </select>
        </div>
      </div>

      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#444" }}><div style={{ fontSize: 48, marginBottom: 16 }}>📼</div><p style={{ fontSize: 14, letterSpacing: 1 }}>No titles found</p></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 16 }}>
            {filtered.map((item, i) => <MediaCard key={item.upc} item={item} onClick={setSelectedItem} index={i} />)}
          </div>
        )}
      </main>

      {scanning && <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setScanning(false)} />}
      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} onDelete={handleDelete} />}
      {showAddModal && <AddModal onAdd={handleAdd} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
