import { DateGranularity } from '../types/timeFrames';
import {
    getReservedParameterDefinitions,
    getReservedParameterNames,
    isReservedParameterName,
    resolveReservedParameterValues,
} from './reservedParameters';

describe('reservedParameters', () => {
    describe('isReservedParameterName', () => {
        it('returns true for a reserved name', () => {
            expect(isReservedParameterName('date_zoom')).toBe(true);
        });

        it('returns false for a non-reserved name', () => {
            expect(isReservedParameterName('region')).toBe(false);
            expect(isReservedParameterName('dateZoom')).toBe(false);
        });
    });

    describe('getReservedParameterNames', () => {
        it('includes date_zoom', () => {
            expect(getReservedParameterNames()).toContain('date_zoom');
        });
    });

    describe('getReservedParameterDefinitions', () => {
        it('exposes definitions without the resolver', () => {
            const definitions = getReservedParameterDefinitions();
            expect(definitions.date_zoom).toBeDefined();
            expect(definitions.date_zoom.label).toBe('Date zoom');
            expect('resolve' in definitions.date_zoom).toBe(false);
        });
    });

    describe('resolveReservedParameterValues', () => {
        it('resolves the selected granularity in lowercase', () => {
            const values = resolveReservedParameterValues({
                dateZoom: { granularity: DateGranularity.WEEK },
            });
            expect(values.date_zoom).toBe('week');
        });

        it('passes a custom granularity through in lowercase', () => {
            const values = resolveReservedParameterValues({
                dateZoom: { granularity: 'Fiscal Week' },
            });
            expect(values.date_zoom).toBe('fiscal week');
        });

        it('reflects the selected grain regardless of whether a date dimension is zoomed', () => {
            const values = resolveReservedParameterValues({
                dateZoom: { granularity: DateGranularity.MONTH },
            });
            expect(values.date_zoom).toBe('month');
        });

        it('resolves to empty string when there is no date zoom', () => {
            const values = resolveReservedParameterValues({
                dateZoom: undefined,
            });
            expect(values.date_zoom).toBe('');
        });
    });
});
