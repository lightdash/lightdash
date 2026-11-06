import {
    type ApiConnectorType,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
} from './liveSourceCatalog';

/** Live explores are named `<source name>_<definition>`. */
export const liveSourceName = (
    connection: ExternalConnectionListItem,
): string | null =>
    connection.liveSourceName ??
    (connection.apiSource
        ? `${connection.apiSource.connector}_${connection.externalConnectionUuid.replace(/-/g, '').slice(0, 8)}`
        : null);

/**
 * Finds the live data source behind each live explore by its name. Explores
 * are named after their source, so the longest matching name wins
 * (`posthog_2` over `posthog`).
 */
export const createLiveSourceMatcher = (
    connections: ExternalConnectionListItem[],
) => {
    const prefixes = connections
        .flatMap((connection) => {
            const name = liveSourceName(connection);
            return name ? [{ connection, prefix: `${name}_` }] : [];
        })
        .sort((a, b) => b.prefix.length - a.prefix.length);
    return (exploreName: string): ExternalConnectionListItem | undefined =>
        prefixes.find(({ prefix }) => exploreName.startsWith(prefix))
            ?.connection;
};

/**
 * Live explores start with their source's name, which by default is the
 * integration's id or connector (`posthog_events`, `search_console_…`), so
 * the explore name is enough to show the integration's logo to people who
 * can't list the sources.
 */
const INTEGRATION_PREFIXES = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource)
    .flatMap(({ id, connector }) => [
        { prefix: `${id}_`, connector },
        { prefix: `${connector}_`, connector },
    ])
    .sort((a, b) => b.prefix.length - a.prefix.length);

export const integrationOfLiveExploreName = (
    exploreName: string,
): ApiConnectorType | undefined =>
    INTEGRATION_PREFIXES.find(({ prefix }) => exploreName.startsWith(prefix))
        ?.connector;
