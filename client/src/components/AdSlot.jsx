import { useEffect, useRef } from "react";

// Real Google AdSense wiring, gated behind an env var so it's completely
// inert until you actually have an approved AdSense account.
//
// How to activate after you're approved:
// 1. Set VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX (your publisher ID)
//    wherever you deploy — client/.env(.production) locally, or your host's
//    build-time env var settings (e.g. Render's Environment tab).
// 2. Uncomment the AdSense loader <script> tag in client/index.html.
// 3. Rebuild/redeploy. Each <AdSlot> below is tied to one specific ad unit
//    you create in AdSense (Ads → By ad unit) — pass its slot id, and
//    whatever format/layout AdSense's "copy this code" snippet gave you.
//
// Until VITE_ADSENSE_CLIENT_ID is set, this renders nothing in production
// (no empty boxes) and a small placeholder in dev so you can see where ads
// will go.
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID;

// Good spots to render <AdSlot /> without hurting the game feel: the lobby
// screen while waiting for players, and the game-over screen between rounds.
// Avoid putting ads where they'd interrupt active gameplay (mid-vote, etc.)
// — that hurts both UX and AdSense policy compliance.
//
// Props map directly onto the "data-ad-*" attributes AdSense's own
// "copy this code" snippet gives you per ad unit:
//   slot       -> data-ad-slot        (required, from the ad unit)
//   format     -> data-ad-format      ("auto", "fluid", etc.)
//   layoutKey  -> data-ad-layout-key  (in-feed fluid ads)
//   layout     -> data-ad-layout      (e.g. "in-article")
export default function AdSlot({ label = "Ad", slot, format = "auto", layoutKey, layout }) {
  const configured = Boolean(ADSENSE_CLIENT && slot);
  const pushed = useRef(false);

  useEffect(() => {
    if (!configured || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.warn("AdSense push failed:", err);
    }
  }, [configured]);

  if (!configured) {
    if (!import.meta.env.DEV) return null;
    return (
      <div className="ad-frame" aria-hidden="true">
        <span className="ad-frame-label">Advertisement</span>
        <div className="ad-frame-placeholder">
          {label} space — set VITE_ADSENSE_CLIENT_ID + pass a slot to activate
        </div>
      </div>
    );
  }

  return (
    <div className="ad-frame">
      <span className="ad-frame-label">Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block", textAlign: layout === "in-article" ? "center" : undefined }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-ad-layout-key={layoutKey}
        data-ad-layout={layout}
        data-full-width-responsive={format === "auto" ? "true" : undefined}
        aria-label={`${label} advertisement`}
      />
    </div>
  );
}
