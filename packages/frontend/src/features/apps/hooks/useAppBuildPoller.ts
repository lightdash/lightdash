import {
    APP_VERSION_TERMINAL_STATUSES,
    type ApiAppVersionSummary,
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
 * Fold a poll result into the cached first page.
 *
 * The poll asks for `limit=1`, so it carries only the newest version.
 * Overwriting the page with it would evict the already-loaded ready version,
 * and surfaces that render straight from this cache (the Explorer's data app
 * viz chart) would lose their last good render for the length of a build.
 */
export const mergePolledVersions = (
    existing: GetAppResult['versions'],
    polled: GetAppResult['versions'],
): GetAppResult['versions'] => {
    const polledNumbers = new Set(polled.map((v) => v.version));
    return [
        ...polled,
        ...existing.filter((v) => !polledNumbers.has(v.version)),
    ].sort((a, b) => b.version - a.version);
};

/**
 * Polls the app versions API via a Web Worker while a version is building.
 * Results are fed into the React Query cache so the UI updates reactively.
 *
 * Calls `onDone` once when the build finishes, with the version the poll just
 * fetched — callers must not read it back out of the query cache, which is
 * still a render behind at that point.
 */
export function useAppBuildPoller(
    projectUuid: string | undefined,
    appUuid: string | undefined,
    isBuilding: boolean,
    onDone: (version: ApiAppVersionSummary) => void,
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
                    ) => {
                        const versions = mergePolledVersions(
                            old?.pages?.[0]?.versions ?? [],
                            poll.versions ?? [],
                        );
                        return {
                            pages: [
                                {
                                    ...poll,
                                    versions,
                                    // The poll's `hasMore` reflects limit=1
                                    // rather than the original page size. Keep
                                    // the first page's so pagination stays
                                    // accurate.
                                    hasMore:
                                        old?.pages?.[0]?.hasMore ??
                                        poll.hasMore,
                                },
                                ...(old?.pages?.slice(1) ?? []),
                            ],
                            pageParams: old?.pageParams ?? [undefined],
                        };
                    },
                );

                const latest = poll.versions?.[0];
                if (
                    latest &&
                    (
                        APP_VERSION_TERMINAL_STATUSES as readonly string[]
                    ).includes(latest.status)
                ) {
                    onDoneRef.current(latest);
                }
            }
        };

        return () => {
            worker.terminate();
            URL.revokeObjectURL(blobUrl);
        };
    }, [isBuilding, projectUuid, appUuid, queryClient]);
}
