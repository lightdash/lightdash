import { parse as parseYaml } from 'yaml';
import { type ApiSuccess } from '../../types/api/success';
import { type DataAppTemplate, type DataAppVizSchema } from './types';

export const currentDataAppCodeVersion = 1 as const;

export const MAX_DECLARED_DEPENDENCIES = 60;
export const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024; // 2 MB

export type DataAppManifest = {
    codeVersion: 1;
    appUuid: string;
    projectUuid: string;
    version: number;
    name: string;
    description: string;
    // The app's stored template flavor (includes data_app_viz); null for
    // "Custom" or apps predating template persistence.
    template: Exclude<DataAppTemplate, 'custom'> | null;
    // The declared viz schema of a data_app_viz version. Round-tripped through
    // upload because the build-from-source pipeline has no generation run to
    // re-emit it — without it the uploaded viz never appears in the viz picker.
    // Omitted for non-viz apps and bundles downloaded before this field.
    vizSchema?: DataAppVizSchema;
    downloadedAt: string; // ISO
    scaffoldingVersion?: string; // CLI/SDK version the vendored scaffolding came from (Phase 2)
};

export type DataAppCodeFile = {
    path: string; // relative to the version prefix, forward slashes, no leading slash
    contentBase64: string;
};

export type DataAppDependencies = {
    packageJson: string; // serialised package.json (src-of-truth)
    lockfile: string; // serialised pnpm-lock.yaml
};

export type DataAppCode = {
    manifest: DataAppManifest;
    files: DataAppCodeFile[];
    // When present the server will install these deps in the build sandbox.
    // Kept separate from `files` so the src-only invariant on `files` is
    // unaffected.
    dependencies?: DataAppDependencies;
};

export type DataAppContextFile = {
    path: string; // relative to the bundle root, e.g. `.lightdash/context/semantic-layer.yml`
    contentBase64: string;
};

export type DataAppThemeContext = {
    instructions: DataAppContextFile | null;
    assets: DataAppContextFile[];
    skippedAssetCount: number; // > 0 when assets were dropped by the cap
};

export type DataAppContext = {
    semanticLayer: DataAppContextFile;
    parameters: DataAppContextFile | null;
    promptHistory: DataAppContextFile;
    theme: DataAppThemeContext;
};

export type DataAppCodeDownload = DataAppCode & { context: DataAppContext };

export type ApiGetAppCodeResponse = ApiSuccess<DataAppCodeDownload>;

export type ImportAppCodeRequestBody = {
    code: DataAppCode;
    // when present and the app exists in the target project -> append a version; otherwise create a new app
    targetAppUuid?: string;
    spaceUuid?: string;
};

export type ApiImportAppCodeResponse = ApiSuccess<{
    appUuid: string;
    version: number;
    action: 'create' | 'append';
}>;

export type DataAppDepsValidationResult = {
    // Packages that differ from the template baseline (new or version override).
    customDeps: Record<string, string>;
};

// Positive allowlist: a spec must BE a semver range (exact versions, ^/~,
// comparators, hyphen and x-ranges, || unions). Everything else — git hosts
// (github:/gitlab:/bitbucket:/gist:), file:/link:/workspace:, URLs, bare
// relative paths, dist-tags like "latest" — is rejected, so validation agrees
// with what the sandbox egress allowlist actually permits.
const SEMVER_ATOM = String.raw`(?:[<>]=?|=|~|\^)?\s*v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*]))?(?:\.(?:\d+|[xX*]))?(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?`;
const SEMVER_RANGE_PART = `${SEMVER_ATOM}(?:\\s+(?:-\\s+)?${SEMVER_ATOM})*`;
const SEMVER_RANGE_RE = new RegExp(
    `^\\s*${SEMVER_RANGE_PART}(?:\\s*\\|\\|\\s*${SEMVER_RANGE_PART})*\\s*$`,
);
const NPM_PACKAGE_NAME_RE =
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function isRegistrySemverSpec(spec: string): boolean {
    if (spec.startsWith('npm:')) {
        // npm:<pkg>@<range> alias — both parts must independently validate.
        // An alias without an explicit range would resolve a dist-tag; reject
        // it like any other non-semver spec.
        const rest = spec.slice(4);
        const lastAt = rest.lastIndexOf('@');
        if (lastAt <= 0) return false;
        return (
            NPM_PACKAGE_NAME_RE.test(rest.slice(0, lastAt)) &&
            SEMVER_RANGE_RE.test(rest.slice(lastAt + 1))
        );
    }
    return SEMVER_RANGE_RE.test(spec);
}

