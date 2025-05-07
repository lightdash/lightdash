import { type AdditionalMetric, type ItemsMap } from '@lightdash/common';

export type Schema = {
    readonly uri: string;
    readonly fileMatch?: string[] | undefined;
    readonly schema?: any;
};

export type VegaFieldType = ItemsMap[string] | AdditionalMetric;
