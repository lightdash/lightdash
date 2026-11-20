import {
    CustomDimensionType,
    DimensionType,
    type CustomSqlDimension,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { getChangedCustomSqlDimensionIds } from './chartSqlChanges';

const dimension: CustomSqlDimension = {
    id: 'status',
    name: 'Status',
    type: CustomDimensionType.SQL,
    table: 'orders',
    dimensionType: DimensionType.STRING,
    sql: '${TABLE}.status',
};

describe('getChangedCustomSqlDimensionIds', () => {
    test.each([
        ['unchanged', dimension, []],
        ['new SQL', { ...dimension, sql: '${TABLE}.other' }, ['status']],
        [
            'same SQL on another table',
            { ...dimension, table: 'payments' },
            ['status'],
        ],
    ])('%s', (_, next, expected) => {
        expect(getChangedCustomSqlDimensionIds([next], [dimension])).toEqual(
            expected,
        );
    });
});
