import { ParameterError, type LockfilePackage } from '@lightdash/common';
import { secureFetch } from '../../../utils/secureFetch/secureFetch';

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_TIMEOUT_MS = 15_000;
// npm packuments carry the full `time` map (publish dates per version) — there
// is no lighter endpoint for it, so allow a few MB. A truncated response is
// treated as unverifiable (fail closed), not silently accepted.
const REGISTRY_MAX_BYTES = 8 * 1024 * 1024;

export type RegistryFetchResult = {
    status: number;
    bodyText: string;
    truncated: boolean;
};

export type RegistryFetch = (url: string) => Promise<RegistryFetchResult>;

const defaultRegistryFetch: RegistryFetch = (url) =>
    secureFetch(url, {
        method: 'GET',
        timeoutMs: REGISTRY_TIMEOUT_MS,
        maxResponseBytes: REGISTRY_MAX_BYTES,
        allowedContentTypes: ['application/json'],
    });

/**
 * npm registry packument URL for a package. Scoped names keep the `@` but the
 * `/` must be percent-encoded (`@scope%2Fname`).
 */
export const registryPackumentUrl = (host: string, name: string): string => {
    const encoded = name.startsWith('@') ? name.replace('/', '%2F') : name;
    return `https://${host}/${encoded}`;
};

/**
 * Rejects the upload if any declared custom dependency's resolved version was
 * published more recently than `minReleaseAgeDays`, per npm registry metadata.
 * Guards against installing freshly-published (potentially compromised)
 * versions before advisory feeds catch up.
 *
 * Opt-in: a non-positive `minReleaseAgeDays` (the default) makes this a no-op,
 * so instances that don't enable it pay no registry round-trips. When enabled
 * it fails CLOSED — if a version's publish date can't be verified (registry
 * error, truncation, unknown version) the upload is rejected.
 */
export async function assertDependenciesMeetMinReleaseAge(args: {
    packages: LockfilePackage[];
    minReleaseAgeDays: number;
    registryHost: string;
    now: number;
    fetchImpl?: RegistryFetch;
}): Promise<void> {
    const { packages, minReleaseAgeDays, registryHost, now } = args;
    if (minReleaseAgeDays <= 0 || packages.length === 0) return;

    const fetchImpl = args.fetchImpl ?? defaultRegistryFetch;
    const minAgeMs = minReleaseAgeDays * DAY_MS;

    // De-dupe by package name — one packument fetch covers all its versions.
    const byName = new Map<string, Set<string>>();
    for (const { name, version } of packages) {
        const versions = byName.get(name) ?? new Set<string>();
        versions.add(version);
        byName.set(name, versions);
    }

    for (const [name, versions] of byName) {
        let timeMap: Record<string, string>;
        try {
            // eslint-disable-next-line no-await-in-loop
            const res = await fetchImpl(
                registryPackumentUrl(registryHost, name),
            );
            if (res.status !== 200 || res.truncated) {
                throw new Error(`registry status ${res.status}`);
            }
            const doc = JSON.parse(res.bodyText) as {
                time?: Record<string, string>;
            };
            timeMap = doc.time ?? {};
        } catch {
            throw new ParameterError(
                `Could not verify the release age of "${name}" against the registry. This instance enforces a minimum dependency age (LIGHTDASH_APP_DEPENDENCY_MIN_RELEASE_AGE_DAYS); try again shortly.`,
            );
        }

        for (const version of versions) {
            const published = timeMap[version];
            if (!published) {
                throw new ParameterError(
                    `Could not find a publish date for "${name}@${version}" in the registry, so its release age cannot be verified.`,
                );
            }
            const ageMs = now - new Date(published).getTime();
            if (Number.isNaN(ageMs) || ageMs < minAgeMs) {
                const ageDays = Number.isNaN(ageMs)
                    ? 'an unknown number of'
                    : Math.floor(ageMs / DAY_MS);
                throw new ParameterError(
                    `"${name}@${version}" was published ${ageDays} day(s) ago, under the ${minReleaseAgeDays}-day minimum required by this instance. Pin an older version or wait before uploading.`,
                );
            }
        }
    }
}

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_TIMEOUT_MS = 15_000;
const OSV_MAX_BYTES = 4 * 1024 * 1024;
// OSV IDs from the malicious-packages database are prefixed `MAL-`. Matching on
// this prefix targets known-malicious packages specifically, rather than every
// package that merely has a CVE (which would reject most of the ecosystem).
const OSV_MALWARE_ID_PREFIX = 'MAL-';

export type OsvBatchFetch = (body: string) => Promise<RegistryFetchResult>;

const defaultOsvFetch: OsvBatchFetch = (body) =>
    secureFetch(OSV_BATCH_URL, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: OSV_TIMEOUT_MS,
        maxResponseBytes: OSV_MAX_BYTES,
        allowedContentTypes: ['application/json'],
    });

type OsvBatchResponse = {
    results?: Array<{ vulns?: Array<{ id?: string }> }>;
};

/**
 * Rejects the upload if any resolved package (direct or transitive) matches a
 * known-malicious advisory in the OSV malicious-packages feed. Supply-chain
 * attacks usually arrive through a transitive dependency, so this checks the
 * whole lockfile, not just the packages the author added directly.
 *
 * Opt-in via `enabled` (default off → no OSV round-trip). Fails CLOSED: if OSV
 * can't be reached or returns an unexpected shape, the upload is rejected so a
 * malicious package can't slip through on an API hiccup.
 */
export async function assertDependenciesHaveNoKnownMalware(args: {
    packages: LockfilePackage[];
    enabled: boolean;
    fetchImpl?: OsvBatchFetch;
}): Promise<void> {
    const { packages, enabled } = args;
    if (!enabled || packages.length === 0) return;

    const fetchImpl = args.fetchImpl ?? defaultOsvFetch;
    const queries = packages.map((p) => ({
        package: { ecosystem: 'npm', name: p.name },
        version: p.version,
    }));

    let results: NonNullable<OsvBatchResponse['results']>;
    try {
        const res = await fetchImpl(JSON.stringify({ queries }));
        if (res.status !== 200 || res.truncated) {
            throw new Error(`OSV status ${res.status}`);
        }
        const parsed = JSON.parse(res.bodyText) as OsvBatchResponse;
        results = parsed.results ?? [];
        // OSV returns results 1:1 with queries. A short/misaligned array would
        // leave tail packages unscreened — fail closed rather than skip them.
        if (results.length !== packages.length) {
            throw new Error(
                `OSV returned ${results.length} results for ${packages.length} queries`,
            );
        }
    } catch {
        throw new ParameterError(
            'Could not screen the declared dependencies against the malware feed (OSV returned an unexpected response). This instance requires that check (LIGHTDASH_APP_DEPENDENCY_MALWARE_CHECK_ENABLED); try again shortly.',
        );
    }

    const flagged: string[] = [];
    results.forEach((result, index) => {
        const isMalicious = (result?.vulns ?? []).some((v) =>
            v.id?.startsWith(OSV_MALWARE_ID_PREFIX),
        );
        if (isMalicious && packages[index]) {
            flagged.push(`${packages[index].name}@${packages[index].version}`);
        }
    });

    if (flagged.length > 0) {
        throw new ParameterError(
            `Upload blocked: ${flagged.length} package(s) flagged as malicious by the OSV feed — ${flagged.join(
                ', ',
            )}. Remove or replace them and re-upload.`,
        );
    }
}
