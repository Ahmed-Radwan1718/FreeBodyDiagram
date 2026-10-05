"use client";

import { useEffect } from "react";

const MIN_VERTICAL_OFFSET = 28;
const LABEL_CLEARANCE = 8;
const EXTENSION_OVERSHOOT = 5;
const EPSILON = 0.1;

type SvgPoint = { x: number; y: number };

function parsePoints(value: string | null): SvgPoint[] {
  if (!value) return [];

  return value
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function formatPoints(points: SvgPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function isVerticalLine(line: SVGLineElement) {
  const x1 = Number(line.getAttribute("x1"));
  const y1 = Number(line.getAttribute("y1"));
  const x2 = Number(line.getAttribute("x2"));
  const y2 = Number(line.getAttribute("y2"));

  return (
    [x1, y1, x2, y2].every(Number.isFinite) &&
    Math.abs(x1 - x2) < EPSILON &&
    Math.abs(y2 - y1) > EPSILON
  );
}

function isHorizontalLine(line: SVGLineElement) {
  const x1 = Number(line.getAttribute("x1"));
  const y1 = Number(line.getAttribute("y1"));
  const x2 = Number(line.getAttribute("x2"));
  const y2 = Number(line.getAttribute("y2"));

  return (
    [x1, y1, x2, y2].every(Number.isFinite) &&
    Math.abs(y1 - y2) < EPSILON &&
    Math.abs(x2 - x1) > EPSILON
  );
}

function positionVerticalLabel(label: SVGTextElement) {
  if (label.dataset.dimensionAxis !== "height") return;

  const group = label.parentElement;
  if (!group) return;

  const verticalLine = Array.from(
    group.querySelectorAll<SVGLineElement>(".dimensionLine"),
  ).find(isVerticalLine);
  if (!verticalLine) return;

  const extensionLines = Array.from(
    group.querySelectorAll<SVGLineElement>(".dimensionExtension"),
  ).filter(isHorizontalLine);
  if (extensionLines.length === 0) return;

  const extensionEndpoints = extensionLines.flatMap((line) => [
    Number(line.getAttribute("x1")),
    Number(line.getAttribute("x2")),
  ]);
  const shapeEdgeWithGap = Math.min(...extensionEndpoints.filter(Number.isFinite));
  if (!Number.isFinite(shapeEdgeWithGap)) return;

  // The dimension extensions begin 4 px away from the shape edge.
  const shapeRight = shapeEdgeWithGap - 4;

  let labelWidth: number;
  try {
    labelWidth = label.getBBox().width;
  } catch {
    return;
  }

  if (!Number.isFinite(labelWidth) || labelWidth <= 0) return;

  const currentX = Number(verticalLine.getAttribute("x1"));
  if (!Number.isFinite(currentX)) return;

  const requiredOffset = Math.max(
    MIN_VERTICAL_OFFSET,
    labelWidth / 2 + LABEL_CLEARANCE,
  );
  const nextX = shapeRight + requiredOffset;
  const deltaX = nextX - currentX;

  if (Math.abs(deltaX) < EPSILON) return;

  verticalLine.setAttribute("x1", String(nextX));
  verticalLine.setAttribute("x2", String(nextX));

  extensionLines.forEach((line) => {
    const x1 = Number(line.getAttribute("x1"));
    const x2 = Number(line.getAttribute("x2"));
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;

    if (x1 > x2) line.setAttribute("x1", String(nextX + EXTENSION_OVERSHOOT));
    else line.setAttribute("x2", String(nextX + EXTENSION_OVERSHOOT));
  });

  group.querySelectorAll<SVGPolygonElement>(".dimensionArrow").forEach((arrow) => {
    const points = parsePoints(arrow.getAttribute("points"));
    if (points.length < 3) return;

    // Vertical dimension arrows have their tip directly on the vertical line.
    if (Math.abs(points[0].x - currentX) >= 1) return;

    arrow.setAttribute(
      "points",
      formatPoints(points.map((point) => ({ ...point, x: point.x + deltaX }))),
    );
  });

  label.setAttribute("x", String(nextX));

  const background = label.previousElementSibling;
  if (
    background instanceof SVGRectElement &&
    background.classList.contains("dimensionLabelBackground")
  ) {
    background.setAttribute("x", String(nextX - labelWidth / 2));
    background.setAttribute("width", String(labelWidth));
  }
}

function updateVerticalDimensionLabels() {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  if (!drawingLayer) return;

  drawingLayer
    .querySelectorAll<SVGTextElement>('.dimensionLabel[data-dimension-axis="height"]')
    .forEach(positionVerticalLabel);
}

export default function DimensionPositioning() {
  useEffect(() => {
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    if (!drawingLayer) return;

    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateVerticalDimensionLabels();
      });
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(drawingLayer, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["x", "y", "x1", "x2", "y1", "y2", "points"],
    });

    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
