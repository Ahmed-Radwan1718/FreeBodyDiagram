"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Point = { x: number; y: number };
type ForceVector = { id: string; start: Point; end: Point };
type ForceTool = "applied" | "distributed" | null;

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
  raw: string;
};

const MIN_FORCE_LENGTH_PX = 8;
const ARROW_HEAD_LENGTH_PX = 11;
const ARROW_HEAD_HALF_WIDTH_PX = 5;

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

function arrowHeadPoints(start: Point, end: Point, scale: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return "";

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const headLength = ARROW_HEAD_LENGTH_PX / scale;
  const halfWidth = ARROW_HEAD_HALF_WIDTH_PX / scale;
  const baseX = end.x - ux * headLength;
  const baseY = end.y - uy * headLength;

  const left = {
    x: baseX + px * halfWidth,
    y: baseY + py * halfWidth,
  };
  const right = {
    x: baseX - px * halfWidth,
    y: baseY - py * halfWidth,
  };

  return `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

export default function AppliedForceLayer() {
  const [canvasRoot, setCanvasRoot] = useState<HTMLElement | null>(null);
  const [tool, setTool] = useState<ForceTool>(null);
  const [forces, setForces] = useState<ForceVector[]>([]);
  const [draft, setDraft] = useState<ForceVector | null>(null);
  const [view, setView] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
    raw: "translate(0 0) scale(1)",
  });

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

    window.addEventListener("forcetoolchange", handleToolChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("forcetoolchange", handleToolChange);
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
      if (event.target instanceof Element && event.target.closest(".dimensionLabel")) return;

      event.preventDefault();
      event.stopPropagation();

      const point = toWorldPoint(event);
      const force: ForceVector = {
        id: `force-${Date.now()}-${event.pointerId}`,
        start: point,
        end: point,
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

      activeForce = { ...activeForce, end: toWorldPoint(event) };
      setDraft(activeForce);
    }

    function finishPointer(event: PointerEvent) {
      if (activePointerId !== event.pointerId || !activeForce) return;
      event.preventDefault();
      event.stopPropagation();

      const completed = { ...activeForce, end: toWorldPoint(event) };
      const screenLength =
        Math.hypot(
          completed.end.x - completed.start.x,
          completed.end.y - completed.start.y,
        ) * view.scale;

      if (screenLength >= MIN_FORCE_LENGTH_PX) {
        setForces((current) => [...current, completed]);
      }

      setDraft(null);
      activeForce = null;
      activePointerId = null;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      activeForce = null;
      activePointerId = null;
      setDraft(null);
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.style.cursor = previousCursor;
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvasRoot, tool, view.x, view.y, view.scale]);

  const vectors = useMemo(
    () => (draft ? [...forces, draft] : forces),
    [forces, draft],
  );

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
        zIndex: 1,
      }}
    >
      <g transform={view.raw}>
        {vectors.map((force) => {
          const isDraft = draft?.id === force.id;
          return (
            <g key={force.id} opacity={isDraft ? 0.68 : 1}>
              <line
                x1={force.start.x}
                y1={force.start.y}
                x2={force.end.x}
                y2={force.end.y}
                stroke="#3f4852"
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={arrowHeadPoints(force.start, force.end, view.scale)}
                fill="#3f4852"
              />
            </g>
          );
        })}
      </g>
    </svg>,
    canvasRoot,
  );
}
