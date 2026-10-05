"use client";

import { useEffect, useState } from "react";
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

type MenuPosition = {
  left: number;
  top: number;
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

const MENU_WIDTH = 160;
const MENU_HEIGHT = 188;

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

function updateDimensionLabels(unit: LengthUnit) {
  const drawingLayer = document.querySelector<SVGSVGElement>(".drawingLayer");
  if (!drawingLayer) return;

  const option = getUnitOption(unit);

  drawingLayer.querySelectorAll<SVGTextElement>(".dimensionLabel").forEach((label) => {
    label.style.pointerEvents = "auto";
    label.style.cursor = "pointer";

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
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

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
      const rect = label.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(rect.right - 28, window.innerWidth - MENU_WIDTH - 8),
      );
      const preferredTop = rect.bottom + 6;
      const top =
        preferredTop + MENU_HEIGHT <= window.innerHeight
          ? preferredTop
          : Math.max(8, rect.top - MENU_HEIGHT - 6);

      setMenuPosition({ left, top });
    }

    function handleDimensionPointerDown(event: PointerEvent) {
      if (!getDimensionLabel(event.target)) return;
      event.stopPropagation();
    }

    function handleDimensionClick(event: MouseEvent) {
      const label = getDimensionLabel(event.target);
      if (!label) return;

      event.preventDefault();
      event.stopPropagation();
      openMenu(label);
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        setMenuPosition(null);
        return;
      }

      if (
        event.target.closest("[data-unit-menu]") ||
        event.target.closest(".dimensionLabel")
      ) {
        return;
      }

      setMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuPosition(null);
      }
    }

    function closeMenu() {
      setMenuPosition(null);
    }

    drawingLayer.addEventListener("pointerdown", handleDimensionPointerDown);
    drawingLayer.addEventListener("click", handleDimensionClick);
    drawingLayer.addEventListener("wheel", closeMenu, { passive: true });
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);

    scheduleUpdate();

    return () => {
      observer.disconnect();
      drawingLayer.removeEventListener("pointerdown", handleDimensionPointerDown);
      drawingLayer.removeEventListener("click", handleDimensionClick);
      drawingLayer.removeEventListener("wheel", closeMenu);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [unit]);

  if (!menuPosition) return null;

  return createPortal(
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
    </div>,
    document.body,
  );
}
