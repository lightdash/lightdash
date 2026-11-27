import {
    AnyType,
    CustomDimension,
    DimensionType,
    Field,
    ForbiddenError,
    formatDate,
    getErrorMessage,
    GoogleSheetsQuotaError,
    GoogleSheetsScopeError,
    GoogleSheetsSupersededError,
    GoogleSheetsTransientError,
    isDimension,
    isField,
    ItemsMap,
    LightdashError,
    Metric,
    MissingConfigError,
    NotFoundError,
    shouldShiftItemTimezone,
    sleep,
    TableCalculation,
    TimeFrames,
    timeIntervalToExcelNumFmt,
    toExcelWallClockDate,
    toIsoWithProjectOffset,
    UnexpectedGoogleSheetsError,
} from '@lightdash/common';
import { createHash, randomBytes } from 'crypto';
import { google, sheets_v4 } from 'googleapis';
import moment from 'moment';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { processFieldsForExport } from '../../utils/FileDownloadUtils/FileDownloadUtils';

const NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
]);

type GoogleDriveClientArguments = {
    lightdashConfig: LightdashConfig;
};

type NativeDateColumn = {
    columnIndex: number;
    numberFormat: {
        type: 'DATE' | 'DATE_TIME';
        pattern: string;
    };
    rowCount: number;
    startRow: number;
};

// Google Sheets has a 50,000 character limit per cell
const GOOGLE_SHEETS_CELL_CHAR_LIMIT = 50000;
const TRUNCATION_SUFFIX = '... [TRUNCATED]';
const TRUNCATE_INDEX = GOOGLE_SHEETS_CELL_CHAR_LIMIT - TRUNCATION_SUFFIX.length;
const GOOGLE_SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Google fails a single values.update with a generic "Internal error
// encountered" (after minutes) once it holds more than ~187k rows with a long
// text column (about 1.3M cells), whatever its byte size. So every write is
// split into chunks bounded by rows, cells AND bytes, all far under what
// Google is known to accept, while keeping the request count low for the 60
// writes/min/user quota.
export const GSHEETS_WRITE_CHUNK_MAX_ROWS = 25_000;
// Measured on Rainbow: a request fails when it holds more than about
// 190k-240k cells of 64 or more characters, whatever its bytes or cells.
// So every write and paste holds at most this many such cells.
export const GSHEETS_MAX_LONG_CELLS_PER_REQUEST = 100_000;
export const GSHEETS_LONG_CELL_CHARS = 64;
export const GSHEETS_WRITE_CHUNK_MAX_CELLS = 250_000;
export const GSHEETS_WRITE_CHUNK_MAX_BYTES = 8 * 1024 * 1024;
// A batchUpdate that pastes more than ~187k such rows fails the same way,
// also when the paste is split into several copyPaste requests. So the swap
// copies at most this much per batchUpdate. Clearing cells does not count.
export const GSHEETS_SWAP_BATCH_MAX_ROWS = 100_000;
export const GSHEETS_SWAP_BATCH_MAX_CELLS = 500_000;
// Also bound by bytes, well under the 23 MB of the smallest failing request
// that was measured.
export const GSHEETS_SWAP_BATCH_MAX_BYTES = 12 * 1024 * 1024;
// When Google rejects a paste with "Internal error encountered", the batch
// is split in two and tried again, down to this size.
export const GSHEETS_SWAP_MIN_SPLIT_ROWS = 1_000;
// Cells per spreadsheet, counted over every tab, empty cells included.
// Google raised it from 10M to 20M in September 2026.
export const GOOGLE_SHEETS_CELL_LIMIT = 20_000_000;
// Bounded per-request backoff (~65s in total) so a 429 waits out a quota
// window. Our own retries replace gaxios's hidden ones (see `retry: false`).
export const GSHEETS_WRITE_RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
const GSHEETS_RETRY_AFTER_CEILING_MS = 60_000;
// Each backoff delay is moved by up to this share, up or down.
const GSHEETS_RETRY_JITTER = 0.2;
// The retries of one write may wait at most this share of the job timeout,
// so a throttled run fails cleanly before the timeout stops it.
const GSHEETS_RETRY_BUDGET_SHARE_OF_JOB_TIMEOUT = 0.4;
const GOOGLE_INTERNAL_ERROR_MESSAGE =
    'Google Drive internal error encountered. Please try again later.';
// Hidden, so it does not show in the tab bar. Named so that an editor who
// unhides it knows what it is.
const STAGING_TAB_PREFIX = 'Lightdash sync in progress ';
const NEW_TAB_ROW_COUNT = 1000;
const NEW_TAB_COLUMN_COUNT = 26;
// A staging tab is stale when its run started longer ago than the job
// timeout plus this margin: no live run can still write to it.
const STAGING_STALE_MARGIN_MS = 10 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000;
// Developer metadata on the tab: the id of the last run that claimed it.
export const GSHEETS_SYNC_CLAIM_KEY = 'lightdash.sync.claim';
// Developer metadata on the tab: the id of the last run whose last batch
// landed. Proves a batch landed when its response was lost.
export const GSHEETS_SYNC_DONE_KEY = 'lightdash.sync.done';

// Sorts by start time: base-36 milliseconds, padded, then a random suffix.
const newSyncRunId = () =>
    `${Date.now().toString(36).padStart(9, '0')}-${randomBytes(2).toString('hex')}`;

const syncRunStartedAt = (runId: string): number | undefined =>
    /^[0-9a-z]{9}-[0-9a-f]{4}$/.test(runId)
        ? parseInt(runId.slice(0, 9), 36)
        : undefined;

// Run ids are wall-clock times. An id far in the future comes from a worker
// with a wrong clock: treat it as stale, so it never blocks a later run.
const SYNC_RUN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const isFutureRunId = (runId: string) => {
    const startedAt = syncRunStartedAt(runId);
    return (
        startedAt !== undefined &&
        startedAt > Date.now() + SYNC_RUN_FUTURE_TOLERANCE_MS
    );
};

// True when `other` is a newer run than `runId` that can still be live.
const isNewerSyncRun = (other: string | undefined, runId: string) =>
    other !== undefined && other > runId && !isFutureRunId(other);

export type GoogleSheetsWriteChunk = {
    start: number;
    end: number;
    bytes: number;
    longCells: number;
};

const countLongCells = (row: unknown[]) =>
    row.reduce<number>(
        (acc, value) =>
            typeof value === 'string' && value.length >= GSHEETS_LONG_CELL_CHARS
                ? acc + 1
                : acc,
        0,
    );

export const planGoogleSheetsWriteChunks = (
    rows: unknown[][],
    maxRows: number = GSHEETS_WRITE_CHUNK_MAX_ROWS,
    maxBytes: number = GSHEETS_WRITE_CHUNK_MAX_BYTES,
    maxCells: number = GSHEETS_WRITE_CHUNK_MAX_CELLS,
    maxLongCells: number = GSHEETS_MAX_LONG_CELLS_PER_REQUEST,
): { chunks: GoogleSheetsWriteChunk[]; totalBytes: number } => {
    const chunks: GoogleSheetsWriteChunk[] = [];
    let start = 0;
    let bytes = 0;
    let cells = 0;
    let longCells = 0;
    let totalBytes = 0;
    rows.forEach((row, index) => {
        const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;
        const rowLongCells = countLongCells(row);
        if (
            index > start &&
            (index - start >= maxRows ||
                bytes + rowBytes > maxBytes ||
                cells + row.length > maxCells ||
                longCells + rowLongCells > maxLongCells)
        ) {
            chunks.push({ start, end: index, bytes, longCells });
            start = index;
            bytes = 0;
            cells = 0;
            longCells = 0;
        }
        bytes += rowBytes;
        cells += row.length;
        longCells += rowLongCells;
        totalBytes += rowBytes;
    });
    if (rows.length > start) {
        chunks.push({ start, end: rows.length, bytes, longCells });
    }
    return { chunks, totalBytes };
};

