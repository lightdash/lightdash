import { APP_SDK_CAPTURE_SCROLL_MESSAGE } from '@lightdash/common';
import { act } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type BubbleReplyPost } from '../aiCopilot/components/BubbleThread/BubbleReplyPoster';
import { TYPED_WORDS_MARK } from '../capture/buildDesignPrompt';
import { type Bubble, type DesignSession } from '../capture/designSession';
import {
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
    type DesignTool,
} from '../capture/types';
import { type BubbleSendInput } from '../capture/useBubbleSend';
import AppViewDesignMode, {
    type AppViewDesignModeHandle,
} from './AppViewDesignMode';

type DesignOpts = {
    onSend: (payload: DesignPayload) => Promise<DesignSendResult>;
    renderBubbleBody:
        | ((bubble: Bubble, session: DesignSession) => ReactNode)
        | null;
};

const mocks = vi.hoisted(() => ({
    surface: null as unknown,
    opts: null as unknown,
    design: {
        on: false,
        setOn: vi.fn(),
        holding: null as string | null,
        session: { bubbles: [], active: { kind: 'page' } } as unknown,
        arm: vi.fn(),
        send: vi.fn(),
        expand: vi.fn(),
        framePick: vi.fn(),
        frameHold: vi.fn(),
    },
    bubbleSend: vi.fn(),
    replyPost: vi.fn(),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        // The test providers read `rudder` from the same health data.
        health: {
            data: { ai: { voiceTranscriptionAvailable: true }, rudder: {} },
        },
    }),
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));
vi.mock('../capture/useDesignMode', () => ({
    useDesignMode: (surface: unknown, opts: unknown) => {
        mocks.surface = surface;
        mocks.opts = opts;
        return { ...mocks.design, element: null };
    },
}));
vi.mock('../capture/useBubbleSend', () => ({
    useBubbleSend: () => ({
        send: mocks.bubbleSend,
        cancel: vi.fn(),
        picker: null,
    }),
}));
vi.mock('../aiCopilot/components/BubbleThread/BubbleThread', () => ({
    BubbleThread: () => null,
}));
// Stands in for the thread's own way of posting a reply.
vi.mock('../aiCopilot/components/BubbleThread/BubbleReplyPoster', () => ({
    default: ({
        bubbleId,
        register,
    }: {
        bubbleId: string;
        register: (bubbleId: string, post: BubbleReplyPost | null) => void;
    }) => {
        register(bubbleId, mocks.replyPost);
        return null;
    },
}));

const opts = () => mocks.opts as DesignOpts;
const surface = () => mocks.surface as DesignSurface | null;
const image = new File(['x'], 'capture-0.jpg', { type: 'image/jpeg' });
const screenshot = vi.fn(async () => new Blob(['x'], { type: 'image/png' }));
const onStateChange = vi.fn<(on: boolean, picking: boolean) => void>();

const payload = (overrides: Partial<DesignPayload>): DesignPayload => ({
    bubbleId: 'bubble-1',
    summary: '- ① (0:01) picked "[button "Save"]"',
    typed: 'make this green',
    marks: [],
    images: [image],
    transcript: [],
    ...overrides,
});

const bubble = (overrides: Partial<Bubble>): Bubble => ({
    id: 'bubble-1',
    homeTabUuid: null,
    anchor: { x: 0, y: 0 },
    status: 'collecting',
    input: 'text',
    collection: null,
    sentMarks: [],
    threadId: null,
    agentUuid: null,
    color: 0,
    minimised: false,
    unread: false,
    sendFailed: false,
    ...overrides,
});

// The app's frame sits 100 across and 50 down the page.
const frame = document.createElement('iframe');
frame.getBoundingClientRect = () => new DOMRect(100, 50, 800, 600);

