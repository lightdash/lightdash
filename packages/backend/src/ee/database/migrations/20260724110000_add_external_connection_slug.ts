import { Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';
const UniqueIndexName = 'external_connections_project_uuid_slug_unique';

// Migrations are frozen in time: local copy of generateSlug from
// packages/common/src/utils/slugs.ts rather than an application import.
const generateSlug = (name: string): string => {
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (sanitized.length === 0) {
        return Math.random().toString(36).substring(2, 7);
    }
    return sanitized;
};

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(ExternalConnectionsTableName, 'slug')) {
        return;
    }

    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.text('slug').nullable();
    });

    // Backfill every row (the column becomes NOT NULL, so soft-deleted rows
    // need slugs too). Active rows are ordered first so they win base slugs
    // over deleted rows; dedupe spans live + deleted rows per project so a
    // restored row can never collide.
    const connections = await knex(ExternalConnectionsTableName)
        .orderByRaw('(deleted_at IS NOT NULL), created_at, ??', [
            'external_connection_uuid',
        ])
        .select<
            {
                external_connection_uuid: string;
                project_uuid: string;
                name: string;
            }[]
        >('external_connection_uuid', 'project_uuid', 'name');

    const usedSlugsByProject = new Map<string, Set<string>>();
    const updates: { uuid: string; slug: string }[] = [];

    for (const connection of connections) {
        const baseSlug = generateSlug(connection.name);
        const used =
            usedSlugsByProject.get(connection.project_uuid) ??
            new Set<string>();
        let slug = baseSlug;
        let inc = 0;
        while (used.has(slug)) {
            inc += 1;
            slug = `${baseSlug}-${inc}`;
        }
        used.add(slug);
        usedSlugsByProject.set(connection.project_uuid, used);
        updates.push({ uuid: connection.external_connection_uuid, slug });
    }

    // Raw update: the typed update shape deliberately excludes `slug`
    // (immutable in application code), and there is no updated_at trigger so
    // a slug-only update leaves updated_at untouched.
    await Promise.all(
        updates.map(({ uuid, slug }) =>
            knex.raw(
                `UPDATE ${ExternalConnectionsTableName} SET slug = ? WHERE external_connection_uuid = ?`,
                [slug, uuid],
            ),
        ),
    );

    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.text('slug').notNullable().alter();
    });

    // Partial unique index: uniqueness only among live rows, matching the
    // soft-delete semantics of the table. Raw SQL because Knex's unique()
    // cannot express partial indexes.
    await knex.raw(
        `CREATE UNIQUE INDEX ${UniqueIndexName} ON ${ExternalConnectionsTableName} (project_uuid, slug) WHERE deleted_at IS NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(ExternalConnectionsTableName, 'slug'))) {
        return;
    }

    await knex.raw(`DROP INDEX IF EXISTS ${UniqueIndexName}`);
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('slug');
    });
}
