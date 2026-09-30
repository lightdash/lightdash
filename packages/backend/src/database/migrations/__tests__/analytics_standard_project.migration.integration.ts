import { randomUUID } from 'node:crypto';
import { down, up } from '../20260930130000_make_analytics_projects_standard';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

describe('Standard analytics projects on real PostgreSQL', () => {
    let migrated: MigratedTestDatabase;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('analytics_standard', {
            edition: 'community',
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('changes only analytics preview types, preserving project identity and other data on repeat runs and rollback', async () => {
        const { database } = migrated;
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Analytics migration test' })
            .returning('organization_id');
        await database<Record<string, unknown>>('projects').insert(
            [
                { project_type: 'PREVIEW', provisioning_source: 'analytics' },
                { project_type: 'PREVIEW', provisioning_source: null },
                { project_type: 'DEFAULT', provisioning_source: null },
                { project_type: 'TRAINING', provisioning_source: 'training' },
            ].map((project, i) => ({
                ...project,
                project_uuid: randomUUID(),
                slug: `analytics-migration-${i}`,
                name: `Project ${i}`,
                organization_id: organization.organization_id,
            })),
        );
        const before = await database('projects')
            .select('*')
            .orderBy('project_id');
        const expected = before.map((project) => ({
            ...project,
            project_type:
                project.provisioning_source === 'analytics'
                    ? 'DEFAULT'
                    : project.project_type,
        }));

        await up(database);
        expect(
            await database('projects').select('*').orderBy('project_id'),
        ).toEqual(expected);
        await up(database);
        expect(
            await database('projects').select('*').orderBy('project_id'),
        ).toEqual(expected);
        await down(database);
        expect(
            await database('projects').select('*').orderBy('project_id'),
        ).toEqual(before);
    });
});
