import { type UserOnboardingTour } from '@lightdash/common';
import { useCallback, useEffect, useRef } from 'react';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';

export type TourTracking = {
    tour: UserOnboardingTour;
};

export type TourOutcome = 'completed' | 'dismissed';

type UseTourTrackingArgs = {
    /** Null for a tour that is not tracked. */
    tracking: TourTracking | null;
    opened: boolean;
    /** The step on screen; null while the tour shows something that is not a step. */
    stepIndex: number | null;
    stepCount: number;
};

type TourRun = {
    startedAt: number;
    viewedStepIndex: number | null;
    furthestStepIndex: number | null;
    hasEnded: boolean;
};

/**
 * Reports a tour's lifecycle: started on open, every step shown, and how it
 * ended. A tour left without closing (tab closed, navigated away) only has
 * its step events, so drop-off is read from the furthest step viewed.
 */
export const useTourTracking = ({
    tracking,
    opened,
    stepIndex,
    stepCount,
}: UseTourTrackingArgs): { trackEnded: (outcome: TourOutcome) => void } => {
    // Tours also render where there is no tracking (embeds, isolated tests)
    const track = useTracking({ failSilently: true })?.track ?? null;
    const runRef = useRef<TourRun | null>(null);
    const tour = tracking?.tour ?? null;

    useEffect(() => {
        if (track === null || tour === null) return;
        if (!opened) {
            runRef.current = null;
            return;
        }
        if (runRef.current === null) {
            runRef.current = {
                startedAt: Date.now(),
                viewedStepIndex: null,
                furthestStepIndex: null,
                hasEnded: false,
            };
            track({
                name: EventName.GUIDED_TOUR_STARTED,
                properties: { tour },
            });
        }
        const run = runRef.current;
        if (
            run.hasEnded ||
            stepIndex === null ||
            stepIndex === run.viewedStepIndex
        )
            return;
        runRef.current = {
            ...run,
            viewedStepIndex: stepIndex,
            furthestStepIndex: Math.max(run.furthestStepIndex ?? 0, stepIndex),
        };
        track({
            name: EventName.GUIDED_TOUR_STEP_VIEWED,
            properties: { tour, stepIndex, stepCount },
        });
    }, [tour, opened, stepIndex, stepCount, track]);

    const trackEnded = useCallback(
        (outcome: TourOutcome) => {
            const run = runRef.current;
            if (track === null || tour === null) return;
            if (run === null || run.hasEnded) return;
            // Kept until the tour closes, so a render in between starts no new run
            runRef.current = { ...run, hasEnded: true };
            const properties = {
                tour,
                furthestStepIndex: run.furthestStepIndex,
                stepCount,
                durationSeconds: Math.round(
                    (Date.now() - run.startedAt) / 1000,
                ),
            };
            if (outcome === 'completed') {
                track({ name: EventName.GUIDED_TOUR_COMPLETED, properties });
            } else {
                track({ name: EventName.GUIDED_TOUR_DISMISSED, properties });
            }
        },
        [tour, stepCount, track],
    );

    return { trackEnded };
};
