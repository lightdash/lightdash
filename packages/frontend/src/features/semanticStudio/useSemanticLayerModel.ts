import {
    FeatureFlags,
    type ApiError,
    type ApiResponse,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
    type SemanticLayerDraftImpact,
    type SemanticLayerDraftMoveDirection,
    type SemanticLayerDraftUsage,
    type SemanticLayerModelCode,
    type SemanticLayerStatus,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const DRAFT_KEY = 'semantic-layer-draft';
const MODEL_KEY = 'semantic-layer-model';
const PENDING_POLL_MS = 2000;
const DRAFT_POLL_MS = 60_000;

const toUrl = (projectUuid: string, path: string) =>
    `/projects/${projectUuid}/semantic-studio${path}`;

/** The draft's own path, or one model's part of it. */
const toDraftPath = (model: string | null) =>
    model === null ? '/draft' : `/draft/models/${encodeURIComponent(model)}`;

const useGet = <T extends ApiResponse['results']>(
    queryKey: (string | null)[],
    projectUuid: string,
    path: string,
    enabled: boolean,
    /** Polls while this holds for what was last read. */
    isPending: (data: T) => boolean = () => false,
    /** How often to read again otherwise; false never does. */
    idlePollMs: number | false = false,
) => {
    const lightdashApi = useLightdashApi();
    const flag = useServerFeatureFlag(FeatureFlags.SemanticStudioEditing);
    return useQuery<T, ApiError>({
        queryKey,
        queryFn: () =>
            lightdashApi<T>({
                url: toUrl(projectUuid, path),
                method: 'GET',
                body: undefined,
            }),
        enabled: enabled && flag.data?.enabled === true,
        refetchInterval: (data) =>
            data !== undefined && isPending(data)
                ? PENDING_POLL_MS
                : idlePollMs,
    });
};

const useStatus = (projectUuid: string) =>
    useGet<SemanticLayerStatus>(
        ['semantic-layer-status', projectUuid],
        projectUuid,
        '/status',
        true,
    ).data;

/** Whether this person can change this project's models here. */
export const useCanEditSemanticLayer = (projectUuid: string): boolean =>
    useStatus(projectUuid)?.enabled === true;

/** Whether changes here go through a draft; false on a dbt project, where the agent edits the repository in a pull request. */
export const useKeepsSemanticLayerDraft = (projectUuid: string): boolean =>
    useStatus(projectUuid)?.appliesAs !== 'dbt_pull_request';

/** Whether applying a draft opens a pull request on the project's repository instead of going live. */
export const useAppliesAsPullRequest = (projectUuid: string): boolean =>
    useStatus(projectUuid)?.appliesAs === 'pull_request';

/** A model's YAML and history; null when the project keeps no such model or this person cannot change it. */
export const useSemanticLayerModel = (projectUuid: string, modelName: string) =>
    useGet<SemanticLayerModelCode | null>(
        [MODEL_KEY, projectUuid, modelName],
        projectUuid,
        `/models/${encodeURIComponent(modelName)}`,
        modelName !== '',
    );

/** This person's draft, replayed on what is live; empty for someone who cannot change the project. */
export const useSemanticLayerDraft = (
    projectUuid: string,
    enabled: boolean = true,
) =>
    useGet<SemanticLayerDraft>(
        [DRAFT_KEY, projectUuid],
        projectUuid,
        '/draft',
        enabled,
        undefined,
        // A draft is replayed on what is live at each read, so reading again is how a person learns that live moved.
        DRAFT_POLL_MS,
    );

/** What the background check found the draft, or one model of it, would break in saved charts and dashboards. */
export const useSemanticLayerDraftImpact = (
    projectUuid: string,
    model: string | null,
) =>
    useGet<SemanticLayerDraftImpact>(
        [DRAFT_KEY, projectUuid, 'impact', model],
        projectUuid,
        `/draft/impact${model === null ? '' : `?model=${encodeURIComponent(model)}`}`,
        true,
        ({ status }) => status === 'checking',
    );

/** Saved content that reads a field the draft defines differently or removes. */
export const useSemanticLayerDraftUsage = (projectUuid: string) =>
    useGet<SemanticLayerDraftUsage>(
        [DRAFT_KEY, projectUuid, 'usage'],
        projectUuid,
        '/draft/usage',
        true,
    );

export const useRefreshSemanticLayerDraft = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useCallback(
        () =>
            queryClient.invalidateQueries({
                queryKey: [DRAFT_KEY, projectUuid],
            }),
        [queryClient, projectUuid],
    );
};

