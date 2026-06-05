import { useCallback, useState } from 'react';

type UseGuidedTourOptions = {
    /**
     * Unique key for the "seen" flag in localStorage. Convention:
     * `ld.<feature>.tour.v<n>` — bump the version to re-show after a redesign.
     */
    storageKey: string;
    /** Open automatically the first time a user lands on the feature. */
    autoStartOnFirstVisit?: boolean;
};

type UseGuidedTourResult = {
    /** Whether the tour overlay should be shown. */
    isOpen: boolean;
    /** Open (or replay) the tour. */
    startTour: () => void;
    /** Close the tour and remember it was seen. */
    closeTour: () => void;
};

const hasSeen = (key: string): boolean => {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
};

const markSeen = (key: string): void => {
    try {
        localStorage.setItem(key, '1');
    } catch {
        // ignore — a tour that re-shows is better than a crash
    }
};

/**
 * Persistence and lifecycle for a first-visit guided tour: auto-opens once,
 * remembers it was seen (localStorage), and exposes a replay trigger. Pair with
 * the `<GuidedTour>` component for the spotlight rendering.
 */
// Consumed in the Reviews onboarding PR; this ignore is removed there.
// ts-unused-exports:disable-next-line
export const useGuidedTour = ({
    storageKey,
    autoStartOnFirstVisit = true,
}: UseGuidedTourOptions): UseGuidedTourResult => {
    const [isOpen, setIsOpen] = useState(
        () => autoStartOnFirstVisit && !hasSeen(storageKey),
    );

    const startTour = useCallback(() => setIsOpen(true), []);

    const closeTour = useCallback(() => {
        markSeen(storageKey);
        setIsOpen(false);
    }, [storageKey]);

    return { isOpen, startTour, closeTour };
};
