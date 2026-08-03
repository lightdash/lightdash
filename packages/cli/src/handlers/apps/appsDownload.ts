import {
    getErrorMessage,
    LightdashError,
    ParameterError,
    type DataAppCodeDownload,
    type DataAppManifest,
} from '@lightdash/common';
import * as path from 'path';
import { validate as isUuid } from 'uuid';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import {
    resolveAppFolderName,
    writeBundleToDir,
    writeContextToDir,
    writeDependenciesToDir,
    writeFilesToDir,
} from './appCodeFiles';
import { buildStaticAuthoringFiles } from './scaffolding';

export const DEFAULT_APPS_LIMIT = 50;

export const getDataAppReference = (reference: string): string => {
    let url: URL;
    try {
        url = new URL(reference);
    } catch {
        return reference;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return reference;
    }

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const appSegmentIndex = pathSegments.findIndex(
        (segment, index) =>
            (segment === 'apps' || segment === 'app') &&
            isUuid(pathSegments[index + 1]),
    );

    return appSegmentIndex >= 0 ? pathSegments[appSegmentIndex + 1] : reference;
};

export const getDataAppUploadFilter = (
    references: string[],
    includeApps: boolean,
): Set<string> | null =>
    includeApps ? null : new Set(references.map(getDataAppReference));

/**
 * --include-apps uploads every folder; explicit --apps references filter by
 * the manifest's slug or appUuid (references may be either, or app URLs).
 */
export const uploadFilterMatches = (
    filter: Set<string> | null,
    manifest: DataAppManifest,
): boolean =>
    filter === null ||
    (manifest.appUuid !== undefined && filter.has(manifest.appUuid)) ||
    (manifest.slug !== undefined && filter.has(manifest.slug));

/** The filter entries this manifest satisfies (for unmatched-ref reporting). */
export const matchedUploadRefs = (
    filter: Set<string>,
    manifest: DataAppManifest,
): string[] =>
    [manifest.appUuid, manifest.slug].filter(
        (ref): ref is string => ref !== undefined && filter.has(ref),
    );

/**
 * Warning for --apps references that matched no local app folder. Uuid-shaped
 * refs (including refs parsed out of app URLs) get the slug-identity
 * explanation: id-free bundles can only be selected by slug.
 */
export const unmatchedUploadRefsWarning = (
    unmatched: string[],
): string | null => {
    if (unmatched.length === 0) return null;
    const base = `No local app folder matched: ${unmatched.join(', ')}.`;
    return unmatched.some((ref) => isUuid(ref))
        ? `${base} Bundles downloaded with slug identity carry no uuid — select them by slug (the folder name) instead of a UUID or app URL.`
        : base;
};

/**
 * Shown when the upload response carries no slug even though the bundle sent
 * one — the server predates slug identity, so it ignored the slug and matched
 * (or created) by uuid only. A same-slug upload may have just created a
 * duplicate app instead of appending.
 */
export const preSlugServerHint = (folder: string): string =>
    `This server predates slug-based app identity, so "${folder}" was matched by uuid only. If you expected to update an existing app, verify no duplicate was created, and upgrade the server (or use a matching CLI version).`;

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
            : '--apps-limit only applies to --include-apps; explicit --apps references are never capped.',
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
    | { mode: 'explicit'; appRefs: string[] }
    | { mode: 'list-all'; extraAppRefs: string[] };

/**
 * Explicit references (--apps) are fetched directly; --include-apps lists
 * every app in the project via the project-wide apps endpoint, falling back
 * to the space-scoped content API on servers that predate it.
 */
