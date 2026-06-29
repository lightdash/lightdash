/**
 * Upgrade-path overrides (PROD-8359, Phase 4).
 *
 * Populates the release-safety marker's `upgrade` block
 * (`minPreviousVersion` / `requiredStop` / `note`) from a maintainer-authored,
 * committed `release-safety.overrides.json`. Unlike the migration / REST / MCP
 * detectors, these are NOT computed from the diff — they are human-declared
 * facts about the upgrade path (e.g. "operators on < X must stop at this release
 * first"), modelled on GitLab's `config/upgrade_path.yml` required-stops artifact.
 *
 * The file is a version-keyed map plus a default block. The generator looks up
 * the EXACT release version being cut; a version-specific entry's fields win over
 * the default (most-specific declaration wins — "HEAD wins"). An entry is inert
 * for every release except the one it names, so committing a required stop can't
 * leak onto later releases.
 *
 * FAIL-SAFE ASYMMETRY (deliberate, the opposite of the detector phases): an
 * ABSENT file means the mechanism wasn't used — leave the honest stub and don't
 * claim the `upgrade` capability. A PRESENT-but-malformed file FAILS LOUD
 * (throws → the generator exits non-zero), because silently ignoring it would
 * DROP a maintainer's intended required-stop signal — the falsely-safe direction.
 *
 * CLI:  npx tsx scripts/upgrade-overrides.ts --version 0.3261.0 [--overrides release-safety.overrides.json]
 */
import * as fs from 'fs';

export interface UpgradeBlock {
    /** Oldest previous version that may upgrade directly to this release; null = no floor. */
    minPreviousVersion: string | null;
    /** True if operators MUST land on this release before going further (a required stop). */
    requiredStop: boolean;
    /** Operator-facing explanation; required in practice whenever requiredStop is true. */
    note: string | null;
}

/** The resolved block plus whether the overrides file was actually consulted. */
export interface UpgradeResolution extends UpgradeBlock {
    consulted: boolean;
}

export interface UpgradeOverridesFile {
    default?: Partial<UpgradeBlock>;
    versions?: Record<string, Partial<UpgradeBlock>>;
}

export const DEFAULT_OVERRIDES_PATH = 'release-safety.overrides.json';

const EMPTY: UpgradeBlock = {
    minPreviousVersion: null,
    requiredStop: false,
    note: null,
};

/**
 * PURE. Resolve the upgrade block for `version`: start from EMPTY, layer the
 * file's `default`, then the version-specific entry (most-specific wins). A null
 * `overrides` (file absent) yields the stub with `consulted: false`.
 */
export function resolveUpgrade(
    overrides: UpgradeOverridesFile | null,
    version: string,
): UpgradeResolution {
    if (!overrides) return { ...EMPTY, consulted: false };
    const specific = overrides.versions?.[version] ?? {};
    return {
        ...EMPTY,
        ...overrides.default,
        ...specific,
        consulted: true,
    };
}

/**
 * PURE. Validate the parsed overrides object, throwing a clear error on any
 * shape violation. Strict on purpose: a typo in a maintainer's required-stop
 * declaration must fail the release, not be silently dropped.
 */
export function validateOverrides(data: unknown): UpgradeOverridesFile {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('overrides must be a JSON object');
    }
    const obj = data as Record<string, unknown>;
    const checkBlock = (b: unknown, where: string): void => {
        if (typeof b !== 'object' || b === null || Array.isArray(b)) {
            throw new Error(`${where} must be an object`);
        }
        const block = b as Record<string, unknown>;
        for (const key of Object.keys(block)) {
            if (!['minPreviousVersion', 'requiredStop', 'note'].includes(key)) {
                throw new Error(`${where} has unknown field "${key}"`);
            }
        }
        if ('minPreviousVersion' in block && block.minPreviousVersion !== null && typeof block.minPreviousVersion !== 'string') {
            throw new Error(`${where}.minPreviousVersion must be a string or null`);
        }
        if ('requiredStop' in block && typeof block.requiredStop !== 'boolean') {
            throw new Error(`${where}.requiredStop must be a boolean`);
        }
        if ('note' in block && block.note !== null && typeof block.note !== 'string') {
            throw new Error(`${where}.note must be a string or null`);
        }
    };

    for (const key of Object.keys(obj)) {
        if (!['default', 'versions', '$schema'].includes(key)) {
            throw new Error(`overrides has unknown top-level field "${key}"`);
        }
    }
    if ('default' in obj && obj.default !== undefined) checkBlock(obj.default, 'default');
    if ('versions' in obj && obj.versions !== undefined) {
        const versions = obj.versions;
        if (typeof versions !== 'object' || versions === null || Array.isArray(versions)) {
            throw new Error('versions must be an object keyed by version');
        }
        for (const [v, block] of Object.entries(versions as Record<string, unknown>)) {
            checkBlock(block, `versions["${v}"]`);
        }
    }
    return obj as UpgradeOverridesFile;
}

/**
 * IO. Load + validate the overrides file. Returns null if the file is ABSENT
 * (mechanism not used). THROWS if the file is present but unreadable, not valid
 * JSON, or fails shape validation — fail loud, never drop a declared stop.
 */
export function loadUpgradeOverrides(path: string): UpgradeOverridesFile | null {
    if (!fs.existsSync(path)) return null;
    let raw: string;
    try {
        raw = fs.readFileSync(path, 'utf-8');
    } catch (err) {
        throw new Error(`could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    return validateOverrides(parsed);
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const version = arg('version');
    if (!version) throw new Error('--version is required');
    const overrides = loadUpgradeOverrides(arg('overrides') ?? DEFAULT_OVERRIDES_PATH);
    const resolution = resolveUpgrade(overrides, version);
    console.log(JSON.stringify(resolution, null, 2));
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('upgrade-overrides.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[upgrade-overrides] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
