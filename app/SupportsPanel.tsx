"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type SupportType = "pin" | "roller" | "fixed";
type Point = { x: number; y: number };
type ViewTransform = { x: number; y: number; scale: number; raw: string };
type Support = {
  id: string;
  type: SupportType;
  point: Point;
  rotation: number;
};
type ShapeSnap = {
  point: Point;
  normal: Point;
  distancePx: number;
};
type MoveState = {
  id: string;
  pointerId: number;
  rotation: number;
};

const SUPPORT_OPTIONS: { type: SupportType; label: string }[] = [
  { type: "pin", label: "Pin" },
  { type: "roller", label: "Roller" },
  { type: "fixed", label: "Fixed" },
];

const SUPPORT_SNAP_DISTANCE_PX = 18;
const SUPPORT_STROKE = "#59636f";
const SUPPORT_SELECTED_STROKE = "#252c34";

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

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length <= 0) return { x: 0, y: 1 };
  return { x: point.x / length, y: point.y / length };
}

function shapeCenter(shape: SVGGraphicsElement): Point {
  try {
    const box = shape.getBBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch {
    return { x: 0, y: 0 };
  }
}

function closestPointOnShape(
  shape: SVGGraphicsElement,
  point: Point,
): { point: Point; normal: Point } | null {
  const tagName = shape.tagName.toLowerCase();

  if (tagName === "rect") {
    const x = Number(shape.getAttribute("x"));
    const y = Number(shape.getAttribute("y"));
    const width = Number(shape.getAttribute("width"));
    const height = Number(shape.getAttribute("height"));
    if (![x, y, width, height].every(Number.isFinite)) return null;

    const edges = [
      {
        start: { x, y },
        end: { x: x + width, y },
        normal: { x: 0, y: -1 },
      },
      {
        start: { x: x + width, y },
        end: { x: x + width, y: y + height },
        normal: { x: 1, y: 0 },
      },
      {
        start: { x: x + width, y: y + height },
        end: { x, y: y + height },
        normal: { x: 0, y: 1 },
      },
      {
        start: { x, y: y + height },
        end: { x, y },
        normal: { x: -1, y: 0 },
      },
    ];

    let best: { point: Point; normal: Point; distance: number } | null = null;
    for (const edge of edges) {
      const candidate = closestPointOnSegment(point, edge.start, edge.end);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (!best || distance < best.distance) {
        best = { point: candidate, normal: edge.normal, distance };
      }
    }

    return best ? { point: best.point, normal: best.normal } : null;
  }

  if (tagName === "ellipse") {
    const cx = Number(shape.getAttribute("cx"));
    const cy = Number(shape.getAttribute("cy"));
    const rx = Number(shape.getAttribute("rx"));
    const ry = Number(shape.getAttribute("ry"));
    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return null;

    const dx = point.x - cx;
    const dy = point.y - cy;
    if (dx === 0 && dy === 0) {
      return { point: { x: cx, y: cy + ry }, normal: { x: 0, y: 1 } };
    }

    const radialScale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    const candidate = {
      x: cx + dx * radialScale,
      y: cy + dy * radialScale,
    };
    const normal = normalize({
      x: (candidate.x - cx) / (rx * rx),
      y: (candidate.y - cy) / (ry * ry),
    });
    return { point: candidate, normal };
  }

  if (tagName === "polygon") {
    const polygon = shape as SVGPolygonElement;
    const vertices: Point[] = [];
    for (let index = 0; index < polygon.points.numberOfItems; index += 1) {
      const vertex = polygon.points.getItem(index);
      vertices.push({ x: vertex.x, y: vertex.y });
    }
    if (vertices.length < 2) return null;

    const center = shapeCenter(shape);
    let best: { point: Point; distance: number; start: Point; end: Point } | null = null;

    for (let index = 0; index < vertices.length; index += 1) {
      const start = vertices[index];
      const end = vertices[(index + 1) % vertices.length];
      const candidate = closestPointOnSegment(point, start, end);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (!best || distance < best.distance) {
        best = { point: candidate, distance, start, end };
      }
    }

    if (!best) return null;
    let normal = normalize({ x: best.point.x - center.x, y: best.point.y - center.y });
    if (Math.hypot(normal.x, normal.y) <= 0.001) {
      const dx = best.end.x - best.start.x;
      const dy = best.end.y - best.start.y;
      normal = normalize({ x: -dy, y: dx });
    }
    return { point: best.point, normal };
  }

  return null;
}

function closestShapeSnap(point: Point, scale: number): ShapeSnap | null {
  const shapes = Array.from(
    document.querySelectorAll<SVGGraphicsElement>(
      ".drawingLayer .drawnShape:not(.isDraft)",
    ),
  );

  let closest: ShapeSnap | null = null;
  for (const shape of shapes) {
    const candidate = closestPointOnShape(shape, point);
    if (!candidate) continue;

    const distancePx =
      Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) * scale;
    if (!closest || distancePx < closest.distancePx) {
      closest = { ...candidate, distancePx };
    }
  }

  return closest;
}

