import { useEffect, useRef, useState } from "react";
import { MAX_ICON_ZOOM, type IconCrop } from "../lib/types";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/// <summary>
/// Shows an image fitted into a frame without stretching (it always covers the frame),
/// positioned by a focal point (crop.x / crop.y, 0..1) and scaled by crop.zoom. When
/// `editable`, drag the image to reposition it and use the zoom slider — both flow through
/// `onChange`. Read-only just renders the cropped view. Reused for character portraits and
/// item images.
/// </summary>
export function CroppableImage({
  src,
  crop,
  editable = false,
  onChange,
  className,
  alt = "",
}: {
  src: string;
  crop: IconCrop;
  editable?: boolean;
  onChange?: (crop: IconCrop) => void;
  className?: string;
  alt?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Track the frame's pixel size so we can size the image to cover it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset natural size when the source changes so the new image re-measures on load.
  useEffect(() => setNatural({ w: 0, h: 0 }), [src]);

  const ready = natural.w > 0 && natural.h > 0 && frame.w > 0 && frame.h > 0;
  // Cover the frame at zoom 1, then apply zoom; the image box keeps its natural aspect so
  // it never stretches. The focal point pans within whatever overflows the frame.
  const cover = ready ? Math.max(frame.w / natural.w, frame.h / natural.h) : 0;
  const dispW = natural.w * cover * crop.zoom;
  const dispH = natural.h * cover * crop.zoom;
  const ovX = Math.max(0, dispW - frame.w);
  const ovY = Math.max(0, dispH - frame.h);
  const left = -ovX * crop.x;
  const top = -ovY * crop.y;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || !onChange) return;
    e.preventDefault();
    frameRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !onChange) return;
    // Dragging the image one overflow-width moves the focal point across its full range;
    // dragging right reveals more of the left (a lower x).
    const nx = ovX > 0 ? clamp01(d.x - (e.clientX - d.px) / ovX) : 0.5;
    const ny = ovY > 0 ? clamp01(d.y - (e.clientY - d.py) / ovY) : 0.5;
    onChange({ ...crop, x: nx, y: ny });
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    frameRef.current?.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={frameRef}
      className={`croppable ${className ?? ""}`}
      style={{ position: "relative", overflow: "hidden" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={{
          position: "absolute",
          width: ready ? `${dispW}px` : "100%",
          height: ready ? `${dispH}px` : "100%",
          left: ready ? `${left}px` : 0,
          top: ready ? `${top}px` : 0,
          maxWidth: "none",
          objectFit: "cover",
          userSelect: "none",
          cursor: editable ? (dragging ? "grabbing" : "grab") : "default",
        }}
      />
      {editable && onChange ? (
        <input
          className="croppable-zoom"
          type="range"
          min={1}
          max={MAX_ICON_ZOOM}
          step={0.02}
          value={crop.zoom}
          title="Zoom"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
        />
      ) : null}
    </div>
  );
}
