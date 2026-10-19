import {
    FilterOperator,
    getTotalFilterRules,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    deriveSharedJoinFilters,
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

describe('deriveSharedJoinFilters', () => {
    const shared = filters(rule('shared', 'a_date'));
    const chosen = (c: string | null) => [
        { fieldIdBySourceId: { a: 'a_date', b: 'b_date', c } },
    ];
    const effective = [
        { fieldIdBySourceId: { a: 'a_date', b: 'b_date', c: 'c_date' } },
    ];

    it('gives a source whose join field is filled in by default the shared filters', () => {
        const before = {
            a: shared,
            b: filters(rule('shared', 'b_date')),
            c: {},
        };
        const result = deriveSharedJoinFilters({
            filtersBySourceId: before,
            joinParts: chosen(null),
            effectiveParts: effective,
        });

        expect(fieldIds(result.c)).toEqual(['c_date']);
        expect(result.a).toBe(before.a);
        expect(result.b).toBe(before.b);
    });

    it('keeps a defaulted source filter already on its join field', () => {
        const before = {
            a: shared,
            c: filters(rule('own', 'c_date'), rule('status', 'c_status')),
        };
        const result = deriveSharedJoinFilters({
            filtersBySourceId: before,
            joinParts: chosen(null),
            effectiveParts: effective,
        });

        expect(result).toBe(before);
    });

    it('runs the same filters once the filters it gave are stored', () => {
        const derived = deriveSharedJoinFilters({
            filtersBySourceId: { a: shared, c: {} },
            joinParts: chosen(null),
            effectiveParts: effective,
        });

        expect(
            deriveSharedJoinFilters({
                filtersBySourceId: derived,
                joinParts: chosen(null),
                effectiveParts: effective,
            }),
        ).toBe(derived);
    });

    it('applies the shared filters across sources of the same explore', () => {
        const parts = [
            {
                fieldIdBySourceId: {
                    a: 'payments_date',
                    c: 'payments_date',
                },
            },
        ];
        const result = deriveSharedJoinFilters({
            filtersBySourceId: {
                a: filters(rule('shared', 'payments_date')),
                c: filters(rule('own', 'payments_status')),
            },
            joinParts: [{ fieldIdBySourceId: { a: 'payments_date', c: null } }],
            effectiveParts: parts,
        });

        expect(fieldIds(result.c).sort()).toEqual([
            'payments_date',
            'payments_status',
        ]);
    });

    it('leaves a defaulted source alone when nothing is shared', () => {
        const before = {
            a: filters(rule('own', 'a_status')),
            c: filters(rule('own', 'c_status')),
        };
        const result = deriveSharedJoinFilters({
            filtersBySourceId: before,
            joinParts: chosen(null),
            effectiveParts: effective,
        });

        expect(result).toBe(before);
    });

    it('keeps the filters it gave once they are stored and the key part is removed', () => {
        const parts = [
            ...effective,
            {
                fieldIdBySourceId: {
                    a: 'a_status',
                    b: 'b_status',
                    c: 'c_status',
                },
            },
        ];
        const stored = deriveSharedJoinFilters({
            filtersBySourceId: {
                a: shared,
                b: filters(rule('shared', 'b_date')),
                c: {},
            },
            joinParts: [chosen(null)[0], parts[1]],
            effectiveParts: parts,
        });
        const result = deriveSharedJoinFilters({
            filtersBySourceId: stored,
            joinParts: [parts[1]],
            effectiveParts: [parts[1]],
        });

        expect(result).toBe(stored);
        expect(fieldIds(result.c)).toEqual(['c_date']);
    });
});
