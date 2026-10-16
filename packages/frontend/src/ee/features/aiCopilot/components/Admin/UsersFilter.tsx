import { useDebouncedValue } from '@mantine/hooks';
import { IconUser } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { useInfiniteOrganizationUsers } from '../../../../../hooks/useOrganizationUsers';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type UsersFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedUserUuids' | 'setSelectedUserUuids'
>;

const getUserDisplayName = (
    firstName: string | undefined,
    lastName: string | undefined,
    email: string,
) => {
    const name = [firstName, lastName].filter(Boolean).join(' ');
    return name || email;
};

const UsersFilter: FC<UsersFilterProps> = ({
    selectedUserUuids,
    setSelectedUserUuids,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearchValue] = useDebouncedValue(searchValue, 300);
    const { data, isLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteOrganizationUsers(
            {
                searchInput: debouncedSearchValue,
                pageSize: 25,
            },
            { keepPreviousData: true },
        );

    const options = useMemo<FilterFacetOption[]>(() => {
        const users = data?.pages.flatMap((page) => page.data) ?? [];
        const seen = new Set<string>();

        return users
            .filter((user) => {
                if (seen.has(user.userUuid)) return false;
                seen.add(user.userUuid);
                return true;
            })
            .map((user) => {
                const displayName = getUserDisplayName(
                    user.firstName,
                    user.lastName,
                    user.email,
                );
                return {
                    value: user.userUuid,
                    label: displayName,
                    searchLabel: `${displayName} ${user.email}`,
                };
            });
    }, [data]);

    const handleScrollEnd = useCallback(() => {
        if (isFetching || !hasNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetching]);

    return (
        <FilterFacet
            label={t('filters.users.label')}
            icon={IconUser}
            options={options}
            selected={selectedUserUuids}
            onChange={setSelectedUserUuids}
            tooltipLabel={t('filters.users.tooltip')}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={t('filters.users.searchPlaceholder')}
            loading={isLoading}
            loadingMore={isFetching && !isLoading}
            onScrollEnd={handleScrollEnd}
            enableSelectAll
            emptyLabel={t('filters.users.empty')}
        />
    );
};

export default UsersFilter;
