import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';

/**
 * Shown when a connection filter matches no table. A connection with no dbt
 * source can never contribute one, and the panel would otherwise go blank.
 */
const ExploreListEmptyState: FC<{
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

export default ExploreListEmptyState;
