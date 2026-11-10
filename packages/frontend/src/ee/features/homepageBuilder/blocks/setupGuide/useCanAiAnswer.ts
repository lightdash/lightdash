import { FeatureFlags } from '@lightdash/common';
import { useExternalConnections } from '../../../../../features/externalConnections/hooks/useExternalConnections';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { type RecommendedActionsState } from '../useRecommendedActions';

// Live sources compile into explores, so AI can answer before a warehouse
export const useCanAiAnswer = (
    projectUuid: string,
    actions: RecommendedActionsState,
) => {
    const isNewOnboarding =
        useServerFeatureFlag(FeatureFlags.NewOnboarding).data?.enabled === true;
    const connections = useExternalConnections(
        isNewOnboarding ? projectUuid : undefined,
    );
    return {
        isLoading: connections.isInitialLoading,
        canAnswer:
            actions.statuses['connect-warehouse'].isComplete ||
            (connections.data ?? []).some(({ kind }) => kind === 'live_source'),
    };
};
