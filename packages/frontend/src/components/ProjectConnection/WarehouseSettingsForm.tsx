import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import SelectField from '../ReactHookForm/Select';
import BigQueryForm from './WarehouseForms/BigQueryForm';
import DatabricksForm from './WarehouseForms/DatabricksForm';
import PostgresForm from './WarehouseForms/PostgresForm';
import RedshiftForm from './WarehouseForms/RedshiftForm';
import SnowflakeForm from './WarehouseForms/SnowflakeForm';
import TrinoForm from './WarehouseForms/TrinoForm';

const WarehouseTypeLabels = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.POSTGRES]: 'PostgreSQL',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
    [WarehouseTypes.TRINO]: 'Trino',
};

const WarehouseTypeForms = {
    [WarehouseTypes.BIGQUERY]: BigQueryForm,
    [WarehouseTypes.POSTGRES]: PostgresForm,
    [WarehouseTypes.REDSHIFT]: RedshiftForm,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeForm,
    [WarehouseTypes.DATABRICKS]: DatabricksForm,
    [WarehouseTypes.TRINO]: TrinoForm,
};

interface WarehouseSettingsFormProps {
    disabled: boolean;
    setSelectedWarehouse?: (warehouse: WarehouseTypes) => void;
    selectedWarehouse?: WarehouseTypes;
    isProjectUpdate?: boolean | undefined;
}

const WarehouseSettingsForm: FC<WarehouseSettingsFormProps> = ({
    disabled,
    selectedWarehouse,
    setSelectedWarehouse,
    isProjectUpdate,
}) => {
    const warehouseType: WarehouseTypes = useWatch({
        name: 'warehouse.type',
        defaultValue: WarehouseTypes.BIGQUERY,
    });

    const WarehouseForm =
        (selectedWarehouse && WarehouseTypeForms[selectedWarehouse]) ||
        WarehouseTypeForms[warehouseType] ||
        BigQueryForm;

    useEffect(() => {
        if (isProjectUpdate && warehouseType && setSelectedWarehouse) {
            setSelectedWarehouse(warehouseType || WarehouseTypes.BIGQUERY);
        }
    }, [warehouseType, setSelectedWarehouse, isProjectUpdate]);

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            {isProjectUpdate && (
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
