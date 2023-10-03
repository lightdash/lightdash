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
    Group,
    Loader,
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
import {
    BadgeBox,
    ButtonGroup,
    EmailBox,
    ItemContent,
    LoadingArea,
    LoadingText,
    SectionWrapper,
    UserInfo,
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
        <SettingsCard>
            <ItemContent>
                <SectionWrapper>
                    <UserInfo>
                        <UserName>
                            {firstName} {lastName}
                        </UserName>

                        {email && <EmailBox>{email}</EmailBox>}
                    </UserInfo>

                    {relevantOrgRole && (
                        <Tooltip
                            position="left"
                            color="dark"
                            withArrow
                            arrowSize={10}
                            label={`This user inherits the organization role: ${relevantOrgRole}`}
                            sx={{ padding: '10px', backgroundColor: '#57606a' }}
                        >
                            <Box
                                sx={{
                                    marginRight: '10px',
                                    color: '#8f6215',
                                }}
                            >
                                <IconAlertTriangleFilled size={17} />
                            </Box>
                        </Tooltip>
                    )}

                    <ButtonGroup>
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
                                    boxSizing: 'border-box',
                                    height: '30px',
                                    fontSize: '14px',
                                }}
                                value={role}
                            />
                        ) : (
                            <Tooltip
                                position="left"
                                color="dark"
                                withArrow
                                arrowSize={10}
                                label={roleTooltip ? roleTooltip : undefined}
                                sx={{
                                    padding: '10px',
                                    backgroundColor: '#57606a',
                                }}
                            >
                                <Box
                                    sx={{
                                        marginRight: '10px',
                                        color: '#8f6215',
                                    }}
                                >
                                    <BadgeBox>{role}</BadgeBox>
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
                    </ButtonGroup>
                </SectionWrapper>
            </ItemContent>
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
            <LoadingArea>
                <Loader color="gray" size={50} />
                <LoadingText>{'Loading...'}</LoadingText>
            </LoadingArea>
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
