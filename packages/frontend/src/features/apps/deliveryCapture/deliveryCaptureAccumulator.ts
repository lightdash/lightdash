import {
    CAPTURE_KEY_VERSION,
    MAX_CAPTURE_LABEL_CHARS,
    MAX_DELIVERY_QUERIES,
    type CapturedQuery,
    type DeliveryCaptureManifest,
} from '@lightdash/common';
import isPlainObject from 'lodash/isPlainObject';
import { sha256Hex } from './sha256';
import { stableStringify, stripCaptureBodyFields } from './stableStringify';

export type DeliveryCaptureAccumulator = {
    onInitiation(init: {
        requestId: string;
        method: string;
        path: string;
        body: unknown;
        label: string | null;
    }): void;
    /** POST response arrived. results null/undefined = ok-without-uuid. */
    onPostResponse(
        requestId: string,
        results: {
            queryUuid?: string;
            metricQuery?: { exploreName?: string; limit?: number };
        } | null,
    ): void;
    onPostFailure(requestId: string, error: string): void;
    onTerminal(
        queryUuid: string,
        outcome:
            | { status: 'ready'; rowCount: number | null }
            | { status: 'error'; error: string },
    ): void;
    /** Applies display-label suffixes and caps.
     *  A partial capture must never look complete: entries still `pending`
     *  when this resolves are surfaced as `error` items, not dropped. */
    getManifest(): Promise<DeliveryCaptureManifest>;
    /** Readiness source for capture renders: fires with the current `pending`
     *  entry count immediately and on every change. Returns an unsubscribe. */
    subscribe(listener: (pendingCount: number) => void): () => void;
    reset(): void;
};

type CaptureEntry = {
    order: number;
    /** Current owning requestId — "last initiated wins" on key collisions. */
    requestId: string;
    rawLabel: string | null;
    exploreName: string | null;
    limit: number | undefined;
    status: 'pending' | 'ready' | 'error';
    captureKey: string;
    queryUuid: string | null;
    rowCount: number | null;
    limitReached: boolean;
    error: string | null;
};

/** Metric-query bodies carry `query.exploreName`/`query.limit` synchronously
 *  at initiation; chart bodies only carry `chartUuid` until onPostResponse. */
const extractMetricQuery = (body: unknown): Record<string, unknown> | null => {
    if (!isPlainObject(body)) return null;
    const { query } = body as Record<string, unknown>;
    return isPlainObject(query) ? (query as Record<string, unknown>) : null;
};

const truncateLabel = (label: string): string =>
    label.length > MAX_CAPTURE_LABEL_CHARS
        ? label.slice(0, MAX_CAPTURE_LABEL_CHARS)
        : label;

const resolveBaseLabel = (entry: CaptureEntry): string =>
    truncateLabel(
        entry.rawLabel ?? entry.exploreName ?? `Query ${entry.order + 1}`,
    );

/** Error message for entries still `pending` when getManifest() resolves. */
const NOT_SETTLED_ERROR = 'Query did not settle before capture completed';

/** Appends a display-only " (n)" suffix for the nth occurrence of a label,
 *  re-truncating so the final label still respects the cap. */
const applyDisplaySuffix = (base: string, occurrence: number): string => {
    if (occurrence <= 1) return base;
    const suffix = ` (${occurrence})`;
    const maxBaseLength = Math.max(0, MAX_CAPTURE_LABEL_CHARS - suffix.length);
    const trimmedBase =
        base.length > maxBaseLength ? base.slice(0, maxBaseLength) : base;
    return `${trimmedBase}${suffix}`;
};

