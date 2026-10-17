import DesignPreview, {
  type WorkspaceDesign,
} from "@/components/design-preview";
import type { Mode } from "@/lib/contract";
import { cookies } from "next/headers";
import "./designs.css";
import "./more-designs.css";
import "../engineering.css";
import "../engineering-theme.css";
import "../original.css";
import "../original-theme.css";

export const dynamic = "force-dynamic";

export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string | string[] }>;
}) {
  const { style } = await searchParams;
  const initialDesign: WorkspaceDesign =
    style === "engineering" ||
    style === "current" ||
    style === "editorial" ||
    style === "lab" ||
    style === "field"
      ? style
      : "corporate";
  const value = process.env.WORKSIGHT_MODE;
  const mode: Mode =
    value === "demo" || value === "live" ? value : "unconfigured";
  const theme =
    (await cookies()).get("worksight_theme")?.value === "dark"
      ? "dark"
      : "light";
  return (
    <DesignPreview
      mode={mode}
      initialDesign={initialDesign}
      initialTheme={theme}
    />
  );
}
