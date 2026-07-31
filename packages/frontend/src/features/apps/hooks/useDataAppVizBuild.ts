import {
    DATA_APP_VIZ_TEMPLATE,
    getErrorMessage,
    type ApiAppVersionSummary,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { useCallback, useState } from 'react';
import { autoMapDataAppVizFields } from '../utils/autoMapDataAppVizFields';
import { useAppBuildPoller } from './useAppBuildPoller';
import { useGenerateApp } from './useGenerateApp';

type Args = {
    projectUuid: string | undefined;
    itemsMap: ItemsMap;
    /** The visualization the chart points at; null while it points at none. */
    dataAppVizUuid: string | null;
    /** Called once a new visualization lands ready, with its contract bound. */
    onCreated: (
        dataAppVizUuid: string,
        fieldMapping: DataAppVizFieldMapping,
    ) => void;
};

/** What was asked for, kept so a failure can be retried as it was sent. */
export type VizBuildRequest = {
    description: string;
};

/**
 * A build in flight, once the server has accepted it. It is a real app
 * already — the request creates it — but it has no ready version yet, so it is
 * not worth pointing a chart at.
 */
type RunningBuild = {
    appUuid: string;
    version: number;
    startedAt: Date;
};

export type DataAppVizBuildState = {
    /**
     * The app the build in flight claimed; null when nothing is building. Its
     * versions are the session, so the dock reads history from it while the
     * chart still points at nothing.
     */
    appUuid: string | null;
    /** When the build in flight started, for the panel's clock. */
    startedAt: Date | null;
    /**
     * The version the build in flight claimed; null until the server accepts
     * it. What tells a surface that its live row now lives in history.
     */
    claimedVersion: number | null;
    isBuilding: boolean;
    /** The request in flight, so the log can show it immediately. */
    pendingPrompt: string | null;
    /** Why the last attempt failed, for the log's error row. */
    error: string | null;
    send: (request: VizBuildRequest) => void;
    /** Re-send the request that failed; null when there is nothing to retry. */
    retry: (() => void) | null;
};

/**
 * Build a visualization for the chart from its own query.
 *
 * The chart needs no rewiring when the build lands: the poller writes into the
 * same query key the renderer reads, so it picks up the new version by itself,
 * and the bindings are reconciled against the contract at render.
 *
 * Nothing is sent for the space: an Explorer-authored viz is personal, exactly
 * as one created in the generator is, and is filed into a space afterwards.
 */
export const useDataAppVizBuild = ({
    projectUuid,
    itemsMap,
    dataAppVizUuid,
    onCreated,
}: Args): DataAppVizBuildState => {
    // The request in flight, and the app it is building — both null when idle.
    const [inFlight, setInFlight] = useState<VizBuildRequest | null>(null);
    const [building, setBuilding] = useState<RunningBuild | null>(null);
    const [failed, setFailed] = useState<{
        message: string;
        request: VizBuildRequest | null;
    } | null>(null);
    const { mutate: generateApp } = useGenerateApp();

    const handleDone = useCallback(
        (version: ApiAppVersionSummary) => {
            const target = building;
            const request = inFlight;
            setBuilding(null);
            setInFlight(null);
            if (version.status === 'ready') {
                // Picking a visualization while creation runs is a newer user
                // decision, so a late completion must not replace it.
                if (target && dataAppVizUuid === null) {
                    onCreated(
                        target.appUuid,
                        autoMapDataAppVizFields(
                            version.resources?.vizSchema?.fields ?? [],
                            itemsMap,
                        ),
                    );
                }
                return;
            }
            setFailed({
                message:
                    version.statusMessage ??
                    version.error ??
                    'That build could not be completed. Please try again.',
                request,
            });
        },
        [building, inFlight, itemsMap, dataAppVizUuid, onCreated],
    );

    useAppBuildPoller(
        projectUuid,
        building?.appUuid,
        building !== null,
        handleDone,
    );

    const send = useCallback(
        (request: VizBuildRequest) => {
            if (!projectUuid || building !== null) return;
            setFailed(null);
            setInFlight(request);
            generateApp(
                {
                    projectUuid,
                    prompt: request.description,
                    template: DATA_APP_VIZ_TEMPLATE,
                },
                {
                    onSuccess: ({ appUuid, version }) =>
                        setBuilding({
                            appUuid,
                            version,
                            startedAt: new Date(),
                        }),
                    onError: (err) => {
                        setInFlight(null);
                        setFailed({ message: getErrorMessage(err), request });
                    },
                },
            );
        },
        [projectUuid, building, generateApp],
    );

    const failedRequest = failed?.request ?? null;

    return {
        appUuid: building?.appUuid ?? null,
        startedAt: building?.startedAt ?? null,
        claimedVersion: building?.version ?? null,
        // A request is in flight from the moment it is sent until the build
        // lands or the send fails — the mutation's own loading flag covers
        // only the submit itself.
        isBuilding: inFlight !== null,
        pendingPrompt: inFlight?.description ?? null,
        error: failed?.message ?? null,
        send,
        retry: failedRequest ? () => send(failedRequest) : null,
    };
};
