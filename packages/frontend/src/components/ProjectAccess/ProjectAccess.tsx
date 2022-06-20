import { Button, ButtonGroup, Classes, Dialog } from '@blueprintjs/core';
import {
    OrganizationMemberProfile,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useProjectAccess,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import {
    AddUserButton,
    ItemContent,
    ProjectAccessWrapper,
    RoleSelectButton,
    SectionWrapper,
    UserEmail,
    UserInfo,
    UserListItemWrapper,
    UserName,
} from './ProjectAccess.tyles';

const UserListItem: FC<{
    key: string;
    user: OrganizationMemberProfile | ProjectMemberProfile;
    onDelete: () => void;
    onUpdate: (newRole: ProjectMemberRole) => void;
}> = ({
    key,
    user: { firstName, lastName, email, role },
    onDelete,
    onUpdate,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    return (
        <UserListItemWrapper>
            <ItemContent>
                <SectionWrapper>
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
                            options={Object.values(ProjectMemberRole).map(
                                (orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: orgMemberRole,
                                }),
                            )}
                            required
                            onChange={(e) => {
                                const newRole = e.target
                                    .value as ProjectMemberRole;
                                onUpdate(newRole);
                            }}
                            value={role}
                        />

                        <Button
                            icon="delete"
                            intent="danger"
                            outlined
                            onClick={() => setIsDeleteDialogOpen(true)}
                            text="Delete"
                        />
                    </ButtonGroup>
                </SectionWrapper>
            </ItemContent>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="key"
                onClose={() => setIsDeleteDialogOpen(false)}
                title="Revoke project access"
                lazy
                canOutsideClickClose={false}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure you want to revoke project access this user{' '}
                        {email} ?
                    </p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={() => setIsDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button intent="danger" onClick={onDelete}>
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </UserListItemWrapper>
    );
};
const ProjectAccess: FC<{
    onAddUser: () => void;
}> = ({ onAddUser }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { mutate: revokeAccess } =
        useRevokeProjectAccessMutation(projectUuid);
    const { mutate: updateAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const { data: projectMemberships } = useProjectAccess(projectUuid);
    const { data: organizationUsers } = useOrganizationUsers();

    return (
        <ProjectAccessWrapper>
            {projectMemberships?.map((projectMember) => (
                <UserListItem
                    key={projectMember.email}
                    user={projectMember}
                    onUpdate={(newRole) =>
                        updateAccess({
                            userUuid: projectMember.userUuid,
                            role: newRole,
                        })
                    }
                    onDelete={() => revokeAccess(projectMember.userUuid)}
                />
            ))}

            {/**
             * TODO in  #2440
             * organizationUsers?.map((orgUser) => (
                <UserListItem key={orgUser.email} user={orgUser} />
             ))*/}
            <AddUserButton
                intent="primary"
                onClick={onAddUser}
                text="Add user"
            />
        </ProjectAccessWrapper>
    );
};

export default ProjectAccess;
