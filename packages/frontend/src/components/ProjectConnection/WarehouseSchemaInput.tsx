import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { type FC } from 'react';
import { AthenaSchemaInput } from './WarehouseForms/AthenaForm';
import { BigQuerySchemaInput } from './WarehouseForms/BigQueryForm';
import { ClickhouseSchemaInput } from './WarehouseForms/ClickhouseForm';
import { DatabricksSchemaInput } from './WarehouseForms/DatabricksForm';
import { DorisSchemaInput } from './WarehouseForms/DorisForm';
import { DuckdbSchemaInput } from './WarehouseForms/DuckdbForm';
import { PostgresSchemaInput } from './WarehouseForms/PostgresForm';
import { RedshiftSchemaInput } from './WarehouseForms/RedshiftForm';
import { SnowflakeSchemaInput } from './WarehouseForms/SnowflakeForm';
import { TrinoSchemaInput } from './WarehouseForms/TrinoForm';

const WarehouseSchemaInput: FC<{
    warehouseType: WarehouseTypes;
    disabled: boolean;
    warehouseOnly?: boolean;
}> = ({ warehouseType, disabled, warehouseOnly }) => {
    const description = warehouseOnly
        ? warehouseType === WarehouseTypes.BIGQUERY
            ? "We'll start with this dataset — you can add more later."
            : "We'll start with this schema — you can add more later."
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
        case WarehouseTypes.DORIS:
            return (
                <DorisSchemaInput
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
