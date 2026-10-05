"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type Point = { x: number; y: number };
type ForceVector = {
  id: string;
  start: Point;
  end: Point;
  name: string;
  magnitude: number;
};
type ForceTool = "applied" | "distributed" | null;
type ViewTransform = { x: number; y: number; scale: number; raw: string };
type ForceMove = { id: string; pointerId: number; previousPoint: Point };

const MIN_FORCE_LENGTH_PX = 8;
const ARROW_HEAD_LENGTH_PX = 11;
const ARROW_HEAD_HALF_WIDTH_PX = 5;
const FORCE_LABEL_FONT_SIZE_PX = 12;
const FORCE_LABEL_HEIGHT_PX = 14;
const FORCE_LABEL_CLEARANCE_PX = 7;
const ANGLE_RADIUS_PX = 28;
const ANGLE_REFERENCE_LENGTH_PX = 42;

function parseTransform(value: string | null): ViewTransform {
  const raw = value ?? "";
  const translate = raw.match(/translate\(\s*(-?[\d.]+)(?:[ ,]+)(-?[\d.]+)\s*\)/);
  const scale = raw.match(/scale\(\s*([\d.]+)\s*\)/);

  return {
    x: translate ? Number(translate[1]) : 0,
    y: translate ? Number(translate[2]) : 0,
    scale: scale ? Number(scale[1]) : 1,
    raw: raw || "translate(0 0) scale(1)",
  };
}

function vectorLength(force: ForceVector) {
  return Math.hypot(force.end.x - force.start.x, force.end.y - force.start.y);
}

function normalizeSignedAngle(angle: number) {
  let normalized = ((angle + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(normalized + 180) < 0.0001) normalized = 180;
  return normalized;
}

function forceAngle(force: ForceVector) {
  const dx = force.end.x - force.start.x;
  const dy = force.end.y - force.start.y;
  return normalizeSignedAngle((Math.atan2(-dy, dx) * 180) / Math.PI);
}

function formatNumber(value: number, decimals = 2) {
  return Number(value.toFixed(decimals)).toString();
}

function arrowGeometry(start: Point, end: Point, scale: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { shaftEnd: end, headPoints: "" };
  }

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const headLength = Math.min(length, ARROW_HEAD_LENGTH_PX / scale);
  const halfWidth = ARROW_HEAD_HALF_WIDTH_PX / scale;
  const baseX = end.x - ux * headLength;
  const baseY = end.y - uy * headLength;

  return {
    shaftEnd: { x: baseX, y: baseY },
    headPoints: `${end.x},${end.y} ${baseX + px * halfWidth},${baseY + py * halfWidth} ${baseX - px * halfWidth},${baseY - py * halfWidth}`,
  };
}

function forceLabelPosition(force: ForceVector, scale: number, labelText: string) {
  const dx = force.end.x - force.start.x;
  const dy = force.end.y - force.start.y;
  const length = Math.hypot(dx, dy);
  const midpoint = {
    x: (force.start.x + force.end.x) / 2,
    y: (force.start.y + force.end.y) / 2,
  };

  if (length === 0) return midpoint;

  const ux = dx / length;
  const uy = dy / length;
  let nx = -uy;
  let ny = ux;

  if (ny > 0) {
    nx *= -1;
    ny *= -1;
  }

  const estimatedWidth = Math.max(44, labelText.length * 7);
  const projectedHalfSize =
    Math.abs(nx) * (estimatedWidth / 2) +
    Math.abs(ny) * (FORCE_LABEL_HEIGHT_PX / 2);
  const offset = (projectedHalfSize + FORCE_LABEL_CLEARANCE_PX) / scale;

  return {
    x: midpoint.x + nx * offset,
    y: midpoint.y + ny * offset,
  };
}

function angleArc(force: ForceVector, scale: number) {
  const angle = forceAngle(force);
  const radius = ANGLE_RADIUS_PX / scale;
  const radians = (angle * Math.PI) / 180;
  const startPoint = { x: force.start.x + radius, y: force.start.y };
  const endPoint = {
    x: force.start.x + Math.cos(radians) * radius,
    y: force.start.y - Math.sin(radians) * radius,
  };
  const arcPath =
    Math.abs(angle) < 0.01
      ? null
      : `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 0 ${angle < 0 ? 1 : 0} ${endPoint.x} ${endPoint.y}`;
  const labelRadius = radius + 11 / scale;
  const labelRadians = ((angle / 2) * Math.PI) / 180;

  return {
    angle,
    arcPath,
    label: {
      x: force.start.x + Math.cos(labelRadians) * labelRadius,
      y: force.start.y - Math.sin(labelRadians) * labelRadius,
    },
  };
}

