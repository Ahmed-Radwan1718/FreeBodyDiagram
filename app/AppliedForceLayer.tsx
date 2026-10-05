"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AppliedForceLayer.module.css";

type Point = { x: number; y: number };
type ForceVector = {
  id: string;
  start: Point;
  end: Point;
  name: string;
  magnitude: number;
};
type ForceTool = "applied" | "distributed" | null;

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
  raw: string;
};

type EditorValues = {
  name: string;
  magnitude: string;
  angle: string;
};

const MIN_FORCE_LENGTH_PX = 8;
const ARROW_HEAD_LENGTH_PX = 11;
const ARROW_HEAD_HALF_WIDTH_PX = 5;
const FORCE_LABEL_OFFSET_PX = 17;
const ANGLE_RADIUS_PX = 28;
const ANGLE_REFERENCE_LENGTH_PX = 42;
const PROPERTIES_CARD_WIDTH = 218;
const PROPERTIES_CARD_HEIGHT = 128;

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

function forceLabelPosition(force: ForceVector, scale: number) {
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

  // Favor the visual "above" side of the shaft so labels stay consistent.
  if (ny > 0) {
    nx *= -1;
    ny *= -1;
  }

  const offset = FORCE_LABEL_OFFSET_PX / scale;
  return {
    x: midpoint.x + nx * offset,
    y: midpoint.y + ny * offset,
  };
}

function angleArc(force: ForceVector, scale: number) {
  const angle = forceAngle(force);
  const radius = ANGLE_RADIUS_PX / scale;
  const radians = (angle * Math.PI) / 180;
  const startPoint = {
    x: force.start.x + radius,
    y: force.start.y,
  };
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
  const label = {
    x: force.start.x + Math.cos(labelRadians) * labelRadius,
    y: force.start.y - Math.sin(labelRadians) * labelRadius,
  };

  return { angle, radius, arcPath, label };
}

