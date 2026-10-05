import type { Metadata } from "next";
import "./globals.css";
import AngleLabelPositioning from "./AngleLabelPositioning";
import AppliedForceLayer from "./AppliedForceLayer";
import CalculationsPanel from "./CalculationsPanel";
import CanvasModeToggle from "./CanvasModeToggle";
import DimensionPositioning from "./DimensionPositioning";
import ForcesPanel from "./ForcesPanel";
import UnitControl from "./UnitControl";

export const metadata: Metadata = {
  title: "Free Body Diagram",
  description: "Build and work with free-body diagrams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppliedForceLayer />
        <AngleLabelPositioning />
        <CanvasModeToggle />
        <DimensionPositioning />
        <ForcesPanel />
        <CalculationsPanel />
        <UnitControl />
      </body>
    </html>
  );
}
