import { describe, expect, it } from 'vitest';
import {
    Frequency,
    getFrequencyCronExpression,
    getWeekdaysCronExpression,
    mapCronExpressionToFrequency,
} from './cronInputUtils';

describe('cronInputUtils', () => {
    describe('mapCronExpressionToFrequency', () => {
        it('maps monday to friday expressions to weekdays', () => {
            expect(mapCronExpressionToFrequency('0 9 * * 1-5')).toEqual(
                Frequency.WEEKDAYS,
            );
            expect(mapCronExpressionToFrequency('30 7 * * 1,2,3,4,5')).toEqual(
                Frequency.WEEKDAYS,
            );
        });

        it('keeps existing presets unchanged', () => {
            expect(mapCronExpressionToFrequency('0 * * * *')).toEqual(
                Frequency.HOURLY,
            );
            expect(mapCronExpressionToFrequency('0 9 * * *')).toEqual(
                Frequency.DAILY,
            );
            expect(mapCronExpressionToFrequency('0 9 * * 1')).toEqual(
                Frequency.WEEKLY,
            );
            expect(mapCronExpressionToFrequency('0 9 1 * *')).toEqual(
                Frequency.MONTHLY,
            );
            expect(mapCronExpressionToFrequency('0 9 * * 2-6')).toEqual(
                Frequency.CUSTOM,
            );
        });
    });

    describe('getWeekdaysCronExpression', () => {
        it('builds a monday to friday expression', () => {
            expect(getWeekdaysCronExpression(30, 9)).toEqual('30 9 * * 1-5');
        });
    });

    describe('getFrequencyCronExpression', () => {
        it('keeps the time when switching to weekdays', () => {
            expect(
                getFrequencyCronExpression(Frequency.WEEKDAYS, '15 8 * * *'),
            ).toEqual('15 8 * * 1-5');
        });
    });
});
