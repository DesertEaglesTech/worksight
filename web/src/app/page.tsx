import Workspace from "@/components/workspace";
import type { Mode } from "@/lib/contract";
import { cookies } from "next/headers";
import "./original.css";
import "./original-theme.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  const value = process.env.WORKSIGHT_MODE;
  const mode: Mode =
    value === "demo" || value === "live" ? value : "unconfigured";
  const theme =
    (await cookies()).get("worksight_theme")?.value === "dark"
      ? "dark"
      : "light";
  return (
    <Workspace
      mode={mode}
      design="current"
      initialTheme={theme}
      exampleInspectionId={process.env.WORKSIGHT_EXAMPLE_INSPECTION_ID}
      exampleSource={process.env.WORKSIGHT_EXAMPLE_SOURCE}
    />
  );
}
