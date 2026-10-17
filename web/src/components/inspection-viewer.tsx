"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { assetUrl } from "@/lib/api";
import type { Inspection } from "@/lib/contract";

export type ImageView = "overlay" | "original" | "split";

/** Local display controls only. Original and heatmap share one transform. */
export default function InspectionViewer({
  inspection,
  view,
  opacity,
}: {
  inspection: Inspection;
  view: ImageView;
  opacity: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState("");
  const [failed, setFailed] = useState(false);
  const [heatmapFailed, setHeatmapFailed] = useState(false);
  const [referenceFailed, setReferenceFailed] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDimensions("");
    setFailed(false);
    setHeatmapFailed(false);
    setReferenceFailed(false);
  }, [inspection.id]);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [view]);
  const original = assetUrl(inspection.original_url);
  const originalUnavailable = failed || !original;
  const heatmap = inspection.heatmap_url
    ? assetUrl(inspection.heatmap_url)
    : "";
  const reference = inspection.reference_url
    ? assetUrl(inspection.reference_url)
    : "";
  const showHeatmap = view !== "original" && !!heatmap && !heatmapFailed;
  return (
    <>
      <div className={`image-stage ${view === "split" ? "split" : ""}`}>
        <div
          className={`image-frame ${zoom > 1 ? "can-pan" : ""}`}
          style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
          onPointerDown={(e) => {
            if (zoom <= 1 || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              startX: pan.x,
              startY: pan.y,
            };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setPan({
              x: drag.current.startX + e.clientX - drag.current.x,
              y: drag.current.startY + e.clientY - drag.current.y,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div
            className="image-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {original && !failed ? (
              <img
                src={original}
                alt="Inspected part original"
                draggable={false}
                onLoad={(e) =>
                  setDimensions(
                    `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`,
                  )
                }
                onError={() => {
                  setFailed(true);
                  setDimensions("");
                }}
              />
            ) : (
              <div className="image-missing">Original image unavailable</div>
            )}
            {showHeatmap && (
              <img
                className="heatmap"
                src={heatmap}
                alt="Anomaly heatmap overlay"
                draggable={false}
                style={{ opacity: opacity / 100 }}
                onError={() => setHeatmapFailed(true)}
              />
            )}
          </div>
          <span className="image-caption">
            {view === "original"
              ? "Original image"
              : showHeatmap
                ? "Image + heatmap"
                : "Original image"}
          </span>
        </div>
        {view === "split" && (
          <div className="image-frame reference-frame">
            {reference && !referenceFailed ? (
              <img
                src={reference}
                alt="Similar known-good reference"
                draggable={false}
                onError={() => setReferenceFailed(true)}
              />
            ) : (
              <div className="image-missing">Similar reference unavailable</div>
            )}
            <span className="image-caption">Similar reference</span>
          </div>
        )}
      </div>
      {(heatmapFailed || (view !== "original" && !heatmap)) && (
        <p className="image-warning">
          Heatmap unavailable. The original image is shown.
        </p>
      )}
      <div className="viewer-statusbar">
        <span>
          {originalUnavailable
            ? "Image unavailable"
            : dimensions || "Loading image…"}
        </span>
        <span className="pan-hint">
          {zoom > 1 ? "Drag image to pan" : "Image fitted to workspace"}
        </span>
        <div className="zoom-controls" aria-label="Image zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 0.5 || originalUnavailable}
            onClick={() => {
              setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
              setPan({ x: 0, y: 0 });
            }}
          >
            <Minus size={17} />
          </button>
          <output aria-label="View scale">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 3 || originalUnavailable}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="fit-button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCcw size={14} />
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
