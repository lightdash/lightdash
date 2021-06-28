import {
    Dimension,
    DimensionType,
    Explore,
    LineageGraph, LineageNodeDependency,
    mapColumnTypeToLightdashType,
    Metric,
    MetricType, Source,
    Table,
} from "common";
import modelJsonSchema from '../schema.json'
import {MissingCatalogEntryError, ParseError} from "../errors"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import {postDbtAsyncRpc} from "./rpcClient";
import { DepGraph } from "dependency-graph"
import {compileExplore} from "../exploreCompiler";
import { parseWithPointers, getLocationForJsonPath } from "@stoplight/yaml";
import fs from 'fs';

// Config validator
const ajv = new Ajv()
addFormats(ajv)

// DBT CONFIG
type DbtNode = {
    unique_id: string
    resource_type: string,
}
type DbtModelNode = DbtNode & {
    columns: { [name: string]: DbtModelColumn },
    meta: DbtModelMetadata,
    database: string,
    schema: string,
    name: string,
    relation_name: string,
    depends_on: DbtTableDependency,
    description?: string,
    root_path: string,
    patch_path: string,
}
type DbtTableDependency = {
    nodes: string[]
}
type DbtModelColumn = {
    name: string,
    description?: string,
    meta: DbtColumnMetadata,
    data_type?: string,
}


// CUSTOM LIGHTDASH CONFIG IN DBT
type DbtModelMetadata = DbtModelLightdashConfig & {}

type DbtModelLightdashConfig = {
    joins?: DbtModelJoin[]
}
type DbtModelJoin = {
    join: string,
    sql_on: string,
}
type DbtColumnMetadata = DbtColumnLightdashConfig & {}
type DbtColumnLightdashConfig = {
    dimension?: DbtColumnLightdashDimension,
    metrics?: {[metricName: string]: DbtColumnLightdashMetric}
}

type DbtColumnLightdashDimension = {
    name?: string,
    type?: DimensionType,
    description?: string,
    sql?: string,
}

type DbtColumnLightdashMetric = {
    type: MetricType,
    description?: string,
    sql?: string,
}

// MAPPINGS FROM DBT CONFIG TO LIGHTDASH MODELS
const convertDimension = (modelName: string, column: DbtModelColumn, source: Source): Dimension => {
    return {
        name: column.meta.dimension?.name || column.name,
        sql: column.meta.dimension?.sql || `\$\{TABLE\}.${column.name}`,
        table: modelName,
        type: (
            column.meta.dimension?.type ||
            (column.data_type && mapColumnTypeToLightdashType(column.data_type))
            || 'string'
        ),
        description: column.meta.dimension?.description || column.description,
        source,
    }
}

type ConvertMetricArgs = {
    modelName: string,
    columnName: string,
    columnDescription?: string,
    name: string,
    metric: DbtColumnLightdashMetric,
    source: Source;
}
const convertMetric = ({modelName, columnName, columnDescription, name, metric, source}: ConvertMetricArgs): Metric => ({
    name,
    sql: metric.sql || `\$\{TABLE\}.${columnName}`,
    table: modelName,
    type: metric.type,
    description: metric.description || `${metric.type} of ${columnDescription}`,
    source
})

