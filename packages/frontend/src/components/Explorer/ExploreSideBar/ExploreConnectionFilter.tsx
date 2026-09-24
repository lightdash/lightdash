import { type WarehouseConnectionForUserCredentials } from '@lightdash/common';
import { Select, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

const ALL_CONNECTIONS = 'all';

export const ExploreConnectionFilter: FC<{
    connections: WarehouseConnectionForUserCredentials[];
    connectionFilter: string | null;
    onChange: (warehouseConnectionUuid: string | null) => void;
}> = ({ connections, connectionFilter, onChange }) => (
    <Select
        aria-label="Filter tables by connection"
        data={[
            { value: ALL_CONNECTIONS, label: 'All connections' },
            ...connections.map(({ warehouseConnectionUuid, name }) => ({
                value: warehouseConnectionUuid,
                label: name,
            })),
        ]}
        value={connectionFilter ?? ALL_CONNECTIONS}
        onChange={(value) =>
            onChange(value === null || value === ALL_CONNECTIONS ? null : value)
        }
        allowDeselect={false}
        searchable
    />
);

export const ExploreConnectionEmptyState: FC<{
    connectionName: string;
    isSearching: boolean;
}> = ({ connectionName, isSearching }) => (
    <Stack gap={4} px="xs" py="md">
        <Text fw={500} size="sm">
            {isSearching
                ? `No tables match your search on ${connectionName}`
                : `No tables on ${connectionName}`}
        </Text>
        <Text size="xs" c="dimmed">
            {isSearching
                ? 'Clear the search, or pick another connection.'
                : 'Nothing is modelled on this connection yet. Pick another connection to see its tables.'}
        </Text>
    </Stack>
);
