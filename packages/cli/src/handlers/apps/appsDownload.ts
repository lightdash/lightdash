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

/**
 * Shown when a newly created app's folder manifest was NOT retargeted —
 * spells out the consequence and the manual fix.
 */
export const manifestRetargetHint = (args: {
    folder: string;
    appUuid: string;
    projectUuid: string;
}): string =>
    `${args.folder}/lightdash-app.yml still targets the original app, so future uploads here will ask to create again. To update the new app instead, set appUuid: ${args.appUuid} and projectUuid: ${args.projectUuid} in lightdash-app.yml.`;

/**
 * Sums changes entries that represent actual upserts — excluding both
 * 'skipped' and 'failed' keys so that failures don't suppress the
 * "all content was skipped" warning.
 */
export const computeUpsertedTotal = (changes: Record<string, number>): number =>
    Object.entries(changes)
        .filter(([key]) => !key.includes('skipped') && !key.includes('failed'))
        .reduce((sum, [, value]) => sum + value, 0);

/**
 * Returns true when there is at least one skipped item and zero upserted
 * items — the condition that should display the "all skipped" warning.
 */
export const shouldWarnAllSkipped = (
    changes: Record<string, number>,
): boolean => {
    const totalSkipped = Object.entries(changes)
        .filter(([key]) => key.includes('skipped'))
        .reduce((sum, [, value]) => sum + value, 0);
    return totalSkipped > 0 && computeUpsertedTotal(changes) === 0;
};

/**
 * Determines how an app upload should proceed given a potential project
 * mismatch between the manifest and the upload target.
 *
 * 'proceed'            — upload immediately (same project, or --create-new).
 * 'needs-confirmation' — projects differ and --create-new was not passed;
 *                        caller must prompt (TTY) or reject (non-TTY).
 */
export const classifyAppUpload = (
    manifestProjectUuid: string,
    targetProjectUuid: string,
    createNew: boolean,
): 'proceed' | 'needs-confirmation' => {
    if (createNew || manifestProjectUuid === targetProjectUuid) {
        return 'proceed';
    }
    return 'needs-confirmation';
};

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
