"use client";

import { useEffect, useState } from "react";
import styles from "./CanvasModeToggle.module.css";

type CanvasMode = "2d" | "3d";

export default function CanvasModeToggle() {
  const [mode, setMode] = useState<CanvasMode>("2d");

  useEffect(() => {
    document.documentElement.dataset.canvasMode = mode;
    window.dispatchEvent(
      new CustomEvent("canvasmodechange", {
        detail: { mode },
      }),
    );
  }, [mode]);

  return (
    <div className={styles.wrapper} aria-label="Canvas mode">
      <div className={styles.toggle} data-mode={mode}>
        <span className={styles.slider} aria-hidden="true" />
        <button
          type="button"
          className={`${styles.option}${mode === "2d" ? ` ${styles.active}` : ""}`}
          aria-pressed={mode === "2d"}
          onClick={() => setMode("2d")}
        >
          2D
        </button>
        <button
          type="button"
          className={`${styles.option}${mode === "3d" ? ` ${styles.active}` : ""}`}
          aria-pressed={mode === "3d"}
          onClick={() => setMode("3d")}
        >
          3D
        </button>
      </div>
    </div>
  );
}
