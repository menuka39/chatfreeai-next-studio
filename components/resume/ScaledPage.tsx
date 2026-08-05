"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders a fixed-size A4 page scaled to exactly fill its container's width.
 *
 * A hard-coded `scale-[0.28]` can't work across a responsive grid — the card
 * is a different width at every breakpoint, so the page ends up either a thin
 * sliver or overflowing. Measuring the container and deriving the scale keeps
 * the page filling the width at any size, and reserving the scaled height
 * stops the card collapsing behind the transform.
 */
export default function ScaledPage({
  children,
  pageWidth = 794,
  pageHeight = 1123,
  /** show only the top portion (0-1) — useful for gallery thumbnails */
  crop = 1,
}: {
  children: ReactNode;
  pageWidth?: number;
  pageHeight?: number;
  crop?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / pageWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidth]);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ height: scale ? pageHeight * crop * scale : undefined }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: pageWidth,
          height: pageHeight,
          transform: `scale(${scale})`,
          // avoid a flash of the unscaled page before the first measurement
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
