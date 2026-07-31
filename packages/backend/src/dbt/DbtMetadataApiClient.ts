import {
    AnyType,
    DbtError,
    DbtModelNode,
    DbtRpcGetManifestResults,
    getErrorMessage,
    getLatestSupportedDbtManifestVersion,
    isSupportedDbtAdapterType,
    MetricFlowAggregation,
    ParseError,
    SupportedDbtAdapter,
    type DbtSemanticMetric,
    type DbtSemanticMetricType,
    type DbtSemanticMetricTypeParams,
    type DbtSemanticModel,
} from '@lightdash/common';
import { gql, GraphQLClient } from 'graphql-request';
import Logger from '../logging/logger';
import { DbtClient } from '../types';

const quoteChars: Record<SupportedDbtAdapter, string> = {
    bigquery: '`',
    databricks: '`',
    snowflake: `"`,
    redshift: `"`,
    postgres: `"`,
    duckdb: `"`,
    trino: `"`,
    clickhouse: `"`,
    athena: `"`,
    spark: '`',
};

const PAGE_SIZE = 500;

type DbtCloudEnvironmentResponse = {
    environment: {
        adapterType: string | null;
        applied: {
            lastUpdatedAt: string;
            models: {
                totalCount: number;
                pageInfo: {
                    startCursor: string;
                    hasNextPage: boolean;
                    endCursor: string;
                };
                edges: {
                    node: {
                        resourceType: string;
                        accountId: string;
                        projectId: string;
                        environmentId: string;
                        uniqueId: string;
                        name: string;
                        description: string;
                        meta: AnyType;
                        tags: string[];
                        filePath: string;
                        database: string;
                        schema: string;
                        alias: string;
                        packageName: string;
                        rawCode: string;
                        compiledCode: string;
                        materializedType: string;
                        language: string;
                        packages: string[];
                        dbtVersion: string;
                        group: string;
                        access: string;
                        deprecationDate: string;
                        version: string;
                        latestVersion: string;
                        releaseVersion: string;
                        contractEnforced: boolean;
                        patchPath: string;
                        config: AnyType;
                        catalog: {
                            columns: {
                                name: string;
                                description: string;
                                type: string;
                                meta: AnyType;
                            };
                        };
                    };
                }[];
            };
        };
    };
};

type DbtCloudPageInfo = {
    startCursor: string;
    hasNextPage: boolean;
    endCursor: string;
};

export type DbtCloudSemanticModelNode = {
    uniqueId: string;
    name: string;
    description: string | null;
    entities: { name: string; type: string }[];
    dimensions: { name: string; type: string }[];
    measures: {
        name: string;
        agg: string;
        expr: string | null;
        createMetric: boolean | null;
        description: string | null;
    }[];
    parents: { uniqueId: string }[];
};

export type DbtCloudMetricNode = {
    uniqueId: string;
    name: string;
    description: string | null;
    label: string | null;
    type: string | null;
    typeParams: AnyType;
    filter: AnyType;
    meta: AnyType;
};

type DbtCloudDefinitionResponse = {
    environment: {
        definition: {
            semanticModels: {
                pageInfo: DbtCloudPageInfo;
                edges: { node: DbtCloudSemanticModelNode }[];
            };
            metrics: {
                pageInfo: DbtCloudPageInfo;
                edges: { node: DbtCloudMetricNode }[];
            };
        } | null;
    };
};

/**
 * MetricFlow definitions from the Discovery API's definition state. The JSON
 * scalars (`typeParams`, `filter`, `meta`) mirror the dbt manifest shapes
 * (`type_params`, `filter`, `config.meta`), so they feed the shared MetricFlow
 * translator with minimal mapping.
 */
