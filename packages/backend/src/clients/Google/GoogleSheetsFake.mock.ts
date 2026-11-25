import { type AnyType } from '@lightdash/common';

// In-memory stand-in for the parts of the Sheets v4 API that
// GoogleDriveClient uses. It keeps each tab's values and grid size, applies
// spreadsheets.batchUpdate atomically, and enforces the 10M-cell limit, so
// tests can assert what a tab holds after a write, not only which calls ran.

type CellValue = string | number | boolean;

type FakeSheet = {
    sheetId: number;
    title: string;
    hidden: boolean;
    rowCount: number;
    columnCount: number;
    values: (CellValue | undefined)[][];
    numberFormats: Array<{ range: GridRange; numberFormat: unknown }>;
};

type GridRange = {
    sheetId?: number;
    startRowIndex?: number;
    endRowIndex?: number;
    startColumnIndex?: number;
    endColumnIndex?: number;
};

type UpdateCall = {
    range: string;
    rows: unknown[][];
    options: unknown;
};

const DEFAULT_ROW_COUNT = 1000;
const DEFAULT_COLUMN_COUNT = 26;

export const googleApiError = (status: number, message: string) =>
    Object.assign(new Error(message), {
        code: status,
        response: { status, data: { error: { code: status, message } } },
    });

export const googleInternalError = () =>
    googleApiError(500, 'Internal error encountered.');

export const googleQuotaError = () =>
    googleApiError(
        429,
        "Quota exceeded for quota metric 'Write requests' and limit 'Write requests per minute per user'",
    );

const columnLettersToIndex = (letters: string) =>
    letters
        .split('')
        .reduce((acc, letter) => acc * 26 + letter.charCodeAt(0) - 64, 0) - 1;

export class GoogleSheetsFake {
    sheets: FakeSheet[] = [];

    cellLimit = 10_000_000;

    nextSheetId = 1;

    updateCalls: UpdateCall[] = [];

    clearCalls: string[] = [];

    batchUpdateCalls: unknown[][] = [];

    // Throw from these to simulate a Google failure on a given request.
    beforeUpdate: (call: UpdateCall, index: number) => void = () => {};

    beforeBatchUpdate: (requests: unknown[], index: number) => void = () => {};

    constructor(tabs: Array<{ title: string; rows?: CellValue[][] }>) {
        tabs.forEach(({ title, rows = [] }) => {
            const sheet = this.addSheet({ title });
            this.writeRows(sheet.sheetId, 0, 0, rows);
        });
    }

    api() {
        return {
            spreadsheets: {
                get: async () => ({
                    data: {
                        properties: { title: 'Fake spreadsheet' },
                        sheets: this.sheets.map((sheet, index) => ({
                            properties: {
                                sheetId: sheet.sheetId,
                                title: sheet.title,
                                index,
                                hidden: sheet.hidden,
                                gridProperties: {
                                    rowCount: sheet.rowCount,
                                    columnCount: sheet.columnCount,
                                },
                            },
                        })),
                    },
                }),
                batchUpdate: async ({
                    requestBody,
                }: {
                    requestBody: { requests: unknown[] };
                }) => {
                    const { requests } = requestBody;
                    this.batchUpdateCalls.push(requests);
                    this.beforeBatchUpdate(
                        requests,
                        this.batchUpdateCalls.length - 1,
                    );
                    return { data: this.applyAtomically(requests) };
                },
                values: {
                    update: async (
                        {
                            range,
                            requestBody,
                        }: {
                            range: string;
                            requestBody: { values: unknown[][] };
                        },
                        options?: unknown,
                    ) => {
                        const call = {
                            range,
                            rows: requestBody.values,
                            options,
                        };
                        this.updateCalls.push(call);
                        this.beforeUpdate(call, this.updateCalls.length - 1);
                        const { sheet, startRow, startColumn } =
                            this.resolveRange(range);
                        const rowCount = Math.max(
                            sheet.rowCount,
                            startRow + requestBody.values.length,
                        );
                        const columnCount = Math.max(
                            sheet.columnCount,
                            startColumn +
                                requestBody.values.reduce(
                                    (acc, r) => Math.max(acc, r.length),
                                    0,
                                ),
                        );
                        this.assertCellLimit(
                            this.totalCells() -
                                sheet.rowCount * sheet.columnCount +
                                rowCount * columnCount,
                        );
                        sheet.rowCount = rowCount;
                        sheet.columnCount = columnCount;
                        this.writeRows(
                            sheet.sheetId,
                            startRow,
                            startColumn,
                            requestBody.values,
                        );
                        return { data: {} };
                    },
                    clear: async ({ range }: { range: string }) => {
                        this.clearCalls.push(range);
                        const { sheet } = this.resolveRange(range);
                        sheet.values = [];
                        return { data: {} };
                    },
                },
            },
        };
    }

