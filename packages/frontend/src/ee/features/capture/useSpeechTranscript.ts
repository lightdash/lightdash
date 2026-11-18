import { useCallback, useRef, useState } from 'react';
import { type TranscriptPhrase, type VoiceState } from './types';

type RecognitionResult = ArrayLike<{ transcript: string }> & {
    isFinal: boolean;
};
type RecognitionEvent = {
    resultIndex: number;
    results: ArrayLike<RecognitionResult>;
};
type Recognition = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

const getRecognitionConstructor = (): RecognitionConstructor | null => {
    const scope = window as unknown as {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

const BLOCKED_ERRORS = ['not-allowed', 'service-not-allowed'];
// Errors that happen in normal use and do not mean voice is broken.
const HARMLESS_ERRORS = ['no-speech', 'aborted'];
// Never let a silent recogniser hold up the start of a capture.
const START_TIMEOUT_MS = 4000;

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const useSpeechTranscript = ({ now }: { now: () => number }) => {
    const recognitionRef = useRef<Recognition | null>(null);
    const runningRef = useRef(false);
    const phrasesRef = useRef<TranscriptPhrase[]>([]);
    const interimRef = useRef<TranscriptPhrase | null>(null);
    const [liveText, setLiveText] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const nowRef = useRef(now);
    nowRef.current = now;

    const refreshLiveText = useCallback(() => {
        const parts = phrasesRef.current.map((phrase) => phrase.text);
        if (interimRef.current) parts.push(interimRef.current.text);
        setLiveText(parts.join(' '));
    }, []);

    const start = useCallback(
        (): Promise<VoiceState> =>
            new Promise((resolve) => {
                const Ctor = getRecognitionConstructor();
                phrasesRef.current = [];
                interimRef.current = null;
                setLiveText('');
                setProblem(null);
                if (!Ctor) {
                    resolve('off');
                    return;
                }
                const recognition = new Ctor();
                let started = false;
                let settled = false;
                const settle = (voice: VoiceState) => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(timer);
                    if (voice === 'off') runningRef.current = false;
                    resolve(voice);
                };
                const timer = window.setTimeout(
                    () => settle('off'),
                    START_TIMEOUT_MS,
                );

                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = navigator.language;
                recognition.onstart = () => {
                    started = true;
                    settle('on');
                };
                recognition.onresult = (event) => {
                    const pending: string[] = [];
                    for (
                        let i = event.resultIndex;
                        i < event.results.length;
                        i += 1
                    ) {
                        const result = event.results[i];
                        const text = tidy(result[0].transcript);
                        if (result.isFinal) {
                            // A phrase is timed from its first interim result.
                            const atMs =
                                interimRef.current?.atMs ?? nowRef.current();
                            if (text) phrasesRef.current.push({ atMs, text });
                            interimRef.current = null;
                        } else if (text) {
                            pending.push(text);
                        }
                    }
                    // Chrome splits unfinished speech into several results.
                    interimRef.current =
                        pending.length > 0
                            ? {
                                  atMs:
                                      interimRef.current?.atMs ??
                                      nowRef.current(),
                                  text: tidy(pending.join(' ')),
                              }
                            : null;
                    refreshLiveText();
                };
                recognition.onerror = (event) => {
                    if (!started || BLOCKED_ERRORS.includes(event.error)) {
                        settle('off');
                        runningRef.current = false;
                        return;
                    }
                    // Started but cannot transcribe: say so, stop retrying.
                    if (!HARMLESS_ERRORS.includes(event.error)) {
                        runningRef.current = false;
                        setProblem(event.error);
                    }
                };
                // Chrome ends recognition after a pause; keep it going.
                recognition.onend = () => {
                    if (!started) {
                        settle('off');
                        return;
                    }
                    if (!runningRef.current) return;
                    try {
                        recognition.start();
                    } catch {
                        runningRef.current = false;
                    }
                };
                recognitionRef.current = recognition;
                runningRef.current = true;
                try {
                    recognition.start();
                } catch {
                    settle('off');
                }
            }),
        [refreshLiveText],
    );

    const stop = useCallback((): TranscriptPhrase[] => {
        runningRef.current = false;
        const recognition = recognitionRef.current;
        if (recognition) {
            // Late results must not change what has been handed back.
            recognition.onresult = null;
            recognition.onend = null;
            recognition.onerror = null;
            recognition.stop();
        }
        recognitionRef.current = null;
        const phrases = [...phrasesRef.current];
        if (interimRef.current) phrases.push(interimRef.current);
        interimRef.current = null;
        return phrases;
    }, []);

    return { start, stop, liveText, problem };
};
