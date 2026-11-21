import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountInspector } from './inspector';

const postMessage = vi.fn();
const parent = { postMessage } as unknown as Window;

const setInspecting = (on: boolean) =>
    window.dispatchEvent(
        new MessageEvent('message', {
            data: {
                type: on
                    ? 'lightdash:inspect:enable'
                    : 'lightdash:inspect:disable',
            },
        }),
    );

const button = (): HTMLButtonElement => {
    const el = document.createElement('button');
    el.textContent = 'Save';
    el.getBoundingClientRect = () => new DOMRect(12, 34, 120, 40);
    document.body.appendChild(el);
    return el;
};

const mouse = (el: Element, type: string, init: MouseEventInit = {}) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    el.dispatchEvent(event);
    return event;
};

const selected = () =>
    postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === 'lightdash:inspect:selected');

describe('mountInspector', () => {
    beforeAll(() => {
        mountInspector(parent);
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        postMessage.mockClear();
        setInspecting(true);
    });

    it("selected event carries the element's rect", () => {
        mouse(button(), 'click');
        expect(selected()).toEqual([
            {
                type: 'lightdash:inspect:selected',
                label: '[button "Save"]',
                rect: { x: 12, y: 34, width: 120, height: 40 },
            },
        ]);
    });

    it('leaves the context menu alone, even with Control held', () => {
        const el = button();
        expect(mouse(el, 'contextmenu').defaultPrevented).toBe(false);
        expect(
            mouse(el, 'contextmenu', { ctrlKey: true }).defaultPrevented,
        ).toBe(false);
        expect(selected()).toEqual([]);
    });
});

describe('inspect-at', () => {
    const elementFromPoint = vi.fn<(x: number, y: number) => Element | null>();

    const ask = (data: Record<string, unknown>, source: unknown = parent) =>
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'lightdash:sdk:inspect-at', ...data },
                source: source as Window,
            }),
        );
    const answers = () =>
        postMessage.mock.calls
            .map(([message]) => message)
            .filter(
                (message) =>
                    message.type === 'lightdash:sdk:inspect-at-response',
            );

    beforeAll(() => {
        document.elementFromPoint = (x: number, y: number) =>
            elementFromPoint(x, y);
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        postMessage.mockClear();
        elementFromPoint.mockReset();
        // Inspect mode is the editor's picker; it is not needed to answer.
        setInspecting(false);
    });

    it('announces that it can answer', () => {
        mountInspector(parent);
        expect(postMessage).toHaveBeenCalledWith(
            { type: 'lightdash:sdk:inspect-at-available' },
            '*',
        );
    });

    it('answers with the label and rect a click would select', () => {
        const el = button();
        elementFromPoint.mockReturnValue(el);
        ask({ id: 'r1', x: 20, y: 40 });
        expect(elementFromPoint).toHaveBeenCalledWith(20, 40);
        expect(answers()).toEqual([
            {
                type: 'lightdash:sdk:inspect-at-response',
                id: 'r1',
                element: {
                    label: '[button "Save"]',
                    rect: { x: 12, y: 34, width: 120, height: 40 },
                },
            },
        ]);
    });

    it('answers null over nothing, or over the page background', () => {
        elementFromPoint.mockReturnValueOnce(null);
        ask({ id: 'r1', x: 1, y: 1 });
        elementFromPoint.mockReturnValueOnce(document.body);
        ask({ id: 'r2', x: 1, y: 1 });
        expect(answers()).toEqual([
            {
                type: 'lightdash:sdk:inspect-at-response',
                id: 'r1',
                element: null,
            },
            {
                type: 'lightdash:sdk:inspect-at-response',
                id: 'r2',
                element: null,
            },
        ]);
    });

    it('ignores asks from anyone but the host, and malformed asks', () => {
        elementFromPoint.mockReturnValue(button());
        ask({ id: 'r1', x: 20, y: 40 }, {});
        ask({ id: 'r2', x: '20', y: 40 });
        ask({ id: 'r3', x: Number.NaN, y: 40 });
        ask({ x: 20, y: 40 });
        ask({ id: 'x'.repeat(101), x: 20, y: 40 });
        expect(answers()).toEqual([]);
        expect(elementFromPoint).not.toHaveBeenCalled();
    });
});
