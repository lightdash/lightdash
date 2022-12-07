import { Classes, Label } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemPredicate, ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import { OrganizationMemberRole, Space } from '@lightdash/common';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import {
    FlexWrapper,
    PrimaryAndSecondaryTextWrapper,
    PrimaryText,
    SecondaryText,
    UserCircle,
} from '../ShareSpaceModal/ShareSpaceModal.style';
import { getInitials, getUserNameOrEmail } from '../ShareSpaceModal/Utils';

interface CreateSpaceAddUserProps {
    projectUuid: string;
    form?: UseFormReturn<Space, object>;
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
        form?.setValue(
            'access',
            usersSelected.map((userUuid) => ({
                userUuid: userUuid,
                firstName: '',
                lastName: '',
                role: null,
            })),
        );
    }, [form, usersSelected]);
    const renderUserShare: ItemRenderer<string> = useCallback(
        (userUuid, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return null;

            const isSelected = usersSelected.includes(userUuid);
            const isYou = sessionUser?.userUuid === user.userUuid;
            return (
                <MenuItem2
                    className={isSelected ? Classes.SELECTED : undefined}
                    key={user.userUuid}
                    disabled={isYou}
                    text={
                        <FlexWrapper key={user.userUuid}>
                            <UserCircle>
                                {getInitials(user.userUuid, organizationUsers)}
                            </UserCircle>

                            <PrimaryAndSecondaryTextWrapper $disabled={isYou}>
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
                        </FlexWrapper>
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
        [usersSelected, organizationUsers],
    );

    return (
        <>
            <FlexWrapper>
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
            </FlexWrapper>
        </>
    );
};
