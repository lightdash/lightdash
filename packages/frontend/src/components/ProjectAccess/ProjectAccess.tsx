import {
    Button,
    ButtonGroup,
    Classes,
    Dialog,
    Intent,
    NonIdealState,
    Spinner,
    Tag,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useProjectAccess,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import { useApp } from '../../providers/AppProvider';
import { useAbilityContext } from '../common/Authorization';
import {
    ItemContent,
    ProjectAccessWrapper,
    RelevantOrgRoleIcon,
    RoleSelectButton,
    SectionWrapper,
    UserEmail,
    UserInfo,
    UserListItemWrapper,
    UserName,
} from './ProjectAccess.styles';

const UserListItem: FC<{
    user: OrganizationMemberProfile | ProjectMemberProfile;
    relevantOrgRole?: OrganizationMemberProfile['role'];
    roleTooltip?: string;
    onDelete?: () => void;
    onUpdate?: (newRole: ProjectMemberRole) => void;
}> = ({
    user: { firstName, lastName, email, role },
    relevantOrgRole,
    roleTooltip,
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

                    {relevantOrgRole && (
                        <Tooltip2
                            content={`This user inherits the organisation role: ${relevantOrgRole}`}
                        >
                            <RelevantOrgRoleIcon
                                icon="warning-sign"
                                intent={Intent.WARNING}
                            />
                        </Tooltip2>
                    )}

                    <ButtonGroup>
                        {onUpdate ? (
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
                        ) : (
                            <Tooltip2
                                content={roleTooltip ? roleTooltip : undefined}
                            >
                                <Tag minimal large>
                                    {role}
                                </Tag>
                            </Tooltip2>
                        )}
                        {onDelete && (
                            <Button
                                icon="delete"
                                intent="danger"
                                outlined
                                onClick={() => setIsDeleteDialogOpen(true)}
                                text="Delete"
                            />
                        )}
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

const relevantOrgRolesForProjectRole: Record<
    ProjectMemberRole,
    OrganizationMemberRole[]
> = {
    [ProjectMemberRole.VIEWER]: [
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.EDITOR]: [OrganizationMemberRole.ADMIN],
    [ProjectMemberRole.ADMIN]: [],
};

const ProjectAccess: FC = () => {
    const { user } = useApp();
    const ability = useAbilityContext();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { mutate: revokeAccess } =
        useRevokeProjectAccessMutation(projectUuid);
    const { mutate: updateAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const { data: projectAccess, isLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: organizationUsers, isLoading: isOrganizationUsersLoading } =
        useOrganizationUsers();

    const [inheritedPermissions, overlapPermissions] = useMemo(() => {
        const projectMemberEmails =
            projectAccess?.map((projectMember) => projectMember.email) || [];
        return (organizationUsers || []).reduce<
            [OrganizationMemberProfile[], OrganizationMemberProfile[]]
        >(
            ([inherited, overlapping], orgUser) => {
                if (orgUser.role === OrganizationMemberRole.MEMBER) {
                    return [inherited, overlapping];
                }
                if (projectMemberEmails.includes(orgUser.email)) {
                    return [inherited, [...overlapping, orgUser]];
                }
                return [[...inherited, orgUser], overlapping];
            },
            [[], []],
        );
    }, [organizationUsers, projectAccess]);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (isProjectAccessLoading || isOrganizationUsersLoading) {
        return <NonIdealState title="Loading..." icon={<Spinner />} />;
    }
    return (
        <ProjectAccessWrapper>
            {projectAccess?.map((projectMember) => (
                <UserListItem
                    key={projectMember.email}
                    user={projectMember}
                    onUpdate={
                        canManageProjectAccess
                            ? (newRole) =>
                                  updateAccess({
                                      userUuid: projectMember.userUuid,
                                      role: newRole,
                                  })
                            : undefined
                    }
                    onDelete={
                        canManageProjectAccess
                            ? () => revokeAccess(projectMember.userUuid)
                            : undefined
                    }
                    relevantOrgRole={
                        overlapPermissions.find(
                            ({ email, role }) =>
                                email === projectMember.email &&
                                relevantOrgRolesForProjectRole[
                                    projectMember.role
                                ].includes(role),
                        )?.role
                    }
                />
            ))}
            {inheritedPermissions?.map((orgUser) => (
                <UserListItem
                    key={orgUser.email}
                    user={orgUser}
                    roleTooltip={`This user inherits the organisation role: ${orgUser.role}`}
                />
            ))}
        </ProjectAccessWrapper>
    );
};

export default ProjectAccess;
