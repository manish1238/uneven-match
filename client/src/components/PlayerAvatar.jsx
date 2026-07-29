// Simple deterministic-color avatar so we don't need to download/host any
// images for player pictures. Swap this for real uploaded avatars later if
// you want — the rest of the app only cares about player.id/name.
const COLORS = [
  "#ef476f",
  "#f78c6b",
  "#ffd166",
  "#06d6a0",
  "#118ab2",
  "#7209b7",
  "#f15bb5",
  "#00bbf9",
];

function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function PlayerAvatar({ name, size = 40, dimmed = false }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: colorFor(name || "?"),
        opacity: dimmed ? 0.35 : 1,
      }}
      title={name}
    >
      {initials || "?"}
    </div>
  );
}
