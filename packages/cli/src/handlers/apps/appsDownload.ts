import { type DataAppCodeDownload } from '@lightdash/common';

export const MAX_INCLUDE_APPS = 10;

export type AppsDownloadSelection =
    | { mode: 'none' }
    | { mode: 'explicit'; appUuids: string[] }
    | { mode: 'list-all'; extraAppUuids: string[] };

/**
 * Explicit UUIDs (--apps) are fetched directly (works for apps not in any
 * space); only --include-apps lists apps via the space-scoped content API,
 * which omits apps that were never added to a space.
 */
export const selectAppsToDownload = (request: {
    apps?: string[];
    includeApps?: boolean;
}): AppsDownloadSelection => {
    const explicitUuids = request.apps ?? [];
    if (request.includeApps) {
        return { mode: 'list-all', extraAppUuids: explicitUuids };
    }
    if (explicitUuids.length > 0) {
        return { mode: 'explicit', appUuids: explicitUuids };
    }
    return { mode: 'none' };
};

export const capListedApps = (
    listedUuids: string[],
): { appUuids: string[]; truncatedCount: number } => ({
    appUuids: listedUuids.slice(0, MAX_INCLUDE_APPS),
    truncatedCount: Math.max(0, listedUuids.length - MAX_INCLUDE_APPS),
});

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
