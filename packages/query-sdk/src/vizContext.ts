/**
 * Data app viz render context — the iframe-side counterpart to the host's
 * `useAppSdkBridge` push. A data app viz is a data-agnostic renderer: the host
 * owns the query, fetches the rows, and pushes them (plus a field mapping)
 * into the iframe. This module is the SDK primitive generated vizs use to
 * receive that context, so they never hand-roll a `window.addEventListener`.
 *
 * Delivery is a handshake: the receiver posts `viz-context-request` once its
 * listener is mounted, and the host replies with the current context (and
 * re-pushes on every change). `VizContextProvider` owns that handshake at the
 * scaffold level — mounted above `<App/>`, its effect runs *after* the app's
 * own effects (React fires child effects before parent effects), so the
 * request is guaranteed to be sent after any listener the app registered. The
 * host's reply therefore can't be missed. No timers, no races.
 */

import {
    createContext,
    createElement,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { useOptionalTransport } from './LightdashProvider';
import type {
    ColumnType,
    DownloadResultsOptions,
    DownloadResultsResult,
    Transport,
    UnderlyingDataResult,
} from './types';

/** A single cell of a Lightdash result row: `{ value: { raw, formatted } }`. */
export type VizContextCell = {
    value?: { raw?: unknown; formatted?: string };
};

/** A result row keyed by query field id. */
export type VizContextRow = Record<string, VizContextCell | undefined>;

/**
 * A config option value. Its shape follows the option's declared type:
 * `boolean` → boolean, `number` → number, `select`/`text`/`color` → string.
 * Series colours are not an option — they arrive on `colorPalette`.
 */
export type VizContextOptionValue = boolean | number | string;

/**
 * The host's complete backend-pivot layout metadata. This is a structural
 * mirror because query-sdk is published without a dependency on
 * `@lightdash/common`.
 */
export type VizContextPivotDetails = {
    totalColumnCount: number | null;
    indexColumn:
        | { reference: string; type: 'time' | 'category' }
        | { reference: string; type: 'time' | 'category' }[]
        | undefined;
    valuesColumns: {
        referenceField: string;
        pivotColumnName: string;
        aggregation: string;
        pivotValues: {
            referenceField: string;
            value: unknown;
            formatted?: string;
        }[];
        columnIndex?: number;
    }[];
    groupByColumns: { reference: string }[] | undefined;
    sortBy:
        | {
              reference: string;
              direction: 'ASC' | 'DESC';
              nullsFirst?: boolean;
              pivotValues?: {
                  reference: string;
                  value: string | number | boolean | null;
              }[];
          }[]
        | undefined;
    originalColumns: Record<string, { reference: string; type: ColumnType }>;
    passthroughDimensions?: { reference: string }[];
};

/**
 * Pushed by the host into the iframe. `fieldMapping` maps each field name the
 * renderer declared to the query field id it resolves to; `rows` are the
 * host-fetched result rows keyed by field id; `options` holds the current
 * value of each config option the renderer declared; `colorPalette` is the
 * Lightdash palette resolved for this chart, pushed whether or not the
 * renderer declared one.
 */
export type DataAppVizContextMessage = {
    type: 'lightdash:sdk:data-app-viz-context';
    fieldMapping: Record<string, string>;
    rows: VizContextRow[];
    /** Absent when the installed host predates config-option delivery. */
    options?: Record<string, VizContextOptionValue>;
    /** Absent when the installed host predates palette delivery. */
    colorPalette?: string[];
    /** Null for unpivoted rows; absent when the installed host predates pivot metadata delivery. */
    pivotDetails?: VizContextPivotDetails | null;
    /** Absent when the installed host predates underlying-data delivery. */
    underlyingData?: { enabled?: boolean };
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

/**
 * Host-mediated access to the raw rows behind a clicked data point. `enabled`
 * is false when the host predates the capability, the viewer lacks permission,
 * or no transport is mounted — render no menu item in that case (never a
 * disabled one). `row` is the untransformed source row from `rows`; `metric`
 * is the declared field NAME bound to the clicked metric slot.
 */
export type VizUnderlyingData = {
    enabled: boolean;
    get: (opts: {
        row: VizContextRow;
        metric: string;
        limit?: number;
    }) => Promise<UnderlyingDataResult>;
    download: (
        opts: { row: VizContextRow; metric: string } & DownloadResultsOptions,
    ) => Promise<DownloadResultsResult>;
};

export type VizContext = {
    /** field name → query field id, as bound in the host field mapping UI. */
    fieldMapping: Record<string, string>;
    /** Host-fetched result rows, keyed by query field id. */
    rows: VizContextRow[];
    /** Config option name → current value (the user's choice, else the declared default). */
    options: Record<string, VizContextOptionValue>;
    /**
     * Ordered series colours resolved from the Lightdash palette the viewer
     * picked. Colour multi-series charts with
     * `colorPalette[i % colorPalette.length]`. Empty only when the host
     * resolved no palette; keep a fallback array in your own code for that.
     */
    colorPalette: string[];
    /** Metadata that maps generated pivot column names back to their metric and series values. */
    pivotDetails: VizContextPivotDetails | null;
    /** False until the first context arrives — render a placeholder while false. */
    ready: boolean;
    /** Fetch/export the raw rows behind a clicked data point via the host. */
    underlyingData: VizUnderlyingData;
};

type VizContextValue = {
    fieldMapping: Record<string, string>;
    rows: VizContextRow[];
    options: Record<string, VizContextOptionValue>;
    colorPalette: string[];
    pivotDetails: VizContextPivotDetails | null;
    underlyingDataEnabled: boolean;
};

type VizContextState = VizContextValue | null;

const isVizContextOptionValue = (
    value: unknown,
): value is VizContextOptionValue =>
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));