export default function AppliedForceLayer() {
  const [canvasRoot, setCanvasRoot] = useState<HTMLElement | null>(null);
  const [tool, setTool] = useState<ForceTool>(null);
  const [forces, setForces] = useState<ForceVector[]>([]);
  const [draft, setDraft] = useState<ForceVector | null>(null);
  const [selectedForceId, setSelectedForceId] = useState<string | null>(null);
  const [view, setView] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
    raw: "translate(0 0) scale(1)",
  });
  const nextForceNumber = useRef(1);
  const moveRef = useRef<ForceMove | null>(null);

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    const worldGroup = drawingLayer?.querySelector<SVGGElement>("g[transform]") ?? null;
    if (!canvas || !drawingLayer || !worldGroup) return;

    setCanvasRoot(canvas);
    setTool((document.documentElement.dataset.forceTool as ForceTool) ?? null);

    const syncView = () => setView(parseTransform(worldGroup.getAttribute("transform")));
    const observer = new MutationObserver(syncView);
    observer.observe(worldGroup, { attributes: true, attributeFilter: ["transform"] });
    syncView();

    function handleToolChange(event: Event) {
      const nextTool = (event as CustomEvent<{ tool: ForceTool }>).detail?.tool ?? null;
      setTool(nextTool);
      if (nextTool !== "applied") setDraft(null);
    }

    function clearSelectionOnCanvas(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-force-vector]")) return;
      setSelectedForceId(null);
    }

    window.addEventListener("forcetoolchange", handleToolChange);
    canvas.addEventListener("pointerdown", clearSelectionOnCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener("forcetoolchange", handleToolChange);
      canvas.removeEventListener("pointerdown", clearSelectionOnCanvas);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRoot;
    if (!canvas || tool !== "applied") return;

    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    let activePointerId: number | null = null;
    let activeForce: ForceVector | null = null;

    function toWorldPoint(event: PointerEvent): Point {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - view.x) / view.scale,
        y: (event.clientY - rect.top - view.y) / view.scale,
      };
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || activePointerId !== null) return;
      if (
        event.target instanceof Element &&
        (event.target.closest(".dimensionLabel") || event.target.closest("[data-force-vector]"))
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedForceId(null);

      const point = toWorldPoint(event);
      const force: ForceVector = {
        id: `force-${Date.now()}-${event.pointerId}`,
        start: point,
        end: point,
        name: `F${nextForceNumber.current++}`,
        magnitude: 0,
      };

      activePointerId = event.pointerId;
      activeForce = force;
      setDraft(force);
      canvas.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      if (activePointerId !== event.pointerId || !activeForce) return;
      event.preventDefault();
      event.stopPropagation();

      const end = toWorldPoint(event);
      const screenLength =
        Math.hypot(end.x - activeForce.start.x, end.y - activeForce.start.y) * view.scale;
      activeForce = {
        ...activeForce,
        end,
        magnitude: Math.max(1, Math.round(screenLength)),
      };
      setDraft(activeForce);
    }

    function finishPointer(event: PointerEvent) {
      if (activePointerId !== event.pointerId || !activeForce) return;
      event.preventDefault();
      event.stopPropagation();

      const end = toWorldPoint(event);
      const screenLength =
        Math.hypot(end.x - activeForce.start.x, end.y - activeForce.start.y) * view.scale;
      const completed = {
        ...activeForce,
        end,
        magnitude: Math.max(1, Math.round(screenLength)),
      };

      if (screenLength >= MIN_FORCE_LENGTH_PX) {
        setForces((current) => [...current, completed]);
        setSelectedForceId(completed.id);
      }

      setDraft(null);
      activeForce = null;
      activePointerId = null;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function cancelDraft(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      activeForce = null;
      activePointerId = null;
      setDraft(null);
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    window.addEventListener("keydown", cancelDraft);

    return () => {
      canvas.style.cursor = previousCursor;
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      window.removeEventListener("keydown", cancelDraft);
    };
  }, [canvasRoot, tool, view.x, view.y, view.scale]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (!selectedForceId || (event.key !== "Delete" && event.key !== "Backspace")) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      setForces((current) => current.filter((force) => force.id !== selectedForceId));
      setSelectedForceId(null);
    }

    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [selectedForceId]);

  function toWorldPoint(clientX: number, clientY: number): Point | null {
    if (!canvasRoot) return null;
    const rect = canvasRoot.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  function beginMove(force: ForceVector, event: ReactPointerEvent<SVGLineElement>) {
    if (event.button !== 0) return;
    const point = toWorldPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedForceId(force.id);
    moveRef.current = {
      id: force.id,
      pointerId: event.pointerId,
      previousPoint: point,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveForce(event: ReactPointerEvent<SVGLineElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;
    const point = toWorldPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = point.x - moving.previousPoint.x;
    const dy = point.y - moving.previousPoint.y;
    moving.previousPoint = point;

    setForces((current) =>
      current.map((force) =>
        force.id === moving.id
          ? {
              ...force,
              start: { x: force.start.x + dx, y: force.start.y + dy },
              end: { x: force.end.x + dx, y: force.end.y + dy },
            }
          : force,
      ),
    );
  }

  function finishMove(event: ReactPointerEvent<SVGLineElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    moveRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const vectors = useMemo(() => (draft ? [...forces, draft] : forces), [forces, draft]);

  if (!canvasRoot) return null;

  return createPortal(
    <svg
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
        {vectors.map((force) => {
          const isDraft = draft?.id === force.id;
          const isSelected = !isDraft && selectedForceId === force.id;
          const labelText = `${force.name} = ${formatNumber(force.magnitude)} N`;
          const label = forceLabelPosition(force, view.scale, labelText);
          const angleInfo = isSelected ? angleArc(force, view.scale) : null;
          const referenceLength = ANGLE_REFERENCE_LENGTH_PX / view.scale;
          const arrow = arrowGeometry(force.start, force.end, view.scale);

          return (
            <g key={force.id} opacity={isDraft ? 0.68 : 1}>
              {!isDraft && (
                <line
                  data-force-vector
                  x1={force.start.x}
                  y1={force.start.y}
                  x2={force.end.x}
                  y2={force.end.y}
                  stroke="transparent"
                  strokeWidth={18}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  style={{ cursor: moveRef.current?.id === force.id ? "grabbing" : "move" }}
                  onPointerDown={(event) => beginMove(force, event)}
                  onPointerMove={moveForce}
                  onPointerUp={finishMove}
                  onPointerCancel={finishMove}
                />
              )}

              {isSelected && angleInfo && (
                <g pointerEvents="none">
                  <line
                    x1={force.start.x}
                    y1={force.start.y}
                    x2={force.start.x + referenceLength}
                    y2={force.start.y}
                    stroke="#9aa1aa"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  {angleInfo.arcPath && (
                    <path
                      d={angleInfo.arcPath}
                      fill="none"
                      stroke="#7d858f"
                      strokeWidth={1.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <text
                    x={angleInfo.label.x}
                    y={angleInfo.label.y}
                    fill="#68717c"
                    fontSize={11 / view.scale}
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {formatNumber(angleInfo.angle, 1)}°
                  </text>
                  <circle
                    cx={force.start.x}
                    cy={force.start.y}
                    r={3.5 / view.scale}
                    fill="#ffffff"
                    stroke="#59636f"
                    strokeWidth={1.3}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}

              <line
                x1={force.start.x}
                y1={force.start.y}
                x2={arrow.shaftEnd.x}
                y2={arrow.shaftEnd.y}
                stroke={isSelected ? "#252c34" : "#3f4852"}
                strokeWidth={isSelected ? 2.4 : 2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={arrow.headPoints}
                fill={isSelected ? "#252c34" : "#3f4852"}
              />

              {vectorLength(force) > 0 && (
                <text
                  x={label.x}
                  y={label.y}
                  fill="#3f4852"
                  fontSize={FORCE_LABEL_FONT_SIZE_PX / view.scale}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                >
                  {labelText}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>,
    canvasRoot,
  );
}
