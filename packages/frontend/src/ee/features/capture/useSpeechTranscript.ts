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

export const useSpeechTranscript = ({ now }: { now: () => number }) => {
    const recognitionRef = useRef<Recognition | null>(null);
    const runningRef = useRef(false);
    const phrasesRef = useRef<TranscriptPhrase[]>([]);
    const interimRef = useRef<{ atMs: number; text: string } | null>(null);
    const [liveText, setLiveText] = useState('');
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
                if (!Ctor) {
                    resolve('off');
                    return;
                }
                const recognition = new Ctor();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = navigator.language;
                recognition.onstart = () => resolve('on');
                recognition.onresult = (event) => {
                    for (
                        let i = event.resultIndex;
                        i < event.results.length;
                        i += 1
                    ) {
                        const result = event.results[i];
                        const text = result[0].transcript.trim();
                        // A phrase is timed from its first interim result.
                        const atMs =
                            interimRef.current?.atMs ?? nowRef.current();
                        if (result.isFinal) {
                            if (text) phrasesRef.current.push({ atMs, text });
                            interimRef.current = null;
                        } else if (text) {
                            interimRef.current = { atMs, text };
                        }
                    }
                    refreshLiveText();
                };
                recognition.onerror = (event) => {
                    if (BLOCKED_ERRORS.includes(event.error)) {
                        runningRef.current = false;
                        resolve('off');
                    }
                };
                // Chrome ends recognition after a pause; keep it going.
                recognition.onend = () => {
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
                    runningRef.current = false;
                    resolve('off');
                }
            }),
        [refreshLiveText],
    );

    const stop = useCallback((): TranscriptPhrase[] => {
        runningRef.current = false;
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        // Keep words still waiting to be finalised.
        if (interimRef.current) {
            phrasesRef.current.push(interimRef.current);
            interimRef.current = null;
        }
        return phrasesRef.current;
    }, []);

    return { start, stop, liveText };
};
