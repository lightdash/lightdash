import {
    AnyType,
    DbtError,
    DbtModelNode,
    DbtRpcGetManifestResults,
    getLatestSupportedDbtManifestVersion,
    isSupportedDbtAdapterType,
    ParseError,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { gql, GraphQLClient } from 'graphql-request';
import { DbtClient } from '../types';

const quoteChars: Record<SupportedDbtAdapter, string> = {
    bigquery: '`',
    databricks: '`',
    snowflake: `"`,
    redshift: `"`,
    postgres: `"`,
    trino: `"`,
    clickhouse: `"`,
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

    async getDbtManifest() {
        try {
            const results = await this.getModels();
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

            const dbtModelNodes: Record<string, DbtModelNode> =
                Object.fromEntries(
                    results.environment.applied.models.edges.map(({ node }) => [
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
                                        data_type: column.type?.toLowerCase(),
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
                            database: node.database,
                            schema: node.schema,
                            alias: node.alias,
                            package_name: node.packageName,
                            raw_code: node.rawCode,
                            compiled_code: node.compiledCode,
                            relation_name: `${fieldQuoteChar}${
                                node.database
                            }${fieldQuoteChar}.${fieldQuoteChar}${
                                node.schema
                            }${fieldQuoteChar}.${fieldQuoteChar}${
                                node.alias || node.name
                            }${fieldQuoteChar}`,
                            config: node.config,
                        },
                    ]),
                );
            return <DbtRpcGetManifestResults>{
                manifest: {
                    nodes: dbtModelNodes,
                    metadata: {
                        adapter_type: results.environment.adapterType,
                        generated_at: results.environment.applied.lastUpdatedAt,
                        dbt_schema_version: `/${getLatestSupportedDbtManifestVersion()}.json`,
                    },
                    metrics: {},
                    docs: {},
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
