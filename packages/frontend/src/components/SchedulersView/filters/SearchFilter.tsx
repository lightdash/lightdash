import { ActionIcon, TextInput, Tooltip } from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../../common/MantineIcon';
import classes from './SearchFilter.module.css';

type SearchFilterProps =
    | Pick<ReturnType<typeof useSchedulerFilters>, 'search' | 'setSearch'>
    | Pick<ReturnType<typeof useLogsFilters>, 'search' | 'setSearch'>;

export const SearchFilter = ({ search, setSearch }: SearchFilterProps) => {
    return (
        <Tooltip withinPortal variant="xs" label="Search by scheduler name">
            <TextInput
                size="xs"
                radius="md"
                classNames={{
                    input: search
                        ? classes.searchInputWithValue
                        : classes.searchInput,
                }}
                type="search"
                variant="default"
                placeholder="Search schedulers by name"
                value={search ?? ''}
                leftSection={
                    <MantineIcon size="md" color="ldGray.6" icon={IconSearch} />
                }
                onChange={(e) => setSearch(e.target.value)}
                rightSection={
                    search && (
                        <ActionIcon
                            onClick={() => setSearch('')}
                            variant="transparent"
                            size="xs"
                            color="ldGray.5"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )
                }
                style={{ minWidth: 200, maxWidth: 350, flexShrink: 1 }}
            />
        </Tooltip>
    );
};
