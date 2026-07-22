import {
    getErrorMessage,
    getTableColumnReferences,
    InlineErrorType,
    isExploreError,
    type Explore,
    type ExploreError,
    type WarehouseClient,
} from '@lightdash/common';
import { processPromisesInBatches } from './utils/processPromisesInBatches';

type WarehouseColumnValidationClient = Pick<
    WarehouseClient,
    'getFieldQuoteChar' | 'runQuery'
>;

type TableReference = {
    modelName: string;
    sqlTable: string;
    columnReferences: Set<string>;
};

type InvalidColumnReference = {
    modelName: string;
    columnReference: string;
    error: string;
};

const getTableReferences = (
    explores: (Explore | ExploreError)[],
): TableReference[] => {
    const referencesByTable = new Map<string, TableReference>();

    explores.forEach((explore) => {
        if (isExploreError(explore)) return;

        Object.values(explore.tables).forEach((table) => {
            if (table.sqlTable.includes('${')) return;

            const key = `${table.name}\0${table.sqlTable}`;
            const tableReference = referencesByTable.get(key) ?? {
                modelName: table.name,
                sqlTable: table.sqlTable,
                columnReferences: new Set<string>(),
            };

            [
                ...Object.values(table.dimensions),
                ...Object.values(table.metrics),
            ]
                .flatMap((field) => getTableColumnReferences(field.sql))
                .forEach((columnReference) =>
                    tableReference.columnReferences.add(columnReference),
                );
            referencesByTable.set(key, tableReference);
        });
    });

    return [...referencesByTable.values()].filter(
        ({ columnReferences }) => columnReferences.size > 0,
    );
};

const getProbeSql = ({
    sqlTable,
    modelName,
    columnReferences,
    fieldQuoteChar,
}: {
    sqlTable: string;
    modelName: string;
    columnReferences: string[];
    fieldQuoteChar: string;
}) => {
    const tableAlias = `${fieldQuoteChar}${modelName}${fieldQuoteChar}`;
    const select =
        columnReferences.length === 0
            ? '1'
            : columnReferences
                  .map((reference) => `${tableAlias}.${reference}`)
                  .join(', ');
    return `SELECT ${select} FROM ${sqlTable} AS ${tableAlias} WHERE 1 = 0`;
};

const VALIDATION_CONCURRENCY = 5;

const findInvalidColumnReferences = async ({
    client,
    tableReferences,
    tags,
}: {
    client: WarehouseColumnValidationClient;
    tableReferences: TableReference[];
    tags: Record<string, string>;
}): Promise<InvalidColumnReference[]> => {
    const fieldQuoteChar = client.getFieldQuoteChar();
    const invalidReferencesByTable = await processPromisesInBatches(
        tableReferences,
        VALIDATION_CONCURRENCY,
        async (tableReference) => {
            const sharedProbeArgs = {
                sqlTable: tableReference.sqlTable,
                modelName: tableReference.modelName,
                fieldQuoteChar,
            };
            const columnReferences = [...tableReference.columnReferences];

            try {
                await client.runQuery(
                    getProbeSql({
                        ...sharedProbeArgs,
                        columnReferences,
                    }),
                    tags,
                );
                return [];
            } catch {
                // Probe separately only when the batched query fails.
            }

            try {
                await client.runQuery(
                    getProbeSql({
                        ...sharedProbeArgs,
                        columnReferences: [],
                    }),
                    tags,
                );
            } catch {
                // Relation failures do not prove that its columns are invalid.
                return [];
            }

            const invalidReferences = await processPromisesInBatches(
                columnReferences,
                VALIDATION_CONCURRENCY,
                async (columnReference) => {
                    try {
                        await client.runQuery(
                            getProbeSql({
                                ...sharedProbeArgs,
                                columnReferences: [columnReference],
                            }),
                            tags,
                        );
                        return null;
                    } catch (error) {
                        try {
                            await client.runQuery(
                                getProbeSql({
                                    ...sharedProbeArgs,
                                    columnReferences: [],
                                }),
                                tags,
                            );
                            return {
                                modelName: tableReference.modelName,
                                columnReference,
                                error: getErrorMessage(error),
                            };
                        } catch {
                            // The relation became unavailable mid-probe.
                            return null;
                        }
                    }
                },
            );
            return invalidReferences.filter(
                (reference): reference is InvalidColumnReference =>
                    reference !== null,
            );
        },
    );

    return invalidReferencesByTable.flat();
};

export const validateWarehouseColumnReferences = async ({
    explores,
    client,
    tags,
}: {
    explores: (Explore | ExploreError)[];
    client: WarehouseColumnValidationClient;
    tags: Record<string, string>;
}): Promise<(Explore | ExploreError)[]> => {
    const invalidReferences = await findInvalidColumnReferences({
        client,
        tableReferences: getTableReferences(explores),
        tags,
    });
    if (invalidReferences.length === 0) return explores;

    const warningExploreByModel = new Map<string, string>();
    explores.forEach((explore) => {
        if (isExploreError(explore)) return;

        Object.values(explore.tables).forEach((table) => {
            const current = warningExploreByModel.get(table.name);
            if (current === undefined || explore.name === table.name) {
                warningExploreByModel.set(table.name, explore.name);
            }
        });
    });

    const warningsByExplore = new Map<string, Explore['warnings']>();
    invalidReferences.forEach(({ modelName, columnReference, error }) => {
        const exploreName = warningExploreByModel.get(modelName);
        if (exploreName === undefined) return;

        const warnings = warningsByExplore.get(exploreName) ?? [];
        warnings.push({
            type: InlineErrorType.WAREHOUSE_COLUMN_ERROR,
            message: `Warehouse rejected column reference \${TABLE}.${columnReference} in model "${modelName}": ${error}`,
        });
        warningsByExplore.set(exploreName, warnings);
    });

    return explores.map((explore) => {
        if (isExploreError(explore)) return explore;
        const warnings = warningsByExplore.get(explore.name);
        if (warnings === undefined) return explore;
        return {
            ...explore,
            warnings: [...(explore.warnings ?? []), ...warnings],
        };
    });
};
