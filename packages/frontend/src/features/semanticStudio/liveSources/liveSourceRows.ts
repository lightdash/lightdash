/**
 * The rows of the live data sources page: each live data source with what it
 * reads and how much it was used, by integration then name.
 */
import {
    formatEstimatedBytes,
    getLiveSourceCacheTtlSeconds,
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionApiUsage,
} from '@lightdash/common';
import { formatDuration } from '../../../utils/formatters';
import { getApiSourceTarget } from '../../externalConnections/liveSources/liveSourceCatalog';
import { getLiveSource } from '../../externalConnections/liveSources/liveSourceCatalog';

export type LiveSourceConnection = ExternalConnection & {
    apiSource: ExternalConnectionApiSource;
};

export type LiveSourceUsage = {
    /** Bytes read from the integration, in words, such as 361 KB. */
    dataRead: string;
    apiCalls: string;
    /** The cache hits with their noun, such as 1 hit; null until usage loads. */
    cacheHitsLabel: string | null;
    /** Null until the integration has been called. */
    medianLatency: string | null;
};

export type LiveSourceRow = {
    connection: LiveSourceConnection;
    integration: string;
    /** What it reads: a PostHog project, a Search Console site, a GA4 property. */
    target: string;
    usage: LiveSourceUsage;
};

export const isLiveSourceConnection = (
    connection: ExternalConnection,
): connection is LiveSourceConnection =>
    connection.kind === 'live_source' && !!connection.apiSource;

const LOADING_USAGE: LiveSourceUsage = {
    dataRead: '—',
    apiCalls: '—',
    cacheHitsLabel: null,
    medianLatency: null,
};

/** A count of cache hits in words: "1 hit", "1,204 hits". */
export const formatCacheHits = (count: number): string =>
    `${count.toLocaleString()} ${count === 1 ? 'hit' : 'hits'}`;

const formatLiveSourceUsage = (
    usage: ExternalConnectionApiUsage | undefined,
): LiveSourceUsage => ({
    dataRead: formatEstimatedBytes(usage?.responseBytes ?? 0),
    apiCalls: (usage?.apiCalls ?? 0).toLocaleString(),
    cacheHitsLabel: formatCacheHits(usage?.cacheHits ?? 0),
    medianLatency:
        usage && usage.medianDurationMs !== null
            ? formatDuration(usage.medianDurationMs)
            : null,
});

export const toLiveSourceRow = (
    connection: LiveSourceConnection,
    usage: ExternalConnectionApiUsage[] | undefined,
): LiveSourceRow => ({
    connection,
    integration: getLiveSource(connection.apiSource.connector).label,
    target: getApiSourceTarget(connection.apiSource),
    // Until usage loads, a dash rather than a zero that reads as unused.
    usage: !usage
        ? LOADING_USAGE
        : formatLiveSourceUsage(
              usage.find(
                  ({ externalConnectionUuid }) =>
                      externalConnectionUuid ===
                      connection.externalConnectionUuid,
              ),
          ),
});

export const toLiveSourceRows = (
    connections: ExternalConnection[],
    usage: ExternalConnectionApiUsage[] | undefined,
): LiveSourceRow[] =>
    connections
        .filter(isLiveSourceConnection)
        .map((connection) => toLiveSourceRow(connection, usage))
        .sort(
            (a, b) =>
                a.integration.localeCompare(b.integration) ||
                a.connection.name.localeCompare(b.connection.name),
        );

/** A freshness window in words: "1 min", "15 min", "1 hour", "Always fetch". */
export const formatFreshness = (seconds: number): string => {
    if (seconds === 0) return 'Always fetch';
    if (seconds < 60) return `${seconds} sec`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
    const hours = Math.round(seconds / 3_600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

/** How long a source's results answer the same query. */
export const getLiveSourceFreshness = (connection: LiveSourceConnection) => ({
    seconds: getLiveSourceCacheTtlSeconds(
        connection.apiSource.connector,
        connection.cacheTtlSeconds,
    ),
});
