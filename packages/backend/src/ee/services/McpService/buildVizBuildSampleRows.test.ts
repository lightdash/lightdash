import {
    DimensionType,
    FieldType,
    MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
    MAX_APP_VIZ_BUILD_SAMPLE_FIELDS,
    MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
    type CompiledDimension,
    type ItemsMap,
} from '@lightdash/common';
import { buildVizBuildSampleRows } from './buildVizBuildSampleRows';

const dimension = (
    name: string,
    type: DimensionType,
    overrides: Partial<CompiledDimension> = {},
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    compiledSql: name,
    tablesReferences: ['orders'],
    hidden: false,
    ...overrides,
});

const fields: ItemsMap = {
    orders_status: dimension('status', DimensionType.STRING),
    orders_amount: dimension('amount', DimensionType.NUMBER, { round: 2 }),
};

describe('buildVizBuildSampleRows', () => {
    it('keys rows by field id with formatted values', () => {
        expect(
            buildVizBuildSampleRows(
                [{ orders_status: 'shipped', orders_amount: 1234.5 }],
                fields,
                null,
            ),
        ).toEqual([{ orders_status: 'shipped', orders_amount: '1,234.50' }]);
    });

    it('returns no rows for an empty result', () => {
        expect(buildVizBuildSampleRows([], fields, null)).toEqual([]);
    });

    it('caps the number of rows', () => {
        const rows = Array.from(
            { length: MAX_APP_VIZ_BUILD_SAMPLE_ROWS + 5 },
            (_, index) => ({ orders_status: `status ${index}` }),
        );

        expect(buildVizBuildSampleRows(rows, fields, null)).toHaveLength(
            MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
        );
    });

    it('caps the number of fields, keeping the first columns', () => {
        const fieldIds = Array.from(
            { length: MAX_APP_VIZ_BUILD_SAMPLE_FIELDS + 3 },
            (_, index) => `orders_field_${index}`,
        );
        const row = Object.fromEntries(fieldIds.map((id) => [id, 'value']));

        const [sampleRow] = buildVizBuildSampleRows([row], {}, null);

        expect(Object.keys(sampleRow)).toEqual(
            fieldIds.slice(0, MAX_APP_VIZ_BUILD_SAMPLE_FIELDS),
        );
    });

    it('truncates long cell values', () => {
        const [sampleRow] = buildVizBuildSampleRows(
            [
                {
                    orders_status: 'x'.repeat(
                        MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS * 2,
                    ),
                },
            ],
            fields,
            null,
        );

        expect(sampleRow.orders_status).toHaveLength(
            MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
        );
    });
});
