import { type Connection } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { resetChartState } from '../../../components/DataViz/store/actions/commonChartActions';
import { useProject } from '../../../hooks/useProject';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    setConnectionUuid,
    switchActiveConnection,
} from '../store/sqlRunnerSlice';
import { writeLastUsedConnection } from '../utils/activeConnection';

export type ActiveConnection = {
    connections: Connection[];
    hasSeveralConnections: boolean;
    /**
     * The catalog endpoints refuse a project with several connections unless
     * the request names one, so nothing may query until a connection is
     * settled. A project with one connection is settled from the start.
     */
    isConnectionSettled: boolean;
    activeConnectionUuid: string | undefined;
    activeConnection: Connection | undefined;
    connectionNameFor: (
        connectionUuid: string | undefined,
    ) => string | undefined;
    switchConnection: (connectionUuid: string) => void;
    seedConnection: (connectionUuid: string) => void;
};

export const useActiveConnection = (): ActiveConnection => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeConnectionUuid = useAppSelector(
        (state) => state.sqlRunner.connectionUuid,
    );
    const { data: project } = useProject(projectUuid);

    const connections = useMemo(
        () => project?.connections ?? [],
        [project?.connections],
    );

    const activeConnection = useMemo(
        () =>
            connections.find(
                (connection) =>
                    connection.connectionUuid === activeConnectionUuid,
            ),
        [connections, activeConnectionUuid],
    );

    const connectionNameFor = useCallback(
        (connectionUuid: string | undefined) =>
            connections.find(
                (connection) => connection.connectionUuid === connectionUuid,
            )?.name,
        [connections],
    );

    // A switch discards the results of the connection the user left behind
    const switchConnection = useCallback(
        (connectionUuid: string) => {
            if (connectionUuid === activeConnectionUuid) return;
            dispatch(switchActiveConnection(connectionUuid));
            dispatch(resetChartState());
            writeLastUsedConnection(projectUuid, connectionUuid);
        },
        [dispatch, projectUuid, activeConnectionUuid],
    );

    // Opening a document on a connection is not switching away from one
    const seedConnection = useCallback(
        (connectionUuid: string) => {
            dispatch(setConnectionUuid(connectionUuid));
            writeLastUsedConnection(projectUuid, connectionUuid);
        },
        [dispatch, projectUuid],
    );

    return {
        connections,
        hasSeveralConnections: connections.length > 1,
        isConnectionSettled:
            activeConnectionUuid !== undefined || connections.length === 1,
        activeConnectionUuid,
        activeConnection,
        connectionNameFor,
        switchConnection,
        seedConnection,
    };
};
