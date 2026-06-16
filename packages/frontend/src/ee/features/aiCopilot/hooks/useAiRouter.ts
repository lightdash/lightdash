import {
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
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { isEmbedAiAgentRoute } from './aiAgentRouting';

const ROUTER_BASE = '/org/aiRouter';

const getAiRouterConfig = () =>
    lightdashApi<AiRouter>({
        url: ROUTER_BASE,
        method: 'GET',
        body: undefined,
    });

// Returns the org's router configuration. 404 (no config yet) and other
// failures resolve to `isError`; callers treat that as "router disabled".
export const useAiRouterConfig = () =>
    useQuery<AiRouter, ApiError>({
        queryKey: ['ai-router'],
        queryFn: getAiRouterConfig,
        enabled: !isEmbedAiAgentRoute(),
        retry: false,
    });

const upsertAiRouterConfig = (body: UpsertAiRouterRequest) =>
    lightdashApi<AiRouter>({
        url: ROUTER_BASE,
        method: 'PUT',
        body: JSON.stringify(body),
    });

export const useUpsertAiRouterConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<AiRouter, ApiError, UpsertAiRouterRequest>({
        mutationFn: upsertAiRouterConfig,
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

const routePrompt = (body: AiRouterRouteRequest) =>
    lightdashApi<AiRouterRouteResponseResult>({
        url: `${ROUTER_BASE}/route`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useAiRouterRoute = () =>
    useMutation<AiRouterRouteResponseResult, ApiError, AiRouterRouteRequest>({
        mutationFn: routePrompt,
    });

const commitDecision = ({
    decisionUuid,
    ...body
}: { decisionUuid: string } & AiRouterDecisionCommitRequest) =>
    lightdashApi<undefined>({
        url: `${ROUTER_BASE}/decisions/${decisionUuid}/commit`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useAiRouterCommit = () =>
    useMutation<
        undefined,
        ApiError,
        { decisionUuid: string } & AiRouterDecisionCommitRequest
    >({
        mutationFn: commitDecision,
    });

const instructionQueryKey = (projectUuid: string) => [
    'ai-router-instruction',
    projectUuid,
];

const getAiRouterInstruction = (projectUuid: string) =>
    lightdashApi<AiRouterInstruction | null>({
        url: `${ROUTER_BASE}/instructions/${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useAiRouterInstruction = (projectUuid: string | undefined) =>
    useQuery<AiRouterInstruction | null, ApiError>({
        queryKey: instructionQueryKey(projectUuid ?? ''),
        queryFn: () => getAiRouterInstruction(projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });

const upsertAiRouterInstruction = (
    projectUuid: string,
    body: UpsertAiRouterInstructionRequest,
) =>
    lightdashApi<AiRouterInstruction>({
        url: `${ROUTER_BASE}/instructions/${projectUuid}`,
        method: 'PUT',
        body: JSON.stringify(body),
    });

export const useUpsertAiRouterInstruction = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiRouterInstruction,
        ApiError,
        UpsertAiRouterInstructionRequest
    >({
        mutationFn: (body) => upsertAiRouterInstruction(projectUuid, body),
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
