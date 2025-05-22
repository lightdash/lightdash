import {
    DbtDoc,
    DbtModelNode,
    DbtSchemaEditor,
    DimensionType,
    ParseError,
    patchPathParts,
} from '@lightdash/common';
import { WarehouseClient, WarehouseTableSchema } from '@lightdash/warehouses';
import execa from 'execa';
import inquirer from 'inquirer';
import * as path from 'path';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { searchForModel } from './schema';

type CompiledModel = {
    name: string;
    schema: string;
    database: string;
    originalFilePath: string;
    patchPath: string | null | undefined;
    packageName: string;
    alias?: string;
};

type GetDatabaseTableForModelArgs = {
    model: CompiledModel;
    warehouseClient: WarehouseClient;
    preserveColumnCase: boolean;
};
export const getWarehouseTableForModel = async ({
    model,
    warehouseClient,
    preserveColumnCase,
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
            const columnName = preserveColumnCase ? key : key.toLowerCase();
            accumulator[columnName] = value;
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
    assumeYes: boolean,
): Promise<string> => {
    if (!existingDescription) return newDescription || '';
    if (!newDescription) return existingDescription;
    if (
        newDescription === existingDescription ||
        isDocBlock(existingDescription)
    )
        return existingDescription;

    if (assumeYes) return newDescription;

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
    projectName: string;
    assumeYes: boolean;
};
export const findAndUpdateModelYaml = async ({
    model,
    table,
    docs,
    includeMeta,
    projectDir,
    projectName,
    assumeYes,
}: FindAndUpdateModelYamlArgs): Promise<{
    updatedYml: DbtSchemaEditor;
    outputFilePath: string;
}> => {
    const generatedModel = generateModelYml({
        model,
        table,
        includeMeta,
    });
    const filenames = [];
    const { patchPath, packageName } = model;
    if (patchPath) {
        const { project: expectedYamlProject, path: expectedYamlSubPath } =
            patchPathParts(patchPath);
        const projectSubpath =
            expectedYamlProject !== projectName
                ? path.join('dbt_packages', expectedYamlProject)
                : '.';
        const expectedYamlPath = path.join(
            projectDir,
            projectSubpath,
            expectedYamlSubPath,
        );
        filenames.push(expectedYamlPath);
    }
    const outputDir = path.dirname(
        path.join(
            packageName === projectName
                ? '.'
                : path.join('dbt_packages', packageName),
            model.originalFilePath,
        ),
    );
    const outputFilePath = path.join(
        projectDir,
        outputDir,
        `${model.name}.yml`,
    );

    filenames.push(outputFilePath);

    const match = await searchForModel({
        modelName: model.name,
        filenames,
    });
    if (match) {
        const { schemaEditor } = match;
        const docsNames = Object.values(docs).map((doc) => doc.name);
        const existingColumns = schemaEditor.getModelColumns(model.name) ?? [];
        const existingColumnNames = existingColumns.map((c) => c.name);

        // Update existing columns description and dimension type
        for (const column of existingColumns) {
            const hasDoc = docsNames.includes(column.name);
            const newDescription = hasDoc ? `{{doc('${column.name}')}}` : '';
            const existingDescription = column.description;
            const existingDimensionType = column.meta?.dimension?.type;
            const dimensionType = table[column.name] as
                | DimensionType
                | undefined;

            // eslint-disable-next-line no-await-in-loop
            const description = await askOverwriteDescription(
                column.name,
                existingDescription,
                newDescription,
                assumeYes,
            );

            // Update meta if dimension type is different
            const meta =
                includeMeta &&
                dimensionType &&
                existingDimensionType !== dimensionType
                    ? {
                          dimension: {
                              type: dimensionType,
                          },
                      }
                    : undefined;

            schemaEditor.updateColumn({
                modelName: model.name,
                columnName: column.name,
                properties: {
                    description,
                    meta,
                },
            });
        }

        // Add columns that don't exist in the model
        const newColumns = generatedModel.columns.filter(
            (c) => !existingColumnNames.includes(c.name),
        );
        newColumns.forEach((column) => {
            schemaEditor.addColumn(model.name, column);
        });

        // Delete columns that no longer exist in the warehouse
        const deletedColumnNames = existingColumnNames.filter(
            (c) => !generatedModel.columns.map((gc) => gc.name).includes(c),
        );
        if (deletedColumnNames.length > 0 && process.env.CI !== 'true') {
            let answers = { isConfirm: assumeYes };

            if (!assumeYes) {
                const spinner = GlobalState.getActiveSpinner();
                spinner?.stop();
                console.error(`
    These columns in your model ${styles.bold(
        model.name,
    )} on file ${styles.bold(
                    match.filename.split('/').slice(-1),
                )} no longer exist in your warehouse:
    ${deletedColumnNames.map((name) => `- ${styles.bold(name)} \n`).join('')}
                `);

                answers = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'isConfirm',
                        message: `Would you like to remove them from your .yml file? `,
                    },
                ]);
                spinner?.start();
            }

            if (answers.isConfirm) {
                schemaEditor.removeColumns(model.name, deletedColumnNames);
            }
        }

        return {
            updatedYml: schemaEditor,
            outputFilePath: match.filename,
        };
    }

    return {
        updatedYml: new DbtSchemaEditor().addModel(generatedModel),
        outputFilePath,
    };
};

export const getCompiledModels = async (
    models: DbtModelNode[],
    args: {
        select: string[] | undefined;
        exclude: string[] | undefined;
        projectDir: string | undefined;
        profilesDir: string | undefined;
        target: string | undefined;
        profile: string | undefined;
        vars: string | undefined;
    },
): Promise<CompiledModel[]> => {
    let allModelIds = models.map((model) => model.unique_id);

    if (args.select || args.exclude) {
        const spinner = GlobalState.startSpinner(`Filtering models`);
        try {
            const { stdout } = await execa('dbt', [
                'ls',
                ...(args.projectDir ? ['--project-dir', args.projectDir] : []),
                ...(args.profilesDir
                    ? ['--profiles-dir', args.profilesDir]
                    : []),
                ...(args.target ? ['--target', args.target] : []),
                ...(args.profile ? ['--profile', args.profile] : []),
                ...(args.select ? ['--select', args.select.join(' ')] : []),
                ...(args.exclude ? ['--exclude', args.exclude.join(' ')] : []),
                ...(args.vars ? ['--vars', args.vars] : []),
                '--resource-type=model',
                '--output=json',
            ]);
            const filteredModelIds = stdout
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .map((l) => {
                    try {
                        // remove prefixed time in dbt cloud cli output
                        const lineWithoutPrefixedTime = l.replace(
                            /^\d{2}:\d{2}:\d{2}\s*/,
                            '',
                        );
                        return JSON.parse(lineWithoutPrefixedTime);
                    } catch {
                        return null;
                    }
                })
                .filter(
                    (l): l is { resource_type: string; unique_id: string } =>
                        l !== null,
                )
                .filter((model) => model.resource_type === 'model')
                .map((model) => model.unique_id);

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
        packageName: modelLookup[modelId].package_name,
    }));
};
