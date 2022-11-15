import { Classes, Dialog, Spinner } from '@blueprintjs/core';
import {
    ItemPredicate,
    ItemRenderer,
    MultiSelect2,
    Select2,
} from '@blueprintjs/select';
import { OrganizationMemberProfile, Space } from '@lightdash/common';
import { FC, useCallback, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProject } from '../../../hooks/useProject';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import {
    AccessDescription,
    AccessName,
    AccessRole,
    AccessSelectSubtitle,
    AccessSelectTitle,
    AccessWrapper,
    AddUsersWrapper,
    ChangeAccessButton,
    DialogFooter,
    FlexWrapper,
    MemberAccess,
    OpenShareModal,
    ShareButton,
    ShareTag,
    UserName,
    UserRole,
    UserTag,
    YouLabel,
} from './ShareSpaceModal.style';

import { MenuItem2 } from '@blueprintjs/popover2';
import {
    useAddSpaceShareMutation,
    useDeleteSpaceShareMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}
const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : '';

const enum SpaceAccessType {
    PRIVATE = 'private',
    PUBLIC = 'public',
}
const SpaceAccessOptions: AccessOption[] = [
    {
        title: 'Restricted access',
        description: 'Only invited members can access',
        selectDescription: 'Only invited members can access',
        value: SpaceAccessType.PRIVATE,
    },
    {
        title: 'Full access',
        description: 'All project members can access',
        selectDescription:
            'All project members can access with their project permissions',
        value: SpaceAccessType.PUBLIC,
    },
];

const enum UserAccessAction {
    KEEP = 'keep',
    DELETE = 'delete',
}

const UserAccessOptions: AccessOption[] = [
    {
        title: 'viewer',
        selectDescription: `This permission has been inherited from user's project access`,
        value: UserAccessAction.KEEP,
    },
    {
        title: 'No access',
        selectDescription: `Remove user's access`,
        value: UserAccessAction.DELETE,
    },
];

const renderAccess: ItemRenderer<AccessOption> = (
    access,
    { handleClick, handleFocus, modifiers, query },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            multiline={true}
            active={modifiers.active}
            disabled={modifiers.disabled}
            key={access.value}
            onClick={handleClick}
            onFocus={handleFocus}
            text={
                <>
                    <AccessSelectTitle>{access.title}</AccessSelectTitle>
                    <AccessSelectSubtitle>
                        {access.selectDescription}
                    </AccessSelectSubtitle>
                </>
            }
        />
    );
};

const getUserNameOrEmail = (
    userUuid: string,
    organizationUsers: OrganizationMemberProfile[] | undefined,
) => {
    const user = organizationUsers?.find(
        (userAccess) => userAccess.userUuid === userUuid,
    );
    if (!user) return userUuid;
    return user?.firstName ? `${user.firstName} ${user.lastName}` : user.email;
};

