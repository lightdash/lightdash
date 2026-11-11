import { EDIT_ACTION_BAR_CLEARANCE } from './gridUtils';

export const ACTUAL_SIZE_ZOOM = 1;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, ACTUAL_SIZE_ZOOM];
export const MIN_CANVAS_ZOOM = ZOOM_STEPS[0];
// Fitted zooms land between steps, a hair from one after rounding
const STEP_TOLERANCE = 0.001;

// Set by CanvasZoom on its outer, unscaled box
const CANVAS_ZOOM_SELECTOR = '[data-canvas-zoom]';

export const stepCanvasZoom = (zoom: number, direction: 'in' | 'out') =>
    direction === 'in'
        ? (ZOOM_STEPS.find((step) => step > zoom + STEP_TOLERANCE) ??
          ACTUAL_SIZE_ZOOM)
        : (ZOOM_STEPS.findLast((step) => step < zoom - STEP_TOLERANCE) ??
          MIN_CANVAS_ZOOM);

/** The zoom that draws `contentHeight` within `availableHeight`, never enlarging */
export const getFitZoom = (availableHeight: number, contentHeight: number) =>
    contentHeight <= 0
        ? ACTUAL_SIZE_ZOOM
        : Math.min(
              ACTUAL_SIZE_ZOOM,
              Math.max(
                  MIN_CANVAS_ZOOM,
                  Math.floor((availableHeight / contentHeight) * 100) / 100,
              ),
          );

export const getZoomedCanvas = (element: Element): Element | null =>
    element.closest(CANVAS_ZOOM_SELECTOR);

const getScrollParent = (element: HTMLElement): HTMLElement | null => {
    const parent = element.parentElement;
    if (parent === null) return null;
    const { overflowY } = getComputedStyle(parent);
    return overflowY === 'auto' || overflowY === 'scroll'
        ? parent
        : getScrollParent(parent);
};

// Hidden tab panels keep their canvas mounted
const getVisibleCanvas = (): HTMLElement | null =>
    Array.from(
        document.querySelectorAll<HTMLElement>(CANVAS_ZOOM_SELECTOR),
    ).find((element) => element.offsetParent !== null) ?? null;

/** Scrolls the visible canvas to the top and returns the zoom that fits it in the window */
export const fitVisibleCanvasToWindow = (): number | null => {
    const canvas = getVisibleCanvas();
    const content = canvas?.firstElementChild;
    if (!canvas || !(content instanceof HTMLElement)) return null;
    (getScrollParent(canvas) ?? document.documentElement).scrollTo({
        top: 0,
        behavior: 'instant',
    });
    return getFitZoom(
        window.innerHeight -
            canvas.getBoundingClientRect().top -
            EDIT_ACTION_BAR_CLEARANCE,
        content.offsetHeight,
    );
};
