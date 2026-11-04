export const SCOPE_TOUR_PARAM = 'tour';
export const SCOPE_TOUR_STORAGE_KEY = 'lightdash.scopeTour';

/** Also check the URL before the walkthrough host persists its state. */
export const isScopeTourRunning = (): boolean => {
    if (new URLSearchParams(window.location.search).has(SCOPE_TOUR_PARAM)) {
        return true;
    }
    try {
        return sessionStorage.getItem(SCOPE_TOUR_STORAGE_KEY) !== null;
    } catch {
        return false;
    }
};
