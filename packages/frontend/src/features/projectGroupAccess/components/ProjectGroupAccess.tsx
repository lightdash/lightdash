import { subject } from '@casl/ability';
import {
    FeatureFlags,
    isGroupWithMembers,
    type CreateProjectGroupAccess,
    type GroupWithMembers,
    type ProjectGroupAccess,
    type Role,
} from '@lightdash/common';
import { Box, Paper, Table } from '@mantine/core';
import { IconUsersGroup } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationRoles } from '../../../hooks/useOrganizationRoles';
import {
    useProjectGroupRoleAssignments,
    useUpsertProjectGroupRoleAssignmentMutation,
} from '../../../hooks/useProjectGroupRoles';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import AddProjectGroupAccessModal from './AddProjectGroupAccessModal';
import ProjectGroupAccessItemV2 from './ProjectGroupAccessItemV2';

interface ProjectGroupAccessProps {
    projectUuid: string;
    isAddingProjectGroupAccess: boolean;
    onAddProjectGroupAccessClose: () => void;
}

const ProjectGroupAccessComponent: FC<ProjectGroupAccessProps> = ({
    projectUuid,
    isAddingProjectGroupAccess,
    onAddProjectGroupAccessClose,
}) => {
    const { user } = useApp();
    const ability = useAbilityContext();
    const { cx, classes } = useTableStyles();
    const { showToastSuccess } = useToaster();

    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const { data: groups } = useOrganizationGroups(
        { includeMembers: 5 },
        { enabled: isGroupManagementEnabled },
    );

    const {
        data: projectGroupRoleAssignments,
        isInitialLoading: isLoadingProjectGroupAccessList,
    } = useProjectGroupRoleAssignments(projectUuid);

    // Convert v2 role assignments to legacy ProjectGroupAccess format for UI compatibility
    const projectGroupAccessList = useMemo(() => {
        if (!projectGroupRoleAssignments) return [];

        return projectGroupRoleAssignments.map(
            (assignment): ProjectGroupAccess => ({
                projectUuid,
                groupUuid: assignment.assigneeId,
                role: assignment.roleId, // Use roleId (UUID) instead of roleName for custom roles
            }),
        );
    }, [projectGroupRoleAssignments, projectUuid]);

    const { data: organizationRoles } = useOrganizationRoles();

    const rolesData = useMemo(() => {
        if (!organizationRoles) return [];
        return organizationRoles.map(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => ({
                value: role.roleUuid,
                label: role.name,
                group:
                    role.ownerType === 'system' ? 'System role' : 'Custom role',
            }),
        );
    }, [organizationRoles]);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const { mutateAsync: addProjectGroupAccess, isLoading: isSubmitting } =
        useUpsertProjectGroupRoleAssignmentMutation(projectUuid);

    const handleAddProjectGroupAccess = async (
        formData: CreateProjectGroupAccess,
    ) => {
        await addProjectGroupAccess({
            groupId: formData.groupUuid,
            roleId: formData.role,
        });
        showToastSuccess({ title: 'Group access added' });
        onAddProjectGroupAccessClose();
    };

    const availableGroups = useMemo(() => {
        if (!groups || !projectGroupAccessList) return [];

        // TODO: Why does filter assume that it will always be Group???
        return groups
            .map((g) => {
                if (isGroupWithMembers(g)) {
                    return g;
                }
            })
            .filter((g): g is GroupWithMembers => {
                return Boolean(
                    g &&
                        isGroupWithMembers(g) &&
                        !projectGroupAccessList?.find((access) => {
                            return access.groupUuid === g.uuid;
                        }),
                );
            });
    }, [groups, projectGroupAccessList]);

    return (
        <TrackPage
            name={PageName.PROJECT_MANAGE_GROUP_ACCESS}
            type={PageType.PAGE}
            category={CategoryName.SETTINGS}
        >
            {isLoadingProjectGroupAccessList ? (
                <Box mt="4xl">
                    <SuboptimalState loading />
                </Box>
            ) : projectGroupAccessList?.length === 0 ? (
                <Box mt="4xl">
                    <SuboptimalState
                        icon={IconUsersGroup}
                        title="No group found with access to this project"
                        description={
                            'Click "Add group access" to add a group to this project'
                        }
                    />
                </Box>
            ) : (
                <Paper withBorder style={{ overflow: 'hidden' }}>
                    <Table
                        className={cx(classes.root, classes.alignLastTdRight)}
                    >
                        <thead>
                            <tr>
                                <th>Group Name</th>
                                <th>Group Role</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {projectGroupAccessList?.map(
                                (projectGroupAccess) => {
                                    const group = groups?.find(
                                        (g) =>
                                            g.uuid ===
                                            projectGroupAccess.groupUuid,
                                    );

                                    return (
                                        group &&
                                        isGroupWithMembers(group) && (
                                            <ProjectGroupAccessItemV2
                                                key={
                                                    projectGroupAccess.groupUuid
                                                }
                                                access={projectGroupAccess}
                                                group={group}
                                                organizationRoles={rolesData}
                                                canManageProjectAccess={
                                                    canManageProjectAccess
                                                }
                                            />
                                        )
                                    );
                                },
                            )}
                        </tbody>
                    </Table>
                </Paper>
            )}

            {availableGroups && isAddingProjectGroupAccess && (
                <AddProjectGroupAccessModal
                    projectUuid={projectUuid}
                    totalNumberOfGroups={groups?.length || 0}
                    availableGroups={availableGroups}
                    organizationRoles={rolesData}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAddProjectGroupAccess}
                    onClose={() => onAddProjectGroupAccessClose()}
                />
            )}
        </TrackPage>
    );
};

export default ProjectGroupAccessComponent;
