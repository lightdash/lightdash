import { useExternalConnections } from '../../../../../features/externalConnections/hooks/useExternalConnections';
import { useLiveSourcesAvailability } from '../../../../../features/externalConnections/hooks/useLiveSourcesAvailability';
import { type RecommendedActionsState } from '../useRecommendedActions';

// Live sources compile into explores, so AI can answer before a warehouse
export const useCanAiAnswer = (
    projectUuid: string,
    actions: RecommendedActionsState,
) => {
    const { isAvailable } = useLiveSourcesAvailability();
    const connections = useExternalConnections(
        isAvailable ? projectUuid : undefined,
    );
    return {
        isLoading: connections.isInitialLoading,
        canAnswer:
            actions.statuses['connect-warehouse'].isComplete ||
            (connections.data ?? []).some(({ kind }) => kind === 'live_source'),
    };
};
