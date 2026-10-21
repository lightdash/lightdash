import { Select, Stack, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useTrackedConnectionSwitch } from '../hooks/useTrackedConnectionSwitch';

export const ConnectionPicker: FC = () => {
    const { connections, hasSeveralConnections, activeConnectionUuid } =
        useActiveConnection();
    const switchConnection = useTrackedConnectionSwitch();

    const data = useMemo(
        () =>
            connections.map((connection) => ({
                value: connection.warehouseConnectionUuid,
                label: connection.name,
                disabled: connection.canRunSql === false,
            })),
        [connections],
    );

    if (!hasSeveralConnections) return null;

    return (
        <Select
            size="sm"
            data={data}
            renderOption={({ option }) => (
                <Stack gap={0}>
                    <Text size="sm">{option.label}</Text>
                    {option.disabled && (
                        <Text size="xs" c="dimmed">
                            Reserved for a space you cannot edit
                        </Text>
                    )}
                </Stack>
            )}
            value={activeConnectionUuid ?? null}
            placeholder="Choose a connection"
            allowDeselect={false}
            aria-label="Active connection"
            leftSection={<MantineIcon icon={IconPlugConnected} />}
            onChange={(value) => {
                if (value) switchConnection(value, 'picker');
            }}
        />
    );
};
