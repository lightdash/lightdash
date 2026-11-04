import {
    assertUnreachable,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
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
    [WarehouseTypes.BIGQUERY]: 'The dataset with your tables.',
    [WarehouseTypes.POSTGRES]: 'The schema with your tables, often public.',
    [WarehouseTypes.REDSHIFT]: 'The schema with your tables, often public.',
    [WarehouseTypes.SNOWFLAKE]: 'The schema with your tables, such as PUBLIC.',
    [WarehouseTypes.DATABRICKS]:
        'The schema with your tables, such as default.',
    [WarehouseTypes.TRINO]: 'The schema with your tables.',
    [WarehouseTypes.CLICKHOUSE]:
        'The database with your tables, often default.',
    [WarehouseTypes.ATHENA]: 'The Glue database with your tables.',
    [WarehouseTypes.DUCKDB]: 'The schema with your tables, often main.',
};

const WarehouseSchemaInput: FC<{
    warehouseType: WarehouseTypes;
    disabled: boolean;
    warehouseOnly?: boolean;
}> = ({ warehouseType, disabled, warehouseOnly }) => {
    const isNewOnboarding =
        useServerFeatureFlag(FeatureFlags.NewOnboarding).data?.enabled === true;
    const description = !warehouseOnly
        ? undefined
        : isNewOnboarding
          ? `${SCHEMA_HINTS[warehouseType]} You can add more later.`
          : warehouseType === WarehouseTypes.BIGQUERY
            ? "We'll start with this dataset — you can add more later."
            : "We'll start with this schema — you can add more later.";

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
