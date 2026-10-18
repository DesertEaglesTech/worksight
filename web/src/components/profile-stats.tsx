"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { backendRequest } from "@/lib/backend-api";
import { translator, type T } from "@/lib/i18n";

const statsSchema = z.object({
  onboarding: z
    .object({
      reference_count: z.number(),
      build_ms: z.number().nullable().optional(),
    })
    .nullable(),
  inspections: z.object({
    count: z.number(),
    decisions: z.object({
      normal: z.number(),
      review: z.number(),
      anomaly: z.number(),
    }),
    inference_ms_p50: z.number().nullable(),
  }),
  engineer_review: z.object({
    agreement: z.object({
      agree: z.number(),
      compared: z.number(),
      rate: z.number().nullable(),
    }),
  }),
});
type Stats = z.infer<typeof statsSchema>;

/** Measured facts from the backend's /stats; nothing is estimated in the browser. */
export function ProfileStats({
  profileId,
  refreshKey,
  t = translator("en"),
}: {
  profileId: string;
  refreshKey: string;
  t?: T;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    backendRequest(
      `/profiles/${encodeURIComponent(profileId)}/stats`,
      statsSchema,
      { signal: controller.signal },
    )
      .then(setStats)
      .catch(() => {
        if (!controller.signal.aborted) setStats(null);
      });
    return () => controller.abort();
  }, [profileId, refreshKey]);
  if (!stats) return null;
  const { onboarding, inspections, engineer_review } = stats;
  const agreement = engineer_review.agreement;
  const facts = [
    {
      label: t("stats.build"),
      value:
        onboarding?.build_ms != null
          ? `${(onboarding.build_ms / 1000).toFixed(1)} s`
          : "—",
      note: onboarding
        ? `${onboarding.reference_count} ${t("stats.photos")}`
        : undefined,
    },
    {
      label: t("stats.inference"),
      value:
        inspections.inference_ms_p50 === null
          ? "—"
          : `${Math.round(inspections.inference_ms_p50)} ms`,
      note: t("stats.server"),
    },
    {
      label: t("stats.inspections"),
      value: String(inspections.count),
      note: `${inspections.decisions.anomaly} ${t("decision.anomaly").toLowerCase()} · ${inspections.decisions.review} ${t("decision.review").toLowerCase()}`,
    },
    {
      label: t("stats.agreement"),
      value: agreement.compared
        ? `${agreement.agree}/${agreement.compared}`
        : "—",
      note: agreement.compared ? t("stats.reviewed") : t("stats.none"),
    },
  ];
  return (
    <section className="profile-stats" aria-label="Measured on this profile">
      {facts.map((f) => (
        <div key={f.label}>
          <span>{f.label}</span>
          <strong>
            {f.value}
            {f.note && <small> · {f.note}</small>}
          </strong>
        </div>
      ))}
    </section>
  );
}