function rotationForNormal(normal: Point) {
  return (Math.atan2(normal.y, normal.x) * 180) / Math.PI - 90;
}

function SupportOptionIcon({ type }: { type: SupportType }) {
  if (type === "roller") {
    return (
      <>
        <path d="M16 5 7 19h18L16 5Z" />
        <circle cx="11" cy="23" r="2.2" />
        <circle cx="21" cy="23" r="2.2" />
        <path d="M5 27h22" />
      </>
    );
  }

  if (type === "fixed") {
    return (
      <>
        <path d="M7 5v22" />
        <path d="M7 16h19" />
        <path d="m3 8 4-3M3 14l4-3M3 20l4-3M3 26l4-3" />
      </>
    );
  }

  return (
    <>
      <circle cx="16" cy="6" r="2.2" />
      <path d="M16 8 7 22h18L16 8Z" />
      <path d="M5 26h22" />
    </>
  );
}

function SupportGlyph({
  support,
  scale,
  selected,
}: {
  support: Support;
  scale: number;
  selected: boolean;
}) {
  const unit = 1 / Math.max(scale, 0.001);
  const stroke = selected ? SUPPORT_SELECTED_STROKE : SUPPORT_STROKE;
  const strokeWidth = selected ? 2 : 1.7;
  const hatchXs = [-12, -6, 0, 6, 12];

  return (
    <g transform={`translate(${support.point.x} ${support.point.y}) rotate(${support.rotation})`}>
      {selected && (
        <circle
          cx={0}
          cy={11 * unit}
          r={20 * unit}
          fill="none"
          stroke="#9ca3ad"
          strokeWidth={1}
          strokeDasharray={`${4 * unit} ${4 * unit}`}
        />
      )}

      {support.type === "pin" && (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
          <circle cx={0} cy={0} r={2.8 * unit} fill="#ffffff" />
          <path d={`M 0 ${3 * unit} L ${-11 * unit} ${18 * unit} L ${11 * unit} ${18 * unit} Z`} fill="#ffffff" />
          <line x1={-14 * unit} y1={18 * unit} x2={14 * unit} y2={18 * unit} />
          {hatchXs.map((x) => (
            <line key={x} x1={x * unit} y1={19 * unit} x2={(x - 4) * unit} y2={24 * unit} />
          ))}
        </g>
      )}

      {support.type === "roller" && (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
          <circle cx={0} cy={0} r={2.6 * unit} fill="#ffffff" />
          <path d={`M 0 ${3 * unit} L ${-11 * unit} ${15 * unit} L ${11 * unit} ${15 * unit} Z`} fill="#ffffff" />
          <circle cx={-6 * unit} cy={19 * unit} r={3 * unit} fill="#ffffff" />
          <circle cx={6 * unit} cy={19 * unit} r={3 * unit} fill="#ffffff" />
          <line x1={-14 * unit} y1={23 * unit} x2={14 * unit} y2={23 * unit} />
          {hatchXs.map((x) => (
            <line key={x} x1={x * unit} y1={24 * unit} x2={(x - 4) * unit} y2={29 * unit} />
          ))}
        </g>
      )}

      {support.type === "fixed" && (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke">
          <line x1={0} y1={0} x2={0} y2={5 * unit} />
          <line x1={-14 * unit} y1={5 * unit} x2={14 * unit} y2={5 * unit} strokeWidth={selected ? 2.8 : 2.4} />
          {hatchXs.map((x) => (
            <line key={x} x1={x * unit} y1={6 * unit} x2={(x - 5) * unit} y2={13 * unit} />
          ))}
        </g>
      )}
    </g>
  );
}

