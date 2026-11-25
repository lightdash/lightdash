import { AI_THREAD_IMAGES_MAX_PER_PROMPT as CAP } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type FC } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    type CaptureMark,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
    type TranscriptWord,
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

const grabAppFrame = vi.fn();
vi.mock('./appFrame', () => ({
    grabAppFrame: (...args: unknown[]) => grabAppFrame(...args),
}));

const composeImage = vi.fn(
    async (_input: { frame: unknown; marks: CaptureMark[]; index: number }) =>
        new File(['x'], 'capture-1.png'),
);
vi.mock('./composeImage', () => ({
    INK_COLOR: '#e03131',
    composeImage: (...args: Parameters<typeof composeImage>) =>
        composeImage(...args),
}));

const fakeFrame = () => ({
    bitmap: { close: vi.fn(), width: 100, height: 100 },
});

const transcribe = vi.fn();
let scroll = { x: 0, y: 0 };
// Null: the surface scrolls on its own and the layers are shifted to follow.
let scrollContainer: HTMLElement | null = null;
let tab: { uuid: string; name: string } | null = null;
const surface: DesignSurface = {
    getRegion: () => new DOMRect(0, 0, 100, 100),
    getScroll: () => scroll,
    getScrollContainer: () => scrollContainer,
    frameSource: 'dom',
    grabAppImage: null,
    watchScroll: null,
    getTab: () => tab,
    resolveTarget: null,
    pickAt: null,
    transcribe: (audio) => transcribe(audio),
};

type Api = ReturnType<typeof useDesignMode>;
let api: Api;
const onSend = vi.fn<(payload: DesignPayload) => Promise<DesignSendResult>>();

type Picker = { bubbleId: string; cancel: () => void };
let showPicker: (picker: Picker | null) => void = () => {};
const cancelSend = vi.fn<(bubbleId: string) => void>();
const onBubbleRemoved = vi.fn<(bubbleId: string) => void>();

// The page draws again, as it does when its tab changes.
let redraw: () => void = () => {};

// How far the layers that follow a self-scrolling surface are shifted.
const shifts = () =>
    [...document.querySelectorAll<HTMLElement>('[data-bubble-id]')].map(
        (el) => el.parentElement?.style.transform ?? '',
    );

const Harness: FC = () => {
    const [picker, setPicker] = useState<Picker | null>(null);
    showPicker = setPicker;
    const [, setDrawn] = useState(0);
    redraw = () => setDrawn((n) => n + 1);
    api = useDesignMode(surface, {
        onSend,
        renderBubbleBody: (bubble) =>
            bubble.status === 'picking-agent' ? (
                <span>choose an agent</span>
            ) : null,
        picker,
        cancelSend,
        onBubbleRemoved,
    });
    return <>{api.element}</>;
};

// A send that waits on an agent choice, the way useBubbleSend holds it.
const startPickingSend = async () => {
    let settle: (result: DesignSendResult) => void = () => {};
    onSend.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                settle = resolve;
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
    const cancel = vi.fn(() => {
        showPicker(null);
        settle('cancelled');
    });
    await act(async () => {
        showPicker({ bubbleId: id, cancel });
    });
    return { id, cancel, settle: (result: DesignSendResult) => settle(result) };
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
    fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(holdLayer(), { clientX: 70, clientY: 20 });
    fireEvent.mouseUp(holdLayer(), { clientX: 70, clientY: 20 });
    await keyUp({ key: 'Alt' });
};

const collected = () => {
    const capture = api.session.bubbles[0]?.collection?.capture;
    return capture?.status === 'recording' ? capture.marks : [];
};

// The bubble's place on screen, read back from where it was drawn.
const mockBubbleRects = () =>
    vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function rectOf(this: HTMLElement) {
            if (!this.hasAttribute('data-bubble-id')) return new DOMRect();
            return new DOMRect(
                parseFloat(this.style.getPropertyValue('--bubble-left')) -
                    scroll.x,
                parseFloat(this.style.getPropertyValue('--bubble-top')) -
                    scroll.y,
                320,
                140,
            );
        });

const sendFirst = async () => {
    await drawMark();
    await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
    const { id } = api.session.bubbles[0];
    await act(async () => {
        api.send(id, '');
    });
    await waitFor(() => expect(api.session.bubbles[0].status).toBe('thread'));
    return id;
};

