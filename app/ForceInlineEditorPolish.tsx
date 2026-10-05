"use client";

import { useEffect } from "react";

function findEditingLabel(canvas: HTMLElement, editor: HTMLElement) {
  const hidden = canvas.querySelector<SVGTSpanElement>(
    'tspan[data-force-label][visibility="hidden"]',
  );
  if (hidden) return hidden;

  const editorRect = editor.getBoundingClientRect();
  const editorCenterX = editorRect.left + editorRect.width / 2;
  const editorCenterY = editorRect.top + editorRect.height / 2;

  let closest: SVGTSpanElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  canvas.querySelectorAll<SVGTSpanElement>("tspan[data-force-label]").forEach((label) => {
    const rect = label.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - editorCenterX;
    const dy = rect.top + rect.height / 2 - editorCenterY;
    const distance = dx * dx + dy * dy;

    if (distance < closestDistance) {
      closestDistance = distance;
      closest = label;
    }
  });

  return closest;
}

export default function ForceInlineEditorPolish() {
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas) return;

    let frame: number | null = null;
    let activeLabel: SVGTSpanElement | null = null;

    function syncEditor() {
      frame = null;

      const editor = canvas.querySelector<HTMLElement>("[data-force-editor]");
      const input = editor?.querySelector<HTMLInputElement>("input") ?? null;

      if (!editor || !input) {
        if (activeLabel) {
          activeLabel.style.removeProperty("visibility");
          activeLabel = null;
        }
        return;
      }

      // The real input still owns focus, selection, keyboard behavior and commit/cancel
      // logic, but it stays visually invisible. The SVG label below it is what users see.
      input.style.opacity = "0";
      input.style.caretColor = "transparent";
      input.style.color = "transparent";
      input.style.background = "transparent";
      input.style.boxShadow = "none";
      input.style.border = "0";
      input.style.outline = "0";

      const label = findEditingLabel(canvas, editor);
      if (!label) return;

      if (activeLabel && activeLabel !== label) {
        activeLabel.style.removeProperty("visibility");
      }

      activeLabel = label;
      label.style.visibility = "visible";

      const nextText = input.value;
      if (label.textContent !== nextText) {
        label.textContent = nextText;
      }
    }

    function scheduleSync() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(syncEditor);
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["visibility"],
    });

    canvas.addEventListener("input", scheduleSync, true);
    canvas.addEventListener("focusin", scheduleSync, true);
    canvas.addEventListener("focusout", scheduleSync, true);
    scheduleSync();

    return () => {
      observer.disconnect();
      canvas.removeEventListener("input", scheduleSync, true);
      canvas.removeEventListener("focusin", scheduleSync, true);
      canvas.removeEventListener("focusout", scheduleSync, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (activeLabel) activeLabel.style.removeProperty("visibility");
    };
  }, []);

  return null;
}
