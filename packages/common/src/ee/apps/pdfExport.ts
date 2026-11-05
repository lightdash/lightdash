import { isPlainObject } from 'es-toolkit/compat';

/** Window global MinimalApp publishes and UnfurlService reads. */
export const APP_PDF_EXPORT_GLOBAL = '__lightdashAppPdfExport';

/** Hard cap on the exported PDF, pre-base64. Crossing page.evaluate() as a
 *  string costs ~4/3 of this on the wire. */
export const MAX_APP_PDF_BYTES = 50 * 1024 * 1024;

export type AppPdfExportResult =
    | { status: 'success'; pdfBase64: string }
    | { status: 'error'; error: string };

/** Error the host publishes when the app never announced the pdf-export
 *  capability — apps generated before the registerPdfExport mandate. */
export const APP_PDF_EXPORT_UNSUPPORTED_ERROR =
    'This app has no PDF export. Regenerate or upgrade the app to add one.';

/** Every field crosses an untrusted page.evaluate() boundary. */
export const parseAppPdfExportResult = (
    value: unknown,
): AppPdfExportResult | null => {
    if (!isPlainObject(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (
        candidate.status === 'success' &&
        typeof candidate.pdfBase64 === 'string' &&
        candidate.pdfBase64.length > 0
    ) {
        return { status: 'success', pdfBase64: candidate.pdfBase64 };
    }
    if (candidate.status === 'error' && typeof candidate.error === 'string') {
        return { status: 'error', error: candidate.error };
    }
    return null;
};
