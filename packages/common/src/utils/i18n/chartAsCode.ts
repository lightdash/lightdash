import { z } from 'zod';
import { type ChartAsCode } from '../../types/coder';
import { type AsCodeInternalization } from './abstract';

export class ChartAsCodeInternalization
    implements AsCodeInternalization<ChartAsCode>
{
    schema = z.object({
        name: z.string(),
        description: z.string(),
    });

    public parse(chartAsCode: ChartAsCode) {
        return this.schema.parse(chartAsCode);
    }
}
