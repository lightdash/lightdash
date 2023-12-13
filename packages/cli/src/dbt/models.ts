import {
    DbtDoc,
    DbtManifest,
    DbtModelNode,
    DbtRawModelNode,
    DimensionType,
    isSupportedDbtAdapter,
    normaliseModelDatabase,
    ParseError,
    patchPathParts,
} from '@lightdash/common';
import { WarehouseClient, WarehouseTableSchema } from '@lightdash/warehouses';
import execa from 'execa';
import inquirer from 'inquirer';
import * as path from 'path';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { searchForModel, YamlSchema } from './schema';

type CompiledModel = {
    name: string;
    schema: string;
    database: string;
    originalFilePath: string;
    patchPath: string | null | undefined;
    alias?: string;
};

type GetDatabaseTableForModelArgs = {
    model: CompiledModel;
    warehouseClient: WarehouseClient;
};
export const getWarehouseTableForModel = async ({
    model,
    warehouseClient,
}: GetDatabaseTableForModelArgs): Promise<WarehouseTableSchema> => {
    const tableRef = {
        database: model.database,
        schema: model.schema,
        table: model.alias || model.name,
    };
    const catalog = await warehouseClient.getCatalog([tableRef]);

    const table =
        catalog[tableRef.database]?.[tableRef.schema]?.[tableRef.table];
    if (!table) {
        const database = catalog[tableRef.database];
        const schema = database?.[tableRef.schema];
        const missing =
            (database === undefined && `database ${tableRef.database}`) ||
            (schema === undefined && `schema ${tableRef.schema}`) ||
            (table === undefined && `table ${tableRef.table}`);
        throw new ParseError(
            `Expected to find materialised model at ${tableRef.database}.${tableRef.schema}.${tableRef.table} but couldn't find (or cannot access) ${missing}`,
        );
    }
    return Object.entries(table).reduce<WarehouseTableSchema>(
        (accumulator, [key, value]) => {
            accumulator[key.toLowerCase()] = value;
            return accumulator;
        },
        {},
    );
};

type GenerateModelYamlArgs = {
    model: CompiledModel;
    table: WarehouseTableSchema;
    includeMeta: boolean;
};
const generateModelYml = ({
    model,
    table,
    includeMeta,
}: GenerateModelYamlArgs) => ({
    name: model.name,
    columns: Object.entries(table).map(([columnName, dimensionType]) => ({
        name: columnName,
        description: '',
        ...(includeMeta
            ? {
                  meta: {
                      dimension: {
                          type: dimensionType,
                      },
                  },
              }
            : {}),
    })),
});

const askOverwrite = async (message: string): Promise<boolean> => {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'isConfirm',
            message,
        },
    ]);
    if (!answers.isConfirm) {
        return false;
    }
    return true;
};

