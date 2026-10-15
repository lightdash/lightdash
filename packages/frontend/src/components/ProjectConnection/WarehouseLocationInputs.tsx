import {
    getWarehouseLocation,
    getWarehouseLocationLabels,
} from '@lightdash/common';
import { Group, Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/useProject';
import { useFormContext } from './formContext';

const WarehouseLocationInputs: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const { data: project } = useProject(projectUuid);
    const warehouseConnection = project?.warehouseConnection;
    if (!warehouseConnection) {
        return null;
    }
    const labels = getWarehouseLocationLabels(warehouseConnection.type);
    const inherited = getWarehouseLocation(warehouseConnection);

    return (
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                {t('warehouseLocation.title')}
            </Text>
            <Text size="xs" c="dimmed">
                {labels.database
                    ? t('warehouseLocation.descriptionWithDatabase', {
                          database: labels.database.toLowerCase(),
                          schema: labels.schema.toLowerCase(),
                      })
                    : t('warehouseLocation.description', {
                          schema: labels.schema.toLowerCase(),
                      })}
            </Text>
            <Group grow align="flex-start">
                {labels.database && (
                    <TextInput
                        label={labels.database}
                        placeholder={inherited.database ?? undefined}
                        {...form.getInputProps('warehouseLocation.database')}
                    />
                )}
                <TextInput
                    label={labels.schema}
                    placeholder={inherited.schema ?? undefined}
                    {...form.getInputProps('warehouseLocation.schema')}
                />
            </Group>
        </Stack>
    );
};

export default WarehouseLocationInputs;
