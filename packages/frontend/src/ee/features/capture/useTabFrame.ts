import { useCallback, useEffect, useRef } from 'react';
import { cropRectForRegion, isThisTab } from './frameGeometry';

export type TabFrame = { bitmap: ImageBitmap; thumb: Uint8ClampedArray };
export type TabFrameError = 'denied' | 'wrong-surface' | 'unsupported';

const THUMB_SIZE = 64;
// Tab capture only emits frames when pixels change, so never wait long.
const FRESH_FRAME_WAIT_MS = 80;

const waitForFreshFrame = (video: HTMLVideoElement): Promise<void> =>
    new Promise((resolve) => {
        const timer = window.setTimeout(resolve, FRESH_FRAME_WAIT_MS);
        if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(() => {
                window.clearTimeout(timer);
                resolve();
            });
        }
    });

const toThumb = (bitmap: ImageBitmap): Uint8ClampedArray => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return new Uint8ClampedArray(0);
    context.drawImage(bitmap, 0, 0, THUMB_SIZE, THUMB_SIZE);
    const { data } = context.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
    const grey = new Uint8ClampedArray(THUMB_SIZE * THUMB_SIZE);
    for (let i = 0; i < grey.length; i += 1) {
        grey[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
    return grey;
};

export const useTabFrame = ({
    onStreamEnded,
}: {
    onStreamEnded: () => void;
}) => {
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const onStreamEndedRef = useRef(onStreamEnded);
    onStreamEndedRef.current = onStreamEnded;

    const release = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        videoRef.current = null;
    }, []);

    useEffect(() => release, [release]);

    const ensureStream = useCallback(async (): Promise<
        { ok: true } | { ok: false; error: TabFrameError }
    > => {
        if (streamRef.current?.active) return { ok: true };
        if (!navigator.mediaDevices?.getDisplayMedia) {
            return { ok: false, error: 'unsupported' };
        }
        const expectedHandle = crypto.randomUUID();
        const media = navigator.mediaDevices as MediaDevices & {
            setCaptureHandleConfig?: (config: {
                handle: string;
                permittedOrigins: string[];
            }) => void;
        };
        try {
            media.setCaptureHandleConfig?.({
                handle: expectedHandle,
                permittedOrigins: ['*'],
            });
        } catch {
            // Without a handle the shape check below still applies.
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
                // @ts-expect-error Chrome-only hints to offer this tab first
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
            });
        } catch {
            return { ok: false, error: 'denied' };
        }
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        try {
            await video.play();
        } catch {
            stream.getTracks().forEach((track) => track.stop());
            return { ok: false, error: 'denied' };
        }
        const track = stream.getVideoTracks()[0] as
            | (MediaStreamTrack & {
                  getCaptureHandle?: () => { handle?: string } | null;
              })
            | undefined;
        const fromThisTab = isThisTab({
            captureHandle: track?.getCaptureHandle?.()?.handle ?? null,
            expectedHandle,
            displaySurface: track?.getSettings().displaySurface ?? null,
            frame: { width: video.videoWidth, height: video.videoHeight },
            viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        if (!fromThisTab) {
            stream.getTracks().forEach((track) => track.stop());
            return { ok: false, error: 'wrong-surface' };
        }
        track?.addEventListener('ended', () => {
            streamRef.current = null;
            videoRef.current = null;
            onStreamEndedRef.current();
        });
        streamRef.current = stream;
        videoRef.current = video;
        return { ok: true };
    }, []);

    const grab = useCallback(async (region: DOMRect): Promise<TabFrame> => {
        const video = videoRef.current;
        if (!video) throw new Error('Tab capture is not running');
        // Two frames, so the hidden pill and cleared ink have left the stream.
        await waitForFreshFrame(video);
        await waitForFreshFrame(video);
        const crop = cropRectForRegion(
            {
                x: region.left,
                y: region.top,
                width: region.width,
                height: region.height,
            },
            { width: window.innerWidth, height: window.innerHeight },
            { width: video.videoWidth, height: video.videoHeight },
        );
        if (crop.width === 0 || crop.height === 0) {
            throw new Error('Capture area is off screen');
        }
        const bitmap = await createImageBitmap(
            video,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
        );
        return { bitmap, thumb: toThumb(bitmap) };
    }, []);

    return { ensureStream, grab, release };
};
