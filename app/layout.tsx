import type { Metadata } from "next";
import "./globals.css";
import AppliedForceLayer from "./AppliedForceLayer";
import CanvasModeToggle from "./CanvasModeToggle";
import DimensionPositioning from "./DimensionPositioning";
import ForceInlineEditorPolish from "./ForceInlineEditorPolish";
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
        <CanvasModeToggle />
        <DimensionPositioning />
        <ForceInlineEditorPolish />
        <ForcesPanel />
        <UnitControl />
      </body>
    </html>
  );
}
