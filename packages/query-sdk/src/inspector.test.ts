import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountInspector } from './inspector';

const postMessage = vi.fn();

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
        mountInspector({ postMessage } as unknown as Window);
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

    it('a Control click that opens the context menu picks the element once', () => {
        const el = button();
        mouse(el, 'pointerdown', { ctrlKey: true });
        const menu = mouse(el, 'contextmenu', { ctrlKey: true });
        // Some browsers follow the menu with a click, others do not.
        const click = mouse(el, 'click', { ctrlKey: true });

        expect(menu.defaultPrevented).toBe(true);
        expect(click.defaultPrevented).toBe(true);
        expect(selected()).toHaveLength(1);

        mouse(el, 'pointerdown');
        mouse(el, 'click');
        expect(selected()).toHaveLength(2);
    });

    it('leaves the context menu alone without Control, or when not inspecting', () => {
        const el = button();
        expect(mouse(el, 'contextmenu').defaultPrevented).toBe(false);
        setInspecting(false);
        expect(
            mouse(el, 'contextmenu', { ctrlKey: true }).defaultPrevented,
        ).toBe(false);
        expect(selected()).toEqual([]);
    });
});
