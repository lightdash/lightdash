import {
    assertUnreachable,
    QueryHistoryStatus,
    type ApiError,
    type ApiGetSourceQueryStatusResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../../../api';
import { type ComposerRunNodeStatus } from './composerPipeline/AiComposerPipelinePanel';

const POLL_INTERVAL_MS = 1000;

const toNodeStatus = (
    status: QueryHistoryStatus,
): ComposerRunNodeStatus['status'] => {
    switch (status) {
        case QueryHistoryStatus.PENDING:
        case QueryHistoryStatus.QUEUED:
            return 'pending';
        case QueryHistoryStatus.EXECUTING:
            return 'running';
        case QueryHistoryStatus.READY:
            return 'success';
        case QueryHistoryStatus.ERROR:
        case QueryHistoryStatus.EXPIRED:
        case QueryHistoryStatus.CANCELLED:
            return 'error';
        default:
            return assertUnreachable(status, 'Unknown query status');
    }
};

const isSettled = (results: ApiGetSourceQueryStatusResults | undefined) =>
    !!results &&
    results.statuses.every(({ status }) => {
        const nodeStatus = toNodeStatus(status);
        return nodeStatus === 'success' || nodeStatus === 'error';
    });

const NO_STATUSES: Record<string, ComposerRunNodeStatus> = {};

/** Polls the status of every node of a run until each one has finished. */
export const useComposerRunNodeStatuses = ({
    projectUuid,
    nodeQueryUuids,
}: {
    projectUuid: string;
    nodeQueryUuids: Record<string, string> | null;
}): Record<string, ComposerRunNodeStatus> => {
    const queryUuids = useMemo(
        () => Object.values(nodeQueryUuids ?? {}),
        [nodeQueryUuids],
    );
    const { data } = useQuery<ApiGetSourceQueryStatusResults, ApiError>({
        queryKey: ['composerRunNodeStatuses', projectUuid, queryUuids],
        queryFn: () =>
            lightdashApi<ApiGetSourceQueryStatusResults>({
                url: `/projects/${projectUuid}/query-sources/queries/status?${new URLSearchParams(
                    queryUuids.map((queryUuid) => ['queryUuids', queryUuid]),
                )}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        enabled: queryUuids.length > 0,
        refetchInterval: (results) =>
            isSettled(results) ? false : POLL_INTERVAL_MS,
        retry: false,
    });
    return useMemo(() => {
        if (!nodeQueryUuids || !data?.statuses) return NO_STATUSES;
        const byQueryUuid = new Map(
            data.statuses.map((status) => [status.queryUuid, status]),
        );
        return Object.fromEntries(
            Object.entries(nodeQueryUuids).flatMap(([nodeId, queryUuid]) => {
                const status = byQueryUuid.get(queryUuid);
                return status
                    ? [
                          [
                              nodeId,
                              {
                                  status: toNodeStatus(status.status),
                                  error: status.error,
                              },
                          ],
                      ]
                    : [];
            }),
        );
    }, [nodeQueryUuids, data]);
};
