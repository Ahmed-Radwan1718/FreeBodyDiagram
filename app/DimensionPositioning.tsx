"use client";

import { useEffect } from "react";

const DIMENSION_OFFSET = 28;
const MIN_VERTICAL_OFFSET = 28;
const LABEL_CLEARANCE = 8;
const EXTENSION_OVERSHOOT = 5;
const FORCE_TOUCH_DISTANCE_PX = 3;
const ARROW_SIZE = 7;
const ARROW_HALF_WIDTH = 3.5;
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

function closestPointOnSegment(point: SvgPoint, start: SvgPoint, end: SvgPoint): SvgPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return start;

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );

  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
}

function closestPointOnSegments(point: SvgPoint, vertices: SvgPoint[]): SvgPoint | null {
  if (vertices.length < 2) return null;

  let closest: SvgPoint | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const candidate = closestPointOnSegment(point, start, end);
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);

    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}

function closestPointOnShape(shape: SVGGraphicsElement, point: SvgPoint): SvgPoint | null {
  const tagName = shape.tagName.toLowerCase();

  if (tagName === "rect") {
    const x = Number(shape.getAttribute("x"));
    const y = Number(shape.getAttribute("y"));
    const width = Number(shape.getAttribute("width"));
    const height = Number(shape.getAttribute("height"));

    if (![x, y, width, height].every(Number.isFinite)) return null;

    return closestPointOnSegments(point, [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]);
  }

  if (tagName === "ellipse") {
    const cx = Number(shape.getAttribute("cx"));
    const cy = Number(shape.getAttribute("cy"));
    const rx = Number(shape.getAttribute("rx"));
    const ry = Number(shape.getAttribute("ry"));

    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return null;

    const dx = point.x - cx;
    const dy = point.y - cy;
    if (dx === 0 && dy === 0) return { x: cx + rx, y: cy };

    const radialScale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return {
      x: cx + dx * radialScale,
      y: cy + dy * radialScale,
    };
  }

  if (tagName === "polygon") {
    const polygon = shape as SVGPolygonElement;
    const vertices: SvgPoint[] = [];

    for (let index = 0; index < polygon.points.numberOfItems; index += 1) {
      const vertex = polygon.points.getItem(index);
      vertices.push({ x: vertex.x, y: vertex.y });
    }

    return closestPointOnSegments(point, vertices);
  }

  return null;
}

