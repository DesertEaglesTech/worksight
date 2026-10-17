import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Worksight · Visual inspection", description: "Industrial visual inspection with reference profiles, heatmaps and engineer review." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
