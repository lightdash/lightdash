import { type ApiConnectorType } from '@lightdash/common';
import { useMemo } from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useExternalConnections } from '../hooks/useExternalConnections';

/**
 * The integration and name of a live source connection, or null while
 * loading or when the viewer cannot see the connection. Only fetches once a
 * view actually shows a live source.
 */
export const useLiveSourceConnection = (
    connectionUuid: string | null,
): { connector: ApiConnectorType; name: string } | null => {
    const projectUuid = useProjectUuid();
    const { data } = useExternalConnections(
        connectionUuid ? projectUuid : undefined,
    );
    return useMemo(() => {
        const connection = data?.find(
            (candidate) => candidate.externalConnectionUuid === connectionUuid,
        );
        return connection?.apiSource
            ? {
                  connector: connection.apiSource.connector,
                  name: connection.name,
              }
            : null;
    }, [data, connectionUuid]);
};
