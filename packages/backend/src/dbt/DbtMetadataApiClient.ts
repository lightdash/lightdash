import {
    DbtModelNode,
    DbtNode,
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
    athena: `"`,
};

export class DbtMetadataApiClient implements DbtClient {
    private readonly domain: string =
        'https://metadata.cloud.getdbt.com/graphql';

    private readonly bearerToken: string;

    private readonly environmentId: string | number;

    private readonly endpoint: URL;

    private readonly client: GraphQLClient;

    constructor(environmentId: string | number, bearerToken: string) {
        this.environmentId = environmentId;
        this.bearerToken = bearerToken;
        this.endpoint = new URL('/graphql', this.domain);
        this.client = new GraphQLClient(this.endpoint.href, {
            headers: {
                Authorization: `Bearer ${this.bearerToken}`,
                'X-dbt-partner-source': 'lightdash',
            },
        });
    }

    async getDbtManifest() {
        const query = gql`
            query ManifestQuery($environmentId: BigInt!) {
                environment(id: $environmentId) {
                    adapterType
                    applied {
                        models(first: 500) {
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
        const results = await this.client.request(query, {
            environmentId: this.environmentId,
            first: 500,
        });

        const { adapterType } = results.environment;
        let fieldQuoteChar = '"';
        if (isSupportedDbtAdapterType(adapterType)) {
            fieldQuoteChar = quoteChars[adapterType];
        } else {
            throw new ParseError(`dbt adapter ${adapterType} is not supported`);
        }

        const dbtModelNodes: Record<string, DbtNode> = Object.fromEntries(
            results.environment.applied.models.edges.map(({ node }: any) => [
                node.uniqueId,
                <DbtModelNode>{
                    checksum: {
                        name: '',
                        checksum: '',
                    },
                    columns: Object.values(node.catalog?.columns || []).reduce<
                        DbtModelNode['columns']
                    >((acc, column: any) => {
                        acc[column.name] = {
                            name: column.name,
                            description: column.description,
                            meta: column.meta,
                            type: column.type,
                            data_type: column.type?.toLowerCase(),
                        };
                        return acc;
                    }, {}),
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
        return {
            manifest: {
                nodes: dbtModelNodes,
                metadata: {
                    adapter_type: results.environment.adapterType,
                    generated_at: results.environment.applied.lastUpdatedAt,
                    dbt_schema_version: 'graphql-v2',
                },
                metrics: {},
                docs: {},
            },
        };
    }

    async test() {
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
    }
}
