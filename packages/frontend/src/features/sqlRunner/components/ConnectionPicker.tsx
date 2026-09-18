import { Group, Select, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useActiveConnection } from '../hooks/useActiveConnection';

/**
 * Picks the connection the SQL runner sends typed SQL to. Hidden while the
 * project has one connection, which is every project until a second is added.
 * With several connections it always renders, including before one is chosen:
 * it is the only way to choose.
 */
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
                value: connection.connectionUuid,
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
                w={220}
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
