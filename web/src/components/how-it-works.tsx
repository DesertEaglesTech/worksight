import { Images, ScanSearch, Sparkles, UserCheck } from "lucide-react";

const steps = [
  {
    icon: Images,
    title: "Good photos",
    text: "10–20 photos of good parts build a profile in seconds. No training.",
  },
  {
    icon: ScanSearch,
    title: "Heatmap and decision",
    text: "Each part gets an anomaly score, a heatmap and the closest good reference.",
  },
  {
    icon: Sparkles,
    title: "Gemma explains",
    text: "Gemma on AMD Token Factory describes what looks wrong and what to check.",
  },
  {
    icon: UserCheck,
    title: "Engineer decides",
    text: "The engineer's decision is stored separately from the model's.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="how-it-works" aria-label="How Worksight works">
      <div className="how-heading">
        <h2>How it works</h2>
        <span className="how-note">
          <Sparkles size={14} aria-hidden="true" />
          Explanations by Gemma on AMD Token Factory
        </span>
      </div>
      <ol>
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title}>
            <span className="how-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
              <strong>
                {i + 1}. {title}
              </strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
