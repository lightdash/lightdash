import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type CaptureSurface } from './types';
import { useCapture } from './useCapture';

const startVoice = vi.fn(() => Promise.resolve('on' as const));
const stopVoice = vi.fn(() => Promise.resolve(null));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastError: vi.fn(),
        showToastWarning: vi.fn(),
    }),
}));

vi.mock('./useVoiceRecorder', () => ({
    useVoiceRecorder: () => ({
        start: startVoice,
        stop: stopVoice,
        listening: false,
        offReason: null,
    }),
}));

vi.mock('./useTabFrame', () => ({
    useTabFrame: () => ({
        ensureStream: vi.fn(() => Promise.resolve({ ok: true })),
        grab: vi.fn(),
    }),
}));

const grabDomFrame = vi.fn();
vi.mock('./domFrame', () => ({
    grabDomFrame: (...args: unknown[]) => grabDomFrame(...args),
}));

const surface: CaptureSurface = {
    getRegion: () => new DOMRect(0, 0, 100, 100),
    captureImages: false,
    resolveTarget: null,
    transcribe: null,
    onCapture: vi.fn(),
};

describe('useCapture toggle', () => {
    beforeEach(() => {
        startVoice.mockClear();
        stopVoice.mockClear();
    });

    it('starts a recording, and the next toggle stops it', async () => {
        const { result } = renderHook(() => useCapture(surface));

        await act(async () => {
            result.current.toggle();
        });
        expect(startVoice).toHaveBeenCalledTimes(1);
        expect(result.current.isRecording).toBe(true);

        await act(async () => {
            result.current.toggle();
        });
        await waitFor(() => expect(result.current.isRecording).toBe(false));
        expect(stopVoice).toHaveBeenCalledTimes(1);
        expect(startVoice).toHaveBeenCalledTimes(1);
    });

    // Started from a key press inside the app frame: Shift must reach the page.
    it('takes focus back from an app frame when a recording starts', async () => {
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        frame.focus();
        const focusWindow = vi
            .spyOn(window, 'focus')
            .mockImplementation(() => {});
        const { result } = renderHook(() => useCapture(surface));

        await act(async () => {
            result.current.toggle();
        });
        expect(focusWindow).toHaveBeenCalled();

        focusWindow.mockRestore();
        frame.remove();
    });

    // The page passes no surface when the feature flag is off.
    it('does nothing when capture is off for the page', async () => {
        const { result } = renderHook(() => useCapture(null));

        await act(async () => {
            result.current.toggle();
        });
        expect(startVoice).not.toHaveBeenCalled();
        expect(result.current.isRecording).toBe(false);
    });
});

describe('useCapture on a page drawn from the DOM', () => {
    const domSurface: CaptureSurface = {
        ...surface,
        captureImages: true,
        frameSource: 'dom',
    };

    // Drawing the page blocks the pen, so it waits until Shift is let go.
    it('does not draw the page when Shift is pressed', async () => {
        grabDomFrame.mockClear();
        const { result } = renderHook(() => useCapture(domSurface));
        await act(async () => {
            result.current.toggle();
        });
        expect(result.current.isRecording).toBe(true);

        await act(async () => {
            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Shift' }),
            );
        });
        expect(grabDomFrame).not.toHaveBeenCalled();

        // Nothing was drawn, so there is nothing to take a picture for.
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
        });
        expect(grabDomFrame).not.toHaveBeenCalled();
    });
});
