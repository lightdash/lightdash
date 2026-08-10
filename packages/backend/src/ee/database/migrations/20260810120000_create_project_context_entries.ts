import { createHash } from 'crypto';
import { Knex } from 'knex';

const ProjectContextEntriesTableName = 'project_context_entries';
const ProjectContextDocumentTableName = 'project_context_document';

// Frozen copies of the identity helpers: a migration must not drift with the
// application code it backfills from.
const normalizeContent = (content: string): string =>
    content.trim().replace(/\s+/g, ' ');

const hashEntry = (content: string, kind: string): string =>
    createHash('sha256')
        .update(`${normalizeContent(content)}\n${kind}`)
        .digest('hex');

const buildSlug = (fileId: string, hash: string): string => {
    const prefix = fileId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/g, '');
    const suffix = hash.slice(0, 8);
    return prefix === '' ? `entry-${suffix}` : `${prefix}-${suffix}`;
};

type LegacyEntry = {
    id?: unknown;
    kind?: unknown;
    content?: unknown;
    terms?: unknown;
    objects?: unknown;
    title?: unknown;
    apply?: unknown;
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ProjectContextEntriesTableName, (table) => {
        table
            .uuid('project_context_entry_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('hash').notNullable();
        table.text('slug').notNullable();
        table.text('file_id').notNullable();
        table.text('kind').notNullable();
        table.text('content').notNullable();
        table.text('title').nullable();
        table.text('apply').nullable();
        table.jsonb('terms').notNullable().defaultTo('[]');
        table.jsonb('objects').notNullable().defaultTo('[]');
        table.text('status').notNullable().defaultTo('active');
        table.integer('position').notNullable().defaultTo(0);
        table.text('predecessor_hash').nullable();
        table.integer('cited_count').notNullable().defaultTo(0);
        table.timestamp('last_cited_at', { useTz: false }).nullable();
        table.integer('pulled_count').notNullable().defaultTo(0);
        table.timestamp('last_pulled_at', { useTz: false }).nullable();
        table
            .timestamp('generated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('removed_at', { useTz: false }).nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'hash']);
    });

    // Citation resolution matches the hash prefix carried by the slug, so a
    // renamed file id never breaks a persisted citation.
    await knex.raw(`
        CREATE INDEX project_context_entries_hash_prefix
        ON ${ProjectContextEntriesTableName} (project_uuid, left(hash, 8))
    `);
    await knex.raw(`
        CREATE INDEX project_context_entries_active
        ON ${ProjectContextEntriesTableName} (project_uuid, position)
        WHERE status = 'active'
    `);
    await knex.raw(`
        CREATE INDEX project_context_entries_predecessor
        ON ${ProjectContextEntriesTableName} (project_uuid, predecessor_hash)
        WHERE predecessor_hash IS NOT NULL
    `);

    // Backfill from the cached blob so the agent keeps its context between this
    // deploy and the next ingest. One source row per project, but a session
    // statement_timeout must not kill it half way.
    await knex.raw('SET statement_timeout = 0');
    const documents = await knex(ProjectContextDocumentTableName).select(
        'project_uuid',
        'entries',
    );
    const rows = documents.flatMap(
        (document: { project_uuid: string; entries: unknown }) => {
            const entries = Array.isArray(document.entries)
                ? (document.entries as LegacyEntry[])
                : [];
            const seen = new Set<string>();
            return entries.flatMap((entry, position) => {
                if (
                    typeof entry?.content !== 'string' ||
                    typeof entry?.kind !== 'string' ||
                    typeof entry?.id !== 'string'
                ) {
                    return [];
                }
                const hash = hashEntry(entry.content, entry.kind);
                if (seen.has(hash)) return [];
                seen.add(hash);
                return [
                    {
                        project_uuid: document.project_uuid,
                        hash,
                        slug: buildSlug(entry.id, hash),
                        file_id: entry.id,
                        kind: entry.kind,
                        content: entry.content,
                        title:
                            typeof entry.title === 'string'
                                ? entry.title
                                : null,
                        apply:
                            typeof entry.apply === 'string'
                                ? entry.apply
                                : null,
                        terms: JSON.stringify(
                            Array.isArray(entry.terms) ? entry.terms : [],
                        ),
                        objects: JSON.stringify(
                            Array.isArray(entry.objects) ? entry.objects : [],
                        ),
                        status: 'active',
                        position,
                    },
                ];
            });
        },
    );

    try {
        if (rows.length > 0) {
            await knex.batchInsert(ProjectContextEntriesTableName, rows, 500);
        }
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ProjectContextEntriesTableName);
}
