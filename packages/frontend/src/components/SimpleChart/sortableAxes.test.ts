import { describe, expect, it } from 'vitest';
import { withSortableAxes } from './sortableAxes';

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
