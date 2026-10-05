"use client";

import { useEffect } from "react";

const DURATION_MS = 380;
const CONTENT_FADE_MS = 260;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function prepareSection(section: HTMLElement, height: number) {
  section.style.height = `${height}px`;
  section.style.overflow = "hidden";
  section.style.willChange = "height";
}

function clearSectionStyles(section: HTMLElement) {
  section.style.removeProperty("height");
  section.style.removeProperty("overflow");
  section.style.removeProperty("will-change");
}

export default function SidebarDropdownMotion() {
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return;

    const bypassNextClick = new WeakSet<HTMLButtonElement>();
    const closingButtons = new WeakSet<HTMLButtonElement>();
    const sectionAnimations = new WeakMap<HTMLElement, Animation>();
    const contentAnimations = new WeakMap<HTMLElement, Animation>();

    function cancelSectionAnimation(section: HTMLElement) {
      sectionAnimations.get(section)?.cancel();
      sectionAnimations.delete(section);
    }

    function cancelContentAnimation(content: HTMLElement) {
      contentAnimations.get(content)?.cancel();
      contentAnimations.delete(content);
    }

    function animateOpen(button: HTMLButtonElement, section: HTMLElement, startHeight: number) {
      requestAnimationFrame(() => {
        if (!button.isConnected || !section.isConnected) return;

        const content = button.nextElementSibling as HTMLElement | null;
        if (!content) return;

        const endHeight = section.getBoundingClientRect().height;
        if (endHeight <= startHeight + 0.5) return;

        cancelSectionAnimation(section);
        cancelContentAnimation(content);

        prepareSection(section, startHeight);
        section.getBoundingClientRect();

        const sectionAnimation = section.animate(
          [
            { height: `${startHeight}px` },
            { height: `${endHeight}px` },
          ],
          {
            duration: DURATION_MS,
            easing: EASING,
            fill: "both",
          },
        );
        sectionAnimations.set(section, sectionAnimation);

        const contentAnimation = content.animate(
          [
            {
              opacity: 0,
              transform: "translateY(-7px)",
            },
            {
              opacity: 1,
              transform: "translateY(0)",
            },
          ],
          {
            duration: CONTENT_FADE_MS,
            easing: EASING,
            fill: "both",
          },
        );
        contentAnimations.set(content, contentAnimation);

        sectionAnimation.finished
          .catch(() => undefined)
          .then(() => {
            if (sectionAnimations.get(section) !== sectionAnimation) return;
            sectionAnimations.delete(section);

            // Let the section return to its natural auto height after the motion
            // finishes. A finished Web Animation with fill:"both" keeps its
            // animated height active until it is cancelled, which otherwise
            // leaves the panel stuck at a stale measured height.
            clearSectionStyles(section);
            sectionAnimation.cancel();
          });

        contentAnimation.finished
          .catch(() => undefined)
          .then(() => {
            if (contentAnimations.get(content) !== contentAnimation) return;
            contentAnimations.delete(content);
            contentAnimation.cancel();
          });
      });
    }

    function animateClose(
      event: MouseEvent,
      button: HTMLButtonElement,
      section: HTMLElement,
      content: HTMLElement,
    ) {
      event.preventDefault();
      event.stopPropagation();

      if (closingButtons.has(button)) return;
      closingButtons.add(button);

      cancelSectionAnimation(section);
      cancelContentAnimation(content);

      const startHeight = section.getBoundingClientRect().height;
      const endHeight = button.getBoundingClientRect().height;
      const chevron = button.querySelector<HTMLElement>(".sectionChevron");

      button.setAttribute("aria-expanded", "false");
      chevron?.classList.remove("isOpen");
      content.style.pointerEvents = "none";

      prepareSection(section, startHeight);
      section.getBoundingClientRect();

      const sectionAnimation = section.animate(
        [
          { height: `${startHeight}px` },
          { height: `${endHeight}px` },
        ],
        {
          duration: DURATION_MS,
          easing: EASING,
          fill: "both",
        },
      );
      sectionAnimations.set(section, sectionAnimation);

      const contentAnimation = content.animate(
        [
          {
            opacity: 1,
            transform: "translateY(0)",
          },
          {
            opacity: 0,
            transform: "translateY(-7px)",
          },
        ],
        {
          duration: CONTENT_FADE_MS,
          easing: "ease-out",
          fill: "both",
        },
      );
      contentAnimations.set(content, contentAnimation);

      sectionAnimation.finished
        .catch(() => undefined)
        .then(() => {
          if (!button.isConnected || !section.isConnected) return;
          if (sectionAnimations.get(section) !== sectionAnimation) return;

          sectionAnimations.delete(section);
          contentAnimations.delete(content);
          contentAnimation.cancel();
          closingButtons.delete(button);

          bypassNextClick.add(button);
          button.click();

          requestAnimationFrame(() => {
            if (!section.isConnected) return;

            // React has now removed the dropdown content. Remove the animation
            // effect as well so its filled end height cannot affect the next
            // time this section opens.
            sectionAnimation.cancel();
            clearSectionStyles(section);
          });
        });
    }

    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;

      const button = event.target.closest<HTMLButtonElement>(".sectionButton");
      if (!button || !sidebar.contains(button)) return;

      if (bypassNextClick.has(button)) {
        bypassNextClick.delete(button);
        return;
      }

      if (closingButtons.has(button)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const section = button.closest<HTMLElement>(".sidebarSection");
      if (!section) return;

      const isOpen = button.getAttribute("aria-expanded") === "true";
      const content = button.nextElementSibling as HTMLElement | null;

      if (isOpen && content) {
        animateClose(event, button, section, content);
        return;
      }

      const startHeight = section.getBoundingClientRect().height;
      animateOpen(button, section, startHeight);
    }

    sidebar.addEventListener("click", handleClick, true);

    return () => {
      sidebar.removeEventListener("click", handleClick, true);
      sidebar.querySelectorAll<HTMLElement>(".sidebarSection").forEach((section) => {
        cancelSectionAnimation(section);
        clearSectionStyles(section);
      });
      sidebar.querySelectorAll<HTMLElement>(".sidebarSection > :not(.sectionButton)").forEach((content) => {
        cancelContentAnimation(content);
        content.style.removeProperty("pointer-events");
      });
    };
  }, []);

  return null;
}