// Groups whole write chunks into swap batches bounded by rows, cells,
// bytes and long cells. Each chunk is already within all four bounds.
export const planGoogleSheetsSwapBatches = (
    chunks: GoogleSheetsWriteChunk[],
    columnCount: number,
    maxRows: number = GSHEETS_SWAP_BATCH_MAX_ROWS,
    maxCells: number = GSHEETS_SWAP_BATCH_MAX_CELLS,
    maxBytes: number = GSHEETS_SWAP_BATCH_MAX_BYTES,
    maxLongCells: number = GSHEETS_MAX_LONG_CELLS_PER_REQUEST,
): GoogleSheetsWriteChunk[] =>
    chunks.reduce<GoogleSheetsWriteChunk[]>((batches, chunk) => {
        const last = batches.at(-1);
        if (
            last &&
            chunk.end - last.start <= maxRows &&
            (chunk.end - last.start) * columnCount <= maxCells &&
            last.bytes + chunk.bytes <= maxBytes &&
            last.longCells + chunk.longCells <= maxLongCells
        ) {
            return [
                ...batches.slice(0, -1),
                {
                    start: last.start,
                    end: chunk.end,
                    bytes: last.bytes + chunk.bytes,
                    longCells: last.longCells + chunk.longCells,
                },
            ];
        }
        return [...batches, { ...chunk }];
    }, []);

const formatCount = (value: number) => value.toLocaleString('en-US');

const formatSize = (bytes: number) =>
    bytes < 0.1 * 1024 * 1024
        ? 'less than 0.1 MB'
        : `about ${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const quoteTabName = (title: string) => `'${title.replaceAll("'", "''")}'`;

type SheetProperties = {
    sheetId: number;
    title: string;
    hidden: boolean;
    rowCount: number;
    columnCount: number;
    basicFilter?: sheets_v4.Schema$BasicFilter;
    // The id of the last run that claimed this tab.
    claim?: string;
    // The id of the last run whose last batch landed on this tab.
    done?: string;
};

type RetryBudget = { remainingMs: number };

type WriteContext = {
    rowCount: number;
    totalBytes: number;
    tabTitle: string;
    inPlace: boolean;
    // Rows of the new data already in the tab: more than 0 means the tab
    // holds a mix of new and old rows if the write fails now.
    rowsInTab: number;
};

const DATE_TIME_FRAMES = new Set<TimeFrames>([
    TimeFrames.HOUR,
    TimeFrames.MINUTE,
    TimeFrames.SECOND,
    TimeFrames.MILLISECOND,
]);

const columnNumberToA1 = (columnCount: number): string => {
    let value = columnCount;
    let result = '';
    while (value > 0) {
        value -= 1;
        result = String.fromCharCode(65 + (value % 26)) + result;
        value = Math.floor(value / 26);
    }
    return result || 'A';
};

const toGoogleSheetsDateSerial = (
    value: unknown,
    shouldShift: boolean,
    timezone?: string,
): number | undefined => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    const date =
        shouldShift && timezone && timezone !== 'UTC'
            ? toExcelWallClockDate(value, timezone)
            : moment.utc(value).toDate();
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    return (date.getTime() - GOOGLE_SHEETS_EPOCH_MS) / MILLISECONDS_PER_DAY;
};

export class GoogleDriveClient {
    private readonly lightdashConfig: LightdashConfig;

    public isEnabled: boolean = false;

    constructor({ lightdashConfig }: GoogleDriveClientArguments) {
        this.lightdashConfig = lightdashConfig;
        this.isEnabled =
            lightdashConfig.auth.google.oauth2ClientId !== undefined &&
            lightdashConfig.auth.google.oauth2ClientSecret !== undefined;
    }

    private async getCredentials(refreshToken: string) {
        try {
            const credentials = {
                type: 'authorized_user',
                client_id: this.lightdashConfig.auth.google.oauth2ClientId,
                client_secret:
                    this.lightdashConfig.auth.google.oauth2ClientSecret,
                refresh_token: refreshToken,
            };
            const authClient = google.auth.fromJSON(credentials);
            return new google.auth.GoogleAuth({
                authClient,
            });
        } catch (err) {
            throw new ForbiddenError(`Failed to get credentials: ${err}`);
        }
    }

    private static async catchApiError<T>(promise: Promise<T>) {
        try {
            return await promise;
        } catch (err: AnyType) {
            throw GoogleDriveClient.toGoogleSheetsError(err);
        }
    }

    // Maps a Google API error to a Lightdash error class. An error that is
    // already mapped passes through.
    private static toGoogleSheetsError(err: AnyType): Error {
        if (err instanceof LightdashError) return err;

        if (err?.response?.status === 404) {
            return new NotFoundError(
                `Google Sheet not found: ${err.response?.data?.error?.message}`,
            );
        }

        if (err?.response?.status === 401) {
            return new ForbiddenError(
                `Failed to authorize: ${err.response.data?.error}: ${err.response.data?.error_description}`,
            );
        }

        if (
            err?.response?.status === 400 &&
            err?.response?.data?.error === 'invalid_grant'
        ) {
            return new ForbiddenError(
                `Failed to refresh token: ${err.response.data.error}: ${err.response.data.error_description}`,
            );
        }

        if (
            err?.message &&
            err.message.includes('The caller does not have permission')
        ) {
            return new ForbiddenError(
                `The caller does not have permission to access this Google Sheet: ${err.message}`,
            );
        }

        if (
            err?.message &&
            err.message.includes('The service is currently unavailable')
        ) {
            return new GoogleSheetsTransientError(err);
        }

        if (
            err?.message &&
            err.message.includes(
                'This operation is not supported for this document',
            )
        ) {
            return new UnexpectedGoogleSheetsError(
                `This operation is not supported for the provided file. ` +
                    `Please ensure you are using a valid Google Sheets file. ` +
                    `The file might be an Excel .xlsx file, or another file type that does not support Google spreadsheet operations.`,
            );
        }
        if (
            err?.message &&
            err.message.includes('Internal error encountered.')
        ) {
            return new UnexpectedGoogleSheetsError(
                GOOGLE_INTERNAL_ERROR_MESSAGE,
            );
        }

        // Detect quota/rate limit errors - these should be retried, not permanently disabled
        // like: Write requests per minute per user, or "Rate Limit Exceeded"
        if (
            err?.response?.status === 429 ||
            (err?.message && err.message.includes('Quota exceeded'))
        ) {
            return new GoogleSheetsQuotaError(getErrorMessage(err), {
                retryAfterMs: GoogleDriveClient.parseRetryAfterMs(err),
            });
        }

        if (GoogleDriveClient.isNetworkError(err)) {
            return new GoogleSheetsTransientError(getErrorMessage(err));
        }

        return new UnexpectedGoogleSheetsError(getErrorMessage(err));
    }

    // No HTTP response (DNS, reset, refused, timeout — incl. token refresh) is a
    // transport failure, not a Google verdict: retry it instead of disabling.
    private static isNetworkError(err: AnyType): boolean {
        if (err?.response !== undefined) {
            return false;
        }
        return (
            err?.name === 'FetchError' ||
            err?.name === 'AbortError' ||
            NETWORK_ERROR_CODES.has(err?.code)
        );
    }

    // Google doesn't always set Retry-After on quota errors, but honor it
    // when present rather than only ever guessing with backoff.
    private static parseRetryAfterMs(err: AnyType): number | undefined {
        const header = err?.response?.headers?.['retry-after'];
        const seconds = Number(header);
        return header !== undefined && Number.isFinite(seconds) && seconds > 0
            ? seconds * 1000
            : undefined;
    }

