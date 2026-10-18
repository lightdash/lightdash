import {
    isApiError,
    type ApiAgentSuggestionsResponse,
    type AgentSuggestionsSource,
} from '@lightdash/common';

export type AgentSuggestionsSurface =
    | 'home'
    | 'ask'
    | 'followup'
    | 'chart'
    | 'dashboard';
export type AgentSuggestionsDisplayedProperties = {
    projectId: string;
    agentId: string;
    client: 'web';
    appVersion: string;
    surface: AgentSuggestionsSurface;
    outcome: 'shown' | 'defaults' | 'empty' | 'error' | 'timeout';
    source: AgentSuggestionsSource | 'none';
    httpStatus: number | null;
    durationMs: number;
    attempt: number;
    chipCount: number;
};

type SuggestionResult =
    | { result: ApiAgentSuggestionsResponse['results']; error?: never }
    | { result?: never; error: unknown };

export function buildAgentSuggestionsDisplayedProperties({
    projectId,
    agentId,
    appVersion,
    surface,
    durationMs,
    attempt,
    ...completion
}: {
    projectId: string;
    agentId: string;
    appVersion: string;
    surface: AgentSuggestionsSurface;
    durationMs: number;
    attempt: number;
} & SuggestionResult): AgentSuggestionsDisplayedProperties {
    const common = {
        projectId,
        agentId,
        client: 'web' as const,
        appVersion,
        surface,
        durationMs,
        attempt,
    };
    if (completion.result) {
        const { chips, source } = completion.result;
        return {
            ...common,
            outcome:
                chips.length === 0
                    ? 'empty'
                    : source === 'default'
                      ? 'defaults'
                      : 'shown',
            source,
            chipCount: chips.length,
            httpStatus: 200,
        };
    }
    const { error } = completion;
    const httpStatus = isApiError(error) ? error.error.statusCode : null;
    const name = isApiError(error)
        ? error.error.name
        : error instanceof Error
          ? error.name
          : null;
    const timeout =
        httpStatus === 408 ||
        httpStatus === 504 ||
        name === 'TimeoutError' ||
        name === 'AbortError';
    return {
        ...common,
        outcome: timeout ? 'timeout' : 'error',
        source: 'none',
        chipCount: 0,
        httpStatus,
    };
}
