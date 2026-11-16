import {
    ParameterError,
    type ApiConnectorType,
    type ApiSourceOf,
    type CreateExternalConnection,
    type Explore,
    type ExternalConnectionAuthType,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { type z } from 'zod';
import {
    type ApiConnector,
    type ApiConnectorCapabilities,
    type ApiConnectorTransport,
} from './ApiConnector';
import {
    type ApiSourceExploreDefinition,
    type CompiledApiSourceQuery,
} from './apiSourceExplore';
import { type PostHogPropertyKind } from './posthog/posthogSemanticLayer';

/** What an integration reports about its own fields; absent when not scanned. */
export type ApiSourceScan = {
    ga4Metadata?: unknown;
    posthogProperties?: Record<PostHogPropertyKind, unknown>;
};

/**
 * The hand-written models of an integration, before any scan. The first is
 * the wide model: scans and field edits apply to it. Planned models aren't
 * built yet, but their explore names are reserved for every new source.
 */
export type ApiSourceBaseLayer = {
    baseVersion: number;
    /** The connector's own declaration, shared by every model. */
    capabilities: ApiConnectorCapabilities;
    definitions: readonly [
        ApiSourceExploreDefinition,
        ...ApiSourceExploreDefinition[],
    ];
    plannedModelNames: readonly string[];
};

export const API_SOURCE_RESPONSE_MAX_BYTES = 25 * 1024 * 1024;

/** What a source can reach, whatever its stored connection says. */
export type ApiSourceAccessRules = Required<
    Pick<
        CreateExternalConnection,
        | 'allowedPathPrefixes'
        | 'allowedMethods'
        | 'allowedContentTypes'
        | 'timeoutMs'
        | 'responseMaxBytes'
    >
> &
    Pick<CreateExternalConnection, 'customHeaders'>;

export type ApiSourceConnectionSettings<
    C extends ApiConnectorType = ApiConnectorType,
> = {
    apiSource: ApiSourceOf<C>;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
};

export type ApiSourceCompileArgs = {
    explore: Explore;
    metricQuery: MetricQuery;
    timezone: string;
    now: Date;
};

/**
 * Everything the backend knows about one integration. Adding an integration
 * means writing one of these and listing it in `apiSourceIntegrations.ts`.
 */
export type ApiSourceIntegration<
    C extends ApiConnectorType = ApiConnectorType,
> = {
    connector: C;
    /** The shape stored on the connection. */
    settingsSchema: z.ZodType<ApiSourceOf<C>>;
    baseLayer: ApiSourceBaseLayer;
    /** Defaults to DuckDB, which only runs the compiled explore's SQL shape. */
    warehouseSqlBuilder?: WarehouseSqlBuilder;
    getAccessRules(apiSource: ApiSourceOf<C>): ApiSourceAccessRules;
    /** Throws a ParameterError naming what the admin has to change. */
    validateConnection(settings: ApiSourceConnectionSettings<C>): void;
    /**
     * Says what this source reads, for the AI agent. `targetLabel` is the name
     * the connection picker showed, absent on sources connected without one.
     */
    describeTarget(args: {
        apiSource: ApiSourceOf<C>;
        origin: string;
        targetLabel: string | null;
    }): string;
    createConnector(
        apiSource: ApiSourceOf<C>,
        send: ApiConnectorTransport,
    ): {
        connector: ApiConnector;
        /** Omitted when every field is built in. */
        scan?: () => Promise<ApiSourceScan>;
    };
    compile(args: ApiSourceCompileArgs): CompiledApiSourceQuery;
    /** Omitted when every field is built in. */
    withScannedFields?(
        definition: ApiSourceExploreDefinition,
        scan: ApiSourceScan,
    ): ApiSourceExploreDefinition;
    /** Scanned fields the integration keeps out of the default field list. */
    isInternalField?(apiName: string): boolean;
};

/** Sources only ever talk to their integration's own host. */
export const assertApiSourceOrigin = (
    label: string,
    origin: string,
    expected: string,
) => {
    if (origin.replace(/\/+$/, '') !== expected) {
        throw new ParameterError(`${label} connections must use ${expected}`);
    }
};
