import { Button, ButtonGroup, Classes } from '@blueprintjs/core';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useApp } from '../../providers/AppProvider';
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
    user: OrganizationMemberProfile; //TODO replace with project
}> = ({ key, user: { userUuid, firstName, lastName, email, role } }) => {
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
                            options={Object.values(
                                OrganizationMemberRole, //TODO replace with project
                            ).map((orgMemberRole) => ({
                                value: orgMemberRole,
                                label: orgMemberRole,
                            }))}
                            required
                            onChange={(e) => {}}
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
        </UserListItemWrapper>
    );
};
const ProjectAccess: FC = () => {
    const { user } = useApp();
    const { data: organizationUsers, isLoading } = useOrganizationUsers();

    return (
        <ProjectAccessWrapper>
            {organizationUsers?.map((orgUser) => (
                <UserListItem key={orgUser.email} user={orgUser} />
            ))}
            <AddUserButton
                intent="primary"
                onClick={() => {}}
                text="Add user"
            />
        </ProjectAccessWrapper>
    );
};

export default ProjectAccess;
