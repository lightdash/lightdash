import {
    buildModelGraph,
    DbtManifest,
    DbtRawModelNode,
    isSupportedDbtAdapter,
    normaliseModelDatabase,
    ParseError,
    patchPathParts,
} from '@lightdash/common';
import { WarehouseClient, WarehouseTableSchema } from '@lightdash/warehouses';
import * as path from 'path';
import { loadYamlSchema, YamlSchema } from './schema';

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

type UpdatedModelYmlFileArgs = {
    model: CompiledModel;
    table: WarehouseTableSchema;
};
export const updateModelYmlFile = async ({
    model,
    table,
}: UpdatedModelYmlFileArgs): Promise<{
    updatedYml: YamlSchema;
    outputFilePath: string;
}> => {
    const generatedModel = {
        name: model.name,
        columns: Object.entries(table).map(([columnName]) => ({
            name: columnName,
            description: '',
        })),
    };
    if (model.patchPath) {
        const { path: yamlSubpath } = patchPathParts(model.patchPath);
        const outputFilePath = path.join(model.rootPath, yamlSubpath);
        const existingYml = await loadYamlSchema(outputFilePath);
        const models = existingYml.models || [];
        const existingModelIndex = models.findIndex(
            (m) => m.name === model.name,
        );
        if (existingModelIndex === -1) {
            throw new ParseError(
                `Expected to find model ${model.name} in ${outputFilePath} but couldn't find it`,
            );
        }
        const existingModel = models[existingModelIndex];
        const existingColumns = existingModel.columns || [];
        const existingColumnNames = existingColumns.map((c) => c.name);
        const newColumns = generatedModel.columns.filter(
            (c) => !existingColumnNames.includes(c.name),
        );
        const updatedModel = {
            ...existingModel,
            columns: [...existingColumns, ...newColumns],
        };
        const updatedYml: YamlSchema = {
            ...existingYml,
            models: [
                ...models.slice(0, existingModelIndex),
                updatedModel,
                ...models.slice(existingModelIndex + 1),
            ],
        };
        return {
            updatedYml,
            outputFilePath,
        };
    }
    const outputDir = path.dirname(
        path.join(model.rootPath, model.originalFilePath),
    );
    const outputFilePath = path.join(outputDir, `${model.name}.yml`);
    const updatedYml = {
        version: 2 as const,
        models: [generatedModel],
    };
    return {
        updatedYml,
        outputFilePath,
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
        (node) => node.resource_type === 'model',
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
