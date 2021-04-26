import {v4 as uuidv4} from 'uuid';
import {Dimension, DimensionType, Explore, mapColumnTypeToSeekerType, Measure, MeasureType, Relation} from "common";
import fetch from 'node-fetch'

const DBT_RPC_URL = 'http://localhost:8580/jsonrpc'

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
    description?: string,
}
type DbtModelColumn = {
    name: string,
    description?: string,
    meta: DbtColumnMetadata,
    type?: string,
}


// CUSTOM SEEKER CONFIG IN DBT
type DbtModelMetadata = {
    "seeker"?: DbtModelSeekerConfig
}
type DbtModelSeekerConfig = {
    joins?: DbtModelJoin[]
}
type DbtModelJoin = {
    join: string,
    left_join_key: string | string[],
    right_join_key: string | string[],
}
type DbtColumnMetadata = {
    "seeker"?: DbtColumnSeekerConfig,
}
type DbtColumnSeekerConfig = {
    dimension?: DbtColumnSeekerDimension,
    measures?: DbtColumnSeekerMeasure[],
}

type DbtColumnSeekerDimension = {
    name?: string,
    type?: DimensionType,
    description?: string,
}

type DbtColumnSeekerMeasure = {
    type: MeasureType,
    name?: string,
    description?: string,
}

// MAPPINGS FROM DBT CONFIG TO SEEKER MODELS
const convertDimension = (modelName: string, column: DbtModelColumn): Dimension => {
    return {
        name: column.meta.seeker?.dimension?.name || column.name,
        column: column.name,
        relation: modelName,
        type: (
            column.meta.seeker?.dimension?.type ||
            (column.type && mapColumnTypeToSeekerType(column.type))
            || DimensionType.string
        ),
        description: column.meta.seeker?.dimension?.description || column.description
    }
}

const convertMeasures = (modelName: string, column: DbtModelColumn): Measure[] => {
    return (column.meta.seeker?.measures || []).map(m => ({
        name: m.name || `${m.type} of ${column.name}`,
        column: column.name,
        relation: modelName,
        type: m.type,
        description: m.description || column.description,
    }))
}

const convertRelation = (model: DbtModelNode): Relation => {
    return {
        name: model.name,
        table: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions: Object.fromEntries(Object.values(model.columns).map(col => convertDimension(model.name, col)).map(d => [d.name, d])),
        measures: Object.fromEntries(Object.values(model.columns).map(col => convertMeasures(model.name, col)).flatMap(ms => ms.map(m => [m.name, m]))),
    }
}

const convertExplores = async (models: DbtModelNode[]): Promise<Explore[]> => {
    const relations = Object.fromEntries(models.map(model => {
        return [model.name, convertRelation(model)]
    })) as {[modelId: string]: Relation}

    const explores = models.map(model => {
        const relationNames = [model.name, ...(model.meta.seeker?.joins || []).map(j => j.join)]
        return {
            name: model.name,
            baseRelation: model.name,
            joinedRelations: (model.meta.seeker?.joins || []).map(join => ({
                relation: join.join,
                leftJoinKey: Array.isArray(join.left_join_key) ? join.left_join_key : [join.left_join_key],
                rightJoinKey: Array.isArray(join.right_join_key) ? join.right_join_key : [join.right_join_key],
            })),
            relations: Object.fromEntries(relationNames.map(n => [n, relations[n]])),
        }
    })
    return explores
}

// DBT RPC API
const postDbtSyncRpc = async (method: string, params: Object) => {
    const requestId = uuidv4()
    const payload = {
        method,
        params,
        jsonrpc: '2.0',
        id: requestId,
    }
    const headers = {
        'Content-Type': 'application-json',
    }
    return fetch(DBT_RPC_URL, {method: 'POST', headers: headers, body: JSON.stringify(payload)})
        .then(r => {
            if (!r.ok) {
                throw Error(`Could not connect to the dbt server. ${r.statusText}`)
            }
            return r
        })
        .then(r => r.json())
        .then(d => {
            if (d.error) {
                throw Error(JSON.stringify(d.error))
            }
            return d
        })
}


const postDbtAsyncRpc = async (method: string, params: object) => {
    const response = await postDbtSyncRpc(method, params)
    const requestToken = response.result.request_token
    return pollDbtServer(requestToken)
}

export const runQueryOnDbtAdapter = async (query: string): Promise<{[columnName: string]: any}[]> => {
    const params = {
        name: 'Seeker query',
        timeout: 60,
        sql: Buffer.from(query).toString('base64'),
    }
    const response = await postDbtAsyncRpc('run_sql', params)
    const columns: string[] = response.results[0].table.column_names
    const rows: any[][] = response.results[0].table.rows
    return rows.map(row => Object.fromEntries(row.map((value: any, index: number) => ([columns[index], value]))))
}

const getDbtCatalog = async (): Promise<DbtCatalog> => {
    const params = {
        'compile': false
    }
    return postDbtAsyncRpc('docs.generate', params)
}

const getDbtManifest = async (): Promise<{results: {node: DbtNode}[]}> => {
    return postDbtAsyncRpc('compile', {})
}

const getDbtModels = async (): Promise<DbtModelNode[]> => {
    const manifest = await getDbtManifest()
    const nodes = manifest.results.map(result => result.node)
    const models = nodes.filter(node => node.resource_type === 'model') as DbtModelNode[]
    return models
}

const getBoth = async () => {
    const catalog = getDbtCatalog()
    const models = getDbtModels()
    return {
        catalog: await catalog,
        models: await models,
    }
}

const getDbtTypedModels = async (): Promise<DbtModelNode[]> => {
    const { catalog, models } = await getBoth()

    // Check that all models appear in the catalog
    models.forEach(model => {
        if (!(model.unique_id in catalog.nodes)) {
            console.warn(`Model ${model.unique_id} was expected in your target warehouse at ${model.database}.${model.schema}.${model.name}. Does the table exist in your target data warehouse?`)
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

    const getType = (model_id: string, column_name: string): string => {
        return catalogColumnTypes[model_id] && catalogColumnTypes[model_id][column_name]
    }

    // Update the dbt models with type info
    const typedModels = models.map(model => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => (
                [column_name, {...column, data_type: getType(model.unique_id, column_name)}]
            ))
        )
    }))
    return typedModels
}


export const getExploresFromDbt = async (): Promise<Explore[]> => (
    getDbtTypedModels()
        .then(convertExplores)
)

const pollDbtServer = async (requestToken: string): Promise<any> => {
    let attemptCount = 0
    const maxAttempts = 20
    const interval = 1000  // 1 second
    const params = {
        request_token: requestToken
    }

    const poll = async (resolve: (value: any) => void, reject: (reason: any) => void): Promise<any> => {
        const response = await postDbtSyncRpc('poll', params)
        attemptCount++

        if (response.result.state === 'success') {
            return resolve(response.result)
        }
        else if (attemptCount === maxAttempts) {
            return reject(new Error('Exceeded'))
        }
        else {
            setTimeout(poll, interval, resolve, reject)
        }
    }
    return new Promise(poll)
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