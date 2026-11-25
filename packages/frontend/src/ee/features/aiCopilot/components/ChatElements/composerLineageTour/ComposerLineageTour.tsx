import { type SourceQuery } from '@lightdash/common';
import { useEffect, useMemo, useState, type FC } from 'react';
import { GuidedTour } from '../../../../../../components/common/GuidedTour';
import { useOnboardingTour } from '../../../../../../hooks/useOnboardingTour';
import {
    COMPOSER_LINEAGE_TOUR_LINEAGE_FROM,
    getComposerLineageTourSteps,
} from './steps';

// A thread can show several composer panels at once; only the first to qualify runs the tour.
let ownerScopeId: string | null = null;

type Props = {
    /** The panel's `data-composer-tour-scope` value. */
    scopeId: string;
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
    scopeId,
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
    const [isOwner, setIsOwner] = useState(false);
    useEffect(() => {
        if (!shouldShow || (ownerScopeId !== null && ownerScopeId !== scopeId))
            return undefined;
        ownerScopeId = scopeId;
        setIsOwner(true);
        return () => {
            if (ownerScopeId === scopeId) ownerScopeId = null;
            setIsOwner(false);
        };
    }, [shouldShow, scopeId]);
    const steps = useMemo(
        () =>
            getComposerLineageTourSteps({
                scope: `[data-composer-tour-scope="${CSS.escape(scopeId)}"]`,
                queries,
                terminalNodeId,
                saveInMenu,
                canAddToChat,
            }),
        [scopeId, queries, terminalNodeId, saveInMenu, canAddToChat],
    );

    return (
        <GuidedTour
            steps={steps}
            opened={shouldShow && isOwner}
            tracking={tracking}
            onClose={closeTour}
            onStepChange={(stepIndex) =>
                onShowLineage(stepIndex >= COMPOSER_LINEAGE_TOUR_LINEAGE_FROM)
            }
        />
    );
};
