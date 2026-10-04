"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

const BASE_GRID_SIZE = 40;
const MAJOR_GRID_MULTIPLIER = 5;

type ShapeType = "rectangle" | "circle" | "polygon" | "triangle";

type RectangleShape = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export default function Home() {
  const [camera, setCamera] = useState({ x: 0, y: 0, logZoom: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isMovingShape, setIsMovingShape] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShapeType | null>(null);
  const [rectangles, setRectangles] = useState<RectangleShape[]>([]);
  const [draftRectangle, setDraftRectangle] = useState<RectangleShape | null>(null);

  const nextShapeId = useRef(1);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const drawRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    current: RectangleShape;
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

  function getWorldPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    return {
      x: (screenX - camera.x) / scale,
      y: (screenY - camera.y) / scale,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    if (selectedShape === "rectangle") {
      const point = getWorldPoint(event);
      const rectangle: RectangleShape = {
        id: `rectangle-${nextShapeId.current++}`,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      };

      drawRef.current = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        current: rectangle,
      };
      setDraftRectangle(rectangle);
      return;
    }

    const point = getWorldPoint(event);
    const hitRectangle = [...rectangles]
      .reverse()
      .find(
        (rectangle) =>
          point.x >= rectangle.x &&
          point.x <= rectangle.x + rectangle.width &&
          point.y >= rectangle.y &&
          point.y <= rectangle.y + rectangle.height,
      );

    if (hitRectangle) {
      moveRef.current = {
        pointerId: event.pointerId,
        id: hitRectangle.id,
        offsetX: point.x - hitRectangle.x,
        offsetY: point.y - hitRectangle.y,
      };
      setIsMovingShape(true);
      return;
    }

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
      const rectangle: RectangleShape = {
        id: drawing.current.id,
        x: Math.min(drawing.startX, point.x),
        y: Math.min(drawing.startY, point.y),
        width: Math.abs(point.x - drawing.startX),
        height: Math.abs(point.y - drawing.startY),
      };

      drawing.current = rectangle;
      setDraftRectangle(rectangle);
      return;
    }

    const moving = moveRef.current;
    if (moving && moving.pointerId === event.pointerId) {
      const point = getWorldPoint(event);

      setRectangles((current) =>
        current.map((rectangle) =>
          rectangle.id === moving.id
            ? {
                ...rectangle,
                x: point.x - moving.offsetX,
                y: point.y - moving.offsetY,
              }
            : rectangle,
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
      const rectangle = drawing.current;
      const isLargeEnough = rectangle.width * scale >= 3 && rectangle.height * scale >= 3;

      if (isLargeEnough) {
        setRectangles((current) => [...current, rectangle]);
        setSelectedShape(null);
        setShapesOpen(false);
      }

      drawRef.current = null;
      setDraftRectangle(null);
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
    setSelectedShape((current) => (current === shape ? null : shape));
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
            <svg
              className="sectionIcon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="12" height="12" rx="1.5" />
              <circle cx="15.5" cy="14.5" r="5.5" />
            </svg>
            <span className="sectionLabel">Shapes</span>
            <svg
              className={`sectionChevron${shapesOpen ? " isOpen" : ""}`}
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>

          {shapesOpen && (
            <div className="shapeOptions" id="shape-options">
              <button
                className={`shapeOption${selectedShape === "rectangle" ? " isSelected" : ""}`}
                type="button"
                aria-pressed={selectedShape === "rectangle"}
                onClick={() => toggleShape("rectangle")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <rect x="5" y="8" width="22" height="16" rx="1.5" />
                </svg>
                <span>Rectangle</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "circle" ? " isSelected" : ""}`}
                type="button"
                aria-pressed={selectedShape === "circle"}
                onClick={() => toggleShape("circle")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <circle cx="16" cy="16" r="10" />
                </svg>
                <span>Circle</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "polygon" ? " isSelected" : ""}`}
                type="button"
                aria-pressed={selectedShape === "polygon"}
                onClick={() => toggleShape("polygon")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <polygon points="16,5 26,12 22,25 10,25 6,12" />
                </svg>
                <span>Polygon</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "triangle" ? " isSelected" : ""}`}
                type="button"
                aria-pressed={selectedShape === "triangle"}
                onClick={() => toggleShape("triangle")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <polygon points="16,5 27,25 5,25" />
                </svg>
                <span>Triangle</span>
              </button>
            </div>
          )}
        </div>

        <div className="sidebarSection">
          <div className="sectionHeading">
            <svg
              className="sectionIcon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.8" />
              <path d="M7 12h11" />
              <path d="M14.5 8.5 18 12l-3.5 3.5" />
            </svg>
            <p className="sectionLabel">Forces</p>
          </div>
        </div>
      </aside>

      <section
        className={`canvas${isPanning ? " isPanning" : ""}${isMovingShape ? " isMovingShape" : ""}${selectedShape === "rectangle" ? " isDrawing" : ""}`}
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
            {rectangles.map((rectangle) => (
              <rect
                key={rectangle.id}
                className="drawnRectangle"
                x={rectangle.x}
                y={rectangle.y}
                width={rectangle.width}
                height={rectangle.height}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {draftRectangle && (
              <rect
                className="drawnRectangle isDraft"
                x={draftRectangle.x}
                y={draftRectangle.y}
                width={draftRectangle.width}
                height={draftRectangle.height}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        </svg>
      </section>
    </main>
  );
}
