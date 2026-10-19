import {
    DimensionType,
    FilterOperator,
    getTotalFilterRules,
    FieldType,
    MergeJoinType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    buildSavedMergeDefinition,
    isMergeMetricSource,
    type Explore,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';
import { emptyMergeSource, PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource, type MergeJoinPart } from '../context/context';
import { parseMergeState, serializeMergeState } from '../context/mergeUrlState';
import { restoreSavedMerge } from '../context/restoreSavedMerge';
import { getMergeSetup } from './getMergeSetup';
import { getMergeSourceNames } from './getMergeSourceNames';

const explore = (name: string, grain = TimeFrames.WEEK): Explore => ({
    name,
    label: name,
    baseTable: name,
    joinedTables: [],
    tags: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        [name]: {
            name,
            label: name,
            database: '',
            schema: '',
            sqlTable: name,
            lineageGraph: {},
            dimensions: Object.fromEntries(
                ['date', 'team', 'detail'].map((field) => [
                    `${name}_${field}`,
                    {
                        fieldType: FieldType.DIMENSION,
                        type:
                            field === 'date'
                                ? DimensionType.DATE
                                : DimensionType.STRING,
                        name: field,
                        label: field,
                        table: name,
                        tableLabel: name,
                        sql: '',
                        hidden: false,
                        compiledSql: '',
                        tablesReferences: [name],
                        ...(field === 'date' ? { timeInterval: grain } : {}),
                    },
                ]),
            ),
            metrics: {
                [`${name}_count`]: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'count',
                    label: 'Count',
                    table: name,
                    tableLabel: name,
                    sql: '',
                    hidden: false,
                    compiledSql: '',
                    tablesReferences: [name],
                },
            },
        },
    },
});
const required = <T>(value: T | null): T => {
    if (value === null) throw new Error('Expected a value');
    return value;
};
const fixture = (count = 3) => {
    const names = Array.from(
        { length: count },
        (_, index) => `domain_${index}`,
    );
    const metricQuery: MetricQuery = {
        exploreName: names[0],
        dimensions: ['domain_0_date', 'domain_0_team'],
        metrics: ['domain_0_count'],
        filters: {},
        sorts: [],
        tableCalculations: [],
        limit: 500,
    };
    const additionalSources: MergeEditorSource[] = names
        .slice(1)
        .map((name, index) => ({
            ...emptyMergeSource(index === 0 ? 'b' : `source_${index + 1}`),
            exploreName: name,
            dimensions: [`${name}_date`, `${name}_team`],
            metrics: [`${name}_count`],
        }));
    const handles = [
        PRIMARY_SOURCE_ID,
        ...additionalSources.map((source) => source.id),
    ];
    return {
        tableName: names[0],
        metricQuery,
        primaryExplore: explore(names[0]),
        additionalExplores: names.slice(1).map((name) => explore(name)),
        additionalSources,
        joinParts: ['date', 'team'].map((field) => ({
            fieldIdBySourceId: Object.fromEntries(
                handles.map((id, index) => [id, `${names[index]}_${field}`]),
            ),
        })),
        joinType: MergeJoinType.FULL,
        repeatValuesSourceIds: [] as string[],
        sourceNames: getMergeSourceNames({
            tableName: names[0],
            primarySourceName: null,
            additionalSources,
        }),
    };
};

