import { type WarehouseConnectionForUserCredentials } from '@lightdash/common';
import { Select, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const ALL_CONNECTIONS = 'all';

export const ExploreConnectionFilter: FC<{
    connections: WarehouseConnectionForUserCredentials[];
    connectionFilter: string | null;
    onChange: (warehouseConnectionUuid: string | null) => void;
}> = ({ connections, connectionFilter, onChange }) => {
    const { t } = useTranslation('explorer');
    return (
        <Select
            aria-label={t('exploreSidebar.connectionFilter.label')}
            data={[
                {
                    value: ALL_CONNECTIONS,
                    label: t('exploreSidebar.connectionFilter.all'),
                },
                ...connections.map(({ warehouseConnectionUuid, name }) => ({
                    value: warehouseConnectionUuid,
                    label: name,
                })),
            ]}
            value={connectionFilter ?? ALL_CONNECTIONS}
            onChange={(value) =>
                onChange(
                    value === null || value === ALL_CONNECTIONS ? null : value,
                )
            }
            allowDeselect={false}
            searchable
        />
    );
};

export const ExploreConnectionEmptyState: FC<{
    connectionName: string;
    isSearching: boolean;
}> = ({ connectionName, isSearching }) => {
    const { t } = useTranslation('explorer');
    return (
        <Stack gap={4} px="xs" py="md">
            <Text fw={500} size="sm">
                {isSearching
                    ? t('exploreSidebar.connectionEmpty.noSearchMatches', {
                          connectionName,
                      })
                    : t('exploreSidebar.connectionEmpty.noTables', {
                          connectionName,
                      })}
            </Text>
            <Text size="xs" c="dimmed">
                {isSearching
                    ? t('exploreSidebar.connectionEmpty.clearSearchHint')
                    : t('exploreSidebar.connectionEmpty.nothingModelled')}
            </Text>
        </Stack>
    );
};
