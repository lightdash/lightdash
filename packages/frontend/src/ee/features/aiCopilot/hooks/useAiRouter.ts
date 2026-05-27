import { type AiRouter, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
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
