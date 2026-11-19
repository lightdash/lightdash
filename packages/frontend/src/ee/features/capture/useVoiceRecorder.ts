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

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => releaseStream, [releaseStream]);

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
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                const recorder = new MediaRecorder(stream);
                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) chunksRef.current.push(event.data);
                };
                streamRef.current = stream;
                recorderRef.current = recorder;
                recorder.start();
                startedAtMsRef.current = nowRef.current();
                setListening(true);
                return 'on';
            } catch (error) {
                releaseStream();
                recorderRef.current = null;
                setOffReason(offReasonFor(error));
                return 'off';
            }
        },
        [releaseStream],
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

    return { start, stop, listening, offReason };
};