const getInitials = (
    userUuid: string,
    organizationUsers: OrganizationMemberProfile[] | undefined,
) => {
    const user = organizationUsers?.find(
        (userAccess) => userAccess.userUuid === userUuid,
    );
    if (!user) return userUuid;

    if (user?.firstName) {
        return user.firstName.substr(0, 1) + user.lastName.substr(0, 1);
    } else {
        return user.email.substr(0, 2).toUpperCase();
    }
};

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const { data: project } = useProject(projectUuid);

    const { mutate: spaceMutation } = useUpdateMutation(
        projectUuid,
        space.uuid,
    );
    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { data: projectAccess, isLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: organizationUsers } = useOrganizationUsers();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const userUuids: string[] = useMemo(() => {
        if (projectAccess === undefined) return [];
        return projectAccess.map((user) => user.userUuid);
    }, [projectAccess]);

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
                        usersSelected.includes(user.userUuid) || isDisabled
                            ? 'tick'
                            : 'blank'
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
        [usersSelected, getInitials, space, projectAccess],
    );
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
        [usersSelected, getUserNameOrEmail, organizationUsers],
    );

    return (
        <>
            <OpenShareModal
                icon={
                    selectedAccess.value === SpaceAccessType.PRIVATE
                        ? 'lock'
                        : 'people'
                }
                text="Share"
                onClick={(e) => {
                    setIsOpen(true);
                }}
            />

            <Dialog
                style={{ width: 480, paddingBottom: 0 }}
                title={`Share '${space.name}'`}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    {selectedAccess.value === SpaceAccessType.PRIVATE ? (
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
                                        <MenuItem2
                                            disabled
                                            text="No suggestions."
                                        />
                                    )
                                }
                                onItemSelect={(select) => {
                                    setUsersSelected([
                                        ...usersSelected,
                                        select,
                                    ]);
                                    setSearchQuery('');
                                }}
                                query={searchQuery}
                                onQueryChange={setSearchQuery}
                                tagRenderer={(userUuid) =>
                                    getUserNameOrEmail(
                                        userUuid,
                                        organizationUsers,
                                    )
                                }
                                resetOnQuery={true}
                                popoverProps={{
                                    onClosing: () => setSearchQuery(''),
                                }}
                                tagInputProps={{
                                    placeholder: undefined,
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
                                        if (userUuid)
                                            await shareSpaceMutation(userUuid);
                                    }
                                    setUsersSelected([]);
                                }}
                            />
                        </AddUsersWrapper>
                    ) : null}
                    <AccessWrapper>
                        <ShareTag
                            round
                            large
                            icon={
                                selectedAccess.value === SpaceAccessType.PRIVATE
                                    ? 'lock'
                                    : 'people'
                            }
                        />
                        <MemberAccess>
                            <AccessName>Members of {project?.name}</AccessName>
                            <AccessDescription>
                                {selectedAccess.description}
                            </AccessDescription>
                        </MemberAccess>
                        <AccessRole>
                            <Select2<AccessOption>
                                filterable={false}
                                items={SpaceAccessOptions}
                                itemRenderer={renderAccess}
                                onItemSelect={(item) => {
                                    const isPrivate =
                                        item.value === SpaceAccessType.PRIVATE;

                                    if (isPrivate !== space.isPrivate) {
                                        setSelectedAccess(item);
                                        spaceMutation({
                                            name: space.name,
                                            isPrivate: isPrivate,
                                        });
                                    }
                                }}
                            >
                                <ChangeAccessButton
                                    minimal
                                    text={selectedAccess.title}
                                    rightIcon="caret-down"
                                />
                            </Select2>
                        </AccessRole>
                    </AccessWrapper>
                    {space.access &&
                        space.access.map((sharedUser) => {
                            const isYou =
                                sessionUser.data?.userUuid ===
                                sharedUser.userUuid;
                            const role = capitalize(
                                sharedUser.role?.toString() || '',
                            );

                            const userAccessTypes = UserAccessOptions.map(
                                (accessType) => {
                                    return accessType.value ===
                                        UserAccessAction.KEEP
                                        ? {
                                              ...accessType,
                                              title: role,
                                          }
                                        : accessType;
                                },
                            );
                            return (
                                <AddUsersWrapper key={sharedUser.userUuid}>
                                    <UserTag round large>
                                        {getInitials(
                                            sharedUser.userUuid,
                                            organizationUsers,
                                        )}
                                    </UserTag>
                                    <UserName>
                                        {getUserNameOrEmail(
                                            sharedUser.userUuid,
                                            organizationUsers,
                                        )}
                                        {isYou ? (
                                            <YouLabel> (you)</YouLabel>
                                        ) : (
                                            ''
                                        )}
                                    </UserName>
                                    {isYou ? (
                                        <UserRole>{role}</UserRole>
                                    ) : (
                                        <Select2<AccessOption>
                                            filterable={false}
                                            items={userAccessTypes}
                                            itemRenderer={renderAccess}
                                            onItemSelect={(item) => {
                                                if (
                                                    item.value ===
                                                    UserAccessAction.DELETE
                                                ) {
                                                    unshareSpaceMutation(
                                                        sharedUser.userUuid,
                                                    );
                                                }
                                            }}
                                        >
                                            <ChangeAccessButton
                                                minimal
                                                rightIcon="caret-down"
                                                text={role}
                                            />
                                        </Select2>
                                    )}
                                </AddUsersWrapper>
                            );
                        })}
                </div>
                <DialogFooter>
                    <p>
                        {' '}
                        Learn more about permissions in our{' '}
                        <a
                            href="https://docs.lightdash.com/references/roles"
                            target="_blank"
                            rel="noreferrer"
                        >
                            docs
                        </a>
                    </p>
                </DialogFooter>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
