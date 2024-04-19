import { z } from 'zod';
import {
    AbstractCartesianConfigTransformer,
    cartesianVizConfigSchema,
} from './AbstractCartiseanConfigTransformer';

const barVizConfigSchema = cartesianVizConfigSchema.extend({
    type: z.literal('bar'),
});

export type BarVizConfig = z.infer<typeof barVizConfigSchema>;

export class BarConfigTransformer extends AbstractCartesianConfigTransformer<BarVizConfig> {
    static type = 'bar';

    protected defaultSeriesType: string = 'bar';
}
