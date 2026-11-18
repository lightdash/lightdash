import { Button } from '@mantine/core';
import { type FC } from 'react';

type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    onresult:
        | ((event: {
              results: ArrayLike<
                  ArrayLike<{ transcript: string }> & { isFinal: boolean }
              >;
          }) => void)
        | null;
    onerror: ((event: { error: string }) => void) | null;
    start: () => void;
};

/* eslint-disable no-console */
// Throwaway: proves tab capture, speech and Shift-after-click on a preview.
const runSpike = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        // @ts-expect-error Chrome-only option
        preferCurrentTab: true,
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    console.log(
        `[spike] frame ${video.videoWidth}x${video.videoHeight}, viewport ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
    );
    canvas.toBlob((blob) => {
        if (blob) window.open(URL.createObjectURL(blob), '_blank');
    });

    const Ctor = (
        window as unknown as {
            webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
    ).webkitSpeechRecognition;
    if (Ctor) {
        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
            const last = event.results[event.results.length - 1];
            console.log(
                `[spike] speech ${last.isFinal ? 'final' : 'interim'}: ${last[0].transcript}`,
            );
        };
        recognition.onerror = (event) =>
            console.log(`[spike] speech error: ${event.error}`);
        recognition.start();
    } else {
        console.log('[spike] no SpeechRecognition');
    }

    document.body.tabIndex = -1;
    window.addEventListener('blur', () => {
        setTimeout(() => {
            window.focus();
            document.body.focus();
            console.log('[spike] pulled focus back');
        }, 0);
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !e.repeat) console.log('[spike] Shift down');
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') console.log('[spike] Shift up');
    });
};

const CaptureSpike: FC = () => (
    <Button size="compact-xs" variant="default" onClick={() => void runSpike()}>
        Spike
    </Button>
);

export default CaptureSpike;
