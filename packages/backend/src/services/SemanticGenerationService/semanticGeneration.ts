import {
    DimensionType,
    FieldType,
    friendlyName,
    getDefaultTimeFrames,
    JoinRelationship,
    MetricType,
    snakeCaseName,
    timeFrameConfigs,
    type Dimension,
    type ExploreJoin,
    type Metric,
    type ProfileResult,
    type SemanticLayerFieldSource,
    type SupportedDbtAdapter,
    type Table,
    type WeekDay,
} from '@lightdash/common';

export const MAX_SEMANTIC_EXPLORES = 6;

const MONEY_COLUMN_PATTERN = /(revenue|amount|price|total|value)/i;
const ID_COLUMN_PATTERN = /(^id$|_id$)/i;

export type SemanticGenerationOptions = {
    targetDatabase: SupportedDbtAdapter;
    fieldQuoteChar: string;
    startOfWeek: WeekDay | null | undefined;
};

export type GeneratedExploreDefinition = {
    name: string;
    label: string;
    baseTable: string;
    joinedTables: ExploreJoin[];
};

export type GeneratedFieldSources = Record<
    string,
    {
        dimensions: Record<string, SemanticLayerFieldSource>;
        metrics: Record<string, SemanticLayerFieldSource>;
    }
>;

export type SemanticGenerationOutput = {
    tables: Record<string, Table>;
    explores: GeneratedExploreDefinition[];
    fieldSources: GeneratedFieldSources;
    metricsSummary: {
        totalMetrics: number;
        metricsByTable: Record<string, number>;
    };
    skippedTableCount: number;
};

const getLabel = (value: string): string => friendlyName(value) || value;

const getSafeIdentifiers = (
    values: string[],
    fallbackPrefix: string,
): string[] => {
    const used = new Set<string>();
    return values.map((value, index) => {
        const normalized =
            snakeCaseName(value) || `${fallbackPrefix}_${index + 1}`;
        let identifier = normalized;
        let suffix = 2;
        while (used.has(identifier)) {
            identifier = `${normalized}_${suffix}`;
            suffix += 1;
        }
        used.add(identifier);
        return identifier;
    });
};

const quoteIdentifier = (identifier: string, quoteChar: string): string =>
    `${quoteChar}${identifier.replaceAll(quoteChar, quoteChar.repeat(2))}${quoteChar}`;

const getSqlTable = (
    table: ProfileResult['tables'][number],
    quoteChar: string,
): string =>
    [table.database, table.schema, table.name]
        .filter((part) => part.length > 0)
        .map((part) => quoteIdentifier(part, quoteChar))
        .join('.');

const findHighestRowCount = (
    tables: ProfileResult['tables'],
): ProfileResult['tables'][number] | undefined =>
    tables.reduce<ProfileResult['tables'][number] | undefined>(
        (selected, table) => {
            if (!selected) return table;
            if (table.rowCount === null) return selected;
            if (
                selected.rowCount === null ||
                table.rowCount > selected.rowCount
            ) {
                return table;
            }
            return selected;
        },
        undefined,
    );

const selectPrimaryTable = (
    profile: ProfileResult,
): ProfileResult['tables'][number] | undefined => {
    const heuristicMatches = profile.tables.filter(
        (table) =>
            table.columns.some(
                (column) =>
                    column.type === DimensionType.DATE ||
                    column.type === DimensionType.TIMESTAMP,
            ) &&
            table.columns.some(
                (column) =>
                    column.type === DimensionType.NUMBER &&
                    MONEY_COLUMN_PATTERN.test(column.name),
            ),
    );
    const heuristicPrimary = findHighestRowCount(heuristicMatches);
    if (heuristicPrimary) return heuristicPrimary;

    const referenceCounts = profile.relationships.reduce<Map<string, number>>(
        (counts, relationship) => {
            counts.set(
                relationship.fromTable,
                (counts.get(relationship.fromTable) ?? 0) + 1,
            );
            counts.set(
                relationship.toTable,
                (counts.get(relationship.toTable) ?? 0) + 1,
            );
            return counts;
        },
        new Map(),
    );
    const mostReferenced = profile.tables.reduce<
        ProfileResult['tables'][number] | undefined
    >((selected, table) => {
        if (!selected) return table;
        return (referenceCounts.get(table.name) ?? 0) >
            (referenceCounts.get(selected.name) ?? 0)
            ? table
            : selected;
    }, undefined);
    if (mostReferenced && (referenceCounts.get(mostReferenced.name) ?? 0) > 0) {
        return mostReferenced;
    }

    return findHighestRowCount(profile.tables);
};

