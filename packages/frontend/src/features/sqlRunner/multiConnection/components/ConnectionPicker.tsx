import { Group, Select, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useActiveConnection } from '../hooks/useActiveConnection';

export const ConnectionPicker: FC = () => {
    const {
        connections,
        hasSeveralConnections,
        activeConnectionUuid,
        switchConnection,
    } = useActiveConnection();

    const data = useMemo(
        () =>
            connections.map((connection) => ({
                value: connection.warehouseConnectionUuid,
                label: connection.name,
            })),
        [connections],
    );

    if (!hasSeveralConnections) return null;

    return (
        <Group gap="xs" wrap="nowrap">
            <Text fz="xs" c="dimmed">
                Connection
            </Text>
            <Select
                size="xs"
                flex={1}
                data={data}
                value={activeConnectionUuid ?? null}
                placeholder="Choose a connection"
                allowDeselect={false}
                aria-label="Active connection"
                leftSection={<MantineIcon icon={IconPlugConnected} />}
                onChange={(value) => {
                    if (value) switchConnection(value);
                }}
            />
        </Group>
    );
};
