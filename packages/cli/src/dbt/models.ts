import {
    buildModelGraph,
    DbtManifest,
    DbtRawModelNode,
    DimensionType,
    isSupportedDbtAdapter,
    normaliseModelDatabase,
    ParseError,
    patchPathParts,
} from '@lightdash/common';
import { WarehouseClient, WarehouseTableSchema } from '@lightdash/warehouses';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import { searchForModel, YamlSchema } from './schema';

type CompiledModel = {
    name: string;
    schema: string;
    database: string;
    rootPath: string;
    originalFilePath: string;
    patchPath: string | null | undefined;
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
        table: model.name,
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
    return table;
};

type GenerateModelYamlArgs = {
    model: CompiledModel;
    table: WarehouseTableSchema;
};
const generateModelYml = ({ model, table }: GenerateModelYamlArgs) => ({
    name: model.name,
    columns: Object.entries(table).map(([columnName, dimensionType]) => ({
        name: columnName,
        description: '',
        meta: {
            dimension: {
                type: dimensionType,
            },
        },
    })),
});

type Doc = {
    unique_id: string;
    name: string;
    block_contents: string;
};

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

const askOverwriteDescription = async (
    columnName: string,
    existingDescription: string | undefined,
    newDescription: string | undefined,
    spinner: ora.Ora,
): Promise<string> => {
    if (!existingDescription) return newDescription || '';
    if (!newDescription) return existingDescription;
    if (newDescription === existingDescription) return existingDescription;

    const shortDescription = `${existingDescription.substring(0, 20)}${
        existingDescription.length > 20 ? '...' : ''
    }`;
    const overwriteMessage = `Do you want to overwrite the existing column "${columnName}" description (${shortDescription}) with a doc block?`;
    spinner.stop();
    const overwrite = await askOverwrite(overwriteMessage);
    spinner.start();
    if (overwrite) return newDescription;
    return existingDescription;
};

