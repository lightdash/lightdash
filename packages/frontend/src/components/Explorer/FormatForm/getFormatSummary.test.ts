import {
    Compact,
    CustomFormatType,
    NumberSeparator,
    TimeFrames,
    type CustomFormat,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { describeCustomFormat, getFormatTypeLabel } from './getFormatSummary';

describe('getFormatTypeLabel', () => {
    it.each([
        [CustomFormatType.DEFAULT, 'Default'],
        [CustomFormatType.PERCENT, 'Percent'],
        [CustomFormatType.CURRENCY, 'Currency'],
        [CustomFormatType.NUMBER, 'Number'],
        [CustomFormatType.ID, 'ID'],
        [CustomFormatType.DATE, 'Date'],
        [CustomFormatType.TIMESTAMP, 'Timestamp'],
        [CustomFormatType.BYTES_SI, 'Bytes (SI)'],
        [CustomFormatType.BYTES_IEC, 'Bytes (IEC)'],
        [CustomFormatType.CUSTOM, 'Custom'],
    ])('describes %s', (type, expected) => {
        expect(getFormatTypeLabel(type)).toBe(expected);
    });
});

describe('describeCustomFormat', () => {
    it('describes every numeric option', () => {
        const format: CustomFormat = {
            type: CustomFormatType.NUMBER,
            round: 0,
            compact: Compact.THOUSANDS,
            separator: NumberSeparator.PERIOD_COMMA,
            prefix: '~',
            suffix: ' km',
        };

        expect(describeCustomFormat(format)).toBe(
            'Number, 0 decimals, thousands (k), separator 100.000,00, prefix ~, suffix km',
        );
    });

    it('describes currency, custom expression, and date interval details', () => {
        expect(
            describeCustomFormat({
                type: CustomFormatType.CURRENCY,
                currency: 'GBP',
            }),
        ).toBe('Currency (GBP)');
        expect(
            describeCustomFormat({
                type: CustomFormatType.CUSTOM,
                custom: '#,##0.0',
            }),
        ).toBe('Custom (#,##0.0)');
        expect(
            describeCustomFormat({
                type: CustomFormatType.TIMESTAMP,
                timeInterval: TimeFrames.MONTH,
            }),
        ).toBe('Timestamp, Month');
    });
});
