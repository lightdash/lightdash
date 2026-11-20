import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
} from './types';
import { useDesignMode } from './useDesignMode';

const startVoice = vi.fn();
const stopVoice = vi.fn();

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastError: vi.fn(),
        showToastWarning: vi.fn(),
    }),
}));

vi.mock('./useVoiceRecorder', () => ({
    useVoiceRecorder: () => ({
        start: startVoice,
        stop: stopVoice,
        listening: false,
        offReason: null,
    }),
}));

const grabDomFrame = vi.fn();
vi.mock('./domFrame', () => ({
    grabDomFrame: (...args: unknown[]) => grabDomFrame(...args),
}));

vi.mock('./composeImage', () => ({
    INK_COLOR: '#e03131',
    composeImage: vi.fn(async () => new File(['x'], 'capture-1.png')),
}));

const fakeFrame = () => ({
    bitmap: { close: vi.fn(), width: 100, height: 100 },
    thumb: new Uint8ClampedArray(16),
});

const transcribe = vi.fn();
const surface: DesignSurface = {
    getRegion: () => new DOMRect(0, 0, 100, 100),
    getScroll: () => ({ x: 0, y: 0 }),
    frameSource: 'dom',
    grabAppImage: null,
    getTab: () => null,
    resolveTarget: null,
    pickAt: null,
    transcribe: (audio) => transcribe(audio),
};

type Api = ReturnType<typeof useDesignMode>;
let api: Api;
const onSend = vi.fn<(payload: DesignPayload) => Promise<DesignSendResult>>();

const Harness: FC = () => {
    api = useDesignMode(surface, { onSend });
    return <>{api.element}</>;
};

const keyDown = (init: KeyboardEventInit) =>
    act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', init));
    });
const keyUp = (init: KeyboardEventInit) =>
    act(async () => {
        window.dispatchEvent(new KeyboardEvent('keyup', init));
    });

const holdLayer = () => {
    const layer = document.querySelector('[data-holding="true"]');
    if (!layer) throw new Error('No ink layer taking the pointer');
    return layer;
};

const drawMark = async () => {
    await keyDown({ key: 'Alt', altKey: true });
    fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(holdLayer(), { clientX: 70, clientY: 20 });
    await keyUp({ key: 'Alt' });
};

const turnOn = async (mic = false) => {
    renderWithProviders(<Harness />);
    await act(async () => {
        api.setOn(true);
        api.setMicOn(mic);
    });
};

describe('useDesignMode', () => {
    beforeEach(() => {
        startVoice.mockReset();
        stopVoice.mockReset();
        grabDomFrame.mockReset();
        transcribe.mockReset();
        onSend.mockReset();
        startVoice.mockResolvedValue('on');
        stopVoice.mockResolvedValue(null);
        grabDomFrame.mockImplementation(async () => fakeFrame());
        transcribe.mockResolvedValue([]);
        onSend.mockResolvedValue({ threadId: 't1', agentUuid: 'a1' });
    });

    it('pressing Option does not grab the page; releasing after drawing does', async () => {
        await turnOn();
        await keyDown({ key: 'Alt', altKey: true });
        expect(api.holding).toBe('stylus');
        fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        expect(grabDomFrame).not.toHaveBeenCalled();

        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(grabDomFrame).toHaveBeenCalledTimes(1);
        expect(api.holding).toBe(null);
    });

    it('an empty hold never opens a bubble', async () => {
        await turnOn();
        await keyDown({ key: 'Alt', altKey: true });
        await keyUp({ key: 'Alt' });
        await act(async () => {});
        expect(api.session.bubbles).toHaveLength(0);
        expect(grabDomFrame).not.toHaveBeenCalled();
    });

    it('with the mic on, recording starts on the first press and Stop sends the words', async () => {
        stopVoice.mockResolvedValue({
            audio: new Blob(['audio'], { type: 'audio/webm' }),
            startedAtMs: performance.now(),
        });
        transcribe.mockResolvedValue([
            { startMs: 0, endMs: 300, text: 'make' },
            { startMs: 300, endMs: 600, text: 'this' },
            { startMs: 600, endMs: 900, text: 'blue' },
        ]);
        await turnOn(true);

        await keyDown({ key: 'Alt', altKey: true });
        expect(startVoice).toHaveBeenCalledTimes(1);
        fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const [bubble] = api.session.bubbles;
        expect(bubble.input).toBe('mic');

        await act(async () => {
            api.stop(bubble.id);
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        const [payload] = onSend.mock.calls[0];
        expect(payload.bubbleId).toBe(bubble.id);
        expect(payload.summary).toContain('make this blue');
        expect(payload.marks).toHaveLength(1);
        expect(payload.images).toHaveLength(1);
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
    });

    it('mic denied falls back to the text box', async () => {
        startVoice.mockResolvedValue('off');
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(api.session.bubbles[0].input).toBe('text');
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('nothing to send is never sent', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, '');
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
        expect(onSend).toHaveBeenCalledTimes(1);

        // A reply by mic with no marks and no words.
        await act(async () => {
            api.arm(id, 'mic');
        });
        expect(startVoice).toHaveBeenCalledTimes(1);
        await act(async () => {
            api.stop(id);
        });
        await act(async () => {});
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('while a hold is down, bubbles stop taking the pointer', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const bubble = () => document.querySelector('[data-passthrough]');
        expect(bubble()).toHaveAttribute('data-passthrough', 'false');

        await keyDown({ key: 'Alt', altKey: true });
        expect(bubble()).toHaveAttribute('data-passthrough', 'true');
        await keyUp({ key: 'Alt' });
        expect(bubble()).toHaveAttribute('data-passthrough', 'false');
    });

    it('typing Option+e in the bubble text box cancels the hold and keeps the character', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const textbox = screen.getByRole('textbox');
        textbox.focus();

        fireEvent.keyDown(textbox, { key: 'Alt', altKey: true });
        expect(api.holding).toBe('stylus');
        const kept = fireEvent.keyDown(textbox, { key: 'e', altKey: true });
        expect(kept).toBe(true);
        expect(api.holding).toBe(null);

        fireEvent.keyUp(textbox, { key: 'e', altKey: true });
        fireEvent.keyUp(textbox, { key: 'Alt' });
        await act(async () => {});
        expect(grabDomFrame).toHaveBeenCalledTimes(1);
        expect(api.session.bubbles).toHaveLength(1);
    });

    it('a Control hold picks the element under the pointer, once', async () => {
        const target = { kind: 'tile', id: 't1', label: 'Revenue' };
        surface.pickAt = () => ({
            target,
            rect: new DOMRect(10, 20, 30, 40),
        });
        try {
            await turnOn();
            await keyDown({ key: 'Control', ctrlKey: true });
            expect(api.holding).toBe('cursor');
            const menu = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
            });
            window.dispatchEvent(menu);
            expect(menu.defaultPrevented).toBe(true);

            fireEvent.mouseDown(holdLayer(), { clientX: 20, clientY: 30 });
            fireEvent.mouseDown(holdLayer(), { clientX: 25, clientY: 35 });
            await keyUp({ key: 'Control' });
            await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
            const capture = api.session.bubbles[0].collection?.capture;
            expect(capture).toMatchObject({
                marks: [
                    {
                        shape: 'pick',
                        tool: 'cursor',
                        target,
                        box: {
                            x: expect.closeTo(0.1),
                            y: expect.closeTo(0.2),
                            width: expect.closeTo(0.3),
                            height: expect.closeTo(0.4),
                        },
                    },
                ],
            });
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        } finally {
            surface.pickAt = null;
        }
    });
});
