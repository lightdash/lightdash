import {
    formatItemValue,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';
import { type Block, type KnownBlock } from '@slack/web-api';

export const SLACK_TABLE_MAX_ROWS = 200;
const SLACK_TABLE_MAX_COLUMNS = 20;
const SLACK_TABLE_MESSAGE_CHARACTER_BUDGET = 20_000;

export type SlackTableQueryResults = {
    rows: Record<string, unknown>[];
    fields: ItemsMap;
    truncated: boolean;
};

export type SlackTablePreview = {
    blockId: string;
    title: string;
    url: string;
} & (
    | {
          status: 'ready';
          queryResults: Pick<SlackTableQueryResults, 'rows' | 'fields'>;
          truncated: boolean;
      }
    | { status: 'unavailable' }
);

type SlackTableCell =
    | { type: 'raw_text'; text: string }
    | { type: 'raw_number'; value: number; text: string };

// The installed Slack SDK predates data_table, which is a valid Block Kit block.
interface SlackDataTableBlock extends Block {
    type: 'data_table';
    caption: string;
    rows: SlackTableCell[][];
    page_size: number;
}

const shortenText = (text: string, maximum: number): string =>
    text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;

const getThreadButton = (preview: SlackTablePreview) => ({
    type: 'button' as const,
    text: { type: 'plain_text' as const, text: 'Open agent thread' },
    url: preview.url,
    action_id: `actions.explore_card_button_click.${preview.blockId}`,
});

const getThreadLinkBlock = (
    preview: SlackTablePreview,
    title: string,
    message: string,
): KnownBlock => ({
    type: 'section',
    block_id: `${preview.blockId}_link`,
    text: { type: 'plain_text', text: `${title}\n${message}` },
    accessory: getThreadButton(preview),
});

const getTableBudgets = (demands: number[]): number[] => {
    const budgets = demands.map(() => 0);
    const pending = demands
        .map((characters, index) => ({ characters, index }))
        .filter(({ characters }) => characters > 0)
        .sort((left, right) => left.characters - right.characters);
    let remaining = SLACK_TABLE_MESSAGE_CHARACTER_BUDGET;

    for (let index = 0; index < pending.length; index += 1) {
        const share = Math.floor(remaining / (pending.length - index));
        if (pending[index].characters <= share) {
            budgets[pending[index].index] = pending[index].characters;
            remaining -= pending[index].characters;
        } else {
            for (let next = index; next < pending.length; next += 1) {
                const budget = Math.floor(remaining / (pending.length - next));
                budgets[pending[next].index] = budget;
                remaining -= budget;
            }
            break;
        }
    }
    return budgets;
};

/** Native tables sit beside chart cards and share Slack's cell-character budget. */
export const getSlackTableBlocks = (
    previews: SlackTablePreview[],
): (Block | KnownBlock)[] => {
    const prepared = previews.map((preview) => {
        const title = shortenText(
            `Preview: ${preview.title || 'Query results'}`,
            250,
        );
        if (preview.status === 'unavailable') {
            return { kind: 'unavailable' as const, preview, title, demand: 0 };
        }

        const { rows, fields } = preview.queryResults;
        const allFieldIds = Object.keys(rows[0] ?? {});
        const fieldIds = allFieldIds.slice(0, SLACK_TABLE_MAX_COLUMNS);
        const cellText = (value: string) => value || '—';
        const headers: SlackTableCell[] = fieldIds.map((fieldId) => ({
            type: 'raw_text',
            text: cellText(
                fields[fieldId]
                    ? getItemLabelWithoutTableName(fields[fieldId])
                    : fieldId,
            ),
        }));
        const dataRows = rows.slice(0, SLACK_TABLE_MAX_ROWS).map((row) =>
            fieldIds.map((fieldId): SlackTableCell => {
                const value = row[fieldId];
                const text = cellText(formatItemValue(fields[fieldId], value));
                return typeof value === 'number' && Number.isFinite(value)
                    ? { type: 'raw_number', value, text }
                    : { type: 'raw_text', text };
            }),
        );
        const tableRows = [headers, ...dataRows];
        return {
            kind: 'ready' as const,
            preview,
            title,
            allFieldIds,
            fieldIds,
            tableRows,
            demand:
                rows.length === 0 || fieldIds.length === 0
                    ? 0
                    : tableRows
                          .flat()
                          .reduce((total, cell) => total + cell.text.length, 0),
        };
    });
    const budgets = getTableBudgets(prepared.map(({ demand }) => demand));

    return prepared.flatMap((table, tableIndex): (Block | KnownBlock)[] => {
        if (table.kind === 'unavailable') {
            return [
                getThreadLinkBlock(
                    table.preview,
                    table.title,
                    'Could not load this table preview. Open the agent thread to inspect the analysis.',
                ),
            ];
        }

        const { preview, title, allFieldIds, fieldIds, tableRows } = table;
        const { rows } = preview.queryResults;
        if (rows.length === 0) {
            return [
                getThreadLinkBlock(
                    preview,
                    title,
                    'This query returned no rows.',
                ),
            ];
        }
        if (fieldIds.length === 0) {
            return [
                getThreadLinkBlock(
                    preview,
                    title,
                    'No columns are available for this Slack preview.',
                ),
            ];
        }

        const includedRows = [tableRows[0]];
        let characters = tableRows[0].reduce(
            (total, cell) => total + cell.text.length,
            0,
        );
        for (const cells of tableRows.slice(1)) {
            const rowCharacters = cells.reduce(
                (total, cell) => total + cell.text.length,
                0,
            );
            if (characters + rowCharacters > budgets[tableIndex]) break;
            includedRows.push(cells);
            characters += rowCharacters;
        }
        if (includedRows.length < 2) {
            return [
                getThreadLinkBlock(
                    preview,
                    title,
                    'No complete row fits in Slack’s table size limit. Open the agent thread to inspect the analysis.',
                ),
            ];
        }

        const block: SlackDataTableBlock = {
            type: 'data_table',
            block_id: preview.blockId,
            caption: title,
            rows: includedRows,
            page_size: 5,
        };
        const blocks: (Block | KnownBlock)[] = [block];
        const shownRows = includedRows.length - 1;
        const notes: string[] = [];
        if (shownRows < rows.length) {
            notes.push(`Showing ${shownRows} of ${rows.length} preview rows.`);
        }
        if (fieldIds.length < allFieldIds.length) {
            notes.push(
                `Showing ${fieldIds.length} of ${allFieldIds.length} columns.`,
            );
        }
        if (preview.truncated) {
            notes.push('More returned rows were omitted from Slack.');
        }
        if (notes.length > 0) {
            blocks.push({
                type: 'context',
                block_id: `${preview.blockId}_preview_note`,
                elements: [{ type: 'plain_text', text: notes.join(' ') }],
            });
        }
        blocks.push({
            type: 'actions',
            block_id: `${preview.blockId}_actions`,
            elements: [getThreadButton(preview)],
        });
        return blocks;
    });
};
