import {
    DimensionType,
    FieldType,
    getFormatExpression,
    ItemsMap,
    TimeFrames,
    type Dimension,
} from '@lightdash/common';
import moment from 'moment';
import { ExcelService } from './ExcelService';

// Mock data for testing
const mockItemMapWithFormats: ItemsMap = {
    number_with_usd_format: {
        name: 'number_with_usd_format',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: 'usd', // Legacy format that should convert to [$$]#,##0.00
        tableLabel: 'table',
        label: 'USD Amount',
        sql: '${TABLE}.amount',
    },
    number_with_custom_format: {
        name: 'number_with_custom_format',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '0.00%', // Direct format expression
        tableLabel: 'table',
        label: 'Percentage',
        sql: '${TABLE}.percentage',
    },
    number_without_format: {
        name: 'number_without_format',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        tableLabel: 'table',
        label: 'Plain Number',
        sql: '${TABLE}.plain_number',
    },
    string_column: {
        name: 'string_column',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        tableLabel: 'table',
        label: 'String Column',
        sql: '${TABLE}.string_value',
    },
    date_column: {
        name: 'date_column',
        description: undefined,
        type: DimensionType.DATE,
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'Date Column',
        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.date_column',
    },
    timestamp_column: {
        name: 'timestamp_column',
        description: undefined,
        type: DimensionType.TIMESTAMP,
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'Timestamp Column',
        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.timestamp_column',
    },
    date_base_ts_column: {
        name: 'date_base_ts_column',
        description: undefined,
        type: DimensionType.DATE,
        timeIntervalBaseDimensionType: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.DAY,
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'Date Base TS Column',
        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.date_base_ts_column',
    } as Dimension,
    // Additional format test cases from Lightdash docs
    pounds_currency_rounded: {
        name: 'pounds_currency_rounded',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '[$£]#,##0', // Pounds currency with rounding
        tableLabel: 'table',
        label: 'Pounds Rounded',
        sql: '${TABLE}.pounds_amount',
    },
    dimension_rounded: {
        name: 'dimension_rounded',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.NUMBER,
        format: '0.00', // Rounding dimension
        tableLabel: 'table',
        label: 'Rounded Dimension',
        sql: '${TABLE}.rounded_value',
    },
    compact_thousands: {
        name: 'compact_thousands',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.NUMBER,
        format: '0," K"', // Compact dimension like "1K"
        tableLabel: 'table',
        label: 'Thousands Compact',
        sql: '${TABLE}.thousands_value',
    },
    compact_billions: {
        name: 'compact_billions',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '0.00,,," B"', // Compact metrics - billions
        tableLabel: 'table',
        label: 'Billions Compact',
        sql: '${TABLE}.billions_value',
    },
    euro_currency: {
        name: 'euro_currency',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '[$€-407] #,##0.00', // Euro currency format (like shown in our earlier tests)
        tableLabel: 'table',
        label: 'Euro Amount',
        sql: '${TABLE}.euro_amount',
    },
    basic_rounding: {
        name: 'basic_rounding',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '0', // Basic rounding (from docs: 121.854 -> 123)
        tableLabel: 'table',
        label: 'Basic Rounded',
        sql: '${TABLE}.basic_value',
    },
    one_decimal: {
        name: 'one_decimal',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.METRIC,
        type: DimensionType.NUMBER,
        format: '0.0', // One decimal place (from docs: 121.854 -> 121.9)
        tableLabel: 'table',
        label: 'One Decimal',
        sql: '${TABLE}.one_decimal_value',
    },
    date_with_custom_format: {
        name: 'date_with_custom_format',
        description: undefined,
        type: DimensionType.DATE,
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'Custom Date Format',
        fieldType: FieldType.DIMENSION,
        format: 'dd mmmm yyyy', // Custom date format like "05 July 2020"
        sql: '${TABLE}.custom_date',
    },
    timestamp_with_custom_format: {
        name: 'timestamp_with_custom_format',
        description: undefined,
        type: DimensionType.TIMESTAMP,
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'Custom Timestamp Format',
        fieldType: FieldType.DIMENSION,
        format: 'mm/dd/yyyy hh:mm', // Custom timestamp format
        sql: '${TABLE}.custom_timestamp',
    },
};

