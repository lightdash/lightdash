import { describe, expect, it } from 'vitest';
import { describeShift, pickComparedMetrics } from './metricComparison';

const reference = (name: string) => ['$', '{', name, '}'].join('');

const metrics = [
    { name: 'total', sql: 'COUNT(*)' },
    { name: 'rate', sql: `${reference('succeeded')} / ${reference('total')}` },
    { name: 'succeeded', sql: 'COUNT(ok)' },
    { name: 'internal', sql: 'COUNT(*)', hidden: true },
];

const names = (picked: { name: string }[]) => picked.map(({ name }) => name);

describe('pickComparedMetrics', () => {
    it('compares a changed metric and the metrics built from it', () => {
        expect(
            names(pickComparedMetrics(metrics, new Set(['total']), false)),
        ).toEqual(['total', 'rate']);
    });

    it('compares every visible metric of a new model', () => {
        expect(names(pickComparedMetrics(metrics, new Set(), true))).toEqual([
            'total',
            'rate',
            'succeeded',
        ]);
    });

    it('compares nothing when no metric changed', () => {
        expect(pickComparedMetrics(metrics, new Set(), false)).toEqual([]);
    });
});

describe('describeShift', () => {
    it('gives the change as a signed percentage', () => {
        expect(describeShift(63382, 61806)).toBe('-2.5%');
        expect(describeShift('100', '150')).toBe('+50%');
    });

    it('says nothing when the number did not move or cannot be compared', () => {
        expect(describeShift(5, 5)).toBeNull();
        expect(describeShift(0, 5)).toBeNull();
        expect(describeShift('a', 5)).toBeNull();
    });
});
