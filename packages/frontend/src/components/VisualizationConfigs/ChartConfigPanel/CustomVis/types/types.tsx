import {
    type CustomDimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { type Field } from 'react-hook-form';

export type Schema = {
    readonly uri: string;
    readonly fileMatch?: string[] | undefined;
    readonly schema?: any;
};

export type VegaFieldType = Field | TableCalculation | CustomDimension | Metric;