// pnpm lockfiles record off-registry packages as `tarball: <url>` under
// `resolution:`; registry packages carry only an integrity hash. Any tarball
// URL therefore points outside the default registry flow and its host must be
// explicitly allowed.
const LOCKFILE_TARBALL_RE = /\btarball:\s*['"]?(https?:\/\/[^\s'",}]+)/g;

/**
 * Structural sanity check: the lockfile must parse as YAML into an object
 * carrying `lockfileVersion` — every pnpm lockfile does. Deliberately NOT an
 * allowlist of top-level keys (pnpm adds keys across versions and that would
 * break uploads on toolchain upgrades); resolution safety comes from
 * `--frozen-lockfile` integrity checks, the tarball-host validation below,
 * and the sandbox egress allowlist.
 */
function validateLockfileShape(lockfile: string): void {
    let parsed: unknown;
    try {
        parsed = parseYaml(lockfile);
    } catch {
        throw new Error(
            'Invalid dependencies: lockfile is not valid YAML — regenerate it with pnpm',
        );
    }
    if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !('lockfileVersion' in parsed)
    ) {
        throw new Error(
            'Invalid dependencies: lockfile does not look like a pnpm lockfile (missing lockfileVersion) — regenerate it with pnpm',
        );
    }
}

function validateLockfileTarballHosts(
    lockfile: string,
    allowedHosts: string[],
): void {
    const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
    for (const match of lockfile.matchAll(LOCKFILE_TARBALL_RE)) {
        let host: string;
        try {
            host = new URL(match[1]).hostname.toLowerCase();
        } catch {
            throw new Error(
                `Invalid dependencies: lockfile contains an unparseable tarball URL: "${match[1]}"`,
            );
        }
        if (!allowed.has(host)) {
            throw new Error(
                `Invalid dependencies: lockfile resolves a package from "${host}", which is not an allowed registry host`,
            );
        }
    }
}

export type LockfilePackage = { name: string; version: string };

/**
 * Splits a pnpm lockfile package key (`name@version`, optionally scoped and/or
 * with a `(peer@x)` suffix) into name + version. Returns null for anything
 * that doesn't parse — e.g. link:/file: entries that carry no registry version.
 */
export function parseLockfilePackageKey(key: string): LockfilePackage | null {
    // Drop the peer-dependency suffix pnpm appends, e.g. `(react@19.0.0)`.
    const base = key.replace(/\(.*\)$/, '');
    const at = base.lastIndexOf('@');
    // `@` at position 0 = a scope-only string with no version.
    if (at <= 0) return null;
    const name = base.slice(0, at);
    const version = base.slice(at + 1);
    if (!name || !version || version.includes('/')) return null;
    return { name, version };
}

/**
 * Extracts every resolved package (direct AND transitive) from a pnpm
 * lockfile's `packages:` section as { name, version } pairs. Pure/structural —
 * used by backend guards that check declared deps against registry metadata or
 * advisory feeds. Returns [] when the lockfile can't be parsed.
 */
