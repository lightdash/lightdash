import { memo, useCallback, type FC } from 'react';
import { useOnboardingTour } from '../../../../hooks/useOnboardingTour';
import { GuidedTour } from '../../GuidedTour';
import { usePinnedShortcutHints } from '../useShortcutHints';
import { EXAMPLE_CHANGES_LIST_TARGET } from './exampleData';
import { DASHBOARD_EDIT_TOUR_STEPS } from './steps';

const CHANGES_LIST_STEP_INDEX = DASHBOARD_EDIT_TOUR_STEPS.findIndex((step) =>
    step.highlights?.includes(EXAMPLE_CHANGES_LIST_TARGET),
);

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

        const handleStepChange = useCallback(
            (stepIndex: number) =>
                onExampleChangesToggle(stepIndex === CHANGES_LIST_STEP_INDEX),
            [onExampleChangesToggle],
        );
        const handleClose = useCallback(() => {
            onExampleChangesToggle(false);
            closeTour();
        }, [onExampleChangesToggle, closeTour]);

        return (
            <GuidedTour
                steps={DASHBOARD_EDIT_TOUR_STEPS}
                opened={shouldShow}
                tracking={tracking}
                onClose={handleClose}
                onStepChange={handleStepChange}
            />
        );
    },
);
DashboardEditTour.displayName = 'DashboardEditTour';
