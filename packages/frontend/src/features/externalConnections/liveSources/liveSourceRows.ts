/**
 * The rows of the live data sources page: each live data source with what it
 * reads and how much it was used, by integration then name.
 */
import {
    formatEstimatedBytes,
    getLiveSourceCacheTtlSeconds,
    isLiveSourceAccessRuleEmpty,
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionApiUsage,
    type LiveSourceAccessRule,
} from '@lightdash/common';
import { formatDuration } from '../../../utils/formatters';
import { getApiSourceTarget } from './liveSourceCatalog';
import { getLiveSource } from './liveSourceCatalog';

export type LiveSourceConnection = ExternalConnection & {
    apiSource: ExternalConnectionApiSource;
};

type LiveSourceUsage = {
    /** False until the integration has been called; its numbers are then dashes. */
    isUsed: boolean;
    /** Logged queries, whether or not a stored result answered them. */
    queries: string;
    /** Bytes read from the integration, in words, such as 361 KB. */
    dataRead: string;
    apiCalls: string;
    /** The share of queries a stored result answered, such as 42%; null with no queries. */
    hitRate: string | null;
    /** Null until the integration has been called. */
    medianLatency: string | null;
};

type LiveSourceRow = {
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

const NO_VALUE = '—';

const LOADING_USAGE: LiveSourceUsage = {
    isUsed: false,
    queries: NO_VALUE,
    dataRead: NO_VALUE,
    apiCalls: NO_VALUE,
    hitRate: null,
    medianLatency: null,
};

const formatLiveSourceUsage = (
    usage: ExternalConnectionApiUsage | undefined,
): LiveSourceUsage => {
    const queries = usage?.queries ?? 0;
    const isUsed = (usage?.apiCalls ?? 0) > 0;
    return {
        isUsed,
        queries: queries.toLocaleString(),
        // A dash rather than a zero that reads as a measurement
        dataRead: isUsed
            ? formatEstimatedBytes(usage?.responseBytes ?? 0)
            : NO_VALUE,
        apiCalls: isUsed ? (usage?.apiCalls ?? 0).toLocaleString() : NO_VALUE,
        hitRate:
            queries > 0
                ? `${Math.round(((usage?.cacheHits ?? 0) / queries) * 100)}%`
                : null,
        medianLatency:
            usage && usage.medianDurationMs !== null
                ? formatDuration(usage.medianDurationMs)
                : null,
    };
};

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
export const getLiveSourceFreshness = (
    connection: LiveSourceConnection,
): number =>
    getLiveSourceCacheTtlSeconds(
        connection.apiSource.connector,
        connection.cacheTtlSeconds,
    );

const describeCondition = ([name, values]: [string, string[]]) =>
    `${name} is ${values.join(' or ')}`;

/**
 * Who a live data source's access rule lets query it, in words, such as
 * "team is sales, and region is emea or tier is gold". Null when everyone can.
 */
export const describeLiveSourceAccessRule = (
    rule: LiveSourceAccessRule | null | undefined,
): string | null => {
    if (!rule || isLiveSourceAccessRuleEmpty(rule)) return null;
    const required = Object.entries(rule.required).map(describeCondition);
    const any = Object.entries(rule.any).map(describeCondition);
    return [
        ...required,
        ...(any.length > 0 ? [any.join(any.length > 1 ? ', or ' : '')] : []),
    ].join(', and ');
};
