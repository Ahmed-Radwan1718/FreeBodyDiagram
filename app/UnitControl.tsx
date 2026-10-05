"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./UnitControl.module.css";

type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";
type DimensionAxis = "width" | "height";

type UnitOption = {
  value: LengthUnit;
  label: string;
  symbol: string;
  fromCentimeters: number;
  decimals: number;
};

type MenuPosition = {
  left: number;
  top: number;
};

type DimensionEditor = {
  left: number;
  top: number;
  width: number;
  shapeId: string;
  axis: DimensionAxis;
  value: string;
};

const UNIT_OPTIONS: UnitOption[] = [
  { value: "cm", label: "Centimeters", symbol: "cm", fromCentimeters: 1, decimals: 2 },
  { value: "mm", label: "Millimeters", symbol: "mm", fromCentimeters: 10, decimals: 2 },
  { value: "m", label: "Meters", symbol: "m", fromCentimeters: 0.01, decimals: 4 },
  { value: "in", label: "Inches", symbol: "in", fromCentimeters: 1 / 2.54, decimals: 3 },
  { value: "ft", label: "Feet", symbol: "ft", fromCentimeters: 1 / 30.48, decimals: 3 },
];

const MENU_WIDTH = 160;
const MENU_HEIGHT = 188;
const DIMENSION_LINE_LABEL_PADDING = 12;

function getUnitOption(unit: LengthUnit) {
  return UNIT_OPTIONS.find((option) => option.value === unit) ?? UNIT_OPTIONS[0];
}

function formatConvertedDimension(valueInCentimeters: number, option: UnitOption) {
  const converted = valueInCentimeters * option.fromCentimeters;
  return Number(converted.toFixed(option.decimals)).toString();
}

function getDimensionLabel(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const label = target.closest(".dimensionLabel");
  return label instanceof SVGTextElement ? label : null;
}

function getDimensionPart(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  if (target.closest(".dimensionValue")) return "value" as const;
  if (target.closest(".dimensionUnit")) return "unit" as const;
  return null;
}

function getDimensionMetadata(label: SVGTextElement) {
  const shapeId = label.dataset.shapeId;
  const axis = label.dataset.dimensionAxis;
  if (!shapeId || (axis !== "width" && axis !== "height")) return null;
  return { shapeId, axis: axis as DimensionAxis };
}

function updateDimensionLineGap(label: SVGTextElement) {
  const group = label.parentElement;
  const axis = label.dataset.dimensionAxis;
  if (!group || (axis !== "width" && axis !== "height")) return;

  const line = Array.from(group.querySelectorAll<SVGLineElement>(".dimensionLine")).find(
    (candidate) => {
      const x1 = Number(candidate.getAttribute("x1"));
      const y1 = Number(candidate.getAttribute("y1"));
      const x2 = Number(candidate.getAttribute("x2"));
      const y2 = Number(candidate.getAttribute("y2"));
      if (![x1, y1, x2, y2].every(Number.isFinite)) return false;

      return axis === "width"
        ? Math.abs(y1 - y2) < 0.01 && Math.abs(x2 - x1) > 0
        : Math.abs(x1 - x2) < 0.01 && Math.abs(y2 - y1) > 0;
    },
  );

  if (!line) return;

  const x1 = Number(line.getAttribute("x1"));
  const y1 = Number(line.getAttribute("y1"));
  const x2 = Number(line.getAttribute("x2"));
  const y2 = Number(line.getAttribute("y2"));
  const lineLength = axis === "width" ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  if (!Number.isFinite(lineLength) || lineLength <= 0) return;

  let labelSize: number;
  try {
    const bounds = label.getBBox();
    labelSize = axis === "width" ? bounds.width : bounds.height;
  } catch {
    return;
  }

  const gapLength = Math.min(
    lineLength,
    Math.max(0, labelSize + DIMENSION_LINE_LABEL_PADDING),
  );

  if (gapLength >= lineLength) {
    line.setAttribute("stroke-dasharray", `0 ${lineLength}`);
    return;
  }

  const sideLength = (lineLength - gapLength) / 2;
  line.setAttribute(
    "stroke-dasharray",
    `${sideLength} ${gapLength} ${sideLength} 0`,
  );
}

function updateDimensionLabels(unit: LengthUnit) {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  if (!drawingLayer) return;

  const option = getUnitOption(unit);

  drawingLayer.querySelectorAll<SVGTextElement>(".dimensionLabel").forEach((label) => {
    const valueElement = label.querySelector<SVGTSpanElement>(".dimensionValue");
    const unitElement = label.querySelector<SVGTSpanElement>(".dimensionUnit");
    if (!valueElement || !unitElement) return;

    valueElement.style.pointerEvents = "auto";
    valueElement.style.cursor = "text";
    unitElement.style.pointerEvents = "auto";
    unitElement.style.cursor = "pointer";

    const currentValueText = valueElement.textContent?.trim() ?? "";
    const lastDisplayValue = label.dataset.lastDisplayValue;
    const numericCurrentValue = Number(currentValueText);

    if (
      currentValueText !== "" &&
      Number.isFinite(numericCurrentValue) &&
      currentValueText !== lastDisplayValue
    ) {
      label.dataset.baseDimension = currentValueText;
    }

    const baseDimension = Number(label.dataset.baseDimension);
    if (!Number.isFinite(baseDimension)) return;

    const displayValue = formatConvertedDimension(baseDimension, option);
    if (valueElement.textContent !== displayValue) valueElement.textContent = displayValue;
    if (unitElement.textContent !== option.symbol) unitElement.textContent = option.symbol;
    label.dataset.lastDisplayValue = displayValue;

    const background = label.previousElementSibling;
    if (
      background instanceof SVGRectElement &&
      background.classList.contains("dimensionLabelBackground")
    ) {
      const centerX = Number(label.getAttribute("x"));
      const nextLabel = `${displayValue} · ${option.symbol}`;
      const labelWidth = Math.max(44, nextLabel.length * 7 + 14);
      const nextWidth = String(labelWidth);
      const nextX = String(centerX - labelWidth / 2);

      if (Number.isFinite(centerX)) {
        if (background.getAttribute("width") !== nextWidth) background.setAttribute("width", nextWidth);
        if (background.getAttribute("x") !== nextX) background.setAttribute("x", nextX);
      }
    }

    updateDimensionLineGap(label);
  });
}

