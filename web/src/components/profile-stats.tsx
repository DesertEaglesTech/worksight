"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { backendRequest } from "@/lib/backend-api";

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
}: {
  profileId: string;
  refreshKey: string;
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
  return (
    <section className="profile-stats" aria-label="Measured profile figures">
      <div>
        <span>Onboarding</span>
        <strong>
          {onboarding
            ? onboarding.build_ms
              ? `${onboarding.reference_count} photos · ${(onboarding.build_ms / 1000).toFixed(1)} s`
              : `${onboarding.reference_count} photos`
            : "—"}
        </strong>
        <small>No model training</small>
      </div>
      <div>
        <span>Inspections</span>
        <strong>{inspections.count}</strong>
        <small>
          {inspections.decisions.normal} normal · {inspections.decisions.review}{" "}
          review · {inspections.decisions.anomaly} anomaly
        </small>
      </div>
      <div>
        <span>Median inference</span>
        <strong>
          {inspections.inference_ms_p50 === null
            ? "—"
            : `${Math.round(inspections.inference_ms_p50)} ms`}
        </strong>
        <small>Measured on the server</small>
      </div>
      <div>
        <span>Engineer agreement</span>
        <strong>
          {agreement.compared
            ? `${agreement.agree} of ${agreement.compared}`
            : "No reviews yet"}
        </strong>
        <small>
          {agreement.rate === null
            ? "Model vs engineer on reviewed parts"
            : `${Math.round(agreement.rate * 100)}% on reviewed parts`}
        </small>
      </div>
    </section>
  );
}
