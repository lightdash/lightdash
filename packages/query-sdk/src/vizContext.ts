/**
 * Data app viz render context — the iframe-side counterpart to the host's
 * `useAppSdkBridge` push. A data app viz is a data-agnostic renderer: the host
 * owns the query, fetches the rows, and pushes them (plus a field mapping)
 * into the iframe. This module is the SDK primitive generated vizs use to
 * receive that context, so they never hand-roll a `window.addEventListener`.
 *
 * Handshake: the renderer can mount after the host's first push, so on mount
 * the hook posts a `viz-context-request` to the parent, which replies with the
 * current context. The host also re-pushes on every change. No timers.
 */

import { useEffect, useState } from 'react';

/** A single cell of a Lightdash result row: `{ value: { raw, formatted } }`. */
export type VizContextCell = {
    value?: { raw?: unknown; formatted?: string };
};

/** A result row keyed by query field id. */
export type VizContextRow = Record<string, VizContextCell | undefined>;

/**
 * Pushed by the host into the iframe. `fieldMapping` maps each field name the
 * renderer declared to the query field id it resolves to; `rows` are the
 * host-fetched result rows keyed by field id.
 */
export type DataAppVizContextMessage = {
    type: 'lightdash:sdk:data-app-viz-context';
    fieldMapping: Record<string, string>;
    rows: VizContextRow[];
};

/** Posted by the iframe on mount so the host pushes the current context. */
export type VizContextRequestMessage = {
    type: 'lightdash:sdk:viz-context-request';
};

const DATA_APP_VIZ_CONTEXT_MESSAGE = 'lightdash:sdk:data-app-viz-context';
const VIZ_CONTEXT_REQUEST_MESSAGE = 'lightdash:sdk:viz-context-request';

/** Display string for a field's cell in a row, e.g. `"$1,234"`. Empty when unset. */
export const getFormatted = (
    row: VizContextRow | undefined,
    fieldId: string | undefined,
): string => {
    if (!row || !fieldId) return '';
    return String(row[fieldId]?.value?.formatted ?? '');
};

/** Raw value for a field's cell in a row (number/string/etc.), or null when unset. */
export const getRaw = (
    row: VizContextRow | undefined,
    fieldId: string | undefined,
): unknown => {
    if (!row || !fieldId) return null;
    return row[fieldId]?.value?.raw ?? null;
};

export type VizContext = {
    /** field name → query field id, as bound in the host field mapping UI. */
    fieldMapping: Record<string, string>;
    /** Host-fetched result rows, keyed by query field id. */
    rows: VizContextRow[];
    /** False until the first context arrives — render a placeholder while false. */
    ready: boolean;
};

/**
 * Subscribe to the host's render context. Re-renders whenever the host pushes
 * (on load, on mapping change, on query change). Resolve a declared field to
 * its bound cell with `fieldMapping[name]` then `getFormatted`/`getRaw`.
 */
export function useVizContext(): VizContext {
    const [context, setContext] = useState<{
        fieldMapping: Record<string, string>;
        rows: VizContextRow[];
    } | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const handleMessage = (event: MessageEvent) => {
            const data = event.data as DataAppVizContextMessage | undefined;
            if (!data || data.type !== DATA_APP_VIZ_CONTEXT_MESSAGE) return;
            setContext({
                fieldMapping: data.fieldMapping ?? {},
                rows: Array.isArray(data.rows) ? data.rows : [],
            });
        };

        window.addEventListener('message', handleMessage);

        // Ask the host to push the current context — the renderer may have
        // mounted after the host's first push.
        const request: VizContextRequestMessage = {
            type: VIZ_CONTEXT_REQUEST_MESSAGE,
        };
        window.parent?.postMessage(request, '*');

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return {
        fieldMapping: context?.fieldMapping ?? {},
        rows: context?.rows ?? [],
        ready: context !== null,
    };
}
