import { Group, Loader, Select, Stack, Text } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { LightdashUserAvatar } from '../../Avatar';
import { DEFAULT_PAGE_SIZE } from '../Table/constants';

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

type UserSelectProps = {
    value: string | null;
    onChange: (value: string | null) => void;
    excludedUserUuid?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
};

export const UserSelect: FC<UserSelectProps> = ({
    value,
    onChange,
    excludedUserUuid,
    label,
    placeholder = 'Search for a user...',
    disabled = false,
}) => {
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearchValue] = useDebouncedValue(searchValue, 300);
    const viewportRef = useRef<HTMLDivElement>(null);

    const {
        data: infiniteUsers,
        isLoading: isLoadingUsers,
        isFetching: isFetchingUsers,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteOrganizationUsers(
        {
            searchInput: debouncedSearchValue,
            pageSize: DEFAULT_PAGE_SIZE,
        },
        { keepPreviousData: true },
    );

    const organizationUsers = useMemo(
        () => infiniteUsers?.pages.flatMap((page) => page.data) ?? [],
        [infiniteUsers],
    );

    const eligibleUsers = useMemo(() => {
        if (!organizationUsers) return [];
        if (!excludedUserUuid) return organizationUsers;
        return organizationUsers.filter(
            (user) => user.userUuid !== excludedUserUuid,
        );
    }, [organizationUsers, excludedUserUuid]);

    const usersMap = useMemo(() => {
        return new Map(
            eligibleUsers.map((user) => [
                user.userUuid,
                {
                    name: getUserDisplayName(
                        user.firstName,
                        user.lastName,
                        user.email,
                    ),
                    email: user.email,
                },
            ]),
        );
    }, [eligibleUsers]);

    const selectData = useMemo(() => {
        return eligibleUsers.map((user) => ({
            value: user.userUuid,
            label: getUserDisplayName(
                user.firstName,
                user.lastName,
                user.email,
            ),
        }));
    }, [eligibleUsers]);

    const handleScrollPositionChange = useCallback(
        ({ y }: { x: number; y: number }) => {
            if (!viewportRef.current || isFetchingUsers || !hasNextPage) return;

            const { scrollHeight, clientHeight } = viewportRef.current;
            const isNearBottom = y >= scrollHeight - clientHeight - 50;

            if (isNearBottom) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, hasNextPage, isFetchingUsers],
    );

    const handleChange = useCallback(
        (newValue: string | null) => {
            onChange(newValue);
            setSearchValue('');
        },
        [onChange],
    );

    return (
        <Select
            label={label}
            placeholder={placeholder}
            searchable
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            value={value}
            onChange={handleChange}
            data={selectData}
            nothingFoundMessage="No users found"
            maxDropdownHeight={250}
            disabled={disabled}
            rightSection={
                isLoadingUsers || isFetchingUsers ? <Loader size="xs" /> : null
            }
            scrollAreaProps={{
                viewportRef,
                onScrollPositionChange: handleScrollPositionChange,
            }}
            renderOption={({ option }) => {
                const userData = usersMap.get(option.value);
                if (!userData) return option.label;

                return (
                    <Group gap="sm" wrap="nowrap">
                        <LightdashUserAvatar name={userData.name} size="sm" />
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>
                                {userData.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {userData.email}
                            </Text>
                        </Stack>
                    </Group>
                );
            }}
        />
    );
};
