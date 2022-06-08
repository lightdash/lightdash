import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { SelectedWarehouse } from '../../pages/CreateProject';
import BigQueryForm from './WarehouseForms/BigQueryForm';
import DatabricksForm from './WarehouseForms/DatabricksForm';
import PostgresForm from './WarehouseForms/PostgresForm';
import RedshiftForm from './WarehouseForms/RedshiftForm';
import SnowflakeForm from './WarehouseForms/SnowflakeForm';

const WarehouseTypeLabels = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.POSTGRES]: 'PostgreSQL',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
};

const WarehouseTypeForms = {
    [WarehouseTypes.BIGQUERY]: BigQueryForm,
    [WarehouseTypes.POSTGRES]: PostgresForm,
    [WarehouseTypes.REDSHIFT]: RedshiftForm,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeForm,
    [WarehouseTypes.DATABRICKS]: DatabricksForm,
};

interface WarehouseSettingsFormProps {
    disabled: boolean;
    selectedWarehouse?: SelectedWarehouse | undefined;
}

const WarehouseSettingsForm: FC<WarehouseSettingsFormProps> = ({
    disabled,
    selectedWarehouse,
}) => {
    const WarehouseForm =
        (selectedWarehouse && WarehouseTypeForms[selectedWarehouse?.key]) ||
        BigQueryForm;
    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <WarehouseForm disabled={disabled} />
        </div>
    );
};

export default WarehouseSettingsForm;