const getCuratedTables = (profile: ProfileResult) => {
    const primaryTable = selectPrimaryTable(profile);
    if (!primaryTable) return [];
    const neighbors = new Set<string>();
    profile.relationships.forEach((relationship) => {
        if (relationship.confidence !== 'high') return;
        if (relationship.fromTable === primaryTable.name) {
            neighbors.add(relationship.toTable);
        }
        if (relationship.toTable === primaryTable.name) {
            neighbors.add(relationship.fromTable);
        }
    });
    return [
        primaryTable,
        ...profile.tables.filter(
            (table) =>
                table.name !== primaryTable.name && neighbors.has(table.name),
        ),
    ].slice(0, MAX_SEMANTIC_EXPLORES);
};

const createDimensions = ({
    tableName,
    tableLabel,
    columnNames,
    columnIdentifiers,
    options,
}: {
    tableName: string;
    tableLabel: string;
    columnNames: ProfileResult['tables'][number]['columns'];
    columnIdentifiers: string[];
    options: SemanticGenerationOptions;
}): {
    dimensions: Record<string, Dimension>;
    sources: Record<string, SemanticLayerFieldSource>;
} => {
    const dimensions: Record<string, Dimension> = {};
    const sources: Record<string, SemanticLayerFieldSource> = {};
    columnNames.forEach((column, index) => {
        const name = columnIdentifiers[index];
        const label = getLabel(column.name);
        const sql = `\${TABLE}.${quoteIdentifier(
            column.name,
            options.fieldQuoteChar,
        )}`;
        dimensions[name] = {
            fieldType: FieldType.DIMENSION,
            type: column.type,
            name,
            label,
            table: tableName,
            tableLabel,
            sql,
            hidden: false,
            index,
            isIntervalBase:
                column.type === DimensionType.DATE ||
                column.type === DimensionType.TIMESTAMP,
        };
        sources[name] = { table: tableName, column: column.name };

        if (
            column.type !== DimensionType.DATE &&
            column.type !== DimensionType.TIMESTAMP
        ) {
            return;
        }
        getDefaultTimeFrames(column.type).forEach((timeInterval) => {
            const intervalName = `${name}_${timeInterval.toLowerCase()}`;
            dimensions[intervalName] = {
                fieldType: FieldType.DIMENSION,
                type: timeFrameConfigs[timeInterval].getDimensionType(
                    column.type,
                ),
                name: intervalName,
                label: `${label} ${timeFrameConfigs[timeInterval]
                    .getLabel()
                    .toLowerCase()}`,
                table: tableName,
                tableLabel,
                sql: timeFrameConfigs[timeInterval].getSql(
                    options.targetDatabase,
                    timeInterval,
                    sql,
                    column.type,
                    options.startOfWeek,
                ),
                hidden: false,
                index,
                timeInterval,
                timeIntervalBaseDimensionName: name,
                timeIntervalBaseDimensionType: column.type,
                groups: [label],
                isIntervalBase: false,
            };
            sources[intervalName] = {
                table: tableName,
                column: column.name,
            };
        });
    });
    return { dimensions, sources };
};

