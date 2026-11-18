import { type FC } from 'react';
import { GuidedTour } from '../../../../components/common/GuidedTour';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import { voiceDesignTourSteps, type VoiceDesignSurface } from './steps';

/** Shows the Voice Design tour the first time someone sees the button here. */
export const VoiceDesignTour: FC<{ surface: VoiceDesignSurface }> = ({
    surface,
}) => {
    const { isOpen, closeTour } = useGuidedTour({
        storageKey: `ld.voice-design.${surface}.tour.v1`,
    });
    return (
        <GuidedTour
            steps={voiceDesignTourSteps(surface)}
            opened={isOpen}
            onClose={closeTour}
        />
    );
};
