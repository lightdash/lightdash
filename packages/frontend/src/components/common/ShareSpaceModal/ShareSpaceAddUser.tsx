import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ItemPredicate, ItemRenderer, MultiSelect2 } from '@blueprintjs/select';
import {
    OrganizationMemberProfile,
    ProjectMemberProfile,
    Space,
} from '@lightdash/common';
import { FC, useCallback, useMemo, useState } from 'react';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
import {
    AccessDescription,
    AccessName,
    AddUsersWrapper,
    FlexWrapper,
    MemberAccess,
    SelectIcon,
    ShareButton,
    UserTag,
} from './ShareSpaceModal.style';
import { getInitials, getUserNameOrEmail } from './Utils';

const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

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
    const { data: projectAccess, isLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);

    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const userUuids: string[] = useMemo(() => {
        if (projectAccess === undefined) return [];
        return projectAccess.map((user) => user.userUuid);
    }, [projectAccess]);

    const filterUser: ItemPredicate<string> = useCallback(
        (query, userUuid, _index) => {
            const user = projectAccess?.find(
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
        [projectAccess],
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
            const user = projectAccess?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return null;

            const isDisabled = space.access
                ?.map((access) => access.userUuid)
                .includes(user.userUuid);
            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={
                        <SelectIcon
                            icon={
                                usersSelected.includes(user.userUuid) ||
                                isDisabled
                                    ? 'tick'
                                    : 'blank'
                            }
                        />
                    }
                    key={user.userUuid}
                    title={
                        isDisabled
                            ? 'This user already has access to the space'
                            : ''
                    }
                    disabled={isDisabled}
                    text={
                        <FlexWrapper key={`render_${user.userUuid}`}>
                            <UserTag large round>
                                {getInitials(user.userUuid, organizationUsers)}
                            </UserTag>
                            <MemberAccess>
                                <AccessName>
                                    {user.firstName} {user.lastName}
                                </AccessName>
                                <AccessDescription>
                                    {user.email}
                                </AccessDescription>
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
        [usersSelected, space, projectAccess, organizationUsers],
    );

    return (
        <AddUsersWrapper>
            <MultiSelect2
                fill
                itemPredicate={filterUser}
                itemRenderer={renderUserShare}
                items={userUuids || []}
                noResults={
                    isProjectAccessLoading ? (
                        <StyledSpinner />
                    ) : (
                        <MenuItem2 disabled text="No suggestions." />
                    )
                }
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
                    onClosing: () => setSearchQuery(''),
                    placement: 'bottom-start',
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
        </AddUsersWrapper>
    );
};
