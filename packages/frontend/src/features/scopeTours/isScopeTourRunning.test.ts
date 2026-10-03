import { afterEach, describe, expect, it } from 'vitest';
import {
    isScopeTourRunning,
    SCOPE_TOUR_STORAGE_KEY,
} from './isScopeTourRunning';

describe('isScopeTourRunning', () => {
    afterEach(() => {
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
    });

    it('is false with no stored tour and no tour param', () => {
        expect(isScopeTourRunning()).toBe(false);
    });

    it('is true while a tour is stored for the tab', () => {
        sessionStorage.setItem(
            SCOPE_TOUR_STORAGE_KEY,
            JSON.stringify({ scope: 'view:Project', stepIndex: 2 }),
        );
        expect(isScopeTourRunning()).toBe(true);
    });

    it('is true on the first render, before the host stores the tour', () => {
        window.history.replaceState(null, '', '/projects/p/home?tour=view');
        expect(isScopeTourRunning()).toBe(true);
    });
});
