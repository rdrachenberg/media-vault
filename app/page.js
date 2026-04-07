"use client";

import dynamic from "next/dynamic";

// Client-only — no SSR. Prevents hydration mismatches from
// BarcodeDetector checks, camera APIs, and dynamic poster loading.
const MediaVault = dynamic(() => import("@/components/MediaVault"), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a14", color: "#f5c518", fontFamily: "monospace", fontSize: 14,
      letterSpacing: 2,
    }}>
      LOADING MEDIA VAULT...
    </div>
  ),
});

export default function Home() {
  return <MediaVault />;
}