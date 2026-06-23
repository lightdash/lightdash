import { DateGranularity } from '../types/timeFrames';
import {
    getReservedParameterDefinitions,
    getReservedParameterNames,
    getShadowedReservedNames,
    isReservedParameterName,
    mergeReservedDefinitions,
    mergeReservedNames,
    mergeReservedValues,
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

    describe('collision precedence (user wins)', () => {
        describe('getShadowedReservedNames', () => {
            it('returns reserved names taken by a user parameter', () => {
                expect(
                    getShadowedReservedNames(['region', 'date_zoom']),
                ).toEqual(['date_zoom']);
            });

            it('returns nothing when there is no collision', () => {
                expect(getShadowedReservedNames(['region', 'status'])).toEqual(
                    [],
                );
            });
        });

        describe('mergeReservedNames', () => {
            it('appends reserved names not already taken (deduped)', () => {
                expect(mergeReservedNames(['region'])).toEqual([
                    'region',
                    'date_zoom',
                ]);
            });

            it('keeps the user name once on collision (no duplicate)', () => {
                const merged = mergeReservedNames(['date_zoom', 'region']);
                expect(merged).toEqual(['date_zoom', 'region']);
                expect(merged.filter((n) => n === 'date_zoom')).toHaveLength(1);
            });
        });

        describe('mergeReservedDefinitions', () => {
            it('lets the user definition shadow the reserved one', () => {
                const userDef = { label: 'My date zoom', default: 'custom' };
                const merged = mergeReservedDefinitions({ date_zoom: userDef });
                expect(merged.date_zoom).toEqual(userDef);
            });

            it('keeps the reserved definition when not shadowed', () => {
                const merged = mergeReservedDefinitions({
                    region: { label: 'Region' },
                });
                expect(merged.region).toBeDefined();
                expect(merged.date_zoom.label).toBe('Date zoom');
            });
        });

        describe('mergeReservedValues', () => {
            it('lets the user value shadow the reserved value', () => {
                const merged = mergeReservedValues(
                    { date_zoom: 'custom' },
                    { date_zoom: 'week' },
                );
                expect(merged.date_zoom).toBe('custom');
            });

            it('keeps the reserved value when not shadowed', () => {
                const merged = mergeReservedValues(
                    { region: 'US' },
                    { date_zoom: 'week' },
                );
                expect(merged.region).toBe('US');
                expect(merged.date_zoom).toBe('week');
            });
        });
    });
});
