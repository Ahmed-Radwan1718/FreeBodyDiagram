"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

const BASE_GRID_SIZE = 40;
const MAJOR_GRID_MULTIPLIER = 5;
const DIMENSION_OFFSET = 28;
const DIMENSION_ARROW_SIZE = 7;
const PARTICLE_SIZE = 14;

type ShapeType = "rectangle" | "circle" | "polygon" | "triangle" | "particle";

type CanvasShape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = { x: number; y: number };

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function formatDimension(value: number) {
  return Number((value / BASE_GRID_SIZE).toFixed(2)).toString();
}

function polygonPoints(shape: CanvasShape, sides = 5) {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  const radiusX = shape.width / 2;
  const radiusY = shape.height / 2;

  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
    return {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function trianglePoints(shape: CanvasShape) {
  return [
    { x: shape.x + shape.width / 2, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
    { x: shape.x, y: shape.y + shape.height },
  ];
}

function pointsAttribute(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function pointInPolygon(point: Point, vertices: Point[]) {
  let inside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

function shapeContainsPoint(shape: CanvasShape, point: Point) {
  if (shape.type === "circle" || shape.type === "particle") {
    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
    const radiusX = shape.width / 2;
    const radiusY = shape.height / 2;

    if (radiusX === 0 || radiusY === 0) return false;

    const normalizedX = (point.x - centerX) / radiusX;
    const normalizedY = (point.y - centerY) / radiusY;
    return normalizedX ** 2 + normalizedY ** 2 <= 1;
  }

  if (shape.type === "triangle") {
    return pointInPolygon(point, trianglePoints(shape));
  }

  if (shape.type === "polygon") {
    return pointInPolygon(point, polygonPoints(shape));
  }

  return (
    point.x >= shape.x &&
    point.x <= shape.x + shape.width &&
    point.y >= shape.y &&
    point.y <= shape.y + shape.height
  );
}

function shapeFromDrag(
  type: Exclude<ShapeType, "particle">,
  id: string,
  startX: number,
  startY: number,
  point: Point,
): CanvasShape {
  const dx = point.x - startX;
  const dy = point.y - startY;

  if (type === "circle") {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      id,
      type,
      x: dx < 0 ? startX - size : startX,
      y: dy < 0 ? startY - size : startY,
      width: size,
      height: size,
    };
  }

  return {
    id,
    type,
    x: Math.min(startX, point.x),
    y: Math.min(startY, point.y),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

export default function Home() {
  const [camera, setCamera] = useState({ x: 0, y: 0, logZoom: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isMovingShape, setIsMovingShape] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShapeType | null>(null);
  const [selectedCanvasShapeId, setSelectedCanvasShapeId] = useState<string | null>(null);
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [draftShape, setDraftShape] = useState<CanvasShape | null>(null);

  const nextShapeId = useRef(1);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const drawRef = useRef<{
    pointerId: number;
    type: Exclude<ShapeType, "particle">;
    startX: number;
    startY: number;
    current: CanvasShape;
  } | null>(null);
  const moveRef = useRef<{
    pointerId: number;
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const scale = Math.exp(camera.logZoom);
  const zoomSteps = camera.logZoom / Math.LN2;
  const zoomLevel = Math.floor(zoomSteps);
  const zoomPhase = zoomSteps - zoomLevel;
  const gridSize = BASE_GRID_SIZE * 2 ** zoomPhase;
  const majorGridSize = gridSize * MAJOR_GRID_MULTIPLIER;

  const canvasStyle = {
    "--grid-size": `${gridSize}px`,
    "--major-grid-size": `${majorGridSize}px`,
    "--grid-x": `${modulo(camera.x, majorGridSize)}px`,
    "--grid-y": `${modulo(camera.y, majorGridSize)}px`,
  } as CSSProperties;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!selectedCanvasShapeId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      setShapes((current) =>
        current.filter((shape) => shape.id !== selectedCanvasShapeId),
      );
      setSelectedCanvasShapeId(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCanvasShapeId]);

  function getWorldPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    return {
      x: (screenX - camera.x) / scale,
      y: (screenY - camera.y) / scale,
    };
  }

  function finishShapeTool() {
    setSelectedShape(null);
    setShapesOpen(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getWorldPoint(event);

    if (selectedShape === "particle") {
      const particle: CanvasShape = {
        id: `particle-${nextShapeId.current++}`,
        type: "particle",
        x: point.x - PARTICLE_SIZE / 2,
        y: point.y - PARTICLE_SIZE / 2,
        width: PARTICLE_SIZE,
        height: PARTICLE_SIZE,
      };
      setShapes((current) => [...current, particle]);
      setSelectedCanvasShapeId(particle.id);
      finishShapeTool();
      return;
    }

    if (selectedShape) {
      const id = `${selectedShape}-${nextShapeId.current++}`;
      const shape = shapeFromDrag(selectedShape, id, point.x, point.y, point);

      drawRef.current = {
        pointerId: event.pointerId,
        type: selectedShape,
        startX: point.x,
        startY: point.y,
        current: shape,
      };
      setDraftShape(shape);
      return;
    }

    const hitShape = [...shapes]
      .reverse()
      .find((shape) => shapeContainsPoint(shape, point));

    if (hitShape) {
      setSelectedCanvasShapeId(hitShape.id);
      moveRef.current = {
        pointerId: event.pointerId,
        id: hitShape.id,
        offsetX: point.x - hitShape.x,
        offsetY: point.y - hitShape.y,
      };
      setIsMovingShape(true);
      return;
    }

    setSelectedCanvasShapeId(null);
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drawing = drawRef.current;
    if (drawing && drawing.pointerId === event.pointerId) {
      const point = getWorldPoint(event);
      const shape = shapeFromDrag(
        drawing.type,
        drawing.current.id,
        drawing.startX,
        drawing.startY,
        point,
      );

      drawing.current = shape;
      setDraftShape(shape);
      return;
    }

    const moving = moveRef.current;
    if (moving && moving.pointerId === event.pointerId) {
      const point = getWorldPoint(event);
      setShapes((current) =>
        current.map((shape) =>
          shape.id === moving.id
            ? { ...shape, x: point.x - moving.offsetX, y: point.y - moving.offsetY }
            : shape,
        ),
      );
      return;
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;

    setCamera((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  }

  function finishPointerInteraction(event: ReactPointerEvent<HTMLElement>) {
    const drawing = drawRef.current;
    if (drawing && drawing.pointerId === event.pointerId) {
      const shape = drawing.current;
      const isLargeEnough = shape.width * scale >= 3 && shape.height * scale >= 3;

      if (isLargeEnough) {
        setShapes((current) => [...current, shape]);
        setSelectedCanvasShapeId(shape.id);
        finishShapeTool();
      }

      drawRef.current = null;
      setDraftShape(null);
    }

    const moving = moveRef.current;
    if (moving && moving.pointerId === event.pointerId) {
      moveRef.current = null;
      setIsMovingShape(false);
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const deltaMultiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const normalizedDelta = event.deltaY * deltaMultiplier;
    const zoomDelta = Math.max(-0.5, Math.min(0.5, -normalizedDelta * 0.0015));
    const zoomFactor = Math.exp(zoomDelta);

    setCamera((current) => ({
      logZoom: current.logZoom + zoomDelta,
      x: cursorX - (cursorX - current.x) * zoomFactor,
      y: cursorY - (cursorY - current.y) * zoomFactor,
    }));
  }

  function toggleShape(shape: ShapeType) {
    setSelectedCanvasShapeId(null);
    setSelectedShape((current) => (current === shape ? null : shape));
  }

  function renderShape(shape: CanvasShape, isDraft = false) {
    const selected = !isDraft && shape.id === selectedCanvasShapeId;
    const className = `drawnShape drawn${shape.type[0].toUpperCase()}${shape.type.slice(1)}${isDraft ? " isDraft" : ""}${selected ? " isCanvasSelected" : ""}`;

    if (shape.type === "circle" || shape.type === "particle") {
      return (
        <ellipse
          key={shape.id}
          className={className}
          cx={shape.x + shape.width / 2}
          cy={shape.y + shape.height / 2}
          rx={shape.width / 2}
          ry={shape.height / 2}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (shape.type === "triangle") {
      return (
        <polygon
          key={shape.id}
          className={className}
          points={pointsAttribute(trianglePoints(shape))}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (shape.type === "polygon") {
      return (
        <polygon
          key={shape.id}
          className={className}
          points={pointsAttribute(polygonPoints(shape))}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    return (
      <rect
        key={shape.id}
        className={className}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  function renderShapeDimensions(shape: CanvasShape) {
    if (
      shape.type !== "rectangle" &&
      shape.type !== "circle" &&
      shape.type !== "triangle"
    ) {
      return null;
    }

    const left = camera.x + shape.x * scale;
    const top = camera.y + shape.y * scale;
    const right = left + shape.width * scale;
    const bottom = top + shape.height * scale;
    const width = right - left;
    const height = bottom - top;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const horizontalBelow = shape.type === "triangle";
    const horizontalY = horizontalBelow
      ? bottom + DIMENSION_OFFSET
      : top - DIMENSION_OFFSET;
    const verticalX = right + DIMENSION_OFFSET;
    const horizontalArrow = Math.min(DIMENSION_ARROW_SIZE, Math.max(3, width / 4));
    const verticalArrow = Math.min(DIMENSION_ARROW_SIZE, Math.max(3, height / 4));
    const widthLabel = formatDimension(shape.width);
    const heightLabel = formatDimension(shape.height);
    const widthLabelWidth = Math.max(28, widthLabel.length * 7 + 12);
    const heightLabelWidth = Math.max(28, heightLabel.length * 7 + 12);
    const horizontalShapeY = horizontalBelow ? bottom : top;
    const horizontalGapDirection = horizontalBelow ? 1 : -1;

    return (
      <g key={`${shape.id}-dimensions`} className="dimensionAnnotation">
        <line className="dimensionExtension" x1={left} y1={horizontalShapeY + horizontalGapDirection * 4} x2={left} y2={horizontalY + horizontalGapDirection * 5} />
        <line className="dimensionExtension" x1={right} y1={horizontalShapeY + horizontalGapDirection * 4} x2={right} y2={horizontalY + horizontalGapDirection * 5} />
        <line className="dimensionLine" x1={left} y1={horizontalY} x2={right} y2={horizontalY} />
        <polygon className="dimensionArrow" points={`${left},${horizontalY} ${left + horizontalArrow},${horizontalY - 3.5} ${left + horizontalArrow},${horizontalY + 3.5}`} />
        <polygon className="dimensionArrow" points={`${right},${horizontalY} ${right - horizontalArrow},${horizontalY - 3.5} ${right - horizontalArrow},${horizontalY + 3.5}`} />
        <rect className="dimensionLabelBackground" x={centerX - widthLabelWidth / 2} y={horizontalY - 9} width={widthLabelWidth} height={18} rx={2} />
        <text className="dimensionLabel" x={centerX} y={horizontalY}>{widthLabel}</text>

        <line className="dimensionExtension" x1={right + 4} y1={top} x2={verticalX + 5} y2={top} />
        <line className="dimensionExtension" x1={right + 4} y1={bottom} x2={verticalX + 5} y2={bottom} />
        <line className="dimensionLine" x1={verticalX} y1={top} x2={verticalX} y2={bottom} />
        <polygon className="dimensionArrow" points={`${verticalX},${top} ${verticalX - 3.5},${top + verticalArrow} ${verticalX + 3.5},${top + verticalArrow}`} />
        <polygon className="dimensionArrow" points={`${verticalX},${bottom} ${verticalX - 3.5},${bottom - verticalArrow} ${verticalX + 3.5},${bottom - verticalArrow}`} />
        <rect className="dimensionLabelBackground" x={verticalX - heightLabelWidth / 2} y={centerY - 9} width={heightLabelWidth} height={18} rx={2} />
        <text className="dimensionLabel" x={verticalX} y={centerY}>{heightLabel}</text>
      </g>
    );
  }

  const shapeOptions: { type: ShapeType; label: string }[] = [
    { type: "rectangle", label: "Rectangle" },
    { type: "circle", label: "Circle" },
    { type: "triangle", label: "Triangle" },
    { type: "polygon", label: "Polygon" },
    { type: "particle", label: "Particle" },
  ];

  function shapeOptionIcon(type: ShapeType) {
    if (type === "circle") return <circle cx="16" cy="16" r="10" />;
    if (type === "triangle") return <polygon points="16,5 27,25 5,25" />;
    if (type === "polygon") return <polygon points="16,5 26,12 22,25 10,25 6,12" />;
    if (type === "particle") return <circle cx="16" cy="16" r="4.5" className="particleOptionDot" />;
    return <rect x="5" y="8" width="22" height="16" rx="1.5" />;
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <h1>Mechanics Workspace</h1>
        </div>

        <div className="sidebarSection">
          <button
            className="sectionHeading sectionButton"
            type="button"
            aria-expanded={shapesOpen}
            aria-controls="shape-options"
            onClick={() => setShapesOpen((open) => !open)}
          >
            <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="12" height="12" rx="1.5" />
              <circle cx="15.5" cy="14.5" r="5.5" />
            </svg>
            <span className="sectionLabel">Shapes</span>
            <svg className={`sectionChevron${shapesOpen ? " isOpen" : ""}`} viewBox="0 0 20 20" aria-hidden="true">
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>

          {shapesOpen && (
            <div className="shapeOptions" id="shape-options">
              {shapeOptions.map((option) => (
                <button
                  key={option.type}
                  className={`shapeOption${selectedShape === option.type ? " isSelected" : ""}`}
                  type="button"
                  aria-pressed={selectedShape === option.type}
                  onClick={() => toggleShape(option.type)}
                >
                  <svg viewBox="0 0 32 32" aria-hidden="true">
                    {shapeOptionIcon(option.type)}
                  </svg>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sidebarSection">
          <div className="sectionHeading">
            <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <path d="M7 12h11" />
              <path d="M14.5 8.5 18 12l-3.5 3.5" />
            </svg>
            <p className="sectionLabel">Forces</p>
          </div>
        </div>
      </aside>

      <section
        className={`canvas${isPanning ? " isPanning" : ""}${isMovingShape ? " isMovingShape" : ""}${selectedShape ? " isDrawing" : ""}`}
        style={canvasStyle}
        aria-label="Free body diagram canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onWheel={handleWheel}
      >
        <svg className="drawingLayer" aria-hidden="true">
          <g transform={`translate(${camera.x} ${camera.y}) scale(${scale})`}>
            {shapes.map((shape) => renderShape(shape))}
            {draftShape && renderShape(draftShape, true)}
          </g>
          {shapes.map(renderShapeDimensions)}
          {draftShape && renderShapeDimensions(draftShape)}
        </svg>
      </section>
    </main>
  );
}
