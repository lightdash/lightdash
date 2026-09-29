import {
    AlreadyExistsError,
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
                'ready',
                { fields: [], configOptions: [] } as never,
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
            (await model.listOrganizationVisualizations(organizationUuid)).data,
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
            (await model.listOrganizationVisualizations(otherOrganizationUuid))
                .data,
        ).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ app_id: app.app_id }),
            ]),
        );
        expect(await model.findApp(app.app_id, projectUuid)).toBeUndefined();
    });

    it('frees an organization name when its chart type is deleted, but keeps the slug reserved', async () => {
        const model = new AppModel({ database: migrated.database });
        const name = `Freed Name ${randomUUID()}`;
        const { app } = await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name, createdByUserUuid: userUuid },
            { version: 1, prompt: 'first prompt' },
            'pending',
        );
        await model.softDeleteOrganizationVisualization(
            app.app_id,
            organizationUuid,
            userUuid,
        );
        const { app: reused } =
            await model.createOrganizationVisualizationWithVersion(
                {
                    organizationUuid,
                    name: name.toLowerCase(),
                    createdByUserUuid: userUuid,
                },
                { version: 1, prompt: 'second prompt' },
                'pending',
            );
        expect(reused.name).toBe(name.toLowerCase());
        expect(reused.slug).toBe(`${app.slug}-1`);
    });

    it('lets another chart type take the name of a deleted one', async () => {
        const model = new AppModel({ database: migrated.database });
        const marker = randomUUID().slice(0, 8);
        const name = `Heatmap ${marker}`;
        const { app: heatmap } =
            await model.createOrganizationVisualizationWithVersion(
                { organizationUuid, name, createdByUserUuid: userUuid },
                { version: 1, prompt: 'heatmap' },
                'pending',
            );
        const { app: other } =
            await model.createOrganizationVisualizationWithVersion(
                {
                    organizationUuid,
                    name: `Treemap ${marker}`,
                    createdByUserUuid: userUuid,
                },
                { version: 1, prompt: 'treemap' },
                'pending',
            );
        await model.softDeleteOrganizationVisualization(
            heatmap.app_id,
            organizationUuid,
            userUuid,
        );

        await expect(
            model.updateOrganizationVisualization(
                other.app_id,
                organizationUuid,
                { name },
            ),
        ).resolves.toMatchObject({ app_id: other.app_id, name });
    });

    it('rejects a chart type uuid that is already taken', async () => {
        const model = new AppModel({ database: migrated.database });
        const appUuid = randomUUID();
        await model.createOrganizationVisualizationWithVersion(
            {
                appUuid,
                organizationUuid,
                name: null,
                createdByUserUuid: userUuid,
            },
            { version: 1, prompt: 'first' },
            'pending',
        );
        await expect(
            model.createOrganizationVisualizationWithVersion(
                {
                    appUuid,
                    organizationUuid,
                    name: null,
                    createdByUserUuid: userUuid,
                },
                { version: 1, prompt: 'second' },
                'pending',
            ),
        ).rejects.toBeInstanceOf(AlreadyExistsError);
    });

    it('creates unnamed chart types with temporary slugs for the auto-namer', async () => {
        const model = new AppModel({ database: migrated.database });
        const appUuid = randomUUID();
        const first = await model.createOrganizationVisualizationWithVersion(
            {
                appUuid,
                organizationUuid,
                name: null,
                createdByUserUuid: userUuid,
            },
            { version: 1, prompt: 'first unnamed' },
            'pending',
        );
        const second = await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name: null, createdByUserUuid: userUuid },
            { version: 1, prompt: 'second unnamed' },
            'pending',
        );

        expect(first.app.app_id).toBe(appUuid);
        expect(first.app.name).toBe('');
        expect(second.app.name).toBe('');
        expect(first.app.slug).toMatch(/^app-\d+$/);
        expect(second.app.slug).not.toBe(first.app.slug);
    });

    it('suffixes a generated name another chart type in the organization holds', async () => {
        const model = new AppModel({ database: migrated.database });
        const name = `Gauge ${randomUUID().slice(0, 8)}`;
        await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name, createdByUserUuid: userUuid },
            { version: 1, prompt: 'named gauge' },
            'pending',
        );
        const { app } = await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name: null, createdByUserUuid: userUuid },
            { version: 1, prompt: 'unnamed gauge' },
            'pending',
        );

        const named = await model.setOrganizationVisualizationMetadataIfUnset(
            app.app_id,
            organizationUuid,
            { name: name.toUpperCase(), description: 'A gauge', icon: null },
        );
        expect(named.name).toBe(`${name.toUpperCase()} 2`);
        expect(named.slug).toBe(`${name.toLowerCase().replace(' ', '-')}-2`);
        expect(named.description).toBe('A gauge');

        const unchanged =
            await model.setOrganizationVisualizationMetadataIfUnset(
                app.app_id,
                organizationUuid,
                { name: 'Something else', description: 'Other' },
            );
        expect(unchanged.name).toBe(named.name);
        expect(unchanged.slug).toBe(named.slug);
        expect(unchanged.description).toBe('A gauge');
    });

    it('lists and finds chart types with their latest ready schema', async () => {
        const model = new AppModel({ database: migrated.database });
        const schema = { fields: [], configOptions: [] };
        const marker = randomUUID().slice(0, 8);
        const ready = await model.createOrganizationVisualizationWithVersion(
            {
                organizationUuid,
                name: `Sankey ${marker}`,
                createdByUserUuid: userUuid,
            },
            { version: 1, prompt: 'sankey' },
            'ready',
            schema as never,
        );
        const pending = await model.createOrganizationVisualizationWithVersion(
            {
                organizationUuid,
                name: `Sunburst ${marker}`,
                createdByUserUuid: userUuid,
            },
            { version: 1, prompt: 'sunburst' },
            'pending',
        );

        const { data } = await model.listOrganizationVisualizations(
            organizationUuid,
            undefined,
            undefined,
            { sortBy: 'name', sortDirection: 'asc' },
        );
        const listedIds = data.map((row) => row.app_id);
        expect(listedIds).toContain(ready.app.app_id);
        expect(listedIds).not.toContain(pending.app.app_id);
        expect(
            data.find((row) => row.app_id === ready.app.app_id)?.viz_schema,
        ).toEqual(schema);
        expect(
            (
                await model.listOrganizationVisualizations(
                    otherOrganizationUuid,
                )
            ).data.map((row) => row.app_id),
        ).not.toContain(ready.app.app_id);

        expect(
            await model.findOrganizationVisualizationByUuidOrSlug(
                organizationUuid,
                ready.app.slug,
            ),
        ).toMatchObject({ app_id: ready.app.app_id, viz_schema: schema });
        expect(
            await model.findOrganizationVisualizationByUuid(
                organizationUuid,
                pending.app.app_id,
            ),
        ).toMatchObject({ app_id: pending.app.app_id, viz_schema: null });
    });

    it('updates, reads versions of, and soft deletes a chart type within its organization', async () => {
        const model = new AppModel({ database: migrated.database });
        const marker = randomUUID().slice(0, 8);
        const taken = `Radar ${marker}`;
        await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name: taken, createdByUserUuid: userUuid },
            { version: 1, prompt: 'radar' },
            'pending',
        );
        const { app } = await model.createOrganizationVisualizationWithVersion(
            {
                organizationUuid,
                name: `Funnel ${marker}`,
                createdByUserUuid: userUuid,
            },
            { version: 1, prompt: 'funnel' },
            'pending',
        );

        await expect(
            model.updateOrganizationVisualization(
                app.app_id,
                organizationUuid,
                {
                    name: taken.toLowerCase(),
                },
            ),
        ).rejects.toThrow(/already exists/);
        await expect(
            model.updateOrganizationVisualization(
                app.app_id,
                otherOrganizationUuid,
                { description: 'moved' },
            ),
        ).rejects.toThrow(/App not found/);
        expect(
            await model.updateOrganizationVisualization(
                app.app_id,
                organizationUuid,
                { name: `Funnel ${marker}`, description: 'Stages' },
            ),
        ).toMatchObject({ description: 'Stages' });

        const withVersions = await model.getOrganizationAppWithVersions(
            app.app_id,
            organizationUuid,
        );
        expect(withVersions.organizationUuid).toBe(organizationUuid);
        expect(withVersions.versions.map((v) => v.prompt)).toEqual(['funnel']);
        await expect(
            model.getOrganizationAppWithVersions(
                app.app_id,
                otherOrganizationUuid,
            ),
        ).rejects.toThrow(/App not found/);

        await model.softDeleteOrganizationVisualization(
            app.app_id,
            organizationUuid,
            userUuid,
        );
        expect(
            await model.findOrganizationVisualizationByUuid(
                organizationUuid,
                app.app_id,
            ),
        ).toBeUndefined();
    });

    it('keeps project and organization version histories apart', async () => {
        const model = new AppModel({ database: migrated.database });
        const projectApp = await model.createWithVersion(
            { project_uuid: projectUuid, created_by_user_uuid: userUuid },
            { version: 1, prompt: 'project app' },
            'pending',
        );
        const orgApp = await model.createOrganizationVisualizationWithVersion(
            { organizationUuid, name: null, createdByUserUuid: userUuid },
            { version: 1, prompt: 'org chart type' },
            'pending',
        );

        const projectHistory = await model.getAppWithVersions(
            projectApp.app.app_id,
            projectUuid,
        );
        expect(projectHistory.organizationUuid).toBe(organizationUuid);
        expect(projectHistory.versions.map((v) => v.prompt)).toEqual([
            'project app',
        ]);
        await expect(
            model.getAppWithVersions(orgApp.app.app_id, projectUuid),
        ).rejects.toThrow(/App not found/);
        await expect(
            model.getOrganizationAppWithVersions(
                projectApp.app.app_id,
                organizationUuid,
            ),
        ).rejects.toThrow(/App not found/);
    });

    it('registers a sandbox without a project', async () => {
        const [row] = await migrated
            .database('sandbox_registry')
            .insert({
                organization_uuid: organizationUuid,
                project_uuid: null,
                provider: 'docker',
                provider_sandbox_id: 'container-1',
                status: 'running',
                workspace: JSON.stringify({ include: [], exclude: [] }),
            })
            .returning(['sandbox_uuid', 'project_uuid']);
        expect(row.project_uuid).toBeNull();
    });
});
