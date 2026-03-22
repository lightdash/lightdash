import { FilterOperator } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildPivotFilters } from './pivotFilters';
import type { TopGroupTuple } from './types';

describe('buildPivotFilters', () => {
    describe('Other group tuple exclusion (De Morgan negation)', () => {
        it('builds exclusion filters for multi-pivot Other tuples', () => {
            const topGroupTuples: TopGroupTuple[] = [
                { country: 'US', channel: 'Paid' },
                { country: 'CA', channel: 'Organic' },
            ];

            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        {
                            field: 'country',
                            value: 'Other',
                            isOtherGroup: true,
                        },
                        {
                            field: 'channel',
                            value: 'Other',
                            isOtherGroup: true,
                        },
                    ],
                },
                topGroupTuples,
            });

            // 2 tuple exclusion groups (no non-Other equality filters)
            expect(result).toHaveLength(2);

            // First tuple: NOT (country=US AND channel=Paid)
            const tuple1 = result[0] as {
                or: Array<{
                    target: { fieldId: string };
                    operator: string;
                    values: unknown[];
                }>;
            };
            expect('or' in tuple1).toBe(true);
            expect(tuple1.or).toHaveLength(2);
            expect(tuple1.or[0].target.fieldId).toBe('country');
            expect(tuple1.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
            expect(tuple1.or[0].values).toEqual(['US']);
            expect(tuple1.or[1].target.fieldId).toBe('channel');
            expect(tuple1.or[1].operator).toBe(FilterOperator.NOT_EQUALS);
            expect(tuple1.or[1].values).toEqual(['Paid']);
        });

        it('handles null tuple values with NOT_NULL operator', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        {
                            field: 'region',
                            value: 'Other',
                            isOtherGroup: true,
                        },
                    ],
                },
                topGroupTuples: [{ region: null }],
            });

            expect(result).toHaveLength(1);
            const tuple = result[0] as {
                or: Array<{
                    operator: string;
                    values?: unknown[];
                }>;
            };
            expect(tuple.or[0].operator).toBe(FilterOperator.NOT_NULL);
            expect(tuple.or[0].values).toBeUndefined();
        });

        it('includes non-Other pivot values as equality filters alongside exclusions', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        {
                            field: 'country',
                            value: 'Other',
                            isOtherGroup: true,
                        },
                        {
                            field: 'channel',
                            value: 'Paid',
                        },
                    ],
                },
                topGroupTuples: [{ country: 'US' }],
            });

            // 1 tuple exclusion + 1 equality filter for non-Other pivot
            expect(result).toHaveLength(2);

            // First: exclusion
            const exclusion = result[0] as {
                or: Array<{
                    operator: string;
                    values: unknown[];
                }>;
            };
            expect('or' in exclusion).toBe(true);
            expect(exclusion.or[0].operator).toBe(FilterOperator.NOT_EQUALS);

            // Second: equality for channel=Paid
            const equality = result[1] as {
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            };
            expect(equality.target.fieldId).toBe('channel');
            expect(equality.operator).toBe(FilterOperator.EQUALS);
            expect(equality.values).toEqual(['Paid']);
        });
    });

    describe('non-Other path', () => {
        it('produces equality filters for standard pivot values', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [{ field: 'region', value: 'US' }],
                },
            });

            expect(result).toHaveLength(1);
            const filter = result[0] as {
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            };
            expect(filter.operator).toBe(FilterOperator.EQUALS);
            expect(filter.values).toEqual(['US']);
        });

        it('handles null pivot values with NULL operator', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [{ field: 'region', value: null }],
                },
            });

            expect(result).toHaveLength(1);
            const filter = result[0] as {
                operator: string;
                values?: unknown[];
            };
            expect(filter.operator).toBe(FilterOperator.NULL);
            expect(filter.values).toBeUndefined();
        });

        it('returns contradiction filter when Other group has no topGroupTuples', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        {
                            field: 'region',
                            value: 'Other',
                            isOtherGroup: true,
                        },
                    ],
                },
            });

            expect(result).toHaveLength(2);
            const [nullFilter, notNullFilter] = result as Array<{
                target: { fieldId: string };
                operator: string;
            }>;
            expect(nullFilter.target.fieldId).toBe('region');
            expect(nullFilter.operator).toBe(FilterOperator.NULL);
            expect(notNullFilter.target.fieldId).toBe('region');
            expect(notNullFilter.operator).toBe(FilterOperator.NOT_NULL);
        });

        it('returns empty array when pivotValues is undefined', () => {
            const result = buildPivotFilters({
                pivotReference: {
                    field: 'revenue',
                },
            });

            expect(result).toHaveLength(0);
        });
    });
});
