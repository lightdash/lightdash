import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    emitEvent,
    MAX_APP_EVENT_NAME_CHARS,
    MAX_APP_EVENT_PAYLOAD_CHARS,
} from './hostEvents';

const stubParent = () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { parent: { postMessage } });
    return postMessage;
};

describe('emitEvent', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('posts the name and payload to the parent frame', () => {
        const postMessage = stubParent();

        emitEvent('import-confirmed', { planId: 'p1', rows: [1, 2] });

        expect(postMessage).toHaveBeenCalledWith(
            {
                type: 'lightdash:sdk:app-event',
                name: 'import-confirmed',
                payload: { planId: 'p1', rows: [1, 2] },
            },
            '*',
        );
    });

    it('sends a null payload when none is given', () => {
        const postMessage = stubParent();

        emitEvent('opened');

        expect(postMessage.mock.calls[0][0].payload).toBeNull();
    });

    it('strips values that cannot cross postMessage', () => {
        const postMessage = stubParent();

        emitEvent('saved', { keep: 1, drop: () => undefined });

        expect(postMessage.mock.calls[0][0].payload).toEqual({ keep: 1 });
    });

    it('rejects an empty or over-long name', () => {
        const postMessage = stubParent();

        expect(() => emitEvent('  ')).toThrow(/non-empty event name/);
        expect(() =>
            emitEvent('x'.repeat(MAX_APP_EVENT_NAME_CHARS + 1)),
        ).toThrow(/over 100 characters/);
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('rejects a payload over the cap and points at external connections', () => {
        const postMessage = stubParent();

        expect(() =>
            emitEvent('big', { blob: 'x'.repeat(MAX_APP_EVENT_PAYLOAD_CHARS) }),
        ).toThrow(/external connection/);
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('rejects a payload that is not JSON-serializable', () => {
        stubParent();
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        expect(() => emitEvent('loop', circular)).toThrow(/JSON-serializable/);
    });

    it('does nothing when the app runs top-level', () => {
        const postMessage = vi.fn();
        const top = { postMessage } as unknown as Record<string, unknown>;
        top.parent = top;
        vi.stubGlobal('window', top);

        emitEvent('opened');

        expect(postMessage).not.toHaveBeenCalled();
    });
});