const renderDesign = (
    overrides: {
        captureScreenshot?: (() => Promise<Blob>) | null;
        attachedAppUuid?: string | null;
    } = {},
) => {
    const ref = createRef<AppViewDesignModeHandle>();
    const view = renderWithProviders(
        <AppViewDesignMode
            ref={ref}
            projectUuid="project-1"
            attachedAppUuid={
                overrides.attachedAppUuid === undefined
                    ? 'app-1'
                    : overrides.attachedAppUuid
            }
            appName="Sales pulse"
            getFrame={() => frame}
            captureScreenshot={
                overrides.captureScreenshot === undefined
                    ? screenshot
                    : overrides.captureScreenshot
            }
            onStateChange={onStateChange}
        />,
    );
    const handle = () => {
        if (!ref.current) throw new Error('Design Mode is not mounted');
        return ref.current;
    };
    return { ...view, handle };
};

describe('AppViewDesignMode', () => {
    beforeEach(() => {
        mocks.surface = null;
        mocks.opts = null;
        mocks.design.on = false;
        mocks.design.holding = null;
        mocks.design.session = { bubbles: [], active: { kind: 'page' } };
        mocks.design.setOn.mockClear();
        mocks.design.framePick.mockReset();
        mocks.design.frameHold.mockClear();
        mocks.bubbleSend.mockReset();
        mocks.replyPost.mockReset();
        onStateChange.mockClear();
    });

    it('not offered when the app cannot take its own screenshot', () => {
        renderDesign({ captureScreenshot: null });
        expect(surface()).toBeNull();
    });

    it('pictures come from the app itself, which has no tabs', () => {
        renderDesign();
        expect(surface()?.frameSource).toBe('app');
        expect(surface()?.grabAppImage).toBe(screenshot);
        expect(surface()?.getTab()).toBeNull();
        expect(surface()?.getRegion()).toEqual(new DOMRect(100, 50, 800, 600));
        expect(surface()?.transcribe).not.toBeNull();
    });

    it("marks follow the app's own scroll, which only the app can report", () => {
        Object.defineProperty(frame, 'contentWindow', {
            value: window,
            configurable: true,
        });
        const say = (data: unknown, source: Window | null = window) =>
            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', { data, source }),
                );
            });
        try {
            renderDesign();
            const changed = vi.fn();
            const unwatch = surface()?.watchScroll?.(changed);
            expect(surface()?.getScroll()).toEqual({ x: 0, y: 0 });

            say({ type: APP_SDK_CAPTURE_SCROLL_MESSAGE, x: 0, y: 240 });
            expect(surface()?.getScroll()).toEqual({ x: 0, y: 240 });
            expect(changed).toHaveBeenCalledTimes(1);

            // Not from the app, or not an offset: ignored.
            say({ type: APP_SDK_CAPTURE_SCROLL_MESSAGE, x: 0, y: 900 }, null);
            say({ type: APP_SDK_CAPTURE_SCROLL_MESSAGE, x: 'left', y: 900 });
            say({ type: 'lightdash:sdk:something-else', x: 0, y: 900 });
            expect(surface()?.getScroll()).toEqual({ x: 0, y: 240 });
            expect(changed).toHaveBeenCalledTimes(1);

            unwatch?.();
            say({ type: APP_SDK_CAPTURE_SCROLL_MESSAGE, x: 0, y: 0 });
            expect(surface()?.getScroll()).toEqual({ x: 0, y: 0 });
            expect(changed).toHaveBeenCalledTimes(1);
        } finally {
            Reflect.deleteProperty(frame, 'contentWindow');
        }
    });

    it('a send carries the app and the screenshot', async () => {
        mocks.bubbleSend.mockResolvedValue({
            threadId: 'thread-1',
            agentUuid: 'agent-1',
        });
        mocks.design.session = {
            bubbles: [bubble({})],
            active: { kind: 'bubble', bubbleId: 'bubble-1' },
        };
        renderDesign();

        const result = await opts().onSend(payload({}));

        expect(result).toEqual({ threadId: 'thread-1', agentUuid: 'agent-1' });
        const [sent] = mocks.bubbleSend.mock.calls[0] as [BubbleSendInput];
        expect(sent.bubbleId).toBe('bubble-1');
        expect(sent.images).toEqual([image]);
        expect(sent.context).toEqual([{ type: 'data_app', appUuid: 'app-1' }]);
        expect(sent.buildPrompt(true)).toBe(
            [
                'These requests are about the data app "Sales pulse".',
                '- ① (0:01) picked "[button "Save"]"',
                `${TYPED_WORDS_MARK}make this green`,
            ].join('\n\n'),
        );
    });

    it('a reply in a bubble’s conversation carries the app too', async () => {
        mocks.replyPost.mockResolvedValue(undefined);
        mocks.design.session = {
            bubbles: [
                bubble({
                    status: 'thread',
                    threadId: 'thread-1',
                    agentUuid: 'agent-1',
                }),
            ],
            active: { kind: 'bubble', bubbleId: 'bubble-1' },
        };
        renderDesign();

        await opts().onSend(payload({ typed: 'and this one', summary: '' }));

        expect(mocks.bubbleSend).not.toHaveBeenCalled();
        const [posted] = mocks.replyPost.mock.calls[0] as [
            Parameters<BubbleReplyPost>[0],
        ];
        expect(posted.images).toEqual([image]);
        expect(posted.context).toEqual([
            { type: 'data_app', appUuid: 'app-1' },
        ]);
    });

    it('sends no app when there is none to attach', async () => {
        mocks.bubbleSend.mockResolvedValue('cancelled');
        renderDesign({ attachedAppUuid: null });
        await opts().onSend(payload({}));
        const [sent] = mocks.bubbleSend.mock.calls[0] as [BubbleSendInput];
        expect(sent.context).toEqual([]);
    });

    it('a Cursor hold turns the element picker on', () => {
        mocks.design.on = true;
        const { rerender, handle } = renderDesign();
        expect(onStateChange).toHaveBeenLastCalledWith(true, false);
        void handle;

        mocks.design.holding = 'cursor' satisfies DesignTool;
        rerender(
            <AppViewDesignMode
                projectUuid="project-1"
                attachedAppUuid="app-1"
                appName="Sales pulse"
                getFrame={() => frame}
                captureScreenshot={screenshot}
                onStateChange={onStateChange}
            />,
        );
        expect(onStateChange).toHaveBeenLastCalledWith(true, true);
    });

    it('an element picked in the app is marked where it is on the page', () => {
        const picked: unknown[] = [];
        mocks.design.framePick.mockImplementation(
            (point: { x: number; y: number }) => {
                picked.push({ point, hit: surface()?.pickAt?.(point) });
            },
        );
        const { handle } = renderDesign();

        handle().elementSelected({
            label: '[button "Save" @src/App.tsx:12]',
            rect: { x: 12, y: 34, width: 120, height: 40 },
        });

        expect(picked).toEqual([
            {
                point: { x: 172, y: 104 },
                hit: {
                    target: {
                        kind: 'element',
                        id: '[button "Save" @src/App.tsx:12]',
                        label: '[button "Save" @src/App.tsx:12]',
                        parentId: null,
                    },
                    rect: new DOMRect(112, 84, 120, 40),
                },
            },
        ]);
        // Nothing is picked until the app reports the next click.
        expect(surface()?.pickAt?.({ x: 172, y: 104 })).toBeNull();
    });

    it('an app that sends no rect is marked at its top right', () => {
        const rects: (DOMRect | undefined)[] = [];
        mocks.design.framePick.mockImplementation(
            (point: { x: number; y: number }) => {
                rects.push(surface()?.pickAt?.(point)?.rect);
            },
        );
        const { handle } = renderDesign();

        handle().elementSelected({ label: '[button "Save"]' });

        expect(rects).toEqual([new DOMRect(900, 50, 0, 0)]);
    });

    it('passes on hold keys and the toggle from inside the app', () => {
        const { handle } = renderDesign();

        handle().hold({ tool: 'stylus', phase: 'down' });
        expect(mocks.design.frameHold).toHaveBeenCalledWith('stylus', 'down');

        handle().toggle();
        expect(mocks.design.setOn).toHaveBeenLastCalledWith(true);
    });
});