const dbtCloudDefinitionQuery = gql`
    query DefinitionQuery(
        $environmentId: BigInt!
        $first: Int!
        $afterSemanticModels: String
        $afterMetrics: String
    ) {
        environment(id: $environmentId) {
            definition {
                semanticModels(first: $first, after: $afterSemanticModels) {
                    pageInfo {
                        startCursor
                        hasNextPage
                        endCursor
                    }
                    edges {
                        node {
                            uniqueId
                            name
                            description
                            entities {
                                name
                                type
                            }
                            dimensions {
                                name
                                type
                            }
                            measures {
                                name
                                agg
                                expr
                                createMetric
                                description
                            }
                            parents {
                                uniqueId
                            }
                        }
                    }
                }
                metrics(first: $first, after: $afterMetrics) {
                    pageInfo {
                        startCursor
                        hasNextPage
                        endCursor
                    }
                    edges {
                        node {
                            uniqueId
                            name
                            description
                            label
                            type
                            typeParams
                            filter
                            meta
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Map Discovery API semantic model definition nodes to the dbt manifest
 * `semantic_models` shape consumed by `translateMetricFlowMetrics`.
 *
 * Known gaps of the Discovery API vs a local manifest: measure `agg_params`
 * (percentile values), measure/dimension `config.meta` and dimension `expr`
 * are not exposed. Percentile metrics are skipped by the translator (missing
 * percentile value) and dimension filters resolve against the dimension name.
 */
export const mapDbtCloudSemanticModels = (
    nodes: DbtCloudSemanticModelNode[],
): Record<string, DbtSemanticModel> =>
    Object.fromEntries(
        nodes.map((node) => [
            node.uniqueId,
            <DbtSemanticModel>{
                name: node.name,
                unique_id: node.uniqueId,
                // The dbt ref string is not exposed by the Discovery API; the
                // translator resolves the model through `depends_on` instead.
                model: '',
                node_relation: null,
                description: node.description,
                entities: (node.entities ?? []).map((entity) => ({
                    name: entity.name,
                    type: entity.type,
                    expr: null,
                })),
                dimensions: (node.dimensions ?? []).map((dimension) => ({
                    name: dimension.name,
                    type: dimension.type,
                    expr: null,
                })),
                measures: (node.measures ?? []).map((measure) => ({
                    name: measure.name,
                    agg: measure.agg as MetricFlowAggregation,
                    expr: measure.expr,
                    create_metric: measure.createMetric ?? undefined,
                    description: measure.description,
                })),
                depends_on: {
                    nodes: (node.parents ?? [])
                        .map((parent) => parent.uniqueId)
                        .filter((uniqueId) => uniqueId.startsWith('model.')),
                },
            },
        ]),
    );

/**
 * Map Discovery API metric definition nodes to the dbt manifest `metrics`
 * shape. `typeParams` and `filter` are returned by the API in the manifest's
 * snake_case shapes verbatim; `meta` is the manifest's `config.meta`.
 */
export const mapDbtCloudMetrics = (
    nodes: DbtCloudMetricNode[],
): Record<string, DbtSemanticMetric> =>
    Object.fromEntries(
        nodes.map((node) => [
            node.uniqueId,
            <DbtSemanticMetric>{
                name: node.name,
                unique_id: node.uniqueId,
                type: node.type as DbtSemanticMetricType,
                type_params: node.typeParams as DbtSemanticMetricTypeParams,
                label: node.label,
                description: node.description,
                filter: node.filter ?? null,
                config:
                    node.meta && typeof node.meta === 'object'
                        ? { meta: node.meta }
                        : null,
            },
        ]),
    );

const dbtCloudEnvironmentQuery = gql`
    query EnvironmentQuery(
        $environmentId: BigInt!
        $first: Int!
        $after: String
        $filter: ModelAppliedFilter!
    ) {
        environment(id: $environmentId) {
            adapterType
            applied {
                lastUpdatedAt
                models(first: $first, after: $after, filter: $filter) {
                    pageInfo {
                        startCursor
                        hasNextPage
                        endCursor
                    }
                    totalCount
                    edges {
                        node {
                            resourceType
                            accountId
                            projectId
                            environmentId
                            uniqueId
                            name
                            description
                            meta
                            tags
                            filePath
                            database
                            schema
                            alias
                            packageName
                            rawCode
                            compiledCode
                            materializedType
                            language
                            packages
                            dbtVersion
                            group
                            access
                            deprecationDate
                            version
                            latestVersion
                            releaseVersion
                            contractEnforced
                            patchPath
                            config
                            catalog {
                                columns {
                                    name
                                    description
                                    type
                                    meta
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

export class DbtMetadataApiClient implements DbtClient {
    private readonly domain: string =
        'https://metadata.cloud.getdbt.com/graphql';

    private readonly bearerToken: string;

    private readonly environmentId: string | number;

    private readonly tags: string[] | undefined;

    private readonly endpoint: URL;

    private readonly client: GraphQLClient;

    constructor({
        environmentId,
        discoveryApiEndpoint,
        bearerToken,
        tags,
    }: {
        environmentId: string | number;
        bearerToken: string;
        discoveryApiEndpoint: string | undefined;
        tags: string[] | undefined;
    }) {
        this.environmentId = environmentId;
        this.bearerToken = bearerToken;
        this.endpoint = new URL(
            '/graphql',
            discoveryApiEndpoint || this.domain,
        );
        this.client = new GraphQLClient(this.endpoint.href, {
            headers: {
                Authorization: `Bearer ${this.bearerToken}`,
                'X-dbt-partner-source': 'lightdash',
            },
        });
        this.tags = tags;
    }

    static parseError(e: AnyType): DbtError {
        const errors: string[] | undefined = e?.response?.errors?.map(
            (innerError: { message: string }) => {
                if (
                    innerError.message.includes(
                        'There is no data available for this input',
                    )
                ) {
                    return 'No data found. Please check the environment ID and the API domain are correct.';
                }
                return innerError.message;
            },
        );

        return new DbtError(
            errors?.join('\n') ??
                'Unexpected error fetching metadata from dbt cloud',
        );
    }

    /* eslint-disable-next-line class-methods-use-this */
    getSelector(): string | undefined {
        return undefined;
    }

    private async getModels(
        prevResponse?: DbtCloudEnvironmentResponse,
    ): Promise<DbtCloudEnvironmentResponse> {
        const response = await this.client.request<DbtCloudEnvironmentResponse>(
            dbtCloudEnvironmentQuery,
            {
                environmentId: this.environmentId,
                first: PAGE_SIZE,
                after: prevResponse?.environment.applied.models.pageInfo
                    .endCursor,
                filter: {
                    lastRunStatus: 'success',
                    tags: this.tags,
                },
            },
        );

        // Accumulate models
        const responseWithNewModels = {
            environment: {
                ...response.environment,
                applied: {
                    ...response.environment.applied,
                    models: {
                        ...response.environment.applied.models,
                        edges: [
                            ...(prevResponse?.environment.applied.models
                                .edges || []),
                            ...response.environment.applied.models.edges,
                        ],
                    },
                },
            },
        };

        if (response.environment.applied.models.pageInfo.hasNextPage) {
            // Recursively fetch more models
            return this.getModels(responseWithNewModels);
        }

        return responseWithNewModels;
    }

    /**
     * Fetch MetricFlow semantic model and metric definitions from the
     * Discovery API definition state. Both connections are paginated
     * independently until exhausted.
     */
    private async getDefinitionPage(
        afterSemanticModels: string | undefined,
        afterMetrics: string | undefined,
    ): Promise<DbtCloudDefinitionResponse> {
        return this.client.request<DbtCloudDefinitionResponse>(
            dbtCloudDefinitionQuery,
            {
                environmentId: this.environmentId,
                first: PAGE_SIZE,
                afterSemanticModels,
                afterMetrics,
            },
        );
    }

    private async getSemanticLayerDefinitions(): Promise<{
        semanticModels: DbtCloudSemanticModelNode[];
        metrics: DbtCloudMetricNode[];
    }> {
        const semanticModels: DbtCloudSemanticModelNode[] = [];
        const metrics: DbtCloudMetricNode[] = [];
        let afterSemanticModels: string | undefined;
        let afterMetrics: string | undefined;
        let hasNextPage = true;

        while (hasNextPage) {
            // Pages are fetched sequentially on purpose: each request needs
            // the previous page's end cursors.
            // eslint-disable-next-line no-await-in-loop
            const response = await this.getDefinitionPage(
                afterSemanticModels,
                afterMetrics,
            );

            const { definition } = response.environment;
            if (!definition) {
                break;
            }

            semanticModels.push(
                ...definition.semanticModels.edges.map(({ node }) => node),
            );
            metrics.push(...definition.metrics.edges.map(({ node }) => node));

            afterSemanticModels =
                definition.semanticModels.pageInfo.endCursor ?? undefined;
            afterMetrics = definition.metrics.pageInfo.endCursor ?? undefined;
            hasNextPage =
                definition.semanticModels.pageInfo.hasNextPage ||
                definition.metrics.pageInfo.hasNextPage;
        }

        return { semanticModels, metrics };
    }

    /**
     * MetricFlow definitions are optional: environments without a semantic
     * layer (or Discovery API plans without the definition state) must not
     * break the project compile, so failures degrade to an empty result.
     */
    private async getSemanticLayerDefinitionsSafe(): Promise<{
        semanticModels: DbtCloudSemanticModelNode[];
        metrics: DbtCloudMetricNode[];
    }> {
        try {
            return await this.getSemanticLayerDefinitions();
        } catch (e) {
            Logger.warn(
                `Failed to fetch MetricFlow definitions from dbt Cloud for environment ${
                    this.environmentId
                }, continuing without them: ${getErrorMessage(e)}`,
            );
            return { semanticModels: [], metrics: [] };
        }
    }

    async getDbtManifest() {
        try {
            const [results, definitions] = await Promise.all([
                this.getModels(),
                this.getSemanticLayerDefinitionsSafe(),
            ]);
            const { adapterType } = results.environment;
            let fieldQuoteChar = '"';
            if (!adapterType) {
                throw new ParseError(
                    `Warehouse connection not found for environment ${this.environmentId}`,
                );
            }
            if (isSupportedDbtAdapterType(adapterType)) {
                fieldQuoteChar = quoteChars[adapterType];
            } else {
                throw new ParseError(
                    `dbt adapter ${adapterType} is not supported`,
                );
            }

            // Snowflake defaults to uppercase identifiers, but the dbt Cloud
            // Metadata API returns lowercase. Since we wrap identifiers in
            // double quotes (which makes them case-sensitive in Snowflake),
            // we must uppercase them to match the actual object names.
            const normalizeIdentifier =
                adapterType === 'snowflake'
                    ? (id: string) => id.toUpperCase()
                    : (id: string) => id;

            const dbtModelNodes: Record<string, DbtModelNode> =
                Object.fromEntries(
                    results.environment.applied.models.edges.map(({ node }) => {
                        const database = normalizeIdentifier(node.database);
                        const schema = normalizeIdentifier(node.schema);
                        const alias = normalizeIdentifier(
                            node.alias || node.name,
                        );

                        return [
                            node.uniqueId,
                            <DbtModelNode>{
                                checksum: {
                                    name: '',
                                    checksum: '',
                                },
                                columns: Object.values(
                                    node.catalog?.columns || [],
                                ).reduce<DbtModelNode['columns']>(
                                    (acc, column: AnyType) => {
                                        acc[column.name] = {
                                            name: column.name,
                                            description: column.description,
                                            meta: column.meta,
                                            type: column.type,
                                            data_type:
                                                column.type?.toLowerCase(),
                                        };
                                        return acc;
                                    },
                                    {},
                                ),
                                compiled: true,
                                fqn: [],
                                language: node.language,
                                path: node.filePath,
                                resource_type: 'model',
                                unique_id: node.uniqueId,
                                name: node.name,
                                description: node.description,
                                meta: node.meta,
                                tags: node.tags,
                                original_file_path: node.filePath,
                                database,
                                schema,
                                alias,
                                package_name: node.packageName,
                                raw_code: node.rawCode,
                                compiled_code: node.compiledCode,
                                relation_name: `${fieldQuoteChar}${database}${fieldQuoteChar}.${fieldQuoteChar}${schema}${fieldQuoteChar}.${fieldQuoteChar}${alias}${fieldQuoteChar}`,
                                config: node.config,
                            },
                        ];
                    }),
                );
            return <DbtRpcGetManifestResults>{
                manifest: {
                    nodes: dbtModelNodes,
                    metadata: {
                        adapter_type: results.environment.adapterType,
                        generated_at: results.environment.applied.lastUpdatedAt,
                        dbt_schema_version: `/${getLatestSupportedDbtManifestVersion()}.json`,
                    },
                    metrics: mapDbtCloudMetrics(definitions.metrics),
                    docs: {},
                    semantic_models: mapDbtCloudSemanticModels(
                        definitions.semanticModels,
                    ),
                },
            };
        } catch (e) {
            throw DbtMetadataApiClient.parseError(e);
        }
    }

    async test() {
        try {
            const query = gql`
                query TestQuery($environmentId: BigInt!) {
                    environment(id: $environmentId) {
                        dbtProjectName
                    }
                }
            `;
            await this.client.request(query, {
                environmentId: this.environmentId,
            });
        } catch (e) {
            throw DbtMetadataApiClient.parseError(e);
        }
    }
}
