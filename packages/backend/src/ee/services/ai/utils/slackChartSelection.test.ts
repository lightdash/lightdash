import { parseAiArtifactChartConfig, type AiArtifact } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSlackSelectedCardArtifacts } from './slackChartSelection';

const queryConfig = {
    exploreName: 'orders',
    limit: 10,
    metrics: ['orders_count'],
    dimensions: ['orders_month'],
    sorts: [],
    filters: null,
    parameters: null,
    customMetrics: null,
    tableCalculations: null,
};
const chartConfig = (defaultVizType: 'table' | 'bar' = 'bar') => ({
    defaultVizType,
    xAxisDimension: 'orders_month',
    yAxisMetrics: ['orders_count'],
    groupBy: null,
    xAxisType: null,
    xAxisLabel: 'Month',
    yAxisLabel: 'Count',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
    lineType: null,
    stackBars: null,
});
const chartPayload = (defaultVizType: 'table' | 'bar' = 'bar') => ({
    title: 'Orders by month',
    description: 'Order count',
    queryConfig,
    chartConfig: chartConfig(defaultVizType),
});
const parseConfig = (raw: unknown) => {
    const config = parseAiArtifactChartConfig(raw);
    if (config === null) throw new Error('Invalid chart fixture');
    return config;
};
const artifact = (
    versionUuid: string,
    overrides: Partial<AiArtifact> = {},
): AiArtifact => ({
    artifactUuid: `artifact-${versionUuid}`,
    threadUuid: 'current-thread',
    promptUuid: 'current-prompt',
    artifactType: 'chart',
    savedQueryUuid: null,
    savedSqlUuid: null,
    savedDashboardUuid: null,
    createdAt: new Date('2026-09-28T10:00:00Z'),
    versionNumber: 1,
    versionUuid,
    title: 'Orders by month',
    description: null,
    chartConfig: parseConfig({ source: 'semantic', config: chartPayload() }),
    dashboardConfig: null,
    versionCreatedAt: new Date('2026-09-28T10:00:00Z'),
    verifiedByUserUuid: null,
    verifiedAt: null,
    ...overrides,
});
type SelectionInput = Parameters<typeof getSlackSelectedCardArtifacts>[0];
const result = (
    versionUuid: string,
    overrides: Partial<SelectionInput['toolResults'][number]> = {},
): SelectionInput['toolResults'][number] => ({
    toolCallId: `call-${versionUuid}`,
    toolType: 'built-in',
    toolName: 'generateVisualization',
    metadata: { status: 'success', artifactVersionUuid: versionUuid },
    ...overrides,
});
const setup = (): SelectionInput => ({
    artifacts: [artifact('first'), artifact('second'), artifact('third')],
    toolResults: [result('first'), result('second'), result('third')],
    selectedVersionUuids: ['second'],
    canShowInlineTables: true,
});
const versions = (input: SelectionInput) =>
    getSlackSelectedCardArtifacts(input).artifacts.map(
        (item) => item.versionUuid,
    );
const tableArtifact = () =>
    artifact('table', {
        chartConfig: parseConfig({
            source: 'semantic',
            config: chartPayload('table'),
        }),
    });

