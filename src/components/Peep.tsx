"use client";

import { usePeepInner, peepMeta } from "@/lib/peep-cache";

/**
 * Renders an OpenPeeps figure tinted to `color`, scaled to fit `size` (px) by
 * its longest side, bottom-aligned (the figure stands on the box floor).
 * Falls back to a neutral placeholder dot until the SVG loads.
 */
export function Peep({
  avatarId,
  color,
  size = 64,
  className,
  title,
}: {
  avatarId: string;
  color: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const inner = usePeepInner(avatarId);
  const meta = peepMeta(avatarId);
  const w = meta?.w ?? 213;
  const h = meta?.h ?? 715;

  return (
    <span
      className={className}
      title={title}
      style={{
        color,
        display: "inline-flex",
        alignItems: "flex-end",
        justifyContent: "center",
        width: size,
        height: size,
        lineHeight: 0,
      }}
    >
      {inner ? (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          style={{ height: "100%", width: "auto", maxWidth: "100%" }}
          // Inner markup uses currentColor for ink + #FFFFFF for fills.
          dangerouslySetInnerHTML={{ __html: inner }}
        />
      ) : (
        <span
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: "9999px",
            background: "currentColor",
            opacity: 0.25,
          }}
        />
      )}
    </span>
  );
}
