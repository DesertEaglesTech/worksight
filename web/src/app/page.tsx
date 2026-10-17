import Workspace from "@/components/workspace";
import type { Mode } from "@/lib/contract";
export const dynamic = "force-dynamic";
export default function Page() {
  const value = process.env.WORKSIGHT_MODE;
  const mode: Mode = value === "demo" || value === "live" ? value : "unconfigured";
  return <Workspace mode={mode} />;
}
