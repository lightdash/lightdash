import {
    DimensionType,
    FieldType,
    MergeJoinType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    buildSavedMergeDefinition,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { emptyMergeSource, PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource } from '../context/context';
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
                mergeQuery: setup.mergeQuery!,
                chartSourceId: input.tableName,
            });
            const restored = restoreSavedMerge(saved)!;
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
            mergeQuery: setup.mergeQuery!,
            chartSourceId: input.tableName,
        });
        const restored = parseMergeState(
            serializeMergeState(restoreSavedMerge(saved)!),
        )!;
        expect(
            getMergeSetup({ ...input, ...restored }).mergeQuery
                ?.tableCalculations,
        ).toEqual(tableCalculations);
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
