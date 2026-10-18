import {
  Cpu,
  Images,
  MessageSquareText,
  ScanSearch,
  UserCheck,
  X,
} from "lucide-react";
import type { T } from "@/lib/i18n";

const steps = [
  {
    icon: Images,
    title: "Good photos",
    text: "10–20 photos of good parts build a profile in seconds. No training.",
    keys: ["how.1t", "how.1x"],
  },
  {
    icon: ScanSearch,
    title: "Heatmap and decision",
    text: "Each part gets an anomaly score, a heatmap and the closest good reference.",
    keys: ["how.2t", "how.2x"],
  },
  {
    icon: MessageSquareText,
    title: "Gemma explains",
    text: "Gemma on AMD Token Factory describes what looks wrong and what to check.",
    keys: ["how.3t", "how.3x"],
  },
  {
    icon: UserCheck,
    title: "Engineer decides",
    text: "The engineer's decision is stored separately from the model's.",
    keys: ["how.4t", "how.4x"],
  },
] as const;

export function HowItWorks({ t, onClose }: { t?: T; onClose?: () => void }) {
  return (
    <section className="how-it-works" aria-label="How Worksight works">
      <div className="how-heading">
        <h2>{t ? t("how.title") : "How it works"}</h2>
        <span className="how-note">
          <Cpu size={14} aria-hidden="true" />
          {t ? t("how.note") : "Explanations by Gemma on AMD Token Factory"}
        </span>
        {onClose && (
          <button
            className="icon-button how-close"
            aria-label={t ? t("how.hide") : "Hide this panel"}
            title={t ? t("how.hide") : "Hide this panel"}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <ol>
        {steps.map(({ icon: Icon, title, text, keys }, i) => (
          <li key={title}>
            <span className="how-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
              <strong>
                {i + 1}. {t ? t(keys[0]) : title}
              </strong>
              <p>{t ? t(keys[1]) : text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
