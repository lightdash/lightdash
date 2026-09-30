import {
    DimensionType,
    FieldType,
    Format,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    getSlackTableBlocks,
    SLACK_TABLE_MAX_ROWS,
    type SlackTablePreview,
} from './slackTableBlocks';

const fields: ItemsMap = {
    month: {
        name: 'month',
        label: 'Month',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    },
    revenue: {
        name: 'revenue',
        label: 'Revenue',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.NUMBER,
        format: Format.USD,
    },
};

const preview = (
    rows: Record<string, unknown>[],
    overrides: Partial<SlackTablePreview> = {},
): SlackTablePreview => ({
    blockId: 'table-1',
    title: 'Monthly revenue',
    url: 'https://lightdash.test/explore/orders',
    status: 'ready',
    queryResults: { rows, fields },
    truncated: false,
    ...overrides,
});

const cellSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('raw_text'), text: z.string().min(1) }),
    z.object({
        type: z.literal('raw_number'),
        value: z.number().finite(),
        text: z.string().min(1),
    }),
]);
const tableSchema = z.object({
    type: z.literal('data_table'),
    block_id: z.string(),
    caption: z.string().min(1),
    rows: z.array(z.array(cellSchema).min(1).max(20)).min(2).max(201),
    page_size: z.number().int().min(1).max(100),
});

const tablesFrom = (previews: SlackTablePreview[]) =>
    z
        .array(tableSchema)
        .parse(
            getSlackTableBlocks(previews).filter(
                (block) => block.type === 'data_table',
            ),
        );

const cellCharacters = (table: z.infer<typeof tableSchema>) =>
    table.rows.flat().reduce((total, cell) => total + cell.text.length, 0);

