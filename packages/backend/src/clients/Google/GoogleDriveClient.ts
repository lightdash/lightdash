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
    GoogleSheetsTransientError,
    isDimension,
    isField,
    ItemsMap,
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
export const GSHEETS_WRITE_CHUNK_MAX_CELLS = 250_000;
export const GSHEETS_WRITE_CHUNK_MAX_BYTES = 8 * 1024 * 1024;
// A batchUpdate that pastes more than ~187k such rows fails the same way,
// also when the paste is split into several copyPaste requests. So the swap
// copies at most this much per batchUpdate. Clearing cells does not count.
export const GSHEETS_SWAP_BATCH_MAX_ROWS = 100_000;
export const GSHEETS_SWAP_BATCH_MAX_CELLS = 500_000;
// Cells per spreadsheet, counted over every tab, empty cells included.
// Google raised it from 10M to 20M in September 2026.
export const GOOGLE_SHEETS_CELL_LIMIT = 20_000_000;
// Bounded per-request backoff (~65s in total) so a 429 waits out a quota
// window. Our own retries replace gaxios's hidden ones (see `retry: false`).
export const GSHEETS_WRITE_RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
const GSHEETS_RETRY_AFTER_CEILING_MS = 60_000;
const GOOGLE_INTERNAL_ERROR_MESSAGE =
    'Google Drive internal error encountered. Please try again later.';
// Hidden, so it does not show in the tab bar. Named so that an editor who
// unhides it knows what it is.
const STAGING_TAB_PREFIX = 'Lightdash sync in progress ';
const NEW_TAB_ROW_COUNT = 1000;
const NEW_TAB_COLUMN_COUNT = 26;

export type GoogleSheetsWriteChunk = {
    start: number;
    end: number;
    bytes: number;
};

export const planGoogleSheetsWriteChunks = (
    rows: unknown[][],
    maxRows: number = GSHEETS_WRITE_CHUNK_MAX_ROWS,
    maxBytes: number = GSHEETS_WRITE_CHUNK_MAX_BYTES,
    maxCells: number = GSHEETS_WRITE_CHUNK_MAX_CELLS,
): { chunks: GoogleSheetsWriteChunk[]; totalBytes: number } => {
    const chunks: GoogleSheetsWriteChunk[] = [];
    let start = 0;
    let bytes = 0;
    let cells = 0;
    let totalBytes = 0;
    rows.forEach((row, index) => {
        const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;
        if (
            index > start &&
            (index - start >= maxRows ||
                bytes + rowBytes > maxBytes ||
                cells + row.length > maxCells)
        ) {
            chunks.push({ start, end: index, bytes });
            start = index;
            bytes = 0;
            cells = 0;
        }
        bytes += rowBytes;
        cells += row.length;
        totalBytes += rowBytes;
    });
    if (rows.length > start) {
        chunks.push({ start, end: rows.length, bytes });
    }
    return { chunks, totalBytes };
};

const formatCount = (value: number) => value.toLocaleString('en-US');

const formatMegabytes = (bytes: number) =>
    `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const quoteTabName = (title: string) => `'${title.replaceAll("'", "''")}'`;

