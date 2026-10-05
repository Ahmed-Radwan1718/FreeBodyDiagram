"use client";

import { useEffect } from "react";

export default function ShapeLabelOverride() {
  useEffect(() => {
    const renamePolygon = () => {
      const options = document.querySelectorAll<HTMLButtonElement>(".shapeOption");
      options.forEach((option) => {
        const label = option.querySelector<HTMLSpanElement>("span");
        if (label?.textContent?.trim() === "Polygon") {
          label.textContent = "Freeform";
        }
      });
    };

    renamePolygon();

    const observer = new MutationObserver(renamePolygon);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
