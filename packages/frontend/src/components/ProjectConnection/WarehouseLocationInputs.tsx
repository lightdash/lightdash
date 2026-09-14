import {
    getWarehouseLocation,
    getWarehouseLocationLabels,
} from '@lightdash/common';
import { Group, Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useProject } from '../../hooks/useProject';
import { useFormContext } from './formContext';

const WarehouseLocationInputs: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
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
                Where this source's models live
            </Text>
            <Text size="xs" c="dimmed">
                Leave blank to use the project's warehouse connection. Set these
                when this dbt project's own profile targets a different{' '}
                {labels.database
                    ? `${labels.database.toLowerCase()} or ${labels.schema.toLowerCase()}`
                    : labels.schema.toLowerCase()}
                .
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
