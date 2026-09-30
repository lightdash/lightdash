import { useEffect, useRef, type FC } from 'react';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useActiveConnection } from '../hooks/useActiveConnection';
import {
    connectionAnalyticsProperties,
    findConnectionByBinding,
} from '../utils/connectionAnalytics';

export const ConnectionHintTracker: FC<{
    connectionHint: string | null;
    organizationUuid: string;
}> = ({ connectionHint, organizationUuid }) => {
    const { projectUuid, connections } = useActiveConnection();
    const { track } = useTracking();
    const hasTracked = useRef(false);

    useEffect(() => {
        if (hasTracked.current) return;
        hasTracked.current = true;
        const resolved = findConnectionByBinding(connections, connectionHint);
        track({
            name: EventName.SQL_RUNNER_CONNECTION_HINT_RESOLVED,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                connectionCount: connections.length,
                entryPoint: 'open_in_sql_runner',
                requestedConnectionKind:
                    connectionHint === null ? 'primary' : 'extra',
                outcome: resolved ? 'applied' : 'connection_not_found',
                ...connectionAnalyticsProperties(resolved),
                warehouseConnectionId:
                    resolved?.warehouseConnectionUuid ?? connectionHint,
                connectionKind: connectionHint === null ? 'primary' : 'extra',
            },
        });
    }, [connectionHint, connections, organizationUuid, projectUuid, track]);

    return null;
};
