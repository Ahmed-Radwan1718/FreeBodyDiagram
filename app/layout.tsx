import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
