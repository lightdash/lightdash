import {
    ExploreType,
    FilterOperator,
    getPreAggregateExploreName,
    type ExecuteAsyncQueryRequestParams,
    type Explore,
    type ParameterDefinitions,
} from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import {
    getQueryResultEntitlementFingerprint,
    getQueryResultRequestParameters,
    resolveResultEntitlementScope,
} from './queryResultLineage';

it('strips every server-owned result binding from client parameters', () => {
    const client = {
        sql: 'SELECT 1',
        queryUsage: { requestId: 'forged' },
        aiSignInCredentialUuid: 'forged',
        resultProducer: { version: 1 },
        resultArtifact: { artifactUuid: 'forged' },
        resultResearchRunUuid: 'forged',
        resultSource: { savedSqlUuid: 'forged' },
        resultEntitlementFingerprint: 'forged',
        resultEffectiveParameters: { p: 'forged' },
        cacheSourceQueryUuid: 'forged',
        externalSourceReferences: ['forged'],
    } as unknown as ExecuteAsyncQueryRequestParams;
    const parameters = getQueryResultRequestParameters(client, {
        resultEntitlementFingerprint: 'trusted',
        resultEffectiveParameters: { p: 'trusted' },
        cacheSourceQueryUuid: 'trusted',
    });
    expect(parameters).toEqual({
        sql: 'SELECT 1',
        queryUsage: undefined,
        aiSignInCredentialUuid: undefined,
        resultProducer: undefined,
        resultArtifact: undefined,
        resultResearchRunUuid: undefined,
        resultSource: undefined,
        resultEntitlementFingerprint: 'trusted',
        resultEffectiveParameters: { p: 'trusted' },
        cacheSourceQueryUuid: 'trusted',
        externalSourceReferences: undefined,
    });
    expect(client).toHaveProperty('resultResearchRunUuid', 'forged');
    expect(
        getQueryResultRequestParameters(client, {}).resultEffectiveParameters,
    ).toBeUndefined();
});