const normalizeOptions = (
    options: unknown,
): Record<string, VizContextOptionValue> => {
    if (
        typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)
    ) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(options).filter((entry) =>
            isVizContextOptionValue(entry[1]),
        ),
    );
};

/**
 * Normalises an inbound host message into provider state. Optional capabilities
 * are absent from hosts predating them and receive stable fallback values.
 */
export function toVizContextState(
    message: DataAppVizContextMessage,
): VizContextValue {
    return {
        fieldMapping: message.fieldMapping ?? {},
        rows: Array.isArray(message.rows) ? message.rows : [],
        options: normalizeOptions(message.options),
        colorPalette: Array.isArray(message.colorPalette)
            ? message.colorPalette.filter(
                  (color): color is string => typeof color === 'string',
              )
            : [],
        pivotDetails: message.pivotDetails ?? null,
        // Strict boolean check — non-boolean payloads read as disabled.
        underlyingDataEnabled: message.underlyingData?.enabled === true,
    };
}

/**
 * Builds the `underlyingData` surface from the host's availability flag and
 * the mounted transport (null when no `LightdashProvider` is present, e.g.
 * standalone `useVizContext` usage). Exported for tests.
 */
export function buildVizUnderlyingData(
    hostEnabled: boolean,
    transport: Transport | null,
): VizUnderlyingData {
    // Atomic capability: the generated menu promises Download whenever
    // `enabled` is true, so a transport must implement both methods.
    const supported =
        typeof transport?.getVizUnderlyingData === 'function' &&
        typeof transport?.downloadVizUnderlyingData === 'function';
    return {
        enabled: hostEnabled && supported,
        get: async ({ row, metric, limit }) => {
            if (!hostEnabled) {
                throw new Error(
                    'Underlying data is not enabled for this visualization.',
                );
            }
            if (!transport?.getVizUnderlyingData) {
                throw new Error(
                    'This SDK build predates underlying data. Rebuild the app on the current template.',
                );
            }
            return transport.getVizUnderlyingData({ row, metric, limit });
        },
        download: async ({ row, metric, ...options }) => {
            if (!hostEnabled) {
                throw new Error(
                    'Underlying data is not enabled for this visualization.',
                );
            }
            if (!transport?.downloadVizUnderlyingData) {
                throw new Error(
                    'This SDK build predates underlying data. Rebuild the app on the current template.',
                );
            }
            return transport.downloadVizUnderlyingData(
                { row, metric },
                options,
            );
        },
    };
}

