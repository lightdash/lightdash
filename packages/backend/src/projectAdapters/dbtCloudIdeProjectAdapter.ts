import {
    convertExplores,
    DbtModelNode,
    Explore,
    ExploreError,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';
import { CachedWarehouse, ProjectAdapter } from '../types';

export class DbtCloudMetadataApi {
    // TODO: this will have to be dynamic
    private readonly domain: string =
        'https://metadata.cloud.getdbt.com/graphql';

    private readonly bearerToken: string;

    private readonly environmentId: string | number;

    constructor(environmentId: string | number, apiKey: string) {
        this.environmentId = environmentId;
        this.bearerToken = apiKey;
    }

    async getNodes(): Promise<any> {
        const endpoint = new URL('/graphql', this.domain);
        const client = new GraphQLClient(endpoint.href, {
            headers: {
                Authorization: `Bearer ${this.bearerToken}`,
                'X-dbt-partner-source': 'lightdash',
            },
        });
        const query = `query ExampleQuery($environmentId: BigInt!) {
  environment(id: $environmentId) {
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
                name, 
                description, 
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
        return client.request(query, {
            environmentId: this.environmentId,
            first: 500, // this is the maximum number of models we can fetch on each request. If we need more, we need to pass a cursor
        });
    }
}

type DbtCloudideProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    accountId: string | number;
    environmentId: string | number;
    projectId: string | number;
    apiKey: string;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
};

export class DbtCloudIdeProjectAdapter implements ProjectAdapter {
    private readonly metadataApiClient: DbtCloudMetadataApi;

    private readonly warehouseClient: WarehouseClient;

    constructor({
        warehouseClient,
        environmentId,
        apiKey,
    }: DbtCloudideProjectAdapterArgs) {
        this.warehouseClient = warehouseClient;
        this.metadataApiClient = new DbtCloudMetadataApi(environmentId, apiKey);
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtPackages() {
        return undefined;
    }

    // eslint-disable-next-line class-methods-use-this
    async test() {
        return undefined;
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy() {
        return undefined;
    }

    public async compileAllExplores(
        loadSources: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        const nodes = await this.metadataApiClient.getNodes();
        const adapterType = this.warehouseClient.getAdapterType();

        // convert graphql results to DbtModelNode as if we fetch them from the manifest;
        const dbtModelNode: DbtModelNode[] =
            nodes.environment.applied.models.edges.map(({ node }: any) => {
                const rawModelNode: DbtModelNode = {
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
                    resource_type: node.resourceType,
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
                    relation_name: `${this.warehouseClient.getFieldQuoteChar()}${
                        node.database
                    }${this.warehouseClient.getFieldQuoteChar()}.${this.warehouseClient.getFieldQuoteChar()}${
                        node.schema
                    }${this.warehouseClient.getFieldQuoteChar()}.${this.warehouseClient.getFieldQuoteChar()}${
                        node.name
                    }${this.warehouseClient.getFieldQuoteChar()}`,
                };
                return rawModelNode;
            });

        const explores = await convertExplores(
            dbtModelNode,
            loadSources,
            adapterType,
            [],
            this.warehouseClient,
        );

        return explores;
    }
}
