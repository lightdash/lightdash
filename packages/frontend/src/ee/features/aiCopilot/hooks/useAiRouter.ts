import {
    isApiError,
    type AiRouter,
    type AiRouterDecisionCommitRequest,
    type AiRouterInstruction,
    type AiRouterRouteRequest,
    type AiRouterRouteResponseResult,
    type ApiError,
    type UpsertAiRouterInstructionRequest,
    type UpsertAiRouterRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';

const ROUTER_BASE = '/org/aiRouter';

const getAiRouterConfig = async (
    lightdashApi: LightdashApi,
): Promise<AiRouter | null> => {
    try {
        return await lightdashApi<AiRouter>({
            url: ROUTER_BASE,
            method: 'GET',
            body: undefined,
        });
    } catch (error) {
        // Missing configuration is the endpoint's documented first-use state.
        if (isApiError(error) && error.error.statusCode === 404) return null;
        throw error;
    }
};

export const useAiRouterConfig = () => {
    const lightdashApi = useLightdashApi();

    const isEmbed = useIsEmbedded();
    return useQuery<AiRouter | null, ApiError>({
        queryKey: ['ai-router'],
        queryFn: () => getAiRouterConfig(lightdashApi),
        enabled: !isEmbed,
        retry: false,
    });
};

const upsertAiRouterConfig = (
    lightdashApi: LightdashApi,
    body: UpsertAiRouterRequest,
) =>
    lightdashApi<AiRouter>({
        url: ROUTER_BASE,
        method: 'PUT',
        body: JSON.stringify(body),
    });

export const useUpsertAiRouterConfig = () => {
    const lightdashApi = useLightdashApi();

    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<AiRouter, ApiError, UpsertAiRouterRequest>({
        mutationFn: (body: UpsertAiRouterRequest) =>
            upsertAiRouterConfig(lightdashApi, body),
        onSuccess: (data) => {
            queryClient.setQueryData(['ai-router'], data);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update AI router configuration',
                apiError: error,
            }),
    });
};

const routePrompt = (lightdashApi: LightdashApi, body: AiRouterRouteRequest) =>
    lightdashApi<AiRouterRouteResponseResult>({
        url: `${ROUTER_BASE}/route`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useAiRouterRoute = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        AiRouterRouteResponseResult,
        ApiError,
        AiRouterRouteRequest
    >({
        mutationFn: (body: AiRouterRouteRequest) =>
            routePrompt(lightdashApi, body),
    });
};

const commitDecision = (
    lightdashApi: LightdashApi,
    {
        decisionUuid,
        ...body
    }: { decisionUuid: string } & AiRouterDecisionCommitRequest,
) =>
    lightdashApi<undefined>({
        url: `${ROUTER_BASE}/decisions/${decisionUuid}/commit`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useAiRouterCommit = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        undefined,
        ApiError,
        { decisionUuid: string } & AiRouterDecisionCommitRequest
    >({
        mutationFn: (
            args: { decisionUuid: string } & AiRouterDecisionCommitRequest,
        ) => commitDecision(lightdashApi, args),
    });
};

const instructionQueryKey = (projectUuid: string) => [
    'ai-router-instruction',
    projectUuid,
];

const getAiRouterInstruction = (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<AiRouterInstruction | null>({
        url: `${ROUTER_BASE}/instructions/${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useAiRouterInstruction = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AiRouterInstruction | null, ApiError>({
        queryKey: instructionQueryKey(projectUuid ?? ''),
        queryFn: () => getAiRouterInstruction(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });
};

const upsertAiRouterInstruction = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: UpsertAiRouterInstructionRequest,
) =>
    lightdashApi<AiRouterInstruction>({
        url: `${ROUTER_BASE}/instructions/${projectUuid}`,
        method: 'PUT',
        body: JSON.stringify(body),
    });

export const useUpsertAiRouterInstruction = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();

    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiRouterInstruction,
        ApiError,
        UpsertAiRouterInstructionRequest
    >({
        mutationFn: (body) =>
            upsertAiRouterInstruction(lightdashApi, projectUuid, body),
        onSuccess: (data) => {
            queryClient.setQueryData(instructionQueryKey(projectUuid), data);
            showToastSuccess({ title: 'Routing instructions saved' });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to save routing instructions',
                apiError: error,
            }),
    });
};