describe('round 23 conservative entitlement scope', () => {
    const controls = (region: string, unrelated = 'same') => ({
        userAttributes: { region: [region], unrelated: [unrelated] },
        intrinsicUserAttributes: {},
    });

    test('a missing resolved scope keeps all attributes and intrinsic values', () => {
        const explore = structuredClone(validExplore);
        const hash = (unrelated: string, email: string) =>
            getQueryResultEntitlementFingerprint({
                parameters: undefined,
                controls: {
                    ...controls('EU', unrelated),
                    intrinsicUserAttributes: { email },
                },
                explore,
                metricQuery: metricQueryMock,
            });
        expect(hash('before', 'person@example.test')).not.toBe(
            hash('after', 'person@example.test'),
        );
        expect(hash('before', 'person@example.test')).not.toBe(
            hash('before', 'changed@example.test'),
        );
    });

    test('follows source chains and external execution explores without looping', async () => {
        const source = structuredClone(validExplore);
        source.tables.b.sqlTable = 'source_${ld.attr.region}';
        const derived: Explore = {
            ...structuredClone(validExplore),
            name: 'derived',
            preAggregateSource: {
                sourceExploreName: source.name,
                preAggregateName: 'derived',
            },
        };
        const route: Explore = {
            ...structuredClone(validExplore),
            name: getPreAggregateExploreName(derived.name, 'rollup'),
            type: ExploreType.PRE_AGGREGATE,
            preAggregateSource: {
                sourceExploreName: derived.name,
                preAggregateName: 'rollup',
                externalTable: 'rollup_${ld.attr.tier}',
            },
        };
        derived.preAggregates = [
            {
                name: 'rollup',
                dimensions: ['a.dim1'],
                metrics: ['a.met1'],
                table: 'rollup',
            },
        ];
        const explores = {
            [source.name]: source,
            [derived.name]: derived,
            [route.name]: route,
        };
        const getExplore = vi.fn(async (name: string) => explores[name]);
        const scope = await resolveResultEntitlementScope({
            exploreName: derived.name,
            getExplore,
            getProjectParameterDefinitions: async () => ({}),
            parameterValues: {},
        });
        expect(scope?.explores.map(({ name }) => name).sort()).toEqual(
            Object.keys(explores).sort(),
        );
        expect(getExplore).toHaveBeenCalledTimes(3);
        const hash = (region: string, tier: string) =>
            getQueryResultEntitlementFingerprint({
                parameters: undefined,
                controls: {
                    ...controls(region),
                    userAttributes: {
                        ...controls(region).userAttributes,
                        tier: [tier],
                    },
                },
                explore: derived,
                metricQuery: metricQueryMock,
                scope,
            });
        expect(hash('EU', 'gold')).not.toBe(hash('US', 'gold'));
        expect(hash('EU', 'gold')).not.toBe(hash('EU', 'silver'));
    });

    test.each([
        'project default',
        'request value',
        'explore default',
        'unfiltered field',
        'required filter',
        'field access',
    ])('includes every attribute in %s', async (kind) => {
        const explore = structuredClone(validExplore);
        if (kind === 'explore default')
            explore.parameters = {
                region_param: {
                    label: 'Region',
                    type: 'string',
                    default: '${ld.attr.region}',
                },
            };
        if (kind === 'unfiltered field') {
            explore.unfilteredTables = structuredClone(explore.tables);
            explore.unfilteredTables.b.dimensions.dim1.sql =
                '${ld.attr.region}';
            delete explore.tables.b;
            explore.joinedTables = [];
        }
        if (kind === 'required filter')
            explore.tables.a.requiredFilters = [
                {
                    id: 'required',
                    target: { fieldRef: 'b.dim1' },
                    operator: FilterOperator.EQUALS,
                    values: ['${ld.attr.region}'],
                    required: true,
                },
            ];
        if (kind === 'field access')
            explore.tables.b.dimensions.dim1.anyAttributes = { region: 'EU' };
        const scope = await resolveResultEntitlementScope({
            exploreName: explore.name,
            getExplore: async () => explore,
            getProjectParameterDefinitions:
                async (): Promise<ParameterDefinitions> =>
                    kind === 'project default'
                        ? {
                              region_param: {
                                  label: 'Region',
                                  type: 'string',
                                  default: '${ld.attr.region}',
                              },
                          }
                        : {},
            parameterValues:
                kind === 'request value'
                    ? { region_param: '${ld.attr.region}' }
                    : {},
        });
        const hash = (region: string, unrelated = 'same') =>
            getQueryResultEntitlementFingerprint({
                parameters: undefined,
                controls: controls(region, unrelated),
                explore,
                metricQuery: metricQueryMock,
                scope,
            });
        expect(hash('EU')).not.toBe(hash('US'));
        expect(hash('EU', 'before')).toBe(hash('EU', 'after'));
    });

    test.each([
        'lookup error',
        'unknown source',
        'wrong explore',
        'parameter lookup error',
    ])('falls back to all attributes after %s', async (kind) => {
        const explore = structuredClone(validExplore);
        if (kind === 'unknown source')
            explore.preAggregateSource = {
                sourceExploreName: 'unknown',
                preAggregateName: 'rollup',
            };
        const scope = await resolveResultEntitlementScope({
            exploreName: explore.name,
            getExplore: async (name) => {
                if (kind === 'lookup error') throw new Error('Missing explore');
                if (name === 'unknown')
                    return { name, label: name, errors: [] };
                return kind === 'wrong explore'
                    ? { ...explore, name: 'other' }
                    : explore;
            },
            getProjectParameterDefinitions: async () => {
                if (kind === 'parameter lookup error')
                    throw new Error('Missing definitions');
                return {};
            },
            parameterValues: {},
        });
        expect(scope).toBeNull();
        const hash = (unrelated: string) =>
            getQueryResultEntitlementFingerprint({
                parameters: undefined,
                controls: controls('EU', unrelated),
                explore,
                metricQuery: metricQueryMock,
                scope,
            });
        expect(hash('before')).not.toBe(hash('after'));
    });

    test.each(['sql', 'derived'] as const)(
        'round 24 scopes %s results to their own request',
        (kind) => {
            const explore = structuredClone(validExplore);
            const scope = {
                explores: [explore],
                projectParameterDefinitions: {},
                parameterValues: {},
            };
            const parameters = (
                kind === 'sql'
                    ? { sql: 'SELECT 1' }
                    : {
                          sql: 'SELECT 1 FROM source',
                          references: { source: 'query' },
                      }
            ) as ExecuteAsyncQueryRequestParams;
            const hash = (value: string) =>
                getQueryResultEntitlementFingerprint({
                    parameters,
                    controls: controls('EU', value),
                    explore,
                    metricQuery: metricQueryMock,
                    scope,
                });
            expect(hash('before')).toBe(hash('after'));
        },
    );
});

