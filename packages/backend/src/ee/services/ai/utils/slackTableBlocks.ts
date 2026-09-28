import {
    formatItemValue,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';
import { type Block, type KnownBlock } from '@slack/web-api';

export const SLACK_TABLE_MAX_ROWS = 200;
const SLACK_TABLE_MAX_COLUMNS = 20;
const SLACK_TABLE_MAX_CELL_CHARACTERS = 500;
const SLACK_TABLE_MESSAGE_CHARACTER_BUDGET = 20_000;

export type SlackTablePreview = {
    blockId: string;
    title: string;
    url: string;
    queryResults: {
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    };
    truncated: boolean;
};

export type SlackTableQueryResults = SlackTablePreview['queryResults'] & {
    truncated: boolean;
};

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

const getExploreButton = (preview: SlackTablePreview) => ({
    type: 'button' as const,
    text: { type: 'plain_text' as const, text: 'Explore in Lightdash' },
    url: preview.url,
    action_id: `actions.explore_card_button_click.${preview.blockId}`,
});

/** Native tables sit beside chart cards in the final answer. Every table shares
 * Slack's aggregate cell-character budget, rather than consuming it separately. */
export const getSlackTableBlocks = (
    previews: SlackTablePreview[],
): (Block | KnownBlock)[] => {
    let remainingCharacters = SLACK_TABLE_MESSAGE_CHARACTER_BUDGET;

    return previews.flatMap((preview, previewIndex): (Block | KnownBlock)[] => {
        const { rows, fields } = preview.queryResults;
        const allFieldIds = Object.keys(rows[0] ?? {});
        const fieldIds = allFieldIds.slice(0, SLACK_TABLE_MAX_COLUMNS);
        const title = shortenText(preview.title || 'Query results', 250);
        const characterBudget = Math.floor(
            remainingCharacters / (previews.length - previewIndex),
        );
        let shortenedCells = false;
        const cellText = (value: string) => {
            const text = value || '—';
            const shortened = shortenText(
                text,
                SLACK_TABLE_MAX_CELL_CHARACTERS,
            );
            shortenedCells ||= shortened !== text;
            return shortened;
        };
        const headers: SlackTableCell[] = fieldIds.map((fieldId) => ({
            type: 'raw_text',
            text: cellText(
                fields[fieldId]
                    ? getItemLabelWithoutTableName(fields[fieldId])
                    : fieldId,
            ),
        }));
        const tableRows = [headers];
        let characters = headers.reduce(
            (total, cell) => total + cell.text.length,
            0,
        );

        for (const row of rows.slice(0, SLACK_TABLE_MAX_ROWS)) {
            const cells = fieldIds.map((fieldId): SlackTableCell => {
                const value = row[fieldId];
                const text = cellText(formatItemValue(fields[fieldId], value));
                return typeof value === 'number' && Number.isFinite(value)
                    ? { type: 'raw_number', value, text }
                    : { type: 'raw_text', text };
            });
            const rowCharacters = cells.reduce(
                (total, cell) => total + cell.text.length,
                0,
            );
            if (characters + rowCharacters > characterBudget) break;
            tableRows.push(cells);
            characters += rowCharacters;
        }

        if (fieldIds.length === 0 || tableRows.length < 2) {
            return [
                {
                    type: 'section',
                    block_id: `${preview.blockId}_link`,
                    text: {
                        type: 'plain_text',
                        text: `${title}\n${rows.length === 0 ? 'No rows available to preview.' : 'Open in Lightdash to view the table.'}`,
                    },
                    accessory: getExploreButton(preview),
                },
            ];
        }

        remainingCharacters -= characters;
        const table: SlackDataTableBlock = {
            type: 'data_table',
            block_id: preview.blockId,
            caption: title,
            rows: tableRows,
            page_size: 5,
        };
        const blocks: (Block | KnownBlock)[] = [table];
        const shownRows = tableRows.length - 1;
        const notes: string[] = [];
        if (shownRows < rows.length) {
            notes.push(
                `Showing ${shownRows} of ${rows.length} available rows.`,
            );
        }
        if (fieldIds.length < allFieldIds.length) {
            notes.push(
                `Showing ${fieldIds.length} of ${allFieldIds.length} columns.`,
            );
        }
        if (shortenedCells) notes.push('Some cell values were shortened.');
        if (preview.truncated) {
            notes.push('Additional rows are available in Lightdash.');
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
            elements: [getExploreButton(preview)],
        });
        return blocks;
    });
};