const createMetric = ({
    name,
    type,
    tableName,
    tableLabel,
    dimensionName,
}: {
    name: string;
    type: MetricType;
    tableName: string;
    tableLabel: string;
    dimensionName: string;
}): Metric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label: getLabel(name),
    table: tableName,
    tableLabel,
    sql: `\${${tableName}.${dimensionName}}`,
    hidden: false,
});

const createMetrics = ({
    profile,
    originalTableName,
    tableName,
    tableLabel,
    columns,
    columnIdentifiers,
}: {
    profile: ProfileResult;
    originalTableName: string;
    tableName: string;
    tableLabel: string;
    columns: ProfileResult['tables'][number]['columns'];
    columnIdentifiers: string[];
}): {
    metrics: Record<string, Metric>;
    sources: Record<string, SemanticLayerFieldSource>;
} => {
    const metrics: Record<string, Metric> = {};
    const sources: Record<string, SemanticLayerFieldSource> = {};
    const entity = profile.entities.find(
        (candidate) => candidate.tableName === originalTableName,
    );
    const outgoingForeignKeys = new Set(
        profile.relationships
            .filter(
                (relationship) => relationship.fromTable === originalTableName,
            )
            .map((relationship) => relationship.fromColumn.toLowerCase()),
    );
    const countColumnIndex = Math.max(
        0,
        columns.findIndex((column) => column.name === entity?.primaryKey),
    );
    const countColumn = columns[countColumnIndex];
    if (!countColumn) return { metrics, sources };

    const countName = `${tableName}_count`;
    metrics[countName] = createMetric({
        name: countName,
        type: MetricType.COUNT,
        tableName,
        tableLabel,
        dimensionName: columnIdentifiers[countColumnIndex],
    });
    sources[countName] = {
        table: tableName,
        column: countColumn.name,
    };

    columns.forEach((column, index) => {
        if (
            column.type === DimensionType.NUMBER &&
            MONEY_COLUMN_PATTERN.test(column.name)
        ) {
            const metricDefinitions: Array<[string, MetricType]> = [
                [`total_${columnIdentifiers[index]}`, MetricType.SUM],
                [`avg_${columnIdentifiers[index]}`, MetricType.AVERAGE],
            ];
            metricDefinitions.forEach(([name, type]) => {
                metrics[name] = createMetric({
                    name,
                    type,
                    tableName,
                    tableLabel,
                    dimensionName: columnIdentifiers[index],
                });
                sources[name] = {
                    table: tableName,
                    column: column.name,
                };
            });
        }

        const isIdentifier =
            entity?.primaryKey === column.name ||
            ID_COLUMN_PATTERN.test(column.name);
        const isScalarIdentifier =
            column.type === DimensionType.STRING ||
            column.type === DimensionType.NUMBER;
        if (
            isIdentifier &&
            isScalarIdentifier &&
            !outgoingForeignKeys.has(column.name.toLowerCase())
        ) {
            const name = `unique_${columnIdentifiers[index]}`;
            metrics[name] = createMetric({
                name,
                type: MetricType.COUNT_DISTINCT,
                tableName,
                tableLabel,
                dimensionName: columnIdentifiers[index],
            });
            sources[name] = {
                table: tableName,
                column: column.name,
            };
        }
    });
    return { metrics, sources };
};

