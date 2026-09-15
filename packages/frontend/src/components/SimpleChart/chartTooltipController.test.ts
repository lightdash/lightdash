import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createChartTooltipController } from './chartTooltipController';

const setup = () => {
    let nextId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    const actions: Record<string, unknown>[] = [];
    const focus: (string | null)[] = [];
    const controller = createChartTooltipController<string>({
        dispatchAction: (action) => actions.push(action),
        formatItem: (item) => `item:${item}`,
        focusItem: (item) => focus.push(item),
        containsPoint: (point) => point.y <= 100,
        projectAxisPoint: (point) =>
            point.y > 100 ? { x: point.x, y: 50 } : null,
        requestFrame: (callback) => {
            nextId += 1;
            frames.set(nextId, callback);
            return nextId;
        },
        cancelFrame: (id) => frames.delete(id),
    });
    const flush = () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(0));
    };
    return { controller, actions, focus, frames, flush };
};

describe('chart tooltip pointer interaction', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    test('coalesces rapid segment transitions into the latest tooltip each frame', () => {
        const { controller, actions, frames, flush } = setup();
        controller.setItem('High');
        controller.move({ x: 10, y: 10 });
        controller.setItem(null);
        controller.setItem('Low');
        controller.move({ x: 20, y: 20 });
        expect(frames.size).toBe(1);
        expect(actions).toEqual([]);
        flush();
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({ type: 'showTip', x: 20, y: 20 });
        expect((actions[0].tooltip as { content: string }).content).toBe(
            'item:Low',
        );
    });

    test('keeps the segment tooltip while crossing whitespace to the next bar', () => {
        const { controller, actions, flush } = setup();
        controller.setItem('High');
        controller.move({ x: 20, y: 20 });
        flush();
        controller.setItem(null);
        controller.move({ x: 20, y: 30 });
        flush();
        controller.setItem('Very high');
        controller.move({ x: 20, y: 40 });
        flush();
        expect(actions).toMatchObject([
            { type: 'showTip', tooltip: { content: 'item:High' } },
            { type: 'showTip', tooltip: { content: 'item:High' } },
            { type: 'showTip', tooltip: { content: 'item:Very high' } },
        ]);
        vi.advanceTimersByTime(200);
        expect(actions).toHaveLength(3);
    });

    test('resting in whitespace restores the category and clears controlled series focus', () => {
        const { controller, actions, focus, flush } = setup();
        controller.setItem('High');
        controller.move({ x: 20, y: 20 });
        flush();
        controller.setItem(null);
        controller.move({ x: 21, y: 20 });
        flush();
        expect(actions.at(-1)).toHaveProperty('tooltip');
        expect(focus.at(-1)).toBe('High');
        vi.advanceTimersByTime(120);
        expect(focus.at(-1)).toBeNull();
        expect(actions.at(-1)).toEqual({ type: 'showTip', x: 21, y: 20 });
    });

    test('projects axis-label hover into the plot for a full category tooltip', () => {
        const { controller, actions, flush } = setup();
        controller.setItem('High');
        controller.setItem(null);
        controller.move({ x: 20, y: 120 });
        flush();
        expect(actions).toEqual([{ type: 'showTip', x: 20, y: 50 }]);
        vi.advanceTimersByTime(200);
        expect(actions).toHaveLength(1);
    });

    test('leaving cancels pending work and clears the axis pointer', () => {
        const { controller, actions, flush } = setup();
        controller.setItem('High');
        controller.move({ x: 20, y: 20 });
        controller.setItem(null);
        controller.leave();
        flush();
        vi.advanceTimersByTime(200);
        expect(actions).toEqual([
            { type: 'updateAxisPointer', currTrigger: 'leave' },
            { type: 'hideTip' },
        ]);
        controller.move({ x: 40, y: 40 });
        flush();
        expect(actions).toHaveLength(2);
    });

    test('disposing cancels pending pointer work', () => {
        const { controller, actions, flush } = setup();
        controller.move({ x: 20, y: 20 });
        controller.setItem('High');
        controller.setItem(null);
        controller.dispose();
        flush();
        vi.advanceTimersByTime(200);
        expect(actions).toEqual([]);
    });
});
