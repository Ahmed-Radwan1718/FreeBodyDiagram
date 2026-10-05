"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SupportType = "pin" | "roller" | "fixed";
type Point = { x: number; y: number };
type SupportSnapshot = {
  type: SupportType;
  x: number;
  y: number;
  rotation: number;
  index: number;
};
type ViewTransform = {
  raw: string;
  scale: number;
};

const REACTION_STROKE = "#3f4852";
const REACTION_ARROW_LENGTH_PX = 54;
const REACTION_ARROW_HEAD_LENGTH_PX = 9;
const REACTION_ARROW_HEAD_HALF_WIDTH_PX = 4;
const SUPPORT_CONNECTION_TOLERANCE_PX = 3;

function parseViewTransform(value: string | null): ViewTransform {
  const raw = value ?? "translate(0 0) scale(1)";
  const scaleMatch = raw.match(/scale\(\s*([\d.]+)\s*\)/);
  return {
    raw,
    scale: scaleMatch ? Number(scaleMatch[1]) : 1,
  };
}

function parseSupportTransform(value: string | null) {
  const raw = value ?? "";
  const translate = raw.match(/translate\(\s*(-?[\d.]+)(?:[ ,]+)(-?[\d.]+)\s*\)/);
  const rotate = raw.match(/rotate\(\s*(-?[\d.]+)\s*\)/);
  if (!translate) return null;

  return {
    x: Number(translate[1]),
    y: Number(translate[2]),
    rotation: rotate ? Number(rotate[1]) : 0,
  };
}

function inferSupportType(container: Element): SupportType {
  const glyph = container.firstElementChild;
  if (!glyph) return "pin";

  const paths = glyph.querySelectorAll("path").length;
  if (paths === 0) return "fixed";

  const circles = Array.from(glyph.querySelectorAll("circle")).filter(
    (circle) => !circle.hasAttribute("stroke-dasharray"),
  ).length;
  return circles >= 3 ? "roller" : "pin";
}

function closestPointOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return start;

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );

  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
}

function distanceToShapeBoundary(shape: SVGGraphicsElement, point: Point) {
  const tagName = shape.tagName.toLowerCase();

  if (tagName === "rect") {
    const x = Number(shape.getAttribute("x"));
    const y = Number(shape.getAttribute("y"));
    const width = Number(shape.getAttribute("width"));
    const height = Number(shape.getAttribute("height"));
    if (![x, y, width, height].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

    const vertices = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];

    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < vertices.length; index += 1) {
      const candidate = closestPointOnSegment(
        point,
        vertices[index],
        vertices[(index + 1) % vertices.length],
      );
      best = Math.min(best, Math.hypot(candidate.x - point.x, candidate.y - point.y));
    }
    return best;
  }

  if (tagName === "ellipse") {
    const cx = Number(shape.getAttribute("cx"));
    const cy = Number(shape.getAttribute("cy"));
    const rx = Number(shape.getAttribute("rx"));
    const ry = Number(shape.getAttribute("ry"));
    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    const dx = point.x - cx;
    const dy = point.y - cy;
    if (dx === 0 && dy === 0) return Math.min(rx, ry);

    const radialScale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    const candidate = {
      x: cx + dx * radialScale,
      y: cy + dy * radialScale,
    };
    return Math.hypot(candidate.x - point.x, candidate.y - point.y);
  }

  if (tagName === "polygon") {
    const polygon = shape as SVGPolygonElement;
    const vertices: Point[] = [];
    for (let index = 0; index < polygon.points.numberOfItems; index += 1) {
      const vertex = polygon.points.getItem(index);
      vertices.push({ x: vertex.x, y: vertex.y });
    }
    if (vertices.length < 2) return Number.POSITIVE_INFINITY;

    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < vertices.length; index += 1) {
      const candidate = closestPointOnSegment(
        point,
        vertices[index],
        vertices[(index + 1) % vertices.length],
      );
      best = Math.min(best, Math.hypot(candidate.x - point.x, candidate.y - point.y));
    }
    return best;
  }

  return Number.POSITIVE_INFINITY;
}

