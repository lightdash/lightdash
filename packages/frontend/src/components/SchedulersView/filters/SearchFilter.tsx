import { ActionIcon, TextInput, Tooltip } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../../common/MantineIcon';
import classes from './SearchFilter.module.css';

type SearchFilterProps =
    | Pick<ReturnType<typeof useSchedulerFilters>, 'search' | 'setSearch'>
    | Pick<ReturnType<typeof useLogsFilters>, 'search' | 'setSearch'>;

export const SearchFilter = ({ search, setSearch }: SearchFilterProps) => {
    const { t } = useTranslation('scheduler');
    return (
        <Tooltip label={t('filters.search.tooltip')}>
            <TextInput
                size="xs"
                classNames={{
                    input: search
                        ? classes.searchInputWithValue
                        : classes.searchInput,
                }}
                type="search"
                variant="default"
                placeholder={t('filters.search.placeholder')}
                value={search ?? ''}
                leftSection={
                    <MantineIcon size="md" color="dimmed" icon={IconSearch} />
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
                miw={{ base: 0, sm: 200 }}
                maw={350}
                w={{ base: '100%', sm: 309 }}
                flex={{ base: '1 0 100%', sm: '0 1 auto' }}
            />
        </Tooltip>
    );
};
