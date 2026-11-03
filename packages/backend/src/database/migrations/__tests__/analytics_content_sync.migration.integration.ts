import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { AnalyticsContentSyncModel } from '../../../models/AnalyticsContentSyncModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261103130000_create_analytics_content_sync';

describe('analytics content sync persistence', () => {
    let migrated: MigratedDatabase;
    let model: AnalyticsContentSyncModel;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        model = new AnalyticsContentSyncModel({ database: migrated.database });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const fixture = async () => {
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: `analytics sync ${randomUUID()}` })
            .returning('*');
        const createProject = async (managed: boolean) => {
            const [project] = await migrated
                .database('projects')
                .insert({
                    name: 'Analytics sync project',
                    organization_id: organization.organization_id,
                    project_type: ProjectType.DEFAULT,
                    dbt_connection: null,
                    dbt_connection_type: null,
                    copied_from_project_uuid: null,
                    dbt_version: DefaultSupportedDbtVersion,
                    organization_warehouse_credentials_uuid: null,
                    created_by_user_uuid: null,
                    provisioning_source: managed ? 'analytics' : null,
                })
                .returning('project_uuid');
            return project.project_uuid;
        };
        return {
            organizationUuid: organization.organization_uuid,
            organizationName: organization.organization_name,
            createProject,
        };
    };

    it('records manual synchronization without creating an identity, then preserves it when the worker is needed', async () => {
        const { createProject } = await fixture();
        const projectUuid = await createProject(true);
        expect(await model.get(projectUuid)).toBeNull();
        await model.markSynced(projectUuid, {
            hash: 'manual-definition-hash',
            version: '3.128.5',
        });
        const manuallySynced = await model.get(projectUuid);
        expect(manuallySynced).toEqual({
            systemUserUuid: null,
            appliedHash: 'manual-definition-hash',
            appliedVersion: '3.128.5',
            lastSyncedAt: expect.any(Date),
        });
        const user = await model.getOrCreateSystemUser(projectUuid);
        expect(await model.get(projectUuid)).toEqual({
            ...manuallySynced,
            systemUserUuid: user.userUuid,
        });
        await model.markSynced(projectUuid, {
            hash: 'automatic-definition-hash',
            version: '3.128.6',
        });
        expect(await model.get(projectUuid)).toMatchObject({
            systemUserUuid: user.userUuid,
            appliedHash: 'automatic-definition-hash',
            appliedVersion: '3.128.6',
        });
    });

    it('creates a single inactive internal identity under concurrent requests without credentials or memberships', async () => {
        const { createProject } = await fixture();
        const projectUuid = await createProject(true);
        const before = await migrated
            .database('users')
            .where({ is_internal: true })
            .count<{ count: string }[]>('* as count');
        const [first, second] = await Promise.all([
            model.getOrCreateSystemUser(projectUuid),
            model.getOrCreateSystemUser(projectUuid),
        ]);
        expect(second).toEqual(first);
        expect(first).toMatchObject({
            userUuid: expect.any(String),
            userId: expect.any(Number),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });
        const after = await migrated
            .database('users')
            .where({ is_internal: true })
            .count<{ count: string }[]>('* as count');
        expect(Number(after[0].count) - Number(before[0].count)).toBe(1);
        expect(
            await migrated
                .database('users')
                .where('user_uuid', first.userUuid)
                .first(),
        ).toMatchObject({
            first_name: 'Analytics system',
            last_name: '',
            is_internal: true,
            is_active: false,
        });
        expect(
            await migrated
                .database('organization_memberships')
                .where('user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('project_memberships')
                .where('user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated.database('emails').where('user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('service_accounts')
                .where('service_account_user_uuid', first.userUuid),
        ).toEqual([]);
        expect(
            await migrated
                .database('password_logins')
                .where('user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('openid_identities')
                .where('user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('personal_access_tokens')
                .where('created_by_user_id', first.userId),
        ).toEqual([]);
    });

    it('rejects non-managed and missing projects without leaving a user behind', async () => {
        const { createProject } = await fixture();
        const projectUuid = await createProject(false);
        const before = await migrated
            .database('users')
            .count<{ count: string }[]>('* as count');
        await expect(model.getOrCreateSystemUser(projectUuid)).rejects.toThrow(
            'Analytics project not found',
        );
        await expect(model.getOrCreateSystemUser(randomUUID())).rejects.toThrow(
            'Analytics project not found',
        );
        expect(await model.get(projectUuid)).toBeNull();
        expect(
            await migrated
                .database('users')
                .count<{ count: string }[]>('* as count'),
        ).toEqual(before);
    });

    it('pages only marked analytics projects with an organization-scoped UUID cursor', async () => {
        const f = await fixture();
        const projects = await Promise.all([
            f.createProject(true),
            f.createProject(true),
            f.createProject(true),
        ]);
        const unmanaged = await f.createProject(false);
        const other = await fixture();
        const otherProject = await other.createProject(true);
        projects.sort();
        const first = await model.getProjectsPage({
            organizationUuid: f.organizationUuid,
            afterProjectUuid: null,
            limit: 2,
        });
        const second = await model.getProjectsPage({
            organizationUuid: f.organizationUuid,
            afterProjectUuid: first[1].projectUuid,
            limit: 2,
        });
        expect([...first, ...second].map((p) => p.projectUuid)).toEqual(
            projects,
        );
        expect(await model.getProject(projects[0])).toEqual({
            projectUuid: projects[0],
            organizationUuid: f.organizationUuid,
            organizationName: f.organizationName,
        });
        expect(await model.getProject(unmanaged)).toBeNull();
        expect(await model.getProject(randomUUID())).toBeNull();
        const all = await model.getProjectsPage({
            organizationUuid: null,
            afterProjectUuid: null,
            limit: 100,
        });
        expect(all.map((p) => p.projectUuid)).toContain(otherProject);
        expect(all.map((p) => p.projectUuid)).not.toContain(unmanaged);
    });

    it('enforces principal foreign keys and cascades sync state when its project is deleted', async () => {
        const { createProject } = await fixture();
        const projectUuid = await createProject(true);
        const user = await model.getOrCreateSystemUser(projectUuid);
        await expect(
            migrated
                .database('analytics_content_sync')
                .where('project_uuid', projectUuid)
                .update({ system_user_uuid: randomUUID() }),
        ).rejects.toMatchObject({ code: '23503' });
        expect((await model.get(projectUuid))?.systemUserUuid).toBe(
            user.userUuid,
        );
        await migrated
            .database('projects')
            .where('project_uuid', projectUuid)
            .delete();
        expect(await model.get(projectUuid)).toBeNull();
    });

    it('can reverse and reapply the migration on the real schema', async () => {
        await down(migrated.database);
        expect(
            await migrated.database.schema.hasTable('analytics_content_sync'),
        ).toBe(false);
        await up(migrated.database);
        expect(
            await migrated.database.schema.hasTable('analytics_content_sync'),
        ).toBe(true);
    });
});
