const toolButtons = document.querySelectorAll(".tool-button");
const panels = document.querySelectorAll(".tool-panel");
const shapeButtons = document.querySelectorAll(".shape-option");
const workspace = document.querySelector(".workspace");

const SVG_NS = "http://www.w3.org/2000/svg";
const drawingLayer = document.createElementNS(SVG_NS, "svg");
drawingLayer.classList.add("drawing-layer");
drawingLayer.setAttribute("width", "100%");
drawingLayer.setAttribute("height", "100%");
drawingLayer.setAttribute("aria-label", "Diagram drawing layer");
workspace.append(drawingLayer);

let activeShape = null;
let draftShape = null;
let startPoint = null;
let activePointerId = null;

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

function getCanvasPoint(event) {
  const bounds = drawingLayer.getBoundingClientRect();

  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
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
  drawingLayer.append(element);

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

function resetDraft() {
  draftShape = null;
  startPoint = null;
  activePointerId = null;
}

function cancelDraft() {
  if (draftShape) {
    draftShape.remove();
  }

  resetDraft();
}

drawingLayer.addEventListener("pointerdown", (event) => {
  if (!activeShape || event.button !== 0 || draftShape) return;

  event.preventDefault();
  startPoint = getCanvasPoint(event);
  activePointerId = event.pointerId;
  draftShape = createShapeElement(activeShape, startPoint);
  updateShape(draftShape, activeShape, startPoint, startPoint);
  drawingLayer.setPointerCapture(event.pointerId);
});

drawingLayer.addEventListener("pointermove", (event) => {
  if (!draftShape || event.pointerId !== activePointerId) return;

  event.preventDefault();
  updateShape(draftShape, draftShape.dataset.shape, startPoint, getCanvasPoint(event));
});

drawingLayer.addEventListener("pointerup", (event) => {
  if (!draftShape || event.pointerId !== activePointerId) return;

  event.preventDefault();
  const endPoint = getCanvasPoint(event);
  const shapeName = draftShape.dataset.shape;
  updateShape(draftShape, shapeName, startPoint, endPoint);

  const dragDistance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
  const shapeCreated = shapeName === "particle" || dragDistance >= 5;

  if (!shapeCreated) {
    draftShape.remove();
  } else {
    draftShape.classList.remove("is-draft");
  }

  if (drawingLayer.hasPointerCapture(event.pointerId)) {
    drawingLayer.releasePointerCapture(event.pointerId);
  }

  resetDraft();

  if (shapeCreated) {
    setActiveShape(null);
  }
});

drawingLayer.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== activePointerId) return;
  cancelDraft();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (draftShape) {
    cancelDraft();
  } else if (activeShape) {
    setActiveShape(null);
  }
});
