import { useCallback, useEffect } from 'react';
import useFullscreen from './useFullscreen';

/**
 * Fullscreen context state paired with the browser's native Fullscreen API.
 * Toggling enters/exits native fullscreen and keeps the context in sync when
 * the browser exits on its own (e.g. the user presses Esc).
 */
const useNativeFullscreenToggle = () => {
    const { enabled, isFullscreen, toggleFullscreen } = useFullscreen();

    const handleToggleFullscreen = useCallback(async () => {
        if (!enabled) return;

        const willBeFullscreen = !isFullscreen;

        if (document.fullscreenElement && !willBeFullscreen) {
            await document.exitFullscreen();
        } else if (
            document.fullscreenEnabled &&
            !document.fullscreenElement &&
            willBeFullscreen
        ) {
            await document.documentElement.requestFullscreen();
        }

        toggleFullscreen();
    }, [enabled, isFullscreen, toggleFullscreen]);

    useEffect(() => {
        if (!enabled) return;

        const onFullscreenChange = () => {
            if (isFullscreen && !document.fullscreenElement) {
                toggleFullscreen(false);
            } else if (!isFullscreen && document.fullscreenElement) {
                toggleFullscreen(true);
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);

        return () =>
            document.removeEventListener(
                'fullscreenchange',
                onFullscreenChange,
            );
    }, [enabled, isFullscreen, toggleFullscreen]);

    return { enabled, isFullscreen, handleToggleFullscreen };
};

export default useNativeFullscreenToggle;