    // Values of a tab with trailing empty cells and rows trimmed, the way
    // values.get returns them.
    tabValues(title: string): CellValue[][] {
        const sheet = this.sheets.find((s) => s.title === title);
        if (!sheet) throw new Error(`No tab ${title}`);
        const rows = sheet.values.map((row) => {
            const trimmed = [...(row ?? [])];
            while (
                trimmed.length > 0 &&
                trimmed[trimmed.length - 1] === undefined
            ) {
                trimmed.pop();
            }
            return trimmed.map((v) => (v === undefined ? '' : v));
        });
        while (rows.length > 0 && rows[rows.length - 1].length === 0) {
            rows.pop();
        }
        return rows;
    }

    sheet(title: string): FakeSheet {
        const sheet = this.sheets.find((s) => s.title === title);
        if (!sheet) throw new Error(`No tab ${title}`);
        return sheet;
    }

    totalCells() {
        return this.sheets.reduce(
            (acc, s) => acc + s.rowCount * s.columnCount,
            0,
        );
    }

    private assertCellLimit(cells: number) {
        if (cells > this.cellLimit) {
            throw googleApiError(
                400,
                `This action would increase the number of cells in the workbook above the limit of ${this.cellLimit} cells.`,
            );
        }
    }

    private addSheet(properties: {
        title: string;
        hidden?: boolean;
        gridProperties?: { rowCount?: number; columnCount?: number };
    }): FakeSheet {
        if (this.sheets.some((s) => s.title === properties.title)) {
            throw googleApiError(
                400,
                `Invalid requests[0].addSheet: A sheet with the name "${properties.title}" already exists. Please enter another name.`,
            );
        }
        const sheet: FakeSheet = {
            sheetId: this.nextSheetId,
            title: properties.title,
            hidden: properties.hidden ?? false,
            rowCount: properties.gridProperties?.rowCount ?? DEFAULT_ROW_COUNT,
            columnCount:
                properties.gridProperties?.columnCount ?? DEFAULT_COLUMN_COUNT,
            values: [],
            numberFormats: [],
        };
        this.nextSheetId += 1;
        this.sheets.push(sheet);
        return sheet;
    }

    private sheetById(sheetId: number | undefined): FakeSheet {
        const sheet = this.sheets.find((s) => s.sheetId === sheetId);
        if (!sheet) {
            throw googleApiError(400, `No grid with id: ${sheetId}`);
        }
        return sheet;
    }

    private resolveRange(range: string) {
        const bang = range.lastIndexOf('!');
        let titlePart: string | undefined;
        let cellPart: string | undefined;
        if (bang === -1) {
            if (/^[A-Z]+\d+$/.test(range)) {
                cellPart = range;
            } else {
                titlePart = range;
            }
        } else {
            titlePart = range.slice(0, bang);
            cellPart = range.slice(bang + 1);
        }
        if (titlePart?.startsWith("'") && titlePart.endsWith("'")) {
            titlePart = titlePart.slice(1, -1).replaceAll("''", "'");
        }
        const sheet =
            titlePart === undefined
                ? this.sheets.find((s) => !s.hidden)
                : this.sheets.find((s) => s.title === titlePart);
        if (!sheet) {
            throw googleApiError(400, `Unable to parse range: ${range}`);
        }
        const match = cellPart?.match(/^([A-Z]+)(\d+)$/);
        return {
            sheet,
            startRow: match ? Number(match[2]) - 1 : 0,
            startColumn: match ? columnLettersToIndex(match[1]) : 0,
        };
    }

