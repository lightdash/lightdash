import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { type FC } from 'react';
import { AthenaSchemaInput } from './WarehouseForms/AthenaForm';
import { BigQuerySchemaInput } from './WarehouseForms/BigQueryForm';
import { ClickhouseSchemaInput } from './WarehouseForms/ClickhouseForm';
import { DatabricksSchemaInput } from './WarehouseForms/DatabricksForm';
import { DuckdbSchemaInput } from './WarehouseForms/DuckdbForm';
import { PostgresSchemaInput } from './WarehouseForms/PostgresForm';
import { RedshiftSchemaInput } from './WarehouseForms/RedshiftForm';
import { SnowflakeSchemaInput } from './WarehouseForms/SnowflakeForm';
import { TrinoSchemaInput } from './WarehouseForms/TrinoForm';

const SCHEMA_HINTS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.BIGQUERY]:
        'The dataset that holds your tables, listed under your project in the BigQuery console.',
    [WarehouseTypes.POSTGRES]:
        'The schema your tables live in. Often public if you never created one.',
    [WarehouseTypes.REDSHIFT]:
        'The schema your tables live in. Often public if you never created one.',
    [WarehouseTypes.SNOWFLAKE]:
        'The schema inside your database that holds your tables, such as PUBLIC.',
    [WarehouseTypes.DATABRICKS]:
        'The schema inside your catalog that holds your tables, such as default.',
    [WarehouseTypes.TRINO]:
        'The schema inside your catalog that holds your tables.',
    [WarehouseTypes.CLICKHOUSE]:
        'The database that holds your tables. Often default.',
    [WarehouseTypes.ATHENA]: 'The Glue database that holds your tables.',
    [WarehouseTypes.DUCKDB]: 'The schema your tables live in. Often main.',
};

const WarehouseSchemaInput: FC<{
    warehouseType: WarehouseTypes;
    disabled: boolean;
    warehouseOnly?: boolean;
}> = ({ warehouseType, disabled, warehouseOnly }) => {
    const description = warehouseOnly
        ? `${SCHEMA_HINTS[warehouseType]} You can add more later.`
        : undefined;

    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return (
                <BigQuerySchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.POSTGRES:
            return (
                <PostgresSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.TRINO:
            return (
                <TrinoSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.REDSHIFT:
            return (
                <RedshiftSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.SNOWFLAKE:
            return (
                <SnowflakeSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.DATABRICKS:
            return (
                <DatabricksSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.CLICKHOUSE:
            return (
                <ClickhouseSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.ATHENA:
            return (
                <AthenaSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        case WarehouseTypes.DUCKDB:
            return (
                <DuckdbSchemaInput
                    disabled={disabled}
                    description={description}
                />
            );
        default:
            return assertUnreachable(
                warehouseType,
                `Unknown warehouse type ${warehouseType}`,
            );
    }
};

export default WarehouseSchemaInput;