type FindAndUpdateModelYamlArgs = {
    model: CompiledModel;
    table: WarehouseTableSchema;
    docs: Record<string, Doc>;
    spinner: ora.Ora;
};
export const findAndUpdateModelYaml = async ({
    model,
    table,
    docs,
    spinner,
}: FindAndUpdateModelYamlArgs): Promise<{
    updatedYml: YamlSchema;
    outputFilePath: string;
}> => {
    const generatedModel = generateModelYml({ model, table });
    const filenames = [];
    const { patchPath } = model;
    if (patchPath) {
        const { path: expectedYamlSubPath } = patchPathParts(patchPath);
        const expectedYamlPath = path.join(model.rootPath, expectedYamlSubPath);
        filenames.push(expectedYamlPath);
    }
    const defaultYmlPath = path.join(
        path.dirname(path.join(model.rootPath, model.originalFilePath)),
        `${model.name}.yml`,
    );
    filenames.push(defaultYmlPath);
    const match = await searchForModel({
        modelName: model.name,
        filenames,
    });
    if (match) {
        const existingModel = match.doc.models[match.modelIndex];
        const existingColumns = existingModel.columns || [];
        const existingColumnsUpdatedPromise = existingColumns?.map(
            async (column) => {
                const hasDoc = Object.values(docs).find(
                    (doc) => doc.name === column.name,
                );
                const newDescription = hasDoc
                    ? `{{doc("${column.name}")}}`
                    : '';
                const existingDescription = column.description;
                const existingDimensionType = column.meta?.dimension?.type;
                const dimensionType = existingDimensionType || (table[column.name] as DimensionType | undefined);

                return {
                    ...column,
                    name: column.name,
                    description: await askOverwriteDescription(
                        column.name,
                        existingDescription,
                        newDescription,
                        spinner,
                    ),
                    meta: {
                        ...(column.meta || {}),
                        dimension: {
                            ...(column.meta?.dimension || {}),
                            ...(dimensionType ? { type: dimensionType } : {}),
                        },
                    },
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
        const updatedModel = {
            ...existingModel,
            columns: [...existingColumnsUpdated, ...newColumns],
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

const selectorRe =
    /^(?<childrens_parents>(@))?(?<parents>((?<parents_depth>(\d*))\+))?((?<method>([\w.]+)):)?(?<value>(.*?))(?<children>(\+(?<children_depth>(\d*))))?$/;

const parseSelector = (selector: string) => {
    const match = selector.match(selectorRe);
    if (!match) {
        throw new ParseError(`Invalid selector: ${selector}`);
    }
    const method = match.groups?.method;
    const value = match.groups?.value;
    const includeParents = !!match.groups?.parents;
    const includeChildren = !!match.groups?.children;
    return {
        method,
        value,
        includeParents,
        includeChildren,
    };
};

const getModelsFromManifest = (manifest: DbtManifest): DbtRawModelNode[] =>
    Object.values(manifest.nodes).filter(
        (node) =>
            node.resource_type === 'model' &&
            node.config?.materialized !== 'ephemeral',
    ) as DbtRawModelNode[];

type MethodSelectorArgs = {
    method: string;
    value: string | undefined | null;
    models: DbtRawModelNode[];
};
const methodSelector = ({
    method,
    value,
    models,
}: MethodSelectorArgs): string[] => {
    if (method !== 'tag') {
        throw new ParseError(
            `Selector method "${method}" not supported. Only "tag" is supported.`,
        );
    }
    if (!value) {
        throw new ParseError(`Invalid value for tag selector "${value}"`);
    }
    return models
        .filter((model) => model.tags.includes(value))
        .map((model) => model.unique_id);
};

type ModelNameSelectorArgs = {
    projectName: string;
    value: string | undefined | null;
    includeParents: boolean;
    includeChildren: boolean;
    models: DbtRawModelNode[];
    modelGraph: ReturnType<typeof buildModelGraph>;
};
const modelNameSelector = ({
    projectName,
    value,
    includeParents,
    includeChildren,
    models,
    modelGraph,
}: ModelNameSelectorArgs): string[] => {
    if (!value) {
        throw new ParseError(`Invalid model name given`);
    }
    const modelName = path.parse(value).name;
    const nodeId = `model.${projectName}.${modelName}`;
    const node = models.find((model) => model.unique_id === nodeId);
    if (!node) {
        throw new ParseError(
            `Could not find model with name "${modelName}" in project "${projectName}"`,
        );
    }
    let selectedNodes: string[] = [];
    if (includeParents) {
        const parents = modelGraph.dependenciesOf(nodeId);
        selectedNodes = [...selectedNodes, ...parents];
    }
    selectedNodes = [...selectedNodes, nodeId];
    if (includeChildren) {
        const children = modelGraph.dependantsOf(nodeId);
        selectedNodes = [...selectedNodes, ...children];
    }
    return selectedNodes;
};

type SelectModelsArgs = {
    selector: string;
    projectName: string;
    models: DbtRawModelNode[];
    modelGraph: ReturnType<typeof buildModelGraph>;
};
const selectModels = ({
    selector,
    projectName,
    models,
    modelGraph,
}: SelectModelsArgs) => {
    const parsedSelector = parseSelector(selector);
    const { method } = parsedSelector;
    if (method) {
        return methodSelector({ method, value: parsedSelector.value, models });
    }
    return modelNameSelector({
        ...parsedSelector,
        projectName,
        models,
        modelGraph,
    });
};

type GetCompiledModelsFromManifestArgs = {
    projectName: string;
    selectors: string[] | undefined;
    manifest: DbtManifest;
};
export const getCompiledModelsFromManifest = ({
    projectName,
    selectors,
    manifest,
}: GetCompiledModelsFromManifestArgs): CompiledModel[] => {
    const models = getModelsFromManifest(manifest);
    const modelGraph = buildModelGraph(models);
    if (!isSupportedDbtAdapter(manifest.metadata)) {
        throw new ParseError(
            `dbt adapter not supported. Lightdash does not support adapter ${manifest.metadata.adapter_type}`,
            {},
        );
    }
    const adapterType = manifest.metadata.adapter_type;
    let nodeIds: string[] = [];
    if (selectors === undefined) {
        nodeIds = models.map((model) => model.unique_id);
    } else {
        nodeIds = Array.from(
            new Set(
                selectors.flatMap((selector) =>
                    selectModels({ selector, projectName, models, modelGraph }),
                ),
            ),
        );
    }
    const modelLookup = models.reduce<{ [nodeId: string]: DbtRawModelNode }>(
        (acc, model) => {
            acc[model.unique_id] = model;
            return acc;
        },
        {},
    );
    return nodeIds.map((nodeId) => ({
        name: modelLookup[nodeId].name,
        schema: modelLookup[nodeId].schema,
        database: normaliseModelDatabase(modelLookup[nodeId], adapterType)
            .database,
        rootPath: modelLookup[nodeId].root_path,
        originalFilePath: modelLookup[nodeId].original_file_path,
        patchPath: modelLookup[nodeId].patch_path,
    }));
};
