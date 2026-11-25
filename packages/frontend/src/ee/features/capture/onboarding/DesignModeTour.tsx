import { type FC } from 'react';
import { GuidedTour } from '../../../../components/common/GuidedTour';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import {
    designModeTourSteps,
    FIRST_TOOLBAR_STEP,
    type DesignModeSurface,
} from './steps';
import { DESIGN_MODE_TOUR_STORAGE_KEY } from './tourStorage';

/** Shows the Design Mode tour the first time someone sees the button. */
export const DesignModeTour: FC<{
    surface: DesignModeSurface;
    /** Turns Design Mode on, so the tour can point at its toolbar. */
    onTurnOn: () => void;
}> = ({ surface, onTurnOn }) => {
    const { isOpen, closeTour } = useGuidedTour({
        storageKey: DESIGN_MODE_TOUR_STORAGE_KEY,
    });
    return (
        <GuidedTour
            steps={designModeTourSteps(surface)}
            opened={isOpen}
            tracking={null}
            onStepChange={(index) => {
                if (index >= FIRST_TOOLBAR_STEP) onTurnOn();
            }}
            onClose={closeTour}
        />
    );
};
