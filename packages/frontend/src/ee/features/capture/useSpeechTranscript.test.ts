import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechTranscript } from './useSpeechTranscript';

type FakeResult = { transcript: string; isFinal: boolean };

class FakeRecognition {
    static instances: FakeRecognition[] = [];

    static startBehaviour: 'start' | 'silent' = 'start';

    continuous = false;

    interimResults = false;

    lang = '';

    onstart: (() => void) | null = null;

    onresult:
        | ((event: { resultIndex: number; results: unknown }) => void)
        | null = null;

    onerror: ((event: { error: string }) => void) | null = null;

    onend: (() => void) | null = null;

    constructor() {
        FakeRecognition.instances.push(this);
    }

    start() {
        if (FakeRecognition.startBehaviour === 'start') this.onstart?.();
    }

    stop() {}

    emit(results: FakeResult[], resultIndex = 0) {
        this.onresult?.({
            resultIndex,
            results: results.map((r) =>
                Object.assign([{ transcript: r.transcript }], {
                    isFinal: r.isFinal,
                }),
            ),
        });
    }
}

const scope = window as unknown as { webkitSpeechRecognition?: unknown };
const last = () =>
    FakeRecognition.instances[FakeRecognition.instances.length - 1];

describe('useSpeechTranscript', () => {
    beforeEach(() => {
        FakeRecognition.instances = [];
        FakeRecognition.startBehaviour = 'start';
        scope.webkitSpeechRecognition = FakeRecognition;
    });

    afterEach(() => {
        delete scope.webkitSpeechRecognition;
        vi.useRealTimers();
    });

    it('is off when the browser has no speech recognition', async () => {
        delete scope.webkitSpeechRecognition;
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        await expect(result.current.start()).resolves.toBe('off');
    });

    it('is on once recognition starts', async () => {
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        await expect(result.current.start()).resolves.toBe('on');
    });

    it('is off when the mic is refused', async () => {
        FakeRecognition.startBehaviour = 'silent';
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        const started = result.current.start();
        last().onerror?.({ error: 'not-allowed' });
        await expect(started).resolves.toBe('off');
    });

    it('is off, not stuck, when there is no mic device', async () => {
        FakeRecognition.startBehaviour = 'silent';
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        const started = result.current.start();
        last().onerror?.({ error: 'audio-capture' });
        last().onend?.();
        await expect(started).resolves.toBe('off');
        expect(FakeRecognition.instances).toHaveLength(1);
    });

    it('is off when recognition never starts', async () => {
        vi.useFakeTimers();
        FakeRecognition.startBehaviour = 'silent';
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        const started = result.current.start();
        vi.advanceTimersByTime(4000);
        await expect(started).resolves.toBe('off');
    });

    it('times a phrase from its first interim result', async () => {
        let clock = 0;
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => clock }),
        );
        await result.current.start();
        clock = 1200;
        act(() => last().emit([{ transcript: 'this', isFinal: false }]));
        clock = 2500;
        act(() => last().emit([{ transcript: 'this chart', isFinal: true }]));
        expect(result.current.stop()).toEqual([
            { atMs: 1200, text: 'this chart' },
        ]);
    });

    it('keeps the whole unfinished phrase when stopped mid-sentence', async () => {
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 700 }),
        );
        await result.current.start();
        act(() =>
            last().emit([
                { transcript: 'make the title', isFinal: false },
                { transcript: ' bigger', isFinal: false },
            ]),
        );
        expect(result.current.liveText).toBe('make the title bigger');
        expect(result.current.stop()).toEqual([
            { atMs: 700, text: 'make the title bigger' },
        ]);
    });

    it('ignores results that arrive after stop', async () => {
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        await result.current.start();
        const recognition = last();
        act(() => recognition.emit([{ transcript: 'hello', isFinal: false }]));
        const phrases = result.current.stop();
        recognition.emit([{ transcript: 'hello', isFinal: true }]);
        expect(phrases).toEqual([{ atMs: 0, text: 'hello' }]);
    });

    it('reports a recogniser that starts but cannot transcribe', async () => {
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        await result.current.start();
        expect(result.current.problem).toBeNull();
        act(() => last().onerror?.({ error: 'network' }));
        expect(result.current.problem).toBe('network');
    });

    it('does not treat a quiet moment as a problem', async () => {
        const { result } = renderHook(() =>
            useSpeechTranscript({ now: () => 0 }),
        );
        await result.current.start();
        act(() => last().onerror?.({ error: 'no-speech' }));
        expect(result.current.problem).toBeNull();
    });
});