describe('multi-source merge setup', () => {
    it.each([3, 7])(
        'builds and restores a %i-source scorecard at week and team grain',
        (count) => {
            const input = fixture(count);
            const setup = getMergeSetup(input);
            expect(setup.canRun).toBe(true);
            expect(setup.mergeQuery?.sources).toHaveLength(count);
            expect(setup.mergeQuery?.joinKey).toHaveLength(2);
            const saved = buildSavedMergeDefinition({
                mergeQuery: required(setup.mergeQuery),
                chartSourceId: input.tableName,
            });
            const restored = required(restoreSavedMerge(saved));
            expect(restored.additionalSources).toHaveLength(count - 1);
            expect(parseMergeState(serializeMergeState(restored))).toEqual(
                restored,
            );
            expect(
                getMergeSetup({
                    ...input,
                    ...restored,
                    sourceNames: getMergeSourceNames({
                        tableName: input.tableName,
                        ...restored,
                    }),
                }).mergeQuery,
            ).toEqual(setup.mergeQuery);
        },
    );

    it('blocks an incomplete third source even when the first pair is ready', () => {
        const input = fixture();
        input.additionalSources[1].metrics = [];
        expect(getMergeSetup(input)).toMatchObject({
            canRun: false,
            setupStep: 'Add at least one metric from domain_2',
        });
        input.additionalSources[1].metrics = ['domain_2_count'];
        input.joinParts[1].fieldIdBySourceId.source_2 = '';
        expect(getMergeSetup(input).canRun).toBe(false);
    });

    it('validates the third source date grain', () => {
        const input = fixture();
        input.additionalExplores[1] = explore('domain_2', TimeFrames.MONTH);
        const setup = getMergeSetup(input);
        expect(setup.canRun).toBe(false);
        expect(setup.joinKeyErrors).not.toHaveLength(0);
    });

    it('requires every other source to opt into repetition at a finer grain', () => {
        const input = fixture();
        input.additionalSources[1].dimensions.push('domain_2_detail');
        expect(getMergeSetup(input).fanOut).toEqual([
            { sourceId: 'source_2', fields: ['domain_2_detail'] },
        ]);
        input.repeatValuesSourceIds = ['a'];
        expect(getMergeSetup(input).canRun).toBe(false);
        input.repeatValuesSourceIds = ['a', 'b'];
        expect(getMergeSetup(input).canRun).toBe(true);
        input.additionalSources[0].dimensions.push('domain_1_detail');
        expect(getMergeSetup(input).canRun).toBe(false);
    });

    it('keeps saved calculations over every source when reopening and saving', () => {
        const input = fixture();
        const tableCalculations = [
            {
                name: 'combined',
                displayName: 'Combined',
                sql: '${domain_0.domain_0_count} + ${domain_1.domain_1_count} + ${domain_2.domain_2_count}',
            },
        ];
        const setup = getMergeSetup({ ...input, tableCalculations });
        const saved = buildSavedMergeDefinition({
            mergeQuery: required(setup.mergeQuery),
            chartSourceId: input.tableName,
        });
        const restored = required(
            parseMergeState(
                serializeMergeState(required(restoreSavedMerge(saved))),
            ),
        );
        expect(
            getMergeSetup({ ...input, ...restored }).mergeQuery
                ?.tableCalculations,
        ).toEqual(tableCalculations);
    });

    it('labels repeated explores by their source names everywhere', () => {
        const input = fixture();
        input.additionalSources[1] = {
            ...input.additionalSources[1],
            exploreName: 'domain_1',
            dimensions: ['domain_1_date', 'domain_1_team'],
            metrics: ['domain_1_count'],
        };
        input.additionalExplores[1] = explore('domain_1');
        input.joinParts.forEach((part) => {
            part.fieldIdBySourceId.source_2 = part.fieldIdBySourceId.b;
        });
        input.sourceNames = getMergeSourceNames({
            tableName: input.tableName,
            primarySourceName: null,
            additionalSources: input.additionalSources,
        });
        const setup = getMergeSetup(input);
        expect(setup.sourceLabels).toEqual([
            'domain_0',
            'domain_1 · domain_1',
            'domain_1 · domain_1_2',
        ]);
        expect(setup.sourceSetups.map(({ label }) => label)).toEqual(
            setup.sourceLabels.slice(1),
        );
        expect(setup.keySummary).toBe('date + team');
        expect(setup.joinTypeLabel).toBe('All rows');
    });

    it('reserves saved source names before naming new sources', () => {
        const additionalSources = [
            { ...emptyMergeSource('b'), exploreName: 'payments' },
            {
                ...emptyMergeSource('source_2'),
                exploreName: 'payments',
                name: 'payments',
            },
        ];
        expect(
            getMergeSourceNames({
                tableName: 'orders',
                primarySourceName: null,
                additionalSources,
            }).nameByHandle,
        ).toEqual({ a: 'orders', b: 'payments_2', source_2: 'payments' });
    });
});