export default function AppliedForceLayer() {
  const [canvasRoot, setCanvasRoot] = useState<HTMLElement | null>(null);
  const [tool, setTool] = useState<ForceTool>(null);
  const [forces, setForces] = useState<ForceVector[]>([]);
  const [draft, setDraft] = useState<ForceVector | null>(null);
  const [selectedForceId, setSelectedForceId] = useState<string | null>(null);
  const [editorValues, setEditorValues] = useState<EditorValues | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
    raw: "translate(0 0) scale(1)",
  });
  const nextForceNumber = useRef(1);

  const selectedForce = useMemo(
    () => forces.find((force) => force.id === selectedForceId) ?? null,
    [forces, selectedForceId],
  );

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    const worldGroup = drawingLayer?.querySelector<SVGGElement>("g[transform]") ?? null;
    if (!canvas || !drawingLayer || !worldGroup) return;

    setCanvasRoot(canvas);
    setTool((document.documentElement.dataset.forceTool as ForceTool) ?? null);

    const syncView = () => setView(parseTransform(worldGroup.getAttribute("transform")));
    const syncCanvasSize = () =>
      setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });

    const transformObserver = new MutationObserver(syncView);
    transformObserver.observe(worldGroup, { attributes: true, attributeFilter: ["transform"] });

    const resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(canvas);

    syncView();
    syncCanvasSize();

    function handleToolChange(event: Event) {
      const nextTool = (event as CustomEvent<{ tool: ForceTool }>).detail?.tool ?? null;
      setTool(nextTool);
      if (nextTool !== "applied") setDraft(null);
    }

    function clearSelectionOnCanvas(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-force-vector]") || event.target.closest("[data-force-editor]")) {
        return;
      }
      setSelectedForceId(null);
      setEditorValues(null);
    }

    window.addEventListener("forcetoolchange", handleToolChange);
    canvas.addEventListener("pointerdown", clearSelectionOnCanvas);

    return () => {
      transformObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("forcetoolchange", handleToolChange);
      canvas.removeEventListener("pointerdown", clearSelectionOnCanvas);
    };
  }, []);

  useEffect(() => {
    if (!selectedForce) {
      setEditorValues(null);
      return;
    }

    setEditorValues({
      name: selectedForce.name,
      magnitude: formatNumber(selectedForce.magnitude),
      angle: formatNumber(forceAngle(selectedForce), 1),
    });
  }, [selectedForceId]);

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
        (event.target.closest(".dimensionLabel") ||
          event.target.closest("[data-force-vector]") ||
          event.target.closest("[data-force-editor]"))
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedForceId(null);
      setEditorValues(null);

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
      const completed: ForceVector = {
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
      setEditorValues(null);
    }

    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [selectedForceId]);

  function updateForce(id: string, updater: (force: ForceVector) => ForceVector) {
    setForces((current) =>
      current.map((force) => (force.id === id ? updater(force) : force)),
    );
  }

  function selectForce(force: ForceVector) {
    setSelectedForceId(force.id);
    setEditorValues({
      name: force.name,
      magnitude: formatNumber(force.magnitude),
      angle: formatNumber(forceAngle(force), 1),
    });
  }

  function commitName() {
    if (!selectedForce || !editorValues) return;
    const nextName = editorValues.name.trim();
    if (!nextName) {
      setEditorValues((current) =>
        current ? { ...current, name: selectedForce.name } : current,
      );
      return;
    }

    updateForce(selectedForce.id, (force) => ({ ...force, name: nextName }));
    setEditorValues((current) => (current ? { ...current, name: nextName } : current));
  }

  function commitMagnitude() {
    if (!selectedForce || !editorValues) return;
    const nextMagnitude = Number(editorValues.magnitude);
    if (!Number.isFinite(nextMagnitude) || nextMagnitude <= 0) {
      setEditorValues((current) =>
        current
          ? { ...current, magnitude: formatNumber(selectedForce.magnitude) }
          : current,
      );
      return;
    }

    updateForce(selectedForce.id, (force) => {
      const length = vectorLength(force);
      if (length === 0) return { ...force, magnitude: nextMagnitude };

      const dx = force.end.x - force.start.x;
      const dy = force.end.y - force.start.y;
      const ux = dx / length;
      const uy = dy / length;
      const unitsPerNewton =
        force.magnitude > 0 ? length / force.magnitude : 1 / Math.max(view.scale, 0.0001);
      const nextLength = unitsPerNewton * nextMagnitude;

      return {
        ...force,
        magnitude: nextMagnitude,
        end: {
          x: force.start.x + ux * nextLength,
          y: force.start.y + uy * nextLength,
        },
      };
    });

    setEditorValues((current) =>
      current ? { ...current, magnitude: formatNumber(nextMagnitude) } : current,
    );
  }

  function commitAngle() {
    if (!selectedForce || !editorValues) return;
    const enteredAngle = Number(editorValues.angle);
    if (!Number.isFinite(enteredAngle)) {
      setEditorValues((current) =>
        current ? { ...current, angle: formatNumber(forceAngle(selectedForce), 1) } : current,
      );
      return;
    }

    const nextAngle = normalizeSignedAngle(enteredAngle);
    updateForce(selectedForce.id, (force) => {
      const length = vectorLength(force);
      const radians = (nextAngle * Math.PI) / 180;
      return {
        ...force,
        end: {
          x: force.start.x + Math.cos(radians) * length,
          y: force.start.y - Math.sin(radians) * length,
        },
      };
    });

    setEditorValues((current) =>
      current ? { ...current, angle: formatNumber(nextAngle, 1) } : current,
    );
  }

  const vectors = useMemo(
    () => (draft ? [...forces, draft] : forces),
    [forces, draft],
  );

  const propertiesPosition = useMemo(() => {
    if (!selectedForce || canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const midpointX =
      view.x + ((selectedForce.start.x + selectedForce.end.x) / 2) * view.scale;
    const midpointY =
      view.y + ((selectedForce.start.y + selectedForce.end.y) / 2) * view.scale;

    const left = Math.max(
      8,
      Math.min(midpointX + 22, canvasSize.width - PROPERTIES_CARD_WIDTH - 8),
    );
    const top = Math.max(
      8,
      Math.min(midpointY + 22, canvasSize.height - PROPERTIES_CARD_HEIGHT - 8),
    );

    return { left, top };
  }, [selectedForce, canvasSize, view.x, view.y, view.scale]);

  if (!canvasRoot) return null;

  return createPortal(
    <>
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
            const label = forceLabelPosition(force, view.scale);
            const angleInfo = isSelected ? angleArc(force, view.scale) : null;
            const referenceLength = ANGLE_REFERENCE_LENGTH_PX / view.scale;

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
                    strokeWidth={16}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="stroke"
                    style={{ cursor: "pointer" }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectForce(force);
                    }}
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
                  x2={force.end.x}
                  y2={force.end.y}
                  stroke={isSelected ? "#252c34" : "#3f4852"}
                  strokeWidth={isSelected ? 2.4 : 2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={arrowHeadPoints(force.start, force.end, view.scale)}
                  fill={isSelected ? "#252c34" : "#3f4852"}
                />

                {vectorLength(force) > 0 && (
                  <text
                    x={label.x}
                    y={label.y}
                    fill="#3f4852"
                    fontSize={12 / view.scale}
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    {force.name} = {formatNumber(force.magnitude)} N
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {selectedForce && editorValues && propertiesPosition && (
        <div
          className={styles.propertiesCard}
          data-force-editor
          style={{ left: propertiesPosition.left, top: propertiesPosition.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className={styles.propertiesTitle}>Applied force</p>

          <label className={styles.propertyRow}>
            <span className={styles.propertyLabel}>Name</span>
            <span className={styles.inputWrap}>
              <input
                className={`${styles.propertyInput} ${styles.nameInput}`}
                type="text"
                value={editorValues.name}
                onChange={(event) =>
                  setEditorValues((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setEditorValues((current) =>
                      current ? { ...current, name: selectedForce.name } : current,
                    );
                    event.currentTarget.blur();
                  }
                }}
              />
            </span>
          </label>

          <label className={styles.propertyRow}>
            <span className={styles.propertyLabel}>Magnitude</span>
            <span className={styles.inputWrap}>
              <input
                className={styles.propertyInput}
                type="number"
                min="0"
                step="any"
                value={editorValues.magnitude}
                onChange={(event) =>
                  setEditorValues((current) =>
                    current ? { ...current, magnitude: event.target.value } : current,
                  )
                }
                onBlur={commitMagnitude}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setEditorValues((current) =>
                      current
                        ? { ...current, magnitude: formatNumber(selectedForce.magnitude) }
                        : current,
                    );
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className={styles.inputSuffix}>N</span>
            </span>
          </label>

          <label className={styles.propertyRow}>
            <span className={styles.propertyLabel}>Angle</span>
            <span className={styles.inputWrap}>
              <input
                className={styles.propertyInput}
                type="number"
                step="any"
                value={editorValues.angle}
                onChange={(event) =>
                  setEditorValues((current) =>
                    current ? { ...current, angle: event.target.value } : current,
                  )
                }
                onBlur={commitAngle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setEditorValues((current) =>
                      current
                        ? { ...current, angle: formatNumber(forceAngle(selectedForce), 1) }
                        : current,
                    );
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className={styles.inputSuffix}>°</span>
            </span>
          </label>
        </div>
      )}
    </>,
    canvasRoot,
  );
}
