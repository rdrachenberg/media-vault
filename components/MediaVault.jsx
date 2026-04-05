"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchMovies, getMovieDetails, aiLookup, lookupUPC } from "@/lib/api";
import { STAR_WARS_SEED } from "@/lib/seed-data";

const FORMATS = ["All", "DVD", "Blu-ray", "VHS", "4K UHD"];
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// ── Visual Helpers ──────────────────────────────────────────────────────────
const ScanLine = () => <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)", pointerEvents: "none", zIndex: 1 }} />;

const FilmGrain = () => <div style={{ position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents: "none", zIndex: 9999, opacity: 0.5 }} />;

// ── Poster Image with retry ─────────────────────────────────────────────────
function PosterImage({ url, title, size = "card" }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retries, setRetries] = useState(0);
  const h = size === "detail" ? 280 : 180;

  useEffect(() => { setFailed(false); setLoaded(false); setRetries(0); }, [url]);

  const handleError = () => {
    if (retries < 2) {
      // Retry after a delay — mobile connections sometimes fail on first try
      setTimeout(() => setRetries(r => r + 1), 1000 * (retries + 1));
    } else {
      setFailed(true);
    }
  };

  // Build URL with cache-bust on retry
  const imgSrc = url ? (retries > 0 ? `${url}?r=${retries}` : url) : null;

  return (
    <div style={{ height: h, overflow: "hidden", position: "relative", borderBottom: "1px solid rgba(245,197,24,0.1)", background: "#0a0a14" }}>
      {(!url || failed || !loaded) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size === "detail" ? 72 : 48, background: "linear-gradient(135deg, rgba(245,197,24,0.05), rgba(0,0,0,0.3))" }}>
          <ScanLine />{["🎬", "📼", "🎞️", "🎥", "🎭", "🍿"][Math.abs(title?.charCodeAt(0) || 0) % 6]}
        </div>
      )}
      {imgSrc && !failed && (
        <>
          <img
            key={retries}
            src={imgSrc}
            alt={title}
            crossOrigin="anonymous"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 0.9 : 0, transition: "opacity 0.4s ease" }}
          />
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

