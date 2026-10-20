import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGuidedTour } from './useGuidedTour';

const storageKey = 'ld.test.tour.v1';

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
});

describe('useGuidedTour', () => {
    it.each(['url', 'session'])(
        'defers first-visit tours during a %s walkthrough without marking them seen',
        (source) => {
            if (source === 'url') {
                window.history.replaceState(
                    null,
                    '',
                    '/?tour=view%3AMetricsCatalog',
                );
            } else {
                sessionStorage.setItem(
                    'lightdash.scopeTour',
                    JSON.stringify({ scope: 'view:MetricsCatalog' }),
                );
            }

            const walkthroughVisit = renderHook(() =>
                useGuidedTour({ storageKey }),
            );
            expect(walkthroughVisit.result.current.isOpen).toBe(false);
            expect(localStorage.getItem(storageKey)).toBeNull();
            walkthroughVisit.unmount();

            sessionStorage.clear();
            window.history.replaceState(null, '', '/');
            const laterVisit = renderHook(() => useGuidedTour({ storageKey }));
            expect(laterVisit.result.current.isOpen).toBe(true);
            act(() => laterVisit.result.current.closeTour());
            laterVisit.unmount();

            const seenVisit = renderHook(() => useGuidedTour({ storageKey }));
            expect(seenVisit.result.current.isOpen).toBe(false);
            act(() => seenVisit.result.current.startTour());
            expect(seenVisit.result.current.isOpen).toBe(true);
        },
    );
});