type SheetProperties = {
    sheetId: number;
    title: string;
    hidden: boolean;
    rowCount: number;
    columnCount: number;
};

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
            if (err?.response?.status === 404) {
                throw new NotFoundError(
                    `Google Sheet not found: ${err.response?.data?.error?.message}`,
                );
            }

            if (err?.response?.status === 401) {
                throw new ForbiddenError(
                    `Failed to authorize: ${err.response.data?.error}: ${err.response.data?.error_description}`,
                );
            }

            if (
                err?.response?.status === 400 &&
                err?.response?.data?.error === 'invalid_grant'
            ) {
                throw new ForbiddenError(
                    `Failed to refresh token: ${err.response.data.error}: ${err.response.data.error_description}`,
                );
            }

            if (
                err?.message &&
                err.message.includes('The caller does not have permission')
            ) {
                throw new ForbiddenError(
                    `The caller does not have permission to access this Google Sheet: ${err.message}`,
                );
            }

            if (
                err?.message &&
                err.message.includes('The service is currently unavailable')
            ) {
                throw new GoogleSheetsTransientError(err);
            }

            if (
                err?.message &&
                err.message.includes(
                    'This operation is not supported for this document',
                )
            ) {
                throw new UnexpectedGoogleSheetsError(
                    `This operation is not supported for the provided file. ` +
                        `Please ensure you are using a valid Google Sheets file. ` +
                        `The file might be an Excel .xlsx file, or another file type that does not support Google spreadsheet operations.`,
                );
            }
            if (
                err?.message &&
                err.message.includes('Internal error encountered.')
            ) {
                throw new UnexpectedGoogleSheetsError(
                    GOOGLE_INTERNAL_ERROR_MESSAGE,
                );
            }

            // Detect quota/rate limit errors - these should be retried, not permanently disabled
            // like: Write requests per minute per user
            if (err?.message && err.message.includes('Quota exceeded')) {
                throw new GoogleSheetsQuotaError(getErrorMessage(err), {
                    retryAfterMs: GoogleDriveClient.parseRetryAfterMs(err),
                });
            }

            if (GoogleDriveClient.isNetworkError(err)) {
                throw new GoogleSheetsTransientError(getErrorMessage(err));
            }

            throw new UnexpectedGoogleSheetsError(getErrorMessage(err));
        }
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
        const tabTitle =
            (tabName ? tabName.replaceAll(':', '.') : undefined) ??
            (
                existingSheets.find(
                    (sheet) =>
                        !sheet.hidden &&
                        !sheet.title.startsWith(STAGING_TAB_PREFIX),
                ) ?? existingSheets[0]
            )?.title;
        if (tabTitle === undefined) {
            throw new UnexpectedGoogleSheetsError(
                'Unable to find the first sheet name in the spreadsheet',
            );
        }
        const target = existingSheets.find((sheet) => sheet.title === tabTitle);
        const stagingPrefix = `${STAGING_TAB_PREFIX}${createHash('sha256')
            .update(tabTitle)
            .digest('hex')
            .slice(0, 8)}-`;
        // Left by a run that crashed or timed out. Deleting one that an
        // orphaned run still writes to makes that run fail without changes.
        const staleStagingSheets = existingSheets.filter(
            (sheet) =>
                sheet !== target && sheet.title.startsWith(stagingPrefix),
        );

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
            `Writing ${rowCount} rows and ${columnCount} columns (about ${formatMegabytes(totalBytes)}) to Google sheets in ${chunks.length} requests (${inPlace ? 'in place' : 'staged in a hidden tab'})`,
        );
        const startedAt = Date.now();

        const stagingTitle = `${stagingPrefix}${randomBytes(3).toString('hex')}`;
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
            ...staleStagingSheets.map(({ sheetId }) => ({
                deleteSheet: { sheetId },
            })),
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
            ...(inPlace
                ? []
                : [
                      {
                          addSheet: {
                              properties: {
                                  title: stagingTitle,
                                  hidden: true,
                                  gridProperties: { rowCount, columnCount },
                              },
                          },
                      },
                  ]),
        ];

        let targetSheetId = target?.sheetId;
        let stagingSheetId: number | undefined;
        try {
            if (setupRequests.length > 0) {
                const response = await GoogleDriveClient.withWriteRetry(
                    () =>
                        sheets.spreadsheets.batchUpdate(
                            {
                                spreadsheetId: fileId,
                                requestBody: { requests: setupRequests },
                            },
                            { retry: false },
                        ),
                    'tab setup',
                );
                const added = (response.data.replies ?? []).flatMap(
                    (reply) => reply.addSheet?.properties ?? [],
                );
                targetSheetId =
                    targetSheetId ??
                    added.find(({ title }) => title === tabTitle)?.sheetId ??
                    undefined;
                stagingSheetId =
                    added.find(({ title }) => title === stagingTitle)
                        ?.sheetId ?? undefined;
            }
            if (
                targetSheetId === undefined ||
                (!inPlace && stagingSheetId === undefined)
            ) {
                throw new UnexpectedGoogleSheetsError(
                    'Unable to create the Google Sheets tabs for the sync',
                );
            }

            const writeTitle = quoteTabName(inPlace ? tabTitle : stagingTitle);
            await chunks.reduce(async (previous, chunk, index) => {
                await previous;
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
                );
                if (inPlace) context.rowsInTab = chunk.end;
                Logger.info(
                    `Wrote Google Sheets request ${index + 1} of ${chunks.length} (${chunk.end - chunk.start} rows, about ${formatMegabytes(chunk.bytes)})`,
                );
            }, Promise.resolve());

            const sheetId = targetSheetId;
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
                await GoogleDriveClient.finishInPlaceWrite(sheets, fileId, {
                    sheetId,
                    rowCount,
                    columnCount,
                    gridRowCount: targetRowCount,
                    gridColumnCount: targetColumnCount,
                    formatRequests,
                });
            } else {
                const swapStartedAt = Date.now();
                await GoogleDriveClient.swapStagingTab(sheets, fileId, {
                    sheetId,
                    stagingSheetId: stagingSheetId!,
                    rowCount,
                    columnCount,
                    growGrid: growTarget,
                    gridRowCount: targetRowCount,
                    gridColumnCount: targetColumnCount,
                    formatRequests,
                    onRowsInTab: (rows) => {
                        context.rowsInTab = rows;
                    },
                });
                stagingSheetId = undefined;
                Logger.info(
                    `Swapped ${rowCount} rows from the staging tab into the Google Sheets tab in ${Date.now() - swapStartedAt} ms`,
                );
            }
        } catch (e) {
            if (stagingSheetId !== undefined) {
                await GoogleDriveClient.deleteStagingTab(
                    sheets,
                    fileId,
                    stagingSheetId,
                );
            }
            throw GoogleDriveClient.describeWriteFailure(e, context);
        }

        Logger.info(
            `Wrote ${rowCount} rows to Google sheets in ${chunks.length} requests and ${Date.now() - startedAt} ms`,
        );
    }

    private static async listSheetProperties(
        sheets: sheets_v4.Sheets,
        fileId: string,
    ): Promise<SheetProperties[]> {
        const response = await GoogleDriveClient.catchApiError(
            sheets.spreadsheets.get({
                spreadsheetId: fileId,
                fields: 'sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))',
            }),
        );
        return (response.data.sheets ?? []).flatMap(({ properties }) =>
            properties?.title &&
            properties.sheetId !== null &&
            properties.sheetId !== undefined
                ? [
                      {
                          sheetId: properties.sheetId,
                          title: properties.title,
                          hidden: properties.hidden ?? false,
                          rowCount: properties.gridProperties?.rowCount ?? 0,
                          columnCount:
                              properties.gridProperties?.columnCount ?? 0,
                      },
                  ]
                : [],
        );
    }

    // Pastes the staging values into the existing tab, which keeps its
    // sheetId, so references, charts, filters, protections and formatting
    // that point at it keep working. Pasted blank cells clear old values.
    // Each batchUpdate is atomic. Data that fits in one batch (up to 100k
    // rows and 500k cells) is swapped in all-or-nothing. Larger data takes
    // several batches; if a later one fails, the tab holds new rows at the
    // top and old rows below, and the error says so.
    private static async swapStagingTab(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            sheetId: number;
            stagingSheetId: number;
            rowCount: number;
            columnCount: number;
            growGrid: boolean;
            gridRowCount: number;
            gridColumnCount: number;
            formatRequests: sheets_v4.Schema$Request[];
            onRowsInTab: (rows: number) => void;
        },
    ) {
        const batchRows = Math.max(
            1,
            Math.min(
                GSHEETS_SWAP_BATCH_MAX_ROWS,
                Math.floor(GSHEETS_SWAP_BATCH_MAX_CELLS / args.columnCount),
            ),
        );
        const pieces: Array<{ start: number; end: number }> = [];
        for (let start = 0; start < args.rowCount; start += batchRows) {
            pieces.push({
                start,
                end: Math.min(args.rowCount, start + batchRows),
            });
        }
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
            ...args.formatRequests,
            { deleteSheet: { sheetId: args.stagingSheetId } },
        ];

        await pieces.reduce(async (previous, piece, index) => {
            await previous;
            const isLast = index === pieces.length - 1;
            const requests = [
                ...(index === 0 ? growRequests : []),
                copy(piece),
                ...(isLast ? finishRequests : []),
            ];
            const batchStartedAt = Date.now();
            await GoogleDriveClient.withWriteRetry(
                async () => {
                    try {
                        return await sheets.spreadsheets.batchUpdate(
                            {
                                spreadsheetId: fileId,
                                requestBody: { requests },
                            },
                            { retry: false },
                        );
                    } catch (e) {
                        // A lost response can hide a last batch that Google
                        // applied: then the staging tab is gone.
                        if (!isLast) throw e;
                        const stagingTabExists =
                            await GoogleDriveClient.listSheetProperties(
                                sheets,
                                fileId,
                            )
                                .then((list) =>
                                    list.some(
                                        ({ sheetId }) =>
                                            sheetId === args.stagingSheetId,
                                    ),
                                )
                                .catch(() => true);
                        if (!stagingTabExists) return undefined;
                        throw e;
                    }
                },
                `tab swap of rows ${piece.start + 1}-${piece.end}`,
            );
            args.onRowsInTab(piece.end);
            Logger.info(
                `Copied rows ${piece.start + 1}-${piece.end} of ${args.rowCount} into the Google Sheets tab (batch ${index + 1} of ${pieces.length}) in ${Date.now() - batchStartedAt} ms`,
            );
        }, Promise.resolve());
    }

    private static async finishInPlaceWrite(
        sheets: sheets_v4.Sheets,
        fileId: string,
        args: {
            sheetId: number;
            rowCount: number;
            columnCount: number;
            gridRowCount: number;
            gridColumnCount: number;
            formatRequests: sheets_v4.Schema$Request[];
        },
    ) {
        const requests: sheets_v4.Schema$Request[] = [
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
            ...args.formatRequests,
        ];
        if (requests.length === 0) return;
        await GoogleDriveClient.withWriteRetry(
            () =>
                sheets.spreadsheets.batchUpdate(
                    { spreadsheetId: fileId, requestBody: { requests } },
                    { retry: false },
                ),
            'clear of old rows',
        );
    }

    private static async deleteStagingTab(
        sheets: sheets_v4.Sheets,
        fileId: string,
        sheetId: number,
    ) {
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
                `Unable to delete the Google Sheets staging tab: ${getErrorMessage(error)}`,
            );
        }
    }

    // An in-place write must replace every cell of the old rows: the Sheets
    // API skips null values and leaves cells past a short row unchanged.
    private static toOverwriteRows(rows: AnyType[][], columnCount: number) {
        return rows.map((row) =>
            Array.from({ length: columnCount }, (_, i) => row[i] ?? ''),
        );
    }

    private static isRetryableWriteError(error: unknown) {
        return (
            error instanceof GoogleSheetsQuotaError ||
            error instanceof GoogleSheetsTransientError ||
            (error instanceof UnexpectedGoogleSheetsError &&
                error.message === GOOGLE_INTERNAL_ERROR_MESSAGE)
        );
    }

    private static async withWriteRetry<T>(
        write: () => Promise<T>,
        label: string,
        attempt = 0,
    ): Promise<T> {
        try {
            return await GoogleDriveClient.catchApiError(write());
        } catch (e) {
            if (
                !GoogleDriveClient.isRetryableWriteError(e) ||
                attempt >= GSHEETS_WRITE_RETRY_DELAYS_MS.length
            ) {
                throw e;
            }
            const retryAfterMs =
                e instanceof GoogleSheetsQuotaError &&
                typeof e.data?.retryAfterMs === 'number'
                    ? Math.min(
                          e.data.retryAfterMs,
                          GSHEETS_RETRY_AFTER_CEILING_MS,
                      )
                    : undefined;
            const delayMs =
                retryAfterMs ?? GSHEETS_WRITE_RETRY_DELAYS_MS[attempt];
            Logger.warn(
                `Google Sheets ${label} failed (${getErrorMessage(e)}). Retry ${attempt + 1} of ${GSHEETS_WRITE_RETRY_DELAYS_MS.length} in ${delayMs} ms`,
            );
            await sleep(delayMs);
            return GoogleDriveClient.withWriteRetry(write, label, attempt + 1);
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
        const outcome =
            context.rowsInTab > 0
                ? `The sync stopped part-way. Rows 1-${formatCount(context.rowsInTab)} of the tab are new, and the rest may be from the previous sync. The next successful sync replaces them.`
                : 'The data in the tab was not changed.';
        const message = `Google Sheets could not write ${formatCount(context.rowCount)} rows (including the header, about ${formatMegabytes(context.totalBytes)}) to the tab "${context.tabTitle}". ${outcome} Google error: ${getErrorMessage(error)}`;
        if (error instanceof GoogleSheetsQuotaError) {
            return new GoogleSheetsQuotaError(message, error.data);
        }
        if (error instanceof GoogleSheetsTransientError) {
            return new GoogleSheetsTransientError(message, error.data);
        }
        return new UnexpectedGoogleSheetsError(message, error.data);
    }
}