function parseScale(drawingLayer: SVGSVGElement) {
  const worldGroup = drawingLayer.querySelector<SVGGElement>("g[transform]");
  const transform = worldGroup?.getAttribute("transform") ?? "";
  const match = transform.match(/scale\(\s*([\d.]+)\s*\)/);
  const scale = match ? Number(match[1]) : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function forceTouchesDisplayedDimensionSide(
  shape: SVGGraphicsElement,
  group: SVGGElement,
  canvas: HTMLElement,
  scale: number,
) {
  let bounds: DOMRect;
  try {
    bounds = shape.getBBox();
  } catch {
    return false;
  }

  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const right = bounds.x + bounds.width;
  const centerY = top + bounds.height / 2;

  let horizontalDimensionSide = group.dataset.horizontalDimensionSide;
  if (horizontalDimensionSide !== "top" && horizontalDimensionSide !== "bottom") {
    const horizontalLine = Array.from(
      group.querySelectorAll<SVGLineElement>(".dimensionLine"),
    ).find(isHorizontalLine);
    if (!horizontalLine) return false;

    const currentY = Number(horizontalLine.getAttribute("y1"));
    if (!Number.isFinite(currentY)) return false;
    horizontalDimensionSide = currentY > centerY ? "bottom" : "top";
    group.dataset.horizontalDimensionSide = horizontalDimensionSide;
  }

  const horizontalSideY = horizontalDimensionSide === "bottom" ? bottom : top;
  const sideTolerance = FORCE_TOUCH_DISTANCE_PX / scale + EPSILON;
  const lines = canvas.querySelectorAll<SVGLineElement>("line[data-force-vector]");

  for (const line of lines) {
    const point = {
      x: Number(line.getAttribute("x2")),
      y: Number(line.getAttribute("y2")),
    };
    if (![point.x, point.y].every(Number.isFinite)) continue;

    const edgePoint = closestPointOnShape(shape, point);
    if (!edgePoint) continue;

    const distancePx = Math.hypot(edgePoint.x - point.x, edgePoint.y - point.y) * scale;
    if (distancePx > FORCE_TOUCH_DISTANCE_PX) continue;

    const touchesHorizontalDimensionSide =
      Math.abs(edgePoint.y - horizontalSideY) <= sideTolerance;
    const touchesRightDimensionSide = Math.abs(edgePoint.x - right) <= sideTolerance;

    if (touchesHorizontalDimensionSide || touchesRightDimensionSide) return true;
  }

  return false;
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

function setNumberAttribute(element: Element, name: string, value: number) {
  const current = Number(element.getAttribute(name));
  if (Number.isFinite(current) && Math.abs(current - value) < EPSILON) return;
  element.setAttribute(name, String(value));
}

function setPointsAttribute(element: SVGPolygonElement, points: string) {
  if (element.getAttribute("points") === points) return;
  element.setAttribute("points", points);
}

function setDisplay(element: SVGElement, display: string) {
  if (element.style.display === display) return;
  element.style.display = display;
}

function labelWidth(label: SVGTextElement) {
  try {
    const width = label.getBBox().width;
    return Number.isFinite(width) && width > 0 ? width : 0;
  } catch {
    return 0;
  }
}

function positionDimensions(
  group: SVGGElement,
  shape: SVGGraphicsElement,
  inside: boolean,
) {
  let bounds: DOMRect;
  try {
    bounds = shape.getBBox();
  } catch {
    return;
  }

  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const centerX = left + bounds.width / 2;
  const centerY = top + bounds.height / 2;

  const dimensionLines = Array.from(
    group.querySelectorAll<SVGLineElement>(".dimensionLine"),
  );
  const horizontalLine = dimensionLines.find(isHorizontalLine);
  const verticalLine = dimensionLines.find(isVerticalLine);
  if (!horizontalLine || !verticalLine) return;

  const extensions = Array.from(
    group.querySelectorAll<SVGLineElement>(".dimensionExtension"),
  );
  const verticalExtensions = extensions.filter(isVerticalLine);
  const horizontalExtensions = extensions.filter(isHorizontalLine);

  const arrows = Array.from(
    group.querySelectorAll<SVGPolygonElement>(".dimensionArrow"),
  );
  if (arrows.length < 4) return;
  const [leftArrow, rightArrow, topArrow, bottomArrow] = arrows;

  const widthLabel = group.querySelector<SVGTextElement>(
    '.dimensionLabel[data-dimension-axis="width"]',
  );
  const heightLabel = group.querySelector<SVGTextElement>(
    '.dimensionLabel[data-dimension-axis="height"]',
  );
  if (!widthLabel || !heightLabel) return;

  if (!group.dataset.horizontalDimensionSide) {
    const currentY = Number(horizontalLine.getAttribute("y1"));
    group.dataset.horizontalDimensionSide = currentY > centerY ? "bottom" : "top";
  }

  const horizontalBelow = group.dataset.horizontalDimensionSide === "bottom";
  const verticalLabelWidth = labelWidth(heightLabel);
  const horizontalLabelWidth = labelWidth(widthLabel);
  const verticalOffset = Math.max(
    MIN_VERTICAL_OFFSET,
    verticalLabelWidth / 2 + LABEL_CLEARANCE,
  );

  const horizontalY = inside
    ? horizontalBelow
      ? bottom - DIMENSION_OFFSET
      : top + DIMENSION_OFFSET
    : horizontalBelow
      ? bottom + DIMENSION_OFFSET
      : top - DIMENSION_OFFSET;
  const verticalX = inside ? right - verticalOffset : right + verticalOffset;

  setNumberAttribute(horizontalLine, "x1", left);
  setNumberAttribute(horizontalLine, "x2", right);
  setNumberAttribute(horizontalLine, "y1", horizontalY);
  setNumberAttribute(horizontalLine, "y2", horizontalY);

  setPointsAttribute(
    leftArrow,
    `${left},${horizontalY} ${left + ARROW_SIZE},${horizontalY - ARROW_HALF_WIDTH} ${left + ARROW_SIZE},${horizontalY + ARROW_HALF_WIDTH}`,
  );
  setPointsAttribute(
    rightArrow,
    `${right},${horizontalY} ${right - ARROW_SIZE},${horizontalY - ARROW_HALF_WIDTH} ${right - ARROW_SIZE},${horizontalY + ARROW_HALF_WIDTH}`,
  );

  setNumberAttribute(widthLabel, "x", centerX);
  setNumberAttribute(widthLabel, "y", horizontalY);
  const widthBackground = widthLabel.previousElementSibling;
  if (
    widthBackground instanceof SVGRectElement &&
    widthBackground.classList.contains("dimensionLabelBackground")
  ) {
    setNumberAttribute(widthBackground, "x", centerX - horizontalLabelWidth / 2);
    setNumberAttribute(widthBackground, "y", horizontalY - 9);
    setNumberAttribute(widthBackground, "width", horizontalLabelWidth);
  }

  const horizontalShapeY = horizontalBelow ? bottom : top;
  const horizontalGapDirection = inside
    ? horizontalBelow
      ? -1
      : 1
    : horizontalBelow
      ? 1
      : -1;

  if (verticalExtensions.length >= 2) {
    const [leftExtension, rightExtension] = verticalExtensions;
    setDisplay(leftExtension, "");
    setDisplay(rightExtension, "");

    setNumberAttribute(leftExtension, "x1", left);
    setNumberAttribute(leftExtension, "x2", left);
    setNumberAttribute(
      leftExtension,
      "y1",
      horizontalShapeY + horizontalGapDirection * 4,
    );
    setNumberAttribute(
      leftExtension,
      "y2",
      horizontalY + horizontalGapDirection * EXTENSION_OVERSHOOT,
    );

    setNumberAttribute(rightExtension, "x1", right);
    setNumberAttribute(rightExtension, "x2", right);
    setNumberAttribute(
      rightExtension,
      "y1",
      horizontalShapeY + horizontalGapDirection * 4,
    );
    setNumberAttribute(
      rightExtension,
      "y2",
      horizontalY + horizontalGapDirection * EXTENSION_OVERSHOOT,
    );
  }

  setNumberAttribute(verticalLine, "x1", verticalX);
  setNumberAttribute(verticalLine, "x2", verticalX);
  setNumberAttribute(verticalLine, "y1", top);
  setNumberAttribute(verticalLine, "y2", bottom);

  setPointsAttribute(
    topArrow,
    `${verticalX},${top} ${verticalX - ARROW_HALF_WIDTH},${top + ARROW_SIZE} ${verticalX + ARROW_HALF_WIDTH},${top + ARROW_SIZE}`,
  );
  setPointsAttribute(
    bottomArrow,
    `${verticalX},${bottom} ${verticalX - ARROW_HALF_WIDTH},${bottom - ARROW_SIZE} ${verticalX + ARROW_HALF_WIDTH},${bottom - ARROW_SIZE}`,
  );

  setNumberAttribute(heightLabel, "x", verticalX);
  setNumberAttribute(heightLabel, "y", centerY);
  const heightBackground = heightLabel.previousElementSibling;
  if (
    heightBackground instanceof SVGRectElement &&
    heightBackground.classList.contains("dimensionLabelBackground")
  ) {
    setNumberAttribute(heightBackground, "x", verticalX - verticalLabelWidth / 2);
    setNumberAttribute(heightBackground, "y", centerY - 9);
    setNumberAttribute(heightBackground, "width", verticalLabelWidth);
  }

  if (horizontalExtensions.length >= 2) {
    const [topExtension, bottomExtension] = horizontalExtensions;

    if (inside) {
      setDisplay(topExtension, "none");
      setDisplay(bottomExtension, "none");
    } else {
      setDisplay(topExtension, "");
      setDisplay(bottomExtension, "");

      setNumberAttribute(topExtension, "x1", right + 4);
      setNumberAttribute(topExtension, "y1", top);
      setNumberAttribute(topExtension, "x2", verticalX + EXTENSION_OVERSHOOT);
      setNumberAttribute(topExtension, "y2", top);

      setNumberAttribute(bottomExtension, "x1", right + 4);
      setNumberAttribute(bottomExtension, "y1", bottom);
      setNumberAttribute(bottomExtension, "x2", verticalX + EXTENSION_OVERSHOOT);
      setNumberAttribute(bottomExtension, "y2", bottom);
    }
  }
}

function updateDimensionPositions() {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  const canvas = document.querySelector<HTMLElement>(".canvas");
  if (!drawingLayer || !canvas) return;

  const selectedShape = drawingLayer.querySelector<SVGGraphicsElement>(
    ".drawnShape.isCanvasSelected",
  );
  const dimensionGroup = drawingLayer.querySelector<SVGGElement>(".dimensionAnnotation");
  if (!selectedShape || !dimensionGroup) return;

  const scale = parseScale(drawingLayer);
  const inside = forceTouchesDisplayedDimensionSide(
    selectedShape,
    dimensionGroup,
    canvas,
    scale,
  );
  positionDimensions(dimensionGroup, selectedShape, inside);
}

export default function DimensionPositioning() {
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas) return;

    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateDimensionPositions();
      });
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "class",
        "transform",
        "x",
        "y",
        "x1",
        "x2",
        "y1",
        "y2",
        "width",
        "height",
        "cx",
        "cy",
        "rx",
        "ry",
        "points",
      ],
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