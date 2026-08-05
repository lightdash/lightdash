import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createDeliveryRenderStore,
    isDeliveryRender,
    mountDeliveryRender,
    resetDeliveryRenderState,
} from './deliveryRender';

describe('createDeliveryRenderStore', () => {
    it('defaults to false', () => {
        expect(createDeliveryRenderStore().getValue()).toBe(false);
    });

    it('notifies subscribers only when the value changes', () => {
        const store = createDeliveryRenderStore();
        const listener = vi.fn();
        store.subscribe(listener);

        store.setValue(true);
        store.setValue(true);
        expect(listener).toHaveBeenCalledTimes(1);

        store.setValue(false);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stops notifying after unsubscribe', () => {
        const store = createDeliveryRenderStore();
        const listener = vi.fn();
        store.subscribe(listener)();
        store.setValue(true);
        expect(listener).not.toHaveBeenCalled();
    });

    // The essence of useSyncExternalStore: subscribe() only registers future
    // notifications — a subscriber added after the value already changed
    // still reads the current value via getValue(), never a stale default.
    it('a subscriber added after the flag flips still reads the current value', () => {
        const store = createDeliveryRenderStore();
        store.setValue(true);
        const listener = vi.fn();
        store.subscribe(listener);
        expect(store.getValue()).toBe(true);
    });
});

describe('mountDeliveryRender', () => {
    let cleanup: () => void = () => {};

    const postToApp = (source: MessageEventSource | null, data: unknown) => {
        window.dispatchEvent(new MessageEvent('message', { data, source }));
    };

    afterEach(() => {
        cleanup();
        resetDeliveryRenderState();
    });

    it('defaults to false before any ready message arrives', () => {
        cleanup = mountDeliveryRender(window as unknown as Window);
        expect(isDeliveryRender()).toBe(false);
    });

    it('becomes true when the host announces ready with the flag', () => {
        const parent = window as unknown as Window;
        cleanup = mountDeliveryRender(parent);
        postToApp(parent as unknown as MessageEventSource, {
            type: 'lightdash:sdk:ready',
            deliveryRender: true,
        });
        expect(isDeliveryRender()).toBe(true);
    });

    it('stays false when ready arrives without the flag', () => {
        const parent = window as unknown as Window;
        cleanup = mountDeliveryRender(parent);
        postToApp(parent as unknown as MessageEventSource, {
            type: 'lightdash:sdk:ready',
        });
        expect(isDeliveryRender()).toBe(false);
    });

    // Late subscriber: a ready message that lands after mount still reaches
    // consumers reading the store afterwards — no stale default.
    it('a ready message arriving after mount updates a late reader', () => {
        const parent = window as unknown as Window;
        cleanup = mountDeliveryRender(parent);
        expect(isDeliveryRender()).toBe(false);
        postToApp(parent as unknown as MessageEventSource, {
            type: 'lightdash:sdk:ready',
            deliveryRender: true,
        });
        expect(isDeliveryRender()).toBe(true);
    });

    it('ignores ready messages from a window other than the host', () => {
        const parent = window as unknown as Window;
        cleanup = mountDeliveryRender(parent);
        postToApp(null, {
            type: 'lightdash:sdk:ready',
            deliveryRender: true,
        });
        expect(isDeliveryRender()).toBe(false);
    });

    it('does not stack listeners when mounted repeatedly', () => {
        const parent = window as unknown as Window;
        const addSpy = vi.spyOn(window, 'addEventListener');
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        mountDeliveryRender(parent);
        cleanup = mountDeliveryRender(parent);
        const messageListeners = (spy: typeof addSpy) =>
            spy.mock.calls.filter(([type]) => type === 'message').length;
        expect(messageListeners(addSpy)).toEqual(2);
        expect(messageListeners(removeSpy)).toEqual(1);
        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    it('stops updating after cleanup', () => {
        const parent = window as unknown as Window;
        const stop = mountDeliveryRender(parent);
        stop();
        postToApp(parent as unknown as MessageEventSource, {
            type: 'lightdash:sdk:ready',
            deliveryRender: true,
        });
        expect(isDeliveryRender()).toBe(false);
    });
});
