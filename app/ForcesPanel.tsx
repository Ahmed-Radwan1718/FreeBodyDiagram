"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ForceTool = "applied" | "distributed";

const FORCE_OPTIONS: { type: ForceTool; label: string }[] = [
  { type: "applied", label: "Applied Force" },
  { type: "distributed", label: "Distributed Load" },
];

function ForceOptionIcon({ type }: { type: ForceTool }) {
  if (type === "distributed") {
    return (
      <>
        <path d="M4 26h24" />
        {[7, 13, 19, 25].map((x) => (
          <g key={x}>
            <path d={`M${x} 5v15`} />
            <path d={`M${x - 3} 16l3 4 3-4`} />
          </g>
        ))}
      </>
    );
  }

  return (
    <>
      <path d="M5 16h21" />
      <path d="M20 10l6 6-6 6" />
    </>
  );
}

export default function ForcesPanel() {
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ForceTool | null>(null);
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return;

    const existingForcesSection = Array.from(
      sidebar.querySelectorAll<HTMLElement>(":scope > .sidebarSection"),
    ).find((section) => {
      const label = section.querySelector<HTMLElement>(".sectionLabel");
      return label?.textContent?.trim() === "Forces" && !section.querySelector("button");
    });

    const previousDisplay = existingForcesSection?.style.display ?? "";
    if (existingForcesSection) existingForcesSection.style.display = "none";
    setSidebarRoot(sidebar);

    return () => {
      if (existingForcesSection) existingForcesSection.style.display = previousDisplay;
    };
  }, []);

  function toggleTool(tool: ForceTool) {
    const nextTool = selectedTool === tool ? null : tool;
    setSelectedTool(nextTool);

    if (nextTool) document.documentElement.dataset.forceTool = nextTool;
    else delete document.documentElement.dataset.forceTool;

    window.dispatchEvent(
      new CustomEvent("forcetoolchange", {
        detail: { tool: nextTool },
      }),
    );
  }

  if (!sidebarRoot) return null;

  return createPortal(
    <div className="sidebarSection">
      <button
        className="sectionHeading sectionButton"
        type="button"
        aria-expanded={open}
        aria-controls="force-options"
        onClick={() => setOpen((current) => !current)}
      >
        <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h14" />
          <path d="M13.5 7.5 18 12l-4.5 4.5" />
        </svg>
        <span className="sectionLabel">Forces</span>
        <svg
          className={`sectionChevron${open ? " isOpen" : ""}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="shapeOptions" id="force-options">
          {FORCE_OPTIONS.map((option) => (
            <button
              key={option.type}
              className={`shapeOption${selectedTool === option.type ? " isSelected" : ""}`}
              type="button"
              aria-pressed={selectedTool === option.type}
              onClick={() => toggleTool(option.type)}
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <ForceOptionIcon type={option.type} />
              </svg>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    sidebarRoot,
  );
}
