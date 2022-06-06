import {
    Button,
    ButtonGroup,
    Callout,
    Classes,
    Dialog,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import React, { FC, useState } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useDeleteUserMutation,
    useOrganizationUsers,
    useUpdateUserMutation,
} from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { TrackPage, useTracking } from '../../../providers/TrackingProvider';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import InvitesPanel from '../InvitesPanel';
import {
    AddUserButton,
    InviteInput,
    InviteSuccess,
    ItemContent,
    NewLinkButton,
    PendingEmail,
    PendingTag,
    RoleSelectButton,
    SectionWrapper,
    UserEmail,
    UserInfo,
    UserListItemWrapper,
    UserManagementPanelWrapper,
    UserName,
} from './UserManagementPanel.styles';

const UserListItem: FC<{
    disabled: boolean;
    user: OrganizationMemberProfile;
}> = ({
    disabled,
    user: {
        userUuid,
        firstName,
        lastName,
        email,
        role,
        isActive,
        isInviteExpired,
    },
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteUserMutation();
    const inviteLink = useCreateInviteLinkMutation();
    const { track } = useTracking();
    const { user, showToastSuccess, health } = useApp();
    const updateUser = useUpdateUserMutation(userUuid);
    const handleDelete = () => mutate(userUuid);

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate({ email, role });
    };

    return (
        <UserListItemWrapper elevation={0}>
            <ItemContent>
                <SectionWrapper>
                    {isActive ? (
                        <UserInfo>
                            <UserName
                                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                            >
                                {firstName} {lastName}
                            </UserName>
                            {email && <UserEmail minimal>{email}</UserEmail>}
                        </UserInfo>
                    ) : (
                        <UserInfo>
                            {email && <PendingEmail>{email}</PendingEmail>}
                            <div>
                                <PendingTag intent="warning">
                                    {!isInviteExpired ? 'Pending' : 'Expired'}
                                </PendingTag>
                                <NewLinkButton onClick={getNewLink}>
                                    {health.data?.hasEmailClient
                                        ? 'Send new invite'
                                        : 'Get new link'}
                                </NewLinkButton>
                            </div>
                        </UserInfo>
                    )}
                    {user.data?.ability?.can(
                        'manage',
                        'OrganizationMemberProfile',
                    ) && (
                        <ButtonGroup>
                            <RoleSelectButton
                                fill
                                id="user-role"
                                options={Object.values(
                                    OrganizationMemberRole,
                                ).map((orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: orgMemberRole,
                                }))}
                                required
                                onChange={(e) => {
                                    updateUser.mutate({
                                        role: e.currentTarget
                                            .value as OrganizationMemberRole,
                                    });
                                }}
                                value={role}
                            />

                            <Button
                                icon="delete"
                                intent="danger"
                                outlined
                                onClick={() => setIsDeleteDialogOpen(true)}
                                text="Delete"
                                disabled={disabled}
                            />
                        </ButtonGroup>
                    )}
                </SectionWrapper>
                {inviteLink.data && (
                    <InviteSuccess>
                        {health.data?.hasEmailClient && (
                            <Callout intent="success">
                                {inviteLink.data.email} has been invited.
                            </Callout>
                        )}
                        <InviteInput
                            id="invite-link-input"
                            className="cohere-block"
                            type="text"
                            readOnly
                            value={inviteLink.data.inviteUrl}
                            rightElement={
                                <CopyToClipboard
                                    text={inviteLink.data.inviteUrl}
                                    options={{ message: 'Copied' }}
                                    onCopy={() =>
                                        showToastSuccess({
                                            title: 'Invite link copied',
                                        })
                                    }
                                >
                                    <Button minimal icon="clipboard" />
                                </CopyToClipboard>
                            }
                        />
                    </InviteSuccess>
                )}
            </ItemContent>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="person"
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title="Delete user"
                lazy
                canOutsideClickClose={false}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>Are you sure you want to delete this user ?</p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={handleDelete}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </UserListItemWrapper>
    );
};

const UserManagementPanel: FC<{
    showInvitePage: boolean;
    setShowInvitePage: (showInvitePage: boolean) => void;
}> = ({ showInvitePage, setShowInvitePage }) => {
    const { user } = useApp();
    const { data: organizationUsers, isLoading } = useOrganizationUsers();

    if (showInvitePage) {
        return (
            <TrackPage
                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <InvitesPanel onBackClick={() => setShowInvitePage(false)} />
            </TrackPage>
        );
    }

    return (
        <UserManagementPanelWrapper>
            {user.data?.ability?.can('create', 'InviteLink') && (
                <AddUserButton
                    intent="primary"
                    onClick={() => setShowInvitePage(true)}
                    text="Add user"
                />
            )}
            {isLoading ? (
                <NonIdealState title="Loading users" icon={<Spinner />} />
            ) : (
                organizationUsers?.map((orgUser) => (
                    <UserListItem
                        key={orgUser.email}
                        user={orgUser}
                        disabled={
                            user.data?.userUuid === orgUser.userUuid ||
                            organizationUsers.length <= 1
                        }
                    />
                ))
            )}
        </UserManagementPanelWrapper>
    );
};

export default UserManagementPanel;
