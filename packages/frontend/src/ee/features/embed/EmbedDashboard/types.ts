import { type FilterOperator } from '@lightdash/common';

export type SdkFilter = {
    model: string;
    field: string;
    operator: `${FilterOperator}`;
    value: unknown | unknown[];
};
