import { describe, expect, it } from 'vitest';
import {
    BUBBLE_DRAG_ATTRIBUTE,
    clampDrag,
    dragStartsOn,
    wheelScrollsInside,
} from './bubblePointer';

const build = () => {
    const bubble = document.createElement('div');
    bubble.innerHTML = `
        <div ${BUBBLE_DRAG_ATTRIBUTE}>
            <span id="name">Agent</span>
            <button id="close"><svg id="icon"></svg></button>
        </div>
        <div id="list" style="overflow-y: auto"><p id="text">Reply</p></div>
        <textarea id="box"></textarea>`;
    document.body.append(bubble);
    return {
        bubble,
        get: (id: string) => bubble.querySelector(`#${id}`)!,
    };
};

describe('dragStartsOn', () => {
    it('the header drags, its buttons and the rest of the bubble do not', () => {
        const { bubble, get } = build();
        expect(dragStartsOn(get('name'), bubble)).toBe(true);
        expect(dragStartsOn(get('close'), bubble)).toBe(false);
        expect(dragStartsOn(get('icon'), bubble)).toBe(false);
        expect(dragStartsOn(get('text'), bubble)).toBe(false);
        expect(dragStartsOn(get('box'), bubble)).toBe(false);
    });

    it("another bubble's header does not drag this one", () => {
        const one = build();
        const other = build();
        expect(dragStartsOn(other.get('name'), one.bubble)).toBe(false);
    });
});

describe('clampDrag', () => {
    const viewport = new DOMRect(0, 0, 800, 600);
    const size = { width: 300, height: 200 };

    it('leaves a drop inside the viewport alone', () => {
        expect(clampDrag({ x: 100, y: 50 }, size, viewport, false)).toEqual({
            x: 100,
            y: 50,
        });
    });

    it('keeps the header within reach at every edge', () => {
        expect(clampDrag({ x: -900, y: -50 }, size, viewport, false)).toEqual({
            x: -220,
            y: 0,
        });
        expect(clampDrag({ x: 900, y: 900 }, size, viewport, false)).toEqual({
            x: 720,
            y: 560,
        });
    });
});

describe('clampDrag of a bubble that is part of the page', () => {
    it('keeps its whole width in view, so the page does not grow sideways', () => {
        const viewport = new DOMRect(0, 0, 800, 600);
        const size = { width: 300, height: 200 };
        expect(clampDrag({ x: -900, y: 50 }, size, viewport, true).x).toBe(0);
        expect(clampDrag({ x: 900, y: 50 }, size, viewport, true).x).toBe(500);
    });
});

describe('wheelScrollsInside', () => {
    const sized = (el: Element, scrollHeight: number, scrollTop: number) => {
        Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
        Object.defineProperty(el, 'clientHeight', { value: 100 });
        Object.defineProperty(el, 'scrollTop', { value: scrollTop });
    };

    it('lets the message list scroll while it has further to go', () => {
        const { bubble, get } = build();
        sized(get('list'), 400, 100);
        expect(wheelScrollsInside(get('text'), bubble, { x: 0, y: 30 })).toBe(
            true,
        );
        expect(wheelScrollsInside(get('text'), bubble, { x: 0, y: -30 })).toBe(
            true,
        );
    });

    it('at either end the wheel has nowhere to go inside the bubble', () => {
        const { bubble, get } = build();
        sized(get('list'), 400, 300);
        expect(wheelScrollsInside(get('text'), bubble, { x: 0, y: 30 })).toBe(
            false,
        );
        const top = build();
        sized(top.get('list'), 400, 0);
        expect(
            wheelScrollsInside(top.get('text'), top.bubble, { x: 0, y: -30 }),
        ).toBe(false);
    });

    it('over a part that does not scroll, nothing inside takes the wheel', () => {
        const { bubble, get } = build();
        expect(wheelScrollsInside(get('name'), bubble, { x: 0, y: 30 })).toBe(
            false,
        );
    });
});