    private writeRows(
        sheetId: number,
        startRow: number,
        startColumn: number,
        rows: unknown[][],
    ) {
        const sheet = this.sheetById(sheetId);
        rows.forEach((row, i) => {
            const r = startRow + i;
            sheet.values[r] = sheet.values[r] ?? [];
            row.forEach((value, j) => {
                // The Sheets API skips nulls: the cell keeps its old value.
                if (value === null || value === undefined) return;
                sheet.values[r][startColumn + j] =
                    value === '' ? undefined : (value as CellValue);
            });
        });
    }

    private static rangeBounds(sheet: FakeSheet, range: GridRange) {
        return {
            r0: range.startRowIndex ?? 0,
            r1: range.endRowIndex ?? sheet.rowCount,
            c0: range.startColumnIndex ?? 0,
            c1: range.endColumnIndex ?? sheet.columnCount,
        };
    }

    private applyAtomically(requests: unknown[]) {
        const snapshot = this.sheets.map((s) => ({
            ...s,
            values: s.values.map((row) => (row ? [...row] : row)),
            numberFormats: [...s.numberFormats],
        }));
        const { nextSheetId } = this;
        try {
            const replies = requests.map((request) =>
                this.applyRequest(request as Record<string, AnyType>),
            );
            return { replies };
        } catch (e) {
            this.sheets = snapshot;
            this.nextSheetId = nextSheetId;
            throw e;
        }
    }

    private applyRequest(request: Record<string, AnyType>) {
        const [kind] = Object.keys(request);
        const body = request[kind];
        switch (kind) {
            case 'addSheet': {
                const sheet = this.addSheet(body.properties);
                this.assertCellLimit(this.totalCells());
                return {
                    addSheet: {
                        properties: {
                            sheetId: sheet.sheetId,
                            title: sheet.title,
                        },
                    },
                };
            }
            case 'deleteSheet': {
                const sheet = this.sheetById(body.sheetId);
                this.sheets = this.sheets.filter((s) => s !== sheet);
                return {};
            }
            case 'updateSheetProperties': {
                const sheet = this.sheetById(body.properties.sheetId);
                const grid = body.properties.gridProperties ?? {};
                if (grid.rowCount !== undefined) sheet.rowCount = grid.rowCount;
                if (grid.columnCount !== undefined) {
                    sheet.columnCount = grid.columnCount;
                }
                this.assertCellLimit(this.totalCells());
                return {};
            }
            case 'updateCells': {
                if (
                    body.rows !== undefined ||
                    body.fields !== 'userEnteredValue'
                ) {
                    throw new Error('Fake only supports clearing values');
                }
                const sheet = this.sheetById(body.range.sheetId);
                const { r0, r1, c0, c1 } = GoogleSheetsFake.rangeBounds(
                    sheet,
                    body.range,
                );
                for (
                    let r = r0;
                    r < Math.min(r1, sheet.values.length);
                    r += 1
                ) {
                    const row = sheet.values[r];
                    if (row) {
                        for (let c = c0; c < c1; c += 1) row[c] = undefined;
                    }
                }
                return {};
            }
            case 'copyPaste': {
                if (body.pasteType !== 'PASTE_VALUES') {
                    throw new Error('Fake only supports PASTE_VALUES');
                }
                const source = this.sheetById(body.source.sheetId);
                const destination = this.sheetById(body.destination.sheetId);
                const s = GoogleSheetsFake.rangeBounds(source, body.source);
                const d = GoogleSheetsFake.rangeBounds(
                    destination,
                    body.destination,
                );
                if (
                    s.r1 > source.rowCount ||
                    s.c1 > source.columnCount ||
                    d.r0 + (s.r1 - s.r0) > destination.rowCount ||
                    d.c0 + (s.c1 - s.c0) > destination.columnCount
                ) {
                    throw googleApiError(400, 'Range exceeds grid limits');
                }
                for (let r = s.r0; r < s.r1; r += 1) {
                    const target = d.r0 + r - s.r0;
                    destination.values[target] =
                        destination.values[target] ?? [];
                    for (let c = s.c0; c < s.c1; c += 1) {
                        destination.values[target][d.c0 + c - s.c0] =
                            source.values[r]?.[c];
                    }
                }
                return {};
            }
            case 'repeatCell': {
                const sheet = this.sheetById(body.range.sheetId);
                sheet.numberFormats.push({
                    range: body.range,
                    numberFormat: body.cell.userEnteredFormat.numberFormat,
                });
                return {};
            }
            default:
                throw new Error(`Fake does not support ${kind}`);
        }
    }
}