describe('getSlackSelectedCardArtifacts', () => {
    it('omits generated chart cards when the final answer selects none', () => {
        expect(versions({ ...setup(), selectedVersionUuids: [] })).toEqual([]);
    });

    it('keeps only selected chart versions in selection order and deduplicates references', () => {
        expect(
            versions({
                ...setup(),
                selectedVersionUuids: ['third', 'first', 'third'],
            }),
        ).toEqual(['third', 'first']);
    });

    it('distinguishes chart versions backed by the same query execution', () => {
        expect(
            versions({
                ...setup(),
                selectedVersionUuids: ['second', 'first'],
                toolResults: ['first', 'second'].map((versionUuid) =>
                    result(versionUuid, {
                        metadata: {
                            status: 'success',
                            artifactVersionUuid: versionUuid,
                            queryUuid: 'shared-query',
                        },
                    }),
                ),
            }),
        ).toEqual(['second', 'first']);
    });

    it('ignores unknown, prior, table, failed and external selections', () => {
        expect(
            versions({
                ...setup(),
                artifacts: [
                    ...setup().artifacts,
                    tableArtifact(),
                    artifact('external'),
                    artifact('wrong-tool'),
                ],
                selectedVersionUuids: [
                    'unknown',
                    'prior-version',
                    'table',
                    'first',
                    'external',
                    'wrong-tool',
                    'second',
                ],
                toolResults: [
                    result('table'),
                    result('first', {
                        metadata: {
                            status: 'error',
                            artifactVersionUuid: 'first',
                        },
                    }),
                    result('external', { toolType: 'mcp' }),
                    result('wrong-tool', { toolName: 'getMetadata' }),
                    result('second', { toolName: 'runQuery' }),
                ],
            }),
        ).toEqual(['second']);
    });

    it('rejects missing or malformed persisted metadata', () => {
        expect(
            versions({
                ...setup(),
                selectedVersionUuids: ['first', 'second', 'third'],
                toolResults: [
                    result('first', { metadata: null }),
                    result('second', {
                        metadata: {
                            status: 'success',
                            artifactVersionUuid: 123,
                        },
                    }),
                    result('third', { metadata: { status: 'success' } }),
                ],
            }),
        ).toEqual([]);
    });

    it('retains table link cards under sharing guards while selecting only requested chart links', () => {
        const input = {
            ...setup(),
            artifacts: [tableArtifact(), ...setup().artifacts],
            selectedVersionUuids: ['second', 'table'],
            canShowInlineTables: false,
        };
        expect(versions(input)).toEqual(['second', 'table']);
        expect(
            getSlackSelectedCardArtifacts(input).selectedChartVersionUuids,
        ).toEqual(new Set(['second']));
    });

    it('preserves dashboards, SQL, composer and unconfigured artifacts after selected charts', () => {
        const dashboard = artifact('dashboard', {
            artifactType: 'dashboard',
            chartConfig: null,
        });
        const sql = artifact('sql', {
            chartConfig: { source: 'sql', sql: 'SELECT 1', limit: 1 },
        });
        const composer = artifact('composer', {
            chartConfig: {
                source: 'composer',
                schemaVersion: 1,
                queries: [],
                terminalNodeId: 'final',
                lastQueryUuid: 'composer-query',
            },
        });
        const unconfigured = artifact('unconfigured', { chartConfig: null });
        const input = {
            ...setup(),
            artifacts: [
                dashboard,
                artifact('first'),
                sql,
                tableArtifact(),
                composer,
                artifact('second'),
                unconfigured,
            ],
            selectedVersionUuids: ['composer', 'sql', 'second', 'dashboard'],
        };

        expect(getSlackSelectedCardArtifacts(input).artifacts).toEqual([
            input.artifacts[5],
            dashboard,
            sql,
            composer,
            unconfigured,
        ]);
    });

    it('allows saved custom chart types and merge charts to be selected', () => {
        const custom = artifact('custom', {
            chartConfig: parseConfig({
                source: 'customChartType',
                schemaVersion: 1,
                dataAppVizUuid: 'custom-viz',
                config: {
                    ...chartPayload(),
                    chartConfig: {
                        customChartTypeSlug: 'cohort-waterfall',
                        fieldMapping: { x: 'orders_month', y: 'orders_count' },
                        options: {},
                    },
                },
            }),
        });
        const merge = artifact('merge', {
            chartConfig: parseConfig({
                source: 'merge',
                schemaVersion: 1,
                config: {
                    ...chartPayload(),
                    mergeConfig: {
                        primarySourceId: 'orders',
                        additionalSources: [
                            {
                                id: 'customers',
                                queryConfig: {
                                    ...queryConfig,
                                    exploreName: 'customers',
                                    dimensions: ['customers_month'],
                                    metrics: ['customers_count'],
                                },
                            },
                        ],
                        joinType: 'full',
                        joinKey: [
                            {
                                name: 'month',
                                fields: [
                                    {
                                        sourceId: 'orders',
                                        fieldId: 'orders_month',
                                    },
                                    {
                                        sourceId: 'customers',
                                        fieldId: 'customers_month',
                                    },
                                ],
                            },
                        ],
                    },
                },
            }),
        });

        expect(
            versions({
                artifacts: [custom, merge],
                toolResults: [result('custom'), result('merge')],
                selectedVersionUuids: ['merge', 'custom'],
                canShowInlineTables: true,
            }),
        ).toEqual(['merge', 'custom']);
    });

    it('caps valid selected charts at ten without counting unknown references or duplicates', () => {
        const ids = Array.from({ length: 12 }, (_, index) => `chart-${index}`);
        expect(
            versions({
                artifacts: ids.map((id) => artifact(id)),
                toolResults: ids.map((id) => result(id)),
                selectedVersionUuids: ['unknown', ids[0], ...ids],
                canShowInlineTables: true,
            }),
        ).toEqual(ids.slice(0, 10));
    });
});
