"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./CalculationsPanel.module.css";

type AnalysisMode = "static" | "dynamic";

type ForceCalculation = {
  id: string;
  name: string;
  magnitude: number;
  angle: number;
  fx: number;
  fy: number;
};

const UNIT_TO_NEWTONS: Record<string, number> = {
  N: 1,
  kN: 1000,
  MN: 1_000_000,
  mN: 0.001,
};

function cleanNumber(value: number) {
  if (Math.abs(value) < 1e-9) return 0;
  return value;
}

function formatNumber(value: number, decimals = 2) {
  const cleaned = cleanNumber(value);
  return Number(cleaned.toFixed(decimals)).toString();
}

function formatAngle(value: number) {
  return formatNumber(value, 1);
}

function normalizeAngle(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 1e-9 ? 0 : normalized;
}

function readForces(canvas: HTMLElement): ForceCalculation[] {
  const lines = Array.from(
    canvas.querySelectorAll<SVGLineElement>("line[data-force-vector]"),
  );

  return lines.flatMap((line, index) => {
    const group = line.parentElement;
    if (!group) return [];

    const label = group.querySelector<SVGTextElement>("text[data-force-label]");
    const editableParts = label
      ? Array.from(label.querySelectorAll<SVGTSpanElement>("tspan[data-force-label]"))
      : [];
    const unitElement = group.querySelector<SVGTSpanElement>("tspan[data-force-unit]");

    const name = editableParts[0]?.textContent?.trim() || `F${index + 1}`;
    const displayedMagnitude = Number(editableParts[1]?.textContent?.trim() ?? "");
    const unit = unitElement?.textContent?.trim() ?? "N";
    const unitMultiplier = UNIT_TO_NEWTONS[unit] ?? 1;
    const magnitude = displayedMagnitude * unitMultiplier;

    const x1 = Number(line.getAttribute("x1"));
    const y1 = Number(line.getAttribute("y1"));
    const x2 = Number(line.getAttribute("x2"));
    const y2 = Number(line.getAttribute("y2"));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);

    if (
      !Number.isFinite(magnitude) ||
      ![x1, y1, x2, y2].every(Number.isFinite) ||
      length <= 0
    ) {
      return [];
    }

    const angle = normalizeAngle((Math.atan2(-dy, dx) * 180) / Math.PI);

    return [
      {
        id: `${index}-${name}`,
        name,
        magnitude,
        angle,
        fx: magnitude * (dx / length),
        fy: magnitude * (-dy / length),
      },
    ];
  });
}

function componentEquation(forces: ForceCalculation[], axis: "x" | "y") {
  if (forces.length === 0) return "0";

  return forces
    .map((force) => {
      const trig = axis === "x" ? "cos" : "sin";
      return `${force.name} ${trig}(${formatAngle(force.angle)}°)`;
    })
    .join(" + ");
}

export default function CalculationsPanel() {
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>("static");
  const [mass, setMass] = useState("1");
  const [forces, setForces] = useState<ForceCalculation[]>([]);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (sidebar) setSidebarRoot(sidebar);
  }, []);

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas) return;

    let frame: number | null = null;
    const update = () => setForces(readForces(canvas));
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["x1", "y1", "x2", "y2"],
    });

    update();

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const totals = useMemo(
    () =>
      forces.reduce(
        (sum, force) => ({
          x: sum.x + force.fx,
          y: sum.y + force.fy,
        }),
        { x: 0, y: 0 },
      ),
    [forces],
  );

  const massValue = Number(mass);
  const validMass = Number.isFinite(massValue) && massValue > 0;
  const xEquation = componentEquation(forces, "x");
  const yEquation = componentEquation(forces, "y");
  const xBalanced = Math.abs(totals.x) < 1e-6;
  const yBalanced = Math.abs(totals.y) < 1e-6;

  if (!sidebarRoot) return null;

  return createPortal(
    <div className="sidebarSection">
      <button
        className="sectionHeading sectionButton"
        type="button"
        aria-expanded={open}
        aria-controls="calculation-options"
        onClick={() => setOpen((current) => !current)}
      >
        <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M7 7h10" />
          <path d="M8 12h2M14 12h2M8 16h2M14 16h2" />
        </svg>
        <span className="sectionLabel">Calculations</span>
        <svg
          className={`sectionChevron${open ? " isOpen" : ""}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className={styles.panel} id="calculation-options">
          <div className={styles.modeToggle} aria-label="Analysis type">
            <button
              type="button"
              className={`${styles.modeButton}${mode === "static" ? ` ${styles.selected}` : ""}`}
              onClick={() => setMode("static")}
            >
              Static equilibrium
            </button>
            <button
              type="button"
              className={`${styles.modeButton}${mode === "dynamic" ? ` ${styles.selected}` : ""}`}
              onClick={() => setMode("dynamic")}
            >
              Dynamic load
            </button>
          </div>

          {mode === "dynamic" && (
            <label className={styles.massField}>
              <span>Mass</span>
              <span className={styles.massInputWrap}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={mass}
                  onChange={(event) => setMass(event.target.value)}
                  aria-label="Mass in kilograms"
                />
                <span>kg</span>
              </span>
            </label>
          )}

          {forces.length === 0 ? (
            <p className={styles.empty}>Add applied force vectors to the canvas to calculate their components.</p>
          ) : (
            <>
              <div className={styles.axisCard}>
                <div className={styles.axisHeader}>
                  <span>X direction</span>
                  <strong>ΣFₓ = {formatNumber(totals.x)} N</strong>
                </div>
                <div className={styles.expression}>{xEquation}</div>
                <div className={styles.governing}>
                  {mode === "static" ? "ΣFₓ = 0" : "ΣFₓ = maₓ"}
                </div>
                {mode === "static" ? (
                  <div className={styles.resultNote}>
                    {xBalanced ? "Equilibrium satisfied" : `Residual: ${formatNumber(totals.x)} N`}
                  </div>
                ) : validMass ? (
                  <div className={styles.resultNote}>
                    aₓ = {formatNumber(totals.x / massValue)} m/s²
                  </div>
                ) : (
                  <div className={styles.resultNote}>Enter a mass greater than 0 kg.</div>
                )}
              </div>

              <div className={styles.axisCard}>
                <div className={styles.axisHeader}>
                  <span>Y direction</span>
                  <strong>ΣFᵧ = {formatNumber(totals.y)} N</strong>
                </div>
                <div className={styles.expression}>{yEquation}</div>
                <div className={styles.governing}>
                  {mode === "static" ? "ΣFᵧ = 0" : "ΣFᵧ = maᵧ"}
                </div>
                {mode === "static" ? (
                  <div className={styles.resultNote}>
                    {yBalanced ? "Equilibrium satisfied" : `Residual: ${formatNumber(totals.y)} N`}
                  </div>
                ) : validMass ? (
                  <div className={styles.resultNote}>
                    aᵧ = {formatNumber(totals.y / massValue)} m/s²
                  </div>
                ) : (
                  <div className={styles.resultNote}>Enter a mass greater than 0 kg.</div>
                )}
              </div>

              <p className={styles.signConvention}>+x right · +y up</p>
            </>
          )}
        </div>
      )}
    </div>,
    sidebarRoot,
  );
}
