/**
 * REST API breaking-change detection (PROD-8359, Phase 2).
 *
 * Populates the release-safety marker's `api.rest` block by diffing the
 * generated OpenAPI spec (`packages/backend/src/generated/swagger.json`) between
 * the PREVIOUS release tag and HEAD with `oasdiff breaking`. That command returns
 * both WARN-level (2) and ERR-level (3) items. Only ERR items are consumer-
 * breaking contract violations; WARN items — such as response enum widening,
 * which recurs whenever a chart or scheduler type is added — are surfaced as
 * advisories without affecting the verdict.
 *
 * This is a deterministic detector whose flagged breaking changes are handed
 * downstream to the AI rolling-update review for validation. oasdiff parses both
 * specs into a semantic OpenAPI model and compares them, so JSON key ordering is
 * irrelevant and the result is reproducible. It runs whenever `oasdiff` is
 * available (on PATH or via `OASDIFF_BIN`) and the caller named both sides of the
 * comparison — which specs to diff is never inferred, see the generator.
 *
 * Each side comes from either a git ref or an explicit file. Release preparation
 * reads the old side from the previous tag and the new side from the freshly
 * generated working-tree file; the PR preview passes two freshly generated files
 * (the committed spec is a release-time artifact and is stale on every PR).
 *
 * FAIL-SAFE (soft): any failure (oasdiff missing, spec absent at a ref, oasdiff
 * error, unparseable output) degrades to `checked: false` — the honest "not
 * checked" stub — and the generator does NOT add `rest` to `capabilities`. It
 * never asserts "no break" it couldn't prove, and it never fails the release.
 *
 * Importable: `diffRestApi(opts)` returns an `ApiSurface`.
 *
 * CLI:  npx tsx scripts/rest-api-diff.ts --last-tag 0.3260.2 [--new-ref HEAD]
 *       npx tsx scripts/rest-api-diff.ts --base-spec base.json --new-spec pr.json
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
    breakingCount: number;
    advisories: string[];
    advisoryCount: number;
}

export const SPEC_PATH = 'packages/backend/src/generated/swagger.json';

/** Cap on rendered change lines so a large breaking diff can't bloat the marker. */
const MAX_CHANGES = 50;

/**
 * One item from `oasdiff breaking -f json`. oasdiff's `breaking` subcommand
 * returns both WARN=2 and ERR=3 items; missing levels are possible when output
 * changes and are handled conservatively as errors.
 */
export interface OasdiffItem {
    id: string;
    text: string;
    level?: number;
    operation?: string;
    operationId?: string;
    path?: string;
}

/**
 * PURE. Reduce the oasdiff `breaking` JSON array into the marker's `api.rest`
 * shape. ERR-level and unlevelled items are breaking; WARN/other items are
 * advisories. Each item renders as "METHOD /path — text". Both lists are capped
 * independently with explicit overflow lines while their counts remain uncapped.
 */
export function summarizeBreaking(items: OasdiffItem[]): {
    breaking: boolean;
    changes: string[];
    breakingCount: number;
    advisories: string[];
    advisoryCount: number;
} {
    const render = (it: OasdiffItem): string => {
        const op = it.operation ? `${it.operation} ` : '';
        const p = it.path ? `${it.path} — ` : '';
        return `${op}${p}${it.text}`.trim();
    };
    const errItems = items.filter((item) => item.level === undefined || item.level >= 3);
    const advisoryItems = items.filter((item) => item.level !== undefined && item.level < 3);
    const changes = errItems.slice(0, MAX_CHANGES).map(render);
    if (errItems.length > MAX_CHANGES) {
        changes.push(`… and ${errItems.length - MAX_CHANGES} more breaking change(s)`);
    }
    const advisories = advisoryItems.slice(0, MAX_CHANGES).map(render);
    if (advisoryItems.length > MAX_CHANGES) {
        advisories.push(`… and ${advisoryItems.length - MAX_CHANGES} more advisory note(s)`);
    }
    return {
        breaking: errItems.length > 0,
        changes,
        breakingCount: errItems.length,
        advisories,
        advisoryCount: advisoryItems.length,
    };
}

const UNCHECKED: ApiSurface = {
    checked: false,
    breaking: false,
    changes: [],
    breakingCount: 0,
    advisories: [],
    advisoryCount: 0,
};

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

function readSpecFile(specPath: string): string | null {
    try {
        return fs.readFileSync(specPath, 'utf-8');
    } catch {
        return null;
    }
}

export interface DiffRestApiOpts {
    /** Previous release tag/ref — the old spec side. */
    lastTag?: string;
    /** Generated spec to use as the old side instead of lastTag. */
    baseSpecPath?: string;
    /** New spec side; defaults to HEAD (the release commit). */
    newRef?: string;
    /** Generated working-tree spec to use instead of newRef. */
    newSpecPath?: string;
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

    if (opts.newRef !== undefined && opts.newSpecPath !== undefined) {
        throw new Error('Provide either newRef or newSpecPath, not both');
    }
    if ((opts.lastTag === undefined) === (opts.baseSpecPath === undefined)) {
        throw new Error('Provide exactly one of lastTag or baseSpecPath');
    }

    if (!bin) {
        log('oasdiff not found (OASDIFF_BIN unset, not on PATH); api.rest stays unchecked');
        return UNCHECKED;
    }

    const oldSpec = opts.baseSpecPath
        ? readSpecFile(opts.baseSpecPath)
        : showAtRef(opts.lastTag as string, SPEC_PATH);
    if (oldSpec === null) {
        const source = opts.baseSpecPath ?? `${opts.lastTag}:${SPEC_PATH}`;
        log(`spec not found at ${source}; api.rest stays unchecked`);
        return UNCHECKED;
    }
    const newSpec = opts.newSpecPath
        ? readSpecFile(opts.newSpecPath)
        : showAtRef(newRef, SPEC_PATH);
    if (newSpec === null) {
        const source = opts.newSpecPath ?? `${newRef}:${SPEC_PATH}`;
        log(`spec not found at ${source}; api.rest stays unchecked`);
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

        const summary = summarizeBreaking(items);
        log(
            `api.rest checked: ${summary.breakingCount} breaking, ${summary.advisoryCount} advisory`,
        );
        return { checked: true, ...summary };
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
    const baseSpecPath = arg('base-spec');
    const lastTag = baseSpecPath ? undefined : arg('last-tag') ?? arg('previous-version');
    if (!lastTag && !baseSpecPath) {
        throw new Error('--last-tag (or --previous-version) or --base-spec is required');
    }
    const newSpecPath = arg('new-spec');
    const result = diffRestApi({
        lastTag,
        baseSpecPath,
        newRef: newSpecPath ? undefined : arg('new-ref'),
        newSpecPath,
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
