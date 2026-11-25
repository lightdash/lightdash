import { APP_SDK_CAPTURE_SCROLL_MESSAGE } from '@lightdash/common';
import { useEffect, useMemo, useRef } from 'react';
import { type InspectedElement } from '../../../features/apps/hooks/useIframeInspectAt';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { type DesignSurface, type PickedElement } from '../capture/types';

type InspectAt = (point: {
    x: number;
    y: number;
}) => Promise<InspectedElement | null>;

// The app's pixels start at its frame's top left corner.
const pickInFrame = async (
    frameElement: HTMLElement | null,
    inspectAt: InspectAt,
    point: { x: number; y: number },
): Promise<PickedElement | null> => {
    const frame = frameElement?.getBoundingClientRect();
    if (!frame) return null;
    const found = await inspectAt({
        x: point.x - frame.left,
        y: point.y - frame.top,
    });
    if (!found) return null;
    const { label, rect } = found;
    return {
        target: { kind: 'element', id: label, label, parentId: null },
        rect: new DOMRect(
            frame.left + rect.x,
            frame.top + rect.y,
            rect.width,
            rect.height,
        ),
    };
};

/** A running app's frame as a Design Mode surface: marked from outside, pictured and picked by asking the app. */
export const useAppFrameSurface = ({
    projectUuid,
    getFrame,
    captureScreenshot,
    inspectAt,
}: {
    projectUuid: string | null;
    /** The app's frame: the part of the page that can be marked. */
    getFrame: () => HTMLElement | null;
    /** The app's own picture of itself. Null when it cannot take one. */
    captureScreenshot: (() => Promise<Blob>) | null;
    /** Asks the app what element is at a point in its own pixels. */
    inspectAt: InspectAt;
}): { surface: DesignSurface | null } => {
    const lightdashApi = useLightdashApi();
    const { health } = useApp();
    // Read through refs so the surface keeps a stable identity.
    const getFrameRef = useRef(getFrame);
    getFrameRef.current = getFrame;
    const inspectAtRef = useRef(inspectAt);
    inspectAtRef.current = inspectAt;

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
                      getAnchors: null,
                      pickAt: (point) =>
                          pickInFrame(
                              getFrameRef.current(),
                              inspectAtRef.current,
                              point,
                          ),
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

    return { surface };
};
