import type { ApiError, RecentContentEntry } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';
import { recentContentQueryKey } from './useRecordContentView';

export function useRecentContent(
    projectUuid: string | undefined,
    enabled = true,
) {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    return useQuery<RecentContentEntry[], ApiError>({
        queryKey: recentContentQueryKey(userUuid, projectUuid),
        queryFn: () =>
            lightdashApi<RecentContentEntry[]>({
                version: 'v2',
                url: `/content/recently-viewed?${new URLSearchParams({ projectUuid: projectUuid! })}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: enabled && !!userUuid && !!projectUuid,
        staleTime: 30_000,
    });
}
