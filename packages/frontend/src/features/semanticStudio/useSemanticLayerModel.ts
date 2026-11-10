import {
    FeatureFlags,
    type ApiError,
    type ApiResponse,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
    type SemanticLayerDraftImpact,
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
    });
};

/** Whether this person can change this project's models from the server. */
export const useCanEditSemanticLayer = (projectUuid: string): boolean =>
    useGet<SemanticLayerStatus>(
        ['semantic-layer-status', projectUuid],
        projectUuid,
        '/status',
        true,
    ).data?.enabled === true;

/** A model's YAML and history; null when the project keeps no such model or this person cannot change it. */
export const useSemanticLayerModel = (projectUuid: string, modelName: string) =>
    useGet<SemanticLayerModelCode | null>(
        [MODEL_KEY, projectUuid, modelName],
        projectUuid,
        `/models/${encodeURIComponent(modelName)}`,
        modelName !== '',
    );

/** This person's draft, replayed on what is live; empty for someone who cannot change the project. */
export const useSemanticLayerDraft = (projectUuid: string) =>
    useGet<SemanticLayerDraft>(
        [DRAFT_KEY, projectUuid],
        projectUuid,
        '/draft',
        true,
    );

/** Saved charts and dashboards the draft, or one model of it, would break. */
export const useSemanticLayerDraftImpact = (
    projectUuid: string,
    model: string | null,
) =>
    useGet<SemanticLayerDraftImpact>(
        [DRAFT_KEY, projectUuid, 'impact', model],
        projectUuid,
        `/draft/impact${model === null ? '' : `?model=${encodeURIComponent(model)}`}`,
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
                    ...(changesLive
                        ? [[MODEL_KEY, projectUuid], ['tables']]
                        : []),
                ].map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey }),
                ),
            ),
        onError: ({ error }) => {
            showToastApiError({ title: errorTitle, apiError: error });
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
