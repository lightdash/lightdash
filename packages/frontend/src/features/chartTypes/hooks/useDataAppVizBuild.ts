import {
    DATA_APP_VIZ_TEMPLATE,
    getErrorMessage,
    type ApiAppVersionSummary,
    type AppClarification,
    type DataAppClaudeModel,
    type DataAppCodexModel,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { useCallback, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import { useAppBuildPoller } from '../../apps/hooks/useAppBuildPoller';
import { useCancelAppVersion } from '../../apps/hooks/useCancelAppVersion';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useGenerateApp } from '../../apps/hooks/useGenerateApp';
import { useIterateApp } from '../../apps/hooks/useIterateApp';
import { autoMapDataAppVizFields } from '../utils/autoMapDataAppVizFields';

type Args = {
    projectUuid: string | undefined;
    itemsMap: ItemsMap;
    /** The visualization being revised; null while authoring a new one. */
    dataAppVizUuid: string | null;
    /** Called once a new visualization lands ready with the chart still
     *  pointing at nothing, with its contract bound. */
    onCreated: (
        dataAppVizUuid: string,
        fieldMapping: DataAppVizFieldMapping,
    ) => void;
};

/** What was asked for, kept so a failure can be retried as it was sent. */
export type VizBuildRequest = {
    description: string;
    fileIds: string[];
    /** Answers to the pre-build clarifying round; empty when it was skipped,
     *  fell through, or never ran. Only a first build can carry them. */
    clarifications: AppClarification[];
} & (
    | { claudeModel: DataAppClaudeModel; codexModel?: never }
    | { codexModel: DataAppCodexModel; claudeModel?: never }
);

/** The app claimed by a build before it has a renderable version. */
export type DataAppVizDraft = {
    appUuid: string;
    version: number;
    startedAt: Date;
};

type RunningBuild = DataAppVizDraft & { isNew: boolean };

export type DataAppVizBuildState = {
    /** Pre-generated uuid used to scope uploads for the next new app. */
    draftAppUuid: string;
    /**
     * The app the build in flight claimed; null when nothing is building. Its
     * versions are the session, so the dock reads history from it while the
     * chart still points at nothing.
     */
    appUuid: string | null;
    draft: DataAppVizDraft | null;
    /** When the build in flight started, for the panel's clock. */
    startedAt: Date | null;
    /**
     * The version the build in flight claimed; null until the server accepts
     * it. What tells a surface that its live row now lives in history.
     */
    claimedVersion: number | null;
    isBuilding: boolean;
    /** The active build has been asked to stop and cancellation is pending. */
    isCancelling: boolean;
    /** Why the last cancellation attempt failed. */
    cancelError: string | null;
    /** The request in flight, so the log can show it immediately. */
    pendingPrompt: string | null;
    /** Why the last attempt failed, for the log's error row. */
    error: string | null;
    send: (request: VizBuildRequest) => void;
    /** Re-send the request that failed; null when there is nothing to retry. */
    retry: (() => void) | null;
    /** Cancels the active version but preserves its app for a follow-up. */
    interrupt: (() => void) | null;
    /** Cancels a revision without deleting its app. */
    cancel: (() => void) | null;
    /** Cancels the build and deletes its draft app. */
    discard: (() => void) | null;
};

/**
 * Build a chart type visualization: generate one when none is selected, ask
 * the selected one to change when there is.
 *
 * Charts need no rewiring when the build lands: the poller writes into the
 * same query key the renderer reads, so they pick up the new version by
 * themselves, and the bindings are reconciled against the contract at render.
 *
 * Nothing is sent for the space: a builder-authored viz is personal, exactly
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
    const [draftAppUuid, setDraftAppUuid] = useState(() => uuid4());
    const [failed, setFailed] = useState<{
        message: string;
        request: VizBuildRequest | null;
    } | null>(null);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const { mutate: generateApp } = useGenerateApp();
    const { mutate: iterateApp } = useIterateApp();
    const { mutate: cancelVersion, isLoading: isCancelling } =
        useCancelAppVersion();
    const { mutate: deleteApp } = useDeleteApp();

    const handleDone = useCallback(
        (version: ApiAppVersionSummary) => {
            const target = building;
            const request = inFlight;
            setBuilding(null);
            setInFlight(null);
            if (version.status === 'ready') {
                // Only new visualizations need selecting; later picker choices win.
                if (target?.isNew && dataAppVizUuid === null) {
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
                // A new app cannot retry with its already-claimed uuid.
                request: target?.isNew ? null : request,
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
            setCancelError(null);
            setInFlight(request);
            const prompt = request.description;
            const files =
                request.fileIds.length > 0 ? request.fileIds : undefined;
            const onError = (err: unknown) => {
                setInFlight(null);
                setFailed({ message: getErrorMessage(err), request });
            };

            if (dataAppVizUuid === null) {
                generateApp(
                    {
                        projectUuid,
                        prompt,
                        template: DATA_APP_VIZ_TEMPLATE,
                        creationExperience: 'chart_type_builder',
                        appUuid: draftAppUuid,
                        fileIds: files,
                        ...(request.codexModel
                            ? { codexModel: request.codexModel }
                            : { claudeModel: request.claudeModel }),
                        clarifications:
                            request.clarifications.length > 0
                                ? request.clarifications
                                : undefined,
                    },
                    {
                        onSuccess: ({ appUuid, version }) => {
                            setDraftAppUuid(uuid4());
                            setBuilding({
                                appUuid,
                                version,
                                startedAt: new Date(),
                                isNew: true,
                            });
                        },
                        onError,
                    },
                );
                return;
            }
            iterateApp(
                {
                    projectUuid,
                    appUuid: dataAppVizUuid,
                    prompt,
                    creationExperience: 'chart_type_builder',
                    fileIds: files,
                    ...(request.codexModel
                        ? { codexModel: request.codexModel }
                        : { claudeModel: request.claudeModel }),
                },
                {
                    onSuccess: ({ version }) =>
                        setBuilding({
                            appUuid: dataAppVizUuid,
                            version,
                            startedAt: new Date(),
                            isNew: false,
                        }),
                    onError,
                },
            );
        },
        [
            projectUuid,
            dataAppVizUuid,
            building,
            draftAppUuid,
            generateApp,
            iterateApp,
        ],
    );

    const failedRequest = failed?.request ?? null;
    const draft = building?.isNew ? building : null;
    const cancelPreservingApp =
        projectUuid && building
            ? () => {
                  setCancelError(null);
                  cancelVersion(
                      {
                          projectUuid,
                          appUuid: building.appUuid,
                          version: building.version,
                      },
                      {
                          onSuccess: () => {
                              setBuilding(null);
                              setInFlight(null);
                              setFailed(null);
                          },
                          onError: (error) =>
                              setCancelError(getErrorMessage(error)),
                      },
                  );
              }
            : null;

    return {
        draftAppUuid,
        appUuid: building?.appUuid ?? null,
        draft,
        startedAt: building?.startedAt ?? null,
        claimedVersion: building?.version ?? null,
        // A request is in flight from the moment it is sent until the build
        // lands or the send fails — the mutation's own loading flag covers
        // only the submit itself.
        isBuilding: inFlight !== null,
        isCancelling,
        cancelError,
        pendingPrompt: inFlight?.description ?? null,
        error: failed?.message ?? null,
        send,
        retry: failedRequest ? () => send(failedRequest) : null,
        interrupt: cancelPreservingApp,
        cancel: building && !building.isNew ? cancelPreservingApp : null,
        discard:
            projectUuid && draft
                ? () => {
                      setCancelError(null);
                      // Cancel before delete to avoid orphaned sandbox work.
                      cancelVersion(
                          {
                              projectUuid,
                              appUuid: draft.appUuid,
                              version: draft.version,
                          },
                          {
                              onSettled: () =>
                                  deleteApp({
                                      projectUuid,
                                      appUuid: draft.appUuid,
                                  }),
                          },
                      );
                      setBuilding(null);
                      setInFlight(null);
                      setFailed(null);
                  }
                : null,
    };
};
