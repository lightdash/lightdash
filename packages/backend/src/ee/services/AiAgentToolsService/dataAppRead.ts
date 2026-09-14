import type {
    AppVersionStatus,
    DataAppManifest,
    DataAppManifestExternalConnection,
    DataAppVizSchema,
    DataReferenceStats,
} from '@lightdash/common';

// Code-free view of a data app's latest ready version for the agent and MCP
// `readContent` tools, shaped after the manifest.

export type DataAppReadChart = {
    slug: string;
    name: string;
    kind: string | null;
    linkLive: boolean;
};

/** Context attached when the read version was generated. */
export type DataAppReadContext = {
    charts: DataAppReadChart[];
    dashboard: { slug: string; name: string } | null;
    files: string[];
    imageCount: number;
    externalConnectionAliases: string[];
};

/** Data references of one explore, aggregated across every call site. */
export type DataAppReadExploreReferences = {
    name: string;
    dimensions: string[];
    metrics: string[];
    filterFields: string[];
    sortFields: string[];
    parameterKeys: string[];
    localFields: string[];
    customSqlFieldCount: number;
};

export type DataAppReadLinkedChart = {
    slug: string;
    filterFields: string[];
};

export type DataAppReadExternalConnection = {
    alias: string;
    paths: string[];
};

/**
 * Static data footprint of the read version. Extraction is bounded, so
 * `stats` and `unresolved` say how complete the footprint is.
 */
export type DataAppReadDataReferences = {
    explores: DataAppReadExploreReferences[];
    linkedCharts: DataAppReadLinkedChart[];
    externalConnections: DataAppReadExternalConnection[];
    stats: DataReferenceStats;
    unresolved: string[];
};

export type DataAppRead = {
    slug: string;
    name: string;
    description: string;
    template: DataAppManifest['template'];
    /** The ready version this read describes. */
    version: number;
    /** null = personal app. */
    spaceSlug: string | null;
    externalConnections: DataAppManifestExternalConnection[];
    /** Declared only by project chart types. */
    vizSchema: DataAppVizSchema | null;
    createdBy: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
    versionCount: number;
    /** A version newer than the one read that is still building or failed. */
    newerVersion: { version: number; status: AppVersionStatus } | null;
    context: DataAppReadContext;
    /** null when no references were recorded for the version. */
    dataReferences: DataAppReadDataReferences | null;
};
