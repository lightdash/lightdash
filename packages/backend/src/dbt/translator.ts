import {
    DbtModelColumn,
    DbtModelNode,
    Dimension,
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
    ExploreError,
} from 'common';
import { DepGraph } from 'dependency-graph';
import { parseWithPointers, getLocationForJsonPath } from '@stoplight/yaml';
import fs from 'fs';
import { compileExplore } from '../exploreCompiler';
import { DbtError, MissingCatalogEntryError, ParseError } from '../errors';
import { WarehouseCatalog } from '../types';

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
): Dimension => {
    let type;
    if (column.meta.dimension?.type) {
        type = column.meta.dimension.type;
    } else if (column.data_type) {
        type = mapColumnTypeToLightdashType(column.data_type);
    } else {
        throw new MissingCatalogEntryError(
            `Could not automatically find type information for column "${column.name}" in dbt model "${modelName}". Check for this column in your warehouse or specify the type manually.`,
            {},
        );
    }
    return {
        fieldType: FieldType.DIMENSION,
        name: column.meta.dimension?.name || column.name,
        // eslint-disable-next-line no-useless-escape
        sql: column.meta.dimension?.sql || `\$\{TABLE\}.${column.name}`,
        table: modelName,
        type,
        description: column.meta.dimension?.description || column.description,
        source,
    };
};

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
    const patchPath = model.patch_path;
    if (patchPath === null) {
        return convertTable(model, depGraph);
    }
    const lineage = generateTableLineage(model, depGraph);

    const modelPath = patchPathParts(patchPath).path;
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
            `It was not possible to parse the dbt schema "${schemaPath}"`,
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
        path: patchPathParts(patchPath).path,
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
                path: patchPathParts(patchPath).path,
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
                    path: patchPathParts(patchPath).path,
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

export const convertExplores = async (
    models: DbtModelNode[],
    loadSources: boolean,
    adapterType: string,
): Promise<(Explore | ExploreError)[]> => {
    const graph = modelGraph(models);
    const [tables, exploreErrors] = models.reduce(
        ([accTables, accErrors], model) => {
            // If there are any errors compiling the table return an ExploreError
            try {
                const table = loadSources
                    ? convertTableWithSources(model, graph)
                    : convertTable(model, graph);
                return [[...accTables, table], accErrors];
            } catch (e) {
                const exploreError: ExploreError = {
                    name: model.name,
                    errors: [
                        {
                            type: e.name,
                            message:
                                e.message ||
                                `Could not convert dbt model: "${model.name}" in to a Lightdash explore`,
                        },
                    ],
                };
                return [accTables, [...accErrors, exploreError]];
            }
        },
        [[], []] as [Table[], ExploreError[]],
    );
    const tableLookup: Record<string, Table> = tables.reduce(
        (prev, table) => ({ ...prev, [table.name]: table }),
        {},
    );
    const validModels = models.filter(
        (model) => tableLookup[model.name] !== undefined,
    );
    const explores: (Explore | ExploreError)[] = validModels.map((model) => {
        try {
            return compileExplore({
                name: model.name,
                baseTable: model.name,
                joinedTables: (model.meta.joins || []).map((join) => ({
                    table: join.join,
                    sqlOn: join.sql_on,
                })),
                tables: tableLookup,
                targetDatabase: adapterType,
            });
        } catch (e) {
            return {
                name: model.name,
                errors: [{ type: e.name, message: e.message }],
            };
        }
    });
    return [...explores, ...exploreErrors];
};

export const attachTypesToModels = (
    models: DbtModelNode[],
    warehouseSchema: WarehouseCatalog,
    throwOnMissingCatalogEntry: boolean = true,
): DbtModelNode[] => {
    // Check that all models appear in the warehouse
    models.forEach(({ database, schema, name }) => {
        if (
            (!(database in warehouseSchema) ||
                !(schema in warehouseSchema[database]) ||
                !(name in warehouseSchema[database][schema])) &&
            throwOnMissingCatalogEntry
        ) {
            throw new MissingCatalogEntryError(
                `Model "${name}" was expected in your target warehouse at "${database}.${schema}.${name}". Does the table exist in your target data warehouse?`,
                {},
            );
        }
    });

    const getType = (
        { database, schema, name }: DbtModelNode,
        columnName: string,
    ): string | undefined => {
        if (
            database in warehouseSchema &&
            schema in warehouseSchema[database] &&
            name in warehouseSchema[database][schema] &&
            columnName in warehouseSchema[database][schema][name]
        ) {
            return warehouseSchema[database][schema][name][columnName];
        }

        if (throwOnMissingCatalogEntry) {
            throw new MissingCatalogEntryError(
                `Column "${columnName}" from model "${name}" does not exist.\n "${columnName}.${name}" was not found in your target warehouse at ${database}.${schema}.${name}. Try rerunning dbt to update your warehouse.`,
                {},
            );
        }
        return undefined;
    };

    // Update the dbt models with type info
    return models.map((model) => ({
        ...model,
        columns: Object.fromEntries(
            Object.entries(model.columns).map(([column_name, column]) => [
                column_name,
                { ...column, data_type: getType(model, column_name) },
            ]),
        ),
    }));
};

export const getSchemaStructureFromDbtModels = (
    dbtModels: DbtModelNode[],
): { database: string; schema: string; table: string; columns: string[] }[] =>
    dbtModels.map(({ database, schema, name, columns }) => ({
        database,
        schema,
        table: name,
        columns: Object.keys(columns),
    }));