function isSupportConnected(canvas: HTMLElement, support: SupportSnapshot, scale: number) {
  const tolerance = SUPPORT_CONNECTION_TOLERANCE_PX / Math.max(scale, 0.001);
  const point = { x: support.x, y: support.y };
  const shapes = Array.from(
    canvas.querySelectorAll<SVGGraphicsElement>(
      ".drawingLayer .drawnShape:not(.isDraft)",
    ),
  );

  return shapes.some((shape) => distanceToShapeBoundary(shape, point) <= tolerance);
}

function readSupportSnapshots(canvas: HTMLElement, scale: number): SupportSnapshot[] {
  return Array.from(canvas.querySelectorAll<SVGCircleElement>("circle[data-support-hit]"))
    .flatMap((hit, index) => {
      const transformGroup = hit.parentElement;
      const container = transformGroup?.parentElement;
      if (!transformGroup || !container) return [];

      const position = parseSupportTransform(transformGroup.getAttribute("transform"));
      if (!position) return [];

      const support: SupportSnapshot = {
        type: inferSupportType(container),
        ...position,
        index: index + 1,
      };

      return isSupportConnected(canvas, support, scale) ? [support] : [];
    });
}

function ReactionArrow({
  endX,
  endY,
  scale,
  label,
  fxCoefficient,
  fyCoefficient,
  supportX,
  supportY,
}: {
  endX: number;
  endY: number;
  scale: number;
  label: string;
  fxCoefficient: number;
  fyCoefficient: number;
  supportX: number;
  supportY: number;
}) {
  const unit = 1 / Math.max(scale, 0.001);
  const length = Math.hypot(endX, endY);
  if (length <= 0) return null;

  const ux = endX / length;
  const uy = endY / length;
  const px = -uy;
  const py = ux;
  const headLength = REACTION_ARROW_HEAD_LENGTH_PX * unit;
  const halfWidth = REACTION_ARROW_HEAD_HALF_WIDTH_PX * unit;
  const baseX = endX - ux * headLength;
  const baseY = endY - uy * headLength;
  const labelOffset = 10 * unit;

  return (
    <g
      data-reaction-force
      data-reaction-name={label}
      data-reaction-fx={fxCoefficient}
      data-reaction-fy={fyCoefficient}
      data-reaction-x={supportX}
      data-reaction-y={supportY}
      pointerEvents="none"
    >
      <line
        x1={0}
        y1={0}
        x2={baseX}
        y2={baseY}
        stroke={REACTION_STROKE}
        strokeWidth={1.8 * unit}
        strokeLinecap="round"
      />
      <polygon
        points={`${endX},${endY} ${baseX + px * halfWidth},${baseY + py * halfWidth} ${baseX - px * halfWidth},${baseY - py * halfWidth}`}
        fill={REACTION_STROKE}
      />
      <text
        data-reaction-label
        x={endX + px * labelOffset}
        y={endY + py * labelOffset}
        fill={REACTION_STROKE}
        fontSize={11 * unit}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}

function ReactionMoment({
  x,
  y,
  scale,
  label,
}: {
  x: number;
  y: number;
  scale: number;
  label: string;
}) {
  const unit = 1 / Math.max(scale, 0.001);
  const radius = 27 * unit;
  const startAngle = -45;
  const endAngle = 235;
  const startRadians = (startAngle * Math.PI) / 180;
  const endRadians = (endAngle * Math.PI) / 180;
  const start = {
    x: Math.cos(startRadians) * radius,
    y: Math.sin(startRadians) * radius,
  };
  const end = {
    x: Math.cos(endRadians) * radius,
    y: Math.sin(endRadians) * radius,
  };
  const tangentAngle = endRadians + Math.PI / 2;
  const ux = Math.cos(tangentAngle);
  const uy = Math.sin(tangentAngle);
  const px = -uy;
  const py = ux;
  const headLength = REACTION_ARROW_HEAD_LENGTH_PX * unit;
  const halfWidth = REACTION_ARROW_HEAD_HALF_WIDTH_PX * unit;
  const baseX = end.x - ux * headLength;
  const baseY = end.y - uy * headLength;

  return (
    <g
      data-reaction-moment
      data-reaction-name={label}
      data-reaction-x={x}
      data-reaction-y={y}
      transform={`translate(${x} ${y})`}
      pointerEvents="none"
    >
      <path
        d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${baseX} ${baseY}`}
        fill="none"
        stroke={REACTION_STROKE}
        strokeWidth={1.8 * unit}
        strokeLinecap="round"
      />
      <polygon
        points={`${end.x},${end.y} ${baseX + px * halfWidth},${baseY + py * halfWidth} ${baseX - px * halfWidth},${baseY - py * halfWidth}`}
        fill={REACTION_STROKE}
      />
      <text
        data-reaction-label
        x={-35 * unit}
        y={-32 * unit}
        fill={REACTION_STROKE}
        fontSize={11 * unit}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}

function Reactions({ support, scale }: { support: SupportSnapshot; scale: number }) {
  const unit = 1 / Math.max(scale, 0.001);
  const length = REACTION_ARROW_LENGTH_PX * unit;

  if (support.type === "roller") {
    const radians = (support.rotation * Math.PI) / 180;
    const fxCoefficient = Math.sin(radians);
    const fyCoefficient = Math.cos(radians);
    const label = `R${support.index}n`;

    return (
      <g transform={`translate(${support.x} ${support.y}) rotate(${support.rotation})`}>
        <ReactionArrow
          endX={0}
          endY={-length}
          scale={scale}
          label={label}
          fxCoefficient={fxCoefficient}
          fyCoefficient={fyCoefficient}
          supportX={support.x}
          supportY={support.y}
        />
      </g>
    );
  }

  const xLabel = `R${support.index}x`;
  const yLabel = `R${support.index}y`;

  return (
    <>
      <g transform={`translate(${support.x} ${support.y})`}>
        <ReactionArrow
          endX={length}
          endY={0}
          scale={scale}
          label={xLabel}
          fxCoefficient={1}
          fyCoefficient={0}
          supportX={support.x}
          supportY={support.y}
        />
        <ReactionArrow
          endX={0}
          endY={-length}
          scale={scale}
          label={yLabel}
          fxCoefficient={0}
          fyCoefficient={1}
          supportX={support.x}
          supportY={support.y}
        />
      </g>
      {support.type === "fixed" && (
        <ReactionMoment
          x={support.x}
          y={support.y}
          scale={scale}
          label={`M${support.index}`}
        />
      )}
    </>
  );
}

export default function SupportReactionForces() {
  const [canvasRoot, setCanvasRoot] = useState<HTMLElement | null>(null);
  const [supports, setSupports] = useState<SupportSnapshot[]>([]);
  const [view, setView] = useState<ViewTransform>({
    raw: "translate(0 0) scale(1)",
    scale: 1,
  });
  const signatureRef = useRef("");

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    const worldGroup = drawingLayer?.querySelector<SVGGElement>("g[transform]") ?? null;
    if (!canvas || !worldGroup) return;

    setCanvasRoot(canvas);
    let frame: number | null = null;

    const sync = () => {
      frame = null;
      const nextView = parseViewTransform(worldGroup.getAttribute("transform"));
      const nextSupports = readSupportSnapshots(canvas, nextView.scale);
      const signature = JSON.stringify({ supports: nextSupports, view: nextView });
      if (signature === signatureRef.current) return;

      signatureRef.current = signature;
      setSupports(nextSupports);
      setView(nextView);
    };

    const scheduleSync = (mutations?: MutationRecord[]) => {
      if (
        mutations?.length &&
        mutations.every(
          (mutation) =>
            mutation.target instanceof Element &&
            mutation.target.closest("[data-support-reaction-layer]"),
        )
      ) {
        return;
      }
      if (frame !== null) return;
      frame = requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "transform",
        "x",
        "y",
        "width",
        "height",
        "cx",
        "cy",
        "rx",
        "ry",
        "points",
      ],
    });

    sync();

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  if (!canvasRoot) return null;

  return createPortal(
    <svg
      data-support-reaction-layer
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <g transform={view.raw}>
        {supports.map((support) => (
          <Reactions
            key={`${support.index}-${support.type}-${support.x}-${support.y}-${support.rotation}`}
            support={support}
            scale={view.scale}
          />
        ))}
      </g>
    </svg>,
    canvasRoot,
  );
}
