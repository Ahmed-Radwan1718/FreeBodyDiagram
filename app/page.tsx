"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

const BASE_GRID_SIZE = 20;
const MAJOR_GRID_MULTIPLIER = 5;

type ShapeType = "rectangle" | "circle" | "polygon" | "triangle";

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export default function Home() {
  const [camera, setCamera] = useState({ x: 0, y: 0, logZoom: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShapeType | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

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

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    drag.x = event.clientX;
    drag.y = event.clientY;

    setCamera((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  }

  function finishPan(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    setIsPanning(false);
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
                onClick={() => setSelectedShape("rectangle")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <rect x="5" y="8" width="22" height="16" rx="1.5" />
                </svg>
                <span>Rectangle</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "circle" ? " isSelected" : ""}`}
                type="button"
                onClick={() => setSelectedShape("circle")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <circle cx="16" cy="16" r="10" />
                </svg>
                <span>Circle</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "polygon" ? " isSelected" : ""}`}
                type="button"
                onClick={() => setSelectedShape("polygon")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true">
                  <polygon points="16,5 26,12 22,25 10,25 6,12" />
                </svg>
                <span>Polygon</span>
              </button>

              <button
                className={`shapeOption${selectedShape === "triangle" ? " isSelected" : ""}`}
                type="button"
                onClick={() => setSelectedShape("triangle")}
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
          <p className="sectionLabel">Forces</p>
        </div>
      </aside>

      <section
        className={`canvas${isPanning ? " isPanning" : ""}`}
        style={canvasStyle}
        aria-label="Free body diagram canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onWheel={handleWheel}
      />
    </main>
  );
}
