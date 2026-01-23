import {
    Badge,
    Button,
    Checkbox,
    Loader,
    Popover,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import MantineIcon from '../../common/MantineIcon';
import classes from './FormatFilter.module.css';

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
    const hasSelectedUsers = selectedCreatedByUserUuids.length > 0;
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearchValue] = useDebouncedValue(searchValue, 300);
    const viewportRef = useRef<HTMLDivElement>(null);

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

    const organizationUsers = useMemo(() => {
        const allUsers =
            infiniteUsers?.pages.flatMap((page) => page.data) ?? [];
        // Deduplicate by userUuid
        const seen = new Set<string>();
        return allUsers.filter((user) => {
            if (seen.has(user.userUuid)) return false;
            seen.add(user.userUuid);
            return true;
        });
    }, [infiniteUsers]);

    const handleScrollPositionChange = useCallback(
        ({ y }: { x: number; y: number }) => {
            if (!viewportRef.current || isFetching || !hasNextPage) return;

            const { scrollHeight, clientHeight } = viewportRef.current;
            const isNearBottom = y >= scrollHeight - clientHeight - 50;

            if (isNearBottom) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, hasNextPage, isFetching],
    );

    const handleCheckboxChange = useCallback(
        (userUuid: string) => {
            if (selectedCreatedByUserUuids.includes(userUuid)) {
                setSelectedCreatedByUserUuids(
                    selectedCreatedByUserUuids.filter(
                        (uuid) => uuid !== userUuid,
                    ),
                );
            } else {
                setSelectedCreatedByUserUuids([
                    ...selectedCreatedByUserUuids,
                    userUuid,
                ]);
            }
        },
        [selectedCreatedByUserUuids, setSelectedCreatedByUserUuids],
    );

    return (
        <Popover width={280} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter by user who owns the scheduler"
                >
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelectedUsers
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedUsers ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                    styles={{
                                        root: {
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                        },
                                    }}
                                >
                                    {selectedCreatedByUserUuids.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Owner
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap="xs">
                    <Text fz="xs" c="ldGray.9" fw={600}>
                        Filter by owner:
                    </Text>

                    <TextInput
                        size="xs"
                        placeholder="Search users..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.currentTarget.value)}
                        leftSection={
                            <MantineIcon icon={IconSearch} size={14} />
                        }
                        rightSection={
                            isLoading || isFetching ? (
                                <Loader size="xs" />
                            ) : null
                        }
                    />

                    <ScrollArea.Autosize
                        mah={200}
                        type="always"
                        scrollbars="y"
                        viewportRef={viewportRef}
                        onScrollPositionChange={handleScrollPositionChange}
                    >
                        <Stack gap="xs">
                            {organizationUsers.length === 0 && !isLoading && (
                                <Text fz="xs" c="dimmed">
                                    No users found
                                </Text>
                            )}
                            {organizationUsers.map((user) => (
                                <Checkbox
                                    key={user.userUuid}
                                    label={getUserDisplayName(
                                        user.firstName,
                                        user.lastName,
                                        user.email,
                                    )}
                                    checked={selectedCreatedByUserUuids.includes(
                                        user.userUuid,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() =>
                                        handleCheckboxChange(user.userUuid)
                                    }
                                />
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default CreatedByFilter;
