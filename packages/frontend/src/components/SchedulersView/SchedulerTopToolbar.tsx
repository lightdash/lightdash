import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Text,
    Tooltip,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconTrash, IconUserEdit } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import {
    type DestinationType,
    type useSchedulerFilters,
} from '../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../common/MantineIcon';
import CreatedByFilter from './filters/CreatedByFilter';
import DestinationFilter from './filters/DestinationFilter';
import FormatFilter from './filters/FormatFilter';
import { ResourceTypeFilter } from './filters/ResourceTypeFilter';
import { SearchFilter } from './filters/SearchFilter';

type User = {
    userUuid: string;
    name: string;
};

type SchedulerTopToolbarProps = GroupProps &
    Pick<
        ReturnType<typeof useSchedulerFilters>,
        | 'search'
        | 'selectedFormats'
        | 'selectedResourceType'
        | 'selectedCreatedByUserUuids'
        | 'selectedDestinations'
        | 'setSearch'
        | 'setSelectedFormats'
        | 'setSelectedResourceType'
        | 'setSelectedCreatedByUserUuids'
        | 'setSelectedDestinations'
    > & {
        isFetching: boolean;
        currentResultsCount: number;
        hasActiveFilters?: boolean;
        onClearFilters?: () => void;
        availableUsers: User[];
        availableDestinations: DestinationType[];
        // Bulk selection props
        selectedCount?: number;
        onBulkReassign?: () => void;
    };

export const SchedulerTopToolbar: FC<SchedulerTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        selectedFormats,
        setSelectedFormats,
        selectedResourceType,
        setSelectedResourceType,
        selectedCreatedByUserUuids,
        setSelectedCreatedByUserUuids,
        selectedDestinations,
        setSelectedDestinations,
        isFetching,
        currentResultsCount,
        hasActiveFilters,
        onClearFilters,
        availableUsers,
        availableDestinations,
        selectedCount = 0,
        onBulkReassign,
        ...props
    }) => {
        const theme = useMantineTheme();
        const hasSelection = selectedCount > 0;

        return (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
                {...props}
            >
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <SearchFilter search={search} setSearch={setSearch} />

                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{
                            alignSelf: 'center',
                        }}
                    />

                    <ResourceTypeFilter
                        selectedResourceType={selectedResourceType}
                        setSelectedResourceType={setSelectedResourceType}
                    />

                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{
                            alignSelf: 'center',
                        }}
                    />

                    <FormatFilter
                        selectedFormats={selectedFormats}
                        setSelectedFormats={setSelectedFormats}
                    />

                    <CreatedByFilter
                        availableUsers={availableUsers}
                        selectedCreatedByUserUuids={selectedCreatedByUserUuids}
                        setSelectedCreatedByUserUuids={
                            setSelectedCreatedByUserUuids
                        }
                    />

                    <DestinationFilter
                        selectedDestinations={selectedDestinations}
                        setSelectedDestinations={setSelectedDestinations}
                        availableDestinations={availableDestinations}
                    />
                </Group>

                <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                    {hasSelection && onBulkReassign && (
                        <>
                            <Text size="sm" c="dimmed">
                                {selectedCount}{' '}
                                {selectedCount === 1 ? 'selected' : 'selected'}
                            </Text>
                            <Button
                                size="xs"
                                variant="light"
                                leftSection={
                                    <MantineIcon icon={IconUserEdit} />
                                }
                                onClick={onBulkReassign}
                            >
                                Reassign owner
                            </Button>
                        </>
                    )}
                    {hasActiveFilters && onClearFilters && !hasSelection && (
                        <Tooltip label="Clear all filters">
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                color="gray"
                                onClick={onClearFilters}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Group>
        );
    },
);

SchedulerTopToolbar.displayName = 'SchedulerTopToolbar';
