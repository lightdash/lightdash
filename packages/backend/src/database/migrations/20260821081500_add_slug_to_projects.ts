import { Knex } from 'knex';

const ProjectsTableName = 'projects';
const SlugUniqueConstraint = 'projects_organization_id_slug_unique';

const slugifyName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted project slug without breaking older writers',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.alterTable(ProjectsTableName, (table) => {
        table
            .text('slug')
            .notNullable()
            .defaultTo(knex.raw(`'project-' || uuid_generate_v4()::text`));
    });

    const projects = await knex(ProjectsTableName)
        .select('project_uuid', 'organization_id', 'name')
        .orderBy('organization_id')
        .orderBy('created_at')
        .orderBy('project_uuid');

    const slugsByOrganization = new Map<number, Set<string>>();
    /* eslint-disable no-await-in-loop */
    for (const project of projects) {
        const organizationSlugs =
            slugsByOrganization.get(project.organization_id) ??
            new Set<string>();
        slugsByOrganization.set(project.organization_id, organizationSlugs);

        const generatedBase = slugifyName(project.name);
        const baseSlug = generatedBase || `project-${project.project_uuid}`;
        let slug = baseSlug;
        let suffix = 1;
        while (organizationSlugs.has(slug)) {
            slug = `${baseSlug}-${suffix}`;
            suffix += 1;
        }
        organizationSlugs.add(slug);

        await knex.raw(
            `UPDATE ${ProjectsTableName} SET slug = ? WHERE project_uuid = ?`,
            [slug, project.project_uuid],
        );
    }
    /* eslint-enable no-await-in-loop */

    await knex.schema.alterTable(ProjectsTableName, (table) => {
        table.unique(['organization_id', 'slug'], {
            indexName: SlugUniqueConstraint,
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.alterTable(ProjectsTableName, (table) => {
        table.dropUnique(['organization_id', 'slug'], SlugUniqueConstraint);
        table.dropColumn('slug');
    });
}
