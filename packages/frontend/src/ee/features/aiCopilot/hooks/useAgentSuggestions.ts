import {
    LightdashClientHeader,
    type ApiAgentSuggestionsResponse,
    type ApiError,
} from '@lightdash/common';
import { addBreadcrumb, captureMessage } from '@sentry/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import {
    buildAgentSuggestionsDisplayedProperties,
    type AgentSuggestionsSurface,
    type AgentSuggestionsDisplayedProperties,
} from './agentSuggestionsTelemetry';
import { getAiAgentApiBase } from './aiAgentRouting';

export type { AgentSuggestionsSurface } from './agentSuggestionsTelemetry';

const AGENT_SUGGESTIONS_KEY = 'agentSuggestions';

const getAgentSuggestions = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    agentUuid: string,
    enableSqlMode: boolean,
    threadUuid?: string,
    afterMessageUuid?: string,
) => {
    const search = new URLSearchParams();
    if (enableSqlMode) search.set('enableSqlMode', 'true');
    if (threadUuid) search.set('threadUuid', threadUuid);
    if (afterMessageUuid) search.set('afterMessageUuid', afterMessageUuid);
    const qs = search.toString();
    return lightdashApi<ApiAgentSuggestionsResponse['results']>({
        version: 'v1',
        url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/suggestions${
            qs ? `?${qs}` : ''
        }`,
        method: 'GET',
        headers: { [LightdashClientHeader]: `web/${__APP_VERSION__}` },
        body: undefined,
    });
};

export const useAgentSuggestions = ({
    projectUuid,
    agentUuid,
    enableSqlMode,
    threadUuid,
    afterMessageUuid,
    enabled,
    surface,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    enableSqlMode: boolean;
    threadUuid?: string;
    afterMessageUuid?: string;
    enabled: boolean;
    surface: AgentSuggestionsSurface;
}) => {
    const lightdashApi = useLightdashApi();
    const { track } = useTracking();
    const trackRef = useRef(track);
    useEffect(() => {
        trackRef.current = track;
    }, [track]);
    const record = (properties: AgentSuggestionsDisplayedProperties) => {
        trackRef.current({
            name: EventName.AI_AGENT_SUGGESTIONS_DISPLAYED,
            properties,
        });
        const { outcome, source, httpStatus, attempt } = properties;
        const failed = outcome === 'error' || outcome === 'timeout';
        addBreadcrumb({
            category: 'ai_agent.suggestions',
            level: failed ? 'warning' : 'info',
            message: 'suggestions.outcome',
            data: {
                'suggestions.outcome': outcome,
                surface,
                source,
                httpStatus,
                attempt,
            },
        });
        if (failed)
            captureMessage('AI agent suggestions hidden', {
                level: 'warning',
                tags: {
                    'suggestions.outcome': outcome,
                    surface,
                    client: 'web',
                },
            });
    };
    return useQuery<ApiAgentSuggestionsResponse['results'], ApiError>({
        queryKey: [
            AGENT_SUGGESTIONS_KEY,
            projectUuid,
            agentUuid,
            enableSqlMode,
            threadUuid ?? null,
            afterMessageUuid ?? null,
        ],
        queryFn: async () => {
            const startedAt = Date.now();
            const common = {
                projectId: projectUuid!,
                agentId: agentUuid!,
                appVersion: __APP_VERSION__,
                surface,
            };
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                let result: ApiAgentSuggestionsResponse['results'];
                try {
                    result = await getAgentSuggestions(
                        lightdashApi,
                        projectUuid!,
                        agentUuid!,
                        enableSqlMode,
                        threadUuid,
                        afterMessageUuid,
                    );
                } catch (error) {
                    if (attempt < 2) {
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, 1000);
                        });
                        continue;
                    }
                    record(
                        buildAgentSuggestionsDisplayedProperties({
                            ...common,
                            error,
                            durationMs: Date.now() - startedAt,
                            attempt,
                        }),
                    );
                    throw error;
                }
                record(
                    buildAgentSuggestionsDisplayedProperties({
                        ...common,
                        result,
                        durationMs: Date.now() - startedAt,
                        attempt,
                    }),
                );
                return result;
            }
            throw new Error('Suggestion attempts exhausted');
        },
        enabled: enabled && !!projectUuid && !!agentUuid,
        staleTime: Infinity,
        cacheTime: 1000 * 60 * 60,
        retry: false,
    });
};
