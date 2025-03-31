import {
    type DashboardFilterRule,
    type FilterOperator,
    getItemId,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { type SdkFilter } from './types';

export const convertSdkFilterToDashboardFilter = (
    filter: SdkFilter,
): DashboardFilterRule => {
    const fieldId = getItemId({
        table: filter.model,
        name: filter.field,
    });

    return {
        id: uuidv4(),
        label: filter.field,
        target: {
            fieldId,
            tableName: filter.model,
        },
        operator: filter.operator as FilterOperator,
        values: Array.isArray(filter.value) ? filter.value : [filter.value],
        tileTargets: {},
    };
};
