import { Classes, Dialog, Spinner } from '@blueprintjs/core';
import { ItemRenderer, MultiSelect2, Select2 } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
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

export interface Access {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}
const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : '';

const ACCESS_TYPES: Access[] = [
    {
        title: 'Restricted access',
        description: 'Only invited members can access',
        selectDescription: 'Only invited members can access',
        value: 'private',
    },
    {
        title: 'Full access',
        description: 'All project members can access',
        selectDescription:
            'All project members can access with their project permissions',
        value: 'public',
    },
];

const USER_ACCESS_TYPES: Access[] = [
    {
        title: 'viewer',
        selectDescription: `This permission has been inherited from user's project access`,
        value: 'keep',
    },
    {
        title: 'No access',
        selectDescription: `Remove user's access`,
        value: 'remove',
    },
];

const renderAccess: ItemRenderer<Access> = (
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

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const { data: project } = useProject(projectUuid);

    const { mutate: spaceMutation, isLoading: isSavingSpace } =
        useUpdateMutation(projectUuid, space.uuid);
    const { mutate: shareSpaceMutation, isLoading: isSharingSpace } =
        useAddSpaceShareMutation(projectUuid, space.uuid);
    const { mutate: unshareSpaceMutation, isLoading: isUnsharingSpace } =
        useDeleteSpaceShareMutation(projectUuid, space.uuid);
    const { data: projectAccess, isLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: organizationUsers, isLoading: isOrganizationUsersLoading } =
        useOrganizationUsers();
    const [selectedAccess, setSelectedAccess] = useState<Access>(
        ACCESS_TYPES[0],
    );
    const { user: sessionUser } = useApp();

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const userUuids: string[] = useMemo(() => {
        if (projectAccess === undefined) return [];
        return projectAccess.map((user) => user.userUuid);
    }, [projectAccess]);

    const getUserNameOrEmail = useCallback(
        (userUuid: string) => {
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return userUuid;
            return user?.firstName
                ? `${user.firstName} ${user.lastName}`
                : user.email;
        },
        [organizationUsers],
    );
    const getInitials = useCallback(
        (userUuid: string) => {
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === userUuid,
            );
            if (!user) return userUuid;

            if (user?.firstName) {
                return user.firstName.substr(0, 1) + user.lastName.substr(0, 1);
            } else {
                return user.email.substr(0, 2).toUpperCase();
            }
        },
        [organizationUsers],
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

            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={
                        usersSelected.includes(user.userUuid) ? 'tick' : 'blank'
                    }
                    key={user.userUuid}
                    //disabled={usersSelected.includes(user.userUuid)}
                    text={
                        <FlexWrapper key={`render_${user.userUuid}`}>
                            <UserTag large round>
                                {getInitials(user.userUuid)}
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
                    }}
                    shouldDismissPopover={false}
                />
            );
        },
        [usersSelected, getInitials],
    );

    const handleRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            setUsersSelected(
                usersSelected.filter(
                    (userUuid) =>
                        getUserNameOrEmail(userUuid) !== selectedValue,
                ),
            );
        },
        [usersSelected, getUserNameOrEmail],
    );

    if (isProjectAccessLoading) return null;
    return (
        <>
            <OpenShareModal
                icon="people"
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
                    {selectedAccess.value === 'private' ? (
                        <AddUsersWrapper>
                            <MultiSelect2
                                fill
                                itemRenderer={renderUserShare}
                                items={userUuids || []}
                                noResults={
                                    isOrganizationUsersLoading ? (
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
                                }}
                                tagRenderer={getUserNameOrEmail}
                                tagInputProps={{
                                    placeholder: undefined,
                                    addOnBlur: false,
                                    tagProps: {
                                        minimal: true,
                                    },
                                    onRemove: handleRemove,
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
                                selectedAccess.value === 'private'
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
                            <Select2<Access>
                                filterable={false}
                                items={ACCESS_TYPES}
                                itemRenderer={renderAccess}
                                onItemSelect={(item) => {
                                    const isPrivate = item.value === 'private';

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

                            const userAccessTypes = USER_ACCESS_TYPES.map(
                                (accessType) => {
                                    return accessType.value === 'keep'
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
                                        {getInitials(sharedUser.userUuid)}
                                    </UserTag>
                                    <UserName>
                                        {getUserNameOrEmail(
                                            sharedUser.userUuid,
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
                                        <Select2<Access>
                                            filterable={false}
                                            items={userAccessTypes}
                                            itemRenderer={renderAccess}
                                            onItemSelect={(item) => {
                                                if (item.value === 'remove') {
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
