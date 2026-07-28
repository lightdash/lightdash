import { getErrorMessage } from '@lightdash/common';
import { useCallback, useState } from 'react';
import {
    buildVizGenerationPrompt,
    type VizPromptColumn,
} from '../utils/buildVizGenerationPrompt';
import { useAppBuildPoller } from './useAppBuildPoller';
import { useGetApp } from './useGetApp';
import { useIterateApp } from './useIterateApp';

type Args = {
    projectUuid: string | undefined;
    dataAppVizUuid: string | null;
};

export type IterateDataAppVizState = {
    isBuilding: boolean;
    /** The request in flight, so the conversation can show it immediately. */
    pendingPrompt: string | null;
    error: string | null;
    iterate: (description: string, columns: VizPromptColumn[]) => void;
    /** Re-send the request that failed; null when there is nothing to retry. */
    retry: (() => void) | null;
};

/**
 * Ask an existing visualization to change.
 *
 * The chart needs no rewiring when the build lands: the poller writes into the
 * same query key the renderer reads, so it swaps to the new version by itself,
 * and the bindings are reconciled against the new contract at render.
 *
 * A revision applies to the shared visualization, so every chart using it
 * follows. Offering the fork ("update everywhere" vs "save as a copy") needs
 * the consumer count, which lands separately.
 */
export const useIterateDataAppViz = ({
    projectUuid,
    dataAppVizUuid,
}: Args): IterateDataAppVizState => {
    const [isPolling, setIsPolling] = useState(false);
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const [failed, setFailed] = useState<{
        message: string;
        description: string;
        columns: VizPromptColumn[];
    } | null>(null);
    const { mutate: iterateApp, isLoading: isSubmitting } = useIterateApp();

    const { data: appData } = useGetApp(
        projectUuid,
        isPolling ? (dataAppVizUuid ?? undefined) : undefined,
    );

    const handleDone = useCallback(
        (version: number, status: string) => {
            setIsPolling(false);
            const pending = pendingPrompt;
            setPendingPrompt(null);
            if (status === 'ready') return;
            const built = appData?.pages
                .flatMap((page) => page.versions)
                .find((v) => v.version === version);
            setFailed((prev) => ({
                message:
                    built?.statusMessage ??
                    built?.error ??
                    'That change could not be built. Please try again.',
                description: pending ?? prev?.description ?? '',
                columns: prev?.columns ?? [],
            }));
        },
        [appData?.pages, pendingPrompt],
    );

    useAppBuildPoller(
        projectUuid,
        dataAppVizUuid ?? undefined,
        isPolling,
        handleDone,
    );

    const send = useCallback(
        (description: string, columns: VizPromptColumn[]) => {
            if (!projectUuid || !dataAppVizUuid || isPolling) return;
            setFailed(null);
            setPendingPrompt(description);
            iterateApp(
                {
                    projectUuid,
                    appUuid: dataAppVizUuid,
                    prompt: buildVizGenerationPrompt(description, columns),
                },
                {
                    onSuccess: () => setIsPolling(true),
                    onError: (err) => {
                        setPendingPrompt(null);
                        setFailed({
                            message: getErrorMessage(err),
                            description,
                            columns,
                        });
                    },
                },
            );
        },
        [projectUuid, dataAppVizUuid, isPolling, iterateApp],
    );

    return {
        isBuilding: isSubmitting || isPolling,
        pendingPrompt,
        error: failed?.message ?? null,
        iterate: send,
        retry: failed ? () => send(failed.description, failed.columns) : null,
    };
};
