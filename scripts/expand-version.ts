/**
 * Expand-version detection (PROD-8359).
 *
 * When the AI clears a dropped/renamed object as the "contract" step of an
 * expand/contract, it only verified safety against ONE release (previousVersion).
 * This finds the EARLIEST release the object is actually safe to drop from — the
 * version where the app's code stopped referencing it (the "expand") — so the
 * marker's upgrade.minPreviousVersion floor is as permissive as is provably safe,
 * instead of the conservative previousVersion.
 *
 * SAFETY — the floor may only be LOWERED on a positively-verified absence:
 *   - It greps the ACTUAL app code at each release tag (not a string-diff
 *     heuristic), so a grep FALSE POSITIVE (the name appears in an unrelated
 *     context) stops the backward scan early → a HIGHER, more conservative floor.
 *   - It shares the literal-reference assumption of the AI clearance (a column
 *     reached only via dynamic/ORM magic isn't seen by either), so it adds NO new
 *     risk beyond what the clearance already accepted.
 *   - Anything ambiguous (object present at the verified release, no object name
 *     extracted, a git error) returns null and the caller keeps the conservative
 *     previousVersion floor.
 *
 * CLI:  npx tsx scripts/expand-version.ts --object my_column --from 0.3260.2
 */
import { execFileSync } from 'child_process';

/** App code to scan — deliberately EXCLUDES the migration dirs (a migration that
 *  drops the object references it, which would mask the app-usage signal). */
export const DEFAULT_CODE_DIRS = [
    'packages/backend/src',
    'packages/common/src',
    'packages/frontend/src',
    'packages/cli/src',
    'packages/warehouses/src',
] as const;

const RELEASE_TAG_RE = /^\d+\.\d+\.\d+$/;

export type PresentAt = (tag: string) => boolean;

/** PURE. Numeric semver compare of two `X.Y.Z` release tags. */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10));
    const pb = b.split('.').map((n) => parseInt(n, 10));
    for (let i = 0; i < 3; i += 1) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
}

/**
 * PURE. Given release tags in DESCENDING order (youngest first) where tagsDesc[0]
 * is the release the object is KNOWN absent in (the AI-verified previousVersion),
 * walk back while the object stays absent and return the OLDEST tag still verified
 * absent — i.e. the version the app had stopped referencing it. Stops at the first
 * tag that still references it (floor = the tag just younger). Returns null on a
 * contradiction (present at tagsDesc[0]) or no tags.
 */
export function selectFloor(tagsDesc: string[], presentAt: PresentAt): string | null {
    if (tagsDesc.length === 0) return null;
    if (presentAt(tagsDesc[0])) return null; // contradiction — don't trust, stay conservative
    let floor = tagsDesc[0];
    for (let i = 1; i < tagsDesc.length; i += 1) {
        if (presentAt(tagsDesc[i])) return floor; // older tag still uses it → floor is the younger one
        floor = tagsDesc[i]; // verified absent here too → lower the floor
    }
    return floor; // absent throughout the scanned window → floor = oldest scanned (verified absent that far back)
}

// ---- IO ---------------------------------------------------------------------

function git(args: string[]): { ok: boolean; out: string } {
    try {
        return { ok: true, out: execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }) };
    } catch (err) {
        const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
        if (e.status === 1) return { ok: true, out: e.stdout?.toString() ?? '' }; // grep: no match
        return { ok: false, out: (e.stderr?.toString() || (err as Error).message).slice(0, 500) };
    }
}

/** IO: release tags (`X.Y.Z`) that are ancestors of `fromRef`, youngest-first, capped. */
export function releaseTagsDescFrom(fromRef: string, max: number): string[] {
    const { ok, out } = git(['tag', '--merged', fromRef]);
    if (!ok) return [];
    return out
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => RELEASE_TAG_RE.test(t))
        .sort((a, b) => -compareVersions(a, b))
        .slice(0, max);
}

/** IO: is `object` referenced in the app code at `tag`? (`git grep -wF`, code dirs only). */
export function objectPresentAt(tag: string, object: string, codeDirs: readonly string[]): boolean {
    const { ok, out } = git(['grep', '-l', '-wF', '-e', object, tag, '--', ...codeDirs]);
    return ok && out.trim().length > 0;
}

export interface FindExpandFloorOpts {
    /** Dropped/renamed object names (column/table identifiers). */
    objects: string[];
    /** The previous-release ref the AI verified absence against (tag or sha). */
    fromRef: string;
    codeDirs?: readonly string[];
    maxScan?: number;
    log?: (msg: string) => void;
}

/**
 * IO. Best-effort earliest-safe-version across all dropped objects. Returns the
 * YOUNGEST (max) per-object floor — every "expand" must be complete, so the
 * latest-removed object governs. Returns null (caller stays conservative) if no
 * objects, no tags, or any object can't be confidently placed.
 */
export function findExpandFloor(opts: FindExpandFloorOpts): string | null {
    const log = opts.log ?? (() => {});
    const objects = [...new Set(opts.objects.filter((o) => o && o.length >= 4))]; // skip too-generic names
    if (objects.length === 0) {
        log('no sufficiently-specific object names to trace; staying conservative');
        return null;
    }
    const tags = releaseTagsDescFrom(opts.fromRef, opts.maxScan ?? 25);
    if (tags.length === 0) {
        log('no release tags reachable from the previous ref; staying conservative');
        return null;
    }
    const codeDirs = opts.codeDirs ?? DEFAULT_CODE_DIRS;
    let overall: string | null = null;
    for (const obj of objects) {
        const floor = selectFloor(tags, (tag) => objectPresentAt(tag, obj, codeDirs));
        if (!floor) {
            log(`could not place "${obj}" (present at ${tags[0]} or no tags); staying conservative`);
            return null;
        }
        log(`"${obj}" last referenced before ${floor}`);
        overall = overall === null || compareVersions(floor, overall) > 0 ? floor : overall;
    }
    return overall;
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const object = arg('object');
    const fromRef = arg('from');
    if (!object || !fromRef) throw new Error('--object and --from are required');
    const floor = findExpandFloor({ objects: [object], fromRef, log: (m) => console.log(`[expand-version] ${m}`) });
    console.log(JSON.stringify({ object, fromRef, floor }, null, 2));
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('expand-version.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[expand-version] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