// Clicking a sent bubble selects it; the toolbar's mic decides how it is replied to.
const select = (id: string, input: 'mic' | 'text') => {
    api.setMicOn(input === 'mic');
    api.arm(id);
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
        scrollContainer = null;
        tab = null;
        composeImage.mockClear();
        startVoice.mockReset();
        stopVoice.mockReset();
        grabDomFrame.mockReset();
        transcribe.mockReset();
        onSend.mockReset();
        cancelSend.mockReset();
        onBubbleRemoved.mockReset();
        startVoice.mockResolvedValue('on');
        stopVoice.mockResolvedValue(null);
        grabDomFrame.mockImplementation(async () => fakeFrame());
        transcribe.mockResolvedValue([]);
        onSend.mockResolvedValue({ threadId: 't1', agentUuid: 'a1' });
    });

    it('pressing Option does not grab the page; releasing after drawing does', async () => {
        await turnOn();
        await keyDown({ key: 'Alt', altKey: true });
        expect(api.holding).toBe(true);
        fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 40 });
        expect(grabDomFrame).not.toHaveBeenCalled();

        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(api.holding).toBe(false);
        // The picture comes once the hand is still, not with the release.
        expect(grabDomFrame).not.toHaveBeenCalled();
        await waitFor(() => expect(grabDomFrame).toHaveBeenCalledTimes(1));
    });

    it('an empty hold never opens a bubble', async () => {
        await turnOn();
        await keyDown({ key: 'Alt', altKey: true });
        await keyUp({ key: 'Alt' });
        await act(async () => {});
        expect(api.session.bubbles).toHaveLength(0);
        expect(grabDomFrame).not.toHaveBeenCalled();
    });

    it('with the mic on, the mic records from key down and release sends the marks and words', async () => {
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

        // Recording starts with the key, so words before the first mark are kept.
        await keyDown({ key: 'Alt', altKey: true });
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).not.toHaveBeenCalled();
        fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        fireEvent.mouseMove(holdLayer(), { clientX: 70, clientY: 20 });
        fireEvent.mouseUp(holdLayer(), { clientX: 70, clientY: 20 });
        expect(stopVoice).not.toHaveBeenCalled();
        await keyUp({ key: 'Alt' });

        // No Stop: the release is the send.
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).toHaveBeenCalledTimes(1);
        const [payload] = onSend.mock.calls[0];
        expect(payload.bubbleId).toBe(api.session.bubbles[0].id);
        expect(payload.summary).toContain('make this blue');
        expect(payload.transcript.length).toBeGreaterThan(0);
        expect(payload.marks).toHaveLength(1);
        expect(payload.images).toHaveLength(1);
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
    });

    it('a new hold right after a spoken release marks a second bubble, and both send', async () => {
        const audio = () => ({
            audio: new Blob(['audio'], { type: 'audio/webm' }),
            startedAtMs: performance.now(),
        });
        let transcribed: (words: TranscriptWord[]) => void = () => {};
        transcribe.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    transcribed = resolve;
                }),
        );
        transcribe.mockResolvedValue([
            { startMs: 0, endMs: 300, text: 'second' },
        ]);
        stopVoice.mockImplementation(async () => audio());
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
        // The first is still being transcribed: the page is already free.
        expect(onSend).not.toHaveBeenCalled();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
        await act(async () => {
            transcribed([{ startMs: 0, endMs: 300, text: 'first' }]);
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
        // The second did not wait for the first, so it went out first.
        const [second, first] = onSend.mock.calls.map(([sent]) => sent);
        expect(first.bubbleId).not.toBe(second.bubbleId);
        expect(first.summary).toContain('first');
        expect(second.summary).toContain('second');
        expect(first.marks).toHaveLength(1);
        expect(second.marks).toHaveLength(1);
    });

    it('with the mic on, releasing with no marks drops the recording and opens nothing', async () => {
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
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(stopVoice).toHaveBeenCalledTimes(1));
        await act(async () => {});
        expect(api.session.bubbles).toHaveLength(0);
        expect(transcribe).not.toHaveBeenCalled();
        expect(onSend).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('mic denied falls back to the text box', async () => {
        startVoice.mockResolvedValue('off');
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(api.session.bubbles[0].input).toBe('text');
        expect(collected()).toHaveLength(1);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('a release with marks and no words keeps the marks in a text box and sends nothing', async () => {
        await turnOn(true);
        // The recording comes back empty.
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        await waitFor(() => expect(api.session.bubbles[0].input).toBe('text'));
        expect(onSend).not.toHaveBeenCalled();
        expect(api.session.bubbles[0].status).toBe('collecting');
        expect(collected()).toHaveLength(1);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('holding again on a bubble that takes typing adds marks only: no recording, no send', async () => {
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(api.session.bubbles[0]?.input).toBe('text'));
        expect(startVoice).toHaveBeenCalledTimes(1);
        stopVoice.mockResolvedValue({
            audio: new Blob(['audio'], { type: 'audio/webm' }),
            startedAtMs: performance.now(),
        });
        transcribe.mockResolvedValue([
            { startMs: 0, endMs: 300, text: 'make' },
            { startMs: 300, endMs: 600, text: 'this' },
            { startMs: 600, endMs: 900, text: 'blue' },
        ]);

        await drawMark();
        await waitFor(() => expect(collected()).toHaveLength(2));
        await act(async () => {});
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(onSend).not.toHaveBeenCalled();
        expect(api.session.bubbles[0]).toMatchObject({
            status: 'collecting',
            input: 'text',
        });
    });

    it('a hold called off by another key drops its recording', async () => {
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
        await keyDown({ key: 'ArrowLeft', altKey: true });
        await keyUp({ key: 'ArrowLeft', altKey: true });
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(stopVoice).toHaveBeenCalledTimes(1));
        await act(async () => {});
        expect(api.session.bubbles).toHaveLength(0);
        expect(transcribe).not.toHaveBeenCalled();
        expect(onSend).not.toHaveBeenCalled();
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

        // A reply by mic with no marks: the hold records and sends nothing.
        await act(async () => {
            select(id, 'mic');
        });
        expect(startVoice).not.toHaveBeenCalled();
        await keyDown({ key: 'Alt', altKey: true });
        expect(startVoice).toHaveBeenCalledTimes(1);
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(stopVoice).toHaveBeenCalledTimes(1));
        await act(async () => {});
        expect(onSend).toHaveBeenCalledTimes(1);
        expect(transcribe).not.toHaveBeenCalled();
    });

    it('while a spoken reply is on its way out, it cannot be selected and the key marks a new bubble', async () => {
        await turnOn();
        const id = await sendFirst();
        await act(async () => {
            select(id, 'mic');
        });
        let stopped: (audio: null) => void = () => {};
        stopVoice.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    stopped = resolve;
                }),
        );
        await drawMark();
        expect(startVoice).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(stopVoice).toHaveBeenCalledTimes(1));
        // Still being stopped and transcribed.
        await act(async () => {
            select(id, 'mic');
        });
        expect(api.session.active).toEqual({ kind: 'page' });
        await keyDown({ key: 'Alt', altKey: true });
        expect(api.holding).toBe(true);
        await keyUp({ key: 'Alt' });
        await act(async () => {
            stopped(null);
        });
        await act(async () => {});
        // The second hold recorded for the page and, with no mark, was dropped.
        expect(startVoice).toHaveBeenCalledTimes(2);
        expect(api.session.bubbles).toHaveLength(1);
    });

    it('marks on two tabs go out as two images, each with its own marks', async () => {
        tab = { uuid: 'a', name: 'Overview' };
        await turnOn();
        await drawMark();
        await waitFor(() => expect(collected()).toHaveLength(1));
        // The same pixels on another tab are still another screen.
        tab = { uuid: 'b', name: 'Marketing' };
        await drawMark();
        await waitFor(() => expect(collected()).toHaveLength(2));
        expect(collected().map((m) => m.imageIndex)).toEqual([0, 1]);
        expect(api.session.bubbles[0].collection?.tabUuids).toEqual(['a', 'b']);

        await act(async () => {
            api.send(api.session.bubbles[0].id, 'compare these');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        const [payload] = onSend.mock.calls[0];
        expect(payload.images).toHaveLength(2);
        const composed = composeImage.mock.calls.map(([input]) => ({
            index: input.index,
            marks: input.marks.map((m) => m.number),
        }));
        expect(composed).toEqual([
            { index: 0, marks: [1] },
            { index: 1, marks: [2] },
        ]);
        const frames = composeImage.mock.calls.map(([input]) => input.frame);
        expect(frames[0]).not.toBe(frames[1]);
        expect(payload.summary).toContain('on tab "Marketing"');
    });

    it('a screen past the image cap is still marked, and told in words', async () => {
        await turnOn();
        for (let i = 0; i <= CAP; i += 1) {
            // Each mark is made further down the page: another screen.
            scroll = { x: 0, y: i * 200 };
            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(i + 1));
        }
        expect(collected().map((m) => m.imageIndex)).toEqual([
            ...Array.from({ length: CAP }, (_, i) => i),
            CAP,
        ]);

        await act(async () => {
            api.send(api.session.bubbles[0].id, '');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        const [payload] = onSend.mock.calls[0];
        expect(payload.images).toHaveLength(CAP);
        expect(payload.marks).toHaveLength(CAP + 1);
        expect(payload.summary).toContain('Not shown in an image:');
        expect(payload.summary).not.toContain(`Image ${CAP + 1}`);
    });

    it('an armed reply follows the user to another tab and comes into view', async () => {
        const rects = mockBubbleRects();
        try {
            tab = { uuid: 'a', name: 'Overview' };
            await turnOn();
            const id = await sendFirst();
            const bubble = () =>
                document.querySelector<HTMLElement>('[data-bubble-id]');
            const changeTab = async (uuid: string, top: number) => {
                tab = { uuid, name: uuid };
                scroll = { x: 0, y: top };
                await act(async () => {
                    window.dispatchEvent(new Event('scroll'));
                    redraw();
                });
            };

            // Sent and at rest, it lives on its home tab.
            await changeTab('b', 1);
            expect(bubble()).toBeNull();
            await changeTab('a', 0);
            await act(async () => {
                select(id, 'mic');
            });
            expect(startVoice).not.toHaveBeenCalled();

            // The other tab is scrolled far past where the bubble was left.
            await changeTab('b', 900);
            expect(bubble()).not.toBeNull();
            expect(
                screen.getByText(
                    'Replying here. Hold ⌥, mark and talk, release to send.',
                ),
            ).toBeVisible();
            const top =
                parseFloat(
                    bubble()?.style.getPropertyValue('--bubble-top') ?? '',
                ) - scroll.y;
            expect(top).toBeGreaterThanOrEqual(0);

            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(1));
            expect(bubble()).not.toBeNull();
            expect(
                document.querySelector('[data-mark-number="2"]'),
            ).not.toBeNull();
        } finally {
            rects.mockRestore();
        }
    });

    it('a bubble scrolled out of view comes back beside the next mark', async () => {
        const rects = mockBubbleRects();
        try {
            await turnOn();
            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(1));
            scroll = { x: 0, y: 900 };
            await act(async () => {
                window.dispatchEvent(new Event('scroll'));
            });
            // Where it is on screen: its place in the content, less the scroll.
            const top = () =>
                parseFloat(
                    document
                        .querySelector<HTMLElement>('[data-bubble-id]')
                        ?.style.getPropertyValue('--bubble-top') ?? '',
                ) - scroll.y;
            expect(top()).toBeLessThan(0);

            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(2));
            expect(top()).toBeGreaterThanOrEqual(0);
        } finally {
            rects.mockRestore();
        }
    });

    it('leaving Design Mode keeps sent bubbles on the page and drops unsent work', async () => {
        await turnOn();
        const id = await sendFirst();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(2));

        await keyDown({ key: 'Escape' });
        await keyUp({ key: 'Escape' });
        expect(api.session.bubbles).toHaveLength(1);
        await keyDown({ key: 'Escape' });
        expect(api.on).toBe(false);
        expect(api.session.bubbles.map((b) => b.id)).toEqual([id]);
        expect(
            screen.queryByRole('button', { name: 'Leave Design Mode' }),
        ).not.toBeInTheDocument();
        const bubble = () =>
            document.querySelector<HTMLElement>('[data-bubble-id]');
        expect(bubble()).not.toBeNull();
        expect(document.querySelector('[data-mark-number="1"]')).not.toBeNull();

        // It still follows the page while Design Mode is off.
        const before = bubble()?.style.getPropertyValue('--bubble-top');
        scroll = { x: 0, y: 12 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
        });
        expect(bubble()?.style.getPropertyValue('--bubble-top')).toBe(before);
        expect(shifts()).toEqual(['translate(0px, -12px)']);

        // With Design Mode off, a click on it selects nothing.
        fireEvent.click(bubble() as HTMLElement);
        expect(api.on).toBe(false);
        expect(api.session.active).toEqual({ kind: 'page' });
        expect(bubble()?.getAttribute('data-selected')).toBe('false');
    });

    it('leaving Design Mode throws away an unsent reply but keeps its thread', async () => {
        await turnOn();
        const id = await sendFirst();
        await act(async () => {
            select(id, 'mic');
        });
        await drawMark();
        await waitFor(() => expect(collected()).toHaveLength(1));
        await act(async () => {
            api.setOn(false);
        });
        expect(stopVoice).toHaveBeenCalledTimes(1);
        expect(api.session).toMatchObject({
            active: { kind: 'page' },
            bubbles: [{ id, status: 'thread', collection: null }],
        });
        expect(api.session.bubbles[0].sentMarks).toHaveLength(1);
        expect(document.querySelector('[data-mark-number="2"]')).toBeNull();
        expect(document.querySelector('[data-mark-number="1"]')).not.toBeNull();
    });

    describe('Esc', () => {
        const openBubble = async () => {
            await turnOn();
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        };

        it('held down does not go on to leave Design Mode', async () => {
            await openBubble();
            await keyDown({ key: 'Escape' });
            expect(api.session.bubbles).toHaveLength(0);
            await keyDown({ key: 'Escape', repeat: true });
            await keyDown({ key: 'Escape', repeat: true });
            expect(api.on).toBe(true);
        });

        it('that cancels a composed character keeps the bubble', async () => {
            await openBubble();
            fireEvent.keyDown(screen.getByRole('textbox'), {
                key: 'Escape',
                isComposing: true,
            });
            expect(api.session.bubbles).toHaveLength(1);
        });

        it('in the bubble text box throws the bubble away, and nothing else hears it', async () => {
            await openBubble();
            const heard = vi.fn();
            document.body.addEventListener('keydown', heard);
            try {
                const kept = fireEvent.keyDown(screen.getByRole('textbox'), {
                    key: 'Escape',
                });
                expect(kept).toBe(false);
                expect(heard).not.toHaveBeenCalled();
                expect(api.session.bubbles).toHaveLength(0);
                expect(api.on).toBe(true);
            } finally {
                document.body.removeEventListener('keydown', heard);
            }
        });

        it('typed somewhere else is left to that place', async () => {
            await openBubble();
            const elsewhere = document.createElement('input');
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            const inDialog = document.createElement('button');
            dialog.append(inDialog);
            document.body.append(elsewhere, dialog);
            try {
                expect(fireEvent.keyDown(elsewhere, { key: 'Escape' })).toBe(
                    true,
                );
                expect(fireEvent.keyDown(inDialog, { key: 'Escape' })).toBe(
                    true,
                );
                expect(api.session.bubbles).toHaveLength(1);

                // With nothing unsent it does not leave Design Mode either.
                await act(async () => {
                    api.discard(api.session.bubbles[0].id);
                });
                fireEvent.keyDown(elsewhere, { key: 'Escape' });
                expect(api.on).toBe(true);
            } finally {
                elsewhere.remove();
                dialog.remove();
            }
        });
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
        expect(api.holding).toBe(true);
        const kept = fireEvent.keyDown(textbox, { key: 'e', altKey: true });
        expect(kept).toBe(true);
        expect(api.holding).toBe(false);

        fireEvent.keyUp(textbox, { key: 'e', altKey: true });
        fireEvent.keyUp(textbox, { key: 'Alt' });
        await waitFor(() => expect(grabDomFrame).toHaveBeenCalledTimes(1));
        expect(api.session.bubbles).toHaveLength(1);
        expect(collected()).toHaveLength(1);
    });

    describe('one hold clicks to pick and drags to draw', () => {
        const revenue = {
            kind: 'tile',
            id: 't1',
            label: 'Revenue',
            parentId: null,
        };
        const orders = {
            kind: 'tile',
            id: 't2',
            label: 'Orders',
            parentId: null,
        };
        // Revenue on the left half of the page, Orders on the right.
        const pickAt = vi.fn<
            (point: {
                x: number;
                y: number;
            }) => Promise<{ target: typeof revenue; rect: DOMRect } | null>
        >(async (point) =>
            point.x < 50
                ? { target: revenue, rect: new DOMRect(10, 20, 30, 40) }
                : { target: orders, rect: new DOMRect(60, 20, 30, 40) },
        );
        const click = (x: number, y: number) => {
            fireEvent.mouseDown(holdLayer(), { clientX: x, clientY: y });
            fireEvent.mouseUp(holdLayer(), { clientX: x, clientY: y });
        };
        const drag = (points: [number, number][]) => {
            const [[x, y], ...rest] = points;
            fireEvent.mouseDown(holdLayer(), { clientX: x, clientY: y });
            rest.forEach(([mx, my]) =>
                fireEvent.mouseMove(holdLayer(), { clientX: mx, clientY: my }),
            );
            const [lx, ly] = points[points.length - 1];
            fireEvent.mouseUp(holdLayer(), { clientX: lx, clientY: ly });
        };

        beforeEach(() => {
            pickAt.mockClear();
            surface.pickAt = pickAt;
        });
        afterEach(() => {
            surface.pickAt = null;
        });

        it('a pick made after the page scrolled mid-hold sits where it was clicked', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            scroll = { x: 0, y: 150 };
            click(20, 30);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(1));
            const outline = document.querySelector<HTMLElement>(
                '[data-mark-outline]',
            )!;
            // Where the pick is on screen (20) plus the scroll at the click.
            expect(
                parseFloat(outline.style.getPropertyValue('--mark-top')),
            ).toBe(170);
        });

        it('a click picks', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            click(20, 30);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(1));
            expect(pickAt).toHaveBeenCalledWith({ x: 20, y: 30 });
            expect(collected()[0]).toMatchObject({
                shape: 'pick',
                strokes: [],
                target: revenue,
                box: {
                    x: expect.closeTo(0.1),
                    y: expect.closeTo(0.2),
                    width: expect.closeTo(0.3),
                    height: expect.closeTo(0.4),
                },
            });
        });

        it('a drag past the threshold draws from the press point', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            drag([
                [20, 30],
                [22, 30],
                [40, 50],
                [60, 30],
            ]);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(1));
            const [mark] = collected();
            expect(mark.shape).not.toBe('pick');
            expect(mark.strokes[0].points[0]).toEqual({ x: 0.2, y: 0.3 });
            expect(mark.strokes[0].points).toHaveLength(4);
            expect(pickAt).not.toHaveBeenCalled();
        });

        it('a pick then a stroke then a pick number 1, 2, 3', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            click(20, 30);
            drag([
                [10, 70],
                [40, 90],
                [70, 70],
            ]);
            click(70, 30);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(3));
            expect(api.session.bubbles).toHaveLength(1);
            expect(
                collected().map((m) => [m.number, m.shape, m.target]),
            ).toEqual([
                [1, 'pick', revenue],
                [2, expect.not.stringMatching('pick'), null],
                [3, 'pick', orders],
            ]);
        });

        it('strokes drawn in one hold are one mark, and the same element twice in a row is one pick', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            drag([
                [10, 70],
                [40, 90],
            ]);
            drag([
                [50, 70],
                [80, 90],
            ]);
            click(70, 30);
            click(75, 35);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(2));
            await act(async () => {});
            expect(collected()).toHaveLength(2);
            expect(collected()[0].strokes).toHaveLength(2);
            expect(collected()[1]).toMatchObject({
                number: 2,
                shape: 'pick',
                target: orders,
            });
        });

        it('a click on nothing makes no mark', async () => {
            pickAt.mockResolvedValueOnce(null);
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            click(20, 30);
            await keyUp({ key: 'Alt' });
            await act(async () => {});
            expect(api.session.bubbles).toHaveLength(0);
            expect(grabDomFrame).not.toHaveBeenCalled();
        });

        it('a click on nothing between strokes leaves them one mark', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            drag([
                [10, 70],
                [40, 90],
            ]);
            pickAt.mockResolvedValueOnce(null);
            click(20, 30);
            drag([
                [50, 70],
                [80, 90],
            ]);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(collected()).toHaveLength(1));
            await act(async () => {});
            expect(collected()).toHaveLength(1);
            expect(collected()[0].strokes).toHaveLength(2);
        });

        it('hovering with Option held outlines what a click would pick, and a stroke hides it', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseMove(holdLayer(), { clientX: 20, clientY: 30 });
            const outline = () =>
                holdLayer().querySelector<HTMLElement>('[class*="hover"]');
            await waitFor(() => expect(outline()).not.toBeNull());
            expect(outline()?.style.getPropertyValue('--hover-left')).toBe(
                '10%',
            );
            drag([
                [20, 30],
                [40, 50],
            ]);
            expect(outline()).toBeNull();
            await keyUp({ key: 'Alt' });
        });

        it('with the mic on, a pick made while talking is sent on release', async () => {
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
            click(20, 30);
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
            const [payload] = onSend.mock.calls[0];
            expect(payload.marks).toMatchObject([{ shape: 'pick' }]);
            expect(payload.summary).toContain('make this blue');
        });

        it('a hold called off after a mark keeps the mark in a text box, without the words', async () => {
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
            click(20, 30);
            await waitFor(() => expect(collected()).toHaveLength(1));
            await keyDown({ key: 'e', altKey: true });
            await keyUp({ key: 'e', altKey: true });
            await keyUp({ key: 'Alt' });
            await waitFor(() =>
                expect(api.session.bubbles[0].input).toBe('text'),
            );
            expect(stopVoice).toHaveBeenCalledTimes(1);
            expect(transcribe).not.toHaveBeenCalled();
            expect(onSend).not.toHaveBeenCalled();
            expect(collected()).toHaveLength(1);
        });

        it('a pick does not activate the link it lands on', async () => {
            const followed = vi.fn();
            const link = document.createElement('a');
            link.href = 'https://example.com/report.csv';
            link.addEventListener('click', followed);
            document.body.append(link);
            try {
                await turnOn();
                await keyDown({ key: 'Alt', altKey: true });
                click(20, 30);
                // The browser may still aim the click at what is under the pen.
                const optionClick = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    altKey: true,
                });
                link.dispatchEvent(optionClick);
                expect(optionClick.defaultPrevented).toBe(true);
                expect(followed).not.toHaveBeenCalled();
                await keyUp({ key: 'Alt' });

                // Without the hold, the page has its clicks back.
                const plainClick = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                });
                link.dispatchEvent(plainClick);
                expect(followed).toHaveBeenCalledTimes(1);
                plainClick.preventDefault();
            } finally {
                link.remove();
            }
        });

        it('a press does not select text or start a drag', async () => {
            await turnOn();
            await keyDown({ key: 'Alt', altKey: true });
            const down = fireEvent.mouseDown(holdLayer(), {
                clientX: 20,
                clientY: 30,
            });
            expect(down).toBe(false);
            const dragStart = new Event('dragstart', {
                bubbles: true,
                cancelable: true,
            });
            document.body.dispatchEvent(dragStart);
            expect(dragStart.defaultPrevented).toBe(true);
            await keyUp({ key: 'Alt' });
        });

        it('Control does nothing', async () => {
            await turnOn();
            await keyDown({ key: 'Control', ctrlKey: true });
            expect(api.holding).toBe(false);
            expect(document.querySelector('[data-holding="true"]')).toBeNull();
            const menu = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
            });
            window.dispatchEvent(menu);
            expect(menu.defaultPrevented).toBe(false);
            await keyUp({ key: 'Control' });
            expect(api.session.bubbles).toHaveLength(0);
        });

        it('AltGr does not start a hold', async () => {
            await turnOn();
            // Windows and Linux keyboards send Control, then Alt with Control down.
            await keyDown({ key: 'Control', ctrlKey: true, altKey: true });
            await keyDown({ key: 'Alt', ctrlKey: true, altKey: true });
            expect(api.holding).toBe(false);
            await keyUp({ key: 'Alt', ctrlKey: true });
            await keyUp({ key: 'Control' });
        });
    });

    describe('on an app', () => {
        const element = {
            target: {
                kind: 'element',
                id: 'save',
                label: '[button "Save"]',
                parentId: null,
            },
            rect: new DOMRect(20, 20, 30, 10),
        };
        const useAppSurface = (
            pickAt: (point: {
                x: number;
                y: number;
            }) => Promise<typeof element | null>,
        ) => {
            surface.frameSource = 'app';
            surface.grabAppImage = async () => new Blob();
            surface.pickAt = pickAt;
        };
        const restoreSurface = () => {
            surface.frameSource = 'dom';
            surface.grabAppImage = null;
            surface.pickAt = null;
        };

        beforeEach(() => {
            grabAppFrame.mockReset();
            grabAppFrame.mockImplementation(async () => fakeFrame());
        });

        it('the ink layer takes the pointer, and a click asks the app what it picks', async () => {
            const pickAt = vi.fn(async () => element);
            useAppSurface(pickAt);
            try {
                await turnOn();
                await keyDown({ key: 'Alt', altKey: true });
                fireEvent.mouseDown(holdLayer(), { clientX: 35, clientY: 25 });
                fireEvent.mouseUp(holdLayer(), { clientX: 35, clientY: 25 });
                await keyUp({ key: 'Alt' });
                await waitFor(() => expect(collected()).toHaveLength(1));
                expect(pickAt).toHaveBeenCalledWith({ x: 35, y: 25 });
                expect(collected()[0]).toMatchObject({
                    shape: 'pick',
                    target: element.target,
                    box: {
                        x: expect.closeTo(0.2),
                        y: expect.closeTo(0.2),
                        width: expect.closeTo(0.3),
                        height: expect.closeTo(0.1),
                    },
                });
                expect(grabAppFrame).toHaveBeenCalledTimes(1);
            } finally {
                restoreSurface();
            }
        });

        it('a pick answered after a later stroke still numbers first', async () => {
            let answer: (picked: typeof element | null) => void = () => {};
            useAppSurface(
                () =>
                    new Promise((resolve) => {
                        answer = resolve;
                    }),
            );
            try {
                await turnOn();
                await keyDown({ key: 'Alt', altKey: true });
                fireEvent.mouseDown(holdLayer(), { clientX: 35, clientY: 25 });
                fireEvent.mouseUp(holdLayer(), { clientX: 35, clientY: 25 });
                fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 70 });
                fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 90 });
                fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 90 });
                await keyUp({ key: 'Alt' });
                await act(async () => {
                    answer(element);
                });
                await waitFor(() => expect(collected()).toHaveLength(2));
                expect(collected().map((m) => m.shape)[0]).toBe('pick');
                expect(collected()[1].shape).not.toBe('pick');
            } finally {
                restoreSurface();
            }
        });

        it('a bundle that cannot say what is under the pointer still takes ink', async () => {
            useAppSurface(async () => null);
            try {
                await turnOn();
                await keyDown({ key: 'Alt', altKey: true });
                fireEvent.mouseDown(holdLayer(), { clientX: 35, clientY: 25 });
                fireEvent.mouseUp(holdLayer(), { clientX: 35, clientY: 25 });
                fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 70 });
                fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 90 });
                fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 90 });
                await keyUp({ key: 'Alt' });
                await waitFor(() => expect(collected()).toHaveLength(1));
                expect(collected()[0].shape).not.toBe('pick');
            } finally {
                restoreSurface();
            }
        });

        it('focus moving into the app ends the hold', async () => {
            useAppSurface(async () => element);
            const focused = vi.spyOn(document, 'activeElement', 'get');
            try {
                await turnOn();
                await keyDown({ key: 'Alt', altKey: true });
                focused.mockReturnValue(document.createElement('iframe'));
                await act(async () => {
                    window.dispatchEvent(new Event('blur'));
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
                expect(api.holding).toBe(false);
            } finally {
                focused.mockRestore();
                restoreSurface();
            }
        });

        it('the hold key pressed inside the app starts and ends a hold', async () => {
            useAppSurface(async () => null);
            try {
                await turnOn();
                await act(async () => {
                    api.frameHold('down');
                });
                expect(api.holding).toBe(true);
                await act(async () => {
                    api.frameHold('up');
                });
                expect(api.holding).toBe(false);
            } finally {
                restoreSurface();
            }
        });

        it('the hold key from the app does nothing while Design Mode is off', async () => {
            renderWithProviders(<Harness />);
            await act(async () => {
                api.frameHold('down');
            });
            expect(api.holding).toBe(false);
        });
    });

    it('a hold called off before the mic starts still stops it, before the next start', async () => {
        let started: (state: 'on' | 'off') => void = () => {};
        startVoice.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    started = resolve;
                }),
        );
        await turnOn(true);
        await keyDown({ key: 'Alt', altKey: true });
        fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        await keyDown({ key: 'e', altKey: true });
        await keyUp({ key: 'e', altKey: true });
        await keyUp({ key: 'Alt' });
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).not.toHaveBeenCalled();

        // The next hold's mic waits for the first one to be stopped.
        await drawMark();
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).not.toHaveBeenCalled();

        await act(async () => {
            started('on');
        });
        await waitFor(() => expect(startVoice).toHaveBeenCalledTimes(2));
        expect(stopVoice.mock.invocationCallOrder[0]).toBeLessThan(
            startVoice.mock.invocationCallOrder[1],
        );
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        // Each hold stopped its own recording, and only once.
        await waitFor(() => expect(stopVoice).toHaveBeenCalledTimes(2));
    });

    it('arming a bubble that is still collecting does not start the mic', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            select(id, 'mic');
        });
        expect(startVoice).not.toHaveBeenCalled();
        expect(api.session.bubbles[0].input).toBe('text');
    });

    it('arming a sent bubble for the mic does not start it; the hold records and release sends the reply', async () => {
        await turnOn();
        const id = await sendFirst();
        expect(onSend).toHaveBeenCalledTimes(1);
        stopVoice.mockResolvedValue({
            audio: new Blob(['audio'], { type: 'audio/webm' }),
            startedAtMs: performance.now(),
        });
        transcribe.mockResolvedValue([
            { startMs: 0, endMs: 300, text: 'make' },
            { startMs: 300, endMs: 600, text: 'this' },
            { startMs: 600, endMs: 900, text: 'blue' },
        ]);

        await act(async () => {
            select(id, 'mic');
        });
        expect(startVoice).not.toHaveBeenCalled();

        await keyDown({ key: 'Alt', altKey: true });
        expect(startVoice).toHaveBeenCalledTimes(1);
        fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 40 });
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
        const [reply] = onSend.mock.calls[1];
        expect(reply.bubbleId).toBe(id);
        expect(reply.summary).toContain('make this blue');
        expect(reply.marks).toHaveLength(1);
        expect(stopVoice).toHaveBeenCalledTimes(1);
    });

    describe('the bubble clicked last takes the next hold', () => {
        const bubbleEl = (id: string) =>
            document.querySelector<HTMLElement>(
                `[data-bubble-id="${id}"]`,
            ) as HTMLElement;
        const selected = (id: string) =>
            bubbleEl(id).getAttribute('data-selected');
        const spoken = () => {
            stopVoice.mockResolvedValue({
                audio: new Blob(['audio'], { type: 'audio/webm' }),
                startedAtMs: performance.now(),
            });
            transcribe.mockResolvedValue([
                { startMs: 0, endMs: 300, text: 'greener' },
            ]);
        };

        it('a click on a sent bubble selects it and says so', async () => {
            await turnOn();
            const id = await sendFirst();
            expect(selected(id)).toBe('false');
            fireEvent.click(bubbleEl(id));
            expect(api.session.active).toEqual({
                kind: 'bubble',
                bubbleId: id,
            });
            expect(selected(id)).toBe('true');
            expect(
                screen.getByText('Replying here. Hold ⌥ to mark, then type.'),
            ).toBeVisible();
            // The hint follows the toolbar's mic.
            await act(async () => {
                api.setMicOn(true);
            });
            expect(
                screen.getByText(
                    'Replying here. Hold ⌥, mark and talk, release to send.',
                ),
            ).toBeVisible();
            expect(startVoice).not.toHaveBeenCalled();
        });

        it('with the mic off, the hold adds marks numbered after the sent ones and nothing is sent', async () => {
            await turnOn();
            const id = await sendFirst();
            fireEvent.click(bubbleEl(id));
            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(1));
            expect(collected()[0].number).toBe(2);
            await act(async () => {});
            expect(startVoice).not.toHaveBeenCalled();
            expect(onSend).toHaveBeenCalledTimes(1);
            expect(api.session.active).toEqual({
                kind: 'bubble',
                bubbleId: id,
            });
            // Typed and sent, the page takes the next hold again.
            await act(async () => {
                api.send(id, 'this one too');
            });
            await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
            expect(onSend.mock.calls[1][0].bubbleId).toBe(id);
            expect(api.session.active).toEqual({ kind: 'page' });
        });

        it('the toolbar mic at the hold, not at the click, decides that it records; release sends the reply', async () => {
            spoken();
            await turnOn();
            const id = await sendFirst();
            fireEvent.click(bubbleEl(id));
            await act(async () => {
                api.setMicOn(true);
            });
            await keyDown({ key: 'Alt', altKey: true });
            expect(startVoice).toHaveBeenCalledTimes(1);
            fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: 10 });
            fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
            fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 40 });
            await keyUp({ key: 'Alt' });
            await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
            const [reply] = onSend.mock.calls[1];
            expect(reply.bubbleId).toBe(id);
            expect(reply.summary).toContain('greener');
            expect(
                reply.marks.map((m: { number: number }) => m.number),
            ).toEqual([2]);
            expect(api.session.active).toEqual({ kind: 'page' });
        });

        it('a press on the page hands the page back, and the page still gets the press', async () => {
            await turnOn();
            const id = await sendFirst();
            fireEvent.click(bubbleEl(id));
            expect(selected(id)).toBe('true');
            // A press in the bubble keeps it selected.
            fireEvent.mouseDown(bubbleEl(id));
            expect(selected(id)).toBe('true');
            const pressed = vi.fn();
            document.body.addEventListener('mousedown', pressed);
            const notPrevented = fireEvent.mouseDown(document.body);
            document.body.removeEventListener('mousedown', pressed);
            expect(pressed).toHaveBeenCalledTimes(1);
            expect(notPrevented).toBe(true);
            expect(api.session.active).toEqual({ kind: 'page' });
            expect(selected(id)).toBe('false');
            // The next hold opens a new bubble.
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
        });

        it('a press on the page keeps a reply that has marks', async () => {
            await turnOn();
            const id = await sendFirst();
            fireEvent.click(bubbleEl(id));
            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(1));
            fireEvent.mouseDown(document.body);
            expect(api.session.active).toEqual({
                kind: 'bubble',
                bubbleId: id,
            });
            expect(collected()).toHaveLength(1);
        });

        it('one Esc deselects and stays in Design Mode', async () => {
            await turnOn();
            const id = await sendFirst();
            fireEvent.click(bubbleEl(id));
            await keyDown({ key: 'Escape' });
            await keyUp({ key: 'Escape' });
            expect(api.on).toBe(true);
            expect(api.session.active).toEqual({ kind: 'page' });
            expect(api.session.bubbles.map((b) => b.id)).toEqual([id]);
            expect(selected(id)).toBe('false');
        });

        it('another bubble cannot be selected while one has unsent marks', async () => {
            await turnOn();
            const first = await sendFirst();
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
            const second = api.session.bubbles[1].id;
            await act(async () => {
                api.send(second, '');
            });
            await waitFor(() =>
                expect(api.session.bubbles[1].status).toBe('thread'),
            );
            fireEvent.click(bubbleEl(first));
            await drawMark();
            await waitFor(() => expect(collected()).toHaveLength(1));
            fireEvent.click(bubbleEl(second));
            expect(api.session.active).toEqual({
                kind: 'bubble',
                bubbleId: first,
            });
            expect(selected(second)).toBe('false');
            expect(collected()).toHaveLength(1);
        });
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

    it('a bubble waiting on an agent choice shows the picker, then sends', async () => {
        const { id, settle } = await startPickingSend();
        expect(api.session.bubbles[0].status).toBe('picking-agent');
        expect(screen.getByText('choose an agent')).toBeInTheDocument();

        // Picked: the picker closes while the thread is created.
        await act(async () => {
            showPicker(null);
        });
        expect(api.session.bubbles[0].status).toBe('sending');
        await act(async () => {
            settle({ threadId: 't1', agentUuid: 'a1' });
        });
        await waitFor(() =>
            expect(api.session.bubbles[0]).toMatchObject({
                id,
                status: 'thread',
                threadId: 't1',
            }),
        );
    });

    it('Esc on a bubble choosing its agent calls the send off', async () => {
        const { cancel } = await startPickingSend();
        await keyDown({ key: 'Escape' });
        await keyUp({ key: 'Escape' });
        expect(cancel).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(0));
        expect(api.on).toBe(true);
        expect(screen.queryByLabelText('Mark 1')).not.toBeInTheDocument();
    });

    it('Discard on a bubble choosing its agent calls the send off', async () => {
        const { cancel } = await startPickingSend();
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(cancel).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(0));
    });

    it('leaving Design Mode calls off a send that waits on an agent choice', async () => {
        const { id, cancel } = await startPickingSend();
        cancelSend.mockImplementation(() => cancel());
        await act(async () => {
            api.setOn(false);
        });
        expect(cancelSend).toHaveBeenCalledWith(id);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(api.session.bubbles).toHaveLength(0);
    });

    it('leaving while the agent is still being chosen frees later sends', async () => {
        let settle: (result: DesignSendResult) => void = () => {};
        onSend.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    settle = resolve;
                }),
        );
        cancelSend.mockImplementation(() => settle('cancelled'));
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'hello');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        // No picker yet: the route has not answered.
        await act(async () => {
            api.setOn(false);
        });
        expect(cancelSend).toHaveBeenCalledWith(id);
        expect(api.session.bubbles).toHaveLength(0);

        await act(async () => {
            api.setOn(true);
        });
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        await act(async () => {
            api.send(api.session.bubbles[0].id, 'again');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
    });

    it('a picker for a bubble that is gone is called off', async () => {
        await turnOn();
        const cancel = vi.fn(() => showPicker(null));
        await act(async () => {
            showPicker({ bubbleId: 'gone', cancel });
        });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(api.session.bubbles).toHaveLength(0);
    });

    it('typed words travel apart from the marks and speech', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        await act(async () => {
            api.send(api.session.bubbles[0].id, '  make it blue ');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        const [payload] = onSend.mock.calls[0];
        expect(payload.typed).toBe('make it blue');
        expect(payload.summary).toContain('①');
        expect(payload.summary).not.toContain('make it blue');
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
            select(id, 'text');
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

    it('a queued send keeps the bubble and its marks on screen and frees the page', async () => {
        onSend.mockResolvedValueOnce('queued');
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'make it blue');
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('queued'),
        );
        expect(api.session.active).toEqual({ kind: 'page' });
        expect(screen.getByText('Queued')).toBeInTheDocument();
        expect(screen.getByLabelText('Mark 1')).toBeInTheDocument();

        // The next mark opens a second bubble beside the queued one.
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
        expect(api.session.bubbles[0].status).toBe('queued');

        fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(api.session.bubbles[0].id).not.toBe(id);
        expect(onBubbleRemoved.mock.calls).toEqual([[id]]);
    });

    it('leaving Design Mode does not report its queued bubbles as removed', async () => {
        onSend.mockResolvedValue('queued');
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        await act(async () => {
            api.send(api.session.bubbles[0].id, 'make it blue');
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('queued'),
        );

        // Esc with only queued bubbles leaves Design Mode.
        await keyDown({ key: 'Escape' });
        expect(api.on).toBe(false);
        expect(api.session.bubbles).toHaveLength(0);
        expect(onBubbleRemoved).not.toHaveBeenCalled();
    });

    it('throwing away an unsent bubble reports it as removed', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await keyDown({ key: 'Escape' });
        expect(api.session.bubbles).toHaveLength(0);
        expect(onBubbleRemoved.mock.calls).toEqual([[id]]);
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
        expect(screen.queryByText('Hold ⌃')).toBeNull();
        await keyDown({ key: 'Alt', altKey: true });
        expect(
            screen.getByText('Mark').closest('[data-active]'),
        ).toHaveAttribute('data-active', 'true');
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
        expect(screen.getByLabelText('Mark 1')).toBeInTheDocument();

        scroll = { x: 0, y: 12 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
        });
        // Both keep their place in the content; their layers are shifted,
        // with no new drawing of either.
        expect(px(bubble(), '--bubble-top')).toBe(bubbleTop);
        expect(px(badge(), '--mark-top')).toBe(badgeTop);
        expect(shifts()).toEqual(['translate(0px, -12px)']);
        expect(badge().parentElement?.style.transform).toBe(
            'translate(0px, -12px)',
        );

        await act(async () => {
            api.close(api.session.bubbles[0].id);
        });
        expect(document.querySelector('[data-mark-number]')).toBeNull();
    });

    it('a scroll during the hold keeps the bubble beside its mark', async () => {
        const px = (name: string, selector: string) =>
            parseFloat(
                (
                    document.querySelector(selector) as HTMLElement
                ).style.getPropertyValue(name),
            );
        const gap = () =>
            px('--bubble-top', '[data-bubble-id]') -
            px('--mark-top', '[data-mark-number="1"]');
        const drawAt = async (top: number, scrolledTo: number | null) => {
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseDown(holdLayer(), { clientX: 10, clientY: top });
            fireEvent.mouseMove(holdLayer(), {
                clientX: 40,
                clientY: top + 30,
            });
            fireEvent.mouseMove(holdLayer(), {
                clientX: 70,
                clientY: top + 10,
            });
            fireEvent.mouseUp(holdLayer(), {
                clientX: 70,
                clientY: top + 10,
            });
            if (scrolledTo !== null) {
                scroll = { x: 0, y: scrolledTo };
                await act(async () => {
                    window.dispatchEvent(new Event('scroll'));
                });
            }
            await keyUp({ key: 'Alt' });
        };

        // A mark low enough that the bubble is not held in by the top margin.
        await turnOn();
        await drawAt(40, null);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const still = gap();
        await act(async () => {
            api.close(api.session.bubbles[0].id);
        });
        expect(api.session.bubbles).toHaveLength(0);

        // The page scrolls up by 30 before the key is let go, so this
        // mark ends at the same place on screen as the one above.
        scroll = { x: 0, y: 50 };
        await act(async () => {
            window.dispatchEvent(new Event('scroll'));
        });
        await drawAt(10, 20);
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        // 40 on screen: its place in the content less the scroll of 20.
        expect(px('--mark-top', '[data-mark-number="1"]')).toBe(60);
        expect(gap()).toBe(still);
    });

    it('a mark drawn close to the open bubble moves the bubble out of the way', async () => {
        const rects = mockBubbleRects();
        try {
            await turnOn();
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
            const first = api.session.bubbles[0].anchor;

            // Far from the bubble: it stays put.
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseDown(holdLayer(), { clientX: 5, clientY: 60 });
            fireEvent.mouseMove(holdLayer(), { clientX: 20, clientY: 90 });
            fireEvent.mouseUp(holdLayer(), { clientX: 20, clientY: 90 });
            await keyUp({ key: 'Alt' });
            await waitFor(() =>
                expect(screen.getByLabelText('Mark 2')).toBeInTheDocument(),
            );
            expect(api.session.bubbles[0].anchor).toEqual(first);

            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseDown(holdLayer(), { clientX: 80, clientY: 10 });
            fireEvent.mouseMove(holdLayer(), { clientX: 99, clientY: 40 });
            fireEvent.mouseUp(holdLayer(), { clientX: 99, clientY: 40 });
            await keyUp({ key: 'Alt' });
            await waitFor(() =>
                expect(screen.getByLabelText('Mark 3')).toBeInTheDocument(),
            );
            expect(api.session.bubbles[0].anchor.x).toBeGreaterThan(first.x);
        } finally {
            rects.mockRestore();
        }
    });

    describe('where a bubble sits', () => {
        const bubbles = () => [
            ...document.querySelectorAll<HTMLElement>('[data-bubble-id]'),
        ];
        const px = (el: HTMLElement, name: string) =>
            parseFloat(el.style.getPropertyValue(name));
        const header = (el: HTMLElement) =>
            el.querySelector<HTMLElement>('[data-bubble-drag-handle]')!;
        const dragBy = async (el: HTMLElement, dx: number, dy: number) => {
            fireEvent.mouseDown(header(el), { clientX: 300, clientY: 300 });
            await act(async () => {
                fireEvent.mouseMove(window, {
                    clientX: 300 + dx,
                    clientY: 300 + dy,
                });
            });
            fireEvent.mouseUp(window);
        };

        it('a sent bubble is not brought back into view: it stays by its marks', async () => {
            const rects = mockBubbleRects();
            try {
                await turnOn();
                await drawMark();
                await waitFor(() =>
                    expect(api.session.bubbles).toHaveLength(1),
                );
                const { anchor, id } = api.session.bubbles[0];
                scroll = { x: 0, y: 900 };
                await act(async () => {
                    window.dispatchEvent(new Event('scroll'));
                });
                await act(async () => {
                    api.send(id, 'hello');
                });
                await waitFor(() =>
                    expect(api.session.bubbles[0].status).toBe('thread'),
                );
                expect(api.session.bubbles[0].anchor).toEqual(anchor);
                expect(
                    px(bubbles()[0], '--bubble-top') - scroll.y,
                ).toBeLessThan(0);
            } finally {
                rects.mockRestore();
            }
        });

        it('dragged by its header, it stays where it was dropped', async () => {
            const rects = mockBubbleRects();
            try {
                await turnOn();
                await drawMark();
                await waitFor(() =>
                    expect(api.session.bubbles).toHaveLength(1),
                );
                const before = api.session.bubbles[0].anchor;
                scroll = { x: 0, y: 5 };
                await act(async () => {
                    window.dispatchEvent(new Event('scroll'));
                });
                await dragBy(bubbles()[0], 200, 150);
                const dropped = api.session.bubbles[0].anchor;
                // Stored with the page's scroll, so it scrolls with the page.
                expect(dropped).toEqual({
                    x: before.x + 200,
                    y: before.y + 150,
                });

                // Neither a new mark under it nor being sent moves it again.
                await keyDown({ key: 'Alt', altKey: true });
                fireEvent.mouseDown(holdLayer(), {
                    clientX: dropped.x + 5,
                    clientY: dropped.y,
                });
                fireEvent.mouseMove(holdLayer(), {
                    clientX: dropped.x + 30,
                    clientY: dropped.y + 20,
                });
                fireEvent.mouseUp(holdLayer(), {
                    clientX: dropped.x + 30,
                    clientY: dropped.y + 20,
                });
                await keyUp({ key: 'Alt' });
                await waitFor(() => expect(collected()).toHaveLength(2));
                expect(api.session.bubbles[0].anchor).toEqual(dropped);
                await act(async () => {
                    api.send(api.session.bubbles[0].id, 'hello');
                });
                await waitFor(() =>
                    expect(api.session.bubbles[0].status).toBe('thread'),
                );
                expect(api.session.bubbles[0].anchor).toEqual(dropped);
            } finally {
                rects.mockRestore();
            }
        });

        it('on a page that scrolls them itself, marks and bubbles sit in the page and are never shifted', async () => {
            scrollContainer = document.createElement('main');
            document.body.append(scrollContainer);
            try {
                await turnOn();
                scroll = { x: 0, y: 300 };
                await drawMark();
                await waitFor(() =>
                    expect(api.session.bubbles).toHaveLength(1),
                );
                const bubble = bubbles()[0];
                const badge = document.querySelector<HTMLElement>(
                    '[data-mark-number="1"]',
                )!;
                expect(scrollContainer.contains(bubble)).toBe(true);
                expect(scrollContainer.contains(badge)).toBe(true);
                // Content coordinates: where it was drawn plus the scroll.
                expect(px(badge, '--mark-top')).toBe(310);
                expect(px(bubble, '--bubble-top')).toBe(
                    api.session.bubbles[0].anchor.y,
                );

                scroll = { x: 0, y: 500 };
                await act(async () => {
                    window.dispatchEvent(new Event('scroll'));
                });
                expect(px(badge, '--mark-top')).toBe(310);
                expect(shifts()).toEqual(['']);
                // The toolbar stays on the window, not in the page.
                expect(
                    scrollContainer.contains(screen.getByText('Design Mode')),
                ).toBe(false);

                // Leaving and closing takes the layer out of the page.
                await act(async () => {
                    api.setOn(false);
                });
                expect(scrollContainer.childElementCount).toBe(0);
            } finally {
                scrollContainer.remove();
            }
        });

        it('the bubble last pressed is in front; a new one opens in front', async () => {
            await turnOn();
            const first = await sendFirst();
            await drawMark();
            await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
            const stackOf = (id: string) =>
                px(
                    document.querySelector<HTMLElement>(
                        `[data-bubble-id="${id}"]`,
                    )!,
                    '--bubble-stack',
                );
            const second = api.session.bubbles[1].id;
            expect(stackOf(second)).toBeGreaterThan(stackOf(first));

            await act(async () => {
                fireEvent.mouseDown(
                    document.querySelector(`[data-bubble-id="${first}"]`)!,
                );
            });
            expect(stackOf(first)).toBeGreaterThan(stackOf(second));
        });
    });

    describe('the picture of the page', () => {
        // Time moves only when a test says so.
        const wait = (ms: number) =>
            act(async () => {
                await vi.advanceTimersByTimeAsync(ms);
            });
        const composed = () =>
            composeImage.mock.calls.map(([input]) => ({
                index: input.index,
                marks: input.marks.map((m) => m.number),
            }));

        beforeEach(() => {
            vi.useFakeTimers({
                toFake: ['setTimeout', 'clearTimeout', 'Date'],
            });
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('a second mark on the same screen does not grab again', async () => {
            await turnOn();
            await drawMark();
            await wait(500);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);

            await drawMark();
            await wait(2000);
            expect(collected().map((m) => m.imageIndex)).toEqual([0, 0]);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);

            await act(async () => {
                api.send(api.session.bubbles[0].id, 'these two');
            });
            await wait(0);
            expect(onSend).toHaveBeenCalledTimes(1);
            expect(composed()).toEqual([{ index: 0, marks: [1, 2] }]);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('the grab waits for a quiet moment and is postponed by a new hold', async () => {
            await turnOn();
            await drawMark();
            // The mark and its bubble are there at once; the picture is not.
            expect(collected()).toHaveLength(1);
            expect(grabDomFrame).not.toHaveBeenCalled();

            await wait(300);
            await keyDown({ key: 'Alt', altKey: true });
            await wait(2000);
            expect(grabDomFrame).not.toHaveBeenCalled();
            fireEvent.mouseDown(holdLayer(), { clientX: 20, clientY: 60 });
            fireEvent.mouseMove(holdLayer(), { clientX: 50, clientY: 80 });
            fireEvent.mouseUp(holdLayer(), { clientX: 50, clientY: 80 });
            await keyUp({ key: 'Alt' });
            expect(collected()).toHaveLength(2);

            await wait(300);
            expect(grabDomFrame).not.toHaveBeenCalled();
            await wait(200);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('a moving pointer postpones the grab too', async () => {
            await turnOn();
            await drawMark();
            await wait(300);
            fireEvent.mouseMove(document.body, { clientX: 5, clientY: 5 });
            await wait(300);
            expect(grabDomFrame).not.toHaveBeenCalled();
            await wait(200);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('send waits for the pending grab and the image has both marks', async () => {
            let land: (frame: ReturnType<typeof fakeFrame>) => void = () => {};
            grabDomFrame.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        land = resolve;
                    }),
            );
            await turnOn();
            await drawMark();
            await drawMark();
            expect(collected()).toHaveLength(2);
            expect(grabDomFrame).not.toHaveBeenCalled();

            await act(async () => {
                api.send(api.session.bubbles[0].id, 'both');
            });
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
            await wait(1000);
            expect(onSend).not.toHaveBeenCalled();

            await act(async () => {
                land(fakeFrame());
            });
            await wait(0);
            expect(onSend).toHaveBeenCalledTimes(1);
            expect(onSend.mock.calls[0][0].images).toHaveLength(1);
            expect(composed()).toEqual([{ index: 0, marks: [1, 2] }]);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('scrolling before the grab runs still grabs, and the marks stay on what they marked', async () => {
            await turnOn();
            await drawMark();
            const drawn = collected()[0].box.y;
            expect(grabDomFrame).not.toHaveBeenCalled();

            scroll = { x: 0, y: 5 };
            await act(async () => {
                window.dispatchEvent(new Event('scroll'));
            });
            expect(grabDomFrame).toHaveBeenCalledTimes(1);

            await act(async () => {
                api.send(api.session.bubbles[0].id, 'this');
            });
            await wait(0);
            expect(onSend).toHaveBeenCalledTimes(1);
            // The page is 100 tall and was pictured 5 further down.
            const [input] = composeImage.mock.calls[0];
            expect(input.marks[0].box.y).toBeCloseTo(drawn - 0.05);
            expect(onSend.mock.calls[0][0].marks[0].box.y).toBe(drawn);
        });

        it('a mark after a scroll gets a picture of its own', async () => {
            await turnOn();
            await drawMark();
            scroll = { x: 0, y: 300 };
            await act(async () => {
                window.dispatchEvent(new Event('scroll'));
            });
            await drawMark();
            await wait(500);
            expect(collected().map((m) => m.imageIndex)).toEqual([0, 1]);
            expect(grabDomFrame).toHaveBeenCalledTimes(2);
        });

        it('a press on the page takes the picture first, and the next mark gets its own', async () => {
            await turnOn();
            await drawMark();
            fireEvent.pointerDown(document.body);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);

            await drawMark();
            await wait(500);
            expect(collected().map((m) => m.imageIndex)).toEqual([0, 1]);
            expect(grabDomFrame).toHaveBeenCalledTimes(2);
        });

        it('a press with Option held is a mark, not a press on the page', async () => {
            await turnOn();
            await drawMark();
            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.pointerDown(holdLayer());
            fireEvent.mouseDown(holdLayer(), { clientX: 12, clientY: 12 });
            fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
            fireEvent.mouseUp(holdLayer(), { clientX: 40, clientY: 40 });
            expect(grabDomFrame).not.toHaveBeenCalled();
            await keyUp({ key: 'Alt' });
            await wait(500);
            expect(collected().map((m) => m.imageIndex)).toEqual([0, 0]);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('a press in the bubble leaves the picture for later', async () => {
            await turnOn();
            await drawMark();
            fireEvent.pointerDown(screen.getByRole('textbox'));
            fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });
            expect(grabDomFrame).not.toHaveBeenCalled();
        });

        it('replaced content is pictured at once, and the next mark gets its own', async () => {
            await turnOn();
            await drawMark();
            await act(async () => {
                api.screenChanged();
            });
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
            await drawMark();
            expect(collected().map((m) => m.imageIndex)).toEqual([0, 1]);
        });

        it('a tab change takes the picture at once', async () => {
            tab = { uuid: 'a', name: 'Overview' };
            await turnOn();
            await drawMark();
            tab = { uuid: 'b', name: 'Marketing' };
            await act(async () => redraw());
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
        });

        it('discarding a bubble drops its pending grab', async () => {
            await turnOn();
            await drawMark();
            await act(async () => {
                api.discard(api.session.bubbles[0].id);
            });
            await wait(2000);
            expect(api.session.bubbles).toHaveLength(0);
            expect(grabDomFrame).not.toHaveBeenCalled();
        });

        it('a picture that lands after its bubble was thrown away is let go', async () => {
            const frame = fakeFrame();
            let land: () => void = () => {};
            grabDomFrame.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        land = () => resolve(frame);
                    }),
            );
            await turnOn();
            await drawMark();
            await wait(500);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
            await act(async () => {
                api.discard(api.session.bubbles[0].id);
                land();
            });
            expect(frame.bitmap.close).toHaveBeenCalledTimes(1);
        });

        it('leaving Design Mode drops the pending grab', async () => {
            await turnOn();
            await drawMark();
            await act(async () => {
                api.setOn(false);
            });
            await wait(2000);
            expect(grabDomFrame).not.toHaveBeenCalled();
        });

        it('a picture that fails is tried again when the bubble is sent', async () => {
            grabDomFrame.mockRejectedValueOnce(new Error('no picture'));
            await turnOn();
            await drawMark();
            await wait(500);
            expect(grabDomFrame).toHaveBeenCalledTimes(1);
            expect(collected()).toHaveLength(1);

            await act(async () => {
                api.send(api.session.bubbles[0].id, 'again');
            });
            await wait(0);
            expect(grabDomFrame).toHaveBeenCalledTimes(2);
            expect(onSend.mock.calls[0][0].images).toHaveLength(1);
        });

        it('the page takes no pointer while its picture is owed', async () => {
            await turnOn();
            await drawMark();
            expect(
                document.querySelector('[data-design-shield]'),
            ).not.toBeNull();
            await wait(500);
            expect(document.querySelector('[data-design-shield]')).toBeNull();
        });
    });

    it('a sent bubble shows the body the page gives it', async () => {
        const Body: FC = () => {
            api = useDesignMode(surface, {
                onSend,
                renderBubbleBody: (bubble) => (
                    <span>thread {bubble.threadId}</span>
                ),
                picker: null,
                cancelSend,
                onBubbleRemoved: null,
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
        expect(onSend.mock.calls[0][0].typed).toBe('make this green');
    });

    it('the body is drawn from the session as it is now', async () => {
        const Body: FC = () => {
            api = useDesignMode(surface, {
                onSend,
                renderBubbleBody: (bubble, session) => (
                    <span>
                        {session.active.kind === 'bubble' &&
                        session.active.bubbleId === bubble.id
                            ? 'the target'
                            : 'not the target'}
                    </span>
                ),
                picker: null,
                cancelSend,
                onBubbleRemoved: null,
            });
            return <>{api.element}</>;
        };
        renderWithProviders(<Body />);
        await act(async () => {
            api.setOn(true);
        });
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'hello');
        });
        await waitFor(() =>
            expect(screen.getByText('not the target')).toBeInTheDocument(),
        );

        await act(async () => {
            select(id, 'text');
        });
        expect(screen.getByText('the target')).toBeInTheDocument();
    });

    it('a sent bubble minimises while the agent works, and opens and minimises by hand', async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'hello');
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
        expect(api.session.bubbles[0]).toMatchObject({
            minimised: true,
            unread: true,
        });
        // Its marks stay on the page.
        expect(document.querySelector('[data-mark-number="1"]')).not.toBeNull();
        expect(
            document.querySelector(`[data-bubble-id="${id}"]`),
        ).toHaveAttribute('data-minimised', 'true');

        await act(async () => {
            api.expand(id);
        });
        expect(api.session.bubbles[0]).toMatchObject({
            minimised: false,
            unread: false,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));
        expect(api.session.bubbles[0].minimised).toBe(true);
    });

    it('where bubbles show no conversation, a sent bubble does not minimise', async () => {
        const Bare: FC = () => {
            api = useDesignMode(surface, {
                onSend,
                renderBubbleBody: null,
                picker: null,
                cancelSend,
                onBubbleRemoved: null,
            });
            return <>{api.element}</>;
        };
        let settle: (result: DesignSendResult) => void = () => {};
        onSend.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    settle = resolve;
                }),
        );
        renderWithProviders(<Bare />);
        await act(async () => {
            api.setOn(true);
        });
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        await act(async () => {
            api.send(id, 'hello');
        });
        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        expect(api.session.bubbles[0]).toMatchObject({
            status: 'sending',
            minimised: false,
        });
        await act(async () => {
            settle('queued');
        });
    });

    it("each bubble's marks take its own colour", async () => {
        await turnOn();
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        await act(async () => {
            api.send(api.session.bubbles[0].id, 'hello');
        });
        await waitFor(() =>
            expect(api.session.bubbles[0].status).toBe('thread'),
        );
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(2));
        const colors = [
            ...document.querySelectorAll<HTMLElement>('[data-mark-number]'),
        ].map((el) => el.style.getPropertyValue('--bubble-color'));
        expect(colors).toEqual(['#e03131', '#1971c2']);
    });
});
