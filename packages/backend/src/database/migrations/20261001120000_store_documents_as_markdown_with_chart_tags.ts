import { type Knex } from 'knex';

const DocumentsTableName = 'documents';
const DocumentVersionsTableName = 'document_versions';

export const classification = {
    kind: 'breaking',
    reason: 'Rewrites Document versions from ordered cells into markdown with chart tags plus a chart map, and drops the cells column',
} as const;

type Cell =
    | { type: 'markdown'; content: { markdown: string } }
    | { type: 'chart'; content: unknown };

type Charts = Record<string, unknown>;

const cellsToMarkdown = (cells: Cell[]) => {
    const charts: Charts = {};
    const blocks = cells.flatMap((cell) => {
        if (cell.type === 'markdown') {
            const markdown = cell.content.markdown.trim();
            return markdown ? [markdown] : [];
        }
        const id = `c${Object.keys(charts).length + 1}`;
        charts[id] = cell.content;
        return [`<document-chart id="${id}">`];
    });
    return { markdown: blocks.join('\n\n'), charts };
};

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
    await knex.schema.alterTable(DocumentVersionsTableName, (table) => {
        table.text('markdown').nullable();
        table.jsonb('chart_data').nullable();
    });

    const versions: Array<{
        document_version_id: number;
        document_id: number;
        content: { cells: Cell[] };
    }> = await knex(DocumentVersionsTableName).select(
        'document_version_id',
        'document_id',
        'content',
    );
    const nextChartNumbers = new Map<number, number>();
    for (const version of versions) {
        const { markdown, charts } = cellsToMarkdown(version.content.cells);
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(
            `UPDATE ${DocumentVersionsTableName} SET markdown = ?, chart_data = ?::jsonb, schema_version = 2 WHERE document_version_id = ?`,
            [markdown, JSON.stringify(charts), version.document_version_id],
        );
        nextChartNumbers.set(
            version.document_id,
            Math.max(
                nextChartNumbers.get(version.document_id) ?? 1,
                Object.keys(charts).length + 1,
            ),
        );
    }
    for (const [documentId, nextChartNumber] of nextChartNumbers) {
        // eslint-disable-next-line no-await-in-loop
        await knex(DocumentsTableName)
            .where('document_id', documentId)
            .update({ next_chart_number: nextChartNumber });
    }

    await knex.schema.alterTable(DocumentVersionsTableName, (table) => {
        table.text('markdown').notNullable().alter();
        table.jsonb('chart_data').notNullable().alter();
        table.dropColumn('content');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentVersionsTableName, (table) => {
        table.jsonb('content').nullable();
    });
    const versions: Array<{
        document_version_id: number;
        markdown: string;
        chart_data: Charts;
    }> = await knex(DocumentVersionsTableName).select(
        'document_version_id',
        'markdown',
        'chart_data',
    );
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
