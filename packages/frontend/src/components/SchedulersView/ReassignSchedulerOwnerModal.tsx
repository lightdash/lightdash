import {
    Button,
    Group,
    Loader,
    Modal,
    Select,
    Stack,
    Text,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useSchedulerReassignOwnerMutation } from '../../features/scheduler/hooks/useSchedulerReassignOwnerMutation';
import { useInfiniteOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { LightdashUserAvatar } from '../Avatar';
import { DEFAULT_PAGE_SIZE } from '../common/Table/constants';

type ReassignSchedulerOwnerModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    schedulerUuids: string[];
    excludedUserUuid?: string;
    onSuccess?: () => void;
};

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

const ReassignSchedulerOwnerModal: FC<ReassignSchedulerOwnerModalProps> = ({
    opened,
    onClose,
    projectUuid,
    schedulerUuids,
    excludedUserUuid,
    onSuccess,
}) => {
    const [selectedUserUuid, setSelectedUserUuid] = useState<string | null>(
        null,
    );
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

    const { mutate: reassignOwner, isLoading: isReassigning } =
        useSchedulerReassignOwnerMutation(projectUuid);

    // Filter out the excluded user (current owner for single selection)
    const eligibleUsers = useMemo(() => {
        if (!organizationUsers) return [];
        return organizationUsers.filter(
            (user) => user.userUuid !== excludedUserUuid,
        );
    }, [organizationUsers, excludedUserUuid]);

    // Store user data in a map for lookup
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

    // Convert to Select data format
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

    const handleClose = useCallback(() => {
        setSelectedUserUuid(null);
        setSearchValue('');
        onClose();
    }, [onClose]);

    const handleConfirm = useCallback(() => {
        if (!selectedUserUuid) return;

        reassignOwner(
            {
                schedulerUuids,
                newOwnerUserUuid: selectedUserUuid,
            },
            {
                onSuccess: () => {
                    handleClose();
                    onSuccess?.();
                },
            },
        );
    }, [
        selectedUserUuid,
        reassignOwner,
        schedulerUuids,
        handleClose,
        onSuccess,
    ]);

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

    const schedulerCount = schedulerUuids.length;
    const schedulerText =
        schedulerCount === 1
            ? '1 scheduled delivery'
            : `${schedulerCount} scheduled deliveries`;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={`Reassign owner for ${schedulerText}`}
            size="md"
        >
            <Stack gap="lg">
                <Text fz="sm" c="ldGray.7">
                    Select a new owner for the selected scheduled{' '}
                    {schedulerCount === 1 ? 'delivery' : 'deliveries'}. The new
                    owner will be responsible for managing{' '}
                    {schedulerCount === 1 ? 'it' : 'them'}.
                </Text>

                <Select
                    label="New owner"
                    placeholder="Search for a user..."
                    searchable
                    searchValue={searchValue}
                    onSearchChange={setSearchValue}
                    value={selectedUserUuid}
                    onChange={setSelectedUserUuid}
                    data={selectData}
                    nothingFoundMessage="No users found"
                    maxDropdownHeight={250}
                    rightSection={
                        isLoadingUsers || isFetchingUsers ? (
                            <Loader size="xs" />
                        ) : null
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
                                <LightdashUserAvatar
                                    name={userData.name}
                                    size="sm"
                                />
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

                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        loading={isReassigning}
                        disabled={!selectedUserUuid}
                    >
                        Reassign
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default ReassignSchedulerOwnerModal;
