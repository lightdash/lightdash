import { describe, expect, it } from 'vitest';
import { getPivotColumnWindows } from './getPivotColumnWindow';

describe('pivot column window', () => {
    const window = {
        width: 1000,
        slots: [
            { index: 0, key: 'row-number', width: 40 },
            { index: 1, key: 'frozen-index', width: 80 },
            { key: 'leading-gap', width: 480 },
            { index: 6, key: 'visible-a', width: 100 },
            { index: 7, key: 'visible-b', width: 100 },
            { key: 'trailing-gap', width: 200 },
        ],
    };

    it('aligns index fields, data, and totals to the same physical columns across a spacer spanning two sections', () => {
        const sections = getPivotColumnWindows(window, {
            titleStart: 1,
            dataStart: 3,
            totalsStart: 9,
        });
        expect(sections.titles?.slots).toEqual([
            { index: 0, key: 'frozen-index', width: 80 },
            window.slots[2],
        ]);
        expect(sections.data?.slots).toEqual([
            { index: 3, key: 'visible-a', width: 100 },
            { index: 4, key: 'visible-b', width: 100 },
            window.slots[5],
        ]);
        expect(sections.totals?.slots).toEqual([]);
    });
});