const convertTable = (model: DbtModelNode, depGraph: DepGraph<LineageNodeDependency>): Table => {
    // Generate lineage for this table
    const modelFamily = [...depGraph.dependantsOf(model.name), ...depGraph.dependenciesOf(model.name), model.name]
    const lineage: LineageGraph = modelFamily.reduce<LineageGraph>((prev, modelName) => {
        return {
            ...prev,
            [modelName]: depGraph.directDependenciesOf(modelName).map(d => depGraph.getNodeData(d))
        }
    }, {})

    const schemaPath = `${model.root_path}/${model.patch_path}`;

    let ymlFile: string;
    try {
        ymlFile = fs.readFileSync(schemaPath, 'utf-8');
    } catch {
        throw new ParseError(`It was not possible to read the dbt schema ${schemaPath}`, {})
    }

    const lines = ymlFile.split(/\r?\n/);
    const parsedFile = parseWithPointers<{models:DbtModelNode[]}>(ymlFile.toString());

    if(!parsedFile.data){
        throw new ParseError(`It was not possible to parse the dbt schema ${schemaPath}`, {});
    }

    const modelIndex = parsedFile.data.models.findIndex((m: DbtModelNode) => m.name === model.name);
    const modelRange = getLocationForJsonPath(parsedFile, ['models', modelIndex])?.range;

    if(!modelRange){
        throw new ParseError(`It was not possible to find the dbt model "${model.name}" in ${schemaPath}`, {});
    }

    const tableSource: Source = {
        path: model.patch_path,
        range: modelRange,
        content: lines.slice(modelRange.start.line, modelRange.end.line + 1).join('\r\n'),
    }

    const [dimensions, metrics]: [Record<string, Dimension>, Record<string, Metric>] = Object.values(model.columns).reduce(([prevDimensions, prevMetrics], column, columnIndex) => {
        const columnRange = getLocationForJsonPath(parsedFile, ['models', modelIndex, 'columns', columnIndex])?.range;
        if (!columnRange) {
            throw new ParseError(`It was not possible to find the column "${column.name}" for the model "${model.name}" in ${schemaPath}`, {});
        }
        const dimensionSource: Source = {
            path: model.patch_path,
            range: columnRange,
            content: lines.slice(columnRange.start.line, columnRange.end.line + 1).join('\r\n'),
        };

        const columnMetrics = Object.entries(column.meta.metrics || {}).map(([name, metric]) => {
            const metricRange = getLocationForJsonPath(parsedFile, ['models', modelIndex, 'columns', columnIndex, 'meta', 'metrics', name])?.range;
            if (!metricRange) {
                throw new ParseError(`It was not possible to find the metric "${name}" for the model "${model.name}" in ${schemaPath}`, {});
            }
            const metricSource: Source = {
                path: model.patch_path,
                range: metricRange,
                content: lines.slice(metricRange.start.line, metricRange.end.line + 1).join('\r\n'),
            };

            return convertMetric({
                modelName: model.name,
                columnName: column.name,
                columnDescription: column.description,
                name,
                metric,
                source: metricSource
            });
        });

        return [
            {...prevDimensions, [column.name]: convertDimension(model.name, column, dimensionSource)},
            {...prevMetrics, ...columnMetrics}
        ]
    }, [{}, {}]);

    return {
        name: model.name,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions,
        metrics,
        lineageGraph: lineage,
        source: tableSource
    }
}

const modelGraph = (allModels: DbtModelNode[]): DepGraph<LineageNodeDependency> => {
    const depGraph = new DepGraph<LineageNodeDependency>()
    allModels.forEach(model => {
        const [type, project, name] = model.unique_id.split('.')
        if (type === 'model') {
            depGraph.addNode(name, {type, name})
        }
        // Only use models, seeds, and sources for graph.
        model.depends_on.nodes.forEach(nodeId => {
            const [type, project, name] = nodeId.split('.')
            if (type === 'model' || type === 'seed' || type === 'source') {
                depGraph.addNode(name, {type, name})
                depGraph.addDependency(model.name, name)
            }
        })
    })
    return depGraph
}

const convertTables = (allModels: DbtModelNode[]): Table[] => {
    const graph = modelGraph(allModels)
    return allModels.map(model => convertTable(model, graph))
}

export const convertExplores = async (models: DbtModelNode[]): Promise<Explore[]> => {
    const tables: Record<string, Table> = convertTables(models).reduce((prev, relation) => {
        return {...prev, [relation.name]: relation}
    }, {})
    const explores = models.map(model => compileExplore({
        name: model.name,
        baseTable: model.name,
        joinedTables: (model.meta.joins || []).map(join => ({
            table: join.join,
            sqlOn: join.sql_on,
        })),
        tables: tables,
    }))
    return explores
}


