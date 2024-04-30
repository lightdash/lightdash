import { z } from 'zod';
import {
    AbstractCartesianConfigTransformer,
    cartesianVizConfigSchema,
} from './AbstractCartiseanConfigTransformer';

export const barVizConfigSchema = cartesianVizConfigSchema.extend({
    type: z.literal('bar').describe("Type of the series, default to 'bar'"),
});

export type BarVizConfig = z.infer<typeof barVizConfigSchema>;

export class BarConfigTransformer extends AbstractCartesianConfigTransformer<BarVizConfig> {
    static type = 'bar';

    protected defaultSeriesType: string = 'bar';
}
