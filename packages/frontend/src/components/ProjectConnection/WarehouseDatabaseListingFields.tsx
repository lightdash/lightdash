import { WarehouseTypes } from '@lightdash/common';
import { Stack, Switch, TagsInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export type WarehouseDatabaseListingValues = {
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

const WarehouseDatabaseListingFields: FC<{
    form: UseFormReturnType<WarehouseDatabaseListingValues>;
    warehouseType: WarehouseTypes;
    disabled: boolean;
}> = ({ form, warehouseType, disabled }) => {
    const { t } = useTranslation('projectConnection');
    const isAthena = warehouseType === WarehouseTypes.ATHENA;
    const listAllDatabases = form.values.listAllDatabases;

    return (
        <Stack gap="md">
            <Switch
                label={t('warehouseDatabaseListing.listAll')}
                description={
                    isAthena
                        ? t('warehouseDatabaseListing.listAllDescriptionAthena')
                        : t('warehouseDatabaseListing.listAllDescription')
                }
                disabled={disabled}
                {...form.getInputProps('listAllDatabases', {
                    type: 'checkbox',
                })}
            />
            <TagsInput
                label={t('warehouseDatabaseListing.additional')}
                description={
                    isAthena
                        ? t(
                              'warehouseDatabaseListing.additionalDescriptionAthena',
                          )
                        : t('warehouseDatabaseListing.additionalDescription')
                }
                placeholder={t(
                    'warehouseDatabaseListing.additionalPlaceholder',
                )}
                disabled={disabled || listAllDatabases}
                {...form.getInputProps('additionalDatabases')}
            />
        </Stack>
    );
};

export default WarehouseDatabaseListingFields;