export function extractLockfilePackages(lockfile: string): LockfilePackage[] {
    let parsed: unknown;
    try {
        parsed = parseYaml(lockfile);
    } catch {
        return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];
    const { packages } = parsed as Record<string, unknown>;
    if (!packages || typeof packages !== 'object') return [];

    const seen = new Set<string>();
    const out: LockfilePackage[] = [];
    for (const key of Object.keys(packages)) {
        const pkg = parseLockfilePackageKey(key);
        if (pkg) {
            const dedupeKey = `${pkg.name}@${pkg.version}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                out.push(pkg);
            }
        }
    }
    return out;
}

/**
 * Returns `packageJson` with its `scripts` replaced by the trusted template
 * scripts. The build sandbox runs `pnpm build` against this file, and download
 * round-trips it to other developers' machines — in both places the script
 * commands must stay server-controlled, not uploader-controlled.
 */
export function sanitizeAppPackageJsonScripts(
    packageJson: string,
    templateScripts: Record<string, string>,
): string {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(packageJson) as Record<string, unknown>;
    } catch {
        // Callers validate JSON before sanitizing; keep the original on failure.
        return packageJson;
    }
    return JSON.stringify(
        { ...parsed, scripts: templateScripts },
        null,
        4,
    ).concat('\n');
}

/**
 * Parses a package.json's declared `dependencies` — validating the shape,
 * that every spec is a registry semver spec, and the count cap — and returns
 * the "custom set": declared deps whose name+version differ from the template
 * baseline. Lockfile-independent: the CLI uses this on upload for folders
 * that carry the scaffold package.json without a pnpm-lock.yaml.
 */
export function computeCustomDependencies(
    packageJson: string,
    templateDependencies: Record<string, string>,
): Record<string, string> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(packageJson);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
            `Invalid dependencies: packageJson is not valid JSON: ${msg}`,
        );
    }

    if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('dependencies' in parsed) ||
        typeof (parsed as Record<string, unknown>).dependencies !== 'object' ||
        (parsed as Record<string, unknown>).dependencies === null ||
        Array.isArray((parsed as Record<string, unknown>).dependencies)
    ) {
        throw new Error(
            'Invalid dependencies: packageJson must have a "dependencies" object',
        );
    }

    const declared = (parsed as { dependencies: Record<string, unknown> })
        .dependencies;
    const entries = Object.entries(declared);

    if (entries.length > MAX_DECLARED_DEPENDENCIES) {
        throw new Error(
            `Invalid dependencies: declared dependency count (${entries.length}) exceeds maximum (${MAX_DECLARED_DEPENDENCIES})`,
        );
    }

    for (const [name, spec] of entries) {
        if (typeof spec !== 'string') {
            throw new Error(
                `Invalid dependencies: version spec for "${name}" must be a string`,
            );
        }
        if (!isRegistrySemverSpec(spec)) {
            throw new Error(
                `Invalid dependencies: spec for "${name}" is not a registry semver spec: "${spec}"`,
            );
        }
    }

    const customDeps: Record<string, string> = {};
    for (const [name, spec] of entries) {
        // typeof spec already verified as string in the loop above.
        if (typeof spec === 'string' && templateDependencies[name] !== spec) {
            customDeps[name] = spec;
        }
    }
    return customDeps;
}

/**
 * Validates a declared dependency set against an optional template baseline.
 *
 * Rules enforced:
 *  1. `packageJson` parses as JSON with a `dependencies` object.
 *  2. Every spec is a registry semver spec (git+/file:/workspace:/http(s): rejected).
 *  3. Direct-dependency count ≤ MAX_DECLARED_DEPENDENCIES.
 *  4. `lockfile` is non-empty, ≤ MAX_LOCKFILE_BYTES, and mentions every custom
 *     package name (cheap consistency guard).
 *
 * Returns the "custom set": declared deps whose name+version differ from the
 * template baseline (new packages or version overrides).
 */
export function validateDataAppDependencies(
    deps: unknown,
    opts: {
        templateDependencies: Record<string, string>;
        // When provided, lockfile `tarball:` resolution URLs must point at one
        // of these hosts (the backend passes its registry egress allowlist).
        allowedTarballHosts?: string[];
    },
): DataAppDepsValidationResult {
    if (!deps || typeof deps !== 'object')
        throw new Error('Invalid dependencies: not an object');

    const d = deps as Partial<DataAppDependencies>;

    if (typeof d.packageJson !== 'string' || d.packageJson.length === 0)
        throw new Error(
            'Invalid dependencies: packageJson must be a non-empty string',
        );
    if (typeof d.lockfile !== 'string' || d.lockfile.length === 0)
        throw new Error(
            'Invalid dependencies: lockfile must be a non-empty string',
        );
    if (Buffer.byteLength(d.lockfile, 'utf-8') > MAX_LOCKFILE_BYTES)
        throw new Error(
            `Invalid dependencies: lockfile exceeds ${MAX_LOCKFILE_BYTES / 1024 / 1024} MB limit`,
        );
    validateLockfileShape(d.lockfile);
    if (opts.allowedTarballHosts !== undefined) {
        validateLockfileTarballHosts(d.lockfile, opts.allowedTarballHosts);
    }

    const customDeps = computeCustomDependencies(
        d.packageJson,
        opts.templateDependencies,
    );

    // Cheap consistency guard: the lockfile must mention each custom name.
    for (const name of Object.keys(customDeps)) {
        if (!d.lockfile.includes(name)) {
            throw new Error(
                `Invalid dependencies: "${name}" is declared in package.json but not found in pnpm-lock.yaml. Run 'pnpm install --lockfile-only' to update the lockfile, then upload again`,
            );
        }
    }

    return { customDeps };
}

const isSafeRelPath = (p: string): boolean => {
    if (typeof p !== 'string' || p.length === 0 || p.startsWith('/'))
        return false;
    // Every segment must be a real filename: no empty segments (leading,
    // trailing, or double slashes) and no '.'/'..' directory references.
    return p
        .split('/')
        .every(
            (segment) =>
                segment.length > 0 && segment !== '.' && segment !== '..',
        );
};

export function validateDataAppCode(
    value: unknown,
    opts?: { templateDependencies?: Record<string, string> },
): DataAppCode {
    const v = value as Partial<DataAppCode>;
    if (!v || typeof v !== 'object')
        throw new Error('Invalid app bundle: not an object');
    if (!v.manifest || typeof v.manifest !== 'object')
        throw new Error('Invalid app bundle: missing manifest');
    if (!Array.isArray(v.files))
        throw new Error('Invalid app bundle: missing files');
    for (const f of v.files) {
        if (!f || typeof f !== 'object')
            throw new Error('Invalid app bundle: file entry is not an object');
        if (!isSafeRelPath(f?.path))
            throw new Error(
                `Invalid app bundle: unsafe file path "${f?.path}"`,
            );
        if (typeof f?.contentBase64 !== 'string')
            throw new Error(
                `Invalid app bundle: file "${f?.path}" missing content`,
            );
    }

    if (v.dependencies !== undefined) {
        const d = v.dependencies as Partial<DataAppDependencies>;
        if (!d || typeof d !== 'object')
            throw new Error(
                'Invalid app bundle: dependencies must be an object',
            );
        if (typeof d.packageJson !== 'string')
            throw new Error(
                'Invalid app bundle: dependencies.packageJson must be a string',
            );
        if (typeof d.lockfile !== 'string')
            throw new Error(
                'Invalid app bundle: dependencies.lockfile must be a string',
            );
        // Full validation when a template baseline is available.
        if (opts?.templateDependencies !== undefined) {
            validateDataAppDependencies(v.dependencies, {
                templateDependencies: opts.templateDependencies,
            });
        }
    }

    return v as DataAppCode;
}
