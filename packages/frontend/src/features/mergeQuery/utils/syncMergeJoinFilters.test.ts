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

const joinParts = [{ fieldA: 'a_customer_id', fieldB: 'b_customer_id' }];

describe('syncMergeJoinFilters', () => {
    it('mirrors a join-key filter to the other query', () => {
        const result = syncMergeJoinFilters({
            changedSide: 'a',
            filtersA: filters(rule('shared', 'a_customer_id')),
            filtersB: {},
            joinParts,
        });

        expect(fieldIds(result.filtersA)).toEqual(['a_customer_id']);
        expect(fieldIds(result.filtersB)).toEqual(['b_customer_id']);
    });

    it('keeps query-specific filters while replacing shared filters', () => {
        const result = syncMergeJoinFilters({
            changedSide: 'a',
            filtersA: {},
            filtersB: filters(
                rule('old-shared', 'b_customer_id'),
                rule('specific', 'b_status'),
            ),
            joinParts,
        });

        expect(fieldIds(result.filtersB)).toEqual(['b_status']);
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
            changedSide: 'a',
            filtersA: { dimensions },
            filtersB: {},
            joinParts,
        });

        expect(result.filtersB.dimensions).toMatchObject({
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

    it('mirrors in either direction', () => {
        const result = syncMergeJoinFilters({
            changedSide: 'b',
            filtersA: {},
            filtersB: filters(rule('shared', 'b_customer_id')),
            joinParts,
        });

        expect(fieldIds(result.filtersA)).toEqual(['a_customer_id']);
    });
});
