import {
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashConfig } from '../config/parseConfig';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { UserModel } from './UserModel';

const user = {
    user_id: 1,
    user_uuid: 'user',
    organization_id: 10,
    organization_uuid: 'organization',
    role: OrganizationMemberRole.ADMIN,
    role_uuid: 'org-primary',
};

const directMemberships = [
    {
        project_id: 20,
        project_uuid: 'project',
        role: null,
        role_uuid: 'direct-primary',
        project_type: ProjectType.DEFAULT,
        created_by_user_uuid: null,
    },
    {
        project_id: 21,
        project_uuid: 'other-project',
        role: ProjectMemberRole.ADMIN,
        role_uuid: 'other-direct',
        project_type: ProjectType.DEFAULT,
        created_by_user_uuid: null,
    },
];

const groupMemberships = [
    {
        project_uuid: 'project',
        group_uuid: 'custom-group',
        role: ProjectMemberRole.ADMIN,
        role_uuid: 'group-primary',
        project_type: ProjectType.DEFAULT,
        created_by_user_uuid: null,
    },
    {
        project_uuid: 'project',
        group_uuid: 'system-group',
        role: ProjectMemberRole.EDITOR,
        role_uuid: null,
        project_type: ProjectType.DEFAULT,
        created_by_user_uuid: null,
    },
    {
        project_uuid: 'other-project',
        group_uuid: 'other-group',
        role: ProjectMemberRole.ADMIN,
        role_uuid: 'other-group-role',
        project_type: ProjectType.DEFAULT,
        created_by_user_uuid: null,
    },
];

const customRoles = [
    { roleUuid: 'org-primary', scopes: ['view:AgentQuery'] },
    { roleUuid: 'org-extra', scopes: ['view:AgentExport'] },
    { roleUuid: 'direct-primary', scopes: ['view:AgentRawSql'] },
    { roleUuid: 'direct-extra', scopes: ['view:AgentContentWrite'] },
    { roleUuid: 'group-primary', scopes: ['view:AgentPublish'] },
    { roleUuid: 'group-extra', scopes: ['view:AgentExternalTools'] },
    { roleUuid: 'system-group-extra', scopes: ['view:AgentDelete'] },
];

