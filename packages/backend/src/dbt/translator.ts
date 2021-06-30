import {
    DbtCatalog,
    DbtModelColumn,
    DbtModelNode,
    Dimension,
    Explore,
    LineageGraph,
    LineageNodeDependency,
    mapColumnTypeToLightdashType,
    Metric,
    Table,
} from "common";
import {MissingCatalogEntryError} from "../errors"
import {DepGraph} from "dependency-graph"
import {compileExplore} from "../exploreCompiler";

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

const convertTable = (model: DbtModelNode, depGraph: DepGraph<LineageNodeDependency>): Table => {
    // Generate lineage for this table
    const modelFamily = [...depGraph.dependantsOf(model.name), ...depGraph.dependenciesOf(model.name), model.name]
    const lineage: LineageGraph = modelFamily.reduce<LineageGraph>((prev, modelName) => {
        return {
            ...prev,
            [modelName]: depGraph.directDependenciesOf(modelName).map(d => depGraph.getNodeData(d))
        }
    }, {})

    return {
        name: model.name,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions: Object.fromEntries(Object.values(model.columns).map(col => convertDimension(model.name, col)).map(d => [d.name, d])),
        metrics: Object.fromEntries(Object.values(model.columns).map(col => convertMetrics(model.name, col)).flatMap(ms => ms.map(m => [m.name, m]))),
        lineageGraph: lineage,
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


