import { Group, Select, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { isProtoMultiConnectionEnabled } from './protoConnections';
import { useProtoConnections } from './protoConnectionState';

const ProtoConnectionPicker: FC = () => {
    const { connections, activeConnection, selectConnection } =
        useProtoConnections();

    const data = useMemo(
        () =>
            connections.map((connection) => ({
                value: connection.id,
                label: connection.name,
            })),
        [connections],
    );

    return (
        <Group gap="xs" wrap="nowrap" data-proto="connection-picker">
            <Text fz="xs" c="dimmed">
                Connection
            </Text>
            <Select
                size="xs"
                w={260}
                data={data}
                value={activeConnection.id}
                allowDeselect={false}
                leftSection={<MantineIcon icon={IconPlugConnected} />}
                onChange={(value) => {
                    if (value) selectConnection(value);
                }}
            />
        </Group>
    );
};

export const ProtoConnectionPickerSlot: FC = () =>
    isProtoMultiConnectionEnabled ? <ProtoConnectionPicker /> : null;