describe('getSlackTableBlocks', () => {
    it('renders multiple native tables as sibling blocks with an agent-thread link each', () => {
        const blocks = getSlackTableBlocks([
            preview([{ month: 'September', revenue: 1200 }]),
            preview([{ month: 'August', revenue: 1000 }], {
                blockId: 'table-2',
                title: 'Previous month',
            }),
        ]);

        expect(blocks.map((block) => block.type)).toEqual([
            'data_table',
            'actions',
            'data_table',
            'actions',
        ]);
        expect(blocks[1]).toMatchObject({
            elements: [
                {
                    type: 'button',
                    text: { text: 'Open agent thread' },
                    url: 'https://lightdash.test/explore/orders',
                },
            ],
        });
        expect(
            tablesFrom([preview([{ month: 'September', revenue: 1200 }])])[0],
        ).toMatchObject({
            caption: 'Preview: Monthly revenue',
            rows: [
                [
                    { type: 'raw_text', text: 'Month' },
                    { type: 'raw_text', text: 'Revenue' },
                ],
                [
                    { type: 'raw_text', text: 'September' },
                    { type: 'raw_number', value: 1200, text: '$1,200.00' },
                ],
            ],
        });
    });

    it('adds a CSV export action only to a ready table with an artifact link', () => {
        const blocks = getSlackTableBlocks([
            preview([{ month: 'September' }], {
                downloadUrl:
                    'https://lightdash.test/thread?downloadArtifactUuid=a&downloadVersionUuid=v',
            }),
        ]);

        expect(blocks[1]).toMatchObject({
            type: 'actions',
            elements: [
                { text: { text: 'Open agent thread' } },
                {
                    text: { text: 'Export CSV in Lightdash' },
                    url: 'https://lightdash.test/thread?downloadArtifactUuid=a&downloadVersionUuid=v',
                },
            ],
        });
    });

    it('preserves formatted numbers without treating numeric strings or nulls as numbers', () => {
        const table = tablesFrom([
            preview([
                { revenue: 1200 },
                { revenue: '1200' },
                { revenue: null },
                { revenue: undefined },
                { revenue: Number.POSITIVE_INFINITY },
            ]),
        ])[0];

        expect(table.rows).toEqual([
            [{ type: 'raw_text', text: 'Revenue' }],
            [{ type: 'raw_number', value: 1200, text: '$1,200.00' }],
            [{ type: 'raw_text', text: '$1,200.00' }],
            [{ type: 'raw_text', text: '∅' }],
            [{ type: 'raw_text', text: '-' }],
            [{ type: 'raw_text', text: expect.any(String) }],
        ]);
    });

    it('uses nonempty text for empty values and falls back to the field id for unknown labels', () => {
        expect(tablesFrom([preview([{ unknown: '' }])])[0].rows).toEqual([
            [{ type: 'raw_text', text: 'unknown' }],
            [{ type: 'raw_text', text: '—' }],
        ]);
    });

    it('explains empty results, missing columns and unavailable previews separately', () => {
        for (const [rows, message] of [
            [[], 'This query returned no rows.'],
            [[{}], 'No columns are available for this Slack preview.'],
        ] as const) {
            const blocks = getSlackTableBlocks([preview([...rows])]);
            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toMatchObject({
                type: 'section',
                text: { text: expect.stringContaining(message) },
                accessory: { url: 'https://lightdash.test/explore/orders' },
            });
            expect(tablesFrom([preview([...rows])])).toEqual([]);
        }
        const unavailable: SlackTablePreview = {
            blockId: 'unavailable',
            title: 'Monthly revenue',
            url: 'https://lightdash.test/threads/thread',
            status: 'unavailable',
        };
        expect(getSlackTableBlocks([unavailable])[0]).toMatchObject({
            text: { text: expect.stringContaining('preview unavailable') },
            accessory: { text: { text: 'Open agent thread' } },
        });
    });

    it('caps row and column counts and discloses the preview limits', () => {
        const rows = Array.from({ length: 250 }, () =>
            Object.fromEntries(
                Array.from({ length: 25 }, (_, i) => [`field_${i}`, i]),
            ),
        );
        const blocks = getSlackTableBlocks([preview(rows)]);
        const table = tablesFrom([preview(rows)])[0];

        expect(table.rows).toHaveLength(SLACK_TABLE_MAX_ROWS + 1);
        expect(table.rows.every((row) => row.length === 20)).toBe(true);
        expect(blocks[1]).toMatchObject({
            type: 'context',
            elements: [
                {
                    text: 'Showing 200 of 250 preview rows. Showing 20 of 25 columns.',
                },
            ],
        });
    });

    it('shares the cell character budget across tables without shortening cell values', () => {
        const rows = Array.from({ length: 200 }, () => ({
            text: 'x'.repeat(1000),
        }));
        const previews = [
            preview(rows, { truncated: true }),
            preview(rows, { blockId: 'table-2' }),
        ];
        const tables = tablesFrom(previews);
        const blocks = getSlackTableBlocks(previews);

        expect(tables).toHaveLength(2);
        expect(
            tables.reduce((sum, table) => sum + cellCharacters(table), 0),
        ).toBeLessThanOrEqual(20_000);
        expect(tables.every((table) => table.rows.length > 2)).toBe(true);
        expect(tables[0].rows[1][0].text).toBe('x'.repeat(1000));
        expect(blocks[1]).toMatchObject({
            type: 'context',
            elements: [
                {
                    text: expect.stringContaining(
                        'Showing first 9 rows; more rows omitted.',
                    ),
                },
            ],
        });
    });

    it('labels the actual number of rows sent when the query was truncated', () => {
        const rows = Array.from(
            { length: SLACK_TABLE_MAX_ROWS },
            (_, index) => ({
                value: index,
            }),
        );
        const blocks = getSlackTableBlocks([
            preview(rows, { truncated: true }),
        ]);

        expect(blocks[1]).toMatchObject({
            type: 'context',
            elements: [{ text: 'Showing first 200 rows; more rows omitted.' }],
        });
    });

    it('gives a larger table unused capacity from a small selected table', () => {
        const largeRows = Array.from({ length: 150 }, (_, index) => ({
            month: String(index).padEnd(100, 'x'),
        }));
        const tables = tablesFrom([
            preview(largeRows),
            preview([{ month: 'small' }], { blockId: 'table-2' }),
        ]);
        expect(tables[0].rows).toHaveLength(151);
        expect(tables[1].rows).toHaveLength(2);
        expect(
            tables.reduce((sum, table) => sum + cellCharacters(table), 0),
        ).toBeLessThanOrEqual(20_000);
    });

    it('explains when no complete row fits Slack instead of calling the result empty', () => {
        const blocks = getSlackTableBlocks([
            preview([{ month: 'x'.repeat(20_000) }]),
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
            text: { text: expect.stringContaining('No complete row fits') },
            accessory: { text: { text: 'Open agent thread' } },
        });

        const downloadableBlocks = getSlackTableBlocks([
            preview([{ month: 'x'.repeat(20_000) }], {
                downloadUrl: 'https://lightdash.test/download',
            }),
        ]);
        expect(downloadableBlocks[1]).toMatchObject({
            type: 'actions',
            elements: [
                {
                    text: { text: 'Export CSV in Lightdash' },
                    url: 'https://lightdash.test/download',
                },
            ],
        });
    });
});
