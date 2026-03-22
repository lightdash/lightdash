import { DimensionType, FieldType, type ItemsMap } from '../../types/field';
import {
    OTHER_GROUP_DISPLAY_VALUE,
    OTHER_GROUP_SENTINEL_VALUE,
} from '../../types/savedCharts';
import { getFormattedValue } from './valueFormatter';

describe('getFormattedValue', () => {
    it('should return "Other" for the sentinel value', () => {
        const result = getFormattedValue(
            OTHER_GROUP_SENTINEL_VALUE,
            'some_key',
            {},
        );
        expect(result).toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for a normal string value', () => {
        const result = getFormattedValue('North America', 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for null', () => {
        const result = getFormattedValue(null, 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    it('should not return "Other" for undefined', () => {
        const result = getFormattedValue(undefined, 'region', {});
        expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
    });

    describe('sentinel value with typed fields', () => {
        const dateItemsMap: ItemsMap = {
            order_date: {
                sql: '${TABLE}.order_date',
                name: 'order_date',
                type: DimensionType.DATE,
                index: 1,
                label: 'Order date',
                table: 'orders',
                groups: [],
                hidden: false,
                fieldType: FieldType.DIMENSION,
                tableLabel: 'Orders',
            },
        };

        it('should return "Other" for sentinel even with date field in itemsMap', () => {
            const result = getFormattedValue(
                OTHER_GROUP_SENTINEL_VALUE,
                'order_date',
                dateItemsMap,
            );
            expect(result).toBe(OTHER_GROUP_DISPLAY_VALUE);
        });

        it('should format real date values normally (not as "Other")', () => {
            const result = getFormattedValue(
                '2024-01-15',
                'order_date',
                dateItemsMap,
            );
            expect(result).not.toBe(OTHER_GROUP_DISPLAY_VALUE);
            expect(result).toContain('2024');
        });
    });
});
