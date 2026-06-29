/**
 * REST API breaking-change detection (PROD-8359, Phase 2).
 *
 * Populates the release-safety marker's `api.rest` block by diffing the
 * generated OpenAPI spec (`packages/backend/src/generated/swagger.json`) between
 * the PREVIOUS release tag and HEAD with `oasdiff breaking`. A non-empty
 * breaking list means a consumer of the REST API may break across this upgrade.
 *
 * This is the DETERMINISTIC sibling of the P6 AI migration review: oasdiff parses
 * both specs into a semantic OpenAPI model and compares them, so JSON key ordering
 * is irrelevant and the result is reproducible. Because it's deterministic and
 * cheap it needs no opt-in flag — the generator runs it automatically whenever
 * `oasdiff` is on PATH (or `OASDIFF_BIN` points at it) and a previous tag exists.
 *
 * Both spec sides are read from git (`git show <ref>:<path>`), exactly like the
 * P1 migration detector diffs `<lastTag>..HEAD` — never the working tree — so a
 * mid-release regen of the spec can't perturb the diff.
 *
 * FAIL-SAFE (soft): any failure (oasdiff missing, spec absent at a ref, oasdiff
 * error, unparseable output) degrades to `checked: false` — the honest "not
 * checked" stub — and the generator does NOT add `rest` to `capabilities`. It
 * never asserts "no break" it couldn't prove, and it never fails the release.
 *
 * Importable: `diffRestApi(opts)` returns an `ApiSurface`.
 *
 * CLI:  npx tsx scripts/rest-api-diff.ts --last-tag 0.3260.2 [--new-ref HEAD]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type TriState = boolean | 'unknown';

export interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
}

export const SPEC_PATH = 'packages/backend/src/generated/swagger.json';

/** Cap on rendered change lines so a large breaking diff can't bloat the marker. */
const MAX_CHANGES = 50;

/**
 * One item from `oasdiff breaking -f json`. oasdiff's `breaking` subcommand
 * already filters to breaking-only changes (WARN=2 / ERR=3); INFO=1 additive
 * changes never appear here.
 */
export interface OasdiffItem {
    id: string;
    text: string;
    level: number;
    operation?: string;
    operationId?: string;
    path?: string;
}

/**
 * PURE. Reduce the oasdiff `breaking` JSON array into the marker's `api.rest`
 * shape. A non-empty list ⇒ `breaking: true`; each item renders as
 * "METHOD /path — text". The list is capped with an explicit overflow line so
 * the count is never silently truncated.
 */
export function summarizeBreaking(items: OasdiffItem[]): {
    breaking: boolean;
    changes: string[];
} {
    const rendered = items.map((it) => {
        const op = it.operation ? `${it.operation} ` : '';
        const p = it.path ? `${it.path} — ` : '';
        return `${op}${p}${it.text}`.trim();
    });
    const changes = rendered.slice(0, MAX_CHANGES);
    if (rendered.length > MAX_CHANGES) {
        changes.push(`… and ${rendered.length - MAX_CHANGES} more breaking change(s)`);
    }
    return { breaking: items.length > 0, changes };
}

const UNCHECKED: ApiSurface = { checked: false, breaking: false, changes: [] };

/** Locate the oasdiff binary: explicit OASDIFF_BIN, else PATH. null if absent. */
export function findOasdiff(): string | null {
    const explicit = process.env.OASDIFF_BIN;
    if (explicit) return fs.existsSync(explicit) ? explicit : null;
    try {
        const out = execFileSync('command', ['-v', 'oasdiff'], {
            encoding: 'utf-8',
            shell: '/bin/sh',
        }).trim();
        return out || null;
    } catch {
        // Fall back to a bare PATH lookup (command -v can be unavailable under odd shells).
        try {
            return execFileSync('which', ['oasdiff'], { encoding: 'utf-8' }).trim() || null;
        } catch {
            return null;
        }
    }
}

/** IO: read a file at a git ref. Returns null if the path didn't exist there. */
function showAtRef(ref: string, repoPath: string): string | null {
    try {
        return execFileSync('git', ['show', `${ref}:${repoPath}`], {
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        return null;
    }
}

export interface DiffRestApiOpts {
    /** Previous release tag/ref — the old spec side. */
    lastTag: string;
    /** New spec side; defaults to HEAD (the release commit). */
    newRef?: string;
    /** Explicit oasdiff binary; defaults to findOasdiff(). */
    oasdiffBin?: string | null;
    log?: (msg: string) => void;
}

/**
 * Diff the OpenAPI spec between `lastTag` and `newRef` and classify breaking
 * changes. Soft fail-safe throughout: every failure path returns the honest
 * `checked: false` stub rather than asserting safety.
 */
export function diffRestApi(opts: DiffRestApiOpts): ApiSurface {
    const log = opts.log ?? (() => {});
    const newRef = opts.newRef ?? 'HEAD';
    const bin = opts.oasdiffBin === undefined ? findOasdiff() : opts.oasdiffBin;

    if (!bin) {
        log('oasdiff not found (OASDIFF_BIN unset, not on PATH); api.rest stays unchecked');
        return UNCHECKED;
    }

    const oldSpec = showAtRef(opts.lastTag, SPEC_PATH);
    if (oldSpec === null) {
        log(`spec not found at ${opts.lastTag}:${SPEC_PATH}; api.rest stays unchecked`);
        return UNCHECKED;
    }
    const newSpec = showAtRef(newRef, SPEC_PATH);
    if (newSpec === null) {
        log(`spec not found at ${newRef}:${SPEC_PATH}; api.rest stays unchecked`);
        return UNCHECKED;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-safety-rest-'));
    const oldFile = path.join(dir, 'old.json');
    const newFile = path.join(dir, 'new.json');
    try {
        fs.writeFileSync(oldFile, oldSpec);
        fs.writeFileSync(newFile, newSpec);

        let stdout: string;
        try {
            // `breaking` exits 0 even when breaking changes exist (we parse, we
            // don't gate on exit code). -f json gives the structured array.
            stdout = execFileSync(bin, ['breaking', oldFile, newFile, '-f', 'json'], {
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
            });
        } catch (err) {
            const e = err as { stderr?: Buffer; message?: string };
            log(`oasdiff failed; api.rest stays unchecked: ${(e.stderr?.toString() || e.message || '').slice(0, 300)}`);
            return UNCHECKED;
        }

        let items: OasdiffItem[];
        try {
            const parsed = JSON.parse(stdout || '[]');
            if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
            items = parsed as OasdiffItem[];
        } catch (err) {
            log(`could not parse oasdiff output; api.rest stays unchecked: ${err instanceof Error ? err.message : String(err)}`);
            return UNCHECKED;
        }

        const { breaking, changes } = summarizeBreaking(items);
        log(`api.rest checked: ${breaking ? `BREAKING (${items.length})` : 'no breaking changes'}`);
        return { checked: true, breaking, changes };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ---- CLI --------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const lastTag = arg('last-tag') ?? arg('previous-version');
    if (!lastTag) throw new Error('--last-tag (or --previous-version) is required');
    const result = diffRestApi({
        lastTag,
        newRef: arg('new-ref'),
        log: (m) => console.log(`[rest-api-diff] ${m}`),
    });
    console.log(JSON.stringify(result, null, 2));
}

const invokedDirectly =
    require.main === module || process.argv[1]?.endsWith('rest-api-diff.ts') === true;
if (invokedDirectly) {
    try {
        main();
    } catch (err) {
        console.error(`[rest-api-diff] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