export const createDeliveryCaptureAccumulator =
    (): DeliveryCaptureAccumulator => {
        // Keyed by the pre-hash stableStringify input — cheaper to compare than
        // the digest, and lets onInitiation dedupe/replace-in-place.
        let entriesByRawKey = new Map<string, CaptureEntry>();
        let requestIdToEntry = new Map<string, CaptureEntry>();
        let uuidToEntry = new Map<string, CaptureEntry>();
        let droppedKeys = new Set<string>();
        let nextOrder = 0;
        const pendingListeners = new Set<(pendingCount: number) => void>();
        let lastPendingCount = 0;

        const notifyPendingCount = () => {
            const pendingCount = [...entriesByRawKey.values()].filter(
                (entry) => entry.status === 'pending',
            ).length;
            if (pendingCount === lastPendingCount) return;
            lastPendingCount = pendingCount;
            pendingListeners.forEach((listener) => listener(pendingCount));
        };

        const onInitiation: DeliveryCaptureAccumulator['onInitiation'] = ({
            requestId,
            method,
            path,
            body,
            label,
        }) => {
            const rawKey = stableStringify({
                method: method.toUpperCase(),
                path,
                body: stripCaptureBodyFields(body),
            });

            let entry = entriesByRawKey.get(rawKey);
            if (!entry) {
                if (entriesByRawKey.size >= MAX_DELIVERY_QUERIES) {
                    droppedKeys.add(rawKey);
                    return;
                }
                entry = {
                    order: nextOrder,
                    requestId,
                    rawLabel: null,
                    exploreName: null,
                    limit: undefined,
                    status: 'pending',
                    captureKey: `${CAPTURE_KEY_VERSION}:${sha256Hex(rawKey)}`,
                    queryUuid: null,
                    rowCount: null,
                    limitReached: false,
                    error: null,
                };
                nextOrder += 1;
                entriesByRawKey.set(rawKey, entry);
            }

            // Replace in place: keep `order`/`captureKey`, reset per-execution
            // state, and hand ownership to this (newest) requestId.
            entry.requestId = requestId;
            entry.rawLabel = label;
            entry.status = 'pending';
            entry.queryUuid = null;
            entry.rowCount = null;
            entry.limitReached = false;
            entry.error = null;

            const query = extractMetricQuery(body);
            entry.exploreName =
                typeof query?.exploreName === 'string'
                    ? query.exploreName
                    : null;
            entry.limit =
                typeof query?.limit === 'number' ? query.limit : undefined;

            requestIdToEntry.set(requestId, entry);
            notifyPendingCount();
        };

        const onPostResponse: DeliveryCaptureAccumulator['onPostResponse'] = (
            requestId,
            results,
        ) => {
            const entry = requestIdToEntry.get(requestId);
            if (!entry || entry.requestId !== requestId) return;

            const queryUuid = results?.queryUuid;
            if (typeof queryUuid === 'string') {
                entry.queryUuid = queryUuid;
                uuidToEntry.set(queryUuid, entry);
            }
            if (
                entry.exploreName === null &&
                typeof results?.metricQuery?.exploreName === 'string'
            ) {
                entry.exploreName = results.metricQuery.exploreName;
            }
            if (
                entry.limit === undefined &&
                typeof results?.metricQuery?.limit === 'number'
            ) {
                entry.limit = results.metricQuery.limit;
            }
        };

        const onPostFailure: DeliveryCaptureAccumulator['onPostFailure'] = (
            requestId,
            error,
        ) => {
            const entry = requestIdToEntry.get(requestId);
            if (!entry || entry.requestId !== requestId) return;
            entry.status = 'error';
            entry.queryUuid = null;
            entry.error = error;
            notifyPendingCount();
        };

        const onTerminal: DeliveryCaptureAccumulator['onTerminal'] = (
            queryUuid,
            outcome,
        ) => {
            const entry = uuidToEntry.get(queryUuid);
            if (!entry || entry.queryUuid !== queryUuid) return;
            if (outcome.status === 'ready') {
                entry.status = 'ready';
                entry.rowCount = outcome.rowCount;
                entry.limitReached =
                    outcome.rowCount !== null &&
                    entry.limit !== undefined &&
                    outcome.rowCount >= entry.limit;
            } else {
                entry.status = 'error';
                entry.error = outcome.error;
            }
            notifyPendingCount();
        };

        const subscribe: DeliveryCaptureAccumulator['subscribe'] = (
            listener,
        ) => {
            pendingListeners.add(listener);
            listener(lastPendingCount);
            return () => {
                pendingListeners.delete(listener);
            };
        };

        const getManifest: DeliveryCaptureAccumulator['getManifest'] =
            async () => {
                const ordered = [...entriesByRawKey.values()].sort(
                    (a, b) => a.order - b.order,
                );
                const labelOccurrences = new Map<string, number>();
                const items: CapturedQuery[] = [];

                ordered.forEach((entry) => {
                    const baseLabel = resolveBaseLabel(entry);
                    const occurrence =
                        (labelOccurrences.get(baseLabel) ?? 0) + 1;
                    labelOccurrences.set(baseLabel, occurrence);
                    const label = applyDisplaySuffix(baseLabel, occurrence);
                    const { captureKey } = entry;

                    if (entry.status === 'ready') {
                        items.push({
                            status: 'ready',
                            captureKey,
                            label,
                            exploreName: entry.exploreName,
                            queryUuid: entry.queryUuid ?? '',
                            order: entry.order,
                            rowCount: entry.rowCount,
                            limitReached: entry.limitReached,
                        });
                    } else {
                        // 'error', or 'pending' (never reached a terminal
                        // state) — a visible failure, not a silent gap.
                        items.push({
                            status: 'error',
                            captureKey,
                            label,
                            exploreName: entry.exploreName,
                            queryUuid: entry.queryUuid,
                            order: entry.order,
                            error:
                                entry.status === 'pending'
                                    ? NOT_SETTLED_ERROR
                                    : (entry.error ?? 'Unknown error'),
                        });
                    }
                });

                return {
                    version: 1,
                    items,
                    overflowCount: droppedKeys.size,
                };
            };

        const reset: DeliveryCaptureAccumulator['reset'] = () => {
            entriesByRawKey = new Map();
            requestIdToEntry = new Map();
            uuidToEntry = new Map();
            droppedKeys = new Set();
            // So a post-reset capture's first unlabeled query reads "Query 1"
            // again, not a number carried over from the previous capture.
            nextOrder = 0;
            // Listeners survive a reset — the subscriber outlives the capture.
            notifyPendingCount();
        };

        return {
            onInitiation,
            onPostResponse,
            onPostFailure,
            onTerminal,
            getManifest,
            subscribe,
            reset,
        };
    };
