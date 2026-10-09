import {
    type AgentIdentityClaim,
    type ExecuteAsyncQueryRequestParams,
    type QueryHistory,
} from '@lightdash/common';

export function getQuerySourceParameters(
    parameters: ExecuteAsyncQueryRequestParams | undefined,
): { chartUuid?: string; references?: Record<string, string> } {
    if (!parameters) {
        return {};
    }
    if ('chartUuid' in parameters) {
        return { chartUuid: parameters.chartUuid };
    }
    if ('underlyingDataSourceQueryUuid' in parameters) {
        return {
            references: {
                source: parameters.underlyingDataSourceQueryUuid,
            },
        };
    }
    if ('references' in parameters) {
        return { references: parameters.references };
    }
    if ('mergeQuery' in parameters) {
        return {
            references: Object.fromEntries(
                parameters.mergeQuery.sources.flatMap((source) =>
                    'queryUuid' in source
                        ? [[source.id, source.queryUuid]]
                        : [],
                ),
            ),
        };
    }
    return {};
}

export const getQueryIdentityLineage = (
    queries: QueryHistory[],
): { queryUuid: string; agentIdentity: AgentIdentityClaim | null }[] =>
    queries.map(({ queryUuid, agentIdentity }) => ({
        queryUuid,
        agentIdentity: agentIdentity ?? null,
    }));
