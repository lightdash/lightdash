/**
 * On-demand export to Google Sheets for data apps.
 *
 * The SDK posts a single message to the parent host. The parent owns the
 * Google OAuth popup (sandboxed iframes can't), the backend POST, and the
 * job polling. This function awaits one response.
 */

import type {
    SdkGsheetExportColumn,
    SdkGsheetExportRequest,
    SdkGsheetExportResponse,
    SdkGsheetExportRow,
} from './postMessageTransport';

const TIMEOUT_MS = 120_000;

export type ExportToSheetsOptions = {
    title: string;
    columns: SdkGsheetExportColumn[];
    rows: SdkGsheetExportRow[];
};

export type ExportToSheetsResult = {
    fileUrl: string;
};

export async function exportToSheets(
    options: ExportToSheetsOptions,
): Promise<ExportToSheetsResult> {
    if (typeof window === 'undefined') {
        throw new Error(
            'exportToSheets must run in a browser context (iframe)',
        );
    }
    if (window.parent === window) {
        throw new Error(
            'exportToSheets must run inside a Lightdash data-app iframe',
        );
    }

    const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const request: SdkGsheetExportRequest = {
        type: 'lightdash:sdk:gsheet-export-request',
        id,
        title: options.title,
        columns: options.columns,
        rows: options.rows,
    };

    return new Promise<ExportToSheetsResult>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
            const data = event.data as SdkGsheetExportResponse | undefined;
            if (
                !data ||
                data.type !== 'lightdash:sdk:gsheet-export-response' ||
                data.id !== id
            ) {
                return;
            }
            window.removeEventListener('message', handler);
            clearTimeout(timer);
            if (data.error) {
                reject(new Error(data.error));
                return;
            }
            if (!data.fileUrl) {
                reject(new Error('Sheet export returned no file URL'));
                return;
            }
            resolve({ fileUrl: data.fileUrl });
        };

        const timer = setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(
                new Error(
                    `exportToSheets timed out after ${TIMEOUT_MS}ms`,
                ),
            );
        }, TIMEOUT_MS);

        window.addEventListener('message', handler);
        window.parent.postMessage(request, '*');
    });
}
