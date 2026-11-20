import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Bubble, type DesignSession } from '../capture/designSession';
import { type DesignPayload } from '../capture/types';
import { useDesignBundle } from './useDesignBundle';

const bubble = (id: string): Bubble => ({
    id,
    homeTabUuid: null,
    anchor: { x: 0, y: 0 },
    status: 'queued',
    input: 'text',
    collection: null,
    sentMarks: [],
    threadId: null,
    agentUuid: null,
});

const sessionOf = (...ids: string[]): DesignSession => ({
    bubbles: ids.map(bubble),
    active: { kind: 'page' },
});

const payload = (
    bubbleId: string,
    typed: string,
    imageCount: number,
): DesignPayload => ({
    bubbleId,
    summary: `- ① circled for ${bubbleId}`,
    typed,
    marks: [],
    images: Array.from(
        { length: imageCount },
        (_, i) =>
            new File(['x'], `capture-${i + 1}.png`, { type: 'image/png' }),
    ),
    transcript: [],
});

const attach = vi.fn<(image: File) => Promise<void>>();
const submit = vi.fn<(prompt: string) => void>();
const close = vi.fn<(bubbleId: string) => void>();
const onDropped = vi.fn<(count: number) => void>();

type Props = { session: DesignSession; busy: boolean; attachedCount: number };

const setup = (initial: Props) =>
    renderHook(
        (props: Props) =>
            useDesignBundle({ ...props, attach, submit, close, onDropped }),
        { initialProps: initial },
    );

describe('useDesignBundle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        attach.mockResolvedValue(undefined);
    });

    it('Send all attaches every bubble’s screenshots and submits once', async () => {
        const props = {
            session: sessionOf('a', 'b'),
            busy: false,
            attachedCount: 0,
        };
        const { result } = setup(props);
        act(() => {
            expect(result.current.add(payload('a', 'bigger', 2))).toBe(
                'queued',
            );
            result.current.add(payload('b', 'darker', 1));
        });
        expect(result.current.chips.map((c) => c.label)).toEqual([
            'Bubble 1 · "bigger"',
            'Bubble 2 · "darker"',
        ]);

        act(() => result.current.sendAll());
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

        expect(attach.mock.calls.map(([file]) => file.name)).toEqual([
            'bubble-1-image-1.png',
            'bubble-1-image-2.png',
            'bubble-2-image-1.png',
        ]);
        const [prompt] = submit.mock.calls[0];
        expect(prompt).toContain('### Bubble 1');
        expect(prompt).toContain('bigger');
        expect(prompt).toContain('### Bubble 2');
        expect(prompt).toContain('Images: bubble-2-image-1.png');
        expect(close.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
        expect(onDropped).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.chips).toHaveLength(0));
    });

    it('Send all during a build waits and submits when the build finishes', async () => {
        const props = {
            session: sessionOf('a'),
            busy: true,
            attachedCount: 0,
        };
        const { result, rerender } = setup(props);
        act(() => {
            result.current.add(payload('a', 'bigger', 1));
        });
        act(() => result.current.sendAll());
        expect(result.current.waiting).toBe(true);
        expect(attach).not.toHaveBeenCalled();
        expect(submit).not.toHaveBeenCalled();

        // More can be bundled while the build runs.
        const more = { ...props, session: sessionOf('a', 'b') };
        rerender(more);
        act(() => {
            result.current.add(payload('b', 'darker', 0));
        });
        expect(submit).not.toHaveBeenCalled();

        rerender({ ...more, busy: false });
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0][0]).toContain('### Bubble 2');
        expect(attach).toHaveBeenCalledTimes(1);
        expect(result.current.waiting).toBe(false);
    });

    it('removing a chip drops its bubble and its images', async () => {
        const props = {
            session: sessionOf('a', 'b'),
            busy: false,
            attachedCount: 0,
        };
        const { result, rerender } = setup(props);
        act(() => {
            result.current.add(payload('a', 'bigger', 2));
            result.current.add(payload('b', 'darker', 1));
        });
        act(() => result.current.remove('a'));
        expect(close).toHaveBeenCalledWith('a');
        // The host's close takes the bubble out of the session.
        rerender({ ...props, session: sessionOf('b') });
        expect(result.current.chips.map((c) => c.bubbleId)).toEqual(['b']);

        close.mockClear();
        act(() => result.current.sendAll());
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(attach.mock.calls.map(([file]) => file.name)).toEqual([
            'bubble-1-image-1.png',
        ]);
        expect(submit.mock.calls[0][0]).not.toContain('bigger');
        expect(close.mock.calls.map(([id]) => id)).toEqual(['b']);
    });

    it('closing a bubble on the page drops it from the bundle', () => {
        const props = {
            session: sessionOf('a', 'b'),
            busy: false,
            attachedCount: 0,
        };
        const { result, rerender } = setup(props);
        act(() => {
            result.current.add(payload('a', 'bigger', 0));
            result.current.add(payload('b', 'darker', 0));
        });
        rerender({ ...props, session: sessionOf('a') });
        expect(result.current.chips.map((c) => c.bubbleId)).toEqual(['a']);
    });

    it('images that do not fit are left out and counted', async () => {
        const props = {
            session: sessionOf('a'),
            busy: false,
            attachedCount: MAX_APP_FILES_PER_VERSION - 1,
        };
        const { result } = setup(props);
        act(() => {
            result.current.add(payload('a', 'bigger', 3));
        });
        act(() => result.current.sendAll());
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(attach).toHaveBeenCalledTimes(1);
        expect(onDropped).toHaveBeenCalledWith(2);
        expect(submit.mock.calls[0][0]).toContain(
            'Images: bubble-1-image-1.png\n',
        );
    });

    it('waiting ends when the last bundled bubble is removed', () => {
        const props = { session: sessionOf('a'), busy: true, attachedCount: 0 };
        const { result, rerender } = setup(props);
        act(() => {
            result.current.add(payload('a', 'bigger', 0));
        });
        act(() => result.current.sendAll());
        expect(result.current.waiting).toBe(true);
        rerender({ ...props, session: sessionOf() });
        expect(result.current.waiting).toBe(false);
        rerender({ session: sessionOf(), busy: false, attachedCount: 0 });
        expect(submit).not.toHaveBeenCalled();
    });
});
