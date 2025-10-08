import {
    ActionIcon,
    Divider,
    Group,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import {
    type DestinationType,
    type useLogsFilters,
} from '../../features/scheduler/hooks/useLogsFilters';
import MantineIcon from '../common/MantineIcon';
import CreatedByFilter from './filters/CreatedByFilter';
import DestinationFilter from './filters/DestinationFilter';
import { SearchFilter } from './filters/SearchFilter';
import StatusFilter from './filters/StatusFilter';

type User = {
    userUuid: string;
    firstName: string;
    lastName: string;
};

interface LogsTopToolbarProps
    extends Pick<
        ReturnType<typeof useLogsFilters>,
        | 'search'
        | 'setSearch'
        | 'selectedStatuses'
        | 'setSelectedStatuses'
        | 'selectedCreatedByUserUuids'
        | 'setSelectedCreatedByUserUuids'
        | 'selectedDestinations'
        | 'setSelectedDestinations'
        | 'hasActiveFilters'
        | 'resetFilters'
    > {
    isFetching: boolean;
    currentResultsCount: number;
    availableUsers: User[];
    availableDestinations: DestinationType[];
}

export const LogsTopToolbar: FC<LogsTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        selectedStatuses,
        setSelectedStatuses,
        selectedCreatedByUserUuids,
        setSelectedCreatedByUserUuids,
        selectedDestinations,
        setSelectedDestinations,
        hasActiveFilters,
        resetFilters,
        availableUsers,
        availableDestinations,
    }) => {
        const theme = useMantineTheme();

        return (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
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

                    <StatusFilter
                        selectedStatuses={selectedStatuses}
                        setSelectedStatuses={setSelectedStatuses}
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

                {hasActiveFilters && (
                    <Tooltip label="Clear all filters">
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="gray"
                            onClick={resetFilters}
                            style={{ flexShrink: 0 }}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        );
    },
);

LogsTopToolbar.displayName = 'LogsTopToolbar';
