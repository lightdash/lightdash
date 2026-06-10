import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useState, type FC } from 'react';
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
            label="Deleted by"
            options={options}
            selected={selectedUserUuids}
            onChange={onSelectionChange}
            tooltipLabel="Filter by user who deleted the item"
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search users…"
            loading={isLoading}
            loadingMore={isFetching && !isLoading}
            onScrollEnd={handleScrollEnd}
            emptyLabel="No users found"
        />
    );
};
