"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { Key, T } from "@/lib/i18n";

type Step = {
  selector: string;
  title: Key;
  text: Key;
  // The step moves on by itself once the user has done this.
  waitFor?: "file" | "inspection";
};

const steps: Step[] = [
  {
    selector: ".workspace-navigation nav",
    title: "tour.g.menu.t",
    text: "tour.g.menu.x",
  },
  {
    selector: ".inspection-controls",
    title: "tour.g.profile.t",
    text: "tour.g.profile.x",
  },
  {
    selector: ".live-examples",
    title: "tour.g.pick.t",
    text: "tour.g.pick.x",
    waitFor: "file",
  },
  {
    selector: ".inspect-action .button.primary",
    title: "tour.g.run.t",
    text: "tour.g.run.x",
    waitFor: "inspection",
  },
  {
    selector: '.segmented[aria-label="Image view"]',
    title: "tour.g.view.t",
    text: "tour.g.view.x",
  },
  {
    selector: ".decision-panel",
    title: "tour.g.result.t",
    text: "tour.g.result.x",
  },
  {
    selector: ".engineer-panel",
    title: "tour.g.review.t",
    text: "tour.g.review.x",
  },
  { selector: "#ai-description", title: "tour.g.ai.t", text: "tour.g.ai.x" },
  {
    selector: ".workspace-navigation nav",
    title: "tour.g.done.t",
    text: "tour.g.done.x",
  },
];

type Box = { top: number; left: number; width: number; height: number };

export default function GuidedTour({
  t,
  hasFile,
  hasInspection,
  onClose,
}: {
  t: T;
  hasFile: boolean;
  hasInspection: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Skip steps whose element is not on the page (for example no AI description on this server).
  useEffect(() => {
    const element = document.querySelector(step.selector);
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const timer = setTimeout(() => {
      if (!document.querySelector(step.selector))
        setIndex((i) => (i < steps.length - 1 ? i + 1 : i));
    }, 1500);
    return () => clearTimeout(timer);
  }, [step.selector]);

  useEffect(() => {
    if (
      (step.waitFor === "file" && hasFile) ||
      (step.waitFor === "inspection" && hasInspection)
    )
      setIndex((i) => i + 1);
  }, [step.waitFor, hasFile, hasInspection]);

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const element = document.querySelector(step.selector);
      if (element) {
        const r = element.getBoundingClientRect();
        setBox((current) =>
          current &&
          current.top === r.top &&
          current.left === r.left &&
          current.width === r.width &&
          current.height === r.height
            ? current
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      } else setBox(null);
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step.selector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pad = 6;
  const cardWidth = 340;
  const viewportW = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 800 : window.innerHeight;
  let cardTop = 24;
  let cardLeft = 24;
  if (box) {
    const below = box.top + box.height + pad + 12;
    cardTop =
      below + 220 < viewportH ? below : Math.max(12, box.top - pad - 232);
    cardLeft = Math.min(Math.max(12, box.left), viewportW - cardWidth - 12);
    if (box.left + box.width < viewportW * 0.3) {
      // Narrow targets on the left (the menu): put the card beside them.
      cardLeft = box.left + box.width + pad + 12;
      cardTop = Math.min(Math.max(12, box.top), viewportH - 240);
    }
  }
  const waiting =
    (step.waitFor === "file" && !hasFile) ||
    (step.waitFor === "inspection" && !hasInspection);

  return (
    <div className="guided-tour" aria-live="polite">
      {box && (
        <div
          className="guided-tour-spot"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      )}
      <section
        className="guided-tour-card"
        role="dialog"
        aria-labelledby="guided-tour-title"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="guided-tour-top">
          <span>
            {t("tour.step")} {index + 1} {t("tour.of")} {steps.length}
          </span>
          <button
            className="icon-button"
            aria-label={t("tour.skip")}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <h2 id="guided-tour-title">{t(step.title)}</h2>
        <p>{t(step.text)}</p>
        {waiting && <p className="guided-tour-wait">{t("tour.g.waiting")}</p>}
        <div className="guided-tour-actions">
          {index > 0 && (
            <button
              className="button secondary"
              onClick={() => setIndex(index - 1)}
            >
              {t("tour.back")}
            </button>
          )}
          <span className="tour-spacer" />
          {last ? (
            <button className="button primary" onClick={onClose}>
              {t("tour.g.finish")}
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => setIndex(index + 1)}
            >
              {waiting ? t("tour.g.skipStep") : t("tour.next")}{" "}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
