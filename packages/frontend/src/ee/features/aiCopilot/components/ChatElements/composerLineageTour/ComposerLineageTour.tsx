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
// Set on close, so no panel reopens the tour before the completion reaches the cache.
let isClosedThisSession = false;

type Props = {
    /** The panel's `data-composer-tour-scope` value. */
    scopeId: string;
    /** Whether the panel may open the tour; read only until it opens. */
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
    // The tour itself switches the panel to Lineage, so once open it stays eligible.
    const [isLaunched, setIsLaunched] = useState(false);
    const { shouldShow, closeTour, tracking } = useOnboardingTour({
        tour: 'composerLineageTour',
        enabled: ready || isLaunched,
    });
    const [isOwner, setIsOwner] = useState(false);
    useEffect(() => {
        if (
            !shouldShow ||
            isClosedThisSession ||
            (ownerScopeId !== null && ownerScopeId !== scopeId)
        )
            return undefined;
        ownerScopeId = scopeId;
        setIsOwner(true);
        setIsLaunched(true);
        return () => {
            if (ownerScopeId === scopeId) ownerScopeId = null;
            setIsOwner(false);
        };
    }, [shouldShow, scopeId]);
    const opened = shouldShow && isOwner;
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
            opened={opened}
            tracking={tracking}
            onClose={() => {
                isClosedThisSession = true;
                closeTour();
            }}
            onStepChange={(stepIndex) =>
                onShowLineage(stepIndex >= COMPOSER_LINEAGE_TOUR_LINEAGE_FROM)
            }
        />
    );
};
