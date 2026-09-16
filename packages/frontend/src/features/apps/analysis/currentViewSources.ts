import { type DataAppAnalysisSource } from '@lightdash/common';
import {
    stableStringify,
    stripCaptureBodyFields,
} from '../deliveryCapture/stableStringify';
import { type QueryEvent } from '../hooks/useAppSdkBridge';

/**
 * Same identity the delivery capture uses: the query body minus the fields
 * the host stamps per request. A re-run of the same chart replaces the
 * earlier one; a different filter value is a different source.
 */
const sourceKey = (event: QueryEvent): string =>
    event.rawMetricQuery
        ? stableStringify(stripCaptureBodyFields(event.rawMetricQuery))
        : (event.label ?? event.exploreName ?? event.id);

/**
 * The queries behind the viewer's current view: the latest ready query per
 * source key. Query history is not what is visible (preloaded tabs keep old
 * queries), so this is disclosed as a limitation in the panel.
 */
export const selectCurrentViewSources = (
    queries: QueryEvent[],
): DataAppAnalysisSource[] => {
    const latestByKey = new Map<string, QueryEvent>();
    queries.forEach((event) => {
        if (event.status !== 'ready' || !event.queryUuid) return;
        const key = sourceKey(event);
        const existing = latestByKey.get(key);
        if (!existing || event.timestamp >= existing.timestamp) {
            latestByKey.set(key, event);
        }
    });
    return [...latestByKey.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((event) => ({
            queryUuid: event.queryUuid as string,
            label: event.label ?? event.exploreName ?? null,
        }));
};

export const hasInFlightQueries = (queries: QueryEvent[]): boolean =>
    queries.some(
        (event) => event.status === 'pending' || event.status === 'running',
    );

export const sourcesSignature = (sources: DataAppAnalysisSource[]): string =>
    sources
        .map((s) => s.queryUuid)
        .sort()
        .join('|');
