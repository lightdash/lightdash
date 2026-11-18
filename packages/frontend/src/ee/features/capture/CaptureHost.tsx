import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { type CaptureSurface } from './types';
import { useCapture } from './useCapture';

export type CaptureHostHandle = { start: () => void };

type Props = {
    surface: CaptureSurface | null;
    onRecordingChange: (isRecording: boolean) => void;
};

// Capture state lives here so drawing never re-renders the host page.
const CaptureHost = forwardRef<CaptureHostHandle, Props>(
    ({ surface, onRecordingChange }, ref) => {
        const { start, isRecording, element } = useCapture(surface);
        useImperativeHandle(ref, () => ({ start }), [start]);
        useEffect(() => {
            onRecordingChange(isRecording);
        }, [isRecording, onRecordingChange]);
        return element;
    },
);

export default CaptureHost;
