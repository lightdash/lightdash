import {
    ChartType,
    MergeJoinType,
    type AiArtifact,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { resolveChartEdit } from '../decisions/chartEdits';
import { prepareArtifactChartAsCode } from './artifactChartAsCode';

const config: ToolRunQueryArgs = {
    title: 'Original title',
    description: 'Original description',
    queryConfig: {
        exploreName: validExplore.name,
        dimensions: ['a_dim1'],
        metrics: ['a_met1'],
        sorts: [],
        limit: 40,
        parameters: { region: 'Europe' },
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: null,
};
const artifact: AiArtifact = {
    artifactUuid: 'chart',
    versionUuid: 'version',
    threadUuid: 'thread',
    promptUuid: 'prompt',
    artifactType: 'chart',
    savedQueryUuid: null,
    savedSqlUuid: null,
    savedDashboardUuid: null,
    createdAt: new Date(),
    versionCreatedAt: new Date(),
    versionNumber: 1,
    title: 'Stored title',
    description: 'Stored description',
    verifiedAt: null,
    verifiedByUserUuid: null,
    chartConfig: { source: 'semantic', config },
    dashboardConfig: null,
};
const setup = () => ({
    artifact: structuredClone(artifact),
    maxQueryLimit: 500,
    getExplore: vi.fn().mockResolvedValue(validExplore),
    compileMerge: vi.fn(),
    getCustomSchemaFields: vi.fn(),
});

describe('existing artifact chart export', () => {
    it('reuses a validated portable snapshot without catalog reconstruction', async () => {
        const args = setup();
        const { chartConfig } = args.artifact;
        if (!chartConfig || chartConfig.source !== 'semantic') {
            throw new Error('Expected semantic fixture');
        }
        args.artifact.chartConfig = {
            ...chartConfig,
            contentAsCode: {
                version: 1,
                contentType: 'chart',
                name: 'Portable title',
                description: 'Portable description',
                tableName: validExplore.name,
                metricQuery: {
                    exploreName: validExplore.name,
                    dimensions: ['a_dim1'],
                    metrics: ['a_met1'],
                    sorts: [],
                    limit: 40,
                    filters: {},
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.TABLE, config: {} },
                dashboardSlug: undefined,
                tableConfig: { columnOrder: ['a_dim1', 'a_met1'] },
                parameters: { region: 'Europe' },
            },
        };

        const result = await prepareArtifactChartAsCode(args);

        expect(result.name).toBe('Portable title');
        expect(args.getExplore).not.toHaveBeenCalled();
        expect(args.compileMerge).not.toHaveBeenCalled();
        expect(args.getCustomSchemaFields).not.toHaveBeenCalled();
    });

    it.each(['line', 'table'] as const)(
        'exports the current presentation after a %s edit without changing query scope',
        async (chartType) => {
            const args = setup();
            const source = {
                source: 'semantic' as const,
                config: {
                    ...config,
                    chartConfig: {
                        defaultVizType: 'table' as const,
                        xAxisDimension: 'a_dim1',
                        yAxisMetrics: ['a_met1'],
                        groupBy: null,
                        xAxisType: 'category' as const,
                        stackBars: null,
                        lineType: null,
                        xAxisLabel: 'Dimension',
                        yAxisLabel: 'Metric',
                        secondaryYAxisMetric: null,
                        secondaryYAxisLabel: null,
                    },
                },
            };
            args.artifact.chartConfig = source;
            const originalExport = await prepareArtifactChartAsCode(args);
            const request = vi.fn<typeof fetch>();
            const edited = await resolveChartEdit({
                decisions: new AiDecisionClient(
                    { apiKey: 'test', model: 'test', timeoutMs: 100 },
                    request,
                ),
                prompt: `Make it a ${chartType}`,
                artifact: { ...source, contentAsCode: originalExport },
            });
            expect(edited).not.toBeNull();
            expect(edited!.changed).toBe(chartType === 'line');
            args.artifact.chartConfig = edited!.config;
            const exported = await prepareArtifactChartAsCode(args);
            expect(exported.chartConfig.type).toBe(
                chartType === 'line' ? ChartType.CARTESIAN : ChartType.TABLE,
            );
            const { filters: originalFilters, ...originalQuery } =
                originalExport.metricQuery;
            expect(exported.metricQuery).toMatchObject(originalQuery);
            expect(
                Object.values(exported.metricQuery.filters).map(
                    ({ id: _id, ...group }) => group,
                ),
            ).toEqual(
                Object.values(originalFilters).map(
                    ({ id: _id, ...group }) => group,
                ),
            );
            expect(edited!.config.config.queryConfig).toEqual(
                source.config.queryConfig,
            );
            if (chartType === 'line')
                expect(exported.chartConfig).toMatchObject({
                    config: {
                        eChartsConfig: {
                            series: [expect.objectContaining({ type: 'line' })],
                        },
                    },
                });
            expect(exported.parameters).toEqual(originalExport.parameters);
            if (chartType === 'table')
                expect(edited!.config.contentAsCode).toEqual(originalExport);
            expect(request).not.toHaveBeenCalled();
        },
    );

    it('uses stored metadata and query scope without an execution dependency', async () => {
        const args = setup();
        const original = structuredClone(args.artifact);
        const result = await prepareArtifactChartAsCode(args);
        expect(result).toMatchObject({
            name: 'Stored title',
            description: 'Stored description',
            parameters: { region: 'Europe' },
            metricQuery: {
                exploreName: validExplore.name,
                dimensions: ['a_dim1'],
                metrics: ['a_met1'],
                limit: 40,
            },
        });
        expect(args.artifact).toEqual(original);
        expect(args.getExplore).toHaveBeenCalledWith({
            table: validExplore.name,
        });
        expect(args.compileMerge).not.toHaveBeenCalled();
        expect(args.getCustomSchemaFields).not.toHaveBeenCalled();
    });

    it('rejects fields no longer visible in the authorized explore', async () => {
        const args = setup();
        args.getExplore.mockResolvedValue({ ...validExplore, tables: {} });
        await expect(prepareArtifactChartAsCode(args)).rejects.toThrow(
            'neither in the explore',
        );
    });

    it('does not silently lower a stored limit to fit a changed agent policy', async () => {
        await expect(
            prepareArtifactChartAsCode({ ...setup(), maxQueryLimit: 20 }),
        ).rejects.toThrow('change its scope');
    });

    it.each(['sql', 'composer', 'dashboard'] as const)(
        'rejects unsupported %s artifacts',
        async (source) => {
            const args = setup();
            args.artifact =
                source === 'dashboard'
                    ? {
                          ...artifact,
                          artifactType: 'dashboard',
                          chartConfig: null,
                      }
                    : {
                          ...artifact,
                          chartConfig: {
                              source,
                              sql: 'select 1',
                              limit: 1,
                          } as AiArtifact['chartConfig'],
                      };
            await expect(prepareArtifactChartAsCode(args)).rejects.toThrow(
                'does not support',
            );
            expect(args.getExplore).not.toHaveBeenCalled();
        },
    );

    it('resolves the exact pinned custom version and derives its pivot', async () => {
        const args = setup();
        args.artifact.chartConfig = {
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid: 'renderer',
            dataAppVizVersion: 3,
            config: {
                ...config,
                chartConfig: {
                    customChartTypeSlug: 'cohort',
                    fieldMapping: { series: ['a_dim1'], value: 'a_met1' },
                    options: { compact: false },
                },
            },
        };
        args.getCustomSchemaFields.mockResolvedValue([
            {
                name: 'series',
                label: 'Series',
                type: 'series',
                multiple: true,
                required: true,
            },
        ]);
        const result = await prepareArtifactChartAsCode(args);
        expect(args.getCustomSchemaFields).toHaveBeenCalledWith('renderer', 3);
        expect(result).toMatchObject({
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizSlug: 'cohort',
                    dataAppVizVersion: 3,
                    optionValues: { compact: false },
                },
            },
            pivotConfig: { columns: ['a_dim1'] },
        });
        args.artifact.chartConfig.dataAppVizVersion = undefined;
        await expect(prepareArtifactChartAsCode(args)).rejects.toThrow(
            'no pinned version',
        );
        args.artifact.chartConfig.dataAppVizVersion = 3;
        args.getCustomSchemaFields.mockResolvedValue(null);
        await expect(prepareArtifactChartAsCode(args)).rejects.toThrow(
            'unavailable',
        );
    });

    it('compiles merge metadata with shared parameters, rejecting invalid stored sources', async () => {
        const args = setup();
        args.artifact.chartConfig = {
            source: 'merge',
            schemaVersion: 1,
            config: {
                ...config,
                mergeConfig: {
                    primarySourceId: 'first',
                    additionalSources: [
                        { id: 'second', queryConfig: config.queryConfig },
                    ],
                    joinKey: [
                        {
                            name: 'key',
                            fields: [
                                { sourceId: 'first', fieldId: 'a_dim1' },
                                { sourceId: 'second', fieldId: 'a_dim1' },
                            ],
                        },
                    ],
                    joinType: MergeJoinType.FULL,
                },
            },
        };
        args.compileMerge.mockResolvedValue({
            errors: [],
            typedColumns: [{ reference: 'merge_key' }],
            sorts: [],
            itemsMap: {
                merge_key: {
                    ...validExplore.tables.a.dimensions.dim1,
                    table: 'merge',
                    name: 'key',
                },
            },
        });
        const result = await prepareArtifactChartAsCode(args);
        expect(args.getExplore).toHaveBeenCalledTimes(1);
        expect(args.compileMerge).toHaveBeenCalledWith(
            expect.objectContaining({
                sources: [
                    expect.objectContaining({ id: 'first' }),
                    expect.objectContaining({ id: 'second' }),
                ],
            }),
            { region: 'Europe' },
        );
        expect(result.merge).toMatchObject({
            primarySourceId: 'a',
            joinType: MergeJoinType.FULL,
        });
        expect(result.metricQuery.exploreName).toBe(validExplore.name);
        expect(result.tableConfig?.columnOrder).toEqual(['merge_join_key_0']);
        args.compileMerge.mockResolvedValue({
            errors: [{ message: 'Invalid join' }],
            typedColumns: null,
        });
        await expect(prepareArtifactChartAsCode(args)).rejects.toThrow(
            'no longer valid',
        );
    });
});
