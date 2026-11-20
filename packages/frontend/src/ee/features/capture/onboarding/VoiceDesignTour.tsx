import { type FC } from 'react';
import { GuidedTour } from '../../../../components/common/GuidedTour';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import { voiceDesignTourSteps, type VoiceDesignSurface } from './steps';
import {
    carryOverOlderTourFlags,
    VOICE_DESIGN_TOUR_STORAGE_KEY,
} from './tourStorage';

/** Shows the Voice Design tour the first time someone sees the button. */
export const VoiceDesignTour: FC<{ surface: VoiceDesignSurface }> = ({
    surface,
}) => {
    carryOverOlderTourFlags();
    const { isOpen, closeTour } = useGuidedTour({
        storageKey: VOICE_DESIGN_TOUR_STORAGE_KEY,
    });
    return (
        <GuidedTour
            steps={voiceDesignTourSteps(surface)}
            opened={isOpen}
            tracking={null}
            onClose={closeTour}
        />
    );
};
