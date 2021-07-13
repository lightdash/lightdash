import {
    DbtRpcDocsGenerateResults,
    DbtModelColumn,
    DbtModelNode,
    Dimension,
    DimensionType,
    Explore,
    friendlyName,
    FieldType,
    LineageGraph,
    LineageNodeDependency,
    mapColumnTypeToLightdashType,
    Metric,
    Source,
    Table,
    DbtColumnLightdashMetric,
} from 'common';
import { DepGraph } from 'dependency-graph';
import { parseWithPointers, getLocationForJsonPath } from '@stoplight/yaml';
import fs from 'fs';
import { compileExplore } from '../exploreCompiler';
import { DbtError, MissingCatalogEntryError, ParseError } from '../errors';

const patchPathParts = (patchPath: string) => {
    const [project, ...rest] = patchPath.split('://');
    if (rest.length === 0) {
        throw new DbtError(
            'Could not parse dbt manifest. It looks like you might be using an old version of dbt. You must be using dbt version 0.20.0 or above.',
            {},
        );
    }
    return {
        project,
        path: rest.join('://'),
    };
};

const convertDimension = (
    modelName: string,
    column: DbtModelColumn,
    source?: Source,
): Dimension => ({
    fieldType: FieldType.DIMENSION,
    name: column.meta.dimension?.name || column.name,
    // eslint-disable-next-line no-useless-escape
    sql: column.meta.dimension?.sql || `\$\{TABLE\}.${column.name}`,
    table: modelName,
    type:
        column.meta.dimension?.type ||
        (column.data_type && mapColumnTypeToLightdashType(column.data_type)) ||
        DimensionType.STRING,
    description: column.meta.dimension?.description || column.description,
    source,
});

type ConvertMetricArgs = {
    modelName: string;
    columnName: string;
    name: string;
    metric: DbtColumnLightdashMetric;
    source?: Source;
};
const convertMetric = ({
    modelName,
    columnName,
    name,
    metric,
    source,
}: ConvertMetricArgs): Metric => ({
    fieldType: FieldType.METRIC,
    name,
    // eslint-disable-next-line no-useless-escape
    sql: metric.sql || `\$\{TABLE\}.${columnName}`,
    table: modelName,
    type: metric.type,
    description:
        metric.description ||
        `${friendlyName(metric.type)} of ${friendlyName(columnName)}`,
    source,
});

const generateTableLineage = (
    model: DbtModelNode,
    depGraph: DepGraph<LineageNodeDependency>,
): LineageGraph => {
    const modelFamily = [
        ...depGraph.dependantsOf(model.name),
        ...depGraph.dependenciesOf(model.name),
        model.name,
    ];
    return modelFamily.reduce<LineageGraph>(
        (prev, modelName) => ({
            ...prev,
            [modelName]: depGraph
                .directDependenciesOf(modelName)
                .map((d) => depGraph.getNodeData(d)),
        }),
        {},
    );
};

const convertTable = (
    model: DbtModelNode,
    depGraph: DepGraph<LineageNodeDependency>,
): Table => {
    const lineage = generateTableLineage(model, depGraph);

    const [dimensions, metrics]: [
        Record<string, Dimension>,
        Record<string, Metric>,
    ] = Object.values(model.columns).reduce(
        ([prevDimensions, prevMetrics], column) => {
            const columnMetrics = Object.entries(column.meta.metrics || {}).map(
                ([name, metric]) =>
                    convertMetric({
                        modelName: model.name,
                        columnName: column.name,
                        name,
                        metric,
                    }),
            );

            return [
                {
                    ...prevDimensions,
                    [column.name]: convertDimension(model.name, column),
                },
                { ...prevMetrics, ...columnMetrics },
            ];
        },
        [{}, {}],
    );

    return {
        name: model.name,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions,
        metrics,
        lineageGraph: lineage,
    };
};

