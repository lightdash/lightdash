import { memo } from 'react';
import { useOnboardingTour } from '../../../../hooks/useOnboardingTour';
import { GuidedTour } from '../../GuidedTour';
import { usePinnedShortcutHints } from '../useShortcutHints';
import { DASHBOARD_EDIT_TOUR_STEPS } from './steps';

export const DashboardEditTour = memo(() => {
    const { shouldShow, closeTour } = useOnboardingTour({
        tour: 'dashboardEditTour',
    });
    usePinnedShortcutHints(shouldShow);

    return (
        <GuidedTour
            steps={DASHBOARD_EDIT_TOUR_STEPS}
            opened={shouldShow}
            onClose={closeTour}
        />
    );
});
DashboardEditTour.displayName = 'DashboardEditTour';
