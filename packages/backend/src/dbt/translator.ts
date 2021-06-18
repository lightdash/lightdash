import {Dimension, DimensionType, Explore, mapColumnTypeToLightdashType, Metric, MetricType, Table,} from "common";
import modelJsonSchema from '../schema.json'
import {MissingCatalogEntryError, ParseError} from "../errors"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import {postDbtAsyncRpc} from "./rpcClient";

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
const convertDimension = (modelName: string, column: DbtModelColumn): Dimension => {
    return {
        name: column.meta.dimension?.name || column.name,
        sql: column.meta.dimension?.sql || `\$\{TABLE\}.${column.name}`,
        table: modelName,
        type: (
            column.meta.dimension?.type ||
            (column.data_type && mapColumnTypeToLightdashType(column.data_type))
            || 'string'
        ),
        description: column.meta.dimension?.description || column.description
    }
}

const convertMetrics = (modelName: string, column: DbtModelColumn): Metric[] => {
    return Object.entries(column.meta.metrics || {}).map(([name, m]) => ({
        name: name,
        sql: m.sql || `\$\{TABLE\}.${column.name}`,
        table: modelName,
        type: m.type,
        description: m.description || `${m.type} of ${column.description}`,
    }))
}

const convertTables = (allModels: DbtModelNode[], model: DbtModelNode): Table => {
    const dependentTables = allModels.filter(m => m.depends_on.nodes.find(idx => idx === model.unique_id)).map(m => m.name)
    return {
        name: model.name,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions: Object.fromEntries(Object.values(model.columns).map(col => convertDimension(model.name, col)).map(d => [d.name, d])),
        metrics: Object.fromEntries(Object.values(model.columns).map(col => convertMetrics(model.name, col)).flatMap(ms => ms.map(m => [m.name, m]))),
        sourceTables: model.depends_on.nodes.map(nodeId => nodeId.split('.')[2]),
        dependentTables: dependentTables,
    }
}

export const convertExplores = async (models: DbtModelNode[]): Promise<Explore[]> => {
    const relations = Object.fromEntries(models.map(model => {
        return [model.name, convertTables(models, model)]
    })) as {[modelId: string]: Table}

    const explores = models.map(model => {
        const tableNames = [model.name, ...(model.meta.joins || []).map(j => j.join)]
        return {
            name: model.name,
            baseTable: model.name,
            joinedTables: (model.meta.joins || []).map(join => ({
                table: join.join,
                sqlOn: join.sql_on,
            })),
            tables: Object.fromEntries(tableNames.map(n => [n, relations[n]])),
        } as Explore
    })
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