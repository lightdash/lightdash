import { type PartialDeep } from 'type-fest';
import { type z } from 'zod';
import { type ChartAsCode, type DashboardAsCode } from '../../types/coder';

type AllowedAsCode =
    | {
          type: 'chart';
          content: ChartAsCode;
      }
    | {
          type: 'dashboard';
          content: DashboardAsCode;
      };

export abstract class AsCodeInternalization<
    T extends AllowedAsCode,
    Z extends z.ZodObject,
    // Language map entry: mirrors the content shape by default, but an
    // implementation may substitute its own shape for parts that are not
    // positionally addressable (e.g. dashboard filter labels)
    MapEntry = PartialDeep<T['content'], { recurseIntoArrays: true }>,
> {
    protected abstract schema: Z;

    public abstract getLanguageMap(asCode: T['content']): {
        [typeKey in T['type']]: {
            [slugKey in T['content']['slug']]: MapEntry;
        };
    };

    public abstract merge(
        internalizationMap: ReturnType<
            this['getLanguageMap']
        >[T['type']][string],
        content: T['content'],
    ): T['content'];
}
