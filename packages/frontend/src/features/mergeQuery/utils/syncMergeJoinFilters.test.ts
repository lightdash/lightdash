import {
    FilterOperator,
    getTotalFilterRules,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applySharedJoinFilters,
    syncMergeJoinFilters,
} from './syncMergeJoinFilters';

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

describe('applySharedJoinFilters', () => {
    const shared = filters(rule('shared-a', 'a_date'));
    const sharedB = filters(rule('shared-b', 'b_date'));
    const parts = (c: string | null) => [
        { fieldIdBySourceId: { a: 'a_date', b: 'b_date', c } },
    ];

    it('applies the shared join-key filters to a source once it is mapped', () => {
        const before = { a: shared, b: sharedB, c: {} };
        const result = applySharedJoinFilters({
            filtersBySourceId: before,
            previousParts: parts(null),
            joinParts: parts('c_date'),
        });

        expect(fieldIds(result.c)).toEqual(['c_date']);
        expect(result.a).toBe(before.a);
        expect(result.b).toBe(before.b);
    });

    it('moves the shared filters to a source new key field and keeps its own', () => {
        const before = {
            a: shared,
            b: sharedB,
            c: filters(rule('copy', 'c_date'), rule('own', 'c_status')),
        };
        const result = applySharedJoinFilters({
            filtersBySourceId: before,
            previousParts: parts('c_date'),
            joinParts: parts('c_created'),
        });

        expect(fieldIds(result.c).sort()).toEqual(['c_created', 'c_status']);
    });

    it('keeps every source filters when a key part is removed', () => {
        const before = {
            a: filters(rule('date', 'a_date'), rule('status', 'a_status')),
            b: filters(rule('date', 'b_date'), rule('status', 'b_status')),
        };
        const result = applySharedJoinFilters({
            filtersBySourceId: before,
            previousParts: [
                { fieldIdBySourceId: { a: 'a_date', b: 'b_date' } },
                { fieldIdBySourceId: { a: 'a_status', b: 'b_status' } },
            ],
            joinParts: [{ fieldIdBySourceId: { a: 'a_date', b: 'b_date' } }],
        });

        expect(result).toBe(before);
    });

    it('applies the shared filters across sources of the same explore', () => {
        const repeated = (c: string | null) => [
            {
                fieldIdBySourceId: {
                    a: 'payments_date',
                    b: 'payments_date',
                    c,
                },
            },
        ];
        const result = applySharedJoinFilters({
            filtersBySourceId: {
                a: filters(rule('shared', 'payments_date')),
                b: filters(rule('shared', 'payments_date')),
                c: filters(rule('own', 'payments_status')),
            },
            previousParts: repeated(null),
            joinParts: repeated('payments_date'),
        });

        expect(fieldIds(result.c).sort()).toEqual([
            'payments_date',
            'payments_status',
        ]);
    });

    it('leaves a newly mapped source alone when nothing is shared yet', () => {
        const before = {
            a: filters(rule('own', 'a_status')),
            b: {},
            c: filters(rule('own', 'c_date')),
        };
        const result = applySharedJoinFilters({
            filtersBySourceId: before,
            previousParts: parts(null),
            joinParts: parts('c_date'),
        });

        expect(result).toBe(before);
    });
});
