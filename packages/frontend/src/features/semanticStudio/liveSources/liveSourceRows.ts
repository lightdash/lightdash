/**
 * The rows of the live data sources page: each live data source with what it
 * reads and how much it was used, by integration then name.
 */
import {
    formatEstimatedBytes,
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
    medianLatency: null,
};

const formatLiveSourceUsage = (
    usage: ExternalConnectionApiUsage | undefined,
): LiveSourceUsage => ({
    dataRead: formatEstimatedBytes(usage?.responseBytes ?? 0),
    apiCalls: (usage?.apiCalls ?? 0).toLocaleString(),
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
