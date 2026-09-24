import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isMissingConnectionError } from '../utils/activeConnection';
import { useActiveConnection } from './useActiveConnection';
import { sqlRunnerConnectionsQueryKey } from './useConnectionCatalog';

export const useReportMissingConnection = () => {
    const queryClient = useQueryClient();
    const { projectUuid } = useActiveConnection();

    return useCallback(
        (error: unknown) => {
            if (!isMissingConnectionError(error)) return;
            void queryClient.invalidateQueries(
                sqlRunnerConnectionsQueryKey(projectUuid),
            );
        },
        [queryClient, projectUuid],
    );
};
