import { type SourceQuery } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { GuidedTour } from '../../../../../../components/common/GuidedTour';
import { useOnboardingTour } from '../../../../../../hooks/useOnboardingTour';
import {
    COMPOSER_LINEAGE_TOUR_LINEAGE_FROM,
    getComposerLineageTourSteps,
} from './steps';

type Props = {
    /** The chart is drawn and the pipeline has more than one step. */
    ready: boolean;
    queries: SourceQuery[];
    terminalNodeId: string;
    saveInMenu: boolean;
    canAddToChat: boolean;
    onShowLineage: (show: boolean) => void;
};

// Shown once per user, the first time a multi-step composer chart is drawn.
export const ComposerLineageTour: FC<Props> = ({
    ready,
    queries,
    terminalNodeId,
    saveInMenu,
    canAddToChat,
    onShowLineage,
}) => {
    const { shouldShow, closeTour, tracking } = useOnboardingTour({
        tour: 'composerLineageTour',
        enabled: ready,
    });
    const steps = useMemo(
        () =>
            getComposerLineageTourSteps({
                queries,
                terminalNodeId,
                saveInMenu,
                canAddToChat,
            }),
        [queries, terminalNodeId, saveInMenu, canAddToChat],
    );

    return (
        <GuidedTour
            steps={steps}
            opened={shouldShow}
            tracking={tracking}
            onClose={closeTour}
            onStepChange={(stepIndex) =>
                onShowLineage(stepIndex >= COMPOSER_LINEAGE_TOUR_LINEAGE_FROM)
            }
        />
    );
};
