import {
    getErrorMessage,
    LightdashError,
    ParameterError,
    type DataAppCodeDownload,
} from '@lightdash/common';

export const DEFAULT_APPS_LIMIT = 50;

/**
 * Resolves the --apps-limit flag. Commander passes the raw string (or
 * undefined when the flag was not given, so an explicit flag is
 * distinguishable from the default). Throws ParameterError on anything
 * that is not a positive integer.
 */
export const resolveAppsLimit = (
    rawLimit: string | undefined,
    includeApps: boolean,
): { limit: number; noEffectWarning: string | null } => {
    if (rawLimit === undefined) {
        return { limit: DEFAULT_APPS_LIMIT, noEffectWarning: null };
    }
    if (!/^\d+$/.test(rawLimit) || parseInt(rawLimit, 10) < 1) {
        throw new ParameterError(
            `--apps-limit must be a positive integer, got "${rawLimit}".`,
        );
    }
    return {
        limit: parseInt(rawLimit, 10),
        noEffectWarning: includeApps
            ? null
            : '--apps-limit only applies to --include-apps; explicit --apps UUIDs are never capped.',
    };
};

/**
 * The project-wide apps listing endpoint 404s on servers that predate it
 * (or builds without EE routes) — fall back to the space-scoped content
 * API listing there. Other errors (401/403/5xx) are real and propagate;
 * in particular 403 means data apps are disabled on the instance.
 */
export const shouldFallBackToSpaceScopedListing = (err: unknown): boolean =>
    err instanceof LightdashError && err.statusCode === 404;

export type AppsDownloadSelection =
    | { mode: 'none' }
    | { mode: 'explicit'; appUuids: string[] }
    | { mode: 'list-all'; extraAppUuids: string[] };

/**
 * Explicit UUIDs (--apps) are fetched directly; --include-apps lists every
 * app in the project via the project-wide apps endpoint, falling back to
 * the space-scoped content API on servers that predate it.
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
    limit: number,
): { appUuids: string[]; truncatedCount: number } => ({
    appUuids: listedUuids.slice(0, limit),
    truncatedCount: Math.max(0, listedUuids.length - limit),
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

export type AppDownloadErrorOutcome =
    | { kind: 'skip-not-built' }
    | { kind: 'fail'; message: string };

/**
 * A 404 saying the app has no ready version means it exists but never
 * finished a successful build — nothing to download, so it's a skip, not a
 * failure. Everything else fails the app, preferring the server's own
 * message over a canned guess.
 */
export const classifyAppDownloadError = (
    err: unknown,
): AppDownloadErrorOutcome => {
    if (err instanceof LightdashError) {
        if (
            err.statusCode === 404 &&
            err.message.includes('no ready version')
        ) {
            return { kind: 'skip-not-built' };
        }
        if (err.message) {
            return { kind: 'fail', message: err.message };
        }
        if (err.statusCode === 404) {
            return {
                kind: 'fail',
                message:
                    'App not found. It may not exist on this server, or data apps may not be enabled.',
            };
        }
    }
    return { kind: 'fail', message: getErrorMessage(err) };
};

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
    skippedNotBuiltCount: number,
): { ok: boolean; message: string; failureLines: string[] } => {
    const attempted = total - skippedNotBuiltCount;
    const skippedSuffix =
        skippedNotBuiltCount > 0
            ? ` (${skippedNotBuiltCount} skipped: no built version)`
            : '';
    const base = `Downloaded ${successCount} of ${attempted} data app(s) to ${appsDir}${skippedSuffix}`;
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