export default function UnitControl() {
  const [unit, setUnit] = useState<LengthUnit>("cm");
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [editor, setEditor] = useState<DimensionEditor | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!editor) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editor]);

  useEffect(() => {
    const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
    if (!drawingLayer) return;

    let animationFrame: number | null = null;
    const scheduleUpdate = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateDimensionLabels(unit);
      });
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(drawingLayer, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["x", "y"],
    });

    function openMenu(label: SVGTextElement) {
      const unitElement = label.querySelector<SVGTSpanElement>(".dimensionUnit");
      const rect = (unitElement ?? label).getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - 28, window.innerWidth - MENU_WIDTH - 8));
      const preferredTop = rect.bottom + 6;
      const top = preferredTop + MENU_HEIGHT <= window.innerHeight
        ? preferredTop
        : Math.max(8, rect.top - MENU_HEIGHT - 6);

      setEditor(null);
      setMenuPosition({ left, top });
    }

    function openEditor(label: SVGTextElement) {
      const metadata = getDimensionMetadata(label);
      const valueElement = label.querySelector<SVGTSpanElement>(".dimensionValue");
      if (!metadata || !valueElement) return;

      const rect = valueElement.getBoundingClientRect();
      const value = valueElement.textContent?.trim() ?? "";
      const width = Math.max(62, Math.min(110, rect.width + 22));
      const left = Math.max(8, Math.min(rect.left - 8, window.innerWidth - width - 8));
      const top = Math.max(8, Math.min(rect.top - 7, window.innerHeight - 38));

      setMenuPosition(null);
      setEditor({ left, top, width, shapeId: metadata.shapeId, axis: metadata.axis, value });
    }

    function handleDimensionPointerDown(event: PointerEvent) {
      if (!getDimensionLabel(event.target)) return;
      event.stopPropagation();
    }

    function handleDimensionClick(event: MouseEvent) {
      const label = getDimensionLabel(event.target);
      const part = getDimensionPart(event.target);
      if (!label || !part) return;

      event.preventDefault();
      event.stopPropagation();
      if (part === "unit") openMenu(label);
      else openEditor(label);
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        setMenuPosition(null);
        return;
      }

      if (
        event.target.closest("[data-unit-menu]") ||
        event.target.closest("[data-dimension-editor]") ||
        event.target.closest(".dimensionLabel")
      ) {
        return;
      }

      setMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPosition(null);
    }

    function closeFloatingUi() {
      setMenuPosition(null);
      setEditor(null);
    }

    drawingLayer.addEventListener("pointerdown", handleDimensionPointerDown);
    drawingLayer.addEventListener("click", handleDimensionClick);
    drawingLayer.addEventListener("wheel", closeFloatingUi, { passive: true });
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeFloatingUi);

    scheduleUpdate();

    return () => {
      observer.disconnect();
      drawingLayer.removeEventListener("pointerdown", handleDimensionPointerDown);
      drawingLayer.removeEventListener("click", handleDimensionClick);
      drawingLayer.removeEventListener("wheel", closeFloatingUi);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeFloatingUi);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [unit]);

  function commitEditor() {
    if (!editor) return;
    const enteredValue = Number(editor.value);
    if (!Number.isFinite(enteredValue) || enteredValue <= 0) {
      setEditor(null);
      return;
    }

    const option = getUnitOption(unit);
    const valueInCentimeters = enteredValue / option.fromCentimeters;

    window.dispatchEvent(
      new CustomEvent("dimensionchange", {
        detail: { shapeId: editor.shapeId, axis: editor.axis, valueInCentimeters },
      }),
    );

    setEditor(null);
  }

  if (!portalRoot) return null;

  return createPortal(
    <>
      {menuPosition && (
        <div
          className={styles.unitMenu}
          data-unit-menu
          role="menu"
          aria-label="Choose dimension unit"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {UNIT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={unit === option.value}
              className={`${styles.unitOption}${unit === option.value ? ` ${styles.isSelected}` : ""}`}
              onClick={() => {
                setUnit(option.value);
                setMenuPosition(null);
              }}
            >
              <span className={styles.symbol}>{option.symbol}</span>
              <span className={styles.name}>{option.label}</span>
              {unit === option.value && <span className={styles.check}>✓</span>}
            </button>
          ))}
        </div>
      )}

      {editor && (
        <div
          className={styles.dimensionEditor}
          data-dimension-editor
          style={{ left: editor.left, top: editor.top, width: editor.width }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            ref={inputRef}
            className={styles.dimensionInput}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            aria-label={`Edit ${editor.axis}`}
            value={editor.value}
            onChange={(event) =>
              setEditor((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            onBlur={commitEditor}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setEditor(null);
              }
            }}
          />
          <span className={styles.editorUnit}>{unit}</span>
        </div>
      )}
    </>,
    portalRoot,
  );
}
