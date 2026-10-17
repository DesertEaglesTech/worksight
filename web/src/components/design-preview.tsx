"use client";

import { useState } from "react";
import type { Mode } from "@/lib/contract";
import Workspace from "./workspace";

export type WorkspaceDesign =
  "current" | "corporate" | "engineering" | "editorial" | "lab" | "field";

const designs = [
  { id: "current", label: "Original" },
  { id: "corporate", label: "01 · Corporate" },
  { id: "engineering", label: "02 · Engineering" },
  { id: "editorial", label: "03 · Editorial" },
  { id: "lab", label: "04 · Laboratory" },
  { id: "field", label: "05 · Field" },
] as const;

/** Visual alternatives share the same live workspace and keep its inspection in memory. */
export default function DesignPreview({
  mode,
  initialDesign,
  initialTheme,
}: {
  mode: Mode;
  initialDesign: WorkspaceDesign;
  initialTheme: "light" | "dark";
}) {
  const [design, setDesign] = useState(initialDesign);
  return (
    <div className="design-preview">
      <section className="design-comparison" aria-label="Design comparison">
        <div className="design-comparison-label">
          <strong>Worksight</strong>
          <span>Design comparison</span>
        </div>
        <div
          className="design-options"
          role="group"
          aria-label="Choose a design"
        >
          {designs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={design === item.id}
              onClick={() => setDesign(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="design-choice">
          Choose a design
        </label>
        <select
          id="design-choice"
          className="design-select"
          value={design}
          onChange={(event) => setDesign(event.target.value as WorkspaceDesign)}
        >
          {designs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <a href="/">Original workspace ↗</a>
      </section>
      <Workspace mode={mode} design={design} initialTheme={initialTheme} />
    </div>
  );
}
