import { useExternalConnections } from '../../../../features/externalConnections/hooks/useExternalConnections';

export const useHasLiveSources = (
    projectUuid: string,
    enabled: boolean,
): boolean => {
    const connections = useExternalConnections(
        enabled ? projectUuid : undefined,
    );
    return (connections.data ?? []).some(({ kind }) => kind === 'live_source');
};
