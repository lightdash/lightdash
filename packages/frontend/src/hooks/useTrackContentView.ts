import type { RecordContentView } from '@lightdash/common';
import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';

/** Call on a loaded content page, never per tile or network response. */
export function useTrackContentView(
    projectUuid: string | undefined,
    contentType: RecordContentView['contentType'],
    contentUuid: string | undefined,
    context: RecordContentView['context'] = 'direct',
) {
    const { user } = useApp();
    const userUuid = user.data?.userUuid;
    const lastRecorded = useRef<string | null>(null);
    useEffect(() => {
        if (!userUuid || !projectUuid || !contentUuid) return;
        const key = `${userUuid}:${projectUuid}:${contentType}:${contentUuid}:${context}`;
        if (lastRecorded.current === key) return;
        lastRecorded.current = key;
        void lightdashApi<undefined>({
            version: 'v2',
            url: '/content/views',
            method: 'POST',
            body: JSON.stringify({
                projectUuid,
                contentType,
                contentUuid,
                context,
                viewId: uuidv4(),
            } satisfies RecordContentView),
        }).catch(() => {
            // Best-effort usage capture must never interrupt opening content.
        });
    }, [userUuid, projectUuid, contentType, contentUuid, context]);
}
