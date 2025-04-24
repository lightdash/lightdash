import { WarehouseTypes } from '@lightdash/common';
import { Select } from '@mantine/core';
import { type FC } from 'react';
import BigQueryForm from './WarehouseForms/BigQueryForm';
import DatabricksForm from './WarehouseForms/DatabricksForm';
import PostgresForm from './WarehouseForms/PostgresForm';
import RedshiftForm from './WarehouseForms/RedshiftForm';
import SnowflakeForm from './WarehouseForms/SnowflakeForm';
import TrinoForm from './WarehouseForms/TrinoForm';
import { useFormContext } from './formContext';

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
    isProjectUpdate?: boolean | undefined;
}

const WarehouseSettingsForm: FC<WarehouseSettingsFormProps> = ({
    disabled,
    isProjectUpdate,
}) => {
    const form = useFormContext();

    const warehouseType: WarehouseTypes =
        form.values?.warehouse?.type ?? WarehouseTypes.BIGQUERY;

    const WarehouseForm = WarehouseTypeForms[warehouseType];

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            {isProjectUpdate && (
                <Select
                    defaultValue={WarehouseTypes.BIGQUERY}
                    label="Type"
                    data={Object.entries(WarehouseTypeLabels).map(
                        ([value, label]) => ({
                            value,
                            label,
                        }),
                    )}
                    required
                    {...form.getInputProps('warehouse.type')}
                    disabled={disabled}
                />
            )}

            <WarehouseForm disabled={disabled} />
        </div>
    );
};

export default WarehouseSettingsForm;