const convertTableWithSources = (
    model: DbtModelNode,
    depGraph: DepGraph<LineageNodeDependency>,
): Table => {
    const lineage = generateTableLineage(model, depGraph);

    const modelPath = patchPathParts(model.patch_path).path;
    const schemaPath = `${model.root_path}/${modelPath}`;

    let ymlFile: string;
    try {
        ymlFile = fs.readFileSync(schemaPath, 'utf-8');
    } catch {
        throw new ParseError(
            `It was not possible to read the dbt schema ${schemaPath}`,
            {},
        );
    }

    const lines = ymlFile.split(/\r?\n/);
    const parsedFile = parseWithPointers<{ models: DbtModelNode[] }>(
        ymlFile.toString(),
    );

    if (!parsedFile.data) {
        throw new ParseError(
            `It was not possible to parse the dbt schema ${schemaPath}`,
            {},
        );
    }

    const modelIndex = parsedFile.data.models.findIndex(
        (m: DbtModelNode) => m.name === model.name,
    );
    const modelRange = getLocationForJsonPath(parsedFile, [
        'models',
        modelIndex,
    ])?.range;

    if (!modelRange) {
        throw new ParseError(
            `It was not possible to find the dbt model "${model.name}" in ${schemaPath}`,
            {},
        );
    }

    const tableSource: Source = {
        path: patchPathParts(model.patch_path).path,
        range: modelRange,
        content: lines
            .slice(modelRange.start.line, modelRange.end.line + 1)
            .join('\r\n'),
    };

    const [dimensions, metrics]: [
        Record<string, Dimension>,
        Record<string, Metric>,
    ] = Object.values(model.columns).reduce(
        ([prevDimensions, prevMetrics], column, columnIndex) => {
            const columnRange = getLocationForJsonPath(parsedFile, [
                'models',
                modelIndex,
                'columns',
                columnIndex,
            ])?.range;
            if (!columnRange) {
                throw new ParseError(
                    `It was not possible to find the column "${column.name}" for the model "${model.name}" in ${schemaPath}`,
                    {},
                );
            }
            const dimensionSource: Source = {
                path: patchPathParts(model.patch_path).path,
                range: columnRange,
                content: lines
                    .slice(columnRange.start.line, columnRange.end.line + 1)
                    .join('\r\n'),
            };

            const columnMetrics = Object.entries(
                column.meta.metrics || {},
            ).reduce((sum, [name, metric]) => {
                const metricRange = getLocationForJsonPath(parsedFile, [
                    'models',
                    modelIndex,
                    'columns',
                    columnIndex,
                    'meta',
                    'metrics',
                    name,
                ])?.range;
                if (!metricRange) {
                    throw new ParseError(
                        `It was not possible to find the metric "${name}" for the model "${model.name}" in ${schemaPath}`,
                        {},
                    );
                }
                const metricSource: Source = {
                    path: patchPathParts(model.patch_path).path,
                    range: dimensionSource.range,
                    highlight: metricRange,
                    content: dimensionSource.content,
                };

                return {
                    ...sum,
                    [name]: convertMetric({
                        modelName: model.name,
                        columnName: column.name,
                        name,
                        metric,
                        source: metricSource,
                    }),
                };
            }, {});

            return [
                {
                    ...prevDimensions,
                    [column.name]: convertDimension(
                        model.name,
                        column,
                        dimensionSource,
                    ),
                },
                { ...prevMetrics, ...columnMetrics },
            ];
        },
        [{}, {}],
    );

    return {
        name: model.name,
        sqlTable: model.relation_name,
        description: model.description || `${model.name} table`,
        dimensions,
        metrics,
        lineageGraph: lineage,
        source: tableSource,
    };
};

const modelGraph = (
    allModels: DbtModelNode[],
): DepGraph<LineageNodeDependency> => {
    const depGraph = new DepGraph<LineageNodeDependency>();
    allModels.forEach((model) => {
        const [type, project, name] = model.unique_id.split('.');
        if (type === 'model') {
            depGraph.addNode(name, { type, name });
        }
        // Only use models, seeds, and sources for graph.
        model.depends_on.nodes.forEach((nodeId) => {
            const [nodeType, nodeProject, nodeName] = nodeId.split('.');
            if (
                nodeType === 'model' ||
                nodeType === 'seed' ||
                nodeType === 'source'
            ) {
                depGraph.addNode(nodeName, { type: nodeType, name: nodeName });
                depGraph.addDependency(model.name, nodeName);
            }
        });
    });
    return depGraph;
};

const convertTables = (
    allModels: DbtModelNode[],
    loadSources: boolean,
): Table[] => {
    const graph = modelGraph(allModels);
    if (loadSources) {
        return allModels.map((model) => convertTableWithSources(model, graph));
    }
    return allModels.map((model) => convertTable(model, graph));
};

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
): Promise<Explore[]> => {
    const tables: Record<string, Table> = convertTables(
        models,
        loadSources,
    ).reduce((prev, relation) => ({ ...prev, [relation.name]: relation }), {});
    const explores = models.map((model) =>
        compileExplore({
            name: model.name,
            baseTable: model.name,
            joinedTables: (model.meta.joins || []).map((join) => ({
                table: join.join,
                sqlOn: join.sql_on,
            })),
            tables,
        }),
    );
    return explores;
};

export const attachTypesToModels = async (
    models: DbtModelNode[],
    catalog: DbtRpcDocsGenerateResults,
): Promise<DbtModelNode[]> => {
    // Check that all models appear in the catalog
    models.forEach((model) => {
        if (!(model.unique_id in catalog.nodes)) {
            throw new MissingCatalogEntryError(
                `Model ${model.unique_id} was expected in your target warehouse at ${model.database}.${model.schema}.${model.name}. Does the table exist in your target data warehouse?`,
                {},
            );
        }
    });

    // get column types and use lower case column names
    const catalogColumnTypes = Object.fromEntries(
        Object.entries(catalog.nodes).map(([node_id, node]) => {
            const columns = Object.fromEntries(
                Object.entries(node.columns).map(([column_name, column]) => [
                    column_name.toLowerCase(),
                    column.type,
                ]),
            );
            return [node_id, columns];
        }),
    );

    const getType = (model: DbtModelNode, columnName: string): string => {
        try {
            const columnType = catalogColumnTypes[model.unique_id][columnName];
            return columnType;
        } catch (e) {
            throw new MissingCatalogEntryError(
                `Column ${columnName} from model ${model.name} does not exist.\n ${columnName}.${model.name} was not found in your target warehouse at ${model.database}.${model.schema}.${model.name}. Try rerunning dbt to update your warehouse.`,
                {},
            );
        }
    };

    // Update the dbt models with type info
    const typedModels = models.map((model) => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => [
                column_name,
                { ...column, data_type: getType(model, column_name) },
            ]),
        ),
    }));
    return typedModels;
};
