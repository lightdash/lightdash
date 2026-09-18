import {
    DimensionType,
    FieldType,
    TimeFrames,
    type Dimension,
} from '@lightdash/common';
import { rankJoinFieldCandidates } from './rankJoinFieldCandidates';

const dimension = (
    table: string,
    name: string,
    type: DimensionType,
    overrides: Partial<Dimension> = {},
): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name
        .split('_')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' '),
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
    ...overrides,
});

const sku = dimension('reviews', 'sku', DimensionType.STRING);
const returnsSku = dimension('returns', 'sku', DimensionType.STRING);
const productKey = dimension('returns', 'product_key', DimensionType.STRING, {
    label: 'SKU',
});
const reason = dimension('returns', 'reason', DimensionType.STRING);
const customerName = dimension('customers', 'name', DimensionType.STRING);
const refundedAt = dimension('returns', 'refunded_at', DimensionType.DATE, {
    timeInterval: TimeFrames.DAY,
});
const amount = dimension('returns', 'amount', DimensionType.NUMBER);

describe('rankJoinFieldCandidates', () => {
    it('suggests the same name first, then the same label', () => {
        const { suggested } = rankJoinFieldCandidates(
            [customerName, reason, productKey, returnsSku],
            sku,
        );

        expect(suggested).toEqual([returnsSku, productKey]);
    });

    it('rules out fields of another kind of value', () => {
        const { incompatible } = rankJoinFieldCandidates(
            [returnsSku, refundedAt, amount],
            sku,
        );

        expect(incompatible).toEqual([refundedAt, amount]);
    });

    it('rules out a date at another grain', () => {
        const orderedAtMonth = dimension(
            'orders',
            'ordered_at',
            DimensionType.DATE,
            { timeInterval: TimeFrames.MONTH },
        );
        const refundedAtMonth = dimension(
            'returns',
            'refunded_at',
            DimensionType.DATE,
            { timeInterval: TimeFrames.MONTH },
        );

        const { suggested, incompatible } = rankJoinFieldCandidates(
            [refundedAt, refundedAtMonth],
            orderedAtMonth,
        );

        expect(incompatible).toEqual([refundedAt]);
        expect(suggested).toEqual([]);
    });

    it('ranks nothing without a counterpart', () => {
        expect(rankJoinFieldCandidates([returnsSku], undefined)).toEqual({
            suggested: [],
            incompatible: [],
        });
    });
});
