import {
    DbtRpcDocsGenerateResults,
    DbtModelNode,
    Explore,
    ExploreError,
} from 'common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { DbtRpcClientBase } from '../dbt/dbtRpcClientBase';
import { attachTypesToModels, convertExplores } from '../dbt/translator';
import { MissingCatalogEntryError, ParseError } from '../errors';
import modelJsonSchema from '../schema.json';
import { DbtClient, ProjectAdapter, QueryRunner } from '../types';

const ajv = new Ajv();
addFormats(ajv);

export class DbtBaseProjectAdapter implements ProjectAdapter {
    dbtClient: DbtClient;

    queryRunner: QueryRunner;

    catalog: DbtRpcDocsGenerateResults | undefined;

    constructor(dbtClient: DbtClient, queryRunner: QueryRunner) {
        this.dbtClient = dbtClient;
        this.queryRunner = queryRunner;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function,class-methods-use-this
    async destroy(): Promise<void> {}

    public async test(): Promise<void> {
        await this.runQuery("SELECT 'test connection'");
    }

    public async compileAllExplores(
        loadSources: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        // Install dependencies for dbt and fetch the manifest - may raise error meaning no explores compile
        await this.dbtClient.installDeps();
        const { manifest } = await this.dbtClient.getDbtManifest();

        // Type of the target warehouse
        const adapterType = manifest.metadata.adapter_type;

        // Validate models in the manifest - models with invalid metadata will compile to failed Explores
        const models = Object.values(manifest.nodes).filter(
            (node) => node.resource_type === 'model',
        ) as DbtModelNode[];
        const [validModels, failedExplores] =
            await DbtBaseProjectAdapter._validateDbtModelMetadata(models);

        // Be lazy and try to attach types to the remaining models without refreshing the catalog
        try {
            const lazyTypedModels = await attachTypesToModels(
                validModels,
                this.catalog || { nodes: {} },
                true,
            );
            const lazyExplores = await convertExplores(
                lazyTypedModels,
                loadSources,
                adapterType,
            );
            return [...lazyExplores, ...failedExplores];
        } catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                // Some types were missing so refresh the catalog and try again
                const catalog = await this.dbtClient.getDbtCatalog();
                this.catalog = catalog;
                const typedModels = await attachTypesToModels(
                    models,
                    catalog,
                    false,
                );
                const explores = await convertExplores(
                    typedModels,
                    loadSources,
                    adapterType,
                );
                return [...explores, ...failedExplores];
            }
            throw e;
        }
    }

    public async runQuery(sql: string): Promise<Record<string, any>[]> {
        // TODO: remove temporary fix while query runner depends on dbt
        // Installs dependencies on every query
        if (this.queryRunner instanceof DbtRpcClientBase) {
            await this.queryRunner.installDeps();
        }
        return this.queryRunner.runQuery(sql);
    }

    static async _validateDbtModelMetadata(
        models: DbtModelNode[],
    ): Promise<[DbtModelNode[], ExploreError[]]> {
        const validator = ajv.compile(modelJsonSchema);
        return models.reduce(
            ([validModels, invalidModels], model) => {
                const isValid = validator(model);
                if (isValid) {
                    return [[...validModels, model], invalidModels];
                }
                const exploreError: ExploreError = {
                    name: model.name,
                    errors: [
                        {
                            type: 'MetadataParseError',
                            message: (validator.errors || [])
                                .map(
                                    (err) =>
                                        `Field at "${err.instancePath}" ${err.message}`,
                                )
                                .join('\n'),
                        },
                    ],
                };
                return [validModels, [...invalidModels, exploreError]];
            },
            [[] as DbtModelNode[], [] as ExploreError[]],
        );
    }

    static async _unused(models: DbtModelNode[]): Promise<DbtModelNode[]> {
        const validator = ajv.compile(modelJsonSchema);
        const validateModel = (model: DbtModelNode) => {
            const valid = validator(model);
            if (!valid) {
                const lineErrorMessages = (validator.errors || [])
                    .map((err) => `Field at ${err.instancePath} ${err.message}`)
                    .join('\n');
                throw new ParseError(
                    `Cannot parse lightdash metadata from schema.yml for model "${model.name}":\n${lineErrorMessages}`,
                    {
                        schema: modelJsonSchema.$id,
                        errors: validator.errors,
                    },
                );
            }
        };
        models.forEach(validateModel);
        return models;
    }
}