describe('round 24 unresolved SQL scope', () => {
    test.each([
        undefined,
        { references: { source: 'query' } },
        { sql: 'SELECT ${lightdash.attributes.region' },
        { sql: 'SELECT ${lightdash.attributes.region-name}' },
        { sql: 'SELECT ${unknown.region}' },
        { sql: 'SELECT ${a.dim1}' },
        { sql: 'SELECT ${ld.parameters.missing}' },
        { sql: 'SELECT {% if ld.parameters.x %} 1 {% endif %}' },
        { sql: 'SELECT {{ unknown }}' },
        {
            sql: 'SELECT ${ld.parameters.x}',
            parameters: { x: '${ld.parameters.x}' },
        },
    ])('compares all attributes for %j', (parameters) => {
        const hash = (value: string) =>
            getQueryResultEntitlementFingerprint({
                parameters: parameters as
                    | ExecuteAsyncQueryRequestParams
                    | undefined,
                controls: {
                    userAttributes: { unrelated: [value] },
                    intrinsicUserAttributes: {},
                },
                explore: null,
                metricQuery: null,
            });
        expect(hash('before')).not.toBe(hash('after'));
    });
});

describe('round 25 semantic unresolved references', () => {
    test.each(['cycle', 'missing parameter', 'missing field'] as const)(
        'falls back for %s',
        (kind) => {
            const explore = structuredClone(validExplore);
            const parameterValues = {
                x: '${ld.parameters.y}',
                y: '${ld.parameters.x}',
            };
            if (kind === 'cycle')
                explore.parameters = {
                    x: {
                        type: 'string',
                        label: 'X',
                        default: parameterValues.x,
                    },
                    y: {
                        type: 'string',
                        label: 'Y',
                        default: parameterValues.y,
                    },
                };
            if (kind === 'missing parameter')
                explore.tables.a.dimensions.dim1.sql =
                    '${ld.parameters.missing}';
            if (kind === 'missing field')
                explore.tables.a.dimensions.dim1.sql = '${a.nonexistent}';
            const hash = (unrelated: string) =>
                getQueryResultEntitlementFingerprint({
                    parameters: undefined,
                    controls: {
                        userAttributes: { unrelated: [unrelated] },
                        intrinsicUserAttributes: {},
                    },
                    explore,
                    metricQuery: metricQueryMock,
                    scope: {
                        explores: [explore],
                        projectParameterDefinitions: {},
                        parameterValues:
                            kind === 'cycle' ? parameterValues : {},
                    },
                });
            expect(hash('before')).not.toBe(hash('after'));
        },
    );
});

test('round 25 seeds recursive scope with the compilation snapshots', async () => {
    const source = structuredClone(validExplore);
    source.tables.a.sqlWhere = '${ld.attr.region}';
    const current = structuredClone(validExplore);
    const getExplore = vi.fn(async () => current);
    const scope = await resolveResultEntitlementScope({
        exploreName: source.name,
        initialExplores: [source],
        executionExplores: [source],
        getExplore,
        getProjectParameterDefinitions: async () => ({}),
        parameterValues: {},
    });
    expect(scope?.explores).toEqual([source]);
    expect(getExplore).not.toHaveBeenCalled();
    const hash = (unrelated: string) =>
        getQueryResultEntitlementFingerprint({
            parameters: undefined,
            controls: {
                userAttributes: { region: ['EU'], unrelated: [unrelated] },
                intrinsicUserAttributes: {},
            },
            explore: source,
            metricQuery: metricQueryMock,
            scope,
        });
    expect(hash('before')).toBe(hash('after'));
});
