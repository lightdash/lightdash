import type { RecordRecentContentView } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';

const recentContentQueryKey = (
    userUuid: string | undefined,
    projectUuid: string | undefined,
) => ['recent_content', userUuid, projectUuid];

export function useRecordContentView(
    projectUuid: string | undefined,
    contentType: RecordRecentContentView['contentType'],
    contentUuid: string | undefined,
) {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const queryClient = useQueryClient();
    const lastRecorded = useRef<string | null>(null);

    useEffect(() => {
        if (!userUuid || !projectUuid || !contentUuid) return;
        const key = `${userUuid}:${projectUuid}:${contentType}:${contentUuid}`;
        if (lastRecorded.current === key) return;
        lastRecorded.current = key;
        void lightdashApi<undefined>({
            version: 'v2',
            url: '/content/recently-viewed',
            method: 'POST',
            body: JSON.stringify({
                projectUuid,
                contentType,
                contentUuid,
            } satisfies RecordRecentContentView),
        })
            .then(() => {
                void queryClient.invalidateQueries({
                    queryKey: recentContentQueryKey(userUuid, projectUuid),
                });
            })
            .catch(() => {
                // Recency tracking must not interrupt opening content.
            });
    }, [userUuid, projectUuid, contentType, contentUuid, queryClient]);
}
