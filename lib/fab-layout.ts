/** Shared floating action button layout (bottom-right stack). */
export const FAB_INSET = "1.25rem"; // 20px — bottom-5 / right-5
export const FAB_SIZE = "3.5rem"; // 56px — h-14 / w-14
export const FAB_GAP = "0.75rem"; // 12px

export const FAB_BOTTOM_SUPPORT = FAB_INSET;
export const FAB_BOTTOM_QWEN_STACKED = `calc(${FAB_INSET} + ${FAB_SIZE} + ${FAB_GAP})`;
export const FAB_BOTTOM_QWEN_SOLO = "4rem"; // bottom-16

export const SUPPORTKIT_WIDGET_TAG = "supportkit-chat-widget";
export const SUPPORTKIT_LAUNCHER_ATTR = "data-sk-launcher";
export const SUPPORTKIT_TOOLTIP_LABEL = "Contact support";

const shadowObservers = new WeakMap<HTMLElement, MutationObserver>();

export function findSupportKitWidget(): HTMLElement | null {
  return document.querySelector(SUPPORTKIT_WIDGET_TAG);
}

function ensureFloatingTooltip(): HTMLSpanElement {
  let tip = document.querySelector<HTMLSpanElement>(".sk-fab-tooltip-floating");
  if (!tip) {
    tip = document.createElement("span");
    tip.className = "sk-fab-tooltip-floating";
    tip.setAttribute("role", "tooltip");
    tip.textContent = SUPPORTKIT_TOOLTIP_LABEL;
    document.body.appendChild(tip);
  }
  return tip;
}

function showFloatingTooltip(anchor: Element) {
  const tip = ensureFloatingTooltip();
  const rect = anchor.getBoundingClientRect();
  tip.style.top = `${rect.top + rect.height / 2}px`;
  tip.style.right = `${window.innerWidth - rect.left + 12}px`;
  tip.style.left = "auto";
  tip.style.transform = "translateY(-50%)";
  tip.style.opacity = "1";
}

function hideFloatingTooltip() {
  document.querySelector<HTMLSpanElement>(".sk-fab-tooltip-floating")?.style.setProperty("opacity", "0");
}

function injectShadowStyles(shadow: ShadowRoot) {
  if (shadow.querySelector("[data-sk-layout-patch]")) return;

  const style = document.createElement("style");
  style.setAttribute("data-sk-layout-patch", "true");
  style.textContent = `
    .sk-button {
      width: ${FAB_SIZE} !important;
      height: ${FAB_SIZE} !important;
      font-size: 1.25rem !important;
      transition: none !important;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
    }

    .sk-button:hover,
    .sk-button:active {
      transform: none !important;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
    }
  `;
  shadow.appendChild(style);
}

function bindSupportKitTooltip(widget: HTMLElement) {
  const shadow = widget.shadowRoot;
  if (!shadow) return;

  const bindButton = () => {
    const btn = shadow.querySelector<HTMLButtonElement>(".sk-button");
    if (!btn || btn.hasAttribute("data-sk-tooltip-bound")) return;

    btn.setAttribute("data-sk-tooltip-bound", "true");
    btn.setAttribute("aria-label", SUPPORTKIT_TOOLTIP_LABEL);

    btn.addEventListener("mouseenter", () => showFloatingTooltip(btn));
    btn.addEventListener("mouseleave", hideFloatingTooltip);
    btn.addEventListener("focus", () => showFloatingTooltip(btn));
    btn.addEventListener("blur", hideFloatingTooltip);
  };

  bindButton();

  if (!shadowObservers.has(widget)) {
    const observer = new MutationObserver(bindButton);
    observer.observe(shadow, { childList: true, subtree: true });
    shadowObservers.set(widget, observer);
  }
}

function patchSupportKitWidget(widget: HTMLElement) {
  widget.style.setProperty("position", "fixed", "important");
  widget.style.setProperty("bottom", FAB_BOTTOM_SUPPORT, "important");
  widget.style.setProperty("right", FAB_INSET, "important");
  widget.style.setProperty("z-index", "40", "important");
  widget.setAttribute(SUPPORTKIT_LAUNCHER_ATTR, "true");

  if (widget.shadowRoot) {
    injectShadowStyles(widget.shadowRoot);
    bindSupportKitTooltip(widget);
  }
}

export function applySupportKitLauncherLayout(options: { qwenEnabled: boolean }) {
  const widget = findSupportKitWidget();
  if (!widget) return false;

  patchSupportKitWidget(widget);

  if (options.qwenEnabled) {
    document.documentElement.dataset.fabStack = "qwen-support";
  } else {
    delete document.documentElement.dataset.fabStack;
  }

  return true;
}

export function teardownSupportKitFabLayout() {
  hideFloatingTooltip();
  document.querySelector(".sk-fab-tooltip-floating")?.remove();

  const widget = findSupportKitWidget();
  if (widget) {
    shadowObservers.get(widget)?.disconnect();
    shadowObservers.delete(widget);
    widget.removeAttribute(SUPPORTKIT_LAUNCHER_ATTR);
  }

  delete document.documentElement.dataset.fabStack;
}
