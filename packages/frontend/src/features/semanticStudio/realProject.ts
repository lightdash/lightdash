/**
 * Builds the page's model from what the project really has: its explores,
 * external sources (CSV uploads and Google Sheets) and live data sources.
 */
import {
    DbtProjectType,
    ExploreType,
    ExternalSourceStatus,
    ExternalSourceType,
    getExternalSourceDisplayName,
    isSummaryExploreError,
    type ExternalConnectionListItem,
    type ExternalSource,
    type ExternalSourceRef,
    type Project as LightdashProject,
    type SummaryExplore,
    type WarehouseConnection,
} from '@lightdash/common';
import { getWarehouseLabel } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
} from '../externalConnections/liveSources/liveSourceCatalog';
import { type Explore, type Project, type Source } from './model';

const SETTINGS = '/generalSettings/projectManagement/:projectUuid';

export const WAREHOUSE_SOURCE_ID = 'warehouse';
const VIRTUAL_VIEWS_SOURCE_ID = 'virtual-views';

const DBT_ORIGINS: Partial<Record<DbtProjectType, string>> = {
    [DbtProjectType.DBT]: 'dbt project on the server',
    [DbtProjectType.DBT_CLOUD_IDE]: 'dbt Cloud',
    [DbtProjectType.NONE]: 'Deployed from the CLI',
    [DbtProjectType.MANIFEST]: 'Uploaded dbt manifest',
};

const dbtOrigin = (project: LightdashProject): string => {
    const connection = project.dbtConnection;
    if ('repository' in connection && connection.repository) {
        return `${connection.repository} @ ${connection.branch}`;
    }
    return DBT_ORIGINS[connection.type] ?? 'dbt project';
};

const warehouseSource = (project: LightdashProject): Source => ({
    id: WAREHOUSE_SOURCE_ID,
    kind: 'modelled',
    type: 'dbt',
    name: project.name,
    origin: dbtOrigin(project),
    onWarehouse: true,
    status: null,
    settingsPath: `${SETTINGS}/settings`,
});

/**
 * One of several warehouse connections. The original keeps the warehouse's
 * id, so links to it still work after the project switches.
 */
const connectionSource = (
    project: LightdashProject,
    connection: WarehouseConnection,
): Source => ({
    ...warehouseSource(project),
    id: connection.isOriginal
        ? WAREHOUSE_SOURCE_ID
        : `${WAREHOUSE_SOURCE_ID}:${connection.warehouseConnectionUuid}`,
    name: connection.name,
    warehouse: {
        type: connection.warehouseType,
        label:
            getWarehouseLabel(connection.warehouseType) ??
            connection.warehouseType,
    },
});

/** An extra connection the person can't list: named for what it is. */
const unlistedConnectionSource = (
    project: LightdashProject,
    warehouseConnectionUuid: string,
): Source => ({
    ...warehouseSource(project),
    id: `${WAREHOUSE_SOURCE_ID}:${warehouseConnectionUuid}`,
    name: 'Other warehouse',
    // Not the project's warehouse, and which one isn't known here.
    onWarehouse: false,
});

const virtualViewsSource: Source = {
    id: VIRTUAL_VIEWS_SOURCE_ID,
    kind: 'sqlViews',
    type: 'sqlView',
    name: 'Virtual views',
    origin: 'Saved from the SQL runner',
    onWarehouse: true,
    status: null,
    settingsPath: null,
};

const externalSource = (source: ExternalSource): Source => ({
    id: source.sourceUuid,
    kind: 'files',
    type: source.type === ExternalSourceType.CSV ? 'csv' : 'sheets',
    name: getExternalSourceDisplayName(source),
    origin:
        source.type === ExternalSourceType.CSV ? 'CSV upload' : 'Google Sheet',
    onWarehouse: false,
    status:
        source.status === ExternalSourceStatus.ERROR
            ? (source.errorMessage ?? 'The last refresh failed')
            : null,
    settingsPath: `${SETTINGS}/externalSources`,
});

/** Live explores are named `<source name>_<definition>`. */
const liveSourceName = (connection: ExternalConnectionListItem) =>
    connection.liveSourceName ??
    (connection.apiSource
        ? `${connection.apiSource.connector}_${connection.externalConnectionUuid.replace(/-/g, '').slice(0, 8)}`
        : null);

const liveSource = (connection: ExternalConnectionListItem): Source => ({
    id: connection.externalConnectionUuid,
    kind: 'live',
    type: 'live',
    name: connection.name,
    origin: 'Live data source',
    onWarehouse: false,
    status: null,
    integration: connection.apiSource?.connector,
    connectionUuid: connection.externalConnectionUuid,
    // Managed on the live data sources page, not in settings.
    settingsPath: null,
});

/**
 * People who can't list the sources still see what they can query: each
 * explore stands for its own source, named after itself.
 */
/**
 * Live explores start with their source's name, which by default is the
 * integration's id or connector (`posthog_events`, `search_console_…`), so
 * the explore name is enough to show the integration's logo.
 */
const INTEGRATION_PREFIXES = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource)
    .flatMap(({ id, connector }) => [
        { prefix: `${id}_`, connector },
        { prefix: `${connector}_`, connector },
    ])
    .sort((a, b) => b.prefix.length - a.prefix.length);

