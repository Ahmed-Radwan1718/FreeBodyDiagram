"use client";

import { useEffect } from "react";

const DURATION_MS = 340;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type SectionSnapshot = {
  element: HTMLElement;
  top: number;
};

export default function SidebarDropdownMotion() {
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return;

    let frameOne: number | null = null;
    let frameTwo: number | null = null;

    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>(".sectionButton");
      if (!button || !sidebar.contains(button)) return;

      const section = button.closest<HTMLElement>(".sidebarSection");
      if (!section) return;

      const sections = Array.from(
        sidebar.querySelectorAll<HTMLElement>(":scope > .sidebarSection"),
      );
      const before: SectionSnapshot[] = sections.map((element) => ({
        element,
        top: element.getBoundingClientRect().top,
      }));
      const hadContent = Boolean(button.nextElementSibling);

      if (frameOne !== null) cancelAnimationFrame(frameOne);
      if (frameTwo !== null) cancelAnimationFrame(frameTwo);

      frameOne = requestAnimationFrame(() => {
        frameOne = null;
        frameTwo = requestAnimationFrame(() => {
          frameTwo = null;

          for (const snapshot of before) {
            if (!snapshot.element.isConnected) continue;
            const nextTop = snapshot.element.getBoundingClientRect().top;
            const deltaY = snapshot.top - nextTop;
            if (Math.abs(deltaY) < 0.5) continue;

            snapshot.element.animate(
              [
                { transform: `translateY(${deltaY}px)` },
                { transform: "translateY(0)" },
              ],
              {
                duration: DURATION_MS,
                easing: EASING,
                fill: "both",
              },
            );
          }

          const content = button.nextElementSibling as HTMLElement | null;
          if (!hadContent && content) {
            content.animate(
              [
                {
                  clipPath: "inset(0 0 100% 0)",
                  opacity: 0,
                  transform: "translateY(-8px) scaleY(0.96)",
                  transformOrigin: "top",
                },
                {
                  clipPath: "inset(0 0 0 0)",
                  opacity: 1,
                  transform: "translateY(0) scaleY(1)",
                  transformOrigin: "top",
                },
              ],
              {
                duration: DURATION_MS,
                easing: EASING,
                fill: "both",
              },
            );
          }
        });
      });
    }

    sidebar.addEventListener("click", handleClick, true);

    return () => {
      sidebar.removeEventListener("click", handleClick, true);
      if (frameOne !== null) cancelAnimationFrame(frameOne);
      if (frameTwo !== null) cancelAnimationFrame(frameTwo);
    };
  }, []);

  return null;
}
