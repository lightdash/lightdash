import { type ExternalConnection } from '@lightdash/common';
import { type QueryClient } from '@tanstack/react-query';

/**
 * Refreshes what saving a connection changes. A live data source's explores
 * are rebuilt by the time the save returns; a data app connection has none.
 */
export const invalidateSavedConnection = (
    queryClient: QueryClient,
    projectUuid: string,
    connection: ExternalConnection,
) =>
    Promise.all([
        queryClient.invalidateQueries({
            queryKey: ['external-connections', projectUuid],
        }),
        connection.kind === 'live_source'
            ? queryClient.invalidateQueries({ queryKey: ['tables'] })
            : undefined,
    ]);
