import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SCOPE_TOUR_STORAGE_KEY } from '../features/scopeTours/isScopeTourRunning';
import { useGuidedTour } from './useGuidedTour';

const KEY = 'ld.test.tour.v1';

describe('useGuidedTour', () => {
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('opens on a first visit', () => {
        const { result } = renderHook(() => useGuidedTour({ storageKey: KEY }));
        expect(result.current.isOpen).toBe(true);
    });

    it('stays closed while a Learn walkthrough runs, without marking it seen', () => {
        sessionStorage.setItem(SCOPE_TOUR_STORAGE_KEY, '{}');
        const { result } = renderHook(() => useGuidedTour({ storageKey: KEY }));
        expect(result.current.isOpen).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();

        act(() => result.current.startTour());
        expect(result.current.isOpen).toBe(true);
    });
});
