import { type ResultRow } from '@lightdash/common';

export type ClipboardColumn = {
    fieldId: string;
    label: string;
};

const getCellText = (row: ResultRow, fieldId: string): string => {
    const value = row[fieldId]?.value;
    // Empty cells paste cleaner than the table's null symbol
    if (!value || value.raw === null || value.raw === undefined) return '';
    if (value.formatted !== undefined && value.formatted !== null) {
        return String(value.formatted);
    }
    return String(value.raw);
};

const escapeCsvCell = (text: string): string =>
    /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/**
 * CSV with a header row of column labels and the formatted value of each cell
 */
export const resultsToCsv = (
    columns: ClipboardColumn[],
    rows: ResultRow[],
): string =>
    [
        columns.map((column) => escapeCsvCell(column.label)).join(','),
        ...rows.map((row) =>
            columns
                .map((column) =>
                    escapeCsvCell(getCellText(row, column.fieldId)),
                )
                .join(','),
        ),
    ].join('\r\n');

/**
 * The same table as HTML, so spreadsheets paste it into separate cells
 */
export const resultsToHtmlTable = (
    columns: ClipboardColumn[],
    rows: ResultRow[],
): string => {
    const header = columns
        .map((column) => `<th>${escapeHtml(column.label)}</th>`)
        .join('');
    const body = rows
        .map(
            (row) =>
                `<tr>${columns
                    .map(
                        (column) =>
                            `<td>${escapeHtml(getCellText(row, column.fieldId))}</td>`,
                    )
                    .join('')}</tr>`,
        )
        .join('');
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
};

// Works where the async Clipboard API is blocked, such as an iframe whose
// host page did not grant clipboard-write
const copyWithExecCommand = (text: string): boolean => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
};

/**
 * Writes CSV as plain text plus an HTML table where the browser allows it.
 * Call it straight from the click, before awaiting anything: the clipboard
 * item is created at once and waits for the rows, so browsers that need a
 * user gesture (Safari) still accept the write.
 */
export const writeResultsToClipboard = async (
    columns: ClipboardColumn[],
    rowsPromise: Promise<ResultRow[]>,
): Promise<void> => {
    const csvPromise = rowsPromise.then((rows) => resultsToCsv(columns, rows));
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const textBlob = csvPromise.then(
            (csv) => new Blob([csv], { type: 'text/plain' }),
        );
        const htmlBlob = rowsPromise.then(
            (rows) =>
                new Blob([resultsToHtmlTable(columns, rows)], {
                    type: 'text/html',
                }),
        );
        // A failed fetch is reported through csvPromise below
        textBlob.catch(() => undefined);
        htmlBlob.catch(() => undefined);
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/plain': textBlob,
                    'text/html': htmlBlob,
                }),
            ]);
            return;
        } catch {
            // Fall back to plain text below
        }
    }
    const csv = await csvPromise;
    try {
        await navigator.clipboard.writeText(csv);
        return;
    } catch {
        // Fall back to the legacy copy command below
    }
    if (!copyWithExecCommand(csv)) {
        throw new Error(
            'Your browser blocked clipboard access. Use Download data instead.',
        );
    }
};