/** A write to the draft or the live models; `changesLive` also refreshes what reads the models. */
const useWrite = <TResult extends ApiResponse['results'], TInput>({
    projectUuid,
    request,
    errorTitle,
    changesLive,
}: {
    projectUuid: string;
    request: (input: TInput) => {
        path: string;
        method: 'POST' | 'DELETE';
        body: string | undefined;
    };
    errorTitle: string;
    changesLive: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<TResult, ApiError, TInput>({
        mutationFn: (input) => {
            const { path, method, body } = request(input);
            return lightdashApi<TResult>({
                url: toUrl(projectUuid, path),
                method,
                body,
            });
        },
        onSuccess: () =>
            Promise.all(
                [
                    [DRAFT_KEY, projectUuid],
                    // Explores read the draft while the development view is on.
                    ['tables'],
                    ...(changesLive ? [[MODEL_KEY, projectUuid]] : []),
                ].map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey }),
                ),
            ),
        onError: ({ error }) => {
            showToastApiError({ title: errorTitle, apiError: error });
            // A refusal often means the draft on screen is out of date.
            void queryClient.invalidateQueries({
                queryKey: [DRAFT_KEY, projectUuid],
            });
        },
    });
};

/** Takes the draft live, or one model of it. */
export const useApplySemanticLayerDraft = (projectUuid: string) =>
    useWrite<SemanticLayerDraftApplyResult, string | null>({
        projectUuid,
        request: (model) => ({
            path: `${toDraftPath(model)}/apply`,
            method: 'POST',
            body: undefined,
        }),
        errorTitle: 'Could not apply',
        changesLive: true,
    });

/** Has the draft checked against saved charts and dashboards again. */
export const useCheckSemanticLayerDraftImpact = (projectUuid: string) =>
    useWrite<undefined, undefined>({
        projectUuid,
        request: () => ({
            path: '/draft/impact',
            method: 'POST',
            body: undefined,
        }),
        errorTitle: 'Could not check',
        changesLive: false,
    });

/** Discards the draft, or one model of it. */
export const useDiscardSemanticLayerDraft = (projectUuid: string) =>
    useWrite<undefined, string | null>({
        projectUuid,
        request: (model) => ({
            path: toDraftPath(model),
            method: 'DELETE',
            body: undefined,
        }),
        errorTitle: 'Could not discard',
        changesLive: false,
    });

export const useDiscardDraftChange = (projectUuid: string) =>
    useWrite<undefined, string>({
        projectUuid,
        request: (draftChangeUuid) => ({
            path: `/draft/changes/${draftChangeUuid}`,
            method: 'DELETE',
            body: undefined,
        }),
        errorTitle: 'Could not discard',
        changesLive: false,
    });

/** Keeps the draft of a model over what was published to it since. */
export const useKeepDraftModel = (projectUuid: string) =>
    useWrite<undefined, { model: string; liveVersion: number | null }>({
        projectUuid,
        request: ({ model, liveVersion }) => ({
            path: `${toDraftPath(model)}/keep`,
            method: 'POST',
            body: JSON.stringify({ liveVersion }),
        }),
        errorTitle: 'Could not keep your version',
        changesLive: false,
    });

/** Leaves one part of a drafted model as it is live. */
export const useTakeLiveDraftPart = (projectUuid: string) =>
    useWrite<undefined, { model: string; path: string }>({
        projectUuid,
        request: ({ model, path }) => ({
            path: `${toDraftPath(model)}/take-live`,
            method: 'POST',
            body: JSON.stringify({ path }),
        }),
        errorTitle: 'Could not take the live version',
        changesLive: false,
    });

/** Moves one change one place earlier or later in the draft. */
export const useMoveDraftChange = (projectUuid: string) =>
    useWrite<
        undefined,
        { draftChangeUuid: string; direction: SemanticLayerDraftMoveDirection }
    >({
        projectUuid,
        request: ({ draftChangeUuid, direction }) => ({
            path: `/draft/changes/${draftChangeUuid}/move`,
            method: 'POST',
            body: JSON.stringify({ direction }),
        }),
        errorTitle: 'Could not move',
        changesLive: false,
    });

export const useUndoSemanticLayerChanges = (projectUuid: string) =>
    useWrite<{ exploreCount: number }, string[]>({
        projectUuid,
        request: (changeSetUuids) => ({
            path: '/undo',
            method: 'POST',
            body: JSON.stringify({ changeSetUuids }),
        }),
        errorTitle: 'Could not undo',
        changesLive: true,
    });