export default function SupportsPanel() {
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null);
  const [canvasRoot, setCanvasRoot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<SupportType | null>(null);
  const [supports, setSupports] = useState<Support[]>([]);
  const [selectedSupportId, setSelectedSupportId] = useState<string | null>(null);
  const [view, setView] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
    raw: "translate(0 0) scale(1)",
  });
  const nextSupportId = useRef(1);
  const moveRef = useRef<MoveState | null>(null);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const canvas = document.querySelector<HTMLElement>(".canvas");
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    const worldGroup = drawingLayer?.querySelector<SVGGElement>("g[transform]") ?? null;
    if (!sidebar || !canvas || !worldGroup) return;

    setSidebarRoot(sidebar);
    setCanvasRoot(canvas);
    setSelectedTool(
      (document.documentElement.dataset.supportTool as SupportType | undefined) ?? null,
    );

    const syncView = () => setView(parseTransform(worldGroup.getAttribute("transform")));
    const observer = new MutationObserver(syncView);
    observer.observe(worldGroup, { attributes: true, attributeFilter: ["transform"] });
    syncView();

    function handleSupportToolChange(event: Event) {
      const tool = (event as CustomEvent<{ tool: SupportType | null }>).detail?.tool ?? null;
      setSelectedTool(tool);
    }

    function handleSidebarClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const option = event.target.closest<HTMLButtonElement>(".shapeOption");
      if (!option || option.hasAttribute("data-support-tool")) return;

      setSelectedTool(null);
      delete document.documentElement.dataset.supportTool;
      window.dispatchEvent(
        new CustomEvent("supporttoolchange", { detail: { tool: null } }),
      );
    }

    function clearSelection(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-support-hit]")) return;
      setSelectedSupportId(null);
    }

    window.addEventListener("supporttoolchange", handleSupportToolChange);
    sidebar.addEventListener("click", handleSidebarClick, true);
    canvas.addEventListener("pointerdown", clearSelection);

    return () => {
      observer.disconnect();
      window.removeEventListener("supporttoolchange", handleSupportToolChange);
      sidebar.removeEventListener("click", handleSidebarClick, true);
      canvas.removeEventListener("pointerdown", clearSelection);
    };
  }, []);

  function setTool(tool: SupportType | null) {
    setSelectedTool(tool);
    if (tool) document.documentElement.dataset.supportTool = tool;
    else delete document.documentElement.dataset.supportTool;
    window.dispatchEvent(
      new CustomEvent("supporttoolchange", { detail: { tool } }),
    );
  }

  function toggleTool(tool: SupportType) {
    const nextTool = selectedTool === tool ? null : tool;

    if (nextTool && sidebarRoot) {
      const selectedShapeButton = sidebarRoot.querySelector<HTMLButtonElement>(
        ".shapeOption.isSelected:not([data-force-tool]):not([data-support-tool])",
      );
      selectedShapeButton?.click();

      const selectedForceButton = sidebarRoot.querySelector<HTMLButtonElement>(
        ".shapeOption.isSelected[data-force-tool]",
      );
      selectedForceButton?.click();
    }

    setTool(nextTool);
  }

  function toWorldPoint(clientX: number, clientY: number): Point | null {
    if (!canvasRoot) return null;
    const rect = canvasRoot.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  useEffect(() => {
    const canvas = canvasRoot;
    if (!canvas || !selectedTool) return;

    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    function placeSupport(event: PointerEvent) {
      if (event.button !== 0) return;
      if (
        event.target instanceof Element &&
        (event.target.closest(".dimensionLabel") ||
          event.target.closest("[data-force-vector]") ||
          event.target.closest("[data-force-label]") ||
          event.target.closest("[data-force-editor]") ||
          event.target.closest("[data-support-hit]"))
      ) {
        return;
      }

      const point = toWorldPoint(event.clientX, event.clientY);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();

      const snap = closestShapeSnap(point, view.scale);
      const useSnap = snap && snap.distancePx <= SUPPORT_SNAP_DISTANCE_PX;
      const support: Support = {
        id: `support-${nextSupportId.current++}`,
        type: selectedTool,
        point: useSnap ? snap.point : point,
        rotation: useSnap ? rotationForNormal(snap.normal) : 0,
      };

      setSupports((current) => [...current, support]);
      setSelectedSupportId(support.id);
      setTool(null);
      setOpen(false);
    }

    function cancelTool(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setTool(null);
    }

    canvas.addEventListener("pointerdown", placeSupport);
    window.addEventListener("keydown", cancelTool);

    return () => {
      canvas.style.cursor = previousCursor;
      canvas.removeEventListener("pointerdown", placeSupport);
      window.removeEventListener("keydown", cancelTool);
    };
  }, [canvasRoot, selectedTool, view.x, view.y, view.scale]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (!selectedSupportId || (event.key !== "Delete" && event.key !== "Backspace")) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      setSupports((current) => current.filter((support) => support.id !== selectedSupportId));
      setSelectedSupportId(null);
    }

    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [selectedSupportId]);

  function beginMove(support: Support, event: ReactPointerEvent<SVGCircleElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedSupportId(support.id);
    moveRef.current = {
      id: support.id,
      pointerId: event.pointerId,
      rotation: support.rotation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSupport(event: ReactPointerEvent<SVGCircleElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;
    const point = toWorldPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();

    const snap = closestShapeSnap(point, view.scale);
    const useSnap = snap && snap.distancePx <= SUPPORT_SNAP_DISTANCE_PX;
    const nextPoint = useSnap ? snap.point : point;
    const nextRotation = useSnap ? rotationForNormal(snap.normal) : moving.rotation;

    setSupports((current) =>
      current.map((support) =>
        support.id === moving.id
          ? { ...support, point: nextPoint, rotation: nextRotation }
          : support,
      ),
    );
  }

  function finishMove(event: ReactPointerEvent<SVGCircleElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    moveRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!sidebarRoot || !canvasRoot) return null;

  const sidebarPanel = createPortal(
    <div className="sidebarSection">
      <button
        className="sectionHeading sectionButton"
        type="button"
        aria-expanded={open}
        aria-controls="support-options"
        onClick={() => setOpen((current) => !current)}
      >
        <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5.5" r="1.7" />
          <path d="M12 7.5 6 17h12l-6-9.5Z" />
          <path d="M4 20h16" />
        </svg>
        <span className="sectionLabel">Supports</span>
        <svg
          className={`sectionChevron${open ? " isOpen" : ""}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="shapeOptions" id="support-options">
          {SUPPORT_OPTIONS.map((option) => (
            <button
              key={option.type}
              data-support-tool={option.type}
              className={`shapeOption${selectedTool === option.type ? " isSelected" : ""}`}
              type="button"
              aria-pressed={selectedTool === option.type}
              onClick={() => toggleTool(option.type)}
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <SupportOptionIcon type={option.type} />
              </svg>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    sidebarRoot,
  );

  const canvasLayer = createPortal(
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <g transform={view.raw}>
        {supports.map((support) => (
          <g key={support.id}>
            <SupportGlyph
              support={support}
              scale={view.scale}
              selected={selectedSupportId === support.id}
            />
            <g transform={`translate(${support.point.x} ${support.point.y})`}>
              <circle
                data-support-hit
                cx={0}
                cy={11 / view.scale}
                r={22 / view.scale}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: moveRef.current?.id === support.id ? "grabbing" : "move" }}
                onPointerDown={(event) => beginMove(support, event)}
                onPointerMove={moveSupport}
                onPointerUp={finishMove}
                onPointerCancel={finishMove}
              />
            </g>
          </g>
        ))}
      </g>
    </svg>,
    canvasRoot,
  );

  return (
    <>
      {sidebarPanel}
      {canvasLayer}
    </>
  );
}
