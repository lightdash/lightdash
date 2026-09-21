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
 * Series colours are not an option — the host resolves them separately from
 * config options and exposes them through the colour helpers.
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
 * Semantic-layer format of a bound field, mirroring the host's `CustomFormat`.
 * Use it to build axis-tick and legend formatters; per-cell `formatted` values
 * already honor it.
 */
export type VizFieldFormat = {
    /** 'default' | 'percent' | 'currency' | 'number' | 'id' | 'date' |
     *  'timestamp' | 'bytes_si' | 'bytes_iec' | 'custom' (open set — hosts may
     *  add values). */
    type: string;
    /** Number of decimal places. */
    round?: number;
    /** Number separator style. */
    separator?: string;
    /** ISO currency code, e.g. 'USD'. */
    currency?: string;
    /** Compact notation for large numbers (K, M, B, T) or byte units. */
    compact?: string;
    prefix?: string;
    suffix?: string;
    /** Time interval for date formatting. */
    timeInterval?: string;
    /** Custom format expression. */
    custom?: string;
};

/** Display metadata the host resolved for one bound query field. */
export type VizFieldMetadata = {
    /** Field label without the table prefix, e.g. "Total order amount". */
    label: string;
    /** Label of the table the field belongs to. */
    tableLabel?: string;
    /** Semantic-layer format, when the field declares one. */
    format?: VizFieldFormat;
};

/**
 * Pushed by the host into the iframe. `fieldMapping` maps each field name the
 * renderer declared to the query field id it resolves to; `rows` are the
 * host-fetched result rows keyed by field id; `options` holds the current
 * value of each config option the renderer declared; `colorPalette` is the
 * Lightdash palette resolved for this chart, pushed whether or not the
 * renderer declared one; `seriesColors` and `valueColors` are the final
 * host-resolved colors for pivot columns and raw dimension values.
 */
export type DataAppVizContextMessage = {
    type: 'lightdash:sdk:data-app-viz-context';
    fieldMapping: Record<string, string | string[]>;
    /** Absent when the installed host predates field-metadata delivery. */
    fields?: Record<string, VizFieldMetadata>;
    rows: VizContextRow[];
    /** Absent when the installed host predates config-option delivery. */
    options?: Record<string, VizContextOptionValue>;
    /** Absent when the installed host predates palette delivery. */
    colorPalette?: string[];
    /** Absent when the installed host predates resolved-color delivery. */
    seriesColors?: Record<string, string>;
    /** Absent when the installed host predates resolved-color delivery. */
    valueColors?: Record<string, Record<string, string>>;
    /** Null for unpivoted rows; absent when the installed host predates pivot metadata delivery. */
    pivotDetails?: VizContextPivotDetails | null;
    /** Absent when the installed host predates underlying-data delivery. */
    underlyingData?: { enabled?: boolean; openEnabled?: boolean };
    /** Absent when the installed host predates drill-down delivery. */
    drillDown?: { enabled?: boolean };
    /** Transport-only identity for matching a paint acknowledgement to this push. */
    renderId?: string;
};

/** Posted by the iframe on mount so the host pushes the current context. */
export type VizContextRequestMessage = {
    type: 'lightdash:sdk:viz-context-request';
};

/** Posted after a pushed visualization context has had two paint frames. */
export type VizRenderedMessage = {
    type: 'lightdash:sdk:viz-rendered';
    renderId?: string;
};

const DATA_APP_VIZ_CONTEXT_MESSAGE = 'lightdash:sdk:data-app-viz-context';
const VIZ_CONTEXT_REQUEST_MESSAGE = 'lightdash:sdk:viz-context-request';
const VIZ_RENDERED_MESSAGE = 'lightdash:sdk:viz-rendered';

/**
 * Dev-only fixture seed param. A chart type runs no query and renders the
 * context the host pushes over postMessage — so top-level (local dev), with no
 * host to answer the handshake, it renders nothing. Pointing `?vizFixture` at a
 * same-origin JSON file lets `useVizContextSubscription` seed the context from
 * that file, so `npm run dev` / `lightdash apps preview` show the chart. This
 * mirrors the `?theme=` / `?state=` dev seeds in colorScheme.ts / urlState.ts.
 */
