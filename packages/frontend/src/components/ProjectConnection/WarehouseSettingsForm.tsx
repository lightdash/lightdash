import { WarehouseTypes } from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { useEffect, type FC } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import AthenaForm from './WarehouseForms/AthenaForm';
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
    [WarehouseTypes.ATHENA]: 'Athena',
};

const WarehouseTypeForms = {
    [WarehouseTypes.BIGQUERY]: BigQueryForm,
    [WarehouseTypes.POSTGRES]: PostgresForm,
    [WarehouseTypes.REDSHIFT]: RedshiftForm,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeForm,
    [WarehouseTypes.DATABRICKS]: DatabricksForm,
    [WarehouseTypes.TRINO]: TrinoForm,
    [WarehouseTypes.ATHENA]: AthenaForm,
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
                <Controller
                    name="warehouse.type"
                    defaultValue={WarehouseTypes.BIGQUERY}
                    render={({ field }) => (
                        <Select
                            label="Type"
                            data={Object.entries(WarehouseTypeLabels).map(
                                ([value, label]) => ({
                                    value,
                                    label,
                                }),
                            )}
                            required
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />
            )}
            <WarehouseForm disabled={disabled} />
        </div>
    );
};

export default WarehouseSettingsForm;
