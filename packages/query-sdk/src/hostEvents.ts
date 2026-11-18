/**
 * App → host page events for embedded data apps.
 *
 * `emitEvent` posts one message to the Lightdash frame, which relays it to the
 * page embedding Lightdash as a `lightdash:appEvent` event. Outside an embed
 * nothing is listening and the event is dropped.
 */

/** Iframe → parent. The host wraps it before relaying; apps never pick the outer type. */
export type SdkAppEventMessage = {
    type: 'lightdash:sdk:app-event';
    name: string;
    payload: unknown;
};

export const APP_EVENT_MESSAGE = 'lightdash:sdk:app-event';

/** Keep in sync with the parent-side caps in useAppSdkBridge (packages/frontend). */
export const MAX_APP_EVENT_NAME_CHARS = 100;
export const MAX_APP_EVENT_PAYLOAD_BYTES = 64 * 1024;

/**
 * Notify the page embedding this app that something happened:
 *
 *   emitEvent('import-confirmed', { planId, rows });
 *
 * `payload` must be JSON-serializable and at most 64 KB serialized. Throws on
 * an invalid name or payload, so a dropped event never looks like a sent one.
 */
export function emitEvent(name: string, payload?: unknown): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('emitEvent needs a non-empty event name');
    }
    if (name.length > MAX_APP_EVENT_NAME_CHARS) {
        throw new Error(
            `emitEvent name is over ${MAX_APP_EVENT_NAME_CHARS} characters`,
        );
    }

    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(payload ?? null);
    } catch {
        serialized = undefined;
    }
    // undefined: a cycle, a BigInt, or a bare function/symbol.
    if (serialized === undefined) {
        throw new Error('emitEvent payload must be JSON-serializable');
    }
    const bytes = new TextEncoder().encode(serialized).length;
    if (bytes > MAX_APP_EVENT_PAYLOAD_BYTES) {
        throw new Error(
            `emitEvent payload is ${bytes} bytes serialized, over the ${MAX_APP_EVENT_PAYLOAD_BYTES} limit. Send bulk data through an external connection (client.externalFetch) and emit only a reference to it.`,
        );
    }

    if (typeof window === 'undefined' || window.parent === window) return;

    const message: SdkAppEventMessage = {
        type: APP_EVENT_MESSAGE,
        name,
        // Round-tripped so the payload is structured-cloneable.
        payload: JSON.parse(serialized) as unknown,
    };
    window.parent.postMessage(message, '*');
}
