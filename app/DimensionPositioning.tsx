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
type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
type HorizontalDimensionSide = "top" | "bottom";
type DimensionShapeType = "rectangle" | "circle" | "triangle";

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

function pointToSegmentDistance(point: SvgPoint, start: SvgPoint, end: SvgPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  const closestX = start.x + dx * t;
  const closestY = start.y + dy * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function worldBounds(shape: SVGGraphicsElement): Bounds | null {
  try {
    const bounds = shape.getBBox();
    return {
      left: bounds.x,
      right: bounds.x + bounds.width,
      top: bounds.y,
      bottom: bounds.y + bounds.height,
      width: bounds.width,
      height: bounds.height,
    };
  } catch {
    return null;
  }
}

function screenBounds(shape: SVGGraphicsElement): Bounds | null {
  let bounds: DOMRect;
  try {
    bounds = shape.getBBox();
  } catch {
    return null;
  }

  const matrix = shape.getCTM();
  if (!matrix) return null;

  const corners = [
    new DOMPoint(bounds.x, bounds.y),
    new DOMPoint(bounds.x + bounds.width, bounds.y),
    new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
    new DOMPoint(bounds.x, bounds.y + bounds.height),
  ].map((point) => point.matrixTransform(matrix));

  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function shapeScale(shape: SVGGraphicsElement) {
  const matrix = shape.getCTM();
  if (!matrix) return 1;
  const scale = Math.hypot(matrix.a, matrix.b);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function horizontalDimensionSide(shape: SVGGraphicsElement): HorizontalDimensionSide {
  return shape.classList.contains("drawnTriangle") ? "bottom" : "top";
}

function polygonPoints(shape: SVGGraphicsElement) {
  if (!(shape instanceof SVGPolygonElement)) return [];

  const points: SvgPoint[] = [];
  for (let index = 0; index < shape.points.numberOfItems; index += 1) {
    const point = shape.points.getItem(index);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function forcePointTouchesDisplayedSide(
  shape: SVGGraphicsElement,
  point: SvgPoint,
  scale: number,
  horizontalSide: HorizontalDimensionSide,
) {
  const bounds = worldBounds(shape);
  if (!bounds) return false;

  const toleranceWorld = FORCE_TOUCH_DISTANCE_PX / scale;

  if (shape.classList.contains("drawnRectangle")) {
    const horizontalY = horizontalSide === "bottom" ? bounds.bottom : bounds.top;
    const horizontalDistance = pointToSegmentDistance(
      point,
      { x: bounds.left, y: horizontalY },
      { x: bounds.right, y: horizontalY },
    );
    const rightDistance = pointToSegmentDistance(
      point,
      { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom },
    );
    return Math.min(horizontalDistance, rightDistance) <= toleranceWorld;
  }

  if (shape.classList.contains("drawnTriangle")) {
    const points = polygonPoints(shape);
    if (points.length >= 3) {
      const top = points[0];
      const bottomRight = points[1];
      const bottomLeft = points[2];
      const horizontalDistance = horizontalSide === "bottom"
        ? pointToSegmentDistance(point, bottomLeft, bottomRight)
        : Number.POSITIVE_INFINITY;
      const rightDistance = pointToSegmentDistance(point, top, bottomRight);
      return Math.min(horizontalDistance, rightDistance) <= toleranceWorld;
    }
  }

  if (shape.classList.contains("drawnCircle") && shape instanceof SVGEllipseElement) {
    const cx = Number(shape.getAttribute("cx"));
    const cy = Number(shape.getAttribute("cy"));
    const rx = Number(shape.getAttribute("rx"));
    const ry = Number(shape.getAttribute("ry"));
    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return false;

    const dx = point.x - cx;
    const dy = point.y - cy;
    if (dx === 0 && dy === 0) return false;

    const radialScale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    const edgePoint = {
      x: cx + dx * radialScale,
      y: cy + dy * radialScale,
    };
    if (Math.hypot(edgePoint.x - point.x, edgePoint.y - point.y) > toleranceWorld) {
      return false;
    }

    const edgeDx = edgePoint.x - cx;
    const edgeDy = edgePoint.y - cy;
    const onRightArc = edgeDx >= 0 && Math.abs(edgeDx) + EPSILON >= Math.abs(edgeDy);
    const onHorizontalArc = horizontalSide === "top"
      ? edgeDy <= 0 && Math.abs(edgeDy) + EPSILON >= Math.abs(edgeDx)
      : edgeDy >= 0 && Math.abs(edgeDy) + EPSILON >= Math.abs(edgeDx);
    return onRightArc || onHorizontalArc;
  }

  const horizontalY = horizontalSide === "bottom" ? bounds.bottom : bounds.top;
  const horizontalDistance = pointToSegmentDistance(
    point,
    { x: bounds.left, y: horizontalY },
    { x: bounds.right, y: horizontalY },
  );
  const rightDistance = pointToSegmentDistance(
    point,
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
  );
  return Math.min(horizontalDistance, rightDistance) <= toleranceWorld;
}

function forceTouchesDisplayedDimensionSide(
  shape: SVGGraphicsElement,
  canvas: HTMLElement,
) {
  const scale = shapeScale(shape);
  const horizontalSide = horizontalDimensionSide(shape);
  const forceLines = canvas.querySelectorAll<SVGLineElement>("line[data-force-vector]");

  for (const line of forceLines) {
    const arrowTip = {
      x: Number(line.getAttribute("x2")),
      y: Number(line.getAttribute("y2")),
    };
    if (![arrowTip.x, arrowTip.y].every(Number.isFinite)) continue;

    if (forcePointTouchesDisplayedSide(shape, arrowTip, scale, horizontalSide)) {
      return true;
    }
  }

  return false;
}

function readElementWidth(element: Element | null, fallback: number) {
  if (element instanceof SVGRectElement) {
    const width = Number(element.getAttribute("width"));
    if (Number.isFinite(width) && width > 0) return width;
  }
  return fallback;
}

function labelWidth(label: SVGTextElement) {
  try {
    const width = label.getBBox().width;
    return Number.isFinite(width) && width > 0 ? width : 0;
  } catch {
    return 0;
  }
}

function positionLabelBackground(
  label: SVGTextElement,
  centerX: number,
  centerY: number,
) {
  const background = label.previousElementSibling;
  if (
    !(background instanceof SVGRectElement) ||
    !background.classList.contains("dimensionLabelBackground")
  ) {
    return;
  }

  const width = readElementWidth(background, Math.max(44, labelWidth(label) + 14));
  setNumberAttribute(background, "x", centerX - width / 2);
  setNumberAttribute(background, "y", centerY - 9);
}

function positionDimensions(
  group: SVGGElement,
  shape: SVGGraphicsElement,
  inside: boolean,
) {
  const bounds = screenBounds(shape);
  if (!bounds) return;

  const { left, right, top, bottom, width, height } = bounds;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const horizontalBelow = horizontalDimensionSide(shape) === "bottom";

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

  const heightBackground = heightLabel.previousElementSibling;
  const verticalVisualWidth = readElementWidth(
    heightBackground,
    Math.max(44, labelWidth(heightLabel) + 14),
  );
  const verticalOffset = Math.max(
    MIN_VERTICAL_OFFSET,
    verticalVisualWidth / 2 + LABEL_CLEARANCE,
  );

  const outsideHorizontalY = horizontalBelow
    ? bottom + DIMENSION_OFFSET
    : top - DIMENSION_OFFSET;
  const insideHorizontalY = horizontalBelow
    ? Math.max(top, bottom - DIMENSION_OFFSET)
    : Math.min(bottom, top + DIMENSION_OFFSET);
  const horizontalY = inside ? insideHorizontalY : outsideHorizontalY;

  const outsideVerticalX = right + verticalOffset;
  const insideVerticalX = Math.max(left, right - verticalOffset);
  const verticalX = inside ? insideVerticalX : outsideVerticalX;

  const horizontalArrow = Math.min(ARROW_SIZE, Math.max(3, width / 4));
  const verticalArrow = Math.min(ARROW_SIZE, Math.max(3, height / 4));

  setNumberAttribute(horizontalLine, "x1", left);
  setNumberAttribute(horizontalLine, "x2", right);
  setNumberAttribute(horizontalLine, "y1", horizontalY);
  setNumberAttribute(horizontalLine, "y2", horizontalY);

  setPointsAttribute(
    leftArrow,
    `${left},${horizontalY} ${left + horizontalArrow},${horizontalY - ARROW_HALF_WIDTH} ${left + horizontalArrow},${horizontalY + ARROW_HALF_WIDTH}`,
  );
  setPointsAttribute(
    rightArrow,
    `${right},${horizontalY} ${right - horizontalArrow},${horizontalY - ARROW_HALF_WIDTH} ${right - horizontalArrow},${horizontalY + ARROW_HALF_WIDTH}`,
  );

  setNumberAttribute(widthLabel, "x", centerX);
  setNumberAttribute(widthLabel, "y", horizontalY);
  positionLabelBackground(widthLabel, centerX, horizontalY);

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
    `${verticalX},${top} ${verticalX - ARROW_HALF_WIDTH},${top + verticalArrow} ${verticalX + ARROW_HALF_WIDTH},${top + verticalArrow}`,
  );
  setPointsAttribute(
    bottomArrow,
    `${verticalX},${bottom} ${verticalX - ARROW_HALF_WIDTH},${bottom - verticalArrow} ${verticalX + ARROW_HALF_WIDTH},${bottom - verticalArrow}`,
  );

  setNumberAttribute(heightLabel, "x", verticalX);
  setNumberAttribute(heightLabel, "y", centerY);
  positionLabelBackground(heightLabel, verticalX, centerY);

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

function dimensionShapeType(group: SVGGElement): DimensionShapeType | null {
  const label = group.querySelector<SVGTextElement>(
    '.dimensionLabel[data-dimension-axis="width"]',
  );
  const shapeId = label?.dataset.shapeId ?? "";
  if (shapeId.startsWith("rectangle-")) return "rectangle";
  if (shapeId.startsWith("circle-")) return "circle";
  if (shapeId.startsWith("triangle-")) return "triangle";
  return null;
}

function shapesByType(drawingLayer: SVGSVGElement) {
  return {
    rectangle: Array.from(
      drawingLayer.querySelectorAll<SVGGraphicsElement>(".drawnShape.drawnRectangle"),
    ),
    circle: Array.from(
      drawingLayer.querySelectorAll<SVGGraphicsElement>(".drawnShape.drawnCircle"),
    ),
    triangle: Array.from(
      drawingLayer.querySelectorAll<SVGGraphicsElement>(".drawnShape.drawnTriangle"),
    ),
  };
}

function updateDimensionPositions() {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  const canvas = document.querySelector<HTMLElement>(".canvas");
  if (!drawingLayer || !canvas) return;

  const groups = Array.from(
    drawingLayer.querySelectorAll<SVGGElement>(".dimensionAnnotation"),
  );
  const shapes = shapesByType(drawingLayer);
  const cursors: Record<DimensionShapeType, number> = {
    rectangle: 0,
    circle: 0,
    triangle: 0,
  };

  groups.forEach((group) => {
    const type = dimensionShapeType(group);
    if (!type) return;

    const shape = shapes[type][cursors[type]];
    cursors[type] += 1;
    if (!shape) return;

    const inside = forceTouchesDisplayedDimensionSide(shape, canvas);
    positionDimensions(group, shape, inside);
  });
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
