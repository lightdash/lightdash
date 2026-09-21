import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VizContextProvider, useVizContext } from './vizContext';

const VIZ_CONTEXT_MESSAGE = 'lightdash:sdk:data-app-viz-context';
const VIZ_RENDERED_MESSAGE = { type: 'lightdash:sdk:viz-rendered' };

const contextMessage = (renderId?: string) => ({
    type: VIZ_CONTEXT_MESSAGE,
    fieldMapping: {},
    rows: [],
    ...(renderId === undefined ? {} : { renderId }),
});

const sendContext = (renderId?: string) => {
    window.dispatchEvent(
        new MessageEvent('message', {
            data: contextMessage(renderId),
            source: window,
        }),
    );
};

function ContextConsumer() {
    useVizContext();
    return null;
}

describe('viz context paint acknowledgement', () => {
    let root: Root | undefined;
    let container: HTMLDivElement | undefined;
    let frames: FrameRequestCallback[];
    let postMessage: ReturnType<typeof vi.spyOn> | undefined;
    let requestAnimationFrame: ReturnType<typeof vi.spyOn> | undefined;
    let cancelAnimationFrame: ReturnType<typeof vi.spyOn> | undefined;

    const mount = async (withProvider: boolean) => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root?.render(
                withProvider
                    ? createElement(
                          VizContextProvider,
                          null,
                          createElement(ContextConsumer),
                      )
                    : createElement(ContextConsumer),
            );
        });
    };

    const runNextFrame = async () => {
        const frame = frames.shift();
        expect(frame).toBeDefined();
        await act(async () => frame?.(0));
    };

    afterEach(async () => {
        await act(async () => root?.unmount());
        container?.remove();
        postMessage?.mockRestore();
        requestAnimationFrame?.mockRestore();
        cancelAnimationFrame?.mockRestore();
    });

    it('acknowledges a provider context after two frames, without a duplicate consumer signal', async () => {
        frames = [];
        postMessage = vi.spyOn(window.parent, 'postMessage');
        requestAnimationFrame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frames.push(callback);
                return frames.length;
            });
        cancelAnimationFrame = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockImplementation(() => {});

        await mount(true);
        postMessage.mockClear();

        await act(async () => sendContext());
        expect(postMessage).not.toHaveBeenCalled();

        await runNextFrame();
        expect(postMessage).not.toHaveBeenCalled();

        await runNextFrame();
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(VIZ_RENDERED_MESSAGE, '*');
    });

    it('acknowledges standalone useVizContext after two frames', async () => {
        frames = [];
        postMessage = vi.spyOn(window.parent, 'postMessage');
        requestAnimationFrame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frames.push(callback);
                return frames.length;
            });
        cancelAnimationFrame = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockImplementation(() => {});

        await mount(false);
        postMessage.mockClear();
        await act(async () => sendContext());

        await runNextFrame();
        expect(postMessage).not.toHaveBeenCalled();
        await runNextFrame();
        expect(postMessage).toHaveBeenCalledWith(VIZ_RENDERED_MESSAGE, '*');
    });

    it('cancels a pending acknowledgement when the context changes or unmounts', async () => {
        frames = [];
        postMessage = vi.spyOn(window.parent, 'postMessage');
        requestAnimationFrame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frames.push(callback);
                return frames.length;
            });
        cancelAnimationFrame = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockImplementation(() => {});

        await mount(true);
        postMessage.mockClear();
        await act(async () => sendContext());
        await runNextFrame();
        await act(async () => sendContext());

        expect(cancelAnimationFrame).toHaveBeenCalled();
        await act(async () => root?.unmount());
        root = undefined;

        for (const frame of frames) {
            await act(async () => frame(0));
        }
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('acknowledges only the latest render identity after a context replacement', async () => {
        frames = [];
        postMessage = vi.spyOn(window.parent, 'postMessage');
        requestAnimationFrame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frames.push(callback);
                return frames.length;
            });
        cancelAnimationFrame = vi
            .spyOn(window, 'cancelAnimationFrame')
            .mockImplementation(() => {});

        await mount(true);
        postMessage.mockClear();
        await act(async () => sendContext('context-a'));
        await runNextFrame();

        await act(async () => sendContext('context-b'));
        await runNextFrame();
        await runNextFrame();
        await runNextFrame();

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(
            { type: 'lightdash:sdk:viz-rendered', renderId: 'context-b' },
            '*',
        );
    });
});
