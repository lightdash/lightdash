import { ProjectType } from '@lightdash/common';
import { randomUUID } from 'crypto';
import knex, { Knex } from 'knex';
import { UsageDimensionsModel } from './UsageDimensionsModel';

describe.skipIf(!process.env.USAGE_DIMENSIONS_SMOKE_PGPORT)(
    'usage processing organization eligibility',
    () => {
        let db: Knex;
        let schema: string;
        const read = async (organizationUuid?: string) => {
            const organizations = [];
            for await (const organization of new UsageDimensionsModel(
                db,
                'https://example.com',
            ).getOrganizations(organizationUuid)) {
                organizations.push(organization);
            }
            return organizations;
        };

        beforeEach(async () => {
            schema = `usage_orgs_${randomUUID().replaceAll('-', '')}`;
            db = knex({
                client: 'pg',
                connection: {
                    host: 'localhost',
                    port: Number(process.env.USAGE_DIMENSIONS_SMOKE_PGPORT),
                    user: process.env.PGUSER ?? 'postgres',
                    password: process.env.PGPASSWORD ?? 'password',
                    database: process.env.PGDATABASE ?? 'postgres',
                },
                searchPath: [schema],
                pool: { min: 0, max: 1 },
            });
            await db.raw('CREATE SCHEMA ??', [schema]);
            await db.raw(`
                CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid UNIQUE);
                CREATE TABLE projects (project_id integer PRIMARY KEY, organization_id integer, project_type text, provisioning_source text);
                INSERT INTO organizations SELECT n, md5('org-' || n)::uuid FROM generate_series(1, 2010) n;
                INSERT INTO projects SELECT n, n, 'DEFAULT', null FROM generate_series(2, 2010, 2) n;
                INSERT INTO projects VALUES (3000, 2, 'PREVIEW', null), (3001, 2, 'DEFAULT', 'analytics');
                UPDATE projects SET project_type = 'PREVIEW' WHERE project_id = 4;
                UPDATE projects SET project_type = 'PLAYGROUND' WHERE project_id = 6;
                UPDATE projects SET provisioning_source = 'analytics' WHERE project_id = 8;
            `);
        });

        afterEach(async () => {
            await db.raw('DROP SCHEMA ?? CASCADE', [schema]);
            await db.destroy();
        });

        it('skips projectless organizations and paginates without duplicates across all project types', async () => {
            const organizations = await read();
            expect(organizations.map((org) => org.organization_id)).toEqual(
                Array.from({ length: 1005 }, (_, index) => (index + 1) * 2),
            );
        });

        it('keeps explicit organization runs scoped even without projects', async () => {
            const organization = await db('organizations')
                .where('organization_id', 1)
                .first();
            if (!organization) throw new Error('Expected seeded organization');
            expect(await read(organization.organization_uuid)).toEqual([
                organization,
            ]);
            expect(await read(randomUUID())).toEqual([]);
        });

        it('includes an organization after its first project is created', async () => {
            expect(
                (await read()).some((org) => org.organization_id === 1),
            ).toBe(false);
            await db.raw(
                'INSERT INTO projects (project_id, organization_id, project_type) VALUES (?, ?, ?)',
                [3002, 1, ProjectType.DEFAULT],
            );
            expect(
                (await read()).some((org) => org.organization_id === 1),
            ).toBe(true);
        });
    },
);