const integrationOf = (exploreName: string) =>
    INTEGRATION_PREFIXES.find(({ prefix }) => exploreName.startsWith(prefix))
        ?.connector;

const unlistedLiveSource = (explore: SummaryExplore): Source => ({
    id: `live:${explore.name}`,
    kind: 'live',
    type: 'live',
    name: explore.label || explore.name,
    origin: 'Live data source',
    onWarehouse: false,
    status: null,
    integration: integrationOf(explore.name),
    settingsPath: null,
});

const unlistedExternalSource = (
    explore: SummaryExplore,
    ref: ExternalSourceRef,
): Source => ({
    id: ref.sourceUuid,
    kind: 'files',
    type: ref.sourceType === ExternalSourceType.CSV ? 'csv' : 'sheets',
    name: explore.label || explore.name,
    origin:
        ref.sourceType === ExternalSourceType.CSV
            ? 'CSV upload'
            : 'Google Sheet',
    onWarehouse: false,
    status: null,
    settingsPath: `${SETTINGS}/externalSources`,
});

const groupPathOf = (explore: SummaryExplore): string[] => {
    if (explore.groups && explore.groups.length > 0) return explore.groups;
    return explore.groupLabel ? [explore.groupLabel] : [];
};

export const buildRealProject = ({
    project,
    explores,
    externalSources,
    liveConnections,
    warehouseConnections = null,
}: {
    project: LightdashProject;
    explores: SummaryExplore[];
    externalSources: ExternalSource[];
    liveConnections: ExternalConnectionListItem[];
    /**
     * With several warehouses allowed, the project's connections (empty
     * until it switches, or for people who can't list them); null otherwise.
     */
    warehouseConnections?: WarehouseConnection[] | null;
}): Project => {
    const warehouseType = project.warehouseConnection?.type;
    const warehouseLabel = warehouseType
        ? getWarehouseLabel(warehouseType)
        : null;
    const live = liveConnections
        .map((connection) => ({
            connection,
            prefix: liveSourceName(connection),
        }))
        .filter(
            (entry): entry is typeof entry & { prefix: string } =>
                entry.prefix !== null,
        )
        // Longest first, so `posthog_2` wins over `posthog`.
        .sort((a, b) => b.prefix.length - a.prefix.length);
    const sources = new Map<string, Source>();
    const register = (source: Source) => {
        if (!sources.has(source.id)) sources.set(source.id, source);
        return source;
    };

    const original = warehouseConnections?.find(({ isOriginal }) => isOriginal);
    /** The warehouse an explore runs on: the original unless bound elsewhere. */
    const modelledSource = ({
        warehouseConnectionUuid,
    }: SummaryExplore): Source => {
        if (!warehouseConnections) return warehouseSource(project);
        const connection = warehouseConnections.find(
            (candidate) =>
                candidate.warehouseConnectionUuid ===
                (warehouseConnectionUuid ?? original?.warehouseConnectionUuid),
        );
        if (connection) return connectionSource(project, connection);
        return warehouseConnectionUuid === null
            ? warehouseSource(project)
            : unlistedConnectionSource(project, warehouseConnectionUuid);
    };

    const sourceOf = (explore: SummaryExplore): Source | null => {
        switch (explore.type) {
            case ExploreType.VIRTUAL:
                return register(virtualViewsSource);
            case ExploreType.EXTERNAL_SOURCE: {
                const ref =
                    'externalSource' in explore
                        ? explore.externalSource
                        : undefined;
                if (!ref) return null;
                const found = externalSources.find(
                    ({ sourceUuid }) => sourceUuid === ref.sourceUuid,
                );
                return register(
                    found
                        ? externalSource(found)
                        : unlistedExternalSource(explore, ref),
                );
            }
            case ExploreType.API_SOURCE: {
                const match = live.find(({ prefix }) =>
                    explore.name.startsWith(`${prefix}_`),
                );
                return register(
                    match
                        ? liveSource(match.connection)
                        : unlistedLiveSource(explore),
                );
            }
            case ExploreType.PRE_AGGREGATE:
                return null;
            default:
                return register(modelledSource(explore));
        }
    };

    const realExplores = explores.flatMap((summary): Explore[] => {
        const source = sourceOf(summary);
        if (!source) return [];
        return [
            {
                id: summary.name,
                name: summary.name,
                label: summary.label || summary.name,
                sourceId: source.id,
                groupPath: groupPathOf(summary),
                description: summary.description ?? '',
                warnings: isSummaryExploreError(summary)
                    ? (summary.errors ?? []).map(({ message }) => message)
                    : (summary.warnings ?? []).map(({ message }) => message),
            },
        ];
    });

    // A source with no explores yet (just added, or its build failed) still
    // has a page, so it can be fixed or removed.
    for (const { connection } of live) register(liveSource(connection));
    // So does a warehouse just connected.
    for (const connection of warehouseConnections ?? []) {
        register(connectionSource(project, connection));
    }

    return {
        id: project.projectUuid,
        name: project.name,
        warehouse:
            warehouseType && warehouseLabel
                ? { type: warehouseType, label: warehouseLabel }
                : undefined,
        multipleWarehouses: warehouseConnections !== null,
        sources: [...sources.values()],
        explores: realExplores,
    };
};
