import { ActionIcon, TextInput, Tooltip } from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import classes from './SearchFilter.module.css';

type SearchFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'search' | 'setSearch'
>;

export const SearchFilter = ({ search, setSearch }: SearchFilterProps) => {
    return (
        <Tooltip withinPortal variant="xs" label="Search by title">
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
                placeholder="Search threads by title"
                value={search ?? ''}
                leftSection={
                    <MantineIcon size="md" color="gray.6" icon={IconSearch} />
                }
                onChange={(e) => setSearch(e.target.value)}
                rightSection={
                    search && (
                        <ActionIcon
                            onClick={() => setSearch('')}
                            variant="transparent"
                            size="xs"
                            color="gray.5"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )
                }
            />
        </Tooltip>
    );
};
