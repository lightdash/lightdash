import { getWarehouseLocationLabels, WarehouseTypes } from '@lightdash/common';
import { Switch, TagsInput } from '@mantine/core';
import { type FC } from 'react';
import { useFormContext } from '../formContext';

type WarehouseDatabaseListingFieldsProps = {
    disabled: boolean;
    warehouseType: WarehouseTypes;
};

const WarehouseDatabaseListingFields: FC<
    WarehouseDatabaseListingFieldsProps
> = ({ disabled, warehouseType }) => {
    const form = useFormContext();
    const labels = getWarehouseLocationLabels(warehouseType);
    const unit =
        warehouseType === WarehouseTypes.ATHENA
            ? labels.schema.toLowerCase()
            : (labels.database ?? labels.schema).toLowerCase();
    const pluralUnit = unit === 'database' ? 'databases' : `${unit}s`;
    const listAllDatabases = form.values.warehouse.listAllDatabases ?? false;
    const listAllDescription =
        warehouseType === WarehouseTypes.ATHENA
            ? 'The SQL runner sidebar lists every database in the data catalog this connection can read, up to 100.'
            : `The SQL runner sidebar lists every ${unit} this connection can read, up to 100.`;
    const additionalDatabasesDescription =
        warehouseType === WarehouseTypes.ATHENA
            ? 'Other databases in this data catalog to show in the SQL runner sidebar.'
            : `Other ${pluralUnit} to show in the SQL runner sidebar.`;

    return (
        <>
            <Switch
                id="warehouse.listAllDatabases"
                name="warehouse.listAllDatabases"
                label="List all databases"
                description={listAllDescription}
                checked={listAllDatabases}
                onChange={(event) =>
                    form.setFieldValue(
                        'warehouse.listAllDatabases',
                        event.currentTarget.checked,
                    )
                }
                disabled={disabled}
            />
            <TagsInput
                id="warehouse.additionalDatabases"
                name="warehouse.additionalDatabases"
                label="Additional databases"
                description={additionalDatabasesDescription}
                placeholder="Type a database name and press Enter"
                {...form.getInputProps('warehouse.additionalDatabases')}
                disabled={disabled || listAllDatabases}
            />
        </>
    );
};

export default WarehouseDatabaseListingFields;
