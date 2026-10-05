"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./UnitControl.module.css";

type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";

type UnitOption = {
  value: LengthUnit;
  label: string;
  symbol: string;
  fromCentimeters: number;
  decimals: number;
};

const UNIT_OPTIONS: UnitOption[] = [
  {
    value: "cm",
    label: "Centimeters",
    symbol: "cm",
    fromCentimeters: 1,
    decimals: 2,
  },
  {
    value: "mm",
    label: "Millimeters",
    symbol: "mm",
    fromCentimeters: 10,
    decimals: 2,
  },
  {
    value: "m",
    label: "Meters",
    symbol: "m",
    fromCentimeters: 0.01,
    decimals: 4,
  },
  {
    value: "in",
    label: "Inches",
    symbol: "in",
    fromCentimeters: 1 / 2.54,
    decimals: 3,
  },
  {
    value: "ft",
    label: "Feet",
    symbol: "ft",
    fromCentimeters: 1 / 30.48,
    decimals: 3,
  },
];

function getUnitOption(unit: LengthUnit) {
  return UNIT_OPTIONS.find((option) => option.value === unit) ?? UNIT_OPTIONS[0];
}

function formatConvertedDimension(valueInCentimeters: number, option: UnitOption) {
  const converted = valueInCentimeters * option.fromCentimeters;
  return Number(converted.toFixed(option.decimals)).toString();
}

function updateDimensionLabels(unit: LengthUnit) {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  if (!drawingLayer) return;

  const option = getUnitOption(unit);

  drawingLayer.querySelectorAll<SVGTextElement>(".dimensionLabel").forEach((label) => {
    const currentText = label.textContent?.trim() ?? "";
    const numericCurrentValue = Number(currentText);

    // React renders the canonical dimension value in centimeters. Whenever a
    // shape changes and React writes a fresh numeric value, keep that as the
    // source value for future unit conversions.
    if (currentText !== "" && Number.isFinite(numericCurrentValue)) {
      label.dataset.baseDimension = currentText;
    }

    const baseDimension = Number(label.dataset.baseDimension);
    if (!Number.isFinite(baseDimension)) return;

    const displayValue = formatConvertedDimension(baseDimension, option);
    const nextLabel = `${displayValue} · ${option.symbol}`;

    if (label.textContent !== nextLabel) {
      label.textContent = nextLabel;
    }

    const background = label.previousElementSibling;
    if (
      background instanceof SVGRectElement &&
      background.classList.contains("dimensionLabelBackground")
    ) {
      const centerX = Number(label.getAttribute("x"));
      const labelWidth = Math.max(44, nextLabel.length * 7 + 14);
      const nextWidth = String(labelWidth);
      const nextX = String(centerX - labelWidth / 2);

      if (Number.isFinite(centerX)) {
        if (background.getAttribute("width") !== nextWidth) {
          background.setAttribute("width", nextWidth);
        }
        if (background.getAttribute("x") !== nextX) {
          background.setAttribute("x", nextX);
        }
      }
    }
  });
}

export default function UnitControl() {
  const [unit, setUnit] = useState<LengthUnit>("cm");
  const [sidebar, setSidebar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSidebar(document.querySelector<HTMLElement>(".sidebar"));
  }, []);

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
      attributeFilter: ["x"],
    });

    scheduleUpdate();

    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [unit]);

  if (!sidebar) return null;

  function handleUnitChange(event: ChangeEvent<HTMLSelectElement>) {
    setUnit(event.target.value as LengthUnit);
  }

  return createPortal(
    <div className={styles.unitSection}>
      <div className={styles.heading}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18 18 4l2 2L6 20 4 18Z" />
          <path d="m9 13 2 2" />
          <path d="m12 10 2 2" />
          <path d="m15 7 2 2" />
        </svg>
        <p className={styles.label}>Units</p>
      </div>

      <label className={styles.fieldLabel} htmlFor="dimension-unit">
        Dimension unit
      </label>
      <select
        id="dimension-unit"
        className={styles.select}
        value={unit}
        onChange={handleUnitChange}
      >
        {UNIT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.symbol})
          </option>
        ))}
      </select>
      <p className={styles.hint}>1 grid unit is treated as 1 cm.</p>
    </div>,
    sidebar,
  );
}