export const getDbtCatalog = async (): Promise<DbtCatalog> => {
    const params = {
        'compile': false
    }
    return await postDbtAsyncRpc('docs.generate', params)
}

const getDbtManifest = async (): Promise<{results: {node: DbtNode}[]}> => {
    const manifest = await postDbtAsyncRpc('compile', {})
    return manifest
}

export const getDbtModels = async (): Promise<DbtModelNode[]> => {
    const manifest = await getDbtManifest()
    const nodes = manifest.results.map(result => result.node)
    const models = nodes.filter(node => node.resource_type === 'model') as DbtModelNode[]
    const validator = ajv.compile(modelJsonSchema)
    const validateModel = (model: DbtModelNode) => {
        const valid = validator(model)
        if (!valid) {
            const lineErrorMessages = (validator.errors || []).map(err => `Field at ${err.instancePath} ${err.message}`).join('\n')
            throw new ParseError(
                `Cannot parse lightdash metadata from schema.yml for '${model.name}' model:\n${lineErrorMessages}`,
                {
                    schema: modelJsonSchema.$id,
                    errors: validator.errors
                }
            )
        }
    }
    models.forEach(validateModel)

    // Foreign key checks
    const validModelNames = new Set(models.map(model => model.name))
    const validateForeignKeys = (model: DbtModelNode) => {
        const joins = model.meta?.joins?.map(j => j.join) || []
        joins.forEach(join => {
            if (!validModelNames.has(join))
                throw new ParseError(`Cannot parse lightdash metadata from schema.yml for '${model.name}' model:\n  Contains a join reference to another dbt model '${join}' which couldn't be found in the current dbt project.`, {})
        })
    }
    models.forEach(validateForeignKeys)
    return models
}

export const attachTypesToModels = async (models: DbtModelNode[], catalog: DbtCatalog): Promise<DbtModelNode[]> => {
    // Check that all models appear in the catalog
    models.forEach(model => {
        if (!(model.unique_id in catalog.nodes)) {
            throw new MissingCatalogEntryError(`Model ${model.unique_id} was expected in your target warehouse at ${model.database}.${model.schema}.${model.name}. Does the table exist in your target data warehouse?`, {})
        }
    })

    // get column types and use lower case column names
    const catalogColumnTypes = Object.fromEntries(
        Object.entries(catalog.nodes).map(([node_id, node]) => {
            const columns = Object.fromEntries(
                Object.entries(node.columns).map(([column_name, column]) => (
                    [column_name.toLowerCase(), column.type]
                ))
            )
            return [node_id, columns]
        })
    )

    const getType = (model: DbtModelNode, columnName: string): string => {
        try {
            const columnType = catalogColumnTypes[model.unique_id][columnName]
            return columnType
        }
        catch (e) {
            throw new MissingCatalogEntryError(`Column ${columnName} from model ${model.name} does not exist.\n ${columnName}.${model.name} was not found in your target warehouse at ${model.database}.${model.schema}.${model.name}. Try rerunning dbt to update your warehouse.`, {})
        }
    }

    // Update the dbt models with type info
    const typedModels = models.map(model => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => (
                [column_name, {...column, data_type: getType(model, column_name)}]
            ))
        )
    }))
    return typedModels
}


export interface DbtCatalogNode {
    metadata: DbtCatalogNodeMetadata;
    columns: {
        [k: string]: DbtCatalogNodeColumn;
    };
}

export interface DbtCatalogNodeMetadata {
    type: string;
    database: string;
    schema: string;
    name: string;
    comment?: string;
    owner?: string;
}

export interface DbtCatalogNodeColumn {
    type: string;
    comment?: string;
    index: number;
    name: string;
}

export interface DbtCatalog {
    nodes: {
        [k: string]: DbtCatalogNode;
    };
}