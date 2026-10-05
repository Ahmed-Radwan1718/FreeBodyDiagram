"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ForceTool = "applied" | "distributed";

const FORCE_OPTIONS: { type: ForceTool; label: string }[] = [
  { type: "applied", label: "Applied Force" },
  { type: "distributed", label: "Distributed Load" },
];

const MIN_FORCE_PLACEMENT_DISTANCE_PX = 8;

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
  const placementRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

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

    function handleSidebarClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const option = event.target.closest<HTMLButtonElement>(".shapeOption");
      if (!option || option.hasAttribute("data-force-tool")) return;

      setSelectedTool(null);
      delete document.documentElement.dataset.forceTool;
      window.dispatchEvent(
        new CustomEvent("forcetoolchange", {
          detail: { tool: null },
        }),
      );
    }

    sidebar.addEventListener("click", handleSidebarClick, true);

    return () => {
      sidebar.removeEventListener("click", handleSidebarClick, true);
      if (existingForcesSection) existingForcesSection.style.display = previousDisplay;
    };
  }, []);

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas || selectedTool !== "applied") {
      placementRef.current = null;
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      if (
        event.target instanceof Element &&
        (event.target.closest(".dimensionLabel") ||
          event.target.closest("[data-force-vector]") ||
          event.target.closest("[data-force-label]") ||
          event.target.closest("[data-force-editor]"))
      ) {
        return;
      }

      placementRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    }

    function handlePointerUp(event: PointerEvent) {
      const start = placementRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      placementRef.current = null;

      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance < MIN_FORCE_PLACEMENT_DISTANCE_PX) return;

      setSelectedTool(null);
      setOpen(false);
      delete document.documentElement.dataset.forceTool;
      window.dispatchEvent(
        new CustomEvent("forcetoolchange", {
          detail: { tool: null },
        }),
      );
    }

    function handlePointerCancel(event: PointerEvent) {
      if (placementRef.current?.pointerId === event.pointerId) {
        placementRef.current = null;
      }
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      placementRef.current = null;
    };
  }, [selectedTool]);

  function toggleTool(tool: ForceTool) {
    const nextTool = selectedTool === tool ? null : tool;

    if (nextTool) {
      const selectedShapeButton = sidebarRoot?.querySelector<HTMLButtonElement>(
        ".shapeOption.isSelected:not([data-force-tool])",
      );
      selectedShapeButton?.click();
    }

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
              data-force-tool={option.type}
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
