import React, { FC, useState } from 'react';
import { FormGroup, HTMLSelect } from '@blueprintjs/core';
import { CreateWarehouseCredentials, Project, WarehouseTypes } from 'common';
import BigQueryForm from './BigQueryForm';
import SnowflakeForm from './SnowflakeForm';
import RedshiftForm from './RedshiftForm';
import PostgresForm from './PostgresForm';
import { useUpdateWarehouseMutation } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

const WarehouseTypeLabels = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.POSTGRES]: 'PostgreSQL',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
};

const WarehouseTypeForms = {
    [WarehouseTypes.BIGQUERY]: BigQueryForm,
    [WarehouseTypes.POSTGRES]: PostgresForm,
    [WarehouseTypes.REDSHIFT]: RedshiftForm,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeForm,
};

interface WarehouseSettingsFormProps {
    projectUuid: string;
    warehouseConnection: Project['warehouseConnection'];
}

const WarehouseSettingsForm: FC<WarehouseSettingsFormProps> = ({
    projectUuid,
    warehouseConnection,
}) => {
    const [type, setType] = useState<WarehouseTypes>(
        warehouseConnection?.type || WarehouseTypes.BIGQUERY,
    );
    const WarehouseForm = WarehouseTypeForms[type];
    const { isLoading, mutateAsync } = useUpdateWarehouseMutation(projectUuid);
    const { mutate: refreshServer } = useRefreshServer();
    const { track } = useTracking();

    const onSave = async (data: CreateWarehouseCredentials) => {
        await mutateAsync(data);
        track({
            name: EventName.UPDATE_WAREHOUSE_CONNECTION_BUTTON_CLICKED,
        });
        refreshServer();
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup label="Type" labelFor="warehouse-type">
                <HTMLSelect
                    id="warehouse-type"
                    fill
                    value={type}
                    onChange={(e) =>
                        setType(e.currentTarget.value as WarehouseTypes)
                    }
                    options={Object.entries(WarehouseTypeLabels).map(
                        ([value, label]) => ({
                            value,
                            label,
                        }),
                    )}
                    disabled={isLoading}
                />
            </FormGroup>
            <WarehouseForm
                loading={isLoading}
                onSave={onSave}
                values={
                    warehouseConnection?.type === type
                        ? (warehouseConnection as any)
                        : undefined
                }
            />
        </div>
    );
};

export default WarehouseSettingsForm;
