import { useCallback, useEffect, useRef, useState } from 'react';
import { type VoiceState } from './types';

export type VoiceRecording = {
    audio: Blob;
    /** Capture-clock time at which the audio starts. */
    startedAtMs: number;
};

export type VoiceOffReason =
    | 'blocked'
    | 'no-microphone'
    | 'unsupported'
    /** The instance cannot transcribe, so the microphone is never asked for. */
    | 'not-set-up';

const offReasonFor = (error: unknown): VoiceOffReason => {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return 'no-microphone';
    }
    return 'blocked';
};

/** Records the microphone for the length of a capture. */
export const useVoiceRecorder = ({ now }: { now: () => number }) => {
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtMsRef = useRef(0);
    const [listening, setListening] = useState(false);
    const [offReason, setOffReason] = useState<VoiceOffReason | null>(null);
    const nowRef = useRef(now);
    nowRef.current = now;

    // Kept open between recordings, so one starts without losing first words.
    const warmRef = useRef(false);
    const openingRef = useRef<Promise<MediaStream> | null>(null);

    const closeStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const releaseStream = useCallback(() => {
        if (!warmRef.current) closeStream();
    }, [closeStream]);

    useEffect(
        () => () => {
            warmRef.current = false;
            closeStream();
        },
        [closeStream],
    );

    const openStream = useCallback((): Promise<MediaStream> => {
        const live = streamRef.current;
        if (live?.getTracks().some((track) => track.readyState === 'live')) {
            return Promise.resolve(live);
        }
        if (openingRef.current) return openingRef.current;
        const opening = navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                streamRef.current = stream;
                return stream;
            })
            .finally(() => {
                openingRef.current = null;
            });
        openingRef.current = opening;
        return opening;
    }, []);

    /** Opens the microphone ahead of the next recording, or lets it go. */
    const setWarm = useCallback(
        (warm: boolean) => {
            warmRef.current = warm;
            if (!warm) {
                if (!recorderRef.current) closeStream();
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia) return;
            openStream().then(
                () => {
                    // Let go while it was opening.
                    if (!warmRef.current && !recorderRef.current) closeStream();
                },
                () => {},
            );
        },
        [closeStream, openStream],
    );

    const start = useCallback(
        async ({ available }: { available: boolean }): Promise<VoiceState> => {
            setListening(false);
            setOffReason(null);
            chunksRef.current = [];
            if (!available) {
                setOffReason('not-set-up');
                return 'off';
            }
            if (
                typeof MediaRecorder === 'undefined' ||
                !navigator.mediaDevices?.getUserMedia
            ) {
                setOffReason('unsupported');
                return 'off';
            }
            try {
                const stream = await openStream();
                const recorder = new MediaRecorder(stream);
                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) chunksRef.current.push(event.data);
                };
                recorderRef.current = recorder;
                recorder.start();
                startedAtMsRef.current = nowRef.current();
                setListening(true);
                return 'on';
            } catch (error) {
                closeStream();
                recorderRef.current = null;
                setOffReason(offReasonFor(error));
                return 'off';
            }
        },
        [closeStream, openStream],
    );

    const stop = useCallback(
        (): Promise<VoiceRecording | null> =>
            new Promise((resolve) => {
                const recorder = recorderRef.current;
                recorderRef.current = null;
                setListening(false);
                if (!recorder || recorder.state === 'inactive') {
                    releaseStream();
                    resolve(null);
                    return;
                }
                recorder.onstop = () => {
                    releaseStream();
                    const audio = new Blob(chunksRef.current, {
                        type: recorder.mimeType,
                    });
                    chunksRef.current = [];
                    resolve(
                        audio.size > 0
                            ? { audio, startedAtMs: startedAtMsRef.current }
                            : null,
                    );
                };
                recorder.stop();
            }),
        [releaseStream],
    );

    return { start, stop, setWarm, listening, offReason };
};
