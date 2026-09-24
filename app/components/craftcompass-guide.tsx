import BrandLogo from "./brand-logo";

export type MascotState =
  | "welcome"
  | "working"
  | "verified"
  | "needsDetail"
  | "photo"
  | "manufacturer"
  | "warning"
  | "manager"
  | "training"
  | "error";

const stateCopy: Record<MascotState, { label: string; icon: string }> = {
  welcome: { label: "Ready to help", icon: "⌖" },
  working: { label: "Checking verified sources", icon: "◌" },
  verified: { label: "Verified", icon: "✓" },
  needsDetail: { label: "One detail needed", icon: "?" },
  photo: { label: "Reviewing photo", icon: "▣" },
  manufacturer: { label: "Checking manufacturer data", icon: "▤" },
  warning: { label: "Proceed carefully", icon: "△" },
  manager: { label: "Team insight", icon: "▥" },
  training: { label: "Training", icon: "→" },
  error: { label: "Could not verify", icon: "!" },
};

export default function CraftCompassGuide({
  state = "welcome",
  size = 72,
  caption,
  showCaption = true,
}: {
  state?: MascotState;
  size?: number;
  caption?: string;
  showCaption?: boolean;
}) {
  const current = stateCopy[state];
  const positive = state === "verified";
  const caution = state === "warning" || state === "error";

  return (
    <div
      data-craftcompass-state={state}
      aria-label={caption ?? current.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "100%",
      }}
    >
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <BrandLogo width={size} />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(24, Math.round(size * 0.34)),
            height: Math.max(24, Math.round(size * 0.34)),
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            border: "2px solid var(--cc-surface)",
            background: positive
              ? "var(--cc-verified-green)"
              : caution
                ? "var(--cc-safety-orange)"
                : "var(--cc-craft-cyan)",
            color: positive ? "#fff" : "var(--cc-midnight)",
            fontWeight: 900,
            fontSize: Math.max(13, Math.round(size * 0.18)),
            boxShadow: "var(--cc-shadow-soft)",
          }}
        >
          {current.icon}
        </span>
      </div>
      {showCaption ? (
        <span
          style={{
            color: "var(--cc-deep-navy)",
            fontSize: 13,
            lineHeight: 1.25,
            fontWeight: 800,
          }}
        >
          {caption ?? current.label}
        </span>
      ) : null}
    </div>
  );
}
