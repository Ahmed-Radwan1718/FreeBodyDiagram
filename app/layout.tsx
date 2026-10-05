import type { Metadata } from "next";
import "./globals.css";
import AngleLabelPositioning from "./AngleLabelPositioning";
import AppliedForceLayer from "./AppliedForceLayer";
import CalculationsPanel from "./CalculationsPanel";
import CanvasModeToggle from "./CanvasModeToggle";
import DimensionPositioning from "./DimensionPositioning";
import DisplayPanel from "./DisplayPanel";
import ForceCentroidGuides from "./ForceCentroidGuides";
import ForcesPanel from "./ForcesPanel";
import ShapeLabelOverride from "./ShapeLabelOverride";
import SidebarDropdownMotion from "./SidebarDropdownMotion";
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
        <ForceCentroidGuides />
        <CanvasModeToggle />
        <DimensionPositioning />
        <ForcesPanel />
        <CalculationsPanel />
        <DisplayPanel />
        <ShapeLabelOverride />
        <SidebarDropdownMotion />
        <UnitControl />
      </body>
    </html>
  );
}
