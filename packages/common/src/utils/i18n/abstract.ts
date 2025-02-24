import { type PartialDeep } from 'type-fest';
import { type z } from 'zod';
import { type ChartAsCode, type DashboardAsCode } from '../../types/coder';

export abstract class AsCodeInternalization<
    T extends ChartAsCode | DashboardAsCode,
> {
    abstract schema: z.AnyZodObject;

    abstract parse(asCode: T): PartialDeep<T>;
}
