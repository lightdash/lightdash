import { type FC } from 'react';
import { GuidedTour } from '../../../../components/common/GuidedTour';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import { designModeTourSteps, type DesignModeSurface } from './steps';
import { DESIGN_MODE_TOUR_STORAGE_KEY } from './tourStorage';

/** Shows the Design Mode tour the first time someone sees the button. */
export const DesignModeTour: FC<{ surface: DesignModeSurface }> = ({
    surface,
}) => {
    const { isOpen, closeTour } = useGuidedTour({
        storageKey: DESIGN_MODE_TOUR_STORAGE_KEY,
    });
    return (
        <GuidedTour
            steps={designModeTourSteps(surface)}
            opened={isOpen}
            tracking={null}
            onClose={closeTour}
        />
    );
};
