import { type Knex } from 'knex';

const DocumentsTableName = 'documents';
const DocumentVersionsTableName = 'document_versions';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable markdown and chart_data columns and a defaulted next_chart_number, and makes content nullable; existing rows are not rewritten, so the previous release keeps reading them',
} as const;

type Cell =
    | { type: 'markdown'; content: { markdown: string } }
    | { type: 'chart'; content: unknown };

type Charts = Record<string, unknown>;

const CHART_TAG_LINE_RE = /^<document-chart id="([^"]+)">$/;

const markdownToCells = (markdown: string, charts: Charts): Cell[] => {
    const cells: Cell[] = [];
    let lines: string[] = [];
    const flush = () => {
        const text = lines.join('\n').trim();
        if (text) cells.push({ type: 'markdown', content: { markdown: text } });
        lines = [];
    };
    markdown.split('\n').forEach((line) => {
        const match = CHART_TAG_LINE_RE.exec(line);
        if (match && charts[match[1]] !== undefined) {
            flush();
            cells.push({ type: 'chart', content: charts[match[1]] });
            return;
        }
        lines.push(line);
    });
    flush();
    return cells;
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.integer('next_chart_number').notNullable().defaultTo(1);
    });
    // Existing versions keep their cells; they are read as markdown on load
    await knex.schema.alterTable(DocumentVersionsTableName, (table) => {
        table.text('markdown').nullable();
        table.jsonb('chart_data').nullable();
        table.jsonb('content').nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    // Versions written after the migration only have markdown
    const versions: Array<{
        document_version_id: number;
        markdown: string;
        chart_data: Charts;
    }> = await knex(DocumentVersionsTableName)
        .whereNull('content')
        .select('document_version_id', 'markdown', 'chart_data');
    for (const version of versions) {
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(
            `UPDATE ${DocumentVersionsTableName} SET content = ?::jsonb, schema_version = 1 WHERE document_version_id = ?`,
            [
                JSON.stringify({
                    cells: markdownToCells(
                        version.markdown,
                        version.chart_data,
                    ),
                }),
                version.document_version_id,
            ],
        );
    }
    await knex.schema.alterTable(DocumentVersionsTableName, (table) => {
        table.jsonb('content').notNullable().alter();
        table.dropColumn('markdown');
        table.dropColumn('chart_data');
    });
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.dropColumn('next_chart_number');
    });
}
