import { useCallback } from 'react';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import { type SqlRunnerConnectionSwitchSource } from '../../../../providers/Tracking/types';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { connectionAnalyticsProperties } from '../utils/connectionAnalytics';
import { useActiveConnection } from './useActiveConnection';

export const useTrackedConnectionSwitch = () => {
    const { projectUuid, connections, activeConnection, switchConnection } =
        useActiveConnection();
    const { user } = useApp();
    const { track } = useTracking();
    const { data: project } = useProject(projectUuid);
    const organizationUuid =
        project?.organizationUuid ?? user.data?.organizationUuid ?? null;

    return useCallback(
        (
            warehouseConnectionUuid: string,
            source: SqlRunnerConnectionSwitchSource,
        ) => {
            const next = connections.find(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    warehouseConnectionUuid,
            );
            if (
                next &&
                next.warehouseConnectionUuid !==
                    activeConnection?.warehouseConnectionUuid
            ) {
                const previous =
                    connectionAnalyticsProperties(activeConnection);
                track({
                    name: EventName.SQL_RUNNER_CONNECTION_SWITCHED,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        connectionCount: connections.length,
                        source,
                        ...connectionAnalyticsProperties(next),
                        previousWarehouseConnectionId:
                            previous.warehouseConnectionId,
                        previousConnectionKind: previous.connectionKind,
                        previousWarehouseType: previous.warehouseType,
                    },
                });
            }
            switchConnection(warehouseConnectionUuid);
        },
        [
            connections,
            activeConnection,
            organizationUuid,
            projectUuid,
            switchConnection,
            track,
        ],
    );
};
