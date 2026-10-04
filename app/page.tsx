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

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export default function Home() {
  const [camera, setCamera] = useState({ x: 0, y: 0, logZoom: 0 });
  const [isPanning, setIsPanning] = useState(false);
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
          <p className="sectionLabel">Shapes</p>
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
