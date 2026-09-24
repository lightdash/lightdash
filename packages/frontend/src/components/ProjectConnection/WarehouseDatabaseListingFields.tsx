import { WarehouseTypes } from '@lightdash/common';
import { Stack, Switch, TagsInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';

export type WarehouseDatabaseListingValues = {
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

const WarehouseDatabaseListingFields: FC<{
    form: UseFormReturnType<WarehouseDatabaseListingValues>;
    warehouseType: WarehouseTypes;
    disabled: boolean;
}> = ({ form, warehouseType, disabled }) => {
    const isAthena = warehouseType === WarehouseTypes.ATHENA;
    const listAllDatabases = form.values.listAllDatabases;

    return (
        <Stack gap="md">
            <Switch
                label="List all databases"
                description={
                    isAthena
                        ? 'The SQL runner sidebar lists every database in the data catalog this connection can read, up to 100.'
                        : 'The SQL runner sidebar lists every database this connection can read, up to 100.'
                }
                disabled={disabled}
                {...form.getInputProps('listAllDatabases', {
                    type: 'checkbox',
                })}
            />
            <TagsInput
                label="Additional databases"
                description={
                    isAthena
                        ? 'Other databases in this data catalog to show in the SQL runner sidebar.'
                        : 'Other databases to show in the SQL runner sidebar.'
                }
                placeholder="Type a database name and press Enter"
                disabled={disabled || listAllDatabases}
                {...form.getInputProps('additionalDatabases')}
            />
        </Stack>
    );
};

export default WarehouseDatabaseListingFields;
