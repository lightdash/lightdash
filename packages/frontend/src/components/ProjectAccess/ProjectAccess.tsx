import { subject } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Group,
    Loader,
    Mark,
    Modal,
    NativeSelect,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconKey,
    IconTrash,
} from '@tabler/icons-react';
import { FC, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useProjectAccess,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import { useApp } from '../../providers/AppProvider';
import { useAbilityContext } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';

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
        <SettingsCard>
            <Box>
                <Box
                    sx={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <Text fw={700}>
                            {firstName} {lastName}
                        </Text>

                        {email && (
                            <Mark
                                color="gray"
                                sx={{
                                    width: 'fit-content',
                                    padding: '2px 6px',
                                    fontSize: '12px',
                                    marginTop: '0.3em',
                                }}
                            >
                                {email}
                            </Mark>
                        )}
                    </Box>

                    {relevantOrgRole && (
                        <Tooltip
                            position="left"
                            color="dark"
                            withArrow
                            arrowSize={8}
                            label={`This user inherits the organization role: ${relevantOrgRole}`}
                        >
                            <Box
                                sx={{
                                    marginRight: '10px',
                                    marginLeft: 'auto',
                                }}
                            >
                                <IconAlertTriangleFilled size={17} />
                            </Box>
                        </Tooltip>
                    )}

                    <Box sx={{ display: 'flex' }}>
                        {onUpdate ? (
                            <NativeSelect
                                id="user-role"
                                data={Object.values(ProjectMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }),
                                )}
                                onChange={(e) => {
                                    const newRole = e.target
                                        .value as ProjectMemberRole;
                                    onUpdate(newRole);
                                }}
                                variant="filled"
                                sx={{
                                    marginRight: '0.5em',
                                }}
                                value={role}
                            />
                        ) : (
                            <Tooltip
                                position="left"
                                color="dark"
                                withArrow
                                arrowSize={8}
                                label={roleTooltip ? roleTooltip : undefined}
                            >
                                <Box>
                                    <Mark
                                        color="gray"
                                        sx={{
                                            padding: '5.9px 8.9px',
                                        }}
                                    >
                                        {role}
                                    </Mark>
                                </Box>
                            </Tooltip>
                        )}
                        {onDelete && (
                            <Button
                                variant="outline"
                                size="xs"
                                color="red"
                                px="xs"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </Button>
                        )}
                    </Box>
                </Box>
            </Box>
            <Modal
                opened={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                title={
                    <Group spacing="xs">
                        <MantineIcon size="lg" icon={IconKey} color="red" />
                        <Title order={4}>Revoke project access</Title>
                    </Group>
                }
            >
                <Text pb="md">
                    Are you sure you want to revoke project access for this user{' '}
                    {email} ?
                </Text>
                <Group spacing="xs" position="right">
                    <Button
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button color="red" onClick={onDelete}>
                        Delete
                    </Button>
                </Group>
            </Modal>
        </SettingsCard>
    );
};

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
}

const ProjectAccess: FC<ProjectAccessProps> = ({ projectUuid }) => {
    const { user } = useApp();
    const ability = useAbilityContext();
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
        return (
            <Center
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Loader color="gray" size={50} />
                <Box
                    sx={{
                        fontWeight: 'bolder',
                        color: '#5f6b7c',
                        fontSize: '17px',
                        marginTop: '7px',
                    }}
                >
                    {'Loading...'}
                </Box>
            </Center>
        );
    }
    return (
        <Stack>
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
                    roleTooltip={`This user inherits the organization role: ${orgUser.role}`}
                />
            ))}
        </Stack>
    );
};

export default ProjectAccess;
