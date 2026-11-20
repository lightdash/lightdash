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
let scroll = { x: 0, y: 0 };
const surface: DesignSurface = {
    getRegion: () => new DOMRect(0, 0, 100, 100),
    getScroll: () => scroll,
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
    api = useDesignMode(surface, { onSend, renderBubbleBody: null });
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
        scroll = { x: 0, y: 0 };
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

    it('an empty hold that ends before the mic starts still stops it, before the next start', async () => {
        let started: (state: 'on' | 'off') => void = () => {};
        startVoice.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    started = resolve;
                }),
        );
        await turnOn(true);
        await keyDown({ key: 'Alt', altKey: true });
        await keyUp({ key: 'Alt' });
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).not.toHaveBeenCalled();

        // The next bubble's mic waits for the first one to be stopped.
        await drawMark();
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).not.toHaveBeenCalled();

        await act(async () => {
            started('on');
        });
        await waitFor(() => expect(startVoice).toHaveBeenCalledTimes(2));
        expect(stopVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice.mock.invocationCallOrder[0]).toBeLessThan(
            startVoice.mock.invocationCallOrder[1],
        );
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(api.session.bubbles[0].input).toBe('mic');
        expect(stopVoice).toHaveBeenCalledTimes(1);
    });

    it('arming a bubble that is still collecting does not start the mic', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.arm(id, 'mic');
        });
        expect(startVoice).not.toHaveBeenCalled();
        expect(api.session.bubbles[0].input).toBe('text');
    });

    it('switching an armed reply from mic to text stops its recording', async () => {
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

        await act(async () => {
            api.arm(id, 'mic');
        });
        expect(startVoice).toHaveBeenCalledTimes(1);
        await act(async () => {
            api.arm(id, 'text');
        });
        expect(stopVoice).toHaveBeenCalledTimes(1);
        expect(api.session.bubbles[0].input).toBe('text');
    });

    it('Esc while a bubble is being sent keeps the bubble and Design Mode', async () => {
        let sent: (result: DesignSendResult) => void = () => {};
        onSend.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    sent = resolve;
                }),
        );
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'hello');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        expect(api.session.bubbles[0].status).toBe('sending');

        await keyDown({ key: 'Escape' });
        await keyUp({ key: 'Escape' });
        expect(api.on).toBe(true);
        expect(api.session.bubbles).toHaveLength(1);
        expect(api.session.bubbles[0].status).toBe('sending');

        await act(async () => {
            sent({ threadId: 't1', agentUuid: 'a1' });
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
        expect(api.session.bubbles[0].threadId).toBe('t1');
    });

    it("a cancelled reply drops the reply and keeps the thread's bubble", async () => {
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

        onSend.mockResolvedValueOnce('cancelled');
        await act(async () => {
            api.arm(id, 'text');
        });
        await act(async () => {
            api.send(id, 'one more thing');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(api.session.active).toEqual({ kind: 'page' }),
        );
        expect(api.session.bubbles).toHaveLength(1);
        expect(api.session.bubbles[0]).toMatchObject({
            id,
            status: 'thread',
            threadId: 't1',
            collection: null,
        });
        expect(api.session.bubbles[0].sentMarks).toHaveLength(1);
    });

    it('a failed send keeps the spoken words for the retry', async () => {
        stopVoice.mockResolvedValue({
            audio: new Blob(['audio'], { type: 'audio/webm' }),
            startedAtMs: performance.now(),
        });
        transcribe.mockResolvedValue([
            { startMs: 0, endMs: 300, text: 'make' },
            { startMs: 300, endMs: 600, text: 'this' },
            { startMs: 600, endMs: 900, text: 'blue' },
        ]);
        onSend.mockRejectedValueOnce(new Error('offline'));
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        expect(api.session.bubbles[0].input).toBe('mic');

        await act(async () => {
            api.stop(id);
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(api.session.bubbles[0]).toMatchObject({
                status: 'collecting',
                input: 'text',
            }),
        );

        await act(async () => {
            api.send(id, '');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
        const [retry] = onSend.mock.calls[1];
        expect(retry.transcript).toEqual(onSend.mock.calls[0][0].transcript);
        expect(retry.transcript.length).toBeGreaterThan(0);
        expect(retry.summary).toContain('make this blue');
        expect(retry.marks).toHaveLength(1);
        expect(retry.images).toHaveLength(1);
        expect(stopVoice).toHaveBeenCalledTimes(1);
        expect(transcribe).toHaveBeenCalledTimes(1);
    });

    it('the toolbar shows the hold hints and its close button leaves Design Mode', async () => {
        await turnOn();
        expect(screen.getByText('Hold ⌥')).toBeInTheDocument();
        expect(screen.getByText('Hold ⌃')).toBeInTheDocument();
        await keyDown({ key: 'Alt', altKey: true });
        expect(document.querySelector('[data-tool="stylus"]')).toHaveAttribute(
            'data-active',
            'true',
        );
        await keyUp({ key: 'Alt' });

        fireEvent.click(screen.getByRole('button', { name: 'Mic' }));
        expect(api.micOn).toBe(true);
        fireEvent.click(
            screen.getByRole('button', { name: 'Leave Design Mode' }),
        );
        expect(api.on).toBe(false);
    });

    it('a bubble and its mark sit beside each other and move with scroll', async () => {
        await turnOn();
        expect(document.querySelector('[data-bubble-id]')).toBeNull();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const bubble = () =>
            document.querySelector('[data-bubble-id]') as HTMLElement;
        const badge = () =>
            document.querySelector('[data-mark-number="1"]') as HTMLElement;
        const px = (el: HTMLElement, name: string) =>
            parseFloat(el.style.getPropertyValue(name));
        const bubbleTop = px(bubble(), '--bubble-top');
        const badgeTop = px(badge(), '--mark-top');
        // The pointer ended on the mark's right with no room on its left.
        expect(px(bubble(), '--bubble-left')).toBeGreaterThan(70);
        expect(screen.getByText('①')).toBeInTheDocument();

        scroll = { x: 0, y: 12 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
        });
        expect(px(bubble(), '--bubble-top')).toBe(bubbleTop - 12);
        expect(px(badge(), '--mark-top')).toBe(badgeTop - 12);

        await act(async () => {
            api.close(api.session.bubbles[0].id);
        });
        expect(document.querySelector('[data-mark-number]')).toBeNull();
    });

    it('a scroll between release and the frame landing keeps the bubble beside its mark', async () => {
        const px = (name: string, selector: string) =>
            parseFloat(
                (
                    document.querySelector(selector) as HTMLElement
                ).style.getPropertyValue(name),
            );
        const gap = () =>
            px('--bubble-top', '[data-bubble-id]') -
            px('--mark-top', '[data-mark-number="1"]');
        const drawAt = async (top: number) => {
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: top });
            fireEvent.mouseMove(holdLayer(), {
                clientX: 40,
                clientY: top + 30,
            });
            fireEvent.mouseMove(holdLayer(), {
                clientX: 70,
                clientY: top + 10,
            });
            await keyUp({ key: 'Alt' });
        };

        // A mark low enough that the bubble is not held in by the top margin.
        await turnOn();
        await drawAt(40);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const still = gap();
        await act(async () => {
            api.close(api.session.bubbles[0].id);
        });
        expect(api.session.bubbles).toHaveLength(0);

        // The page scrolls up by 30 while the frame is being grabbed, so
        // this mark ends at the same place on screen as the one above.
        let land: (frame: ReturnType<typeof fakeFrame>) => void = () => {};
        grabDomFrame.mockImplementation(
            () =>
                new Promise((resolve) => {
                    land = resolve;
                }),
        );
        scroll = { x: 0, y: 50 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
        });
        await drawAt(10);
        expect(api.session.bubbles).toHaveLength(0);
        scroll = { x: 0, y: 20 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
            land(fakeFrame());
        });
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(px('--mark-top', '[data-mark-number="1"]')).toBe(40);
        expect(gap()).toBe(still);
    });

    it('a mark drawn close to the open bubble moves the bubble out of the way', async () => {
        const rects = vi
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockImplementation(function rectOf(this: HTMLElement) {
                if (!this.hasAttribute('data-bubble-id')) return new DOMRect();
                return new DOMRect(
                    parseFloat(this.style.getPropertyValue('--bubble-left')),
                    parseFloat(this.style.getPropertyValue('--bubble-top')),
                    320,
                    140,
                );
            });
        try {
            await turnOn();
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
            const first = api.session.bubbles[0].anchor;

            // Far from the bubble: it stays put.
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseMove(holdLayer(), { clientX: 5, clientY: 60 });
            fireEvent.mouseMove(holdLayer(), { clientX: 20, clientY: 90 });
            await keyUp({ key: 'Alt' });
            await waitFor(() =>
                expect(screen.getByText('②')).toBeInTheDocument(),
            );
            expect(api.session.bubbles[0].anchor).toEqual(first);

            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseMove(holdLayer(), { clientX: 80, clientY: 10 });
            fireEvent.mouseMove(holdLayer(), { clientX: 99, clientY: 40 });
            await keyUp({ key: 'Alt' });
            await waitFor(() =>
                expect(screen.getByText('③')).toBeInTheDocument(),
            );
            expect(api.session.bubbles[0].anchor.x).toBeGreaterThan(first.x);
        } finally {
            rects.mockRestore();
        }
    });

    it('a sent bubble shows the body the page gives it', async () => {
        const Body: FC = () => {
            api = useDesignMode(surface, {
                onSend,
                renderBubbleBody: (bubble) => (
                    <span>thread {bubble.threadId}</span>
                ),
            });
            return <>{api.element}</>;
        };
        renderWithProviders(<Body />);
        await act(async () => {
            api.setOn(true);
        });
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'make this green' },
        });
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        await waitFor(() =>
            expect(screen.getByText('thread t1')).toBeInTheDocument(),
        );
        expect(onSend.mock.calls[0][0].summary).toContain('make this green');
    });
});
