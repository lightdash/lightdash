import { Button, ButtonGroup, Classes, Dialog } from '@blueprintjs/core';
import { OrganizationMemberProfile, OrganizationMemberRole } from 'common';
import React, { FC, useState } from 'react';
import {
    useDeleteUserMutation,
    useOrganizationUsers,
    useUpdateUserMutation,
} from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import {
    ItemContent,
    RoleSelectButton,
    UserEmail,
    UserInfo,
    UserListItemWrapper,
    UserManagementPanelWrapper,
    UserName,
} from './UserManagementPanel.styles';

const UserListItem: FC<{ disabled: boolean; user: OrganizationMemberProfile }> =
    ({ disabled, user: { userUuid, firstName, lastName, email, role } }) => {
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

const UserManagementPanel: FC = () => {
    const { user } = useApp();
    const { data: organizationUsers } = useOrganizationUsers();

    return (
        <UserManagementPanelWrapper>
            <div>
                {organizationUsers?.map((orgUser) => (
                    <UserListItem
                        key={orgUser.email}
                        user={orgUser}
                        disabled={
                            user.data?.userUuid === orgUser.userUuid ||
                            organizationUsers.length <= 1
                        }
                    />
                ))}
            </div>
        </UserManagementPanelWrapper>
    );
};

export default UserManagementPanel;
