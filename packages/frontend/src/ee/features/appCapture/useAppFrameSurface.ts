import { APP_SDK_CAPTURE_SCROLL_MESSAGE } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type ElementSelectedEvent } from '../../../features/apps/hooks/useAppSdkBridge';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { type CaptureTarget, type DesignSurface } from '../capture/types';

type Picked = { target: CaptureTarget; rect: DOMRect };

/** A running app's frame as a Design Mode surface: marked from outside, pictured and picked from inside. */
export const useAppFrameSurface = ({
    projectUuid,
    getFrame,
    captureScreenshot,
}: {
    projectUuid: string | null;
    /** The app's frame: the part of the page that can be marked. */
    getFrame: () => HTMLElement | null;
    /** The app's own picture of itself. Null when it cannot take one. */
    captureScreenshot: (() => Promise<Blob>) | null;
}): {
    surface: DesignSurface | null;
    /** The app's element picker reported a click: hand it to Design Mode's framePick. */
    elementSelected: (
        event: ElementSelectedEvent,
        framePick: (at: { x: number; y: number }) => void,
    ) => void;
} => {
    const lightdashApi = useLightdashApi();
    const { health } = useApp();
    // Read through refs so the surface keeps a stable identity.
    const getFrameRef = useRef(getFrame);
    getFrameRef.current = getFrame;
    // The element the app reported, only while its pick is being made.
    const pickedRef = useRef<Picked | null>(null);

    // How far the app says it has scrolled. A bundle built before the SDK
    // said so stays at zero, and its marks do not follow a scroll.
    const scrollRef = useRef({ x: 0, y: 0 });
    const scrollWatchersRef = useRef(new Set<() => void>());
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const frame = getFrameRef.current();
            if (!(frame instanceof HTMLIFrameElement)) return;
            if (event.source !== frame.contentWindow) return;
            const data: unknown = event.data;
            if (!data || typeof data !== 'object') return;
            const { type, x, y } = data as Record<string, unknown>;
            if (type !== APP_SDK_CAPTURE_SCROLL_MESSAGE) return;
            if (typeof x !== 'number' || typeof y !== 'number') return;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            scrollRef.current = { x, y };
            scrollWatchersRef.current.forEach((changed) => changed());
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const voiceTranscriptionAvailable =
        health.data?.ai.voiceTranscriptionAvailable;
    // No picture from the app, no Design Mode: marks need something to sit on.
    const surface = useMemo<DesignSurface | null>(
        () =>
            captureScreenshot && projectUuid
                ? {
                      getRegion: () =>
                          getFrameRef.current()?.getBoundingClientRect() ??
                          new DOMRect(),
                      getScroll: () => scrollRef.current,
                      // The app scrolls inside its own frame.
                      getScrollContainer: () => null,
                      watchScroll: (onChange) => {
                          scrollWatchersRef.current.add(onChange);
                          return () => {
                              scrollWatchersRef.current.delete(onChange);
                          };
                      },
                      frameSource: 'app',
                      grabAppImage: captureScreenshot,
                      // Tabs inside an app cannot be seen from outside it.
                      getTab: () => null,
                      resolveTarget: null,
                      pickAt: () => pickedRef.current,
                      transcribe: captureTranscriber(
                          lightdashApi,
                          projectUuid,
                          voiceTranscriptionAvailable,
                      ),
                  }
                : null,
        [
            captureScreenshot,
            lightdashApi,
            projectUuid,
            voiceTranscriptionAvailable,
        ],
    );

    const elementSelected = useCallback(
        (
            { label, rect }: ElementSelectedEvent,
            framePick: (at: { x: number; y: number }) => void,
        ) => {
            const frame = getFrameRef.current()?.getBoundingClientRect();
            if (!frame) return;
            // The app's pixels start at its frame's top left corner.
            const onPage = rect
                ? new DOMRect(
                      frame.left + rect.x,
                      frame.top + rect.y,
                      rect.width,
                      rect.height,
                  )
                : // An older bundle does not say where the element is.
                  new DOMRect(frame.right, frame.top, 0, 0);
            pickedRef.current = {
                target: { kind: 'element', id: label, label, parentId: null },
                rect: onPage,
            };
            framePick({
                x: onPage.x + onPage.width / 2,
                y: onPage.y + onPage.height / 2,
            });
            pickedRef.current = null;
        },
        [],
    );

    return { surface, elementSelected };
};
