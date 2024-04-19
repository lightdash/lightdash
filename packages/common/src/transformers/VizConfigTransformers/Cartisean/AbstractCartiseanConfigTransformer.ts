import { z } from 'zod';
import {
    AbstractVizConfigTransformer,
    vizConfigSchema,
    type VizConfigTransformerArguments,
} from '../AbstractVizConfigTransformer';

const axisTickSchema = z.object({
    tickInterval: z.number(),
    formatterName: z.string(),
});

const axisSchema = z.object({
    fieldId: z.string(),
    type: z.enum(['categorical', 'time', 'linear', 'log']),
    label: z.string(),
    sort: z.enum(['asc', 'desc']).optional(),
    position: z.enum(['left', 'right']).optional(),
    gridLines: z.boolean(),
    axisTicks: z.array(axisTickSchema),
});

const cartesianVizConfigSeriesSchema = z.object({
    type: z.enum(['bar', 'line', 'scatter']),
    label: z.string(),
    xAxisFieldId: z.string(),
    yAxisFieldId: z.string(),
});

export const cartesianVizConfigSchema = vizConfigSchema.extend({
    xAxis: axisSchema,
    yAxis: z.array(axisSchema),
    series: z.array(cartesianVizConfigSeriesSchema),
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
