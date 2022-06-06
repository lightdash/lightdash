import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useWatch } from 'react-hook-form';
import { SelectedWarehouse } from '../../pages/CreateProject';
import SelectField from '../ReactHookForm/Select';
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
    const warehouseType: WarehouseTypes = useWatch({
        name: 'warehouse.type',
        defaultValue: WarehouseTypes.BIGQUERY,
    });
    const WarehouseForm = selectedWarehouse
        ? WarehouseTypeForms[selectedWarehouse.key]
        : WarehouseTypeForms[warehouseType] || BigQueryForm;
    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            {!selectedWarehouse && (
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
            )}
            <WarehouseForm disabled={disabled} />
        </div>
    );
};

export default WarehouseSettingsForm;
