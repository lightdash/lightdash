import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './useVoiceRecorder';

class FakeRecorder {
    static instances: FakeRecorder[] = [];

    state: 'inactive' | 'recording' = 'inactive';

    mimeType = 'audio/webm;codecs=opus';

    ondataavailable: ((event: { data: Blob }) => void) | null = null;

    onstop: (() => void) | null = null;

    constructor() {
        FakeRecorder.instances.push(this);
    }

    start() {
        this.state = 'recording';
    }

    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['abc']) });
        this.onstop?.();
    }
}

const trackStop = vi.fn();
const fakeStream = { getTracks: () => [{ stop: trackStop }] };
const scope = globalThis as unknown as { MediaRecorder?: unknown };
const setGetUserMedia = (impl: (() => Promise<unknown>) | undefined) => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: impl ? { getUserMedia: impl } : undefined,
    });
};

describe('useVoiceRecorder', () => {
    beforeEach(() => {
        FakeRecorder.instances = [];
        trackStop.mockClear();
        scope.MediaRecorder = FakeRecorder;
        setGetUserMedia(() => Promise.resolve(fakeStream));
    });

    afterEach(() => {
        delete scope.MediaRecorder;
        setGetUserMedia(undefined);
    });

    it('records and hands back the audio with when it started', async () => {
        const { result } = renderHook(() =>
            useVoiceRecorder({ now: () => 1500 }),
        );
        let voice = 'off';
        await act(async () => {
            voice = await result.current.start();
        });
        expect(voice).toBe('on');
        expect(result.current.listening).toBe(true);

        let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
        await act(async () => {
            recording = await result.current.stop();
        });
        expect(recording).toMatchObject({ startedAtMs: 1500 });
        expect(recording!.audio.size).toBe(3);
        expect(recording!.audio.type).toBe('audio/webm;codecs=opus');
        expect(trackStop).toHaveBeenCalled();
        expect(result.current.listening).toBe(false);
    });

    it('is off with a reason when the mic is blocked', async () => {
        setGetUserMedia(() =>
            Promise.reject(new DOMException('no', 'NotAllowedError')),
        );
        const { result } = renderHook(() => useVoiceRecorder({ now: () => 0 }));
        let voice = 'on';
        await act(async () => {
            voice = await result.current.start();
        });
        expect(voice).toBe('off');
        expect(result.current.offReason).toBe('blocked');
        await expect(result.current.stop()).resolves.toBeNull();
    });

    it('is off when there is no microphone', async () => {
        setGetUserMedia(() =>
            Promise.reject(new DOMException('no', 'NotFoundError')),
        );
        const { result } = renderHook(() => useVoiceRecorder({ now: () => 0 }));
        await act(async () => {
            await result.current.start();
        });
        expect(result.current.offReason).toBe('no-microphone');
    });

    it('is off when the browser cannot record', async () => {
        delete scope.MediaRecorder;
        const { result } = renderHook(() => useVoiceRecorder({ now: () => 0 }));
        let voice = 'on';
        await act(async () => {
            voice = await result.current.start();
        });
        expect(voice).toBe('off');
        expect(result.current.offReason).toBe('unsupported');
    });

    it('hands back nothing when stopped without recording', async () => {
        const { result } = renderHook(() => useVoiceRecorder({ now: () => 0 }));
        await expect(result.current.stop()).resolves.toBeNull();
    });
});
