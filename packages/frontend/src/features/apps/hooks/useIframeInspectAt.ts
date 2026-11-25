import {
    APP_SDK_INSPECT_AT_AVAILABLE_MESSAGE,
    APP_SDK_INSPECT_AT_MESSAGE,
    APP_SDK_INSPECT_AT_RESPONSE_MESSAGE,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { parseElementRect, type ElementSelectedEvent } from './useAppSdkBridge';

const INSPECT_AT_TIMEOUT_MS = 2_000;

/** What the app says is at a point: the label and bounds (iframe viewport pixels) of an element. */
export type InspectedElement = Required<ElementSelectedEvent>;

type Pending = {
    resolve: (element: InspectedElement | null) => void;
    timer: ReturnType<typeof setTimeout>;
};

const parseElement = (value: unknown): InspectedElement | null => {
    if (!value || typeof value !== 'object') return null;
    const { label, rect } = value as Record<string, unknown>;
    if (typeof label !== 'string' || label === '') return null;
    const parsed = parseElementRect(rect);
    return parsed ? { label, rect: parsed } : null;
};

/**
 * Asks the app in the iframe which element is at a point. A bundle that never
 * announced it can answer gets null at once, and so does one that is slow.
 */
export function useIframeInspectAt(
    iframeRef: RefObject<HTMLIFrameElement | null>,
    /** A new bundle has to announce again. */
    identityKey: string | undefined,
) {
    const pending = useRef<Map<string, Pending>>(new Map());
    const availableRef = useRef(false);

    useEffect(() => {
        availableRef.current = false;
    }, [identityKey]);

    useEffect(() => {
        const requests = pending.current;
        const handleMessage = (event: MessageEvent) => {
            // Same check as `useIframeScreenshot`: the opaque sandbox origin
            // is "null", so the sender is known by its window.
            if (event.source !== iframeRef.current?.contentWindow) return;
            const { data } = event;
            if (data?.type === APP_SDK_INSPECT_AT_AVAILABLE_MESSAGE) {
                availableRef.current = true;
                return;
            }
            if (data?.type !== APP_SDK_INSPECT_AT_RESPONSE_MESSAGE) return;
            const request =
                typeof data.id === 'string' ? requests.get(data.id) : undefined;
            if (!request) return;
            clearTimeout(request.timer);
            requests.delete(data.id);
            request.resolve(parseElement(data.element));
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
            requests.forEach((request) => {
                clearTimeout(request.timer);
                request.resolve(null);
            });
            requests.clear();
        };
    }, [iframeRef]);

    const inspectAt = useCallback(
        (point: { x: number; y: number }): Promise<InspectedElement | null> => {
            const target = iframeRef.current?.contentWindow;
            if (!target || !availableRef.current) return Promise.resolve(null);
            const id = crypto.randomUUID();
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    pending.current.delete(id);
                    resolve(null);
                }, INSPECT_AT_TIMEOUT_MS);
                pending.current.set(id, { resolve, timer });
                // Wildcard target, as for every message to the sandboxed
                // iframe: its origin is opaque. The payload is two numbers.
                target.postMessage(
                    {
                        type: APP_SDK_INSPECT_AT_MESSAGE,
                        id,
                        x: point.x,
                        y: point.y,
                    },
                    '*',
                );
            });
        },
        [iframeRef],
    );

    return { inspectAt };
}
