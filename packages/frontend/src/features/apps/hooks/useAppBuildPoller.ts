import {
    APP_VERSION_TERMINAL_STATUSES,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

type GetAppResult = ApiGetAppResponse['results'];

// Inline Web Worker that polls the API in the background.
// Dedicated Workers continue running even when the parent tab is throttled/frozen.
// Terminal statuses are interpolated at module load from the shared constant
// so the worker string stays in sync with backend logic.
const WORKER_CODE = `
const TERMINAL_STATUSES = ${JSON.stringify([...APP_VERSION_TERMINAL_STATUSES])};
let active = true;
self.onmessage = (e) => {
    if (e.data.type === 'start') pollLoop(e.data.url, e.data.interval);
    else if (e.data.type === 'stop') active = false;
};
async function pollLoop(url, interval) {
    while (active) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                self.postMessage({ type: 'data', results: data.results });
                const latest = data.results && data.results.versions && data.results.versions[0];
                if (latest && TERMINAL_STATUSES.includes(latest.status)) {
                    active = false;
                    return;
                }
            }
        } catch (e) { /* retry */ }
        await new Promise(r => setTimeout(r, interval));
    }
}
`;

/**
 * Polls the app versions API via a Web Worker while a version is building.
 * Results are fed into the React Query cache so the UI updates reactively.
 *
 * Calls `onDone(version, status)` once when the build finishes.
 */
export function useAppBuildPoller(
    projectUuid: string | undefined,
    appUuid: string | undefined,
    isBuilding: boolean,
    onDone: (version: number, status: string) => void,
) {
    const queryClient = useQueryClient();
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    useEffect(() => {
        if (!isBuilding || !projectUuid || !appUuid) return;

        const blob = new Blob([WORKER_CODE], {
            type: 'application/javascript',
        });
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);

        const apiUrl = `${window.location.origin}/api/v1/ee/projects/${projectUuid}/apps/${appUuid}?limit=1`;
        worker.postMessage({ type: 'start', url: apiUrl, interval: 3000 });

        worker.onmessage = (e: MessageEvent) => {
            if (e.data.type === 'data' && e.data.results) {
                const poll: GetAppResult = e.data.results;
                queryClient.setQueryData(
                    ['app', projectUuid, appUuid],
                    (
                        old:
                            | {
                                  pages: GetAppResult[];
                                  pageParams: unknown[];
                              }
                            | undefined,
                    ) => ({
                        // The poll uses limit=1, so its `hasMore` reflects that
                        // limit rather than the original page size. Keep the
                        // first page's `hasMore` so pagination stays accurate.
                        pages: [
                            {
                                ...poll,
                                hasMore:
                                    old?.pages?.[0]?.hasMore ?? poll.hasMore,
                            },
                            ...(old?.pages?.slice(1) ?? []),
                        ],
                        pageParams: old?.pageParams ?? [undefined],
                    }),
                );

                const latest = poll.versions?.[0];
                if (
                    latest &&
                    (
                        APP_VERSION_TERMINAL_STATUSES as readonly string[]
                    ).includes(latest.status)
                ) {
                    onDoneRef.current(
                        latest.version as number,
                        latest.status as string,
                    );
                }
            }
        };

        return () => {
            worker.terminate();
            URL.revokeObjectURL(blobUrl);
        };
    }, [isBuilding, projectUuid, appUuid, queryClient]);
}
