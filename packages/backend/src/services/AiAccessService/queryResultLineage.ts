import {
    assertUnreachable,
    getPreAggregateExploreName,
    isExploreError,
    type AgentIdentityClaim,
    type ExecuteAsyncQueryRequestParams,
    type Explore,
    type ExploreError,
    type MetricQuery,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type QueryHistory,
    type UserAccessControls,
} from '@lightdash/common';
import {
    getResultEntitlementFingerprint,
    getSqlResultEntitlementFingerprint,
    type ResultEntitlementScope,
} from '../../utils/queryResultProducer';

export type QueryResultNodeKind = 'semantic' | 'sql' | 'derived';

export const getQueryResultNodeKind = (
    parameters: QueryHistory['requestParameters'] | undefined,
): QueryResultNodeKind => {
    if (
        parameters?.resultProducer?.credentialOwner.kind === 'derived' ||
        (parameters &&
            ('mergeQuery' in parameters || 'references' in parameters))
    )
        return 'derived';
    if (
        parameters &&
        ('sql' in parameters ||
            'savedSqlUuid' in parameters ||
            'slug' in parameters ||
            parameters.resultSource)
    )
        return 'sql';
    return 'semantic';
};

export type TrustedQueryResultParameters = Pick<
    QueryHistory['requestParameters'],
    | 'resultSource'
    | 'resultEntitlementFingerprint'
    | 'resultEffectiveParameters'
    | 'cacheSourceQueryUuid'
    | 'externalSourceReferences'
>;

export const getQueryResultRequestParameters = (
    parameters: ExecuteAsyncQueryRequestParams,
    trusted: TrustedQueryResultParameters,
): QueryHistory['requestParameters'] => ({
    ...parameters,
    queryUsage: undefined,
    aiSignInCredentialUuid: undefined,
    resultProducer: undefined,
    resultArtifact: undefined,
    resultResearchRunUuid: undefined,
    resultSource: undefined,
    resultEntitlementFingerprint: undefined,
    resultEffectiveParameters: undefined,
    cacheSourceQueryUuid: undefined,
    externalSourceReferences: undefined,
    ...trusted,
});

export const getQueryResultEntitlementFingerprint = ({
    parameters,
    controls,
    explore,
    metricQuery,
    scope,
}: {
    parameters: QueryHistory['requestParameters'] | undefined;
    controls: UserAccessControls;
    explore: Explore | null;
    metricQuery: MetricQuery | null;
    scope?: ResultEntitlementScope | null;
}): string => {
    const kind = getQueryResultNodeKind(parameters);
    switch (kind) {
        case 'derived':
        case 'sql':
            return getSqlResultEntitlementFingerprint(controls, parameters);
        case 'semantic':
            return getResultEntitlementFingerprint(
                controls,
                explore,
                metricQuery,
                scope ?? null,
            );
        default:
            return assertUnreachable(kind, 'Unknown result node kind');
    }
};

export const resolveResultEntitlementScope = async ({
    exploreName,
    getExplore,
    getProjectParameterDefinitions,
    parameterValues,
    initialExplores = [],
    executionExplores,
}: {
    initialExplores?: Explore[];
    executionExplores?: Explore[];
    exploreName: string;
    getExplore: (name: string) => Promise<Explore | ExploreError>;
    getProjectParameterDefinitions: () => Promise<ParameterDefinitions>;
    parameterValues: ParametersValuesMap;
}): Promise<ResultEntitlementScope | null> => {
    try {
        const explores = new Map<string, Explore>();
        const collect = async (names: string[]): Promise<void> => {
            const pending = [...new Set(names)].filter(
                (name) => !explores.has(name),
            );
            if (pending.length === 0) return;
            const resolved = await Promise.all(
                pending.map(async (name) => {
                    const explore =
                        initialExplores.find(
                            (snapshot) => snapshot.name === name,
                        ) ?? (await getExplore(name));
                    if (isExploreError(explore) || explore.name !== name)
                        throw new Error(
                            'Cannot resolve result entitlement explore',
                        );
                    return explore;
                }),
            );
            resolved.forEach((explore) => explores.set(explore.name, explore));
            await collect(
                resolved.flatMap((explore) => [
                    ...(explore.preAggregateSource
                        ? [explore.preAggregateSource.sourceExploreName]
                        : []),
                    ...(explore.preAggregates ?? []).map((definition) =>
                        getPreAggregateExploreName(
                            explore.name,
                            definition.name,
                        ),
                    ),
                ]),
            );
        };
        const [, projectParameterDefinitions] = await Promise.all([
            collect([exploreName]),
            getProjectParameterDefinitions(),
        ]);
        return {
            explores: [...explores.values()],
            projectParameterDefinitions,
            parameterValues,
            executionExplores,
        };
    } catch {
        return null;
    }
};

export function getQuerySourceParameters(
    parameters:
        | (ExecuteAsyncQueryRequestParams & { cacheSourceQueryUuid?: string })
        | undefined,
    includeCacheSource = false,
): { chartUuid?: string; references?: Record<string, string> } {
    if (!parameters) {
        return {};
    }
    const cacheSource = parameters.cacheSourceQueryUuid;
    if (includeCacheSource && cacheSource) {
        const { cacheSourceQueryUuid, ...source } = parameters;
        const resolved = getQuerySourceParameters(source, true);
        return {
            ...resolved,
            references: {
                ...resolved.references,
                cacheSource: cacheSourceQueryUuid!,
            },
        };
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
