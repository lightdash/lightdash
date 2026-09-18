import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearMissingConnection } from '../store/sqlRunnerSlice';
import {
    forgetLastUsedConnection,
    isMissingConnectionError,
} from '../utils/activeConnection';

const NOTICE_KEY = 'sql-runner-connection-removed';

/**
 * A run or catalog call that fails on a missing connection means the cached
 * project is stale. Refetching it is what lets the reconciliation below see
 * the connection is gone.
 */
export const useReportMissingConnection = () => {
    const queryClient = useQueryClient();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);

    return useCallback(
        (error: unknown) => {
            if (!projectUuid || !isMissingConnectionError(error)) return;
            void queryClient.invalidateQueries(['project', projectUuid]);
        },
        [queryClient, projectUuid],
    );
};

/**
 * Keeps the active connection honest against the project's connection list.
 * A connection removed in another tab leaves the picker, the tree and the
 * stored last-used connection behind; the results already on screen stay.
 * Mount this once.
 */
export const useReconcileActiveConnection = () => {
    const dispatch = useAppDispatch();
    const { showToastInfo } = useToaster();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const connectionUuid = useAppSelector(
        (state) => state.sqlRunner.connectionUuid,
    );
    const { data: project } = useProject(projectUuid);
    const connections = project?.connections;

    useEffect(() => {
        if (!connectionUuid || !connections) return;
        if (
            connections.some(
                (connection) => connection.connectionUuid === connectionUuid,
            )
        ) {
            return;
        }
        dispatch(clearMissingConnection());
        forgetLastUsedConnection(projectUuid, connectionUuid);
        showToastInfo({
            key: NOTICE_KEY,
            title: 'This connection was removed',
            subtitle: 'Choose another connection to run the query again.',
        });
    }, [dispatch, showToastInfo, projectUuid, connectionUuid, connections]);
};
