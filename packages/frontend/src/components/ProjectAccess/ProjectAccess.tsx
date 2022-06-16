import { Button, ButtonGroup, Classes } from '@blueprintjs/core';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../hooks/useProjectAccess';
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
    user: OrganizationMemberProfile | ProjectMemberProfile; //TODO replace with project
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
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: projectMemberships } = useProjectAccess(projectUuid);

    const { user } = useApp();

    const { data: organizationUsers } = useOrganizationUsers();

    return (
        <ProjectAccessWrapper>
            {projectMemberships?.map((projectMember) => (
                <UserListItem key={projectMember.email} user={projectMember} />
            ))}

            {/**
             * TODO in  #2440
             * organizationUsers?.map((orgUser) => (
                <UserListItem key={orgUser.email} user={orgUser} />
             ))*/}
            <AddUserButton
                intent="primary"
                onClick={() => {}}
                text="Add user"
            />
        </ProjectAccessWrapper>
    );
};

export default ProjectAccess;
