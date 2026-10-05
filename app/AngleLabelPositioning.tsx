"use client";

import { useEffect } from "react";

const AXIS_LABEL_OFFSET_PX = 12;
const ANGLE_EPSILON = 0.01;

function parseScale(text: SVGTextElement) {
  const transformedGroup = text.closest<SVGGElement>("g[transform]");
  const transform = transformedGroup?.getAttribute("transform") ?? "";
  const match = transform.match(/scale\(\s*([\d.]+)\s*\)/);
  const scale = match ? Number(match[1]) : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function angleValue(text: SVGTextElement) {
  const raw = text.textContent?.replace("°", "").trim() ?? "";
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

function updateAngleLabels() {
  const labels = document.querySelectorAll<SVGTextElement>("text[data-force-angle]");

  labels.forEach((label) => {
    const angle = angleValue(label);
    if (angle === null) return;

    const isHorizontalAxis =
      Math.abs(angle) < ANGLE_EPSILON || Math.abs(angle - 360) < ANGLE_EPSILON;

    if (isHorizontalAxis) {
      const dy = -AXIS_LABEL_OFFSET_PX / parseScale(label);
      const nextDy = String(dy);
      if (label.getAttribute("dy") !== nextDy) label.setAttribute("dy", nextDy);
    } else if (label.hasAttribute("dy")) {
      label.removeAttribute("dy");
    }
  });
}

export default function AngleLabelPositioning() {
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas) return;

    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateAngleLabels();
      });
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["transform", "x", "y", "visibility"],
    });

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
