import { createHash } from 'crypto';
import { Knex } from 'knex';

const entriesTable = 'project_context_entries';
const documentTable = 'project_context_document';
const projectsTable = 'projects';

// Frozen copies of app logic (migrations must not import @lightdash/common).
const normalizeContent = (content: string): string =>
    content.trim().replace(/\s+/g, ' ');

const computeHash = (content: string, kind: string): string =>
    createHash('sha256')
        .update(`${normalizeContent(content)}${kind}`)
        .digest('hex');

type BlobEntry = {
    id?: string;
    kind: 'definition' | 'context';
    content: string;
    terms?: string[];
    objects?: unknown[];
    title?: string;
    apply?: string;
};

// Durable identity for project-context entries: one row per (project, content
// hash). Backfills active rows from the existing per-project JSONB blob so
// agents keep their context before the next ingest/compile.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(entriesTable, (table) => {
        table
            .uuid('project_context_entry_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('CASCADE');
        table.text('hash').notNullable();
        table.text('entry_id').notNullable();
        table.text('kind').notNullable();
        table.text('content').notNullable();
        table.text('title').nullable();
        table.text('apply').nullable();
        table.jsonb('terms').notNullable().defaultTo('[]');
        table.jsonb('objects').notNullable().defaultTo('[]');
        table.text('status').notNullable().defaultTo('active');
        table.integer('cited_count').notNullable().defaultTo(0);
        table.timestamp('last_cited_at', { useTz: false }).nullable();
        table.integer('pulled_count').notNullable().defaultTo(0);
        table.timestamp('last_pulled_at', { useTz: false }).nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        // Also serves as the FK index on project_uuid.
        table.unique(['project_uuid', 'hash']);
    });

    const documents = await knex(documentTable).select(
        'project_uuid',
        'entries',
    );
    for (const document of documents) {
        const entries = (document.entries ?? []) as BlobEntry[];
        const seenHashes = new Set<string>();
        const rows = entries.flatMap((entry) => {
            if (!entry?.content || !entry?.kind) return [];
            const hash = computeHash(entry.content, entry.kind);
            if (seenHashes.has(hash)) return [];
            seenHashes.add(hash);
            return [
                {
                    project_uuid: document.project_uuid,
                    hash,
                    entry_id: entry.id ?? 'entry',
                    kind: entry.kind,
                    content: entry.content,
                    title: entry.title ?? null,
                    apply: entry.apply ?? null,
                    terms: JSON.stringify(entry.terms ?? []),
                    objects: JSON.stringify(entry.objects ?? []),
                    status: 'active' as const,
                },
            ];
        });
        if (rows.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await knex(entriesTable).insert(rows);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(entriesTable);
}