    async createNewTab(refreshToken: string, fileId: string, tabName: string) {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        // Creates a new tab in the sheet
        const tabTitle = tabName.replaceAll(':', '.'); // we can't use ranges with colons in their tab ids
        await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.batchUpdate({
                spreadsheetId: fileId,
                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: tabTitle,
                                },
                            },
                        },
                    ],
                },
            }),
        ).catch((error) => {
            if (
                error.code === 400 &&
                error?.errors[0]?.message.includes(tabName)
            ) {
                Logger.debug(
                    `Google sheet tab already exists, we will overwrite it: ${error.errors[0]?.message}`,
                );
            } else if (error.code === 500) {
                // This is a transient error, we will retry the request later
                throw new GoogleSheetsTransientError(error);
            }
        });

        return tabTitle;
    }

    async createNewSheet(refreshToken: string, title: string) {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.create({
                requestBody: {
                    properties: {
                        title,
                    },
                },
            }),
        );
        return response.data;
    }

    async listSheetTabs(
        refreshToken: string,
        fileId: string,
    ): Promise<Array<{ title: string; sheetId: number | null }>> {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.get({
                spreadsheetId: fileId,
                fields: 'sheets(properties(title,sheetId))',
            }),
        );
        return (response.data.sheets ?? []).flatMap((sheet) =>
            sheet.properties?.title
                ? [
                      {
                          title: sheet.properties.title,
                          sheetId: sheet.properties.sheetId ?? null,
                      },
                  ]
                : [],
        );
    }

    /**
     * Read a tab's cell values. Unformatted values with formatted date
     * strings, so numbers arrive as numbers and dates as readable text.
     */
    async getSheetValues(
        refreshToken: string,
        fileId: string,
        tabName: string,
    ): Promise<unknown[][]> {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.values.get({
                spreadsheetId: fileId,
                range: `'${tabName.replaceAll("'", "''")}'`,
                valueRenderOption: 'UNFORMATTED_VALUE',
                dateTimeRenderOption: 'FORMATTED_STRING',
            }),
        );
        return response.data.values ?? [];
    }

    /**
     * Page a sheet by row range. This bounds memory while retaining the same
     * unformatted-value semantics as getSheetValues.
     */
    async *getSheetRowBatches(
        refreshToken: string,
        fileId: string,
        tabName: string,
        batchRows: number,
    ): AsyncGenerator<unknown[][]> {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });
        const metadata = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.get({
                spreadsheetId: fileId,
                fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)))',
            }),
        );
        const properties = (metadata.data.sheets ?? []).find(
            (sheet) => sheet.properties?.title === tabName,
        )?.properties;
        if (!properties) {
            throw new NotFoundError(`Google Sheet tab not found: ${tabName}`);
        }
        const rowCount = properties.gridProperties?.rowCount ?? 0;
        const columnCount = properties.gridProperties?.columnCount ?? 0;
        if (rowCount === 0 || columnCount === 0) return;

        const escapedTab = tabName.replaceAll("'", "''");
        const lastColumn = columnNumberToA1(columnCount);
        for (let startRow = 1; startRow <= rowCount; startRow += batchRows) {
            const endRow = Math.min(startRow + batchRows - 1, rowCount);
            // Sequential paging avoids Google API quota bursts.
            // eslint-disable-next-line no-await-in-loop
            const response = await GoogleDriveClient.catchApiError(
                sheets.spreadsheets.values.get({
                    spreadsheetId: fileId,
                    range: `'${escapedTab}'!A${startRow}:${lastColumn}${endRow}`,
                    valueRenderOption: 'UNFORMATTED_VALUE',
                    dateTimeRenderOption: 'FORMATTED_STRING',
                }),
            );
            yield response.data.values ?? [];
        }
    }

    async assertFileIsGoogleSheet(refreshToken: string, fileId: string) {
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        // We try to fetch the spreadsheet properties. If it's a valid Google Sheets file, this will succeed.
        // Otherwise, if an invalid file like Excel .xlsx, an error will be thrown which we catch and handle.
        await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.get({
                spreadsheetId: fileId,
                fields: 'properties.title',
            }),
        );
    }

    async uploadMetadata(
        refreshToken: string,
        fileId: string,
        updateFrequency: string,
        tabs?: string[],
        reportUrl?: string,
    ) {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }

        // Validate that the file is actually a Google Sheets file
        await this.assertFileIsGoogleSheet(refreshToken, fileId);

        const metadataTabName = 'metadata';
        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });
        await this.createNewTab(refreshToken, fileId, metadataTabName);

        await GoogleDriveClient.clearTabName(sheets, fileId, metadataTabName); // in case already exists

        const tabsUpdated = tabs
            ? tabs.map((t, i) => [i === 0 ? 'Tabs updated' : '', t])
            : [[]];
        const metadata: string[][] = [
            [
                'The data in this Google Sheet has been automatically synced via Lightdash',
            ],
            ['Update frequency:', updateFrequency],
            ['Time of last sync:', new Date().toLocaleString()],
            ...(reportUrl ? [['Report URL:', reportUrl]] : []),
            ...tabsUpdated,
        ];

        await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.values.update({
                spreadsheetId: fileId,
                range: `${metadataTabName}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: metadata,
                },
            }),
        );
    }

    private static async clearTabName(
        sheets: sheets_v4.Sheets,
        fileId: string,
        tabName?: string,
    ) {
        // The method "SheetId: 0" only works if the first default sheet tab still exists (it's not deleted by the user)
        // So instead we select all the cells in the first tab by its name
        try {
            if (tabName === undefined) {
                const spreadsheet = await GoogleDriveClient.catchApiError(
                    sheets.spreadsheets.get({
                        spreadsheetId: fileId,
                    }),
                );
                const firstSheetName =
                    spreadsheet.data.sheets?.[0].properties?.title;
                if (!firstSheetName) {
                    throw new UnexpectedGoogleSheetsError(
                        'Unable to find the first sheet name in the spreadsheet',
                    );
                }
                Logger.debug(`Clearing first sheet name ${firstSheetName}`);
                await GoogleDriveClient.catchApiError(
                    sheets.spreadsheets.values.clear({
                        spreadsheetId: fileId,
                        range: firstSheetName,
                    }),
                );
            } else {
                Logger.debug(`Clearing sheet name ${tabName}`);

                await GoogleDriveClient.catchApiError(
                    sheets.spreadsheets.values.clear({
                        spreadsheetId: fileId,
                        range: tabName,
                    }),
                );
            }
        } catch (error) {
            Logger.error('Unable to clear the sheet', error);
            // Silently ignore this error
        }
    }

    static formatCell(
        value: AnyType,
        item?: Field | TableCalculation | CustomDimension | Metric,
        timezone?: string,
    ) {
        // We don't want to use formatItemValue directly because the format for some types on Gsheets
        // is different to what we use to present the data in the UI (eg: timestamps, currencies)
        let formattedValue: AnyType;

        if (Array.isArray(value)) {
            formattedValue = value.join(',');
        } else if (value instanceof RegExp) {
            formattedValue = value.source;
        } else if (value instanceof Set) {
            formattedValue = [...value].join(',');
        } else if (typeof value === 'bigint') {
            // Handle BigInt values by converting to regular numbers when safe
            // Check if the BigInt value is within JavaScript's safe integer range
            if (
                value >= Number.MIN_SAFE_INTEGER &&
                value <= Number.MAX_SAFE_INTEGER
            ) {
                formattedValue = Number(value);
            } else {
                // For very large BigInt values, convert to string to preserve precision
                formattedValue = value.toString();
            }
        } else if (isField(item) && item.type === DimensionType.TIMESTAMP) {
            // Shift the wall-clock into the project tz with an explicit
            // offset so cells communicate the zone honestly. Falls through
            // to the existing passthrough when timezone is unset / UTC.
            const shifted = toIsoWithProjectOffset(value, timezone);
            formattedValue = shifted ?? value;
        } else if (isField(item) && item.type === DimensionType.DATE) {
            if (value === null || value === undefined) return '';

            const timeInterval = isDimension(item)
                ? item.timeInterval
                : undefined;
            // TIMESTAMP-base DATE intervals carry a real instant; shift them
            // alongside TIMESTAMP fields so non-pivot and pivot exports agree.
            // Calendar DATEs (no TIMESTAMP base) keep wall-clock formatting.
            const shifted = shouldShiftItemTimezone(item)
                ? toIsoWithProjectOffset(value, timezone)
                : undefined;
            formattedValue = shifted ?? formatDate(value, timeInterval);
        } else if (
            // Return the string representation of the Object Wrappers for Primitive Types
            typeof value === 'object' &&
            (value instanceof Number ||
                value instanceof Boolean ||
                value instanceof String)
        ) {
            formattedValue = value.valueOf();
        } else if (
            value &&
            typeof value === 'object' &&
            !(value instanceof Date)
        ) {
            formattedValue = JSON.stringify(value);
        } else {
            formattedValue = value;
        }

        // Truncate strings that exceed Google Sheets' cell character limit
        if (typeof formattedValue === 'string') {
            if (formattedValue.length > GOOGLE_SHEETS_CELL_CHAR_LIMIT) {
                Logger.warn(
                    `Cell value exceeds Google Sheets character limit (${formattedValue.length} > ${GOOGLE_SHEETS_CELL_CHAR_LIMIT}). Truncating...`,
                );
                formattedValue =
                    formattedValue.substring(0, TRUNCATE_INDEX) +
                    TRUNCATION_SUFFIX;
            }
            // Defuse spreadsheet formula injection. With valueInputOption: 'RAW'
            // these are stored as text on write, but Sheets re-parses them as
            // formulas the moment a viewer edits and re-enters the cell — a
            // common CSV-injection vector. We prefix a single quote so the
            // cell stays a literal string. Skip leading `-`/`+` because
            // negative/signed numeric strings are extremely common and
            // legitimate.
            if (/^[=@\t\r]/.test(formattedValue)) {
                formattedValue = `'${formattedValue}`;
            }
        }

        return formattedValue;
    }

    async appendToSheet(
        refreshToken: string,
        fileId: string,
        csvContent: Record<string, unknown>[],
        itemMap: ItemsMap,
        showTableNames: boolean,

        tabName?: string,
        columnOrder: string[] = [],
        customLabels: Record<string, string> = {},
        hiddenFields: string[] = [],
        timezone?: string,
        headerRows: string[][] = [],
    ) {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }

        if (csvContent.length === 0 && headerRows.length === 0) {
            Logger.info('No data to write to the sheet');
            return;
        }

        const { sortedFieldIds, headers: csvHeader } = processFieldsForExport(
            itemMap,
            {
                showTableNames,
                customLabels,
                columnOrder,
                hiddenFields,
            },
        );

        const nativeDateFormats = new Map<
            number,
            NativeDateColumn['numberFormat']
        >();
        sortedFieldIds.forEach((fieldId, columnIndex) => {
            const item = itemMap[fieldId];
            if (
                !isField(item) ||
                !isDimension(item) ||
                item.type !== DimensionType.DATE
            ) {
                return;
            }

            const pattern = timeIntervalToExcelNumFmt(
                item.timeInterval,
                item.type,
            );
            if (!pattern) return;

            nativeDateFormats.set(columnIndex, {
                type:
                    item.timeInterval && DATE_TIME_FRAMES.has(item.timeInterval)
                        ? 'DATE_TIME'
                        : 'DATE',
                pattern,
            });
        });

        const values = csvContent.map((row) =>
            sortedFieldIds.map((fieldId, columnIndex) => {
                const item = itemMap[fieldId];
                const numberFormat = nativeDateFormats.get(columnIndex);
                if (numberFormat && isField(item)) {
                    const serialValue = toGoogleSheetsDateSerial(
                        row[fieldId],
                        shouldShiftItemTimezone(item),
                        timezone,
                    );
                    if (serialValue !== undefined) return serialValue;
                }

                // Google sheet doesn't like arrays as values, so we need to convert them to strings
                return GoogleDriveClient.formatCell(
                    row[fieldId],
                    item,
                    timezone,
                );
            }),
        );

        const nativeDateColumns: NativeDateColumn[] =
            csvContent.length === 0
                ? []
                : [...nativeDateFormats.entries()].map(
                      ([columnIndex, numberFormat]) => ({
                          columnIndex,
                          numberFormat,
                          rowCount: csvContent.length,
                          startRow: headerRows.length + 2,
                      }),
                  );

        await this.appendCsvToSheet(
            refreshToken,
            fileId,
            [...headerRows, csvHeader, ...values],
            tabName,
            nativeDateColumns,
        );
    }

    async appendCsvToSheet(
        refreshToken: string,
        fileId: string,

        results: AnyType[][],
        tabName?: string,
        nativeDateColumns: NativeDateColumn[] = [],
    ) {
        if (!this.isEnabled) {
            throw new MissingConfigError('Google Drive is not enabled');
        }

        if (results.length === 0) {
            Logger.info('No data to write to the sheet');
            return;
        }

        const auth = await this.getCredentials(refreshToken);
        const sheets = google.sheets({ version: 'v4', auth });

        // Also confirms the file is a Google Sheet: an .xlsx file fails here.
        const existingSheets = await GoogleDriveClient.listSheetProperties(
            sheets,
            fileId,
        );
        // The first visible tab is where a write to range "A1" used to go.
        const wantedTitle =
            (tabName ? tabName.replaceAll(':', '.') : undefined) ??
            (
                existingSheets.find(
                    (sheet) =>
                        !sheet.hidden &&
                        !sheet.title.startsWith(STAGING_TAB_PREFIX),
                ) ?? existingSheets[0]
            )?.title;
        if (wantedTitle === undefined) {
            throw new UnexpectedGoogleSheetsError(
                'Unable to find the first sheet name in the spreadsheet',
            );
        }
        // Tab names are unique without regard to case, and a range matches
        // them that way, so the old write went to an existing tab whose name
        // differs only in case. Keep that tab and its name.
        const target = existingSheets.find(
            (sheet) => sheet.title.toLowerCase() === wantedTitle.toLowerCase(),
        );
        const tabTitle = target?.title ?? wantedTitle;
        const stagingPrefix = `${STAGING_TAB_PREFIX}${createHash('sha256')
            .update(tabTitle.toLowerCase())
            .digest('hex')
            .slice(0, 8)}-`;
        const stagingRunId = (sheet: SheetProperties) =>
            sheet !== target && sheet.title.startsWith(stagingPrefix)
                ? sheet.title.slice(stagingPrefix.length)
                : undefined;
        // Another sync of this tab can be running ("Sync now" during a
        // scheduled run, or two schedulers on one tab). So only delete a
        // staging tab that no live run can own: one from a run that started
        // before the job timeout plus a margin, or with an older name.
        const jobTimeoutMs =
            this.lightdashConfig.scheduler?.jobTimeout ??
            DEFAULT_JOB_TIMEOUT_MS;
        const staleBefore =
            Date.now() - (jobTimeoutMs + STAGING_STALE_MARGIN_MS);
        const budget: RetryBudget = {
            remainingMs:
                GSHEETS_RETRY_BUDGET_SHARE_OF_JOB_TIMEOUT * jobTimeoutMs,
        };
        const staleStagingSheets = existingSheets.filter((sheet) => {
            const id = stagingRunId(sheet);
            if (id === undefined) return false;
            const startedAt = syncRunStartedAt(id);
            return (
                startedAt === undefined ||
                startedAt < staleBefore ||
                isFutureRunId(id)
            );
        });

        const rowCount = results.length;
        const columnCount = Math.max(
            1,
            results.reduce((acc, row) => Math.max(acc, row.length), 0),
        );
        const targetRowCount = Math.max(
            target?.rowCount ?? NEW_TAB_ROW_COUNT,
            rowCount,
        );
        const targetColumnCount = Math.max(
            target?.columnCount ?? NEW_TAB_COLUMN_COUNT,
            columnCount,
        );
        const otherCells = existingSheets
            .filter(
                (sheet) =>
                    sheet !== target && !staleStagingSheets.includes(sheet),
            )
            .reduce(
                (acc, sheet) => acc + sheet.rowCount * sheet.columnCount,
                0,
            );
        const targetCells = targetRowCount * targetColumnCount;
        if (otherCells + targetCells > GOOGLE_SHEETS_CELL_LIMIT) {
            throw new UnexpectedGoogleSheetsError(
                `Google Sheets could not write ${formatCount(rowCount)} rows and ${formatCount(columnCount)} columns to the tab "${tabTitle}": the spreadsheet would need about ${formatCount(otherCells + targetCells)} cells, which is more than the Google Sheets limit of ${formatCount(GOOGLE_SHEETS_CELL_LIMIT)} cells. The data in the tab was not changed. Remove tabs or rows that you do not use, or sync fewer rows or columns.`,
            );
        }
        // The staging tab needs room for a second copy of the data. When the
        // spreadsheet has no room for it, write into the tab directly.
        const inPlace =
            otherCells + targetCells + rowCount * columnCount >
            GOOGLE_SHEETS_CELL_LIMIT;

        const { chunks, totalBytes } = planGoogleSheetsWriteChunks(results);
        const context: WriteContext = {
            rowCount,
            totalBytes,
            tabTitle,
            inPlace,
            rowsInTab: 0,
        };
        Logger.info(
            `Writing ${rowCount} rows and ${columnCount} columns (${formatSize(totalBytes)}) to Google sheets in ${chunks.length} requests (${inPlace ? 'in place' : 'staged in a hidden tab'})`,
        );
        const startedAt = Date.now();

        // An in-place write also gets a 1x1 hidden tab with the run id, so
        // a newer run can supersede it the same way as a staged write.
        const runId = newSyncRunId();
        const ownTitle = `${stagingPrefix}${runId}`;
        const targetGrid = {
            rowCount: targetRowCount,
            columnCount: targetColumnCount,
        };
        const growTarget =
            target !== undefined &&
            (targetRowCount !== target.rowCount ||
                targetColumnCount !== target.columnCount);
        // values.update grows the grid only when its start cell is inside
        // it, so an in-place write needs the full grid before the first
        // request. A staged write grows the tab in the swap.
        const setupRequests: sheets_v4.Schema$Request[] = [
            ...(target
                ? []
                : [
                      {
                          addSheet: {
                              properties: {
                                  title: tabTitle,
                                  gridProperties: targetGrid,
                              },
                          },
                      },
                  ]),
            ...(inPlace && growTarget
                ? [
                      {
                          updateSheetProperties: {
                              properties: {
                                  sheetId: target.sheetId,
                                  gridProperties: targetGrid,
                              },
                              fields: 'gridProperties.rowCount,gridProperties.columnCount',
                          },
                      },
                  ]
                : []),
            {
                addSheet: {
                    properties: {
                        title: ownTitle,
                        hidden: true,
                        gridProperties: inPlace
                            ? { rowCount: 1, columnCount: 1 }
                            : { rowCount, columnCount },
                    },
                },
            },
        ];

        if (staleStagingSheets.length > 0) {
            await GoogleDriveClient.deleteTabsIfPresent(
                sheets,
                fileId,
                staleStagingSheets.map(({ sheetId }) => sheetId),
            );
        }

        let targetSheetId = target?.sheetId;
        let ownSheetId: number | undefined;
        try {
            const created = await GoogleDriveClient.setUpTabs(sheets, fileId, {
                requests: setupRequests,
                tabTitle,
                ownTitle,
                budget,
            });
            targetSheetId = targetSheetId ?? created.targetSheetId;
            ownSheetId = created.ownSheetId;
            if (targetSheetId === undefined || ownSheetId === undefined) {
                throw new UnexpectedGoogleSheetsError(
                    'Unable to create the Google Sheets tabs for the sync',
                );
            }
            const sheetId = targetSheetId;
            const ownTab = ownSheetId;
            const claimTab = () =>
                GoogleDriveClient.claimTab(sheets, fileId, {
                    runId,
                    sheetId,
                    ownSheetId: ownTab,
                    budget,
                    olderStagingIds: (list) =>
                        list.flatMap((sheet) => {
                            const id = stagingRunId(sheet);
                            return id !== undefined &&
                                sheet.sheetId !== ownTab &&
                                (id < runId || isFutureRunId(id))
                                ? [sheet.sheetId]
                                : [];
                        }),
                });

            // An in-place write claims the tab before it changes it.
            if (inPlace) await claimTab();

            const writeTitle = quoteTabName(inPlace ? tabTitle : ownTitle);
            await chunks.reduce(async (previous, chunk, index) => {
                await previous;
                // A staged write fails by itself when a newer run deletes its
                // staging tab. An in-place write checks its tab first.
                if (inPlace && index > 0) {
                    await GoogleDriveClient.assertTabExists(
                        sheets,
                        fileId,
                        ownTab,
                    );
                }
                const rows = results.slice(chunk.start, chunk.end);
                await GoogleDriveClient.withWriteRetry(
                    () =>
                        sheets.spreadsheets.values.update(
                            {
                                spreadsheetId: fileId,
                                range: `${writeTitle}!A${chunk.start + 1}`,
                                valueInputOption: 'RAW',
                                requestBody: {
                                    values: inPlace
                                        ? GoogleDriveClient.toOverwriteRows(
                                              rows,
                                              columnCount,
                                          )
                                        : rows,
                                },
                            },
                            // gaxios retries a failed PUT 3 times by default,
                            // which hides each failure behind 4 full uploads.
                            { retry: false },
                        ),
                    `write of rows ${chunk.start + 1}-${chunk.end}`,
                    budget,
                );
                if (inPlace) context.rowsInTab = chunk.end;
                Logger.info(
                    `Wrote Google Sheets request ${index + 1} of ${chunks.length} (${chunk.end - chunk.start} rows, ${formatSize(chunk.bytes)})`,
                );
            }, Promise.resolve());

            // The RAW writes already contain explicit date serials. Apply one
            // compact format per date column so behavior is independent of
            // Sheet locale without repeating format data per cell.
            const formatRequests: sheets_v4.Schema$Request[] =
                nativeDateColumns.map(
                    ({
                        columnIndex,
                        numberFormat,
                        rowCount: rows,
                        startRow,
                    }) => ({
                        repeatCell: {
                            range: {
                                sheetId,
                                startRowIndex: startRow - 1,
                                endRowIndex: startRow - 1 + rows,
                                startColumnIndex: columnIndex,
                                endColumnIndex: columnIndex + 1,
                            },
                            cell: { userEnteredFormat: { numberFormat } },
                            fields: 'userEnteredFormat.numberFormat',
                        },
                    }),
                );

            if (inPlace) {
                await GoogleDriveClient.assertTabExists(sheets, fileId, ownTab);
                await GoogleDriveClient.finishInPlaceWrite(sheets, fileId, {
                    sheetId,
                    ownSheetId: ownTab,
                    runId,
                    budget,
                    rowCount,
                    columnCount,
                    gridRowCount: targetRowCount,
                    gridColumnCount: targetColumnCount,
                    formatRequests,
                });
                ownSheetId = undefined;
            } else {
                // The claim deletes the staging tabs of older runs, so they
                // can no longer paste into this tab. This run pastes every
                // row afterwards, so their earlier pastes do not stay.
                const freshTarget = await claimTab();
                const swapStartedAt = Date.now();
                await GoogleDriveClient.swapStagingTab(sheets, fileId, {
                    sheetId,
                    stagingSheetId: ownTab,
                    runId,
                    budget,
                    pieces: planGoogleSheetsSwapBatches(chunks, columnCount),
                    rowCount,
                    columnCount,
                    growGrid:
                        targetRowCount !== freshTarget.rowCount ||
                        targetColumnCount !== freshTarget.columnCount,
                    gridRowCount: Math.max(
                        targetRowCount,
                        freshTarget.rowCount,
                    ),
                    gridColumnCount: Math.max(
                        targetColumnCount,
                        freshTarget.columnCount,
                    ),
                    formatRequests,
                    basicFilter: freshTarget.basicFilter,
                    onRowsInTab: (rows) => {
                        context.rowsInTab = rows;
                    },
                });
                ownSheetId = undefined;
                Logger.info(
                    `Swapped ${rowCount} rows from the staging tab into the Google Sheets tab in ${Date.now() - swapStartedAt} ms`,
                );
            }
        } catch (e) {
            if (
                targetSheetId !== undefined &&
                (await GoogleDriveClient.isSuperseded(sheets, fileId, {
                    runId,
                    sheetId: targetSheetId,
                }))
            ) {
                // A newer run claimed the tab and writes every row of it. This
                // run is not a failure: the caller logs it, and does not retry,
                // turn the sync off or email the owner.
                if (ownSheetId !== undefined) {
                    await GoogleDriveClient.deleteTabsIfPresent(
                        sheets,
                        fileId,
                        [ownSheetId],
                    );
                }
                Logger.info(
                    `Stopped the Google Sheets write to the tab "${tabTitle}": a newer sync of the same tab took over (${getErrorMessage(e)})`,
                );
                throw new GoogleSheetsSupersededError(
                    `A newer run took over the tab "${tabTitle}", so this run stopped.`,
                );
            }
            if (ownSheetId !== undefined) {
                await GoogleDriveClient.deleteTabsIfPresent(sheets, fileId, [
                    ownSheetId,
                ]);
            }
            throw GoogleDriveClient.describeWriteFailure(e, context);
        }

        Logger.info(
            `Wrote ${rowCount} rows to Google sheets in ${chunks.length} requests and ${Date.now() - startedAt} ms`,
        );
    }

    // The newest value of each sync key on a tab.
    private static syncMarkers(
        developerMetadata: sheets_v4.Schema$DeveloperMetadata[] | undefined,
    ): { claim?: string; done?: string } {
        const latest = (key: string) =>
            (developerMetadata ?? [])
                .flatMap(({ metadataKey, metadataValue }) =>
                    metadataKey === key && metadataValue ? [metadataValue] : [],
                )
                .sort()
                .at(-1);
        const claim = latest(GSHEETS_SYNC_CLAIM_KEY);
        const done = latest(GSHEETS_SYNC_DONE_KEY);
        return {
            ...(claim !== undefined ? { claim } : {}),
            ...(done !== undefined ? { done } : {}),
        };
    }

    // Replaces a sync key on the tab with a new value.
    private static syncMarkerRequests(
        sheetId: number,
        key: string,
        value: string,
    ): sheets_v4.Schema$Request[] {
        return [
            {
                deleteDeveloperMetadata: {
                    dataFilter: {
                        developerMetadataLookup: {
                            metadataKey: key,
                            metadataLocation: { sheetId },
                        },
                    },
                },
            },
            {
                createDeveloperMetadata: {
                    developerMetadata: {
                        metadataKey: key,
                        metadataValue: value,
                        location: { sheetId },
                        visibility: 'DOCUMENT',
                    },
                },
            },
        ];
    }

    // Creates the run's tab (and the target tab if it is missing). If the
    // response is lost and the retry finds the tab already there, the first
    // try worked: the run's tab name is unique to the run.
    private static async setUpTabs(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            requests: sheets_v4.Schema$Request[];
            tabTitle: string;
            ownTitle: string;
            budget: RetryBudget;
        },
    ): Promise<{ targetSheetId?: number; ownSheetId: number }> {
        let replies: sheets_v4.Schema$Response[] = [];
        try {
            const response = await GoogleDriveClient.withWriteRetry(
                () =>
                    sheets.spreadsheets.batchUpdate(
                        {
                            spreadsheetId: fileId,
                            requestBody: { requests: args.requests },
                        },
                        { retry: false },
                    ),
                'tab setup',
                args.budget,
            );
            replies = response.data.replies ?? [];
        } catch (e) {
            const list = await GoogleDriveClient.listSheetProperties(
                sheets,
                fileId,
            ).catch(() => []);
            const own = list.find(({ title }) => title === args.ownTitle);
            if (!own) throw e;
            return {
                targetSheetId: list.find(
                    ({ title }) =>
                        title.toLowerCase() === args.tabTitle.toLowerCase(),
                )?.sheetId,
                ownSheetId: own.sheetId,
            };
        }
        const added = replies.flatMap(
            (reply) => reply.addSheet?.properties ?? [],
        );
        const ownSheetId = added.find(
            ({ title }) => title === args.ownTitle,
        )?.sheetId;
        if (ownSheetId === undefined || ownSheetId === null) {
            throw new UnexpectedGoogleSheetsError(
                'Unable to create the Google Sheets tabs for the sync',
            );
        }
        return {
            targetSheetId:
                added.find(({ title }) => title === args.tabTitle)?.sheetId ??
                undefined,
            ownSheetId,
        };
    }

    // Records this run as the one that writes the tab and deletes the
    // staging tabs of older runs, in one batch. If another run changed the
    // tabs at the same moment, the batch fails; read the tabs and try again.
    private static async claimTab(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            runId: string;
            sheetId: number;
            ownSheetId: number;
            budget: RetryBudget;
            olderStagingIds: (list: SheetProperties[]) => number[];
        },
        attempt = 0,
    ): Promise<SheetProperties> {
        const list = await GoogleDriveClient.listSheetProperties(
            sheets,
            fileId,
        );
        const target = list.find(({ sheetId }) => sheetId === args.sheetId);
        if (
            !target ||
            !list.some(({ sheetId }) => sheetId === args.ownSheetId) ||
            isNewerSyncRun(target.claim, args.runId)
        ) {
            throw new UnexpectedGoogleSheetsError(
                'A newer sync of this tab took over, or its staging tab was deleted',
            );
        }
        const requests: sheets_v4.Schema$Request[] = [
            // Fails the batch if a newer run deleted this run's tab after the
            // read above, so an older run never overwrites a newer claim.
            {
                updateSheetProperties: {
                    properties: { sheetId: args.ownSheetId, hidden: true },
                    fields: 'hidden',
                },
            },
            ...GoogleDriveClient.syncMarkerRequests(
                args.sheetId,
                GSHEETS_SYNC_CLAIM_KEY,
                args.runId,
            ),
            ...args.olderStagingIds(list).map((sheetId) => ({
                deleteSheet: { sheetId },
            })),
        ];
        try {
            await GoogleDriveClient.withWriteRetry(
                () =>
                    sheets.spreadsheets.batchUpdate(
                        { spreadsheetId: fileId, requestBody: { requests } },
                        { retry: false },
                    ),
                'tab claim',
                args.budget,
            );
        } catch (e) {
            if (attempt < 2 && e instanceof UnexpectedGoogleSheetsError) {
                return GoogleDriveClient.claimTab(
                    sheets,
                    fileId,
                    args,
                    attempt + 1,
                );
            }
            throw e;
        }
        return target;
    }

    private static async isSuperseded(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: { runId: string; sheetId: number },
    ): Promise<boolean> {
        try {
            const list = await GoogleDriveClient.listSheetProperties(
                sheets,
                fileId,
            );
            const claim = list.find(
                ({ sheetId }) => sheetId === args.sheetId,
            )?.claim;
            return isNewerSyncRun(claim, args.runId);
        } catch {
            return false;
        }
    }

    private static async assertTabExists(
        sheets: sheets_v4.Sheets,
        fileId: string,
        sheetId: number,
    ) {
        const list = await GoogleDriveClient.listSheetProperties(
            sheets,
            fileId,
        );
        if (!list.some((sheet) => sheet.sheetId === sheetId)) {
            throw new UnexpectedGoogleSheetsError(
                'The Lightdash tab of this sync was deleted',
            );
        }
    }

    // Set back without its sort: a sort would re-sort the synced rows on
    // every sync, and only part of them when the data grows past a fixed
    // filter range. The old write left the rows in query order.
    private static setBasicFilterRequest(
        basicFilter: sheets_v4.Schema$BasicFilter,
    ): sheets_v4.Schema$Request {
        return {
            setBasicFilter: {
                filter: { ...basicFilter, sortSpecs: undefined },
            },
        };
    }

    private static async listSheetProperties(
        sheets: sheets_v4.Sheets,
        fileId: string,
    ): Promise<SheetProperties[]> {
        const response = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.get({
                spreadsheetId: fileId,
                fields: 'sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)),basicFilter,developerMetadata(metadataKey,metadataValue))',
            }),
        );
        return (response.data.sheets ?? []).flatMap(
            ({ properties, basicFilter, developerMetadata }) =>
                properties?.title &&
                properties.sheetId !== null &&
                properties.sheetId !== undefined
                    ? [
                          {
                              sheetId: properties.sheetId,
                              title: properties.title,
                              hidden: properties.hidden ?? false,
                              rowCount:
                                  properties.gridProperties?.rowCount ?? 0,
                              columnCount:
                                  properties.gridProperties?.columnCount ?? 0,
                              ...(basicFilter ? { basicFilter } : {}),
                              ...GoogleDriveClient.syncMarkers(
                                  developerMetadata,
                              ),
                          },
                      ]
                    : [],
        );
    }

    // Pastes the staging values into the existing tab, which keeps its
    // sheetId, so references, charts, filters, protections and formatting
    // that point at it keep working. Pasted blank cells clear old values.
    // Each batchUpdate is atomic. Data that fits in one batch is swapped in
    // all-or-nothing. Larger data takes several batches; if a later one
    // fails, the tab holds new rows at the top and old rows below, and the
    // error says so.
    private static async swapStagingTab(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            sheetId: number;
            stagingSheetId: number;
            runId: string;
            budget: RetryBudget;
            pieces: Array<{ start: number; end: number }>;
            rowCount: number;
            columnCount: number;
            growGrid: boolean;
            gridRowCount: number;
            gridColumnCount: number;
            formatRequests: sheets_v4.Schema$Request[];
            basicFilter?: sheets_v4.Schema$BasicFilter;
            onRowsInTab: (rows: number) => void;
        },
    ) {
        const { pieces } = args;
        const copy = ({
            start,
            end,
        }: {
            start: number;
            end: number;
        }): sheets_v4.Schema$Request => {
            const range = {
                startRowIndex: start,
                endRowIndex: end,
                startColumnIndex: 0,
                endColumnIndex: args.columnCount,
            };
            return {
                copyPaste: {
                    source: { sheetId: args.stagingSheetId, ...range },
                    destination: { sheetId: args.sheetId, ...range },
                    pasteType: 'PASTE_VALUES',
                    pasteOrientation: 'NORMAL',
                },
            };
        };
        const growRequests: sheets_v4.Schema$Request[] = args.growGrid
            ? [
                  {
                      updateSheetProperties: {
                          properties: {
                              sheetId: args.sheetId,
                              gridProperties: {
                                  rowCount: args.gridRowCount,
                                  columnCount: args.gridColumnCount,
                              },
                          },
                          fields: 'gridProperties.rowCount,gridProperties.columnCount',
                      },
                  },
              ]
            : [];
        const finishRequests: sheets_v4.Schema$Request[] = [
            ...GoogleDriveClient.leftoverClearRequests(args),
            ...args.formatRequests,
            { deleteSheet: { sheetId: args.stagingSheetId } },
        ];
        // A paste skips the rows that a basic filter hides. Each batch turns
        // the filter off, pastes and sets the filter back, so the tab never
        // stays without it, also when a run stops between batches.
        const { basicFilter } = args;
        const withFilterOff = (
            requests: sheets_v4.Schema$Request[],
        ): sheets_v4.Schema$Request[] =>
            basicFilter
                ? [
                      { clearBasicFilter: { sheetId: args.sheetId } },
                      ...requests,
                      GoogleDriveClient.setBasicFilterRequest(basicFilter),
                  ]
                : requests;

        let batchCount = 0;
        // Google rejects a paste that holds too much with "Internal error
        // encountered". Then send the two halves of the batch, and so on,
        // down to GSHEETS_SWAP_MIN_SPLIT_ROWS rows. The tab keeps old rows
        // where a rejected paste would have gone, because a batch is atomic.
        const runPiece = async (
            piece: { start: number; end: number },
            isFirst: boolean,
            isLast: boolean,
        ): Promise<void> => {
            const requests = withFilterOff([
                ...(isFirst ? growRequests : []),
                copy(piece),
                ...(isLast ? finishRequests : []),
            ]);
            const rows = piece.end - piece.start;
            const stopOn =
                rows >= 2 * GSHEETS_SWAP_MIN_SPLIT_ROWS
                    ? GoogleDriveClient.isRejectedPaste
                    : undefined;
            const batchStartedAt = Date.now();
            const label = `tab swap of rows ${piece.start + 1}-${piece.end}`;
            try {
                if (isLast) {
                    await GoogleDriveClient.runFinalBatch(sheets, fileId, {
                        requests,
                        sheetId: args.sheetId,
                        runId: args.runId,
                        budget: args.budget,
                        label,
                        stopOn,
                    });
                } else {
                    await GoogleDriveClient.withWriteRetry(
                        () =>
                            sheets.spreadsheets.batchUpdate(
                                {
                                    spreadsheetId: fileId,
                                    requestBody: { requests },
                                },
                                { retry: false },
                            ),
                        label,
                        args.budget,
                        stopOn,
                    );
                }
            } catch (e) {
                if (!stopOn?.(e)) throw e;
                const middle = piece.start + Math.floor(rows / 2);
                Logger.warn(
                    `Google Sheets rejected the ${label} ("Internal error encountered"). Sending rows ${piece.start + 1}-${middle} and ${middle + 1}-${piece.end} in two batches`,
                );
                await runPiece(
                    { start: piece.start, end: middle },
                    isFirst,
                    false,
                );
                await runPiece(
                    { start: middle, end: piece.end },
                    false,
                    isLast,
                );
                return;
            }
            batchCount += 1;
            args.onRowsInTab(piece.end);
            Logger.info(
                `Copied rows ${piece.start + 1}-${piece.end} of ${args.rowCount} into the Google Sheets tab (batch ${batchCount}, ${pieces.length} planned) in ${Date.now() - batchStartedAt} ms`,
            );
        };

        await pieces.reduce(async (previous, piece, index) => {
            await previous;
            await runPiece(piece, index === 0, index === pieces.length - 1);
        }, Promise.resolve());
    }

    private static leftoverClearRequests(args: {
        sheetId: number;
        rowCount: number;
        columnCount: number;
        gridRowCount: number;
        gridColumnCount: number;
    }): sheets_v4.Schema$Request[] {
        return [
            ...(args.gridRowCount > args.rowCount
                ? [
                      {
                          updateCells: {
                              range: {
                                  sheetId: args.sheetId,
                                  startRowIndex: args.rowCount,
                              },
                              fields: 'userEnteredValue',
                          },
                      },
                  ]
                : []),
            ...(args.gridColumnCount > args.columnCount
                ? [
                      {
                          updateCells: {
                              range: {
                                  sheetId: args.sheetId,
                                  startRowIndex: 0,
                                  endRowIndex: args.rowCount,
                                  startColumnIndex: args.columnCount,
                              },
                              fields: 'userEnteredValue',
                          },
                      },
                  ]
                : []),
        ];
    }

    // The last batch of a write also records "done" for this run on the tab.
    // After an ambiguous failure (no response, or a 5xx), Google may have
    // applied the batch, and a retry would fail: the run's tab is deleted.
    // So read the record back: only this run's id proves the batch landed.
    // A 4xx response means it did not land.
    private static async runFinalBatch(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            requests: sheets_v4.Schema$Request[];
            sheetId: number;
            runId: string;
            budget: RetryBudget;
            label: string;
            stopOn?: (raw: AnyType) => boolean;
        },
    ) {
        const requests = [
            ...args.requests,
            ...GoogleDriveClient.syncMarkerRequests(
                args.sheetId,
                GSHEETS_SYNC_DONE_KEY,
                args.runId,
            ),
        ];
        await GoogleDriveClient.withWriteRetry(
            async () => {
                try {
                    return await sheets.spreadsheets.batchUpdate(
                        { spreadsheetId: fileId, requestBody: { requests } },
                        { retry: false },
                    );
                } catch (e) {
                    if (!GoogleDriveClient.isAmbiguousFailure(e)) throw e;
                    const done = await GoogleDriveClient.listSheetProperties(
                        sheets,
                        fileId,
                    )
                        .then(
                            (list) =>
                                list.find(
                                    ({ sheetId }) => sheetId === args.sheetId,
                                )?.done,
                        )
                        .catch(() => undefined);
                    if (done === args.runId) return undefined;
                    throw e;
                }
            },
            args.label,
            args.budget,
            args.stopOn,
        );
    }

    private static async finishInPlaceWrite(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            sheetId: number;
            ownSheetId: number;
            runId: string;
            budget: RetryBudget;
            rowCount: number;
            columnCount: number;
            gridRowCount: number;
            gridColumnCount: number;
            formatRequests: sheets_v4.Schema$Request[];
        },
    ) {
        await GoogleDriveClient.runFinalBatch(sheets, fileId, {
            requests: [
                ...GoogleDriveClient.leftoverClearRequests(args),
                ...args.formatRequests,
                { deleteSheet: { sheetId: args.ownSheetId } },
            ],
            sheetId: args.sheetId,
            runId: args.runId,
            budget: args.budget,
            label: 'clear of old rows',
        });
    }

    // Best effort: a tab that another run already deleted is not an error.
    private static async deleteTabsIfPresent(
        sheets: sheets_v4.Sheets,
        fileId: string,
        sheetIds: number[],
    ) {
        await sheetIds.reduce(async (previous, sheetId) => {
            await previous;
            try {
                await GoogleDriveClient.catchApiError(
                    sheets.spreadsheets.batchUpdate(
                        {
                            spreadsheetId: fileId,
                            requestBody: {
                                requests: [{ deleteSheet: { sheetId } }],
                            },
                        },
                        { retry: false },
                    ),
                );
            } catch (error) {
                Logger.warn(
                    `Unable to delete a Google Sheets staging tab: ${getErrorMessage(error)}`,
                );
            }
        }, Promise.resolve());
    }

    // An in-place write must replace every cell of the old rows: the Sheets
    // API skips null values and leaves cells past a short row unchanged.
    private static toOverwriteRows(rows: AnyType[][], columnCount: number) {
        return rows.map((row) =>
            Array.from({ length: columnCount }, (_, i) => row[i] ?? ''),
        );
    }

    // Retry on what the HTTP response says, as gaxios did before we turned
    // its retries off: no response, 429 and any 5xx. Some Google errors come
    // without a status, so the mapped class counts too.
    private static isRetryableWriteError(raw: AnyType, mapped: Error) {
        const status = GoogleDriveClient.httpStatus(raw);
        return (
            GoogleDriveClient.isNetworkError(raw) ||
            status === 429 ||
            (status !== undefined && status >= 500 && status <= 599) ||
            mapped instanceof GoogleSheetsQuotaError ||
            mapped instanceof GoogleSheetsTransientError ||
            (mapped instanceof UnexpectedGoogleSheetsError &&
                mapped.message === GOOGLE_INTERNAL_ERROR_MESSAGE)
        );
    }

    private static httpStatus(raw: AnyType): number | undefined {
        const status = raw?.response?.status;
        return typeof status === 'number' ? status : undefined;
    }

    // An ambiguous failure: Google can have applied the request.
    private static isAmbiguousFailure(raw: AnyType) {
        const status = GoogleDriveClient.httpStatus(raw);
        return (
            GoogleDriveClient.isNetworkError(raw) ||
            (status !== undefined && status >= 500 && status <= 599)
        );
    }

    // A paste that holds too much fails with "Internal error encountered"
    // within seconds, and fails again when it is sent again.
    private static isRejectedPaste(raw: AnyType) {
        return (
            GoogleDriveClient.httpStatus(raw) === 500 &&
            getErrorMessage(raw).includes('Internal error encountered')
        );
    }

    // stopOn: errors that the caller handles itself. They are thrown as
    // Google sent them, without a retry.
    private static async withWriteRetry<T>(
        write: () => Promise<T>,
        label: string,
        budget?: RetryBudget,
        stopOn?: (raw: AnyType) => boolean,
        attempt = 0,
    ): Promise<T> {
        try {
            return await write();
        } catch (raw) {
            if (stopOn?.(raw)) throw raw;
            const mapped = GoogleDriveClient.toGoogleSheetsError(raw);
            if (
                !GoogleDriveClient.isRetryableWriteError(raw, mapped) ||
                attempt >= GSHEETS_WRITE_RETRY_DELAYS_MS.length
            ) {
                throw mapped;
            }
            const retryAfterMs =
                mapped instanceof GoogleSheetsQuotaError &&
                typeof mapped.data?.retryAfterMs === 'number'
                    ? Math.min(
                          mapped.data.retryAfterMs,
                          GSHEETS_RETRY_AFTER_CEILING_MS,
                      )
                    : undefined;
            // Jitter spreads the retries of runs that share one quota.
            const delayMs =
                retryAfterMs ??
                Math.round(
                    GSHEETS_WRITE_RETRY_DELAYS_MS[attempt] *
                        (1 -
                            GSHEETS_RETRY_JITTER +
                            2 * GSHEETS_RETRY_JITTER * Math.random()),
                );
            if (budget && delayMs > budget.remainingMs) {
                Logger.warn(
                    `Google Sheets ${label} failed (${getErrorMessage(mapped)}). No retry: the retry time for this sync is used up`,
                );
                throw mapped;
            }
            if (budget) {
                // eslint-disable-next-line no-param-reassign
                budget.remainingMs -= delayMs;
            }
            Logger.warn(
                `Google Sheets ${label} failed (${getErrorMessage(mapped)}). Retry ${attempt + 1} of ${GSHEETS_WRITE_RETRY_DELAYS_MS.length} in ${delayMs} ms`,
            );
            await sleep(delayMs);
            return GoogleDriveClient.withWriteRetry(
                write,
                label,
                budget,
                stopOn,
                attempt + 1,
            );
        }
    }

    // Name the cause and the size in the scheduler log and the owner email.
    // The message carries counts and the tab name, never cell values.
    private static describeWriteFailure(error: unknown, context: WriteContext) {
        if (
            !(error instanceof GoogleSheetsTransientError) &&
            !(error instanceof UnexpectedGoogleSheetsError) &&
            !(error instanceof GoogleSheetsQuotaError)
        ) {
            return error;
        }
        // True whatever happens next: a scheduled sync is retried for a
        // quota or transient error and turned off for other errors, and an
        // export to a new sheet is not run again.
        const turnedOff = error instanceof UnexpectedGoogleSheetsError;
        const outcome =
            context.rowsInTab > 0
                ? `The sync stopped part-way. Rows 1-${formatCount(context.rowsInTab)} of the tab are new. The rows after them can be from the previous sync until a later run completes.${turnedOff ? ' If the sync was turned off, turn it on again to replace them.' : ''}`
                : 'The data in the tab was not changed.';
        const message = `Google Sheets could not write ${formatCount(context.rowCount)} rows (including header rows, ${formatSize(context.totalBytes)}) to the tab "${context.tabTitle}". ${outcome} Google error: ${getErrorMessage(error)}`;
        if (error instanceof GoogleSheetsQuotaError) {
            return new GoogleSheetsQuotaError(message, error.data);
        }
        if (error instanceof GoogleSheetsTransientError) {
            return new GoogleSheetsTransientError(message, error.data);
        }
        return new UnexpectedGoogleSheetsError(message, error.data);
    }
}