describe('ExcelService', () => {
    describe('convertRowToExcel', () => {
        it('accepts a timezone argument and forwards it to formatItemValue', () => {
            const row = {
                number_with_usd_format: '1234.56',
                string_column: 'test string',
            };

            const sortedFieldIds = ['number_with_usd_format', 'string_column'];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
                'America/New_York',
            );

            expect(result[0]).toBe(1234.56);
            expect(result[1]).toBe('test string');
        });

        it('should convert numeric strings to numbers when format expression is present', () => {
            const row = {
                number_with_usd_format: '1234.56',
                number_with_custom_format: '0.1234',
                number_without_format: '999.99',
                string_column: 'test string',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'number_without_format',
                'string_column',
            ];

            // Test with onlyRaw = false (should apply formatting)
            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Number with USD format should be converted to actual number for Excel formatting
            expect(result[0]).toBe(1234.56);
            // Number with percentage format should be converted to actual number
            expect(result[1]).toBe(0.1234);
            // Number without explicit format should still be converted to number
            expect(result[2]).toBe(999.99);
            expect(typeof result[2]).toBe('number');
            // String should remain as string
            expect(result[3]).toBe('test string');
        });

        it('should return raw values when onlyRaw is true', () => {
            const row = {
                number_with_usd_format: '1234.56',
                number_with_custom_format: '0.1234',
                string_column: 'test string',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            // Test with onlyRaw = true
            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                true,
                sortedFieldIds,
            );

            // All values should be returned as-is when onlyRaw is true
            expect(result[0]).toBe('1234.56');
            expect(result[1]).toBe('0.1234');
            expect(result[2]).toBe('test string');
        });

        it('should handle null and undefined values', () => {
            const row = {
                number_with_usd_format: null,
                number_with_custom_format: undefined,
                string_column: 'test',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            expect(result[0]).toBeNull();
            expect(result[1]).toBeUndefined();
            expect(result[2]).toBe('test');
        });

        it('should convert dates and timestamps to Date objects', () => {
            const row = {
                date_column: '2023-12-25',
                timestamp_column: '2023-12-25T10:30:00.000Z',
                string_column: 'test',
            };

            const sortedFieldIds = [
                'date_column',
                'timestamp_column',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            expect(result[0]).toBeInstanceOf(Date);
            expect(result[1]).toBeInstanceOf(Date);
            expect(result[2]).toBe('test');
        });

        it('should handle non-numeric strings with format expressions', () => {
            const row = {
                number_with_usd_format: 'not a number',
                number_with_custom_format: '',
                string_column: 'test',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Non-numeric strings should be returned as-is even with format expressions
            expect(result[0]).toBe('not a number');
            expect(result[1]).toBe('');
            expect(result[2]).toBe('test');
        });

        it('should handle actual numbers (not strings) with format expressions', () => {
            const row = {
                number_with_usd_format: 1234.56,
                number_with_custom_format: 0.1234,
                string_column: 'test',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Actual numbers should pass through unchanged when format expressions are present
            expect(result[0]).toBe(1234.56);
            expect(result[1]).toBe(0.1234);
            expect(result[2]).toBe('test');
        });

        it('should handle empty string numbers', () => {
            const row = {
                number_with_usd_format: '   ',
                number_with_custom_format: '',
                string_column: 'test',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Empty/whitespace-only strings should not be converted to numbers
            expect(result[0]).toBe('   ');
            expect(result[1]).toBe('');
            expect(result[2]).toBe('test');
        });

        it('should handle various numeric string formats with format expressions', () => {
            const row = {
                number_with_usd_format: '2223703496', // Large number as string
                number_with_custom_format: '0.95', // Decimal as string
                string_column: 'test',
            };

            const sortedFieldIds = [
                'number_with_usd_format',
                'number_with_custom_format',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Large number should be converted to actual number for Excel formatting
            expect(result[0]).toBe(2223703496);
            expect(typeof result[0]).toBe('number');

            // Decimal should be converted to actual number for percentage formatting
            expect(result[1]).toBe(0.95);
            expect(typeof result[1]).toBe('number');

            // String should remain as string
            expect(result[2]).toBe('test');
        });

        it('should handle Lightdash format expressions from documentation', () => {
            const row = {
                pounds_currency_rounded: '121.854', // Should convert to 121.854 for [$£]#,##0 format
                dimension_rounded: '121.854', // Should convert to 121.854 for 0.00 format
                compact_thousands: '1500', // Should convert to 1500 for 0," K" format
                compact_billions: '1500000000', // Should convert to 1500000000 for 0.00,,," B" format
                euro_currency: '2223703496', // Should convert to 2223703496 for Euro format
                basic_rounding: '121.854', // Should convert to 121.854 for 0 format
                one_decimal: '121.854', // Should convert to 121.854 for 0.0 format
            };

            const sortedFieldIds = [
                'pounds_currency_rounded',
                'dimension_rounded',
                'compact_thousands',
                'compact_billions',
                'euro_currency',
                'basic_rounding',
                'one_decimal',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // All should be converted to numbers for Excel formatting
            expect(result[0]).toBe(121.854);
            expect(typeof result[0]).toBe('number');

            expect(result[1]).toBe(121.854);
            expect(typeof result[1]).toBe('number');

            expect(result[2]).toBe(1500);
            expect(typeof result[2]).toBe('number');

            expect(result[3]).toBe(1500000000);
            expect(typeof result[3]).toBe('number');

            expect(result[4]).toBe(2223703496);
            expect(typeof result[4]).toBe('number');

            expect(result[5]).toBe(121.854);
            expect(typeof result[5]).toBe('number');

            expect(result[6]).toBe(121.854);
            expect(typeof result[6]).toBe('number');
        });

        it('should handle edge cases with format expressions', () => {
            const row = {
                pounds_currency_rounded: '0', // Zero value
                dimension_rounded: '1000000', // Large value
                compact_thousands: '0.5', // Decimal value
                euro_currency: '-1234.56', // Negative value
            };

            const sortedFieldIds = [
                'pounds_currency_rounded',
                'dimension_rounded',
                'compact_thousands',
                'euro_currency',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // All should be converted to numbers preserving the original values
            expect(result[0]).toBe(0);
            expect(result[1]).toBe(1000000);
            expect(result[2]).toBe(0.5);
            expect(result[3]).toBe(-1234.56);
        });

        it('should not convert non-numeric strings even with format expressions', () => {
            const row = {
                pounds_currency_rounded: 'N/A',
                dimension_rounded: 'null',
                compact_thousands: 'undefined',
                euro_currency: 'error',
            };

            const sortedFieldIds = [
                'pounds_currency_rounded',
                'dimension_rounded',
                'compact_thousands',
                'euro_currency',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Non-numeric strings should remain as strings
            expect(result[0]).toBe('N/A');
            expect(result[1]).toBe('null');
            expect(result[2]).toBe('undefined');
            expect(result[3]).toBe('error');
        });

        it('should handle mixed field types with and without format expressions', () => {
            const row = {
                pounds_currency_rounded: '100.50', // With format
                number_without_format: '200.75', // Without format
                string_column: 'test', // String field
                dimension_rounded: '300.25', // With format
            };

            const sortedFieldIds = [
                'pounds_currency_rounded',
                'number_without_format',
                'string_column',
                'dimension_rounded',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Format expression fields should become numbers
            expect(result[0]).toBe(100.5);
            expect(typeof result[0]).toBe('number');

            // Number fields without explicit format should still become numbers (gets default format)
            expect(result[1]).toBe(200.75);
            expect(typeof result[1]).toBe('number');

            // String fields should remain strings
            expect(result[2]).toBe('test');

            // Format expression fields should become numbers
            expect(result[3]).toBe(300.25);
            expect(typeof result[3]).toBe('number');
        });

        it('should convert dates with custom formats to Date objects', () => {
            const row = {
                date_with_custom_format: '2020-07-05T00:00:00.000Z', // ISO string
                timestamp_with_custom_format: '2023-12-25T10:30:00.000Z', // ISO string
                date_column: '2023-01-01', // Date without custom format
                string_column: 'test',
            };

            const sortedFieldIds = [
                'date_with_custom_format',
                'timestamp_with_custom_format',
                'date_column',
                'string_column',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Date with custom format should be converted to Date object for Excel formatting
            expect(result[0]).toBeInstanceOf(Date);
            expect(result[0]).toEqual(new Date('2020-07-05T00:00:00.000Z'));

            // Timestamp with custom format should be converted to Date object
            expect(result[1]).toBeInstanceOf(Date);
            expect(result[1]).toEqual(new Date('2023-12-25T10:30:00.000Z'));

            // Date without custom format should also be converted to Date object
            expect(result[2]).toBeInstanceOf(Date);

            // String should remain as string
            expect(result[3]).toBe('test');
        });

        it('should handle various date string formats with custom formatting', () => {
            const row = {
                date_with_custom_format: '2020-07-05', // Date string
                timestamp_with_custom_format: '2023-12-25T10:30:00.000Z', // Full ISO string
            };

            const sortedFieldIds = [
                'date_with_custom_format',
                'timestamp_with_custom_format',
            ];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            // Both should be converted to Date objects
            expect(result[0]).toBeInstanceOf(Date);
            expect(result[1]).toBeInstanceOf(Date);

            // Check that dates are correctly parsed (use moment for consistent comparison)
            expect(result[0]).toEqual(moment('2020-07-05').toDate());
            expect(result[1]).toEqual(new Date('2023-12-25T10:30:00.000Z'));
        });

        describe('timezone wall-clock shift', () => {
            const TIMESTAMP_ROW = {
                timestamp_column: '2024-01-16T05:30:45.000Z',
            };
            const SORTED = ['timestamp_column'];

            it.each([
                ['undefined', undefined],
                ['UTC', 'UTC'],
            ])(
                'is a no-op when timezone is %s (silence guarantee)',
                (_label, tz) => {
                    const result = ExcelService.convertRowToExcel(
                        TIMESTAMP_ROW,
                        mockItemMapWithFormats,
                        false,
                        SORTED,
                        tz,
                    );

                    expect(result[0]).toEqual(
                        moment('2024-01-16T05:30:45.000Z').toDate(),
                    );
                },
            );

            it('shifts TIMESTAMP cells into project-tz wall-clock when tz is non-UTC', () => {
                const result = ExcelService.convertRowToExcel(
                    TIMESTAMP_ROW,
                    mockItemMapWithFormats,
                    false,
                    SORTED,
                    'America/New_York',
                );

                // 05:30:45 UTC == 00:30:45 NY (EST, -5).
                const cell = result[0] as Date;
                expect(cell).toBeInstanceOf(Date);
                expect(cell.getUTCFullYear()).toBe(2024);
                expect(cell.getUTCMonth()).toBe(0);
                expect(cell.getUTCDate()).toBe(16);
                expect(cell.getUTCHours()).toBe(0);
                expect(cell.getUTCMinutes()).toBe(30);
                expect(cell.getUTCSeconds()).toBe(45);
            });

            it('does not shift DATE cells (calendar values stay as-is)', () => {
                const result = ExcelService.convertRowToExcel(
                    { date_column: '2024-01-16' },
                    mockItemMapWithFormats,
                    false,
                    ['date_column'],
                    'America/New_York',
                );

                expect(result[0]).toEqual(moment('2024-01-16').toDate());
            });

            it('shifts DATE cells whose base is TIMESTAMP (DATE_TRUNC round-trip)', () => {
                // 2024-01-16T05:00:00Z is midnight Jan 16 in NY (EST, -5)
                // after the DATE_TRUNC round-trip — should land on the
                // project-tz day boundary, not the UTC instant.
                const result = ExcelService.convertRowToExcel(
                    { date_base_ts_column: '2024-01-16T05:00:00.000Z' },
                    mockItemMapWithFormats,
                    false,
                    ['date_base_ts_column'],
                    'America/New_York',
                );

                const cell = result[0] as Date;
                expect(cell).toBeInstanceOf(Date);
                expect(cell.getUTCFullYear()).toBe(2024);
                expect(cell.getUTCMonth()).toBe(0);
                expect(cell.getUTCDate()).toBe(16);
                expect(cell.getUTCHours()).toBe(0);
                expect(cell.getUTCMinutes()).toBe(0);
            });
        });

        describe('convertToExcelDate', () => {
            it('returns the same Date as today when timezone is undefined or UTC', () => {
                const iso = '2024-01-16T05:30:45.000Z';
                const expected = moment(iso, moment.ISO_8601, true).toDate();

                expect(ExcelService.convertToExcelDate(iso)).toEqual(expected);
                expect(ExcelService.convertToExcelDate(iso, 'UTC')).toEqual(
                    expected,
                );
            });

            it('shifts ISO timestamp strings to project-tz wall-clock when tz is non-UTC', () => {
                const cell = ExcelService.convertToExcelDate(
                    '2024-01-16T05:30:45.000Z',
                    'America/New_York',
                ) as Date;

                expect(cell).toBeInstanceOf(Date);
                expect(cell.getUTCHours()).toBe(0);
                expect(cell.getUTCMinutes()).toBe(30);
            });

            it('does not shift bare date strings (no time component)', () => {
                const cell = ExcelService.convertToExcelDate(
                    '2024-01-16',
                    'America/New_York',
                );

                expect(cell).toEqual(
                    moment('2024-01-16', moment.ISO_8601, true).toDate(),
                );
            });
        });

        it('should preserve numeric metric values that resemble YYYYMM dates (PROD-6683)', () => {
            const row = {
                number_without_format: '202811',
                string_column: 'test',
            };

            const sortedFieldIds = ['number_without_format', 'string_column'];

            const result = ExcelService.convertRowToExcel(
                row,
                mockItemMapWithFormats,
                false,
                sortedFieldIds,
            );

            expect(result[0]).toBe(202811);
            expect(typeof result[0]).toBe('number');
            expect(result[0]).not.toBeInstanceOf(Date);
        });
    });

    describe('generateFileId', () => {
        it('should generate file ID with .xlsx extension', () => {
            const fileName = 'test-results';
            const fileId = ExcelService.generateFileId(fileName);

            // Format is: xlsx-test-results-YYYY-MM-DD-HH-mm-ss-SSSS.xlsx
            expect(fileId).toMatch(
                /^xlsx-test-results-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{4}\.xlsx$/,
            );
        });

        it('should include truncated suffix when truncated is true', () => {
            const fileName = 'test-results';
            const fileId = ExcelService.generateFileId(fileName, true);

            // Format is: xlsx-incomplete_results-test-results-YYYY-MM-DD-HH-mm-ss-SSSS.xlsx
            expect(fileId).toMatch(
                /^xlsx-incomplete_results-test-results-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{4}\.xlsx$/,
            );
        });
    });

    // PROD-6683: pivoted XLSX export now only converts date/timestamp
    // index columns to Excel Date objects — metric columns are never
    // converted, even if values match ISO 8601 (e.g. "202811").

    describe('downloadPivotTableXlsx', () => {
        it('should not convert metric values that look like YYYYMM to dates (PROD-6683)', async () => {
            const pivotDimension = 'payments_payment_method';
            const indexDimension = 'customers_created_month';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [indexDimension]: {
                    name: 'created_month',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created month',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    hidden: false,
                    sql: '${TABLE}.created_month',
                },
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [indexDimension]: '2023-01-01',
                    [metric]: 202811,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [indexDimension]: '2023-01-01',
                    [metric]: 2028,
                },
                {
                    [pivotDimension]: 'credit_card',
                    [indexDimension]: '2023-02-01',
                    [metric]: 20281101,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [indexDimension]: '2023-02-01',
                    [metric]: 141312,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, indexDimension],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: indexDimension, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: false,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: false,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore - Buffer type mismatch between exceljs and Node 20
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dataValues: { row: number; col: number; value: unknown }[] =
                [];
            worksheet!.eachRow((row, rowNum) => {
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    dataValues.push({
                        row: rowNum,
                        col: colNum,
                        value: cell.value,
                    });
                });
            });

            // Date index column (col 1) should have Date objects in data rows
            const dateValues = dataValues.filter(
                (v) => v.value instanceof Date,
            );
            expect(dateValues.length).toBeGreaterThanOrEqual(2);

            // Metric value columns (col 2+) should NOT have Date objects
            const metricDateValues = dataValues.filter(
                (v) => v.col > 1 && v.value instanceof Date,
            );
            expect(metricDateValues).toHaveLength(0);

            // YYYYMM-like metric values should be preserved as strings
            const stringValues = dataValues
                .filter((v) => typeof v.value === 'string')
                .map((v) => v.value as string);
            const numericStrings = stringValues.filter((v) =>
                [
                    '202,811',
                    '202811',
                    '2,028',
                    '2028',
                    '20,281,101',
                    '20281101',
                    '141,312',
                    '141312',
                ].includes(v),
            );
            expect(numericStrings.length).toBeGreaterThanOrEqual(4);
        });

        it('TC1: should convert both DATE and TIMESTAMP index dimensions to Date objects', async () => {
            const pivotDimension = 'payments_payment_method';
            const dateIndex = 'customers_created_month';
            const timestampIndex = 'orders_created_at';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [dateIndex]: {
                    name: 'created_month',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created month',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    hidden: false,
                    sql: '${TABLE}.created_month',
                },
                [timestampIndex]: {
                    name: 'created_at',
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Created at',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.TIMESTAMP,
                    hidden: false,
                    sql: '${TABLE}.created_at',
                },
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: '2023-01-01',
                    [timestampIndex]: '2023-01-15T14:30:00.000Z',
                    [metric]: 202811,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: '2023-01-01',
                    [timestampIndex]: '2023-01-15T14:30:00.000Z',
                    [metric]: 5000,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, dateIndex, timestampIndex],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: dateIndex, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: false,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: false,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dataValues: { row: number; col: number; value: unknown }[] =
                [];
            worksheet!.eachRow((row, rowNum) => {
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    dataValues.push({
                        row: rowNum,
                        col: colNum,
                        value: cell.value,
                    });
                });
            });

            // Col 1 = date index — should have Date objects in data rows
            const col1Dates = dataValues.filter(
                (v) => v.col === 1 && v.value instanceof Date,
            );
            expect(col1Dates.length).toBeGreaterThanOrEqual(1);

            // Col 2 = timestamp index — now uses raw values directly,
            // so timestamps are correctly converted to Date objects.
            const col2Dates = dataValues.filter(
                (v) => v.col === 2 && v.value instanceof Date,
            );
            expect(col2Dates.length).toBeGreaterThanOrEqual(1);

            // Metric columns (col 3+) should NOT have Date objects
            const metricDateValues = dataValues.filter(
                (v) => v.col > 2 && v.value instanceof Date,
            );
            expect(metricDateValues).toHaveLength(0);
        });

        it('TC3: should not convert metric label or value columns with metricsAsRows: true', async () => {
            const pivotDimension = 'payments_payment_method';
            const dateIndex = 'customers_created_month';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [dateIndex]: {
                    name: 'created_month',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created month',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    hidden: false,
                    sql: '${TABLE}.created_month',
                },
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: '2023-01-01',
                    [metric]: 202811,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: '2023-01-01',
                    [metric]: 5000,
                },
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: '2023-02-01',
                    [metric]: 141312,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: '2023-02-01',
                    [metric]: 3000,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, dateIndex],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: dateIndex, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: true,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: false,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dataValues: { row: number; col: number; value: unknown }[] =
                [];
            worksheet!.eachRow((row, rowNum) => {
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    dataValues.push({
                        row: rowNum,
                        col: colNum,
                        value: cell.value,
                    });
                });
            });

            // With metricsAsRows, layout is: [date index] [metric label] [value cols...]
            // Only col 1 (date index) should have Date objects
            const dateCells = dataValues.filter((v) => v.value instanceof Date);
            dateCells.forEach((cell) => {
                expect(cell.col).toBe(1);
            });

            // Metric value cells (col 2+) should NOT be Date objects
            const nonCol1Dates = dataValues.filter(
                (v) => v.col > 1 && v.value instanceof Date,
            );
            expect(nonCol1Dates).toHaveLength(0);
        });

        it('TC4: should preserve invalid date strings in date-typed index columns', async () => {
            const pivotDimension = 'payments_payment_method';
            const dateIndex = 'customers_created_month';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [dateIndex]: {
                    name: 'created_month',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created month',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    hidden: false,
                    sql: '${TABLE}.created_month',
                },
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: '2023-01-01',
                    [metric]: 100,
                },
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: 'N/A',
                    [metric]: 200,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: '2023-01-01',
                    [metric]: 300,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: 'N/A',
                    [metric]: 400,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, dateIndex],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: dateIndex, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: false,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: false,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dataValues: { row: number; col: number; value: unknown }[] =
                [];
            worksheet!.eachRow((row, rowNum) => {
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    dataValues.push({
                        row: rowNum,
                        col: colNum,
                        value: cell.value,
                    });
                });
            });

            // Valid date should be converted
            const dateCells = dataValues.filter((v) => v.value instanceof Date);
            expect(dateCells.length).toBeGreaterThanOrEqual(1);

            // "N/A" is formatted to "NaT" by formatDate() before the pivot
            // runs. The strict ISO 8601 check correctly rejects "NaT", so
            // the value stays as a string — no Invalid Date is created.
            const natCells = dataValues.filter((v) => v.value === 'NaT');
            expect(natCells.length).toBeGreaterThanOrEqual(1);
            natCells.forEach((cell) => {
                expect(cell.value).not.toBeInstanceOf(Date);
            });
        });

        it('TC6: should not convert any values to Date when onlyRaw is true', async () => {
            const pivotDimension = 'payments_payment_method';
            const dateIndex = 'customers_created_month';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [dateIndex]: {
                    name: 'created_month',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created month',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                    hidden: false,
                    sql: '${TABLE}.created_month',
                } as Dimension,
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [dateIndex]: '2023-01-01',
                    [metric]: 100,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [dateIndex]: '2023-01-01',
                    [metric]: 200,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, dateIndex],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: dateIndex, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: false,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: true,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dateCells: unknown[] = [];
            worksheet!.eachRow((row) => {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    if (cell.value instanceof Date) {
                        dateCells.push(cell.value);
                    }
                });
            });

            expect(dateCells).toHaveLength(0);
        });

        it('TC8: should not convert date columns with WEEK timeframe to Date objects', async () => {
            const pivotDimension = 'payments_payment_method';
            const weekIndex = 'customers_created_week';
            const metric = 'payments_total_revenue';

            const itemMap: ItemsMap = {
                [pivotDimension]: {
                    name: 'payment_method',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Payment method',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    hidden: false,
                    sql: '${TABLE}.payment_method',
                },
                [weekIndex]: {
                    name: 'created_week',
                    table: 'customers',
                    tableLabel: 'Customers',
                    label: 'Created week',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.WEEK,
                    hidden: false,
                    sql: '${TABLE}.created_week',
                } as Dimension,
                [metric]: {
                    name: 'total_revenue',
                    table: 'payments',
                    tableLabel: 'Payments',
                    label: 'Total revenue',
                    fieldType: FieldType.METRIC,
                    type: DimensionType.NUMBER,
                    hidden: false,
                    sql: 'SUM(${TABLE}.amount)',
                },
            };

            const rows = [
                {
                    [pivotDimension]: 'credit_card',
                    [weekIndex]: '2023-01-02',
                    [metric]: 100,
                },
                {
                    [pivotDimension]: 'bank_transfer',
                    [weekIndex]: '2023-01-02',
                    [metric]: 200,
                },
            ];

            const metricQuery = {
                exploreName: 'payments',
                dimensions: [pivotDimension, weekIndex],
                metrics: [metric],
                filters: {},
                sorts: [{ fieldId: weekIndex, descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            };

            const pivotConfig = {
                pivotDimensions: [pivotDimension],
                metricsAsRows: false,
            };

            const buffer = await ExcelService.downloadPivotTableXlsx({
                rows,
                itemMap,
                metricQuery,
                pivotConfig,
                onlyRaw: false,
                customLabels: undefined,
                maxColumnLimit: 60,
                pivotDetails: null,
                enableImprovedExcelDates: true,
            });

            const workbook = new (await import('exceljs')).Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Pivot Table');
            expect(worksheet).toBeDefined();

            const dateCells: unknown[] = [];
            worksheet!.eachRow((row) => {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    if (cell.value instanceof Date) {
                        dateCells.push(cell.value);
                    }
                });
            });

            // WEEK is a non-native timeframe, so timeIntervalToExcelNumFmt
            // returns null → no date conversion should happen
            expect(dateCells).toHaveLength(0);
        });
    });

    describe('format expression integration', () => {
        it('should properly use getFormatExpression for legacy formats', () => {
            // Test that getFormatExpression converts legacy 'usd' to proper Excel format
            const usdField = mockItemMapWithFormats.number_with_usd_format;
            const formatExpression = getFormatExpression(usdField);

            // Should convert legacy 'usd' format to Excel format expression
            expect(formatExpression).toBeTruthy();
            expect(typeof formatExpression).toBe('string');
        });

        it('should handle direct format expressions', () => {
            // Test that getFormatExpression passes through direct format expressions
            const percentField =
                mockItemMapWithFormats.number_with_custom_format;
            const formatExpression = getFormatExpression(percentField);

            // Should return the direct format expression
            expect(formatExpression).toBe('0.00%');
        });

        it('should return default format for number fields without explicit format which keeps up to 3 decimal places', () => {
            // Test that getFormatExpression returns default format for number fields without explicit format
            const noFormatField = mockItemMapWithFormats.number_without_format;
            const formatExpression = getFormatExpression(noFormatField);

            // Should return a default number format for fields without explicit format
            expect(formatExpression).toBe('#,##0.###');
        });

        it('should NOT return default format for date fields without explicit format', () => {
            // Test that getFormatExpression returns default format for date fields without explicit format
            const dateField = mockItemMapWithFormats.date_column;
            const formatExpression = getFormatExpression(dateField);

            // Should return a default date format for fields without explicit format
            expect(formatExpression).toBeUndefined();
        });

        it('should handle all Lightdash format expressions correctly', () => {
            // Test various format expressions from our mock data
            const testCases = [
                {
                    field: 'pounds_currency_rounded',
                    expectedFormat: '[$£]#,##0',
                },
                { field: 'dimension_rounded', expectedFormat: '0.00' },
                { field: 'compact_thousands', expectedFormat: '0," K"' },
                { field: 'compact_billions', expectedFormat: '0.00,,," B"' },
                { field: 'euro_currency', expectedFormat: '[$€-407] #,##0.00' },
                { field: 'basic_rounding', expectedFormat: '0' },
                { field: 'one_decimal', expectedFormat: '0.0' },
                {
                    field: 'date_with_custom_format',
                    expectedFormat: 'dd mmmm yyyy',
                },
                {
                    field: 'timestamp_with_custom_format',
                    expectedFormat: 'mm/dd/yyyy hh:mm',
                },
            ];

            testCases.forEach(({ field, expectedFormat }) => {
                const fieldData = mockItemMapWithFormats[field];
                const formatExpression = getFormatExpression(fieldData);
                expect(formatExpression).toBe(expectedFormat);
            });
        });
    });
});
