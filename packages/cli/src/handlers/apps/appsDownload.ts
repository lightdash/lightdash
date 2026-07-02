import { type DataAppCodeDownload } from '@lightdash/common';

export type AppsDownloadSelection =
    | { mode: 'explicit'; appUuids: string[] }
    | { mode: 'list-all' };

/**
 * Explicit UUIDs are fetched directly (works for apps not in any space);
 * only the no-uuid form falls back to listing apps via the space-scoped
 * content API, which omits apps that were never added to a space.
 */
export const selectAppsToDownload = (
    appsOption: true | string[],
): AppsDownloadSelection => {
    if (Array.isArray(appsOption) && appsOption.length > 0) {
        return { mode: 'explicit', appUuids: appsOption };
    }
    return { mode: 'list-all' };
};

/**
 * Pre-context servers return a download payload without `context`.
 */
export const ensureDownloadedAppContext = (
    appUuid: string,
    code: DataAppCodeDownload,
): DataAppCodeDownload => {
    if (code.context === undefined) {
        throw new Error(
            `This Lightdash server does not support app context downloads (app ${appUuid}). Upgrade the server, or use a CLI version matching your server.`,
        );
    }
    return code;
};

export type AppDownloadFailure = { appUuid: string; message: string };

export const appsDownloadSummary = (
    successCount: number,
    total: number,
    failures: AppDownloadFailure[],
    appsDir: string,
): { ok: boolean; message: string; failureLines: string[] } => {
    const base = `Downloaded ${successCount} of ${total} data app(s) to ${appsDir}`;
    if (failures.length === 0) {
        return { ok: true, message: base, failureLines: [] };
    }
    return {
        ok: false,
        message: `${base} — ${failures.length} failed`,
        failureLines: failures.map(
            (failure) => `  ✖ ${failure.appUuid}: ${failure.message}`,
        ),
    };
};
