const toolButtons = document.querySelectorAll(".tool-button");
const panels = document.querySelectorAll(".tool-panel");

function closePanels() {
  toolButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-expanded", "false");
  });

  panels.forEach((panel) => {
    panel.hidden = true;
  });
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const panelName = button.dataset.panel;
    const panel = document.querySelector(`[data-panel-content="${panelName}"]`);
    const wasOpen = button.classList.contains("is-active");

    closePanels();

    if (!wasOpen && panel) {
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      panel.hidden = false;
    }
  });
});
