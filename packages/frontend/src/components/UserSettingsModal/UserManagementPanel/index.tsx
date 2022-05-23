import {
    Button,
    ButtonGroup,
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
import {
    useDeleteUserMutation,
    useOrganizationUsers,
    useUpdateUserMutation,
} from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import InvitesPanel from '../InvitesPanel';
import {
    AddUserButton,
    ItemContent,
    RoleSelectButton,
    UserEmail,
    UserInfo,
    UserListItemWrapper,
    UserManagementPanelWrapper,
    UserName,
} from './UserManagementPanel.styles';

const UserListItem: FC<{
    disabled: boolean;
    user: OrganizationMemberProfile;
}> = ({ disabled, user: { userUuid, firstName, lastName, email, role } }) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteUserMutation();
    const updateUser = useUpdateUserMutation(userUuid);
    const handleDelete = () => mutate(userUuid);

    return (
        <UserListItemWrapper elevation={0}>
            <ItemContent>
                <UserInfo>
                    <UserName className={Classes.TEXT_OVERFLOW_ELLIPSIS}>
                        {firstName} {lastName}
                    </UserName>
                    {email && <UserEmail minimal>{email}</UserEmail>}
                </UserInfo>
                <ButtonGroup>
                    <RoleSelectButton
                        fill
                        id="user-role"
                        options={Object.values(OrganizationMemberRole).map(
                            (orgMemberRole) => ({
                                value: orgMemberRole,
                                label: orgMemberRole,
                            }),
                        )}
                        required
                        onChange={(e) => {
                            // @ts-ignore
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
            {user.data?.ability?.can('manage', 'InviteLink') && (
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
