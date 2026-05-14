import {
    ActionIcon,
    Divider,
    Group,
    Pill,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { type useLogsFilters } from '../../features/scheduler/hooks/useLogsFilters';
import MantineIcon from '../common/MantineIcon';
import CreatedByFilter from './filters/CreatedByFilter';
import DestinationFilter from './filters/DestinationFilter';
import { SearchFilter } from './filters/SearchFilter';
import StatusFilter from './filters/StatusFilter';

type Scheduler = {
    schedulerUuid: string;
    name: string;
};

interface LogsTopToolbarProps extends Pick<
    ReturnType<typeof useLogsFilters>,
    | 'search'
    | 'setSearch'
    | 'selectedStatuses'
    | 'setSelectedStatuses'
    | 'selectedCreatedByUserUuids'
    | 'setSelectedCreatedByUserUuids'
    | 'selectedDestinations'
    | 'setSelectedDestinations'
    | 'selectedSchedulerUuid'
    | 'setSelectedSchedulerUuid'
    | 'hasActiveFilters'
    | 'resetFilters'
> {
    isFetching: boolean;
    currentResultsCount: number;
    availableSchedulers: Scheduler[];
    projectUuid?: string;
    /** Hide the active-scheduler pill (when the view is already scheduler-scoped) */
    hideSchedulerPill?: boolean;
    /** Hide the "Created by" filter (less useful in resource-scoped views) */
    hideCreatedByFilter?: boolean;
    /** Hide the search-by-scheduler-name input (e.g. when the Name column is hidden) */
    hideSearchFilter?: boolean;
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
        selectedSchedulerUuid,
        setSelectedSchedulerUuid,
        hasActiveFilters,
        resetFilters,
        availableSchedulers,
        projectUuid,
        hideSchedulerPill = false,
        hideCreatedByFilter = false,
        hideSearchFilter = false,
    }) => {
        const theme = useMantineTheme();

        const selectedScheduler = availableSchedulers.find(
            (s) => s.schedulerUuid === selectedSchedulerUuid,
        );

        return (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
            >
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {!hideSearchFilter && (
                        <>
                            <SearchFilter
                                search={search}
                                setSearch={setSearch}
                            />

                            <Divider
                                orientation="vertical"
                                w={1}
                                h={20}
                                style={{
                                    alignSelf: 'center',
                                }}
                            />
                        </>
                    )}

                    {!hideSchedulerPill && selectedScheduler && (
                        <>
                            <Text fz="sm" c="ldGray.7" fw={500}>
                                Scheduler:
                            </Text>
                            <Pill
                                withRemoveButton
                                onRemove={() => setSelectedSchedulerUuid('')}
                            >
                                {selectedScheduler.name}
                            </Pill>
                            <Divider
                                orientation="vertical"
                                w={1}
                                h={20}
                                style={{
                                    alignSelf: 'center',
                                }}
                            />
                        </>
                    )}

                    <StatusFilter
                        selectedStatuses={selectedStatuses}
                        setSelectedStatuses={setSelectedStatuses}
                    />

                    {!hideCreatedByFilter && (
                        <CreatedByFilter
                            projectUuid={projectUuid}
                            selectedCreatedByUserUuids={
                                selectedCreatedByUserUuids
                            }
                            setSelectedCreatedByUserUuids={
                                setSelectedCreatedByUserUuids
                            }
                        />
                    )}

                    <DestinationFilter
                        selectedDestinations={selectedDestinations}
                        setSelectedDestinations={setSelectedDestinations}
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
