import { type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useQuery } from '@tanstack/react-query';
import { getContentAsCodeSyncStatus } from '../api/getContentAsCodeSyncStatus';
import {
    CONTENT_AS_CODE_SYNC_STATUS_QUERY_KEY,
    type ContentAsCodeSyncStatusResult,
} from '../types';

export const useContentAsCodeSyncStatus = (projectUuid: string | undefined) =>
    useQuery<ContentAsCodeSyncStatusResult, ApiError>({
        queryKey: [CONTENT_AS_CODE_SYNC_STATUS_QUERY_KEY, projectUuid],
        queryFn: () => getContentAsCodeSyncStatus(projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });
