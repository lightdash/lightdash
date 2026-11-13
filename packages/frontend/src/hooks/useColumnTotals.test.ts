import {
    DimensionType,
    FieldType,
    RESULT_COLUMN_TABLE,
    type ApiQueryResults,
    type ItemsMap,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useColumnTotals from './useColumnTotals';

const value = (raw: number) => ({ value: { raw, formatted: String(raw) } });

describe('useColumnTotals', () => {
    it('totals a result column field from rows keyed by its column name', () => {
        const itemsMap: ItemsMap = {
            revenue: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.NUMBER,
                table: RESULT_COLUMN_TABLE,
                name: 'revenue',
                label: 'Revenue',
                tableLabel: '',
                sql: '',
                hidden: false,
            },
        };
        const resultsData = {
            rows: [{ revenue: value(10) }, { revenue: value(5) }],
        } as unknown as ApiQueryResults;

        const { result } = renderHook(() =>
            useColumnTotals({ resultsData, itemsMap }),
        );

        expect(result.current).toEqual({ revenue: 15 });
    });
});
