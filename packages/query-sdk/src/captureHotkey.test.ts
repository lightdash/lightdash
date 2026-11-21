import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CAPTURE_HOLD_MESSAGE,
    CAPTURE_HOTKEY_MESSAGE,
    mountCaptureHotkey,
} from './captureHotkey';

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => {
    const event = new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    document.body.dispatchEvent(event);
    return event;
};

const press = (init: KeyboardEventInit): KeyboardEvent => key('keydown', init);
const release = (init: KeyboardEventInit): KeyboardEvent => key('keyup', init);

describe('mountCaptureHotkey', () => {
    let cleanup: () => void = () => {};

    const mount = () => {
        const postMessage = vi.fn();
        cleanup = mountCaptureHotkey({ postMessage } as unknown as Window);
        return postMessage;
    };

    afterEach(() => {
        cleanup();
    });

    it('forwards ctrl+shift+X to the host', () => {
        const postMessage = mount();
        press({ key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true });
        expect(postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: CAPTURE_HOTKEY_MESSAGE },
            '*',
        );
    });

    it('forwards cmd+shift+X to the host', () => {
        const postMessage = mount();
        press({ key: 'X', code: 'KeyX', metaKey: true, shiftKey: true });
        expect(postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: CAPTURE_HOTKEY_MESSAGE },
            '*',
        );
    });

    it('matches the physical X key on layouts that type another character', () => {
        const postMessage = mount();
        press({ key: '≈', code: 'KeyX', metaKey: true, shiftKey: true });
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps the browser from also handling the combination', () => {
        mount();
        const event = press({
            key: 'X',
            code: 'KeyX',
            ctrlKey: true,
            shiftKey: true,
        });
        expect(event.defaultPrevented).toBe(true);
    });

    it('sends nothing for any other key press', () => {
        const postMessage = mount();
        const others: KeyboardEventInit[] = [
            { key: 'x', code: 'KeyX' },
            { key: 'X', code: 'KeyX', shiftKey: true },
            { key: 'x', code: 'KeyX', ctrlKey: true },
            { key: 'x', code: 'KeyX', metaKey: true },
            {
                key: 'X',
                code: 'KeyX',
                ctrlKey: true,
                shiftKey: true,
                altKey: true,
            },
            { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true },
            { key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true },
            { key: 'Shift', code: 'ShiftLeft', shiftKey: true },
            { key: 'Enter', code: 'Enter' },
            { key: 'a', code: 'KeyA' },
        ];
        const events = others.map(press);
        expect(postMessage).not.toHaveBeenCalled();
        expect(events.some((event) => event.defaultPrevented)).toBe(false);
    });

    it('sends once while the keys are held down', () => {
        const postMessage = mount();
        const held = { key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true };
        press(held);
        press({ ...held, repeat: true });
        press({ ...held, repeat: true });
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('carries nothing about the key press in the message', () => {
        const postMessage = mount();
        press({ key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true });
        expect(Object.keys(postMessage.mock.calls[0][0])).toEqual(['type']);
    });

    it('stops forwarding once unmounted', () => {
        const postMessage = mount();
        cleanup();
        press({ key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true });
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('keeps one listener per bundle when mounted twice', () => {
        const first = mount();
        const second = mount();
        press({ key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true });
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('Option hold is forwarded down and up', () => {
        const postMessage = mount();
        const down = press({ key: 'Alt', code: 'AltLeft', altKey: true });
        release({ key: 'Alt', code: 'AltLeft' });
        expect(postMessage.mock.calls).toEqual([
            [{ type: CAPTURE_HOLD_MESSAGE, phase: 'down' }, '*'],
            [{ type: CAPTURE_HOLD_MESSAGE, phase: 'up' }, '*'],
        ]);
        // The app still gets the key: only the host is told.
        expect(down.defaultPrevented).toBe(false);
    });

    it('Control is not a hold key', () => {
        const postMessage = mount();
        press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
        release({ key: 'Control', code: 'ControlLeft' });
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('a hold key pressed with another modifier, or repeating, starts no hold', () => {
        const postMessage = mount();
        press({ key: 'Alt', altKey: true, shiftKey: true });
        press({ key: 'Alt', altKey: true, metaKey: true });
        press({ key: 'Alt', altKey: true, ctrlKey: true });
        press({ key: 'Control', ctrlKey: true, altKey: true });
        press({ key: 'Control', ctrlKey: true, shiftKey: true });
        press({ key: 'Alt', altKey: true, repeat: true });
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('a hold message says its phase, nothing else', () => {
        const postMessage = mount();
        press({ key: 'Alt', code: 'AltLeft', altKey: true });
        expect(Object.keys(postMessage.mock.calls[0][0]).sort()).toEqual([
            'phase',
            'type',
        ]);
    });
});
