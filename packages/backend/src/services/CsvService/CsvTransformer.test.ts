import moment from 'moment';
import { itemMap } from './CsvService.mock';
import { CsvTransformer } from './CsvTransformer';

describe('CsvTransformer', () => {
    describe('convertRowToCsv', () => {
        it('Should convert rows to csv', async () => {
            const row = {
                column_number: 1,
                column_string: `value_1`,
                column_date: '2020-03-16T11:32:55.000Z',
            };

            const csv = CsvTransformer.convertRowToCsv(row, itemMap, false, [
                'column_number',
                'column_string',
                'column_date',
            ]);

            expect(csv).toEqual(['$1.00', 'value_1', '2020-03-16']);
        });

        it('Should convert RAW rows to csv', async () => {
            const row = {
                column_number: 1,
                column_string: `value_1`,
                column_date: '2020-03-16T11:32:55.000Z',
            };

            const csv = CsvTransformer.convertRowToCsv(row, itemMap, true, [
                'column_number',
                'column_string',
                'column_date',
            ]);

            expect(csv).toEqual([1, 'value_1', '2020-03-16']);
        });

        it('Should convert with row with null date', async () => {
            const row = {
                column_number: 1,
                column_string: `value_1`,
                column_date: null,
            };

            const csv = CsvTransformer.convertRowToCsv(row, itemMap, false, [
                'column_number',
                'column_string',
                'column_date',
            ]);

            expect(csv).toEqual(['$1.00', 'value_1', null]);
        });

        it('Should convert with row with undefined value', async () => {
            const row = {
                column_number: undefined,
                column_string: `value_1`,
                column_date: '2020-03-16T11:32:55.000Z',
            };

            const csv = CsvTransformer.convertRowToCsv(row, itemMap, false, [
                'column_number',
                'column_string',
                'column_date',
            ]);

            expect(csv).toEqual([undefined, 'value_1', '2020-03-16']);
        });

        it('Should preserve milliseconds when converting timestamp rows to csv', async () => {
            const row = {
                column_number: 1,
                column_string: `value_1`,
                column_timestamp: '2020-03-16T11:32:55.123Z',
            };

            const csv = CsvTransformer.convertRowToCsv(row, itemMap, false, [
                'column_number',
                'column_string',
                'column_timestamp',
            ]);

            expect(csv).toEqual([
                '$1.00',
                'value_1',
                '2020-03-16 11:32:55.123',
            ]);
        });
    });

    describe('escapeCsvValue', () => {
        it('Should escape CSV values correctly', () => {
            expect(CsvTransformer.escapeCsvValue('normal text')).toBe(
                '"normal text"',
            );
            expect(CsvTransformer.escapeCsvValue('text with "quotes"')).toBe(
                '"text with ""quotes"""',
            );
            expect(CsvTransformer.escapeCsvValue(null)).toBe('');
            expect(CsvTransformer.escapeCsvValue(undefined)).toBe('');
            expect(CsvTransformer.escapeCsvValue(123)).toBe('"123"');
            expect(CsvTransformer.escapeCsvValue('')).toBe('""');
        });
    });

    describe('processJsonLineToCsv', () => {
        it('Should process valid JSON line to CSV', () => {
            const jsonLine = JSON.stringify({
                column_number: 1,
                column_string: 'test',
                column_date: '2020-03-16T11:32:55.000Z',
            });

            const result = CsvTransformer.processJsonLineToCsv(
                jsonLine,
                itemMap,
                false,
                ['column_number', 'column_string', 'column_date'],
            );

            expect(result).toBe('"$1.00","test","2020-03-16"');
        });

        it('Should return null for empty lines', () => {
            const result = CsvTransformer.processJsonLineToCsv(
                '',
                itemMap,
                false,
                ['column_number'],
            );

            expect(result).toBeNull();
        });

        it('Should return null for invalid JSON', () => {
            const result = CsvTransformer.processJsonLineToCsv(
                'invalid json',
                itemMap,
                false,
                ['column_number'],
            );

            expect(result).toBeNull();
        });
    });
});
