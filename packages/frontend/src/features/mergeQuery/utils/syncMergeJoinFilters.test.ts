import {
    FilterOperator,
    getTotalFilterRules,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { syncMergeJoinFilters } from './syncMergeJoinFilters';

const rule = (id: string, fieldId: string): FilterRule => ({
    id,
    target: { fieldId },
    operator: FilterOperator.EQUALS,
    values: [1],
});

const filters = (...rules: FilterRule[]): Filters => ({
    dimensions: { id: 'root', and: rules },
});

const fieldIds = (value: Filters) =>
    getTotalFilterRules(value).map((item) => item.target.fieldId);

const joinParts = [
    {
        fieldIdBySourceId: {
            a: 'a_customer_id',
            b: 'b_customer_id',
            c: 'c_customer_id',
        },
    },
];

describe('syncMergeJoinFilters', () => {
    it('mirrors a join-key filter to every other source', () => {
        const result = syncMergeJoinFilters({
            changedSourceId: 'a',
            filtersBySourceId: {
                a: filters(rule('shared', 'a_customer_id')),
                b: {},
                c: {},
            },
            joinParts,
        });

        expect(fieldIds(result.a)).toEqual(['a_customer_id']);
        expect(fieldIds(result.b)).toEqual(['b_customer_id']);
        expect(fieldIds(result.c)).toEqual(['c_customer_id']);
    });

    it('keeps source-specific filters while replacing shared filters', () => {
        const result = syncMergeJoinFilters({
            changedSourceId: 'a',
            filtersBySourceId: {
                a: {},
                b: filters(
                    rule('old-shared', 'b_customer_id'),
                    rule('specific', 'b_status'),
                ),
            },
            joinParts,
        });

        expect(fieldIds(result.b)).toEqual(['b_status']);
    });

    it('preserves nested boolean structure for shared filters', () => {
        const dimensions: FilterGroup = {
            id: 'outer',
            or: [
                rule('first', 'a_customer_id'),
                {
                    id: 'nested',
                    and: [rule('second', 'a_customer_id')],
                },
            ],
        };
        const result = syncMergeJoinFilters({
            changedSourceId: 'a',
            filtersBySourceId: { a: { dimensions }, b: {} },
            joinParts,
        });

        expect(result.b.dimensions).toMatchObject({
            id: 'outer',
            or: [
                { target: { fieldId: 'b_customer_id' } },
                {
                    id: 'nested',
                    and: [{ target: { fieldId: 'b_customer_id' } }],
                },
            ],
        });
    });

    it('mirrors in any direction', () => {
        const result = syncMergeJoinFilters({
            changedSourceId: 'b',
            filtersBySourceId: {
                a: {},
                b: filters(rule('shared', 'b_customer_id')),
            },
            joinParts,
        });

        expect(fieldIds(result.a)).toEqual(['a_customer_id']);
    });
});
