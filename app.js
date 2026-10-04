const toolButtons = document.querySelectorAll(".tool-button");
const panels = document.querySelectorAll(".tool-panel");
const shapeButtons = document.querySelectorAll(".shape-option");
const workspace = document.querySelector(".workspace");
const gridCanvas = document.querySelector(".grid-canvas");

const SVG_NS = "http://www.w3.org/2000/svg";
const drawingLayer = document.createElementNS(SVG_NS, "svg");
drawingLayer.classList.add("drawing-layer");
drawingLayer.setAttribute("width", "100%");
drawingLayer.setAttribute("height", "100%");
drawingLayer.setAttribute("aria-label", "Diagram drawing layer");
workspace.append(drawingLayer);

const viewport = document.createElementNS(SVG_NS, "g");
viewport.classList.add("drawing-viewport");
drawingLayer.append(viewport);

let activeShape = null;
let draftShape = null;
let activePointerId = null;
let interactionMode = null;
let startScreenPoint = null;
let startWorldPoint = null;
let draggedShape = null;
let draggedShapeStart = null;
let panStart = null;
let panOffset = { x: 0, y: 0 };
let spaceHeld = false;

function closePanels() {
  toolButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-expanded", "false");
  });

  panels.forEach((panel) => {
    panel.hidden = true;
  });
}

function setActiveShape(shapeName) {
  activeShape = shapeName;
  workspace.classList.toggle("has-drawing-tool", Boolean(activeShape));

  shapeButtons.forEach((button) => {
    const selected = button.dataset.shape === activeShape;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updatePan() {
  viewport.setAttribute("transform", `translate(${panOffset.x} ${panOffset.y})`);
  gridCanvas.style.backgroundPosition = `${panOffset.x}px ${panOffset.y}px`;
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const panelName = button.dataset.panel;
    const panel = document.querySelector(`[data-panel-content="${panelName}"]`);
    const wasOpen = button.classList.contains("is-active");

    closePanels();

    if (panelName !== "shapes" || wasOpen) {
      setActiveShape(null);
    }

    if (!wasOpen && panel) {
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      panel.hidden = false;
    }
  });
});

shapeButtons.forEach((button) => {
  button.setAttribute("aria-pressed", "false");

  button.addEventListener("click", () => {
    const shapeName = button.dataset.shape;
    setActiveShape(activeShape === shapeName ? null : shapeName);
  });
});

