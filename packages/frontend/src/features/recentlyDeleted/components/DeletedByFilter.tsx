import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../components/common/FilterFacet';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';

const getUserDisplayName = (
    firstName: string | undefined,
    lastName: string | undefined,
    email: string,
): string => {
    if (firstName && lastName) {
        return `${firstName} ${lastName}`;
    }
    return email;
};

interface DeletedByFilterProps {
    projectUuid: string;
    selectedUserUuids: string[];
    onSelectionChange: (userUuids: string[]) => void;
}

export const DeletedByFilter: FC<DeletedByFilterProps> = ({
    projectUuid,
    selectedUserUuids,
    onSelectionChange,
}) => {
    const { t } = useTranslation('settings');
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearchValue] = useDebouncedValue(searchValue, 300);

    const {
        data: infiniteUsers,
        isLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteOrganizationUsers(
        {
            searchInput: debouncedSearchValue,
            pageSize: 25,
            projectUuid,
        },
        { keepPreviousData: true },
    );

    const options = useMemo<FilterFacetOption[]>(() => {
        const allUsers =
            infiniteUsers?.pages.flatMap((page) => page.data) ?? [];
        const seen = new Set<string>();
        return allUsers
            .filter((user) => {
                if (seen.has(user.userUuid)) return false;
                seen.add(user.userUuid);
                return true;
            })
            .map((user) => ({
                value: user.userUuid,
                label: getUserDisplayName(
                    user.firstName,
                    user.lastName,
                    user.email,
                ),
            }));
    }, [infiniteUsers]);

    const handleScrollEnd = useCallback(() => {
        if (isFetching || !hasNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetching]);

    return (
        <FilterFacet
            label={t('recentlyDeleted.filters.deletedBy')}
            options={options}
            selected={selectedUserUuids}
            onChange={onSelectionChange}
            tooltipLabel={t('recentlyDeleted.filters.deletedByTooltip')}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={t('recentlyDeleted.filters.searchUsers')}
            loading={isLoading}
            loadingMore={isFetching && !isLoading}
            onScrollEnd={handleScrollEnd}
            emptyLabel={t('recentlyDeleted.filters.noUsers')}
        />
    );
};
