import { useEffect } from "react";

// Real Google AdSense wiring, gated behind env vars so it's completely
// inert until you actually have an approved AdSense account.
//
// How to activate after you're approved:
// 1. In client/.env (or your host's env var settings), set:
//      VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX   (your publisher ID)
//      VITE_ADSENSE_SLOT_ID=1234567890                  (an ad unit's slot ID)
// 2. Uncomment the AdSense loader <script> tag in client/index.html.
// 3. Rebuild/redeploy. AdSlot will then render real <ins class="adsbygoogle">
//    units and call adsbygoogle.push({}) to request an ad.
//
// Until those env vars are set, this renders nothing in production (no
// empty boxes) and a small placeholder in dev so you can see where ads
// will go.
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID;
const DEFAULT_SLOT = import.meta.env.VITE_ADSENSE_SLOT_ID;

// Good spots to render <AdSlot /> without hurting the game feel: the lobby
// screen while waiting for players, and the game-over screen between rounds.
// Avoid putting ads where they'd interrupt active gameplay (mid-vote, etc.)
// — that hurts both UX and AdSense policy compliance.
export default function AdSlot({ label = "Ad", slot }) {
  const adSlot = slot || DEFAULT_SLOT;
  const configured = Boolean(ADSENSE_CLIENT && adSlot);

  useEffect(() => {
    if (!configured) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.warn("AdSense push failed:", err);
    }
  }, [configured]);

  if (!configured) {
    if (!import.meta.env.DEV) return null;
    return (
      <div className="ad-slot" aria-hidden="true">
        <span>{label} space (set VITE_ADSENSE_CLIENT_ID + VITE_ADSENSE_SLOT_ID to activate)</span>
      </div>
    );
  }

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      aria-label={`${label} advertisement`}
    />
  );
}
