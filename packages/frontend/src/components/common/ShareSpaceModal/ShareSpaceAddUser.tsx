import { Classes } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemPredicate, ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
} from '@lightdash/common';
import {
    Avatar,
    Button,
    Group,
    MultiSelect,
    SelectItem,
    Text,
} from '@mantine/core';
import { FC, forwardRef, useCallback, useMemo, useState } from 'react';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
import {
    PrimaryAndSecondaryTextWrapper,
    PrimaryText,
    SecondaryText,
    UserCircle,
} from './ShareSpaceModal.style';
import { getInitials, getUserNameOrEmail } from './Utils';

interface ShareSpaceAddUserProps {
    space: Space;
    projectUuid: string;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

export const ShareSpaceAddUser: FC<ShareSpaceAddUserProps> = ({
    space,
    projectUuid,
    organizationUsers,
}) => {
    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const { data: projectAccess } = useProjectAccess(projectUuid);

    const { mutateAsync: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const userUuids: string[] = useMemo(() => {
        if (organizationUsers === undefined) return [];
        const projectUserUuids =
            projectAccess?.map((project) => project.userUuid) || [];
        const orgUserUuids = organizationUsers
            .filter((user) => user.role !== OrganizationMemberRole.MEMBER)
            .map((user) => user.userUuid);
        return [...new Set([...projectUserUuids, ...orgUserUuids])];
    }, [organizationUsers, projectAccess]);

    const filterUser: ItemPredicate<string> = useCallback(
        (query, userUuid, _index) => {
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return false;
            const normalizedQuery = query.toLowerCase();

            return (
                `${user.firstName} ${user.lastName} ${user.email}`
                    .toLowerCase()
                    .indexOf(normalizedQuery) >= 0
            );
        },
        [organizationUsers],
    );

    const handleRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            setUsersSelected(
                usersSelected.filter(
                    (userUuid) =>
                        getUserNameOrEmail(userUuid, organizationUsers) !==
                        selectedValue,
                ),
            );
        },
        [usersSelected, organizationUsers],
    );

    const renderUserShare: ItemRenderer<string> = useCallback(
        (userUuid, { modifiers, handleClick }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return null;

            const projectUser = projectAccess?.find(
                (pUser) => pUser.userUuid === userUuid,
            );
            const isAdmin =
                user.role === OrganizationMemberRole.ADMIN ||
                projectUser?.role === ProjectMemberRole.ADMIN;
            const isDisabled =
                isAdmin ||
                space.access
                    ?.map((access) => access.userUuid)
                    .includes(userUuid);

            const isSelected = usersSelected.includes(userUuid) && !isDisabled;

            return (
                <MenuItem2
                    className={isSelected ? Classes.SELECTED : undefined}
                    key={user.userUuid}
                    title={
                        isDisabled
                            ? 'This user already has access to the space'
                            : ''
                    }
                    disabled={isDisabled}
                    text={
                        <Group key={user.userUuid}>
                            <UserCircle>
                                {getInitials(user.userUuid, organizationUsers)}
                            </UserCircle>

                            <PrimaryAndSecondaryTextWrapper
                                $disabled={isDisabled}
                            >
                                {user.firstName || user.lastName ? (
                                    <>
                                        <PrimaryText $selected={isSelected}>
                                            {user.firstName} {user.lastName}
                                        </PrimaryText>

                                        <SecondaryText>
                                            {user.email}
                                        </SecondaryText>
                                    </>
                                ) : (
                                    <PrimaryText $selected={isSelected}>
                                        {user.email}
                                    </PrimaryText>
                                )}
                            </PrimaryAndSecondaryTextWrapper>
                        </Group>
                    }
                    onClick={(e) => {
                        // Toggle user selected if selected
                        if (usersSelected.includes(user.userUuid))
                            setUsersSelected(
                                usersSelected.filter(
                                    (uuid) => uuid !== user.userUuid,
                                ),
                            );
                        else handleClick(e);

                        setSearchQuery('');
                    }}
                    shouldDismissPopover={false}
                />
            );
        },
        [usersSelected, space, organizationUsers, projectAccess],
    );

    const UserItemComponent = useMemo(() => {
        return forwardRef<HTMLDivElement, SelectItem>((props, ref) => {
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === props.value,
            );

            if (!user) return null;

            return (
                <Group ref={ref} {...props}>
                    <Avatar radius="xl">
                        {getInitials(user.userUuid, organizationUsers)}
                    </Avatar>

                    <PrimaryAndSecondaryTextWrapper>
                        {user.firstName || user.lastName ? (
                            <>
                                <Text fw={500}>
                                    {user.firstName} {user.lastName}
                                </Text>

                                <Text color="dimmed">{user.email}</Text>
                            </>
                        ) : (
                            <Text>{user.email}</Text>
                        )}
                    </PrimaryAndSecondaryTextWrapper>
                </Group>
            );
        });
    }, [organizationUsers]);

    return (
        <Group>
            <div style={{ width: '100%' }}>
                <MultiSelect2
                    fill
                    itemPredicate={filterUser}
                    itemRenderer={renderUserShare}
                    items={userUuids || []}
                    noResults={<MenuItem2 disabled text="No suggestions." />}
                    onItemSelect={(select) => {
                        setUsersSelected([...usersSelected, select]);
                        setSearchQuery('');
                    }}
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    tagRenderer={(userUuid) =>
                        getUserNameOrEmail(userUuid, organizationUsers)
                    }
                    resetOnQuery={true}
                    popoverProps={{
                        minimal: true,
                        matchTargetWidth: true,
                        onClosing: () => setSearchQuery(''),
                    }}
                    tagInputProps={{
                        placeholder: 'Start typing to search for users...',
                        addOnBlur: false,
                        tagProps: {
                            minimal: true,
                        },
                        onRemove: (e) => {
                            setSearchQuery('');
                            handleRemove(e);
                        },
                    }}
                    selectedItems={usersSelected}
                />

                <MultiSelect
                    searchable
                    clearable
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    clearSearchOnChange
                    clearSearchOnBlur
                    placeholder="Start typing to search for users..."
                    nothingFound="No users found"
                    value={usersSelected}
                    onChange={setUsersSelected}
                    data={userUuids
                        .map((userUuid): SelectItem | null => {
                            const projectUser = projectAccess?.find(
                                (pUser) => pUser.userUuid === userUuid,
                            );

                            const user = organizationUsers?.find(
                                (userAccess) =>
                                    userAccess.userUuid === userUuid,
                            );

                            if (!user) return null;

                            const isAdmin =
                                user.role === OrganizationMemberRole.ADMIN ||
                                projectUser?.role === ProjectMemberRole.ADMIN;

                            return {
                                value: userUuid,
                                label: getUserNameOrEmail(
                                    userUuid,
                                    organizationUsers,
                                ),
                                disabled:
                                    isAdmin ||
                                    space.access
                                        ?.map((access) => access.userUuid)
                                        .includes(userUuid),
                            };
                        })
                        .filter((item): item is SelectItem => item !== null)}
                    itemComponent={UserItemComponent}
                />
            </div>

            <Button
                disabled={usersSelected.length === 0}
                onClick={async () => {
                    for (const userUuid of usersSelected) {
                        if (userUuid) await shareSpaceMutation(userUuid);
                    }
                    setUsersSelected([]);
                }}
            >
                Share
            </Button>
        </Group>
    );
};