export const isDocBlock = (text: string | undefined = ''): boolean =>
    !!text.match(/{{\s*doc\(['"]\w+['"]\)\s*}}/);

const askOverwriteDescription = async (
    columnName: string,
    existingDescription: string | undefined,
    newDescription: string | undefined,
): Promise<string> => {
    if (!existingDescription) return newDescription || '';
    if (!newDescription) return existingDescription;
    if (
        newDescription === existingDescription ||
        isDocBlock(existingDescription)
    )
        return existingDescription;

    const shortDescription = `${existingDescription.substring(0, 20)}${
        existingDescription.length > 20 ? '...' : ''
    }`;
    const overwriteMessage = `Do you want to overwrite the existing column "${columnName}" description (${shortDescription}) with a doc block?`;
    const spinner = GlobalState.getActiveSpinner();
    spinner?.stop();
    const overwrite = await askOverwrite(overwriteMessage);
    spinner?.start();
    if (overwrite) return newDescription;
    return existingDescription;
};

type FindAndUpdateModelYamlArgs = {
    model: CompiledModel;
    table: WarehouseTableSchema;
    docs: Record<string, DbtDoc>;
    includeMeta: boolean;
    projectDir: string;
};
export const findAndUpdateModelYaml = async ({
    model,
    table,
    docs,
    includeMeta,
    projectDir,
}: FindAndUpdateModelYamlArgs): Promise<{
    updatedYml: YamlSchema;
    outputFilePath: string;
}> => {
    const generatedModel = generateModelYml({
        model,
        table,
        includeMeta,
    });
    const filenames = [];
    const { patchPath } = model;
    if (patchPath) {
        const { path: expectedYamlSubPath } = patchPathParts(patchPath);
        const expectedYamlPath = path.join(projectDir, expectedYamlSubPath);
        filenames.push(expectedYamlPath);
    }
    const defaultYmlPath = path.join(
        path.dirname(path.join(projectDir, model.originalFilePath)),
        `${model.name}.yml`,
    );
    filenames.push(defaultYmlPath);
    const match = await searchForModel({
        modelName: model.name,
        filenames,
    });
    if (match) {
        const docsNames = Object.values(docs).map((doc) => doc.name);
        const existingModel = match.doc.models[match.modelIndex];
        const existingColumns = existingModel.columns || [];
        const existingColumnsUpdatedPromise = existingColumns?.map(
            async (column) => {
                const hasDoc = docsNames.includes(column.name);
                const newDescription = hasDoc
                    ? `{{doc('${column.name}')}}`
                    : '';
                const existingDescription = column.description;
                const existingDimensionType = column.meta?.dimension?.type;
                const dimensionType =
                    existingDimensionType ||
                    (table[column.name] as DimensionType | undefined);
                let { meta } = column;
                if (includeMeta && dimensionType) {
                    meta = {
                        ...(meta || {}),
                        dimension: {
                            ...(meta?.dimension || {}),
                            type: dimensionType,
                        },
                    };
                }
                return {
                    ...column,
                    name: column.name,
                    description: await askOverwriteDescription(
                        column.name,
                        existingDescription,
                        newDescription,
                    ),
                    ...(meta !== undefined ? { meta } : {}),
                };
            },
        );
        const existingColumnsUpdated = await Promise.all(
            existingColumnsUpdatedPromise,
        );
        const existingColumnNames = existingColumns.map((c) => c.name);
        const newColumns = generatedModel.columns.filter(
            (c) => !existingColumnNames.includes(c.name),
        );
        const deletedColumnNames = existingColumnNames.filter(
            (c) => !generatedModel.columns.map((gc) => gc.name).includes(c),
        );
        let updatedColumns = [...existingColumnsUpdated, ...newColumns];
        if (deletedColumnNames.length > 0 && process.env.CI !== 'true') {
            const spinner = GlobalState.getActiveSpinner();
            spinner?.stop();
            console.error(`
These columns in your model ${styles.bold(model.name)} on file ${styles.bold(
                match.filename.split('/').slice(-1),
            )} no longer exist in your warehouse:
${deletedColumnNames.map((name) => `- ${styles.bold(name)} \n`).join('')}
            `);
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `Would you like to remove them from your .yml file? `,
                },
            ]);
            spinner?.start();

            if (answers.isConfirm) {
                updatedColumns = updatedColumns.filter(
                    (column) => !deletedColumnNames.includes(column.name),
                );
            }
        }
        const updatedModel = {
            ...existingModel,
            columns: updatedColumns,
        };
        const updatedYml: YamlSchema = {
            ...match.doc,
            models: [
                ...match.doc.models.slice(0, match.modelIndex),
                updatedModel,
                ...match.doc.models.slice(match.modelIndex + 1),
            ],
        };
        return {
            updatedYml,
            outputFilePath: match.filename,
        };
    }
    const updatedYml = {
        version: 2 as const,
        models: [generatedModel],
    };
    return {
        updatedYml,
        outputFilePath: defaultYmlPath,
    };
};

export const getModelsFromManifest = (
    manifest: DbtManifest,
): DbtModelNode[] => {
    const models = Object.values(manifest.nodes).filter(
        (node) =>
            node.resource_type === 'model' &&
            node.config?.materialized !== 'ephemeral',
    ) as DbtRawModelNode[];

    if (!isSupportedDbtAdapter(manifest.metadata)) {
        throw new ParseError(
            `dbt adapter not supported. Lightdash does not support adapter ${manifest.metadata.adapter_type}`,
            {},
        );
    }
    const adapterType = manifest.metadata.adapter_type;
    return models
        .filter(
            (model) =>
                model.config?.materialized &&
                model.config.materialized !== 'ephemeral',
        )
        .map((model) => normaliseModelDatabase(model, adapterType));
};

export const getCompiledModels = async (
    models: DbtModelNode[],
    args: {
        select: string[] | undefined;
        exclude: string[] | undefined;
        projectDir: string;
        profilesDir: string;
        target: string | undefined;
        profile: string | undefined;
    },
): Promise<CompiledModel[]> => {
    let allModelIds = models.map((model) => model.unique_id);

    if (args.select || args.exclude) {
        const spinner = GlobalState.startSpinner(`Filtering models`);
        try {
            const { stdout } = await execa('dbt', [
                'ls',
                '--profiles-dir',
                args.profilesDir,
                '--project-dir',
                args.projectDir,
                ...(args.target ? ['--target', args.target] : []),
                ...(args.profile ? ['--profile', args.profile] : []),
                ...(args.select ? ['--select', args.select.join(' ')] : []),
                ...(args.exclude ? ['--exclude', args.exclude.join(' ')] : []),
                '--resource-type=model',
                '--output=json',
            ]);

            const filteredModelIds = stdout
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .map((l) => {
                    try {
                        return JSON.parse(l);
                    } catch (e) {
                        return null;
                    }
                })
                .filter(
                    (l): l is { resource_type: string; unique_id: string } =>
                        l !== null,
                )
                .filter((model: any) => model.resource_type === 'model')
                .map((model: any) => model.unique_id);

            allModelIds = allModelIds.filter((modelId) =>
                filteredModelIds.includes(modelId),
            );
        } catch (e) {
            console.error(styles.error(`Failed to filter models: ${e}`));
            throw e;
        } finally {
            spinner.stop();
        }
    }

    const modelLookup = models.reduce<Record<string, DbtModelNode>>(
        (acc, model) => ({ ...acc, [model.unique_id]: model }),
        {},
    );

    return allModelIds.map((modelId) => ({
        name: modelLookup[modelId].name,
        schema: modelLookup[modelId].schema,
        database: modelLookup[modelId].database,
        originalFilePath: modelLookup[modelId].original_file_path,
        patchPath: modelLookup[modelId].patch_path,
        alias: modelLookup[modelId].alias,
    }));
};
