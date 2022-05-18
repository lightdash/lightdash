import { ParseError } from '@lightdash/common';
import { WarehouseClient, WarehouseTableSchema } from '@lightdash/warehouses';
import * as yaml from 'js-yaml';

type CompiledModel = {
    name: string;
    schema: string;
    database: string;
    rootPath: string;
    originalFilePath: string;
};
type GetCompiledModelFromManifestArgs = {
    projectName: string;
    modelName: string;
    manifest: Record<string, any>;
};
export const getCompiledModelFromManifest = ({
    projectName,
    modelName,
    manifest,
}: GetCompiledModelFromManifestArgs): CompiledModel => {
    const nodeId = `model.${projectName}.${modelName}`;
    const model = manifest.nodes[nodeId];
    if (model === undefined) {
        throw new ParseError(
            `Cannot find compiled model "${modelName}", do you need to run "dbt compile" first?`,
        );
    }
    const {
        database,
        schema,
        name,
        original_file_path: originalFilePath,
        root_path: rootPath,
    } = model;
    return {
        database,
        schema,
        name,
        rootPath,
        originalFilePath,
    };
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

type GenerateSchemaFileForModelArgs = {
    modelName: string;
    table: WarehouseTableSchema;
};
export const generateSchemaFileForModel = ({
    modelName,
    table,
}: GenerateSchemaFileForModelArgs): string => {
    const schema = {
        version: '2.0',
        models: [
            {
                name: modelName,
                columns: Object.entries(table).map(([columnName]) => ({
                    name: columnName,
                    description: '',
                })),
            },
        ],
    };
    return yaml.dump(schema);
};
