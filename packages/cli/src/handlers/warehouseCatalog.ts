import {
    type DimensionType,
    type PartitionColumn,
    type WarehouseTablesCatalog,
    type WarehouseTableSchema,
} from '@lightdash/common';
import columnify from 'columnify';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type WarehouseCatalogOptions = {
    database?: string;
    schema?: string;
    table?: string;
    includeFields: boolean;
    refresh: boolean;
    json: boolean;
    verbose: boolean;
};

type WarehouseCatalogField = {
    name: string;
    type: DimensionType;
};

type WarehouseCatalogTable = {
    database: string;
    schema: string;
    table: string;
    partitionColumn?: PartitionColumn;
    fields?: WarehouseCatalogField[];
};

type WarehouseCatalogOutput = {
    tables: WarehouseCatalogTable[];
};

const compareStrings = (left: string, right: string): number => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
};

const compareTables = (
    left: WarehouseCatalogTable,
    right: WarehouseCatalogTable,
): number =>
    compareStrings(left.database, right.database) ||
    compareStrings(left.schema, right.schema) ||
    compareStrings(left.table, right.table);

const flattenCatalog = (
    catalog: WarehouseTablesCatalog,
): WarehouseCatalogTable[] =>
    Object.entries(catalog)
        .flatMap(([database, schemas]) =>
            Object.entries(schemas).flatMap(([schema, tables]) =>
                Object.entries(tables).map(([table, metadata]) => ({
                    database,
                    schema,
                    table,
                    ...(metadata.partitionColumn
                        ? {
                              partitionColumn: {
                                  field: metadata.partitionColumn.field,
                                  partitionType:
                                      metadata.partitionColumn.partitionType,
                              },
                          }
                        : {}),
                })),
            ),
        )
        .sort(compareTables);

const filterTables = (
    tables: WarehouseCatalogTable[],
    options: Pick<WarehouseCatalogOptions, 'database' | 'schema' | 'table'>,
): WarehouseCatalogTable[] =>
    tables.filter(
        (table) =>
            (!options.database || table.database === options.database) &&
            (!options.schema || table.schema === options.schema) &&
            (!options.table || table.table === options.table),
    );

const validateFieldLookup = (
    options: Pick<
        WarehouseCatalogOptions,
        'database' | 'schema' | 'table' | 'includeFields'
    >,
): void => {
    if (
        options.includeFields &&
        (!options.database || !options.schema || !options.table)
    ) {
        throw new Error(
            '--include-fields requires --database, --schema, and --table to identify exactly one warehouse table.',
        );
    }
};

const fieldsToList = (fields: WarehouseTableSchema): WarehouseCatalogField[] =>
    Object.entries(fields)
        .map(([name, type]) => ({ name, type }))
        .sort((left, right) => compareStrings(left.name, right.name));

const renderHumanOutput = ({ tables }: WarehouseCatalogOutput): void => {
    if (tables.length === 0) {
        process.stdout.write(
            `${styles.warning('No warehouse tables found.')}\n`,
        );
        return;
    }

    process.stdout.write(
        `${styles.bold(
            `Warehouse catalog (${tables.length} ${
                tables.length === 1 ? 'table' : 'tables'
            })`,
        )}\n\n`,
    );
    process.stdout.write(
        `${columnify(tables, {
            columns: ['database', 'schema', 'table'],
        })}\n`,
    );

    const tableWithFields = tables.find((table) => table.fields);
    if (tableWithFields?.fields) {
        process.stdout.write(
            `\n${styles.bold(
                `Fields for ${tableWithFields.database}.${tableWithFields.schema}.${tableWithFields.table} (${tableWithFields.fields.length})`,
            )}\n\n`,
        );
        process.stdout.write(
            `${columnify(tableWithFields.fields, {
                columns: ['name', 'type'],
            })}\n`,
        );
    }
};

export const warehouseCatalogHandler = async (
    options: WarehouseCatalogOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    validateFieldLookup(options);

    const config = await getConfig();
    const projectUuid = config.context?.project;
    if (!projectUuid) {
        throw new Error(
            "No project selected. Run 'lightdash config set-project' first.",
        );
    }

    if (options.refresh) {
        await lightdashApi<undefined>({
            method: 'POST',
            url: `/api/v1/projects/${projectUuid}/sqlRunner/refresh-catalog`,
            body: undefined,
        });
    }

    const catalog = await lightdashApi<WarehouseTablesCatalog>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/sqlRunner/tables`,
        body: undefined,
    });
    const tables = filterTables(flattenCatalog(catalog), options);

    if (options.includeFields) {
        if (tables.length !== 1) {
            throw new Error(
                `Could not find the exact warehouse table ${options.database}.${options.schema}.${options.table}.`,
            );
        }
        const query = new URLSearchParams({
            databaseName: options.database!,
            schemaName: options.schema!,
            tableName: options.table!,
        });
        const fields = await lightdashApi<WarehouseTableSchema>({
            method: 'GET',
            url: `/api/v1/projects/${projectUuid}/sqlRunner/fields?${query.toString()}`,
            body: undefined,
        });
        tables[0].fields = fieldsToList(fields);
    }

    const output = { tables };
    if (options.json) {
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
        renderHumanOutput(output);
    }
};
