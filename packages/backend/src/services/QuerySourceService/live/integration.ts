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
    type LiveCapabilities,
    type LiveConnector,
    type LiveTransport,
} from './connector';
import {
    type CompiledLiveQuery,
    type LiveExploreDefinition,
} from './explores/definition';
import { type PostHogPropertyKind } from './integrations/postHog/explores';

/** What an integration reports about its own fields; absent when not scanned. */
export type LiveScanResult = {
    ga4Metadata?: unknown;
    posthogProperties?: Record<PostHogPropertyKind, unknown>;
};

/**
 * The hand-written models of an integration, before any scan. The first is
 * the wide model: scans and field edits apply to it. Planned models aren't
 * built yet, but their explore names are reserved for every new source.
 */
export type LiveBaseLayer = {
    baseVersion: number;
    /** The connector's own declaration, shared by every model. */
    capabilities: LiveCapabilities;
    definitions: readonly [LiveExploreDefinition, ...LiveExploreDefinition[]];
    plannedModelNames: readonly string[];
};

export const LIVE_RESPONSE_MAX_BYTES = 25 * 1024 * 1024;

/** What a source can reach, whatever its stored connection says. */
export type LiveAccessRules = Required<
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

export type LiveConnectionSettings<
    C extends ApiConnectorType = ApiConnectorType,
> = {
    apiSource: ApiSourceOf<C>;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
};

export type LiveCompileArgs = {
    explore: Explore;
    metricQuery: MetricQuery;
    timezone: string;
    now: Date;
};

/**
 * Everything the backend knows about one integration, as
 * `defineLiveIntegration` builds it from an integration's definition.
 */
export type LiveIntegration<C extends ApiConnectorType = ApiConnectorType> = {
    connector: C;
    /** The shape stored on the connection. */
    settingsSchema: z.ZodType<ApiSourceOf<C>>;
    baseLayer: LiveBaseLayer;
    /** Defaults to DuckDB, which only runs the compiled explore's SQL shape. */
    warehouseSqlBuilder?: WarehouseSqlBuilder;
    getAccessRules(apiSource: ApiSourceOf<C>): LiveAccessRules;
    /** Throws a ParameterError naming what the admin has to change. */
    validateConnection(settings: LiveConnectionSettings<C>): void;
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
        send: LiveTransport,
    ): {
        connector: LiveConnector;
        /** Omitted when every field is built in. */
        scan?: () => Promise<LiveScanResult>;
    };
    compile(args: LiveCompileArgs): CompiledLiveQuery;
    /** Omitted when every field is built in. */
    withScannedFields?(
        definition: LiveExploreDefinition,
        scan: LiveScanResult,
    ): LiveExploreDefinition;
    /** Scanned fields the integration keeps out of the default field list. */
    isInternalField?(apiName: string): boolean;
};

/** Sources only ever talk to their integration's own hosts. */
export const assertLiveOrigin = (
    label: string,
    origin: string,
    expected: string | readonly string[],
) => {
    const origins = typeof expected === 'string' ? [expected] : expected;
    if (!origins.includes(origin.replace(/\/+$/, ''))) {
        throw new ParameterError(
            `${label} connections must use ${origins.join(' or ')}`,
        );
    }
};
