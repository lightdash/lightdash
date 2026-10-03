/**
 * The running tour, kept for the tab: some pages (Ask AI) live under another
 * layout, so the host remounts when the learner clicks into them, and a
 * reload would otherwise lose the tour while the copy it runs in remains.
 */
export const SCOPE_TOUR_STORAGE_KEY = 'lightdash.scopeTour';
export const SCOPE_TOUR_PARAM = 'tour';

/**
 * Whether a walkthrough is running in this tab. Pages that open their own
 * first-visit popovers check this so they do not cover the control the tour
 * points at. The `tour` param covers the first render, before the host has
 * stored the tour.
 */
export const isScopeTourRunning = (): boolean => {
    try {
        if (sessionStorage.getItem(SCOPE_TOUR_STORAGE_KEY)) return true;
    } catch {
        // Storage unavailable: fall back to the URL.
    }
    return new URLSearchParams(window.location.search).has(SCOPE_TOUR_PARAM);
};
