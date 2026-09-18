import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizChart,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AiAgentService } from './AiAgentService';

const versionTwoSchema: DataAppVizSchema = {
    fields: [
        { name: 'x', label: 'X', type: 'dimension', required: true },
        { name: 'y', label: 'Y', type: 'metric', required: true },
        { name: 'series', label: 'Series', type: 'series', required: false },
    ],
    configOptions: [],
    colorPalette: null,
};

const versionThreeSchema: DataAppVizSchema = {
    fields: [
        { name: 'x', label: 'X', type: 'dimension', required: true },
        { name: 'y', label: 'Y', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

type SchemaService = {
    getDataAppVizSchemaFields: (
        projectUuid: string,
        dataAppVizUuid: string,
        dataAppVizVersion?: number,
    ) => Promise<DataAppVizSchema['fields'] | null>;
};

type PivotService = SchemaService & {
    deriveCustomChartTypePivotConfiguration: (
        projectUuid: string,
        customChartConfig: DataAppVizChart,
        metricQuery: MetricQuery,
        fields: ItemsMap,
    ) => Promise<{ groupByColumns?: Array<{ reference: string }> } | undefined>;
};

const buildService = (appModel: object) =>
    new AiAgentService({ appModel } as never) as unknown as SchemaService;

describe('AiAgentService custom chart type version pins', () => {
    it('uses the recorded version schema instead of the app latest schema', async () => {
        const getVersion = vi.fn().mockResolvedValue({
            version: 2,
            status: 'ready',
            viz_schema: versionTwoSchema,
        });
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue({
                app_id: 'app-uuid',
                viz_schema: versionThreeSchema,
            }),
            getVersion,
        });

        await expect(
            service.getDataAppVizSchemaFields('project-uuid', 'viz-uuid', 2),
        ).resolves.toEqual(versionTwoSchema.fields);
        expect(getVersion).toHaveBeenCalledWith('app-uuid', 2);
    });

    it('derives the artifact query pivot from the recorded version schema', async () => {
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue({
                app_id: 'app-uuid',
                viz_schema: versionThreeSchema,
            }),
            getVersion: vi.fn().mockResolvedValue({
                version: 2,
                status: 'ready',
                viz_schema: versionTwoSchema,
            }),
        }) as PivotService;
        const metricQuery = {
            exploreName: 'orders',
            dimensions: ['orders_status', 'orders_region'],
            metrics: ['orders_total'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        } as MetricQuery;
        const fields = {
            orders_status: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
            },
            orders_region: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
            },
            orders_total: {
                fieldType: FieldType.METRIC,
                type: MetricType.SUM,
            },
        } as unknown as ItemsMap;

        await expect(
            service.deriveCustomChartTypePivotConfiguration(
                'project-uuid',
                {
                    dataAppVizUuid: 'viz-uuid',
                    dataAppVizVersion: 2,
                    fieldMapping: {
                        x: 'orders_status',
                        y: 'orders_total',
                        series: 'orders_region',
                    },
                },
                metricQuery,
                fields,
            ),
        ).resolves.toMatchObject({
            groupByColumns: [{ reference: 'orders_region' }],
        });
    });

    it('keeps the latest-schema fallback for legacy artifacts without a pin', async () => {
        const getVersion = vi.fn();
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue({
                app_id: 'app-uuid',
                viz_schema: versionThreeSchema,
            }),
            getVersion,
        });

        await expect(
            service.getDataAppVizSchemaFields('project-uuid', 'viz-uuid'),
        ).resolves.toEqual(versionThreeSchema.fields);
        expect(getVersion).not.toHaveBeenCalled();
    });

    it('reports an unavailable explicit version with recovery guidance', async () => {
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue({
                app_id: 'app-uuid',
                viz_schema: versionThreeSchema,
            }),
            getVersion: vi.fn().mockResolvedValue(null),
        });

        await expect(
            service.getDataAppVizSchemaFields('project-uuid', 'viz-uuid', 2),
        ).rejects.toThrow(
            'Custom chart type version 2 is unavailable. Regenerate the chart to use a renderable version.',
        );
    });

    it('reports a deleted custom chart type when its artifact has a pin', async () => {
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue(null),
            getVersion: vi.fn(),
        });

        await expect(
            service.getDataAppVizSchemaFields('project-uuid', 'viz-uuid', 2),
        ).rejects.toThrow(
            'Custom chart type version 2 is unavailable. Regenerate the chart to use a renderable version.',
        );
    });
});
