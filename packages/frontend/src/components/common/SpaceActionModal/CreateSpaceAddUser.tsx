import { Classes } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemPredicate, ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import {
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
} from '@lightdash/common';
import { Group } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import {
    PrimaryAndSecondaryTextWrapper,
    PrimaryText,
    SecondaryText,
    UserCircle,
} from '../ShareSpaceModal/ShareSpaceModal.style';
import { getInitials, getUserNameOrEmail } from '../ShareSpaceModal/Utils';

interface CreateSpaceAddUserProps {
    projectUuid: string;
    form?: UseFormReturnType<Space>;
}

export const CreateSpaceAddUser: FC<CreateSpaceAddUserProps> = ({
    projectUuid,
    form,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();

    const { data: organizationUsers } = useOrganizationUsers();

    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const { data: projectAccess } = useProjectAccess(projectUuid);

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

    useEffect(() => {
        form?.setValues({
            access: usersSelected.map((userUuid) => ({
                userUuid: userUuid,
                firstName: '',
                lastName: '',
                role: ProjectMemberRole.VIEWER,
            })),
        });
    }, [form, usersSelected]);
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

            const isSelected = usersSelected.includes(userUuid);
            const isDisabled =
                isAdmin || sessionUser?.userUuid === user.userUuid;
            return (
                <MenuItem2
                    className={isSelected ? Classes.SELECTED : undefined}
                    key={user.userUuid}
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
        [
            organizationUsers,
            usersSelected,
            sessionUser?.userUuid,
            projectAccess,
        ],
    );

    return (
        <Group>
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
        </Group>
    );
};
