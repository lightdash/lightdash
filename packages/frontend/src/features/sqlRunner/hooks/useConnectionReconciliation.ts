import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearMissingConnection } from '../store/sqlRunnerSlice';
import {
    forgetLastUsedConnection,
    isMissingConnectionError,
} from '../utils/activeConnection';

const NOTICE_KEY = 'sql-runner-connection-removed';
const CONNECTION_POLL_MS = 15_000;

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
    // While the runner is open the list is polled, so a connection removed in
    // another tab is noticed without the user having to act first.
    const { data: project } = useProject(projectUuid, {
        refetchInterval: CONNECTION_POLL_MS,
        refetchOnWindowFocus: true,
    });
    const connections = project?.connections;

    // The name is gone from the list by the time the removal is noticed, so
    // remember it while the connection is still there.
    const activeNameRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const active = connections?.find(
            (connection) => connection.connectionUuid === connectionUuid,
        );
        if (active) activeNameRef.current = active.name;
    }, [connections, connectionUuid]);

    useEffect(() => {
        if (!connectionUuid || !connections) return;
        if (
            connections.some(
                (connection) => connection.connectionUuid === connectionUuid,
            )
        ) {
            return;
        }
        const removedName = activeNameRef.current;
        dispatch(clearMissingConnection(removedName));
        forgetLastUsedConnection(projectUuid, connectionUuid);
        showToastInfo({
            key: NOTICE_KEY,
            title: removedName
                ? `"${removedName}" was removed from this project`
                : 'This connection was removed from this project',
            subtitle:
                'Your SQL is still here. Choose another connection to run it.',
            autoClose: false,
        });
    }, [dispatch, showToastInfo, projectUuid, connectionUuid, connections]);
};
