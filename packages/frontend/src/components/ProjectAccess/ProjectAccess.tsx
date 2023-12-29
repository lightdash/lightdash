import { subject } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';
import { Paper, Table } from '@mantine/core';
import { FC, useMemo } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useProjectAccess,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import { useApp } from '../../providers/AppProvider';
import { useAbilityContext } from '../common/Authorization';
import LoadingState from '../common/LoadingState';
import ProjectAccessCreation from './ProjectAccessCreation';
import ProjectAccessRow from './ProjectAccessRow';

const relevantOrgRolesForProjectRole: Record<
    ProjectMemberRole,
    OrganizationMemberRole[]
> = {
    [ProjectMemberRole.VIEWER]: [
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.INTERACTIVE_VIEWER]: [
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.EDITOR]: [
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.DEVELOPER]: [OrganizationMemberRole.ADMIN],
    [ProjectMemberRole.ADMIN]: [],
};

interface ProjectAccessProps {
    projectUuid: string;
    isAddingProjectAccess: boolean;
    onAddProjectAccessClose: () => void;
}

const ProjectAccess: FC<ProjectAccessProps> = ({
    projectUuid,
    isAddingProjectAccess,
    onAddProjectAccessClose,
}) => {
    const { user } = useApp();

    const { cx, classes } = useTableStyles();

    const ability = useAbilityContext();
    const { mutate: revokeAccess } =
        useRevokeProjectAccessMutation(projectUuid);
    const { mutate: updateAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const { data: projectAccess, isInitialLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const {
        data: organizationUsers,
        isInitialLoading: isOrganizationUsersLoading,
    } = useOrganizationUsers();

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
        return <LoadingState title="Loading user access" />;
    }
    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {projectAccess?.map((projectMember) => (
                            <ProjectAccessRow
                                key={projectMember.email}
                                user={projectMember}
                                onUpdate={
                                    canManageProjectAccess
                                        ? (newRole) =>
                                              updateAccess({
                                                  userUuid:
                                                      projectMember.userUuid,
                                                  role: newRole,
                                              })
                                        : undefined
                                }
                                onDelete={
                                    canManageProjectAccess
                                        ? () =>
                                              revokeAccess(
                                                  projectMember.userUuid,
                                              )
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
                            <ProjectAccessRow
                                key={orgUser.email}
                                user={orgUser}
                                roleTooltip={`This user inherits the organization role: ${orgUser.role}`}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            {isAddingProjectAccess && (
                <ProjectAccessCreation
                    opened
                    projectUuid={projectUuid}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}
        </>
    );
};

export default ProjectAccess;
