"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DisplayPanel.module.css";

type DisplaySetting = "grid" | "dimensions" | "forceLabels" | "forceAngles";

type DisplayState = Record<DisplaySetting, boolean>;

const DEFAULT_DISPLAY: DisplayState = {
  grid: true,
  dimensions: true,
  forceLabels: true,
  forceAngles: true,
};

const OPTIONS: { key: DisplaySetting; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "dimensions", label: "Dimensions" },
  { key: "forceLabels", label: "Force labels" },
  { key: "forceAngles", label: "Force angles" },
];

function syncDisplayAttributes(settings: DisplayState) {
  const root = document.documentElement;
  root.dataset.displayGrid = settings.grid ? "on" : "off";
  root.dataset.displayDimensions = settings.dimensions ? "on" : "off";
  root.dataset.displayForceLabels = settings.forceLabels ? "on" : "off";
  root.dataset.displayForceAngles = settings.forceAngles ? "on" : "off";
}

export default function DisplayPanel() {
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<DisplayState>(DEFAULT_DISPLAY);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return;
    setSidebarRoot(sidebar);
  }, []);

  useEffect(() => {
    syncDisplayAttributes(settings);
  }, [settings]);

  function toggleSetting(key: DisplaySetting) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  if (!sidebarRoot) return null;

  return createPortal(
    <div className="sidebarSection">
      <button
        className="sectionHeading sectionButton"
        type="button"
        aria-expanded={open}
        aria-controls="display-options"
        onClick={() => setOpen((current) => !current)}
      >
        <svg className="sectionIcon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" />
          <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
        </svg>
        <span className="sectionLabel">Display</span>
        <svg
          className={`sectionChevron${open ? " isOpen" : ""}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className={styles.options} id="display-options">
          {OPTIONS.map((option) => {
            const enabled = settings[option.key];
            return (
              <button
                key={option.key}
                type="button"
                className={styles.row}
                aria-pressed={enabled}
                onClick={() => toggleSetting(option.key)}
              >
                <span>{option.label}</span>
                <span
                  className={`${styles.switch}${enabled ? ` ${styles.enabled}` : ""}`}
                  aria-hidden="true"
                >
                  <span className={styles.knob} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>,
    sidebarRoot,
  );
}
