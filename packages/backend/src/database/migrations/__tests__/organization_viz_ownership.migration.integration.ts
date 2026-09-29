import {
    DATA_APP_VIZ_TEMPLATE,
    DefaultSupportedDbtVersion,
    ProjectType,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { AppModel } from '../../../models/AppModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

describe('organization-owned custom chart type storage', () => {
    let migrated: MigratedDatabase;
    let organizationUuid: string;
    let otherOrganizationUuid: string;
    let projectUuid: string;
    let userUuid: string;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        const { database } = migrated;
        const organizations = await database('organizations')
            .insert([
                { organization_name: 'Chart types A' },
                { organization_name: 'Chart types B' },
            ])
            .returning(['organization_id', 'organization_uuid']);
        organizationUuid = organizations[0].organization_uuid;
        otherOrganizationUuid = organizations[1].organization_uuid;
        const [user] = await database('users')
            .insert({
                first_name: 'Chart',
                last_name: 'Author',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('user_uuid');
        userUuid = user.user_uuid;
        const [project] = await database('projects')
            .insert({
                name: 'Chart project',
                organization_id: organizations[0].organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning('project_uuid');
        projectUuid = project.project_uuid;
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const insertApp = (overrides: Record<string, unknown> = {}) =>
        migrated
            .database('apps')
            .insert({
                app_id: randomUUID(),
                name: `Heatmap ${randomUUID()}`,
                slug: randomUUID(),
                project_uuid: null,
                owner_organization_uuid: organizationUuid,
                template: DATA_APP_VIZ_TEMPLATE,
                created_by_user_uuid: userUuid,
                ...overrides,
            })
            .returning('*');

    it('stores an organization-owned viz with no project and retains its app UUID', async () => {
        const [app] = await insertApp();
        expect(app.project_uuid).toBeNull();
        expect(app.owner_organization_uuid).toBe(organizationUuid);
        expect(app.template).toBe(DATA_APP_VIZ_TEMPLATE);
        expect(app.app_id).toBeDefined();
    });

    it('rejects ownerless, dual-owned, and non-viz organization rows', async () => {
        await expect(
            insertApp({ owner_organization_uuid: null }),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
            insertApp({ project_uuid: projectUuid }),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(insertApp({ template: null })).rejects.toMatchObject({
            code: '23514',
        });
    });

    it('enforces the organization foreign key', async () => {
        await expect(
            insertApp({ owner_organization_uuid: randomUUID() }),
        ).rejects.toMatchObject({ code: '23503' });
    });

    it('reserves organization slugs across soft deletion and names among live rows, scoped per organization', async () => {
        const slug = `chart-${randomUUID()}`;
        await insertApp({
            slug,
            name: 'Unique Heatmap',
            deleted_at: new Date(),
        });
        await expect(insertApp({ slug, name: 'Other' })).rejects.toMatchObject({
            code: '23505',
        });
        await expect(
            insertApp({ name: 'unique heatmap' }),
        ).resolves.toHaveLength(1);
        await expect(
            insertApp({ name: 'UNIQUE HEATMAP' }),
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
            insertApp({
                slug,
                name: 'Unique Heatmap',
                owner_organization_uuid: otherOrganizationUuid,
            }),
        ).resolves.toHaveLength(1);
    });

    it('preserves project-owned apps and their project slug uniqueness', async () => {
        const slug = `project-${randomUUID()}`;
        const [app] = await insertApp({
            project_uuid: projectUuid,
            owner_organization_uuid: null,
            template: null,
            slug,
        });
        expect(app.project_uuid).toBe(projectUuid);
        await expect(
            insertApp({
                project_uuid: projectUuid,
                owner_organization_uuid: null,
                template: null,
                slug,
            }),
        ).rejects.toMatchObject({ code: '23505' });
    });

    it('creates a versioned chart type and scopes model reads to its organization', async () => {
        const model = new AppModel({ database: migrated.database });
        const name = `Organization Heatmap ${randomUUID()}`;
        const { app, version, thread } =
            await model.createOrganizationVisualizationWithVersion(
                {
                    organizationUuid,
                    name,
                    createdByUserUuid: userUuid,
                },
                { version: 1, prompt: 'make a heatmap' },
                'pending',
            );

        expect(app.project_uuid).toBeNull();
        expect(app.template).toBe(DATA_APP_VIZ_TEMPLATE);
        expect(version.app_id).toBe(app.app_id);
        expect(thread.app_id).toBe(app.app_id);
        expect(
            await model.findOrganizationVisualizationByUuid(
                organizationUuid,
                app.app_id,
            ),
        ).toMatchObject({ app_id: app.app_id });
        expect(
            await model.findOrganizationVisualizationBySlug(
                organizationUuid,
                app.slug,
            ),
        ).toMatchObject({ app_id: app.app_id });
        expect(
            await model.listOrganizationVisualizations(organizationUuid),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ app_id: app.app_id }),
            ]),
        );
        expect(
            await model.findOrganizationVisualizationByUuid(
                otherOrganizationUuid,
                app.app_id,
            ),
        ).toBeUndefined();
        expect(
            await model.listOrganizationVisualizations(otherOrganizationUuid),
        ).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ app_id: app.app_id }),
            ]),
        );
        expect(await model.findApp(app.app_id, projectUuid)).toBeUndefined();
    });

    it('rejects a duplicate organization name after the first row is deleted', async () => {
        const model = new AppModel({ database: migrated.database });
        const name = `Reserved Name ${randomUUID()}`;
        const { app } = await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name, createdByUserUuid: userUuid },
            { version: 1, prompt: 'first prompt' },
            'pending',
        );
        await migrated
            .database('apps')
            .where('app_id', app.app_id)
            .update({ deleted_at: new Date() });
        await expect(
            model.createOrganizationVisualizationWithVersion(
                {
                    organizationUuid,
                    name: name.toLowerCase(),
                    createdByUserUuid: userUuid,
                },
                { version: 1, prompt: 'second prompt' },
                'pending',
            ),
        ).rejects.toThrow(/already exists/);
    });
});