export const VIZ_FIXTURE_PARAM = 'vizFixture';
const DEFAULT_VIZ_FIXTURE_URL = '/viz-fixture.json';

/**
 * Resolve the dev fixture URL from the page location, or null when the param is
 * absent or resolves cross-origin. The iframe hash wins, the search param is
 * the top-level (local dev) fallback — same precedence as `parseColorSchemeSeed`
 * / `parseUrlStateSeed`. A bare `?vizFixture` (no value) means the default path.
 * The target is restricted to the page's own origin because it comes from a
 * user-editable URL and is fetched.
 */
export function resolveVizFixtureUrl(location: {
    hash: string;
    search: string;
    origin: string;
}): string | null {
    const raw =
        new URLSearchParams(location.hash.replace(/^#/, '')).get(
            VIZ_FIXTURE_PARAM,
        ) ?? new URLSearchParams(location.search).get(VIZ_FIXTURE_PARAM);
    if (raw === null) return null;
    const target = raw.length > 0 ? raw : DEFAULT_VIZ_FIXTURE_URL;
    try {
        const url = new URL(target, location.origin);
        return url.origin === location.origin ? url.toString() : null;
    } catch {
        return null;
    }
}

/** Display string for a field's cell in a row, e.g. `"$1,234"`. Empty when unset. */
export const getFormatted = (
    row: VizContextRow | undefined,
    fieldId: string | string[] | undefined,
): string => {
    if (!row || !fieldId || Array.isArray(fieldId)) return '';
    return String(row[fieldId]?.value?.formatted ?? '');
};

/** Raw value for a field's cell in a row (number/string/etc.), or null when unset. */
export const getRaw = (
    row: VizContextRow | undefined,
    fieldId: string | string[] | undefined,
): unknown => {
    if (!row || !fieldId || Array.isArray(fieldId)) return null;
    return row[fieldId]?.value?.raw ?? null;
};

/**
 * Display label for a bound field, e.g. `"Total order amount"`. Falls back to
 * the raw field id when the host sent no metadata for it (older hosts send
 * none at all).
 */
export const getFieldLabel = (
    context: Pick<VizContext, 'fields'>,
    fieldId: string,
): string => context.fields[fieldId]?.label ?? fieldId;

/**
 * Host-mediated access to the raw rows behind a clicked data point. `enabled`
 * is false when the host predates the capability, the viewer lacks permission,
 * or no transport is mounted — render no menu item in that case (never a
 * disabled one). `row` is the untransformed source row from `rows`; `metric`
 * is the declared field NAME bound to the clicked metric slot.
 */
export type VizUnderlyingData = {
    enabled: boolean;
    /** Ask Lightdash to open its standard underlying-data dialog. */
    open: (opts: {
        row: VizContextRow;
        metric: string;
        fieldId?: string;
    }) => Promise<void>;
    /** Legacy bundle compatibility. New visualizations should call `open`. */
    get: (opts: {
        row: VizContextRow;
        metric: string;
        fieldId?: string;
        limit?: number;
    }) => Promise<UnderlyingDataResult>;
    /** Legacy bundle compatibility. Lightdash owns download UI after `open`. */
    download: (
        opts: {
            row: VizContextRow;
            metric: string;
            fieldId?: string;
        } & DownloadResultsOptions,
    ) => Promise<DownloadResultsResult>;
};

export type VizContext = {
    /** Slot name → query field id, or ordered ids for a slot declared multiple. */
    fieldMapping: Record<string, string | string[]>;
    /**
     * Query field id → display metadata (label, table label, semantic-layer
     * format). Empty when the host predates field-metadata delivery — read
     * labels with `getFieldLabel` so raw ids remain the fallback.
     */
    fields: Record<string, VizFieldMetadata>;
    /** Host-fetched result rows, keyed by query field id. */
    rows: VizContextRow[];
    /** Config option name → current value (the user's choice, else the declared default). */
    options: Record<string, VizContextOptionValue>;
    /**
     * Lightdash palette selected for this chart. The resolved-colour helpers
     * use it after fixed and shared assignments. Empty only when the host
     * resolved no palette; keep a fallback array in your own code for that.
     */
    colorPalette: string[];
    /** Pivot column name → final color resolved by the Lightdash host. */
    seriesColors: Record<string, string>;
    /** Query field id → raw value → final color resolved by the Lightdash host. */
    valueColors: Record<string, Record<string, string>>;
    /** Metadata that maps generated pivot column names back to their metric and series values. */
    pivotDetails: VizContextPivotDetails | null;
    /** False until the first context arrives — render a placeholder while false. */
    ready: boolean;
    /** Fetch/export the raw rows behind a clicked data point via the host. */
    underlyingData: VizUnderlyingData;
    /** Fire a drill-down on a clicked data point; the host opens its drill dialog. */
    drillDown: VizDrillDown;
};

type VizContextValue = {
    fieldMapping: Record<string, string | string[]>;
    fields: Record<string, VizFieldMetadata>;
    rows: VizContextRow[];
    options: Record<string, VizContextOptionValue>;
    colorPalette: string[];
    seriesColors: Record<string, string>;
    valueColors: Record<string, Record<string, string>>;
    pivotDetails: VizContextPivotDetails | null;
    underlyingDataEnabled: boolean;
    underlyingDataOpenEnabled: boolean;
    drillDownEnabled: boolean;
    renderId?: string;
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

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeStringRecord = (value: unknown): Record<string, string> => {
    if (!isPlainRecord(value)) return {};

    return Object.fromEntries(
        Object.entries(value).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
    );
};

const normalizeFields = (value: unknown): Record<string, VizFieldMetadata> => {
    if (!isPlainRecord(value)) return {};

    return Object.fromEntries(
        Object.entries(value).flatMap(([fieldId, metadata]) => {
            if (!isPlainRecord(metadata) || typeof metadata.label !== 'string')
                return [];
            const normalized: VizFieldMetadata = {
                label: metadata.label,
                ...(typeof metadata.tableLabel === 'string'
                    ? { tableLabel: metadata.tableLabel }
                    : {}),
                ...(isPlainRecord(metadata.format) &&
                typeof metadata.format.type === 'string'
                    ? { format: metadata.format as VizFieldFormat }
                    : {}),
            };
            return [[fieldId, normalized] as const];
        }),
    );
};

const normalizeValueColors = (
    value: unknown,
): Record<string, Record<string, string>> => {
    if (!isPlainRecord(value)) return {};

    return Object.fromEntries(
        Object.entries(value).flatMap(([fieldId, colors]) =>
            isPlainRecord(colors)
                ? [[fieldId, normalizeStringRecord(colors)] as const]
                : [],
        ),
    );
};

type VizColorContext = Pick<
    VizContext,
    'colorPalette' | 'seriesColors' | 'valueColors'
>;

const getPaletteColor = (
    colorPalette: string[],
    index: number,
): string | undefined =>
    colorPalette.length > 0
        ? colorPalette[index % colorPalette.length]
        : undefined;

/** Resolve a backend-pivoted series color, with the chart palette as fallback. */
export const resolveSeriesColor = (
    context: VizColorContext,
    column: Pick<
        VizContextPivotDetails['valuesColumns'][number],
        'pivotColumnName'
    >,
    index: number,
): string | undefined =>
    context.seriesColors[column.pivotColumnName] ??
    getPaletteColor(context.colorPalette, index);

/** Resolve a client-side grouped raw value color, with the chart palette as fallback. */
export const resolveValueColor = (
    context: VizColorContext,
    fieldId: string | string[],
    rawValue: unknown,
    index: number,
): string | undefined =>
    Array.isArray(fieldId)
        ? undefined
        : (context.valueColors[fieldId]?.[String(rawValue)] ??
          getPaletteColor(context.colorPalette, index));

/**
 * Normalises an inbound host message into provider state. Optional capabilities
 * are absent from hosts predating them and receive stable fallback values.
 */
export function toVizContextState(
    message: DataAppVizContextMessage,
): VizContextValue {
    return {
        fieldMapping: message.fieldMapping ?? {},
        fields: normalizeFields(message.fields),
        rows: Array.isArray(message.rows) ? message.rows : [],
        options: normalizeOptions(message.options),
        colorPalette: Array.isArray(message.colorPalette)
            ? message.colorPalette.filter(
                  (color): color is string => typeof color === 'string',
              )
            : [],
        seriesColors: normalizeStringRecord(message.seriesColors),
        valueColors: normalizeValueColors(message.valueColors),
        pivotDetails: message.pivotDetails ?? null,
        // Strict boolean check — non-boolean payloads read as disabled.
        underlyingDataEnabled: message.underlyingData?.enabled === true,
        underlyingDataOpenEnabled: message.underlyingData?.openEnabled === true,
        drillDownEnabled: message.drillDown?.enabled === true,
        renderId:
            typeof message.renderId === 'string' ? message.renderId : undefined,
    };
}

/**
 * Builds the `underlyingData` surface from separate legacy-fetch and current
 * host-dialog flags plus the mounted transport. Keeping the flags independent
 * lets already-published bundles use get/download while current bundles expose
 * `enabled` only when `open` can delegate the dialog to Lightdash.
 */
export function buildVizUnderlyingData(
    hostEnabled: boolean,
    hostOpenEnabled: boolean,
    transport: Transport | null,
): VizUnderlyingData {
    const supported = typeof transport?.openVizUnderlyingData === 'function';
    return {
        enabled: hostOpenEnabled && supported,
        open: async ({ row, metric, fieldId }) => {
            if (!hostOpenEnabled) {
                throw new Error(
                    'Underlying data is not enabled for this visualization.',
                );
            }
            if (!transport?.openVizUnderlyingData) {
                throw new Error(
                    'This SDK build predates host-owned underlying data. Rebuild the app on the current template.',
                );
            }
            return transport.openVizUnderlyingData({
                row,
                metric,
                ...(fieldId === undefined ? {} : { fieldId }),
            });
        },
        get: async ({ row, metric, fieldId, limit }) => {
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
            return transport.getVizUnderlyingData({
                row,
                metric,
                ...(fieldId === undefined ? {} : { fieldId }),
                limit,
            });
        },
        download: async ({ row, metric, fieldId, ...options }) => {
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
                { row, metric, ...(fieldId === undefined ? {} : { fieldId }) },
                options,
            );
        },
    };
}

/**
 * Host-mediated drill-down for a clicked data point. `enabled` is false when
 * the host predates the capability, the viewer lacks permission, results are
 * pivoted, or no transport is mounted — render no menu item in that case
 * (never a disabled one). `open` fires the intent; the HOST shows the drill
 * dialog, nothing renders in the viz.
 */
export type VizDrillDown = {
    enabled: boolean;
    open: (opts: {
        row: VizContextRow;
        metric: string;
        fieldId?: string;
    }) => Promise<void>;
};

/** Builds the `drillDown` surface. Exported for tests. */
export function buildVizDrillDown(
    hostEnabled: boolean,
    transport: Transport | null,
): VizDrillDown {
    const supported = typeof transport?.openVizDrillDown === 'function';
    return {
        enabled: hostEnabled && supported,
        open: async ({ row, metric, fieldId }) => {
            if (!hostEnabled) {
                throw new Error(
                    'Drill-down is not enabled for this visualization.',
                );
            }
            if (!transport?.openVizDrillDown) {
                throw new Error(
                    'This SDK build predates drill-down. Rebuild the app on the current template.',
                );
            }
            return transport.openVizDrillDown({
                row,
                metric,
                ...(fieldId === undefined ? {} : { fieldId }),
            });
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

        // Dev-only fallback: a chart type running top-level (no parent frame to
        // answer the handshake above) seeds its context from a same-origin
        // `?vizFixture` file so it renders under `npm run dev` /
        // `lightdash apps preview`. An embedded viz always has a real parent
        // whose reply arrives first, so this never fires in production.
        let cancelled = false;
        const fixtureUrl =
            window.parent === window
                ? resolveVizFixtureUrl(window.location)
                : null;
        if (fixtureUrl) {
            fetch(fixtureUrl)
                .then((res) => (res.ok ? res.json() : Promise.reject(res)))
                .then((data: unknown) => {
                    if (cancelled || !isPlainRecord(data)) return;
                    // Never clobber a context a host already delivered.
                    setContext(
                        (prev) =>
                            prev ??
                            toVizContextState({
                                ...(data as Partial<DataAppVizContextMessage>),
                                type: DATA_APP_VIZ_CONTEXT_MESSAGE,
                            } as DataAppVizContextMessage),
                    );
                })
                .catch(() => {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[lightdash] viz fixture "${fixtureUrl}" could not be loaded`,
                    );
                });
        }

        return () => {
            cancelled = true;
            window.removeEventListener('message', handleMessage);
        };
    }, [enabled]);

    return context;
}

/**
 * Acknowledge a host-pushed context after React has committed it and the
 * browser has had two animation frames to paint it. The host owns any
 * higher-level query state, so this deliberately only confirms the initial
 * paint opportunity rather than waiting for arbitrary chart animations.
 */
function useVizContextPaintAcknowledgement(
    context: VizContextState,
    enabled: boolean,
): void {
    useEffect(() => {
        if (!enabled || context === null || typeof window === 'undefined') {
            return undefined;
        }

        let cancelled = false;
        let secondFrame: number | undefined;
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                if (cancelled) return;
                const message: VizRenderedMessage = {
                    type: VIZ_RENDERED_MESSAGE,
                    ...(context.renderId === undefined
                        ? {}
                        : { renderId: context.renderId }),
                };
                window.parent?.postMessage(message, '*');
            });
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame !== undefined) {
                window.cancelAnimationFrame(secondFrame);
            }
        };
    }, [context, enabled]);
}

/**
 * Owns the single listener + handshake for a data app viz. Mount it in the
 * scaffold, wrapping `<App/>`, so generated renderers receive the host's
 * context through `useVizContext()` without hand-rolling a message listener.
 */
export function VizContextProvider({ children }: { children: ReactNode }) {
    const context = useVizContextSubscription(true);
    useVizContextPaintAcknowledgement(context, true);
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
 * mapping change, on query change). Resolve a single-field slot with
 * `fieldMapping[name]`, or iterate that value when the slot declares multiple
 * fields, then read cells with `getFormatted`/`getRaw` and label axes and
 * legends with `getFieldLabel`. Read a declared config option with
 * `options[name]`, and colour series with
 * `resolveSeriesColor` / `resolveValueColor`.
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

    // The provider already acknowledges its subscription. A standalone hook
    // owns both its subscription and acknowledgement.
    useVizContextPaintAcknowledgement(context, !hasProvider);

    // Null-returning lookup — standalone usage without LightdashProvider keeps
    // working, with underlying data reported as unavailable.
    const transport = useOptionalTransport();
    const hostEnabled = context?.underlyingDataEnabled === true;
    const hostOpenEnabled = context?.underlyingDataOpenEnabled === true;

    const underlyingData = useMemo<VizUnderlyingData>(
        () => buildVizUnderlyingData(hostEnabled, hostOpenEnabled, transport),
        [hostEnabled, hostOpenEnabled, transport],
    );

    const drillHostEnabled = context?.drillDownEnabled === true;
    const drillDown = useMemo<VizDrillDown>(
        () => buildVizDrillDown(drillHostEnabled, transport),
        [drillHostEnabled, transport],
    );

    return {
        fieldMapping: context?.fieldMapping ?? {},
        fields: context?.fields ?? {},
        rows: context?.rows ?? [],
        options: context?.options ?? {},
        colorPalette: context?.colorPalette ?? [],
        seriesColors: context?.seriesColors ?? {},
        valueColors: context?.valueColors ?? {},
        pivotDetails: context?.pivotDetails ?? null,
        ready: context !== null,
        underlyingData,
        drillDown,
    };
}
