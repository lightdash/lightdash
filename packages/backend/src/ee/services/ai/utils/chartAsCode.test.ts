import {
    buildMergeQueryFromMergeDefinition,
    ChartType,
    FilterOperator,
    getFields,
    getItemId,
    MergeJoinType,
    toolRunQueryArgsSchemaTransformed,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { load } from 'js-yaml';
import { parse } from 'yaml';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { getExportChartAsCode } from '../tools/exportChartAsCode';
import { AgentContext } from './AgentContext';
import { AiAgentContentValidation } from './AiAgentContentValidation';
import { prepareChartAsCode, serializeChartAsCode } from './chartAsCode';

const queryUuid = '8ef0c891-9d51-4174-b18f-3d34f66c9af0';
const queryTool = toolRunQueryArgsSchemaTransformed.parse({
    title: 'Revenue: Europe',
    description:
        'Keep the title and description supplied by the agent.\nSecond line.',
    queryConfig: {
        exploreName: validExplore.name,
        dimensions: ['a_dim1', 'a_dim2'],
        metrics: ['a_met1'],
        sorts: [],
        limit: 50,
        parameters: { region: 'Europe' },
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: {
        defaultVizType: 'bar',
        xAxisDimension: 'a_dim1',
        yAxisMetrics: ['a_met1'],
        groupBy: ['a_dim2'],
        xAxisType: 'category',
        stackBars: true,
        lineType: null,
        xAxisLabel: 'Category',
        yAxisLabel: 'Revenue',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
});
const metricQuery: MetricQuery = {
    ...metricQueryMock,
    dimensions: ['a_dim1', 'a_dim2'],
    limit: 50,
    sorts: [{ fieldId: 'a_met1', descending: true }],
};
const source = () =>
    structuredClone({
        queryTool,
        metricQuery,
        fields: Object.fromEntries(
            getFields(validExplore).map((field) => [getItemId(field), field]),
        ),
    });
const prepare = () => prepareChartAsCode(source());

describe('deterministic chart-as-code', () => {
    it('exports custom charts with portable identity, exact version, options and schema-derived pivot', () => {
        const custom = {
            ...source(),
            queryTool: {
                ...queryTool,
                chartConfig: {
                    customChartTypeSlug: 'cohort-waterfall',
                    fieldOptions: null,
                    fieldMapping: {
                        x: 'a_dim1',
                        y: 'a_met1',
                        series: ['a_dim2'],
                    },
                    options: { showLegend: false },
                },
            },
            customChartType: {
                dataAppVizVersion: 7,
                fields: [
                    {
                        name: 'series',
                        label: 'Series',
                        type: 'series' as const,
                        required: true,
                        multiple: true,
                    },
                ],
            },
        };
        const before = structuredClone(custom);
        const { yaml, content } = serializeChartAsCode(
            prepareChartAsCode(custom),
            { slug: 'cohort', spaceSlug: 'sales' },
        );
        expect(load(yaml)).toEqual(parse(yaml));
        expect(content).toMatchObject({
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizSlug: 'cohort-waterfall',
                    dataAppVizVersion: 7,
                    fieldMapping: custom.queryTool.chartConfig.fieldMapping,
                    optionValues: { showLegend: false },
                },
            },
            pivotConfig: { columns: ['a_dim2'] },
            metricQuery,
        });
        expect(yaml).not.toContain('dataAppVizUuid');
        expect(custom).toEqual(before);
        expect(() =>
            prepareChartAsCode({ ...custom, customChartType: undefined }),
        ).toThrow('resolved version');
    });

    it('exports canonical merges that reconstruct both queries without persisting synthetic result queries', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'primary', metricQuery },
                {
                    id: 'comparison',
                    metricQuery: { ...metricQuery, limit: 37 },
                },
            ],
            joinKey: [
                {
                    name: 'key',
                    fieldIdBySourceId: {
                        primary: 'a_dim1',
                        comparison: 'a_dim1',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
            limit: 50,
        };
        const mergeTool = toolRunQueryArgsSchemaTransformed.parse({
            ...queryTool,
            queryConfig: { ...queryTool.queryConfig, filters: null },
            chartConfig: {
                ...queryTool.chartConfig,
                xAxisDimension: 'merge_key',
                yAxisMetrics: ['primary_a_met1', 'comparison_a_met1'],
                groupBy: null,
            },
            mergeConfig: {
                primarySourceId: 'primary',
                additionalSources: [
                    {
                        id: 'comparison',
                        queryConfig: {
                            ...queryTool.queryConfig,
                            filters: null,
                        },
                    },
                ],
                joinKey: [
                    {
                        name: 'key',
                        fields: [
                            { sourceId: 'primary', fieldId: 'a_dim1' },
                            { sourceId: 'comparison', fieldId: 'a_dim1' },
                        ],
                    },
                ],
                joinType: MergeJoinType.FULL,
            },
        });
        const prepared = prepareChartAsCode({
            ...source(),
            queryTool: mergeTool,
            mergeQuery,
            metricQuery: {
                ...metricQuery,
                exploreName: 'synthetic_merge',
                dimensions: ['merge_key'],
                metrics: ['primary_a_met1', 'comparison_a_met1'],
                tableCalculations: [],
            },
        });
        const { content, yaml } = serializeChartAsCode(prepared, {
            slug: 'comparison',
            spaceSlug: 'sales',
        });
        expect(content.metricQuery).toEqual(metricQuery);
        const primaryName = metricQuery.exploreName;
        const additionalName = `${primaryName}_2`;
        expect(content.tableConfig?.columnOrder).toEqual([
            'merge_a_dim1',
            `${primaryName}_a_met1`,
            `${additionalName}_a_met1`,
        ]);
        expect(content).not.toHaveProperty('pipeline');
        expect(content.merge).toMatchObject({
            join: MergeJoinType.FULL,
            keys: { a_dim1: [`${additionalName}.a_dim1`] },
        });
        if (!content.merge || !('queries' in content.merge)) {
            throw new Error('Expected schema v3 merge');
        }
        const reconstructed = buildMergeQueryFromMergeDefinition(
            metricQuery,
            content.merge,
        );
        expect(reconstructed.sources).toEqual([
            { id: primaryName, metricQuery },
            {
                id: additionalName,
                metricQuery: { ...metricQuery, sorts: [], limit: 50 },
            },
        ]);
        expect(reconstructed.joinType).toBe(mergeQuery.joinType);
        expect(yaml).not.toContain('synthetic_merge');
        expect(load(yaml)).toEqual(parse(yaml));
        expect(content.merge.queries[additionalName]).toMatchObject({
            explore: metricQuery.exploreName,
        });
        expect(content.merge.limit).toBe(50);
        expect(() =>
            prepareChartAsCode({ ...source(), queryTool: mergeTool }),
        ).toThrow('executed source queries');
        expect(() =>
            prepareChartAsCode({
                ...source(),
                queryTool: mergeTool,
                mergeQuery: {
                    ...mergeQuery,
                    sources: [
                        { id: 'primary', queryUuid: 'cached-result' },
                        mergeQuery.sources[1],
                    ],
                },
            }),
        ).toThrow('executed source queries');
    });

    it('preserves date strings and boolean-like parameters in the CLI YAML loader', () => {
        const prepared = prepare();
        prepared.parameters = {
            date: '2024-01-01',
            switch: 'on',
            answer: 'yes',
            code: '00123',
        };
        prepared.metricQuery.filters = {
            dimensions: {
                id: 'date-filter',
                and: [
                    {
                        id: 'range',
                        target: { fieldId: 'a_dim1' },
                        operator: FilterOperator.IN_BETWEEN,
                        values: ['2024-01-01', '2024-12-31'],
                    },
                ],
            },
        };
        const { yaml } = serializeChartAsCode(prepared, {
            slug: 'chart',
            spaceSlug: 'space',
        });
        const cliContent = load(yaml);
        expect(cliContent).toEqual(parse(yaml));
        expect(cliContent).toMatchObject({
            parameters: prepared.parameters,
            metricQuery: { filters: prepared.metricQuery.filters },
        });
        new AiAgentContentValidation().validateContent('chart', cliContent);
    });
    it('round-trips valid YAML without changing query scope, labels or groups', () => {
        const original = structuredClone({ queryTool, metricQuery });
        const { content, yaml } = serializeChartAsCode(prepare(), {
            slug: 'revenue-europe',
            spaceSlug: 'sales/regional',
        });
        const decoded = parse(yaml);
        new AiAgentContentValidation().validateContent('chart', decoded);
        expect(decoded.metricQuery).toEqual(metricQuery);
        expect(decoded).toMatchObject({
            name: queryTool.title,
            description: queryTool.description,
            parameters: { region: 'Europe' },
            pivotConfig: { columns: ['a_dim2'] },
            chartConfig: { type: ChartType.CARTESIAN },
            slug: 'revenue-europe',
            spaceSlug: 'sales/regional',
        });
        expect(decoded).not.toHaveProperty('verified');
        expect(decoded).not.toHaveProperty('access');
        expect(content.metricQuery).toEqual(metricQuery);
        expect({ queryTool, metricQuery }).toEqual(original);
        expect(
            serializeChartAsCode(prepare(), {
                slug: 'revenue-europe',
                spaceSlug: 'sales/regional',
            }).yaml,
        ).toBe(yaml);
    });

    it('returns a valid table when the chosen configuration is a table', () => {
        const prepared = prepareChartAsCode({
            queryTool: { ...queryTool, chartConfig: null },
            metricQuery,
            fields: Object.fromEntries(
                getFields(validExplore).map((field) => [
                    getItemId(field),
                    field,
                ]),
            ),
        });
        expect(prepared.chartConfig.type).toBe(ChartType.TABLE);
        expect(prepared.pivotConfig).toBeUndefined();
    });

    it('rejects malformed generated content before serializing it', () => {
        expect(() =>
            serializeChartAsCode(
                {
                    ...prepare(),
                    metricQuery: { ...metricQuery, limit: Number.NaN },
                },
                { slug: 'chart', spaceSlug: 'space' },
            ),
        ).toThrow();
    });

    it('keeps export sources isolated to the current turn and immutable', () => {
        const ctx = new AgentContext([]);
        const prepared = source();
        ctx.registerChartExport(queryUuid, prepared);
        prepared.queryTool.title = 'Mutated';
        expect(ctx.getChartExport(queryUuid).queryTool.title).toBe(
            queryTool.title,
        );
        ctx.getChartExport(queryUuid).metricQuery.filters = {};
        expect(ctx.getChartExport(queryUuid).metricQuery).toEqual(metricQuery);
        expect(() => new AgentContext([]).getChartExport(queryUuid)).toThrow(
            'current turn',
        );
    });

    it('bounds retained sources without dropping the newest export', () => {
        const ctx = new AgentContext([]);
        for (let index = 0; index < 21; index += 1) {
            ctx.registerChartExport(String(index), source());
        }
        expect(() => ctx.getChartExport('0')).toThrow();
        expect(ctx.getChartExport('20').queryTool.title).toBe(queryTool.title);
    });

    it('exports only a registered execution without warehouse or persistence access', async () => {
        const ctx = new AgentContext([]);
        const tool = getExportChartAsCode(ctx);
        const input = { queryUuid, slug: 'revenue', spaceSlug: 'sales' };
        const options = {
            toolCallId: 'export',
            messages: [],
            context: {},
        };
        expect(await tool.execute!(input, options)).toMatchObject({
            metadata: { status: 'error' },
        });
        ctx.registerChartExport(queryUuid, source());
        const output = await tool.execute!(input, options);
        if (Symbol.asyncIterator in output)
            throw new Error('Expected synchronous export result');
        expect(output).toMatchObject({
            result: expect.stringContaining('```yaml'),
            metadata: { status: 'success' },
        });
        if (
            output.metadata.status !== 'success' ||
            !output.metadata.deliveryToken
        )
            throw new Error('Expected successful export');
        const modelOutput = await tool.toModelOutput!({
            toolCallId: 'export',
            input,
            output,
        });
        expect(modelOutput).toMatchObject({
            type: 'text',
            value: expect.stringContaining(output.metadata.deliveryToken),
        });
        expect(JSON.stringify(modelOutput)).not.toContain('chartConfig');
        expect(ctx.responseBlocks.render(output.metadata.deliveryToken)).toBe(
            output.result,
        );
    });

    it('lists existing charts and exports the exact selected version through server-owned response blocks', async () => {
        const reference = {
            artifactUuid: '9bfdbe88-b61f-42df-99bb-27fa546c7760',
            versionUuid: 'f1528ea7-db31-40bb-adf9-13e98c14aebf',
        };
        const artifacts = {
            list: vi
                .fn()
                .mockResolvedValue([{ ...reference, title: 'Revenue' }]),
            prepare: vi.fn().mockResolvedValue(prepare()),
        };
        const ctx = new AgentContext([]);
        const tool = getExportChartAsCode(ctx, artifacts);
        const options = {
            toolCallId: 'export',
            messages: [],
            context: {},
        };
        const destination = { slug: 'revenue', spaceSlug: 'sales' };
        const listing = await tool.execute!(
            {
                ...destination,
                queryUuid: null,
                artifactUuid: null,
                versionUuid: null,
            },
            options,
        );
        if (Symbol.asyncIterator in listing) throw new Error('Expected result');
        expect(listing.result).toContain(reference.versionUuid);
        expect(artifacts.prepare).not.toHaveBeenCalled();
        expect(
            await tool.toModelOutput!({
                toolCallId: 'export',
                input: destination,
                output: listing,
            }),
        ).toMatchObject({
            value: expect.stringContaining(reference.versionUuid),
        });
        const output = await tool.execute!(
            { ...destination, ...reference },
            options,
        );
        if (Symbol.asyncIterator in output || !output.metadata.deliveryToken)
            throw new Error('Expected export');
        expect(artifacts.prepare).toHaveBeenCalledWith(reference);
        expect(ctx.responseBlocks.render(output.metadata.deliveryToken)).toBe(
            output.result,
        );
        expect(output.result).toContain('slug: revenue');
    });

    it('rejects ambiguous or incomplete source references before calling artifact dependencies', async () => {
        const ctx = new AgentContext([]);
        const artifacts = { list: vi.fn(), prepare: vi.fn() };
        const tool = getExportChartAsCode(ctx, artifacts);
        const options = {
            toolCallId: 'export',
            messages: [],
            context: {},
        };
        const results = await Promise.all(
            [
                { queryUuid, artifactUuid: queryUuid, versionUuid: queryUuid },
                { artifactUuid: queryUuid },
                { versionUuid: queryUuid },
            ].map((reference) =>
                tool.execute!(
                    { ...reference, slug: 'chart', spaceSlug: 'sales' },
                    options,
                ),
            ),
        );
        for (const result of results) {
            expect(result).toMatchObject({ metadata: { status: 'error' } });
        }
        expect(artifacts.list).not.toHaveBeenCalled();
        expect(artifacts.prepare).not.toHaveBeenCalled();
    });

    it('returns artifact permission failures without an export block', async () => {
        const ctx = new AgentContext([]);
        const tool = getExportChartAsCode(ctx, {
            list: vi.fn(),
            prepare: vi.fn().mockRejectedValue(new Error('Access denied')),
        });
        const output = await tool.execute!(
            {
                artifactUuid: queryUuid,
                versionUuid: queryUuid,
                slug: 'chart',
                spaceSlug: 'sales',
            },
            { toolCallId: 'export', messages: [], context: {} },
        );
        expect(output).toMatchObject({ metadata: { status: 'error' } });
        expect(output).not.toHaveProperty('metadata.deliveryToken');
    });
});
