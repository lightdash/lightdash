import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { type CaptureSurface } from './types';
import { useCapture } from './useCapture';

export type CaptureHostHandle = {
    start: () => void;
    /** The hotkey's action, for key presses the page cannot see itself. */
    toggle: () => void;
};

type Props = {
    surface: CaptureSurface | null;
    onRecordingChange: (isRecording: boolean) => void;
};

// Capture state lives here so drawing never re-renders the host page.
const CaptureHost = forwardRef<CaptureHostHandle, Props>(
    ({ surface, onRecordingChange }, ref) => {
        const { start, toggle, isRecording, element } = useCapture(surface);
        useImperativeHandle(ref, () => ({ start, toggle }), [start, toggle]);
        useEffect(() => {
            onRecordingChange(isRecording);
        }, [isRecording, onRecordingChange]);
        return element;
    },
);

export default CaptureHost;
