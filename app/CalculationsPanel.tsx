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

type ReactionCalculation = {
  id: string;
  name: string;
  fxCoefficient: number;
  fyCoefficient: number;
};

type ReactionMomentCalculation = {
  id: string;
  name: string;
};

const UNIT_TO_NEWTONS: Record<string, number> = {
  N: 1,
  kN: 1000,
  MN: 1_000_000,
  mN: 0.001,
};

const REACTION_ZERO_TOLERANCE = 1e-6;

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

function readReactionForces(canvas: HTMLElement): ReactionCalculation[] {
  return Array.from(
    canvas.querySelectorAll<SVGGElement>("[data-support-reaction-layer] [data-reaction-force]"),
  ).flatMap((element, index) => {
    const name = element.dataset.reactionName?.trim();
    const fxCoefficient = Number(element.dataset.reactionFx);
    const fyCoefficient = Number(element.dataset.reactionFy);

    if (
      !name ||
      !Number.isFinite(fxCoefficient) ||
      !Number.isFinite(fyCoefficient)
    ) {
      return [];
    }

    return [
      {
        id: `reaction-${index}-${name}`,
        name,
        fxCoefficient,
        fyCoefficient,
      },
    ];
  });
}

function readReactionMoments(canvas: HTMLElement): ReactionMomentCalculation[] {
  return Array.from(
    canvas.querySelectorAll<SVGGElement>("[data-support-reaction-layer] [data-reaction-moment]"),
  ).flatMap((element, index) => {
    const name = element.dataset.reactionName?.trim();
    return name ? [{ id: `reaction-moment-${index}-${name}`, name }] : [];
  });
}

function componentTerms(forces: ForceCalculation[], axis: "x" | "y") {
  return forces.map((force) => {
    const trig = axis === "x" ? "cos" : "sin";
    return `${force.name} ${trig}(${formatAngle(force.angle)}°)`;
  });
}

function staticComponentTerms(forces: ForceCalculation[], axis: "x" | "y") {
  return forces.map((force) => {
    const trig = axis === "x" ? "cos" : "sin";
    return `${formatNumber(force.magnitude)} ${trig}(${formatAngle(force.angle)}°)`;
  });
}

function reactionCoefficient(reaction: ReactionCalculation, axis: "x" | "y") {
  return axis === "x" ? reaction.fxCoefficient : reaction.fyCoefficient;
}

function hasReactionOnAxis(reactions: ReactionCalculation[], axis: "x" | "y") {
  return reactions.some(
    (reaction) => Math.abs(reactionCoefficient(reaction, axis)) > REACTION_ZERO_TOLERANCE,
  );
}

function equationWithReactions(
  baseTerms: string[],
  reactions: ReactionCalculation[],
  axis: "x" | "y",
) {
  let expression = baseTerms.join(" + ");

  for (const reaction of reactions) {
    const coefficient = reactionCoefficient(reaction, axis);
    if (Math.abs(coefficient) <= REACTION_ZERO_TOLERANCE) continue;

    const magnitude = Math.abs(coefficient);
    const coefficientText =
      Math.abs(magnitude - 1) <= REACTION_ZERO_TOLERANCE
        ? ""
        : `${formatNumber(magnitude, 3)} `;
    const term = `${coefficientText}${reaction.name}`;

    if (!expression) {
      expression = coefficient < 0 ? `−${term}` : term;
    } else {
      expression += coefficient < 0 ? ` − ${term}` : ` + ${term}`;
    }
  }

  return expression || "0";
}

export default function CalculationsPanel() {
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>("static");
  const [mass, setMass] = useState("1");
  const [forces, setForces] = useState<ForceCalculation[]>([]);
  const [reactions, setReactions] = useState<ReactionCalculation[]>([]);
  const [reactionMoments, setReactionMoments] = useState<ReactionMomentCalculation[]>([]);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (sidebar) setSidebarRoot(sidebar);
  }, []);

  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas");
    if (!canvas) return;

    let frame: number | null = null;
    const update = () => {
      setForces(readForces(canvas));
      setReactions(readReactionForces(canvas));
      setReactionMoments(readReactionMoments(canvas));
    };
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
      attributeFilter: [
        "x1",
        "y1",
        "x2",
        "y2",
        "data-reaction-name",
        "data-reaction-fx",
        "data-reaction-fy",
      ],
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
  const hasXReaction = hasReactionOnAxis(reactions, "x");
  const hasYReaction = hasReactionOnAxis(reactions, "y");
  const xEquation = equationWithReactions(componentTerms(forces, "x"), reactions, "x");
  const yEquation = equationWithReactions(componentTerms(forces, "y"), reactions, "y");
  const staticXEquation = equationWithReactions(
    staticComponentTerms(forces, "x"),
    reactions,
    "x",
  );
  const staticYEquation = equationWithReactions(
    staticComponentTerms(forces, "y"),
    reactions,
    "y",
  );
  const hasAnyLoads = forces.length > 0 || reactions.length > 0;

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

          {mode === "static" ? (
            <div className={styles.staticEquations}>
              <div className={styles.staticEquation}>
                ΣFₓ = {hasXReaction
                  ? `${staticXEquation} = 0`
                  : forces.length > 0
                    ? `${staticXEquation} = ${formatNumber(totals.x)} N`
                    : "0"}
              </div>
              <div className={styles.staticEquation}>
                ΣFᵧ = {hasYReaction
                  ? `${staticYEquation} = 0`
                  : forces.length > 0
                    ? `${staticYEquation} = ${formatNumber(totals.y)} N`
                    : "0"}
              </div>
              {reactionMoments.length > 0 && (
                <div className={styles.staticEquation}>
                  ΣM = {reactionMoments.map((moment) => moment.name).join(" + ")} + Σ(r × F) = 0
                </div>
              )}
              {reactions.length > 0 && (
                <p className={styles.signConvention}>
                  Support reactions are treated as unknowns · +x right · +y up
                </p>
              )}
            </div>
          ) : (
            <>
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

              {!hasAnyLoads ? (
                <p className={styles.empty}>Add applied force vectors or attach supports to the body to calculate their components.</p>
              ) : (
                <>
                  <div className={styles.axisCard}>
                    <div className={styles.axisHeader}>
                      <span>X direction</span>
                      <strong>
                        {hasXReaction ? "ΣFₓ = maₓ" : `ΣFₓ = ${formatNumber(totals.x)} N`}
                      </strong>
                    </div>
                    <div className={styles.expression}>{xEquation}</div>
                    <div className={styles.governing}>ΣFₓ = maₓ</div>
                    {hasXReaction ? (
                      <div className={styles.resultNote}>
                        Contains unknown support reactions; solve them before evaluating aₓ numerically.
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
                      <strong>
                        {hasYReaction ? "ΣFᵧ = maᵧ" : `ΣFᵧ = ${formatNumber(totals.y)} N`}
                      </strong>
                    </div>
                    <div className={styles.expression}>{yEquation}</div>
                    <div className={styles.governing}>ΣFᵧ = maᵧ</div>
                    {hasYReaction ? (
                      <div className={styles.resultNote}>
                        Contains unknown support reactions; solve them before evaluating aᵧ numerically.
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
            </>
          )}
        </div>
      )}
    </div>,
    sidebarRoot,
  );
}
