import { DbtRpcDocsGenerateResults, DbtModelNode, Explore } from 'common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { DbtRpcClientBase } from '../dbt/dbtRpcClientBase';
import { attachTypesToModels, convertExplores } from '../dbt/translator';
import { MissingCatalogEntryError, ParseError } from '../errors';
import modelJsonSchema from '../schema.json';
import { ProjectAdapter } from '../types';

const ajv = new Ajv();
addFormats(ajv);

export abstract class DbtBaseProjectAdapter implements ProjectAdapter {
    abstract rpcClient: DbtRpcClientBase;

    catalog: DbtRpcDocsGenerateResults | undefined;

    public async compileAllExplores(
        loadSources: boolean = false,
    ): Promise<Explore[]> {
        // Install dependencies for dbt and fetch the manifest
        await this.rpcClient.installDeps();
        const { manifest } = await this.rpcClient.getDbtManifest();

        // Validate models in the manifest - may throw ParseError
        const models = await DbtBaseProjectAdapter._validateDbtModels(
            Object.values(manifest.nodes).filter(
                (node) => node.resource_type === 'model',
            ) as DbtModelNode[],
        );

        const adapterType = manifest.metadata.adapter_type;

        // Be lazy and try to type the models without refreshing the catalog
        try {
            const lazyTypedModels = await attachTypesToModels(
                models,
                this.catalog || { nodes: {} },
            );
            const lazyExplores = await convertExplores(
                lazyTypedModels,
                loadSources,
                manifest.metadata.adapter_type,
            );
            return lazyExplores;
        } catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                // Some types were missing so refresh the catalog and try again
                const catalog = await this.rpcClient.getDbtCatalog();
                this.catalog = catalog;
                const typedModels = await attachTypesToModels(models, catalog);
                const explores = await convertExplores(
                    typedModels,
                    loadSources,
                    manifest.metadata.adapter_type,
                );
                return explores;
            }
            throw e;
        }
    }

    public async runQuery(sql: string): Promise<Record<string, any>[]> {
        return this.rpcClient.runQuery(sql);
    }

    static async _validateDbtModels(
        models: DbtModelNode[],
    ): Promise<DbtModelNode[]> {
        const validator = ajv.compile(modelJsonSchema);
        const validateModel = (model: DbtModelNode) => {
            const valid = validator(model);
            if (!valid) {
                const lineErrorMessages = (validator.errors || [])
                    .map((err) => `Field at ${err.instancePath} ${err.message}`)
                    .join('\n');
                throw new ParseError(
                    `Cannot parse lightdash metadata from schema.yml for '${model.name}' model:\n${lineErrorMessages}`,
                    {
                        schema: modelJsonSchema.$id,
                        errors: validator.errors,
                    },
                );
            }
        };
        models.forEach(validateModel);

        // Foreign key checks
        // TODO: this belongs in the compiler
        const validModelNames = new Set(models.map((model) => model.name));
        const validateForeignKeys = (model: DbtModelNode) => {
            const joins = model.meta?.joins?.map((j) => j.join) || [];
            joins.forEach((join) => {
                if (!validModelNames.has(join))
                    throw new ParseError(
                        `Cannot parse lightdash metadata from schema.yml for '${model.name}' model:\n  Contains a join reference to another dbt model '${join}' which couldn't be found in the current dbt project.`,
                        {},
                    );
            });
        };
        models.forEach(validateForeignKeys);
        return models;
    }
}
