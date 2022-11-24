import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemPredicate, ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    Space,
} from '@lightdash/common';
import { FC, useCallback, useMemo, useState } from 'react';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
import {
    FlexWrapper,
    MemberAccess,
    PrimaryText,
    SecondaryText,
    ShareButton,
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

    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
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
        (userUuid, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return null;

            const isDisabled = space.access
                .map((access) => access.userUuid)
                .includes(user.userUuid);

            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={
                        null
                        // <SelectIcon
                        //     icon={
                        //         usersSelected.includes(user.userUuid) ||
                        //         isDisabled
                        //             ? 'tick'
                        //             : 'blank'
                        //     }
                        // />
                    }
                    key={user.userUuid}
                    title={
                        isDisabled
                            ? 'This user already has access to the space'
                            : ''
                    }
                    disabled={isDisabled}
                    text={
                        <FlexWrapper key={user.userUuid}>
                            <UserCircle>
                                {getInitials(user.userUuid, organizationUsers)}
                            </UserCircle>

                            <MemberAccess>
                                <PrimaryText>
                                    {user.firstName} {user.lastName}
                                </PrimaryText>

                                <SecondaryText>{user.email}</SecondaryText>
                            </MemberAccess>
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
        [usersSelected, space, organizationUsers],
    );

    return (
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

            <ShareButton
                text="Share"
                intent="primary"
                disabled={usersSelected.length === 0}
                onClick={async () => {
                    for (const userUuid of usersSelected) {
                        if (userUuid) await shareSpaceMutation(userUuid);
                    }
                    setUsersSelected([]);
                }}
            />
        </FlexWrapper>
    );
};