function getScreenPoint(event) {
  const bounds = drawingLayer.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

function getWorldPoint(event) {
  const screen = getScreenPoint(event);

  return {
    x: screen.x - panOffset.x,
    y: screen.y - panOffset.y
  };
}

function createShapeElement(shapeName, point) {
  let element;

  if (shapeName === "rectangle") {
    element = document.createElementNS(SVG_NS, "rect");
  } else if (shapeName === "circle" || shapeName === "particle") {
    element = document.createElementNS(SVG_NS, "circle");
  } else {
    element = document.createElementNS(SVG_NS, "polygon");
  }

  element.classList.add("diagram-shape", "is-draft");
  element.dataset.shape = shapeName;
  element.dataset.translateX = "0";
  element.dataset.translateY = "0";
  viewport.append(element);

  if (shapeName === "particle") {
    element.setAttribute("cx", point.x);
    element.setAttribute("cy", point.y);
    element.setAttribute("r", "6");
  }

  return element;
}

function getBox(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function updateShape(element, shapeName, start, end) {
  if (shapeName === "particle") {
    element.setAttribute("cx", end.x);
    element.setAttribute("cy", end.y);
    return;
  }

  const box = getBox(start, end);

  if (shapeName === "rectangle") {
    element.setAttribute("x", box.x);
    element.setAttribute("y", box.y);
    element.setAttribute("width", box.width);
    element.setAttribute("height", box.height);
    return;
  }

  if (shapeName === "circle") {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radius = Math.hypot(end.x - start.x, end.y - start.y) / 2;

    element.setAttribute("cx", centerX);
    element.setAttribute("cy", centerY);
    element.setAttribute("r", radius);
    return;
  }

  if (shapeName === "triangle") {
    const points = [
      `${box.x + box.width / 2},${box.y}`,
      `${box.x + box.width},${box.y + box.height}`,
      `${box.x},${box.y + box.height}`
    ];

    element.setAttribute("points", points.join(" "));
    return;
  }

  if (shapeName === "polygon") {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const radiusX = box.width / 2;
    const radiusY = box.height / 2;
    const points = [];

    for (let index = 0; index < 5; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
      points.push(`${centerX + Math.cos(angle) * radiusX},${centerY + Math.sin(angle) * radiusY}`);
    }

    element.setAttribute("points", points.join(" "));
  }
}

function applyShapeTranslation(element, x, y) {
  element.dataset.translateX = String(x);
  element.dataset.translateY = String(y);
  element.setAttribute("transform", `translate(${x} ${y})`);
}

function resetInteraction() {
  if (draggedShape) {
    draggedShape.classList.remove("is-moving");
  }

  draftShape = null;
  activePointerId = null;
  interactionMode = null;
  startScreenPoint = null;
  startWorldPoint = null;
  draggedShape = null;
  draggedShapeStart = null;
  panStart = null;
  workspace.classList.remove("is-panning");
}

function cancelDraft() {
  if (draftShape) {
    draftShape.remove();
  }

  resetInteraction();
}

function beginPointerInteraction(event) {
  if ((event.button !== 0 && event.button !== 1) || activePointerId !== null) return;

  const screenPoint = getScreenPoint(event);
  const forcePan = event.button === 1 || spaceHeld;
  const targetShape = event.target.closest?.(".diagram-shape");

  event.preventDefault();
  activePointerId = event.pointerId;
  startScreenPoint = screenPoint;
  drawingLayer.setPointerCapture(event.pointerId);

  if (forcePan || (!activeShape && !targetShape)) {
    interactionMode = "pan";
    panStart = { ...panOffset };
    workspace.classList.add("is-panning");
    return;
  }

  if (!activeShape && targetShape) {
    interactionMode = "move";
    draggedShape = targetShape;
    draggedShape.classList.add("is-moving");
    draggedShapeStart = {
      x: Number(draggedShape.dataset.translateX || 0),
      y: Number(draggedShape.dataset.translateY || 0)
    };
    return;
  }

  interactionMode = "draw";
  startWorldPoint = getWorldPoint(event);
  draftShape = createShapeElement(activeShape, startWorldPoint);
  updateShape(draftShape, activeShape, startWorldPoint, startWorldPoint);
}

function continuePointerInteraction(event) {
  if (event.pointerId !== activePointerId || !interactionMode) return;

  event.preventDefault();
  const currentScreen = getScreenPoint(event);

  if (interactionMode === "pan") {
    panOffset = {
      x: panStart.x + currentScreen.x - startScreenPoint.x,
      y: panStart.y + currentScreen.y - startScreenPoint.y
    };
    updatePan();
    return;
  }

  if (interactionMode === "move" && draggedShape) {
    applyShapeTranslation(
      draggedShape,
      draggedShapeStart.x + currentScreen.x - startScreenPoint.x,
      draggedShapeStart.y + currentScreen.y - startScreenPoint.y
    );
    return;
  }

  if (interactionMode === "draw" && draftShape) {
    updateShape(draftShape, draftShape.dataset.shape, startWorldPoint, getWorldPoint(event));
  }
}

function finishPointerInteraction(event) {
  if (event.pointerId !== activePointerId || !interactionMode) return;

  event.preventDefault();

  if (interactionMode === "draw" && draftShape) {
    const endPoint = getWorldPoint(event);
    const shapeName = draftShape.dataset.shape;
    updateShape(draftShape, shapeName, startWorldPoint, endPoint);

    const dragDistance = Math.hypot(endPoint.x - startWorldPoint.x, endPoint.y - startWorldPoint.y);
    const shapeCreated = shapeName === "particle" || dragDistance >= 5;

    if (!shapeCreated) {
      draftShape.remove();
    } else {
      draftShape.classList.remove("is-draft");
    }

    if (shapeCreated) {
      setActiveShape(null);
    }
  }

  if (drawingLayer.hasPointerCapture(event.pointerId)) {
    drawingLayer.releasePointerCapture(event.pointerId);
  }

  resetInteraction();
}

drawingLayer.addEventListener("pointerdown", beginPointerInteraction);
drawingLayer.addEventListener("pointermove", continuePointerInteraction);
drawingLayer.addEventListener("pointerup", finishPointerInteraction);

drawingLayer.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== activePointerId) return;

  if (interactionMode === "draw") {
    cancelDraft();
    return;
  }

  resetInteraction();
});

drawingLayer.addEventListener("contextmenu", (event) => {
  if (spaceHeld || interactionMode === "pan") {
    event.preventDefault();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat) {
    spaceHeld = true;
    workspace.classList.add("space-pan-ready");
  }

  if (event.key !== "Escape") return;

  if (interactionMode === "draw" && draftShape) {
    cancelDraft();
  } else if (activeShape) {
    setActiveShape(null);
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  spaceHeld = false;
  workspace.classList.remove("space-pan-ready");
});

window.addEventListener("blur", () => {
  spaceHeld = false;
  workspace.classList.remove("space-pan-ready");
});

updatePan();
