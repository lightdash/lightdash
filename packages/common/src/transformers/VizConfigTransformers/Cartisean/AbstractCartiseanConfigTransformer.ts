import { z } from 'zod';
import {
    AbstractVizConfigTransformer,
    vizConfigSchema,
    type VizConfigTransformerArguments,
} from '../AbstractVizConfigTransformer';

const axisSchema = z.object({
    fieldId: z.string(),
    type: z
        .enum(['categorical', 'time', 'linear', 'log'])
        .describe(
            "Type of the axis, default to 'linear' but dimensions should be categorical",
        ),
    label: z.string().describe('Label of the axis'),
    sort: z
        .enum(['asc', 'desc'])
        .optional()
        .describe("Sort order of the axis, can only be 'asc' or 'desc'"),
    gridLines: z.boolean().optional().describe('Show grid lines. Optional'),
    axisTicks: z
        .array(
            z.object({
                tickInterval: z
                    .number()
                    .optional()
                    .describe('Interval between ticks. Optional'),
                formatterName: z
                    .string()
                    .optional()
                    .describe('Name of the formatter. Optional'),
            }),
        )
        .optional()
        .describe('Axis ticks. Optional'),
});

const yAxisSchema = axisSchema.extend({
    position: z
        .enum(['left', 'right'])
        .optional()
        .describe(
            'Position of the Y axis. Can only be left or right or omitted',
        ),
});

const cartesianVizConfigSeriesSchema = z.object({
    // add more types here once we have more series types
    type: z
        .enum(['bar'])
        .describe("Type of the series, default to 'bar' at the moment"),
    label: z.string().describe('Label of the series'),
    xAxisFieldId: z.string().describe('Field ID of the X axis'),
    yAxisFieldId: z.string().describe('Field ID of the Y axis'),
});

export const cartesianVizConfigSchema = vizConfigSchema.extend({
    xAxis: axisSchema.describe('xAxis of the chart'),
    yAxis: z
        .array(yAxisSchema)
        .min(1)
        .describe('yAxis of the chart. Should be at least one'),
    series: z
        .array(cartesianVizConfigSeriesSchema)
        .min(1)
        .describe('Series. should be at least one'),
});

export type CartesianVizConfig = z.infer<typeof cartesianVizConfigSchema>;

export abstract class AbstractCartesianConfigTransformer<
    T extends CartesianVizConfig = CartesianVizConfig,
> extends AbstractVizConfigTransformer<T> {
    /**
     * Default series type
     * @protected
     */
    protected defaultSeriesType: string = 'bar';

    constructor(args: VizConfigTransformerArguments) {
        super(args);
        this.vizConfig = this.validVizConfig(args.vizConfig as T);
    }

    protected validVizConfig(config: T): T {
        return {
            ...config,
            type: config.type || this.defaultSeriesType,
            xAxis: config.xAxis,
            yAxis: config.yAxis,
            series: config.series,
        };
    }

    public getXAxisOptions() {
        return this.resultsTransformer.getFieldOptions();
    }

    public getYAxisOptions() {
        return this.resultsTransformer.getFieldOptions();
    }
}