export const generateSemanticLayer = (
    profile: ProfileResult,
    options: SemanticGenerationOptions,
): SemanticGenerationOutput => {
    const curatedTables = getCuratedTables(profile);
    const tableIdentifiers = getSafeIdentifiers(
        profile.tables.map((table) => table.name),
        'table',
    );
    const tableIdentifierByName = new Map(
        profile.tables.map((table, index) => [
            table.name,
            tableIdentifiers[index],
        ]),
    );
    const columnIdentifierByTable = new Map<string, Map<string, string>>();
    const tables: Record<string, Table> = {};
    const fieldSources: GeneratedFieldSources = {};
    const metricsByTable: Record<string, number> = {};

    curatedTables.forEach((profiledTable) => {
        const tableName = tableIdentifierByName.get(profiledTable.name)!;
        const tableLabel = getLabel(profiledTable.name);
        const columnIdentifiers = getSafeIdentifiers(
            profiledTable.columns.map((column) => column.name),
            'field',
        );
        columnIdentifierByTable.set(
            profiledTable.name,
            new Map(
                profiledTable.columns.map((column, index) => [
                    column.name,
                    columnIdentifiers[index],
                ]),
            ),
        );
        const generatedDimensions = createDimensions({
            tableName,
            tableLabel,
            columnNames: profiledTable.columns,
            columnIdentifiers,
            options,
        });
        const generatedMetrics = createMetrics({
            profile,
            originalTableName: profiledTable.name,
            tableName,
            tableLabel,
            columns: profiledTable.columns,
            columnIdentifiers,
        });
        tables[tableName] = {
            name: tableName,
            label: tableLabel,
            database: profiledTable.database,
            schema: profiledTable.schema,
            sqlTable: getSqlTable(profiledTable, options.fieldQuoteChar),
            dimensions: generatedDimensions.dimensions,
            metrics: generatedMetrics.metrics,
            lineageGraph: {},
        };
        fieldSources[tableName] = {
            dimensions: generatedDimensions.sources,
            metrics: generatedMetrics.sources,
        };
        metricsByTable[tableName] = Object.keys(
            generatedMetrics.metrics,
        ).length;
    });

    const curatedNames = new Set(curatedTables.map((table) => table.name));
    const explores = curatedTables.map((profiledTable) => {
        const baseTable = tableIdentifierByName.get(profiledTable.name)!;
        const joinedTableNames = new Set<string>();
        const joinedTables = profile.relationships.reduce<ExploreJoin[]>(
            (joins, relationship) => {
                if (
                    relationship.confidence !== 'high' ||
                    !curatedNames.has(relationship.fromTable) ||
                    !curatedNames.has(relationship.toTable) ||
                    relationship.fromTable === relationship.toTable
                ) {
                    return joins;
                }
                const joinsFromBase =
                    relationship.fromTable === profiledTable.name;
                const joinsToBase = relationship.toTable === profiledTable.name;
                if (!joinsFromBase && !joinsToBase) return joins;
                const joinedOriginalTable = joinsFromBase
                    ? relationship.toTable
                    : relationship.fromTable;
                const joinedTable =
                    tableIdentifierByName.get(joinedOriginalTable)!;
                if (joinedTableNames.has(joinedTable)) return joins;
                const fromTable = tableIdentifierByName.get(
                    relationship.fromTable,
                )!;
                const toTable = tableIdentifierByName.get(
                    relationship.toTable,
                )!;
                const fromColumn = columnIdentifierByTable
                    .get(relationship.fromTable)
                    ?.get(relationship.fromColumn);
                const toColumn = columnIdentifierByTable
                    .get(relationship.toTable)
                    ?.get(relationship.toColumn);
                if (!fromColumn || !toColumn) return joins;
                joinedTableNames.add(joinedTable);
                joins.push({
                    table: joinedTable,
                    sqlOn: `\${${fromTable}.${fromColumn}} = \${${toTable}.${toColumn}}`,
                    type: 'left',
                    relationship: joinsFromBase
                        ? JoinRelationship.MANY_TO_ONE
                        : JoinRelationship.ONE_TO_MANY,
                });
                return joins;
            },
            [],
        );
        return {
            name: baseTable,
            label: getLabel(profiledTable.name),
            baseTable,
            joinedTables,
        };
    });

    return {
        tables,
        explores,
        fieldSources,
        metricsSummary: {
            totalMetrics: Object.values(metricsByTable).reduce(
                (total, metricCount) => total + metricCount,
                0,
            ),
            metricsByTable,
        },
        skippedTableCount: profile.tables.length - curatedTables.length,
    };
};