// ── Barcode Scanner (Quagga2 — purpose-built for 1D barcodes) ────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const scannerContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const quaggaRunning = useRef(false);
  const hasDetected = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState("Initializing camera...");
  const [code, setCode] = useState("");
  const [detected, setDetected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(true);

  // Keep ref in sync without re-triggering effects
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  // Force-stop everything
  const forceStop = useCallback(() => {
    try {
      if (quaggaRunning.current) {
        import("@ericblade/quagga2").then(({ default: Quagga }) => {
          try { Quagga.stop(); } catch {}
          try { Quagga.offDetected(); } catch {}
        }).catch(() => {});
        quaggaRunning.current = false;
      }
    } catch {}
    // Also kill any leftover video streams
    try {
      const videos = document.querySelectorAll("#barcode-scanner-viewport video");
      videos.forEach(v => {
        if (v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
      });
    } catch {}
  }, []);

  // Close handler — guaranteed to work
  const handleClose = useCallback(() => {
    forceStop();
    onClose();
  }, [forceStop, onClose]);

  // Live scanner with Quagga2
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { default: Quagga } = await import("@ericblade/quagga2");
        if (!mounted) return;

        await new Promise((resolve, reject) => {
          Quagga.init({
            inputStream: {
              name: "Live",
              type: "LiveStream",
              target: document.getElementById("barcode-scanner-viewport"),
              constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader",
                "upc_e_reader",
                "code_128_reader",
                "code_39_reader",
              ],
              multiple: false,
            },
            locate: true,
            frequency: 10,
          }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        if (!mounted) return;

        Quagga.start();
        quaggaRunning.current = true;

        Quagga.onDetected((result) => {
          if (hasDetected.current) return;
          const barcode = result?.codeResult?.code;
          if (!barcode) return;

          // Quagga2 confidence check — require multiple matching digits
          const format = result?.codeResult?.format;
          const validFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];
          if (!validFormats.includes(format)) return;

          hasDetected.current = true;
          setDetected(true);
          setStatus(`Detected: ${barcode}`);

          try { Quagga.stop(); quaggaRunning.current = false; } catch {}
          setTimeout(() => onDetectedRef.current(barcode), 500);
        });

        if (mounted) setStatus("Scanning — hold 6–10 inches from barcode");

      } catch (err) {
        if (mounted) {
          setLiveAvailable(false);
          setStatus("Live scanner unavailable — use 📷 or type UPC");
        }
      }
    })();

    return () => {
      mounted = false;
      forceStop();
    };
  }, [forceStop]);

  // Photo capture — decode barcode from a photo taken with native camera
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setStatus("Analyzing photo...");

    try {
      const { default: Quagga } = await import("@ericblade/quagga2");

      // Convert file to data URL for Quagga
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await new Promise((resolve) => {
        Quagga.decodeSingle({
          src: dataUrl,
          numOfWorkers: 0,
          decoder: {
            readers: [
              "ean_reader",
              "ean_8_reader",
              "upc_reader",
              "upc_e_reader",
              "code_128_reader",
              "code_39_reader",
            ],
          },
          locate: true,
          locator: { patchSize: "large", halfSample: false },
        }, (res) => resolve(res));
      });

      if (result?.codeResult?.code) {
        setDetected(true);
        setStatus(`Detected: ${result.codeResult.code}`);
        forceStop();
        setTimeout(() => onDetectedRef.current(result.codeResult.code), 500);
      } else {
        setStatus("No barcode found — try holding phone further back");
      }
    } catch (err) {
      setStatus("Scan failed — try a clearer photo");
    }
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    const c = code.trim();
    if (c.length >= 8) { forceStop(); onDetectedRef.current(c); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0a0a14", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Space Mono', monospace", overflowY: "auto" }}>
      {/* Close button — high z-index, absolute top-right, always clickable */}
      <button onClick={handleClose} style={{
        position: "fixed", top: 16, right: 16, zIndex: 9999,
        background: "rgba(0,0,0,0.8)", border: "2px solid #ff4444", color: "#ff4444",
        padding: "10px 20px", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
        letterSpacing: 2, borderRadius: 6, backdropFilter: "blur(4px)",
        WebkitTapHighlightColor: "rgba(255,68,68,0.3)",
      }}>✕ CLOSE</button>

      {/* Live scanner viewport */}
      <div style={{
        width: "100%", maxWidth: 500, aspectRatio: "4/3", position: "relative",
        overflow: "hidden", border: `2px solid ${detected ? "#10b981" : "#f5c518"}`,
        borderRadius: 8, marginTop: 60, background: "#000",
        transition: "border-color 0.3s",
      }}>
        <div id="barcode-scanner-viewport" ref={scannerContainerRef} style={{
          width: "100%", height: "100%", position: "relative",
        }} />
        {/* Scanning guide overlay */}
        {!detected && liveAvailable && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: "80%", height: "30%", border: "2px solid rgba(245,197,24,0.5)",
              borderRadius: 4, boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
            }} />
          </div>
        )}
        {detected && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, animation: "fadeSlideIn 0.3s ease" }}>
            <div style={{ background: "#10b981", color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>✓ SCANNED</div>
          </div>
        )}
      </div>

      {/* Status */}
      <p style={{ color: detected ? "#10b981" : "#f5c518", marginTop: 16, fontSize: 13, letterSpacing: 1, textAlign: "center", padding: "0 20px" }}>{status}</p>

      {/* Photo capture — most reliable on iPhone */}
      {!detected && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={processing}
            style={{
              background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.4)",
              color: "#38bdf8", padding: "12px 28px", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: 1.5, borderRadius: 6,
              display: "flex", alignItems: "center", gap: 10, opacity: processing ? 0.5 : 1,
              WebkitTapHighlightColor: "rgba(56,189,248,0.2)",
            }}>
            {processing ? (
              <><div style={{ width: 14, height: 14, border: "2px solid rgba(56,189,248,0.3)", borderTop: "2px solid #38bdf8", borderRadius: "50%", animation: "aiSpin 1s linear infinite" }} /> ANALYZING...</>
            ) : (
              <>📷 TAKE PHOTO (best for iPhone)</>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: "none" }} />
          <p style={{ color: "#444", fontSize: 9, letterSpacing: 0.5, textAlign: "center", maxWidth: 280, lineHeight: 1.5, margin: 0 }}>
            Opens your camera app — take a focused photo of the barcode
          </p>
        </div>
      )}

      {/* Manual UPC entry */}
      <div style={{ marginTop: 20, display: "flex", gap: 8, padding: "0 20px" }}>
        <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={e => e.key === "Enter" && submit()} placeholder="Type UPC numbers"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #444", color: "#f5c518", padding: "10px 16px", fontSize: 16, width: 220, fontFamily: "inherit", borderRadius: 4, outline: "none" }} />
        <button onClick={submit} style={{ background: "#f5c518", color: "#0a0a0a", border: "none", padding: "10px 20px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, borderRadius: 4 }}>LOOKUP</button>
      </div>

      {/* Quagga2 injects canvas/video, style them */}
      <style>{`
        #barcode-scanner-viewport video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #barcode-scanner-viewport canvas.drawingBuffer { display: none !important; }
      `}</style>
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
function AddModal({ onAdd, onClose, initialUpc }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState(initialUpc ? "ai" : "tmdb");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [format, setFormat] = useState("Blu-ray");
  const [upc, setUpc] = useState(initialUpc || "");
  const abortRef = useRef(null);
  const autoSearched = useRef(false);
  const fs = { background: "rgba(255,255,255,0.05)", border: "1px solid #333", color: "#e8e8e8", padding: "8px 12px", fontSize: 13, width: "100%", fontFamily: "inherit", borderRadius: 4, outline: "none", boxSizing: "border-box" };

  const doSearch = async (searchQuery) => {
    const q = (searchQuery || query).trim();
    if (!q) return;
    setLoading(true); setError(null); setResults([]); setSelected(null);
    try {
      if (mode === "tmdb") {
        const r = await searchMovies(q);
        if (r.length === 0) setError("No results. Try AI Search instead.");
        else setResults(r.slice(0, 8));
      } else {
        abortRef.current = new AbortController();
        const r = await aiLookup(q, abortRef.current.signal);
        if (r.found === false) { setError(r.suggestion || "Not found."); }
        else {
          // AI found the movie — now enrich with TMDB poster
          let enriched = { ...r };
          if (r.title) {
            try {
              // Search TMDB by the title AI returned
              const tmdbResults = await searchMovies(r.title);
              if (tmdbResults.length > 0) {
                // Find best match by year if available
                const yearMatch = r.year ? tmdbResults.find(m => m.release_date?.startsWith(String(r.year))) : null;
                const best = yearMatch || tmdbResults[0];
                // Grab poster from TMDB (always reliable)
                if (best.poster_url) enriched.poster_url = best.poster_url;
                // Also fetch full TMDB details for any missing fields
                if (best.id) {
                  try {
                    const details = await getMovieDetails(best.id);
                    if (details.poster_url && !enriched.poster_url) enriched.poster_url = details.poster_url;
                    if (!enriched.director && details.director) enriched.director = details.director;
                    if (!enriched.cast && details.cast) enriched.cast = details.cast;
                    if (!enriched.synopsis && details.synopsis) enriched.synopsis = details.synopsis;
                    if (!enriched.collection || enriched.collection === "Standalone") enriched.collection = details.collection;
                    enriched.tmdb_id = details.tmdb_id;
                  } catch { /* TMDB detail fetch failed, AI data is still fine */ }
                }
              }
            } catch { /* TMDB search failed, AI data is still fine */ }
          }
          setSelected(enriched);
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "Search failed.");
    }
    setLoading(false);
  };

  // Auto-search when opened with a scanned UPC
  useEffect(() => {
    if (!initialUpc || autoSearched.current) return;
    autoSearched.current = true;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setQuery(`Looking up UPC ${initialUpc}...`);

      try {
        // Step 1: UPC → product title → TMDB (all server-side)
        const result = await lookupUPC(initialUpc);

        if (cancelled) return;

        if (result.found) {
          // Got full movie data with poster from TMDB
          setSelected(result);
          setQuery(result.title);
          setLoading(false);
          return;
        }

        // UPC found a product but no TMDB match — clean the title and try TMDB
        if (result.product_title) {
          // Client-side cleanup in case server missed something
          const cleaned = result.product_title
            .replace(/^(blu[- ]?ray|dvd|4k|uhd|vhs)\s*[-:]\s*/gi, "")
            .replace(/\s*[&/\-]\s*(sealed|new|used)\s*$/gi, "")
            .replace(/\b(blu[- ]?ray|dvd|4k|uhd|widescreen|fullscreen)\b/gi, "")
            .replace(/\[.*?\]|\(.*?\)/g, "")
            .replace(/\s+/g, " ").trim();
          
          setQuery(cleaned);
          setMode("tmdb");
          try {
            const tmdbResults = await searchMovies(cleaned);
            if (!cancelled && tmdbResults.length > 0) {
              setResults(tmdbResults.slice(0, 8));
              setLoading(false);
              return;
            }
          } catch { /* fall through */ }
        }

        // Nothing worked — let user search manually
        if (!cancelled) {
          setQuery("");
          setMode("tmdb");
          setError(result.suggestion || `UPC ${initialUpc} not found. Search by movie title instead.`);
        }
      } catch (err) {
        if (!cancelled) {
          setQuery("");
          setMode("tmdb");
          setError(`Lookup failed — search by movie title instead.`);
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [initialUpc]);

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
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && doSearch()}
              placeholder={mode === "tmdb" ? "Search by title..." : "Describe the movie or paste UPC..."} style={{ ...fs, flex: 1, fontSize: 14, padding: "10px 14px" }} autoFocus />
            <button onClick={() => doSearch()} disabled={loading || !query.trim()}
              style={{ background: loading ? "#333" : "#f5c518", color: loading ? "#666" : "#0a0a0a", border: "none", padding: "10px 20px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, borderRadius: 4, whiteSpace: "nowrap" }}>
              {loading ? "..." : "SEARCH"}
            </button>
          </div>
          {loading && mode === "ai" && !initialUpc && <AILoadingOverlay query={query} />}
          {loading && (mode === "tmdb" || initialUpc) && <div style={{ textAlign: "center", padding: 30 }}><div style={{ width: 28, height: 28, margin: "0 auto", border: "2px solid rgba(245,197,24,0.2)", borderTop: "2px solid #f5c518", borderRadius: "50%", animation: "aiSpin 1s linear infinite" }} /><p style={{ color: "#666", fontSize: 11, marginTop: 12 }}>{initialUpc ? `Looking up UPC ${initialUpc}...` : "Searching TMDB..."}</p></div>}
          {error && <div style={{ background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: 6, padding: "14px 16px", marginBottom: 16 }}><p style={{ color: "#ff6b6b", fontSize: 12, margin: 0 }}>{error}</p></div>}

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
  const [scannedUpc, setScannedUpc] = useState(null);
  const [toast, setToast] = useState(null);
  const [sortBy, setSortBy] = useState("year");
  const [enriching, setEnriching] = useState(false);

  const showToast = useCallback((msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }, []);

  // Auto-fetch poster URLs for seed items on mount — sequential for reliability
  useEffect(() => {
    let cancelled = false;
    async function enrichPosters() {
      const seenIds = new Set();
      const toFetch = [];
      for (const item of STAR_WARS_SEED) {
        if (!item.poster_url && item.tmdb_id && !seenIds.has(item.tmdb_id)) {
          seenIds.add(item.tmdb_id);
          toFetch.push(item);
        }
      }
      if (toFetch.length === 0) return;
      setEnriching(true);
      const posterMap = {};

      // Fetch one at a time — more reliable on mobile connections
      for (const item of toFetch) {
        if (cancelled) break;
        try {
          const detail = await getMovieDetails(item.tmdb_id);
          if (detail?.poster_url) {
            posterMap[item.tmdb_id] = detail.poster_url;
            // Update library incrementally so posters appear as they load
            if (!cancelled) {
              setLibrary(prev => prev.map(m =>
                !m.poster_url && m.tmdb_id === item.tmdb_id ? { ...m, poster_url: detail.poster_url } : m
              ));
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch poster for ${item.title}:`, err);
          // Retry once after a short delay
          try {
            await new Promise(r => setTimeout(r, 1000));
            const detail = await getMovieDetails(item.tmdb_id);
            if (detail?.poster_url && !cancelled) {
              posterMap[item.tmdb_id] = detail.poster_url;
              setLibrary(prev => prev.map(m =>
                !m.poster_url && m.tmdb_id === item.tmdb_id ? { ...m, poster_url: detail.poster_url } : m
              ));
            }
          } catch { /* give up on this one */ }
        }
      }
      if (!cancelled) setEnriching(false);
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

  const handleBarcodeScan = (code) => { setScanning(false); const f = library.find(m => m.upc === code); if (f) { setSelectedItem(f); showToast(`Found: ${f.title}`, "success"); } else { setScannedUpc(code); showToast(`UPC ${code} — searching...`, "info"); setShowAddModal(true); } };
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
      {showAddModal && <AddModal onAdd={handleAdd} onClose={() => { setShowAddModal(false); setScannedUpc(null); }} initialUpc={scannedUpc} />}
    </div>
  );
}