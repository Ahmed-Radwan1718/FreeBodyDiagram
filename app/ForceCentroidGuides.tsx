"use client";

import { useEffect } from "react";

type Point = { x: number; y: number };

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER_HALF_SIZE_PX = 7;
const SNAP_TARGET_RADIUS_PX = 0.05;

function groupScale(group: SVGGElement) {
  const transform = group.getAttribute("transform") ?? "";
  const match = transform.match(/scale\(\s*([\d.]+)\s*\)/);
  const scale = match ? Number(match[1]) : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function polygonCentroid(polygon: SVGPolygonElement): Point | null {
  const points: Point[] = [];
  for (let index = 0; index < polygon.points.numberOfItems; index += 1) {
    const point = polygon.points.getItem(index);
    points.push({ x: point.x, y: point.y });
  }

  if (points.length === 0) return null;
  if (points.length < 3) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedY += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  return {
    x: weightedX / (3 * twiceArea),
    y: weightedY / (3 * twiceArea),
  };
}

function shapeCentroid(shape: SVGGraphicsElement): Point | null {
  if (shape instanceof SVGRectElement) {
    const x = Number(shape.getAttribute("x"));
    const y = Number(shape.getAttribute("y"));
    const width = Number(shape.getAttribute("width"));
    const height = Number(shape.getAttribute("height"));
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { x: x + width / 2, y: y + height / 2 };
  }

  if (shape instanceof SVGEllipseElement) {
    const cx = Number(shape.getAttribute("cx"));
    const cy = Number(shape.getAttribute("cy"));
    if (![cx, cy].every(Number.isFinite)) return null;
    return { x: cx, y: cy };
  }

  if (shape instanceof SVGPolygonElement) {
    return polygonCentroid(shape);
  }

  try {
    const bounds = shape.getBBox();
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  } catch {
    return null;
  }
}

function removeGuides() {
  document.querySelectorAll("[data-force-centroid-guides]").forEach((element) => {
    element.remove();
  });
}

function showGuides() {
  removeGuides();

  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  const worldGroup = drawingLayer?.querySelector<SVGGElement>("g[transform]") ?? null;
  if (!drawingLayer || !worldGroup) return;

  const scale = groupScale(worldGroup);
  const markerHalfSize = MARKER_HALF_SIZE_PX / scale;
  const snapRadius = SNAP_TARGET_RADIUS_PX / scale;
  const shapes = Array.from(
    drawingLayer.querySelectorAll<SVGGraphicsElement>(
      ".drawnShape:not(.isDraft):not(.forceCentroidSnap)",
    ),
  );

  if (shapes.length === 0) return;

  const guides = document.createElementNS(SVG_NS, "g");
  guides.setAttribute("data-force-centroid-guides", "true");
  guides.setAttribute("pointer-events", "none");

  shapes.forEach((shape) => {
    const centroid = shapeCentroid(shape);
    if (!centroid) return;

    const snapTarget = document.createElementNS(SVG_NS, "ellipse");
    snapTarget.setAttribute("class", "drawnShape forceCentroidSnap");
    snapTarget.setAttribute("cx", String(centroid.x));
    snapTarget.setAttribute("cy", String(centroid.y));
    snapTarget.setAttribute("rx", String(snapRadius));
    snapTarget.setAttribute("ry", String(snapRadius));
    snapTarget.setAttribute("opacity", "0");
    snapTarget.setAttribute("pointer-events", "none");
    guides.appendChild(snapTarget);

    const horizontal = document.createElementNS(SVG_NS, "line");
    horizontal.setAttribute("x1", String(centroid.x - markerHalfSize));
    horizontal.setAttribute("y1", String(centroid.y));
    horizontal.setAttribute("x2", String(centroid.x + markerHalfSize));
    horizontal.setAttribute("y2", String(centroid.y));
    horizontal.setAttribute("stroke", "#59636f");
    horizontal.setAttribute("stroke-width", "1.4");
    horizontal.setAttribute("vector-effect", "non-scaling-stroke");
    guides.appendChild(horizontal);

    const vertical = document.createElementNS(SVG_NS, "line");
    vertical.setAttribute("x1", String(centroid.x));
    vertical.setAttribute("y1", String(centroid.y - markerHalfSize));
    vertical.setAttribute("x2", String(centroid.x));
    vertical.setAttribute("y2", String(centroid.y + markerHalfSize));
    vertical.setAttribute("stroke", "#59636f");
    vertical.setAttribute("stroke-width", "1.4");
    vertical.setAttribute("vector-effect", "non-scaling-stroke");
    guides.appendChild(vertical);
  });

  worldGroup.appendChild(guides);
}

export default function ForceCentroidGuides() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest("[data-force-vector]")) return;
      showGuides();
    }

    function handlePointerEnd() {
      removeGuides();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerEnd, true);
    document.addEventListener("pointercancel", handlePointerEnd, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerEnd, true);
      document.removeEventListener("pointercancel", handlePointerEnd, true);
      removeGuides();
    };
  }, []);

  return null;
}