describe('join field suggestion per source', () => {
    const unmapped = (
        input: ReturnType<typeof fixture>,
        partIndex: number,
    ): Parameters<typeof getMergeSetup>[0] => ({
        ...input,
        joinParts: input.joinParts.map((part, index) =>
            index === partIndex
                ? {
                      ...part,
                      fieldIdBySourceId: {
                          ...part.fieldIdBySourceId,
                          b: null,
                      },
                  }
                : part,
        ),
    });

    it('suggests the top-ranked field when several match', () => {
        const base = fixture(3);
        const [paymentsExplore, ...rest] = base.additionalExplores;
        const table = paymentsExplore.tables.domain_1;
        const withAlias: Explore = {
            ...paymentsExplore,
            tables: {
                domain_1: {
                    ...table,
                    dimensions: {
                        ...table.dimensions,
                        domain_1_team_alias: {
                            ...table.dimensions.domain_1_team,
                            name: 'team_alias',
                        },
                    },
                },
            },
        };
        const setup = getMergeSetup({
            ...unmapped(base, 1),
            additionalExplores: [withAlias, ...rest],
        });
        expect(setup.sourceSetups[0].suggestedJoinFields).toEqual([
            null,
            { fieldId: 'domain_1_team', label: 'team' },
        ]);
    });

    it("prefers the explore's own field over an equally ranked joined one", () => {
        const base = fixture(3);
        const [paymentsExplore, ...rest] = base.additionalExplores;
        const table = paymentsExplore.tables.domain_1;
        const withJoined: Explore = {
            ...paymentsExplore,
            tables: {
                teams: {
                    ...table,
                    name: 'teams',
                    dimensions: {
                        teams_team: {
                            ...table.dimensions.domain_1_team,
                            table: 'teams',
                            tableLabel: 'Teams',
                        },
                    },
                    metrics: {},
                },
                domain_1: table,
            },
        };
        const setup = getMergeSetup({
            ...unmapped(base, 1),
            additionalExplores: [withJoined, ...rest],
        });
        expect(setup.sourceSetups[0].suggestedJoinFields[1]).toEqual({
            fieldId: 'domain_1_team',
            label: 'team',
        });
    });

    it("names a joined table's field with its table", () => {
        const base = fixture(3);
        const [paymentsExplore, ...rest] = base.additionalExplores;
        const table = paymentsExplore.tables.domain_1;
        const joined: Explore = {
            ...paymentsExplore,
            tables: {
                domain_1: {
                    ...table,
                    dimensions: {
                        ...table.dimensions,
                        domain_1_team: {
                            ...table.dimensions.domain_1_team,
                            table: 'teams',
                            tableLabel: 'Teams',
                        },
                    },
                },
            },
        };
        const setup = getMergeSetup({
            ...unmapped(base, 1),
            additionalExplores: [joined, ...rest],
        });
        expect(setup.sourceSetups[0].suggestedJoinFields[1]).toEqual({
            fieldId: 'teams_team',
            label: 'Teams team',
        });
    });

    it('suggests nothing when the only candidate is already filled in', () => {
        const setup = getMergeSetup(unmapped(fixture(3), 0));
        expect(setup.effectiveParts[0].fieldIdBySourceId.b).toBe(
            'domain_1_date',
        );
        expect(setup.sourceSetups[0].suggestedJoinFields).toEqual([null, null]);
    });

    it('suggests nothing for sources already mapped', () => {
        const setup = getMergeSetup(fixture(3));
        expect(
            setup.sourceSetups.map((source) => source.suggestedJoinFields),
        ).toEqual([
            [null, null],
            [null, null],
        ]);
    });

    describe('shared join-key filters', () => {
        const dateFilter = (fieldId: string): Filters => ({
            dimensions: {
                id: 'root',
                and: [
                    {
                        id: 'shared',
                        target: { fieldId },
                        operator: FilterOperator.IN_BETWEEN,
                        values: ['2025-01-01', '2025-02-28'],
                    },
                ],
            },
        });
        const filteredFields = (
            setup: ReturnType<typeof getMergeSetup>,
            index: number,
        ) =>
            required(setup.mergeQuery)
                .sources.filter(isMergeMetricSource)
                .map((source) =>
                    getTotalFilterRules(source.metricQuery.filters).map(
                        (rule) => rule.target.fieldId,
                    ),
                )[index];
        const dateKeyed = () => {
            const input = fixture(3);
            input.metricQuery.filters = dateFilter('domain_0_date');
            input.additionalSources[0].filters = dateFilter('domain_1_date');
            input.joinParts = [input.joinParts[0]];
            input.repeatValuesSourceIds = ['b', 'source_2'];
            return input;
        };

        it('gives a source whose join field is filled in by default the shared filter', () => {
            const input = dateKeyed();
            const joinParts: MergeJoinPart[] = [
                {
                    fieldIdBySourceId: {
                        ...input.joinParts[0].fieldIdBySourceId,
                        source_2: null,
                    },
                },
            ];

            const setup = getMergeSetup({ ...input, joinParts });

            expect(setup.effectiveParts[0].fieldIdBySourceId.source_2).toBe(
                'domain_2_date',
            );
            expect(filteredFields(setup, 2)).toEqual(['domain_2_date']);
            expect(filteredFields(setup, 1)).toEqual(['domain_1_date']);
        });

        // As on main: changing a chosen join field leaves every filter as it was
        it('keeps every filter when a chosen join field changes', () => {
            const input = dateKeyed();
            const before = getMergeSetup(input);
            const joinParts: MergeJoinPart[] = [
                {
                    fieldIdBySourceId: {
                        ...input.joinParts[0].fieldIdBySourceId,
                        b: 'domain_1_team',
                    },
                },
            ];

            const after = getMergeSetup({ ...input, joinParts });

            expect(required(after.mergeQuery).sources).toEqual(
                required(before.mergeQuery).sources,
            );
        });

        it('leaves a chosen join field with its own filters, as a saved chart stores them', () => {
            const setup = getMergeSetup(dateKeyed());

            expect(filteredFields(setup, 2)).toEqual([]);
        });
    });
});
