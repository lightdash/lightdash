import { Tour } from '@mantine/core';
import { memo, useCallback, useState, type FC } from 'react';
import { useOnboardingTour } from '../../../../hooks/useOnboardingTour';
import { useTourTracking } from '../../../../hooks/useTourTracking';
import { usePinnedShortcutHints } from '../useShortcutHints';
import { EXAMPLE_CHANGES_LIST_TARGET } from './exampleData';
import { DASHBOARD_EDIT_TOUR_STEPS } from './steps';

const CHANGES_LIST_STEP_INDEX = DASHBOARD_EDIT_TOUR_STEPS.findIndex(
    (step) => step.target === EXAMPLE_CHANGES_LIST_TARGET,
);
const LAST_STEP_INDEX = DASHBOARD_EDIT_TOUR_STEPS.length - 1;

type Props = {
    /** Told when the tour reaches or leaves the step that shows the changes list */
    onExampleChangesToggle: (shown: boolean) => void;
};

export const DashboardEditTour: FC<Props> = memo(
    ({ onExampleChangesToggle }) => {
        const { shouldShow, closeTour, tracking } = useOnboardingTour({
            tour: 'dashboardEditTour',
        });
        usePinnedShortcutHints(shouldShow);
        const [stepIndex, setStepIndex] = useState<number | null>(null);
        const { trackEnded } = useTourTracking({
            tracking,
            opened: shouldShow,
            stepIndex,
            stepCount: DASHBOARD_EDIT_TOUR_STEPS.length,
        });

        const handleStepOpen = useCallback(
            (index: number) => {
                setStepIndex(index);
                onExampleChangesToggle(index === CHANGES_LIST_STEP_INDEX);
            },
            [onExampleChangesToggle],
        );
        const handleClose = useCallback(() => {
            trackEnded(
                stepIndex === LAST_STEP_INDEX ? 'completed' : 'dismissed',
            );
            setStepIndex(null);
            onExampleChangesToggle(false);
            closeTour();
        }, [trackEnded, stepIndex, onExampleChangesToggle, closeTour]);

        return (
            <Tour
                active={shouldShow}
                onClose={handleClose}
                onStepOpen={handleStepOpen}
                spotlightRadius={12}
                labels={{ close: 'Done', skip: 'Skip tour' }}
            >
                {DASHBOARD_EDIT_TOUR_STEPS.map((step) => (
                    <Tour.Step
                        key={step.title}
                        target={step.target ?? undefined}
                        title={step.title}
                        position={step.position}
                    >
                        {step.body}
                    </Tour.Step>
                ))}
            </Tour>
        );
    },
);
DashboardEditTour.displayName = 'DashboardEditTour';
