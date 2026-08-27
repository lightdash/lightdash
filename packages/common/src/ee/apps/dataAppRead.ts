import assertUnreachable from '../../utils/assertUnreachable';
import type {
    DataReferenceStats,
    PersistedDataAppDataReferences,
    QueryReferenceUnresolvedPart,
} from './dataReferences';
import type {
    AppClarification,
    AppVersionResources,
    AppVersionStatus,
    DataAppTemplate,
} from './types';

export type DataAppReadQuery = {
    explore: string | null;
    dimensions: string[];
    metrics: string[];
    dimensionFilterFields: string[];
    metricFilterFields: string[];
    parameterKeys: string[];
    unresolved: QueryReferenceUnresolvedPart[];
};

export type DataAppReadVersionStatus = {
    version: number;
    status: AppVersionStatus;
    statusMessage: string | null;
    error: string | null;
};

export type DataAppReadInputs = {
    charts: {
        uuid: string;
        name: string;
        chartKind: string | null;
        linkLive: boolean;
    }[];
    dashboard: { uuid: string | null; name: string } | null;
    clarifications: AppClarification[];
    designName: string | null;
    externalConnections: { name: string; alias: string }[];
};

export type DataAppReadData = {
    queries: DataAppReadQuery[];
    savedChartUuids: string[];
    externalHosts: string[];
    stats: DataReferenceStats;
};

export type DataAppReadUsage = {
    dashboards: { uuid: string; name: string; href: string }[];
    schedulers: { uuid: string; name: string }[];
    upstreamAppUuid: string | null;
};

export type DataAppReadIdentity = {
    uuid: string;
    slug: string;
    name: string;
    description: string;
    template: DataAppTemplate | null;
    space: { uuid: string; name: string } | null;
    views: number;
    createdByUserUuid: string;
};

/** What the AI analyst and external agents see of a data app. Never source. */
export type DataAppRead = {
    identity: DataAppReadIdentity & { href: string };
    status: {
        latestVersion: DataAppReadVersionStatus | null;
        latestReadyVersion: number | null;
    };
    inputs: DataAppReadInputs | null;
    data: DataAppReadData | null;
    usage: DataAppReadUsage;
};

/** Rows the data app service resolves for a permission-checked read. */
export type DataAppReadSource = {
    app: DataAppReadIdentity & { upstreamAppUuid: string | null };
    latestVersion: DataAppReadVersionStatus | null;
    latestReadyVersion: {
        version: number;
        resources: AppVersionResources | null;
    } | null;
    dataReferences: PersistedDataAppDataReferences | null;
    /** Live external connection links, keyed by the alias source code uses. */
    externalConnections: { alias: string; origin: string }[];
};

const buildInputs = (
    resources: AppVersionResources | null,
): DataAppReadInputs | null => {
    if (!resources) return null;
    return {
        charts: resources.charts.map((chart) => ({
            uuid: chart.chartUuid,
            name: chart.chartName,
            chartKind: chart.chartKind,
            linkLive: chart.linkLive ?? false,
        })),
        dashboard:
            resources.dashboardName === null
                ? null
                : {
                      uuid: resources.dashboardUuid ?? null,
                      name: resources.dashboardName,
                  },
        clarifications: resources.clarifications,
        designName: resources.design?.name ?? null,
        externalConnections: (resources.externalConnections ?? []).map(
            ({ name, alias }) => ({ name, alias }),
        ),
    };
};

const buildData = (
    dataReferences: PersistedDataAppDataReferences | null,
    externalConnections: DataAppReadSource['externalConnections'],
): DataAppReadData | null => {
    if (!dataReferences) return null;
    const queries: DataAppReadQuery[] = [];
    const savedChartUuids = new Set<string>();
    const externalHosts = new Set<string>();
    const originsByAlias = new Map(
        externalConnections.map(({ alias, origin }) => [alias, origin]),
    );
    for (const reference of dataReferences.references) {
        switch (reference.kind) {
            case 'query':
                queries.push({
                    explore: reference.explore,
                    dimensions: reference.dimensions,
                    metrics: reference.metrics,
                    dimensionFilterFields: reference.dimensionFilterFields,
                    metricFilterFields: reference.metricFilterFields,
                    parameterKeys: reference.parameterKeys,
                    unresolved: reference.unresolved,
                });
                break;
            case 'savedChart':
                if (reference.chartUuid)
                    savedChartUuids.add(reference.chartUuid);
                break;
            case 'externalFetch': {
                // An unresolved alias may reach any linked connection.
                const origins =
                    reference.alias === null
                        ? originsByAlias.values()
                        : [originsByAlias.get(reference.alias)];
                for (const origin of origins) {
                    if (origin) externalHosts.add(origin);
                }
                break;
            }
            case 'globalFilter':
                break;
            default:
                assertUnreachable(reference, 'Unknown data reference kind');
        }
    }
    return {
        queries,
        savedChartUuids: [...savedChartUuids],
        externalHosts: [...externalHosts],
        stats: dataReferences.stats,
    };
};

export const buildDataAppRead = ({
    source,
    href,
    usage,
}: {
    source: DataAppReadSource;
    href: string;
    usage: Omit<DataAppReadUsage, 'upstreamAppUuid'>;
}): DataAppRead => {
    const { upstreamAppUuid, ...identity } = source.app;
    return {
        identity: { ...identity, href },
        status: {
            latestVersion: source.latestVersion,
            latestReadyVersion: source.latestReadyVersion?.version ?? null,
        },
        inputs: buildInputs(source.latestReadyVersion?.resources ?? null),
        data: buildData(source.dataReferences, source.externalConnections),
        usage: { ...usage, upstreamAppUuid },
    };
};
