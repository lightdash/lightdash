import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

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

interface CreatedByFilterProps {
    projectUuid?: string;
    selectedCreatedByUserUuids: string[];
    setSelectedCreatedByUserUuids: (userUuids: string[]) => void;
}

const CreatedByFilter: FC<CreatedByFilterProps> = ({
    projectUuid,
    selectedCreatedByUserUuids,
    setSelectedCreatedByUserUuids,
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
            label="Owner"
            options={options}
            selected={selectedCreatedByUserUuids}
            onChange={setSelectedCreatedByUserUuids}
            tooltipLabel="Filter by user who owns the scheduler"
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

export default CreatedByFilter;
