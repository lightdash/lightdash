import React, { FC } from 'react';
import { WarehouseTypes } from 'common';
import BigQueryForm from './WarehouseForms/BigQueryForm';
import SnowflakeForm from './WarehouseForms/SnowflakeForm';
import RedshiftForm from './WarehouseForms/RedshiftForm';
import PostgresForm from './WarehouseForms/PostgresForm';
import SelectField from '../ReactHookForm/Select';
import DatabricksForm from './WarehouseForms/DatabricksForm';

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
    warehouseType: WarehouseTypes;
}

const WarehouseSettingsForm: FC<WarehouseSettingsFormProps> = ({
    disabled,
    warehouseType,
}) => {
    const WarehouseForm = WarehouseTypeForms[warehouseType] || BigQueryForm;
    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <SelectField
                name="warehouse.type"
                label="Type"
                options={Object.entries(WarehouseTypeLabels).map(
                    ([value, label]) => ({
                        value,
                        label,
                    }),
                )}
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
                defaultValue={WarehouseTypes.BIGQUERY}
            />
            <WarehouseForm disabled={disabled} />
        </div>
    );
};

export default WarehouseSettingsForm;
