import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    AgentCapability,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { fromSession } from '../../../auth/account/account';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

export const statusFixture = async (
    database: Knex,
    customRolesEnabled = false,
) => {
    const [org] = await database('organizations')
        .insert({ organization_name: 'Bulk permissions' })
        .returning('*');
    const people = await Promise.all(
        [
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.DEVELOPER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
        ].map(async (role, index) => {
            const [user] = await database('users')
                .insert({
                    first_name: `Person ${index}`,
                    last_name: 'Bulk',
                    is_marketing_opted_in: false,
                    is_tracking_anonymized: true,
                    is_setup_complete: true,
                    is_active: true,
                })
                .returning('*');
            await database('organization_memberships').insert({
                organization_id: org.organization_id,
                user_id: user.user_id,
                role,
            });
            await database('emails').insert({
                user_id: user.user_id,
                email: `${user.user_uuid}@example.com`,
                is_primary: true,
            });
            return user;
        }),
    );
    const projects = await database('projects')
        .insert(
            Array.from({ length: 50 }, (_, index) => ({
                organization_id: org.organization_id,
                name: `Project ${index}`,
                project_type: ProjectType.DEFAULT,
                created_by_user_uuid: people[0].user_uuid,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: '1.7',
                organization_warehouse_credentials_uuid: null,
            })),
        )
        .returning('*');
    const [custom] = await database('roles')
        .insert({
            name: 'Query only',
            description: null,
            level: 'project',
            organization_uuid: org.organization_uuid,
            created_by: people[0].user_uuid,
        })
        .returning('*');
    await database('scoped_roles').insert({
        role_uuid: custom.role_uuid,
        scope_name: AGENT_CAPABILITY_SCOPES[AgentCapability.Query],
        granted_by: people[0].user_uuid,
    });
    const [group] = await database('groups')
        .insert({
            organization_id: org.organization_id,
            name: 'Deploy group',
            created_by_user_uuid: people[0].user_uuid,
            updated_by_user_uuid: people[0].user_uuid,
        })
        .returning('*');
    await database('group_memberships').insert({
        group_uuid: group.group_uuid,
        user_id: people[7].user_id,
        organization_id: org.organization_id,
    });
    await database('project_memberships').insert(
        projects.flatMap((project, index) => [
            {
                project_id: project.project_id,
                user_id: people[5].user_id,
                role:
                    index % 2 === 0
                        ? ProjectMemberRole.VIEWER
                        : ProjectMemberRole.DEVELOPER,
                role_uuid: null,
            },
            {
                project_id: project.project_id,
                user_id: people[6].user_id,
                role: ProjectMemberRole.VIEWER,
                role_uuid: custom.role_uuid,
            },
        ]),
    );
    await database('project_group_access').insert(
        projects.map((project, index) => ({
            project_uuid: project.project_uuid,
            group_uuid: group.group_uuid,
            role:
                index % 2 === 0
                    ? ProjectMemberRole.DEVELOPER
                    : ProjectMemberRole.VIEWER,
        })),
    );
    await database('project_group_access_custom_roles').insert({
        project_uuid: projects[2].project_uuid,
        group_uuid: group.group_uuid,
        role_uuid: custom.role_uuid,
    });
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig: lightdashConfigMock,
    });
    const users = new UserModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            customRoles: { enabled: customRolesEnabled },
        },
        featureFlagModel,
    });
    const projectModel = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil,
    });
    const policies = new AgentCapabilityPolicyModel({ database });
    const roleMatrix = {
        ...agentSystemRoleMatrix([]),
        admin: Object.values(AgentCapability),
        developer: [
            AgentCapability.DeployUpload,
            AgentCapability.ReadDiscover,
            AgentCapability.Administration,
        ],
        editor: [
            AgentCapability.ContentWrite,
            AgentCapability.Publish,
            AgentCapability.Delete,
        ],
        interactive_viewer: [AgentCapability.RawSql],
        viewer: [AgentCapability.Query],
    };
    const savePolicy = (
        overrides: Partial<Parameters<typeof policies.save>[0]> = {},
    ) =>
        policies.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            allowedCapabilities: [...AGENT_CAPABILITY_LIMIT_DEFAULTS],
            allowedGroupUuids: null,
            systemRoleMatrix: roleMatrix,
            updatedByUserUuid: people[0].user_uuid,
            ...overrides,
        });
    await savePolicy();
    const flags = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: true,
        })),
    };
    const service = new AgentPermissionService({
        resolveResourceProjectUuid: async () => null,
        isCustomRolesLicensed: () => true,
        areGroupsAvailable: async () => true,
        featureFlagModel: flags,
        groupsModel: new GroupsModel({ database }),
        agentCapabilityPolicyModel: policies,
        userModel: users,
        projectModel,
        agentActionLogModel: new AgentActionLogModel({ database }),
    });
    const accounts = await Promise.all(
        people.map(async (person) =>
            fromSession(
                await users.findSessionUserAndOrgByUuid(
                    person.user_uuid,
                    org.organization_uuid,
                ),
                '',
            ),
        ),
    );
    return {
        database,
        org,
        people,
        projects,
        custom,
        group,
        service,
        accounts,
        loaders: { userModel: users, projectModel },
        savePolicy,
        roleMatrix,
        flags,
        users,
        projectModel,
    };
};
