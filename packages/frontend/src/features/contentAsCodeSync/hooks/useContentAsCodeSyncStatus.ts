import { type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useQuery } from '@tanstack/react-query';
import { getContentAsCodeSyncStatus } from '../api/getContentAsCodeSyncStatus';
import { type ContentAsCodeSyncStatus } from '../types';

export const useContentAsCodeSyncStatus = (projectUuid: string | undefined) =>
    useQuery<ContentAsCodeSyncStatus, ApiError>({
        queryKey: ['content-as-code-sync-status', projectUuid],
        queryFn: () => getContentAsCodeSyncStatus(projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });
