import { describe, expect, it } from 'vitest';
import {
    getAxisFields,
    isCategoryAxis,
    withSortableAxes,
} from './sortableAxes';

describe('withSortableAxes', () => {
    it('makes each axis with a field clickable and marks the sorted title', () => {
        const result = withSortableAxes(
            {
                xAxis: [{ name: 'Status' }],
                yAxis: [{ name: 'Revenue' }, { name: 'Orders' }],
            },
            { xAxis: ['status'], yAxis: ['revenue', 'orders'] },
            { fieldId: 'orders', descending: true },
        );
        expect(result.xAxis).toEqual([{ name: 'Status', triggerEvent: true }]);
        expect(result.yAxis).toEqual([
            { name: 'Revenue', triggerEvent: true },
            { name: 'Orders ↓', triggerEvent: true },
        ]);
    });

    it('keeps an untitled axis clickable and leaves a fieldless one alone', () => {
        const result = withSortableAxes(
            { xAxis: [{}], yAxis: [{ name: 'Revenue' }] },
            { xAxis: ['status'], yAxis: [undefined] },
            { fieldId: 'status', descending: false },
        );
        expect(result.xAxis).toEqual([{ name: undefined, triggerEvent: true }]);
        expect(result.yAxis).toEqual([{ name: 'Revenue' }]);
    });
});

describe('getAxisFields', () => {
    const layout = { xField: 'status', yField: ['revenue', 'orders'] };
    const series = (field: string, yAxisIndex?: number) => ({
        yAxisIndex,
        encode: { yRef: { field } },
    });

    it('puts the dimension on the bottom and the metric on the left', () => {
        expect(getAxisFields(layout, [series('revenue')])).toEqual({
            xAxis: ['status'],
            yAxis: ['revenue', undefined],
        });
    });

    it('gives the right-hand axis the first series drawn against it', () => {
        expect(
            getAxisFields(layout, [series('revenue'), series('orders', 1)]),
        ).toEqual({ xAxis: ['status'], yAxis: ['revenue', 'orders'] });
    });

    it('swaps the axes for a horizontal chart', () => {
        expect(
            getAxisFields({ ...layout, flipAxes: true }, [
                series('revenue'),
                series('orders', 1),
            ]),
        ).toEqual({ xAxis: ['revenue', 'orders'], yAxis: ['status'] });
    });

    it('falls back to the first y field before series are configured', () => {
        expect(getAxisFields(layout, undefined)).toEqual({
            xAxis: ['status'],
            yAxis: ['revenue', undefined],
        });
    });
});

describe('isCategoryAxis', () => {
    it('is true only for a category axis, where row order shows', () => {
        expect(isCategoryAxis({ type: 'category' })).toBe(true);
        expect(isCategoryAxis({ type: 'time' })).toBe(false);
        expect(isCategoryAxis({ type: 'value' })).toBe(false);
        expect(isCategoryAxis(undefined)).toBe(false);
    });
});