// Distinguishes "no provider mounted" from "provider present, no context yet".
const NO_PROVIDER = Symbol('viz-context/no-provider');

const VizContextContext = createContext<VizContextState | typeof NO_PROVIDER>(
    NO_PROVIDER,
);

/**
 * Registers the `message` listener and posts the `viz-context-request`
 * handshake. `enabled` is false when a provider already owns the subscription,
 * so `useVizContext` can obey the rules of hooks without a redundant listener.
 */
function useVizContextSubscription(enabled: boolean): VizContextState {
    const [context, setContext] = useState<VizContextState>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return undefined;

        const handleMessage = (event: MessageEvent) => {
            const data = event.data as DataAppVizContextMessage | undefined;
            if (!data || data.type !== DATA_APP_VIZ_CONTEXT_MESSAGE) return;
            setContext(toVizContextState(data));
        };

        window.addEventListener('message', handleMessage);

        // Ask the host to push the current context. Sent from a mount effect —
        // when this runs inside VizContextProvider (above <App/>), it fires
        // after the app's own effects, so any listener the app set up is
        // already live by the time the host replies.
        const request: VizContextRequestMessage = {
            type: VIZ_CONTEXT_REQUEST_MESSAGE,
        };
        window.parent?.postMessage(request, '*');

        return () => window.removeEventListener('message', handleMessage);
    }, [enabled]);

    return context;
}

/**
 * Owns the single listener + handshake for a data app viz. Mount it in the
 * scaffold, wrapping `<App/>`, so generated renderers receive the host's
 * context through `useVizContext()` without hand-rolling a message listener.
 */
export function VizContextProvider({ children }: { children: ReactNode }) {
    const context = useVizContextSubscription(true);
    return createElement(
        VizContextContext.Provider,
        { value: context },
        children,
    );
}

/**
 * Subscribe to the host's render context. Reads from `VizContextProvider` when
 * one is mounted (the scaffold default); otherwise self-subscribes so the hook
 * still works standalone. Re-renders whenever the host pushes (on load, on
 * mapping change, on query change). Resolve a declared field to its bound cell
 * with `fieldMapping[name]` then `getFormatted`/`getRaw`; read a declared
 * config option with `options[name]`, and colour series from `colorPalette`.
 */
export function useVizContext(): VizContext {
    const fromProvider = useContext(VizContextContext);
    const hasProvider = fromProvider !== NO_PROVIDER;

    // Always call the subscription hook (rules of hooks); it stays inert when a
    // provider is present so we don't register a second listener or handshake.
    const selfSubscribed = useVizContextSubscription(!hasProvider);

    const context = hasProvider
        ? (fromProvider as VizContextState)
        : selfSubscribed;

    // Null-returning lookup — standalone usage without LightdashProvider keeps
    // working, with underlying data reported as unavailable.
    const transport = useOptionalTransport();
    const hostEnabled = context?.underlyingDataEnabled === true;

    const underlyingData = useMemo<VizUnderlyingData>(
        () => buildVizUnderlyingData(hostEnabled, transport),
        [hostEnabled, transport],
    );

    return {
        fieldMapping: context?.fieldMapping ?? {},
        rows: context?.rows ?? [],
        options: context?.options ?? {},
        colorPalette: context?.colorPalette ?? [],
        pivotDetails: context?.pivotDetails ?? null,
        ready: context !== null,
        underlyingData,
    };
}
