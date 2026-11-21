import { AI_THREAD_IMAGES_MAX_PER_PROMPT as CAP } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    type CaptureMark,
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

// What the page looks like: a different shade is a different screen.
let shade = 0;
const fakeFrame = () => ({
    bitmap: { close: vi.fn(), width: 100, height: 100 },
    thumb: new Uint8ClampedArray(16).fill(shade),
});

const transcribe = vi.fn();
let scroll = { x: 0, y: 0 };
let tab: { uuid: string; name: string } | null = null;
const surface: DesignSurface = {
    getRegion: () => new DOMRect(0, 0, 100, 100),
    getScroll: () => scroll,
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

const Harness: FC = () => {
    const [picker, setPicker] = useState<Picker | null>(null);
    showPicker = setPicker;
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
    fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(holdLayer(), { clientX: 70, clientY: 20 });
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
                parseFloat(this.style.getPropertyValue('--bubble-left')),
                parseFloat(this.style.getPropertyValue('--bubble-top')),
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
        tab = null;
        shade = 0;
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

    it('with the mic on, recording starts with the first stroke and Stop sends the words', async () => {
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
        // The key alone is not a mark: the mic waits for the pen to move.
        expect(startVoice).not.toHaveBeenCalled();
        await act(async () => {
            fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
        });
        expect(startVoice).toHaveBeenCalledTimes(1);
        fireEvent.mouseMove(holdLayer(), { clientX: 40, clientY: 40 });
        await keyUp({ key: 'Alt' });
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        expect(startVoice).toHaveBeenCalledTimes(1);
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
        expect(collected()).toHaveLength(1);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('Stop with marks and no words keeps the marks in a text box and sends nothing', async () => {
        await turnOn(true);
        await drawMark();
        await waitFor(() => expect(api.session.bubbles).toHaveLength(1));
        const { id } = api.session.bubbles[0];
        expect(api.session.bubbles[0].input).toBe('mic');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        // The recording comes back empty.
        await act(async () => {
            api.stop(id);
        });
        await waitFor(() => expect(api.session.bubbles[0].input).toBe('text'));
        expect(onSend).not.toHaveBeenCalled();
        expect(api.session.bubbles[0].status).toBe('collecting');
        expect(collected()).toHaveLength(1);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('an Option shortcut with the mic on does not touch the microphone', async () => {
        await turnOn(true);
        await keyDown({ key: 'Alt', altKey: true });
        await keyDown({ key: 'ArrowLeft', altKey: true });
        await keyUp({ key: 'ArrowLeft', altKey: true });
        await keyUp({ key: 'Alt' });
        await keyDown({ key: 'Alt', altKey: true });
        await keyUp({ key: 'Alt' });
        expect(startVoice).not.toHaveBeenCalled();
        expect(stopVoice).not.toHaveBeenCalled();
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
        expect(api.session.bubbles[0].input).toBe('text');
    });

    it('arming the mic while the reply is on its way out does not start a recording', async () => {
        await turnOn();
        const id = await sendFirst();
        await act(async () => {
            api.arm(id, 'mic');
        });
        expect(startVoice).toHaveBeenCalledTimes(1);

        let stopped: (audio: null) => void = () => {};
        stopVoice.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    stopped = resolve;
                }),
        );
        await act(async () => {
            api.stop(id);
        });
        // Still being stopped and transcribed: the Mic button does nothing.
        await act(async () => {
            api.arm(id, 'mic');
        });
        await act(async () => {
            stopped(null);
        });
        await act(async () => {});
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(stopVoice).toHaveBeenCalledTimes(1);
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
            shade = (i * 40) % 240;
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
                });
            };

            // Sent and at rest, it lives on its home tab.
            await changeTab('b', 1);
            expect(bubble()).toBeNull();
            await changeTab('a', 0);
            await act(async () => {
                api.arm(id, 'mic');
            });
            expect(startVoice).toHaveBeenCalledTimes(1);

            // The other tab is scrolled far past where the bubble was left.
            await changeTab('b', 900);
            expect(bubble()).not.toBeNull();
            expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
            const top = parseFloat(
                bubble()?.style.getPropertyValue('--bubble-top') ?? '',
            );
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
            const top = () =>
                parseFloat(
                    document
                        .querySelector<HTMLElement>('[data-bubble-id]')
                        ?.style.getPropertyValue('--bubble-top') ?? '',
                );
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
        expect(bubble()?.style.getPropertyValue('--bubble-top')).toBe(
            `${parseFloat(before ?? '') - 12}px`,
        );

        // Replying to it turns Design Mode back on.
        await act(async () => {
            api.arm(id, 'text');
        });
        expect(api.on).toBe(true);
        expect(api.session.active).toEqual({ kind: 'bubble', bubbleId: id });
    });

    it('leaving Design Mode throws away an unsent reply but keeps its thread', async () => {
        await turnOn();
        const id = await sendFirst();
        await act(async () => {
            api.arm(id, 'mic');
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

    it('a Control hold picks an element with each click', async () => {
        const target = {
            kind: 'tile',
            id: 't1',
            label: 'Revenue',
            parentId: null,
        };
        const other = {
            kind: 'tile',
            id: 't2',
            label: 'Orders',
            parentId: null,
        };
        surface.pickAt = (point) => ({
            target: point.x < 23 ? target : other,
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
            await waitFor(() =>
                expect(
                    api.session.bubbles[0]?.collection?.capture,
                ).toMatchObject({ marks: [{ number: 1 }, { number: 2 }] }),
            );
            expect(api.session.bubbles).toHaveLength(1);
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
                    { shape: 'pick', tool: 'cursor', target: other },
                ],
            });
        } finally {
            surface.pickAt = null;
        }
    });

    describe('on an app, which is picked from inside its own frame', () => {
        const element = {
            target: {
                kind: 'element',
                id: 'save',
                label: '[button "Save"]',
                parentId: null,
            },
            rect: new DOMRect(20, 20, 30, 10),
        };
        const useAppSurface = (picked: { current: typeof element | null }) => {
            surface.frameSource = 'app';
            surface.grabAppImage = async () => new Blob();
            surface.pickAt = () => picked.current;
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

        it('a Control hold leaves the pointer to the app, and its click is the pick', async () => {
            useAppSurface({ current: element });
            try {
                await turnOn();
                await keyDown({ key: 'Control', ctrlKey: true });
                expect(api.holding).toBe('cursor');
                // The click has to reach the app's own element picker.
                expect(
                    document.querySelector('[data-holding="true"]'),
                ).toBeNull();

                await act(async () => {
                    api.framePick({ x: 35, y: 25 });
                    api.framePick({ x: 35, y: 25 });
                });
                await waitFor(() =>
                    expect(api.session.bubbles).toHaveLength(1),
                );
                const capture = api.session.bubbles[0].collection?.capture;
                const marks =
                    capture?.status === 'recording' ? capture.marks : [];
                expect(marks).toHaveLength(1);
                expect(marks[0]).toMatchObject({
                    tool: 'cursor',
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
                await keyUp({ key: 'Control' });
            } finally {
                restoreSurface();
            }
        });

        it('the click moving focus into the app does not end the hold', async () => {
            useAppSurface({ current: element });
            const focused = vi.spyOn(document, 'activeElement', 'get');
            const blurWindow = () =>
                act(async () => {
                    window.dispatchEvent(new Event('blur'));
                    await new Promise((resolve) => setTimeout(resolve, 0));
                });
            try {
                await turnOn();
                await keyDown({ key: 'Control', ctrlKey: true });
                focused.mockReturnValue(document.createElement('iframe'));
                await blurWindow();
                expect(api.holding).toBe('cursor');

                // Focus leaving for anywhere else ends it as before.
                focused.mockReturnValue(document.body);
                await blurWindow();
                expect(api.holding).toBeNull();
            } finally {
                focused.mockRestore();
                restoreSurface();
            }
        });

        it('a pick with no Control hold is ignored', async () => {
            useAppSurface({ current: element });
            try {
                await turnOn();
                await act(async () => {
                    api.framePick({ x: 35, y: 25 });
                });
                expect(api.session.bubbles).toHaveLength(0);
                expect(grabAppFrame).not.toHaveBeenCalled();
            } finally {
                restoreSurface();
            }
        });

        it('hold keys pressed inside the app start and end a hold', async () => {
            useAppSurface({ current: null });
            try {
                await turnOn();
                await act(async () => {
                    api.frameHold('stylus', 'down');
                });
                expect(api.holding).toBe('stylus');
                // The release of the other key is not this hold's.
                await act(async () => {
                    api.frameHold('cursor', 'up');
                });
                expect(api.holding).toBe('stylus');
                await act(async () => {
                    api.frameHold('stylus', 'up');
                });
                expect(api.holding).toBeNull();
            } finally {
                restoreSurface();
            }
        });

        it('hold keys from the app do nothing while Design Mode is off', async () => {
            renderWithProviders(<Harness />);
            await act(async () => {
                api.frameHold('stylus', 'down');
            });
            expect(api.holding).toBeNull();
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
        fireEvent.mouseMove(holdLayer(), { clientX: 10, clientY: 10 });
        await keyDown({ key: 'e', altKey: true });
        await keyUp({ key: 'e', altKey: true });
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
        expect(screen.getByLabelText('Mark 1')).toBeInTheDocument();

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
        const rects = mockBubbleRects();
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
                expect(screen.getByLabelText('Mark 2')).toBeInTheDocument(),
            );
            expect(api.session.bubbles[0].anchor).toEqual(first);

            await keyDown({ key: 'Alt', altKey: true });
            fireEvent.mouseMove(holdLayer(), { clientX: 80, clientY: 10 });
            fireEvent.mouseMove(holdLayer(), { clientX: 99, clientY: 40 });
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
                expect(px(bubbles()[0], '--bubble-top')).toBeLessThan(0);
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
                fireEvent.mouseMove(holdLayer(), {
                    clientX: dropped.x + 5,
                    clientY: dropped.y,
                });
                fireEvent.mouseMove(holdLayer(), {
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
            api.arm(id, 'text');
        });
        expect(screen.getByText('the target')).toBeInTheDocument();
    });
});