export const selectAppsToDownload = (request: {
    apps?: string[];
    includeApps?: boolean;
}): AppsDownloadSelection => {
    const explicitRefs = (request.apps ?? []).map(getDataAppReference);
    if (request.includeApps) {
        return { mode: 'list-all', extraAppRefs: explicitRefs };
    }
    if (explicitRefs.length > 0) {
        return { mode: 'explicit', appRefs: explicitRefs };
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
 * Data apps a dashboard needs that aren't already covered by an explicit
 * --apps ref, or by a (possibly --apps-limit-truncated) --include-apps listing.
 */
export const computeLinkedAppSlugs = (args: {
    appSlugs: string[];
    explicitRefs: Set<string>;
    includeApps: boolean;
    cappedAppSlugs: Set<string>;
}): string[] => {
    const { appSlugs, explicitRefs, includeApps, cappedAppSlugs } = args;
    return appSlugs.filter(
        (slug) =>
            !explicitRefs.has(slug) &&
            !(includeApps && cappedAppSlugs.has(slug)),
    );
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

/**
 * Shown after uploading a bundle whose manifest predates slug identity —
 * uploads keep working via the uuid fallback, but the user should upgrade.
 */
export const preSlugUploadHint = (args: {
    folder: string;
    slug: string | undefined;
}): string =>
    `${args.folder}/lightdash-app.yml predates slug identity. Re-download the app to upgrade${
        args.slug !== undefined
            ? ` (or add \`slug: ${args.slug}\` to lightdash-app.yml)`
            : ''
    }. Uploads keep working via uuid matching meanwhile.`;

export type AppPresence =
    // Slugs the target project already has. Authoritative.
    | { kind: 'known'; slugs: Set<string> }
    // Listing unavailable or slug-less (older server): fall back to comparing
    // the manifest's source project against the upload target.
    | { kind: 'unknown'; targetProjectUuid: string };

/**
 * Auto-pushed apps normally upload only when the folder changed, because every
 * upload triggers a sandbox rebuild. The exception is an app the target project
 * does not have yet — without it a dashboard moved to a new project or instance
 * lands with its tile skipped.
 */
export const shouldAutoPushApp = (args: {
    manifest: Pick<DataAppManifest, 'slug' | 'projectUuid'>;
    presence: AppPresence;
    folderChanged: boolean;
    force: boolean;
}): boolean => {
    if (args.force || args.folderChanged) return true;
    if (args.manifest.slug === undefined) return true;
    if (args.presence.kind === 'known') {
        return !args.presence.slugs.has(args.manifest.slug);
    }
    return args.manifest.projectUuid !== args.presence.targetProjectUuid;
};

export type AppDownloadFailure = { appRef: string; message: string };

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
            (failure) => `  ✖ ${failure.appRef}: ${failure.message}`,
        ),
    };
};

export type AppsDownloadOutcome = {
    successCount: number;
    skippedNotBuiltCount: number;
    failures: AppDownloadFailure[];
};

/**
 * Downloads each app to its own folder under appsDir, classifying "no built
 * version" 404s as skips rather than failures. Everything the loop needs
 * (fetching, versioning, progress reporting) is injected so this stays free
 * of any dependency on the download handler.
 */
export const downloadAppsToDir = async (args: {
    appRefs: string[];
    projectId: string;
    appsDir: string;
    takenFolders: Set<string>;
    cliVersion: string;
    fetchApp: (
        projectId: string,
        appRef: string,
    ) => Promise<DataAppCodeDownload>;
    onProgress?: (processed: number, total: number) => void;
}): Promise<AppsDownloadOutcome> => {
    const {
        appRefs,
        projectId,
        appsDir,
        takenFolders,
        cliVersion,
        fetchApp,
        onProgress,
    } = args;

    let successCount = 0;
    let skippedNotBuiltCount = 0;
    const failures: AppDownloadFailure[] = [];

    for (const appRef of appRefs) {
        try {
            const code = ensureDownloadedAppContext(
                appRef,
                // eslint-disable-next-line no-await-in-loop
                await fetchApp(projectId, appRef),
            );

            const folder = resolveAppFolderName(code.manifest, takenFolders);
            takenFolders.add(folder);

            const appDir = path.join(appsDir, folder);
            const manifest = {
                ...code.manifest,
                scaffoldingVersion: cliVersion,
            };
            // eslint-disable-next-line no-await-in-loop
            await writeBundleToDir(appDir, { ...code, manifest });
            // eslint-disable-next-line no-await-in-loop
            await writeFilesToDir(
                appDir,
                buildStaticAuthoringFiles({
                    appName: code.manifest.name,
                    sdkVersion: cliVersion,
                }),
            );
            // Server-provided deps override the scaffold's
            // template package.json so re-uploads round-trip.
            if (code.dependencies) {
                // eslint-disable-next-line no-await-in-loop
                await writeDependenciesToDir(appDir, code.dependencies);
            }
            // eslint-disable-next-line no-await-in-loop
            await writeContextToDir(appDir, code.context);
            successCount += 1;
        } catch (appErr) {
            const outcome = classifyAppDownloadError(appErr);
            if (outcome.kind === 'skip-not-built') {
                skippedNotBuiltCount += 1;
                GlobalState.debug(
                    `> Skipped app ${appRef}: no built version to download`,
                );
            } else {
                failures.push({ appRef, message: outcome.message });
                GlobalState.log(
                    styles.error(
                        `Failed to download app ${appRef}: ${outcome.message}`,
                    ),
                );
            }
        }
        onProgress?.(
            successCount + skippedNotBuiltCount + failures.length,
            appRefs.length,
        );
    }

    return { successCount, skippedNotBuiltCount, failures };
};
