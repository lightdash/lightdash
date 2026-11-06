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
} from '@lightdash/common';
import { getWarehouseLabel } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import {
    createLiveSourceMatcher,
    integrationOfLiveExploreName,
    liveSourceName,
} from '../externalConnections/liveSources/liveSourceExplores';
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
const unlistedLiveSource = (explore: SummaryExplore): Source => ({
    id: `live:${explore.name}`,
    kind: 'live',
    type: 'live',
    name: explore.label || explore.name,
    origin: 'Live data source',
    onWarehouse: false,
    status: null,
    integration: integrationOfLiveExploreName(explore.name),
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
}: {
    project: LightdashProject;
    explores: SummaryExplore[];
    externalSources: ExternalSource[];
    liveConnections: ExternalConnectionListItem[];
}): Project => {
    const warehouseType = project.warehouseConnection?.type;
    const warehouseLabel = warehouseType
        ? getWarehouseLabel(warehouseType)
        : null;
    const liveSourceOf = createLiveSourceMatcher(liveConnections);
    const sources = new Map<string, Source>();
    const register = (source: Source) => {
        if (!sources.has(source.id)) sources.set(source.id, source);
        return source;
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
                const connection = liveSourceOf(explore.name);
                return register(
                    connection
                        ? liveSource(connection)
                        : unlistedLiveSource(explore),
                );
            }
            case ExploreType.PRE_AGGREGATE:
                return null;
            default:
                return register(warehouseSource(project));
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
    // Longest name first, as before, so the source order doesn't change.
    liveConnections
        .flatMap((connection) => {
            const name = liveSourceName(connection);
            return name === null ? [] : [{ connection, name }];
        })
        .sort((a, b) => b.name.length - a.name.length)
        .forEach(({ connection }) => register(liveSource(connection)));

    return {
        id: project.projectUuid,
        name: project.name,
        warehouse:
            warehouseType && warehouseLabel
                ? { type: warehouseType, label: warehouseLabel }
                : undefined,
        sources: [...sources.values()],
        explores: realExplores,
    };
};
