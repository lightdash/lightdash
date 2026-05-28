import {
    type AiRouter,
    type AiRouterDecisionCommitRequest,
    type AiRouterRouteRequest,
    type AiRouterRouteResponseResult,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

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
        retry: false,
    });

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