describe('UserModel.getAgentRoleAssignments', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;
    let model: UserModel;

    beforeEach(() => {
        tracker = getTracker();
        model = new UserModel({
            database,
            lightdashConfig: {} as LightdashConfig,
            featureFlagModel: {} as FeatureFlagModel,
        });
    });

    afterEach(() => {
        tracker.reset();
    });

    const mockAssignments = () => {
        tracker.on
            .select('from "project_memberships"')
            .response(directMemberships);
        tracker.on
            .select('from "group_memberships"')
            .response(groupMemberships);
        tracker.on
            .select('from "organization_membership_custom_roles"')
            .response([{ role_uuid: 'org-extra' }]);
        tracker.on.select('from "project_membership_custom_roles"').response([
            { project_id: 20, role_uuid: 'direct-extra' },
            { project_id: 20, role_uuid: 'org-extra' },
            { project_id: 21, role_uuid: 'other-direct-extra' },
        ]);
        tracker.on.select('from "project_group_access_custom_roles"').response([
            {
                project_uuid: 'project',
                group_uuid: 'custom-group',
                role_uuid: 'group-extra',
            },
            {
                project_uuid: 'project',
                group_uuid: 'system-group',
                role_uuid: 'system-group-extra',
            },
            {
                project_uuid: 'other-project',
                group_uuid: 'other-group',
                role_uuid: 'other-group-extra',
            },
        ]);
        tracker.on.select('from "scoped_roles"').response(
            customRoles.flatMap(({ roleUuid, scopes }) =>
                scopes.map((scope) => ({
                    role_uuid: roleUuid,
                    scope_name: scope,
                })),
            ),
        );
    };

    it('loads primary and extra roles from organization, direct, and group assignments for the target project', async () => {
        tracker.on.select('from "users"').response([user]);
        mockAssignments();

        const result = await model.getAgentRoleAssignments(
            'user',
            'organization',
            'project',
        );

        expect(result).toEqual({
            systemRoles: [ProjectMemberRole.EDITOR],
            customRoles,
        });
        const scopeQuery = tracker.history.select.find((query) =>
            query.sql.includes('from "scoped_roles"'),
        );
        expect(scopeQuery?.bindings).toEqual(
            customRoles.map(({ roleUuid }) => roleUuid),
        );
        const orgExtras = tracker.history.select.find((query) =>
            query.sql.includes('from "organization_membership_custom_roles"'),
        );
        expect(orgExtras?.bindings).toEqual([10, 1]);
        const groupQuery = tracker.history.select.find((query) =>
            query.sql.includes('from "group_memberships"'),
        );
        expect(groupQuery?.bindings).toEqual([10, 1]);
    });

    it('keeps independent organization and direct system roles alongside group custom roles', async () => {
        tracker.on.select('from "users"').response([
            {
                ...user,
                role: OrganizationMemberRole.VIEWER,
                role_uuid: null,
            },
        ]);
        tracker.on.select('from "project_memberships"').responseOnce([
            {
                ...directMemberships[0],
                role: ProjectMemberRole.DEVELOPER,
                role_uuid: null,
            },
        ]);
        mockAssignments();

        const result = await model.getAgentRoleAssignments(
            'user',
            'organization',
            'project',
        );

        expect(result.systemRoles).toEqual([
            OrganizationMemberRole.VIEWER,
            ProjectMemberRole.DEVELOPER,
            ProjectMemberRole.EDITOR,
        ]);
        expect(result.customRoles).toEqual(
            customRoles.filter(
                ({ roleUuid }) =>
                    !['org-primary', 'direct-primary'].includes(roleUuid),
            ),
        );
    });

    it('uses only organization assignments when no project is targeted', async () => {
        tracker.on.select('from "users"').response([user]);
        tracker.on
            .select('from "organization_membership_custom_roles"')
            .response([{ role_uuid: 'org-extra' }]);
        tracker.on.select('from "scoped_roles"').response([
            { role_uuid: 'org-primary', scope_name: 'view:AgentReadDiscover' },
            { role_uuid: 'org-extra', scope_name: 'view:AgentQuery' },
        ]);

        expect(
            await model.getAgentRoleAssignments('user', 'organization', null),
        ).toEqual({
            systemRoles: [],
            customRoles: [
                { roleUuid: 'org-primary', scopes: ['view:AgentReadDiscover'] },
                { roleUuid: 'org-extra', scopes: ['view:AgentQuery'] },
            ],
        });
        expect(tracker.history.select).toHaveLength(3);
    });

    it('keeps an empty custom role empty instead of granting its fallback system role', async () => {
        tracker.on.select('from "users"').response([user]);
        tracker.on
            .select('from "organization_membership_custom_roles"')
            .response([]);
        tracker.on.select('from "scoped_roles"').response([]);

        expect(
            await model.getAgentRoleAssignments('user', 'organization', null),
        ).toEqual({
            systemRoles: [],
            customRoles: [{ roleUuid: 'org-primary', scopes: [] }],
        });
    });

    it('looks up the user inside the requested organization and refuses missing membership', async () => {
        tracker.on.select('from "users"').response([]);

        await expect(
            model.getAgentRoleAssignments(
                'user',
                'target-organization',
                'project',
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).toContain(
            '"users"."user_uuid" = $1',
        );
        expect(tracker.history.select[0].sql).toContain(
            '"organizations"."organization_uuid" = $2',
        );
        expect(tracker.history.select[0].bindings).toEqual([
            'user',
            'target-organization',
            1,
        ]);
    });
});
