import { describe, expect, it } from 'vitest';
import { sameScreen, shiftMarks, type ScreenView } from './frameGeometry';
import { type CaptureMark } from './types';

const view = (change: Partial<ScreenView> = {}): ScreenView => ({
    tabUuid: 'tab-1',
    scroll: { x: 0, y: 200 },
    size: { width: 1200, height: 800 },
    epoch: 0,
    ...change,
});

describe('sameScreen', () => {
    it('the same tab at the same scroll is the same screen', () => {
        expect(sameScreen(view(), view())).toBe(true);
    });

    it('a few pixels of scroll is still the same screen', () => {
        expect(sameScreen(view(), view({ scroll: { x: 0, y: 203 } }))).toBe(
            true,
        );
    });

    it('a scrolled page is a different screen', () => {
        expect(sameScreen(view(), view({ scroll: { x: 0, y: 260 } }))).toBe(
            false,
        );
    });

    it('another tab is a different screen', () => {
        expect(sameScreen(view(), view({ tabUuid: 'tab-2' }))).toBe(false);
    });

    it('a resized region is a different screen', () => {
        expect(
            sameScreen(view(), view({ size: { width: 900, height: 800 } })),
        ).toBe(false);
    });

    it('replaced content is a different screen', () => {
        expect(sameScreen(view(), view({ epoch: 1 }))).toBe(false);
    });
});

describe('shiftMarks', () => {
    const mark = {
        number: 1,
        box: { x: 0.2, y: 0.4, width: 0.1, height: 0.1 },
        strokes: [{ points: [{ x: 0.2, y: 0.4 }] }],
    } as CaptureMark;

    it('moves the box and the ink together', () => {
        const [moved] = shiftMarks([mark], { x: 0, y: -0.1 });
        expect(moved.box.y).toBeCloseTo(0.3);
        expect(moved.box.width).toBe(0.1);
        expect(moved.strokes[0].points[0].y).toBeCloseTo(0.3);
    });

    it('leaves the marks alone when nothing moved', () => {
        const marks = [mark];
        expect(shiftMarks(marks, { x: 0, y: 0 })).toBe(marks);
    });
});
