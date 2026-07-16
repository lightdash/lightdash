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

const WarehouseSchemaInput: FC<{
    warehouseType: WarehouseTypes;
    disabled: boolean;
}> = ({ warehouseType, disabled }) => {
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return <BigQuerySchemaInput disabled={disabled} />;
        case WarehouseTypes.POSTGRES:
            return <PostgresSchemaInput disabled={disabled} />;
        case WarehouseTypes.TRINO:
            return <TrinoSchemaInput disabled={disabled} />;
        case WarehouseTypes.REDSHIFT:
            return <RedshiftSchemaInput disabled={disabled} />;
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeSchemaInput disabled={disabled} />;
        case WarehouseTypes.DATABRICKS:
            return <DatabricksSchemaInput disabled={disabled} />;
        case WarehouseTypes.CLICKHOUSE:
            return <ClickhouseSchemaInput disabled={disabled} />;
        case WarehouseTypes.ATHENA:
            return <AthenaSchemaInput disabled={disabled} />;
        case WarehouseTypes.DUCKDB:
            return <DuckdbSchemaInput disabled={disabled} />;
        default:
            return assertUnreachable(
                warehouseType,
                `Unknown warehouse type ${warehouseType}`,
            );
    }
};

export default WarehouseSchemaInput;
