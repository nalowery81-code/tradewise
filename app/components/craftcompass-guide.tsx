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

const stateCopy: Record<
  MascotState,
  { label: string; icon: string; accent: string; bg: string; fg?: string }
> = {
  welcome: {
    label: "Ready to help",
    icon: "⌖",
    accent: "var(--cc-craft-cyan)",
    bg: "rgba(18, 226, 235, 0.14)",
  },
  working: {
    label: "Checking verified sources",
    icon: "◌",
    accent: "var(--cc-signal-blue)",
    bg: "rgba(8, 97, 149, 0.12)",
  },
  verified: {
    label: "Verified",
    icon: "✓",
    accent: "var(--cc-verified-green)",
    bg: "rgba(22, 163, 74, 0.14)",
    fg: "#ffffff",
  },
  needsDetail: {
    label: "One detail needed",
    icon: "?",
    accent: "var(--cc-safety-orange)",
    bg: "rgba(250, 168, 91, 0.18)",
  },
  photo: {
    label: "Reviewing photo",
    icon: "▣",
    accent: "var(--cc-craft-cyan)",
    bg: "rgba(18, 226, 235, 0.14)",
  },
  manufacturer: {
    label: "Checking manufacturer data",
    icon: "▤",
    accent: "var(--cc-signal-blue)",
    bg: "rgba(8, 97, 149, 0.12)",
  },
  warning: {
    label: "Proceed carefully",
    icon: "△",
    accent: "var(--cc-safety-orange)",
    bg: "rgba(250, 168, 91, 0.18)",
  },
  manager: {
    label: "Team insight",
    icon: "▥",
    accent: "var(--cc-signal-blue)",
    bg: "rgba(8, 97, 149, 0.12)",
  },
  training: {
    label: "Training",
    icon: "→",
    accent: "var(--cc-craft-cyan)",
    bg: "rgba(18, 226, 235, 0.14)",
  },
  error: {
    label: "Could not verify",
    icon: "!",
    accent: "#b91c1c",
    bg: "rgba(185, 28, 28, 0.10)",
    fg: "#ffffff",
  },
};

function CompactGuideMark({
  state,
  size,
}: {
  state: MascotState;
  size: number;
}) {
  const current = stateCopy[state];
  const iconSize = Math.max(13, Math.round(size * 0.34));

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(12, Math.round(size * 0.28)),
        display: "grid",
        placeItems: "center",
        background: current.bg,
        border: `1px solid ${current.accent}`,
        boxShadow: "var(--cc-shadow-soft)",
        color: current.fg || "var(--cc-deep-navy)",
        fontWeight: 900,
        fontSize: iconSize,
        lineHeight: 1,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          width: Math.max(24, Math.round(size * 0.58)),
          height: Math.max(24, Math.round(size * 0.58)),
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: current.accent,
          color: current.fg || "var(--cc-midnight)",
        }}
      >
        {current.icon}
      </div>
    </div>
  );
}

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
  const useCompactMark = size <= 56;

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
      {useCompactMark ? (
        <CompactGuideMark state={state} size={size} />
      ) : (
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
              background: current.accent,
              color: current.fg || "var(--cc-midnight)",
              fontWeight: 900,
              fontSize: Math.max(13, Math.round(size * 0.18)),
              boxShadow: "var(--cc-shadow-soft)",
            }}
          >
            {current.icon}
          </span>
        </div>
      )}

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
