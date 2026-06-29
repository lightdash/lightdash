/**
 * Generates `release-safety.json` — a machine-readable marker that lets
 * self-hosted operators' CI/CD decide whether a release is risky to roll out.
 *
 * Invoked at release time by semantic-release (@semantic-release/exec prepareCmd),
 * then attached to the GitHub release as an asset by @semantic-release/github.
 *
 * Design: docs/superpowers/specs/2026-06-29-prod-8359-release-safety-marker-design.md
 *
 * The module is split into a PURE core (`detectMigrations`, `buildMarker`) that is
 * trivially unit-testable, and a thin IO shell (`main`) that runs git, stamps the
 * time, and writes the file atomically. The shell FAILS LOUD: if anything throws it
 * exits non-zero and never writes a file that asserts safety.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { aiRollingUpdateReview } from './ai-migration-review';
import { lintMigrations, renderFindings, SqlLintFinding } from './sql-migration-lint';
import { findExpandFloor } from './expand-version';
import { diffRestApi } from './rest-api-diff';
import { diffMcpTools } from './mcp-tools-diff';
import {
    DEFAULT_OVERRIDES_PATH,
    loadUpgradeOverrides,
    resolveUpgrade,
    UpgradeResolution,
} from './upgrade-overrides';

export const MARKER_SCHEMA_VERSION = '1';

const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
] as const;

const EE_MIGRATION_DIR = 'packages/backend/src/ee/database/migrations';

// Knex migration files are timestamped: YYYYMMDDHHMMSS_description.ts
const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;

export type TriState = boolean | 'unknown';

export interface GitChange {
    /** git --name-status code: A, M, D, R100, C75, ... */
    status: string;
    /** the relevant path (new path for renames/copies) */
    path: string;
}

export interface MigrationsResult {
    present: TriState;
    count: number;
    files: string[];
    ee: boolean;
    /** historical migrations deleted in this range — an anti-pattern, surfaced as a warning */
    deletedHistorical: string[];
}

export interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
}

export interface ReleaseSafetyMarker {
    schemaVersion: string;
    version: string;
    previousVersion: string | null;
    releaseDate: string;
    capabilities: string[];
    migrations: {
        present: TriState;
        count: number;
        files: string[];
        ee: boolean;
    };
    compatibility: {
        rollingUpdateSafe: TriState;
        recommendedStrategy: 'Recreate' | 'RollingUpdate' | 'unknown';
        notes: string;
    };
    api: {
        rest: ApiSurface;
        mcp: ApiSurface;
    };
    upgrade: {
        minPreviousVersion: string | null;
        requiredStop: boolean;
        note: string | null;
    };
}

const BLIND_SPOT_NOTE =
    'This marker only reflects the checks listed in `capabilities`. It does NOT ' +
    'detect code-only or config-only breaking changes (env defaults, removed Helm ' +
    'values, serialization/protocol changes), which can also break old pods during ' +
    'a rolling update.';

/**
 * PURE. Classify a list of git changes (scoped to the migration dirs) into a
 * migrations result. Counts ADDED timestamped files only — modified/renamed
 * historical migrations are not counted; deletions are surfaced as a warning.
 */
export function detectMigrations(changes: GitChange[]): MigrationsResult {
    const added: string[] = [];
    const deletedHistorical: string[] = [];

    for (const change of changes) {
        const base = path.basename(change.path);
        if (!MIGRATION_FILENAME_RE.test(base)) continue;
        const code = change.status.charAt(0);
        if (code === 'A') {
            added.push(change.path);
        } else if (code === 'D') {
            deletedHistorical.push(change.path);
        }
        // M (modified) and R/C (renamed/copied) historical migrations are not
        // counted as new migrations.
    }

    added.sort();
    deletedHistorical.sort();

    const ee = added.some((p) => p.startsWith(EE_MIGRATION_DIR));

    return {
        present: added.length > 0,
        count: added.length,
        files: added.map((p) => path.basename(p)),
        ee,
        deletedHistorical: deletedHistorical.map((p) => path.basename(p)),
    };
}

export interface BuildMarkerInput {
    version: string;
    previousVersion: string | null;
    releaseDate: string;
    /** null when migrations could not be determined (e.g. first release / no prev tag) */
    migrations: MigrationsResult | null;
    /**
     * Optional verdict from the gated AI migration review (P6). Applied only when
     * migrations.present === true. null means the review didn't run or degraded —
     * leave rollingUpdateSafe at its honest "unknown" default.
     */
    aiReview?: AiReviewSummary | null;
    /**
     * Optional result of the deterministic SQL-shape migration linter — the
     * non-LLM floor under the AI review. Applied only when migrations.present ===
     * true. A "breaking" finding is AUTHORITATIVE (sets rollingUpdateSafe false
     * and wins over the AI review); a clean run leaves the verdict for the AI /
     * the honest "unknown" default. Adds "sql-lint" to capabilities when it ran.
     */
    sqlLint?: SqlLintSummary | null;
    /**
     * Earliest release the dropped object is provably safe to remove from (the
     * "expand" version, traced from git history). Used only when the AI cleared an
     * expand/contract drop, as the auto-derived upgrade.minPreviousVersion in place
     * of the conservative previousVersion. null → fall back to previousVersion.
     */
    expandContractFloor?: string | null;
    /**
     * Optional result of the REST API breaking-change diff (P2). Applied to
     * api.rest and adds "rest" to capabilities only when checked === true. A
     * null/unchecked result leaves the honest "not checked" stub.
     */
    restApi?: ApiSurface | null;
    /**
     * Optional result of the MCP tool-surface breaking-change diff (P3). Applied
     * to api.mcp and adds "mcp" to capabilities only when checked === true. A
     * null/unchecked result leaves the honest "not checked" stub.
     */
    mcpApi?: ApiSurface | null;
    /**
     * Optional resolved upgrade-path overrides (P4). Applied to the upgrade block
     * and adds "upgrade" to capabilities only when consulted === true (i.e. a
     * committed overrides file was present). null leaves the honest stub.
     */
    upgrade?: UpgradeResolution | null;
}

export interface AiReviewSummary {
    rollingUpdateSafe: TriState;
    recommendedStrategy: ReleaseSafetyMarker['compatibility']['recommendedStrategy'];
    summary: string;
}

export interface SqlLintSummary {
    /** True if the linter actually scanned at least one migration. */
    ran: boolean;
    breaking: boolean;
    /** Pre-rendered finding strings for the marker note. */
    findings: string[];
}

/**
 * PURE. Assemble the marker from already-gathered inputs. Encodes the honesty
 * rules: rollingUpdateSafe is never silently true/false for a migration-bearing
 * (or unknown) release.
 */
export function buildMarker(input: BuildMarkerInput): ReleaseSafetyMarker {
    const { version, previousVersion, releaseDate, migrations, aiReview, sqlLint, restApi } = input;

    const present: TriState = migrations ? migrations.present : 'unknown';

    // A deterministic detector flagged a breaking change on a NON-migration
    // surface (the REST API via oasdiff, or the MCP tool surface via the snapshot
    // diff). These can break an in-flight frontend / client mid-rollout, so they
    // are a rolling-update concern the AI review validates — even on a release
    // with no schema migration. (They populate api.* regardless; this gate only
    // governs whether they bear on compatibility.rollingUpdateSafe.)
    const restBreaking = Boolean(restApi?.checked && restApi.breaking === true);
    const mcpBreaking = Boolean(input.mcpApi?.checked && input.mcpApi.breaking === true);
    const nonMigrationHazard = restBreaking || mcpBreaking;

    let rollingUpdateSafe: TriState;
    let recommendedStrategy: ReleaseSafetyMarker['compatibility']['recommendedStrategy'];
    let notes: string;

    if (present === false && !nonMigrationHazard) {
        // No schema migrations and nothing else flagged. Safe with respect to the
        // checks that ran — see blind-spot note.
        rollingUpdateSafe = true;
        recommendedStrategy = 'RollingUpdate';
        notes = `No database migrations detected in this release. ${BLIND_SPOT_NOTE}`;
    } else if (present === false && nonMigrationHazard) {
        // No migration, but a deterministic detector flagged a breaking REST/MCP
        // change. Whether an in-flight frontend/client actually breaks mid-rollout
        // depends on who calls it — that's the AI review's call below. Until it's
        // verified, stay cautious rather than assert safe off "no migrations".
        const which = [restBreaking ? 'REST API' : null, mcpBreaking ? 'MCP tool' : null]
            .filter(Boolean)
            .join(' and ');
        rollingUpdateSafe = 'unknown';
        recommendedStrategy = 'Recreate';
        notes =
            `No database migrations, but a deterministic check flagged a breaking ${which} change. ` +
            `Whether an in-flight frontend or client breaks during a rolling update was not automatically ` +
            `verified; prefer a Recreate strategy or a maintenance window. ${BLIND_SPOT_NOTE}`;
    } else if (present === true) {
        rollingUpdateSafe = 'unknown';
        recommendedStrategy = 'Recreate';
        notes =
            'This release contains database migrations that are applied before the ' +
            'app rolls out. Backward-compatibility with the previous running version ' +
            'was not automatically verified; prefer a Recreate strategy or a ' +
            `maintenance window. ${BLIND_SPOT_NOTE}`;
    } else {
        rollingUpdateSafe = 'unknown';
        recommendedStrategy = 'Recreate';
        notes =
            'Migration status could not be determined (no previous release to diff ' +
            `against). Treat as potentially unsafe. ${BLIND_SPOT_NOTE}`;
    }

    const capabilities = ['migrations'];

    // Deterministic SQL-shape linter — the non-LLM FLOOR. Runs only for a
    // migration-bearing release and sets a breaking BASELINE the AI can override
    // below. It judges by operation shape, so its "breaking" can be a false
    // positive: a drop/rename is actually safe when the previous release already
    // stopped using the object (the "contract" step of an expand/contract). Only
    // reading the old code — which the AI does — can tell, so the linter is a
    // floor, not the last word. A clean run claims the capability but leaves the
    // verdict open (no findings ≠ safe; the linter only knows common shapes).
    const linterFlagged = Boolean(sqlLint?.ran && sqlLint.breaking && present === true);
    if (sqlLint?.ran && present === true) {
        capabilities.push('sql-lint');
        if (sqlLint.breaking) {
            rollingUpdateSafe = false;
            recommendedStrategy = 'Recreate';
            const detail = sqlLint.findings.length ? ` (${sqlLint.findings.join('; ')})` : '';
            notes = `Migration linter detected breaking schema operations${detail}. ${BLIND_SPOT_NOTE}`;
        }
    }

    // P6: the AI rolling-update review — the intelligent VALIDATION layer. Runs to
    // validate whatever the deterministic detectors flagged: ALL migration-bearing
    // releases (even when the linter flagged a shape — it can read the previous
    // release's code and recognise an expand/contract, where a drop/rename is safe
    // because the old code no longer references the object) AND no-migration
    // releases where a REST/MCP break was flagged (it decides whether an in-flight
    // frontend/client actually breaks). A DEFINITIVE AI verdict (high-confidence
    // safe → true, or breaking → false) overrides the linter floor / cautious
    // default; an inconclusive AI ("unknown") leaves it in place — so the AI can
    // only ever make the marker MORE accurate, never downgrade a deterministic
    // break to "unknown". It never applies on a first release or on a release with
    // nothing flagged (no migration AND no API break).
    // True when the AI cleared a linter-flagged destructive change as the safe
    // "contract" step of an expand/contract — the verdict it reached by verifying
    // the PREVIOUS release (previousVersion) no longer uses the object.
    const aiClearedExpandContract = Boolean(
        linterFlagged && aiReview && aiReview.rollingUpdateSafe === true,
    );
    if (aiReview && (present === true || nonMigrationHazard)) {
        capabilities.push('ai-review');
        if (aiReview.rollingUpdateSafe !== 'unknown') {
            rollingUpdateSafe = aiReview.rollingUpdateSafe;
            recommendedStrategy = aiReview.recommendedStrategy;
            notes =
                linterFlagged && aiReview.rollingUpdateSafe === true
                    ? `AI rolling-update review CLEARED a deterministic linter flag — it verified the previous release (${previousVersion ?? 'unknown'}) no longer uses the changed object (expand/contract): ${aiReview.summary} Safe ONLY when upgrading from ${previousVersion ?? 'that release'} or later. ${BLIND_SPOT_NOTE}`
                    : `AI rolling-update review: ${aiReview.summary} ${BLIND_SPOT_NOTE}`;
        }
    }

    // P2: a deterministic REST API breaking-change diff (oasdiff). `checked: false`
    // means the diff didn't run — leave the unchecked stub and don't claim the
    // capability. Independent of the migration/rolling-update signal above:
    // api.rest.breaking is about REST consumers, not mid-rollout pod safety.
    let rest: ApiSurface = { checked: false, breaking: false, changes: [] };
    if (restApi && restApi.checked) {
        rest = restApi;
        capabilities.push('rest');
    }

    // P3: deterministic MCP tool-surface diff. Same semantics as rest:
    // `checked: false` means the diff didn't run — leave the unchecked stub and
    // don't claim the capability. About MCP tool consumers, not pod safety.
    let mcp: ApiSurface = { checked: false, breaking: false, changes: [] };
    if (input.mcpApi && input.mcpApi.checked) {
        mcp = input.mcpApi;
        capabilities.push('mcp');
    }

    // P4: human-authored upgrade-path overrides. Applied (and the capability
    // claimed) only when a committed overrides file was consulted; otherwise the
    // honest null stub. A malformed file fails loud upstream — it never silently
    // degrades here, because that would drop a maintainer's required-stop signal.
    let upgrade: ReleaseSafetyMarker['upgrade'] = {
        minPreviousVersion: null,
        requiredStop: false,
        note: null,
    };
    let upgradeKnown = false;
    if (input.upgrade && input.upgrade.consulted) {
        upgrade = {
            minPreviousVersion: input.upgrade.minPreviousVersion,
            requiredStop: input.upgrade.requiredStop,
            note: input.upgrade.note,
        };
        upgradeKnown = true;
    }

    // Expand/contract floor: when the AI cleared a destructive change as the
    // "contract" step, the "safe" verdict was only verified against previousVersion
    // — upgrading from an EARLIER release (which may still use the object) is not
    // verified. Record that as the minimum-previous-version floor so an operator
    // skipping up from an older version is protected. previousVersion is a provably
    // safe value (the release we actually checked); the author can lower it via the
    // overrides file if the "expand" shipped earlier. A human-authored
    // minPreviousVersion (from the overrides file) always wins.
    if (aiClearedExpandContract && upgrade.minPreviousVersion === null && (input.expandContractFloor || previousVersion)) {
        // Prefer the git-traced expand version (earliest release the app stopped
        // using the object — provably safe and more permissive); fall back to the
        // conservative previousVersion (the single release the AI verified).
        const floor = input.expandContractFloor || previousVersion!;
        const traced = Boolean(input.expandContractFloor);
        upgrade = {
            minPreviousVersion: floor,
            requiredStop: upgrade.requiredStop,
            note: traced
                ? `Auto-derived: git history shows the app stopped referencing the dropped object by ${floor}, so upgrades from ${floor} or later are safe. Set a different minPreviousVersion in release-safety.overrides.json to override.`
                : `Auto-derived: the AI verified the change is safe via expand/contract from ${floor}. ` +
                  `Upgrading from an earlier release is NOT verified — set a lower minPreviousVersion in ` +
                  `release-safety.overrides.json if the app stopped using the object before then.`,
        };
        upgradeKnown = true;
    }

    if (upgradeKnown) {
        capabilities.push('upgrade');
    }

    return {
        schemaVersion: MARKER_SCHEMA_VERSION,
        version,
        previousVersion: previousVersion || null,
        releaseDate,
        capabilities,
        migrations: {
            present,
            count: migrations ? migrations.count : 0,
            files: migrations ? migrations.files : [],
            ee: migrations ? migrations.ee : false,
        },
        compatibility: {
            rollingUpdateSafe,
            recommendedStrategy,
            notes,
        },
        api: {
            // P2: rest is populated by the oasdiff diff when it ran; otherwise the
            // unchecked stub. `checked: false` means "unknown", not "no break".
            rest,
            // P3: mcp is populated by the tool-snapshot diff when it ran.
            mcp,
        },
        upgrade,
    };
}

// ---------------------------------------------------------------------------
// IO shell
// ---------------------------------------------------------------------------

interface CliArgs {
    version: string;
    previousVersion: string | null;
    lastTag: string | null;
    out: string;
    overrides: string;
}

function parseArgs(argv: string[]): CliArgs {
    const get = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const version = get('version');
    if (!version) {
        throw new Error('--version is required');
    }
    const previousVersion = get('previous-version') || null;
    return {
        version,
        previousVersion,
        lastTag: get('last-tag') || previousVersion,
        out: get('out') || 'release-safety.json',
        overrides: get('overrides') || DEFAULT_OVERRIDES_PATH,
    };
}

/** IO: list git changes (name-status) for the given range, scoped to dirs. */
function gitNameStatus(range: string, dirs: readonly string[]): GitChange[] {
    const stdout = execFileSync(
        'git',
        ['diff', '--name-status', range, '--', ...dirs],
        { encoding: 'utf-8' },
    );
    const changes: GitChange[] = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const status = parts[0];
        // Renames/copies (R100/C75) carry old + new paths; use the new (last) path.
        const filePath = parts[parts.length - 1];
        changes.push({ status, path: filePath });
    }
    return changes;
}

/** IO: write JSON atomically (temp file + rename) so a crash never leaves a partial. */
function writeAtomic(outPath: string, contents: string): void {
    const dir = path.dirname(path.resolve(outPath));
    const tmp = path.join(dir, `.release-safety.${process.pid}.tmp`);
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, outPath);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    // Kill-switch: the marker is dark-launched. Unless RELEASE_SAFETY_MARKER_ENABLED
    // is "true", the generator still computes + prints the marker to stdout but
    // does NOT write the output file (so no GitHub release asset is published) and
    // skips the paid AI review (so a dark release spends nothing). The PR preview
    // workflow sets it true to write its throwaway temp file.
    const markerEnabled = process.env.RELEASE_SAFETY_MARKER_ENABLED === 'true';
    const wantAiReview = process.argv.includes('--ai-review');

    let migrations: MigrationsResult | null = null;
    if (args.lastTag) {
        const range = `${args.lastTag}..HEAD`;
        const changes = gitNameStatus(range, MIGRATION_DIRS);
        migrations = detectMigrations(changes);
        if (migrations.deletedHistorical.length > 0) {
            console.warn(
                `[release-safety] WARNING: historical migrations deleted in ${range}: ` +
                    migrations.deletedHistorical.join(', '),
            );
        }
    } else {
        console.warn(
            '[release-safety] no previous tag/version; emitting migrations.present="unknown"',
        );
    }

    // Deterministic SQL-shape linter — the always-on floor. Runs (no flag, no
    // key) whenever the cheap detector found migrations. Its "breaking" is a
    // baseline, NOT the last word: the AI review below can clear a flagged
    // drop/rename when it verifies the previous release no longer uses the object.
    let sqlLint: SqlLintSummary | null = null;
    let lintFindings: SqlLintFinding[] = [];
    if (migrations?.present === true && args.lastTag) {
        const r = lintMigrations({ lastTag: args.lastTag, log: (m) => console.warn(`[sql-lint] ${m}`) });
        lintFindings = r.findings;
        sqlLint = { ran: r.ran, breaking: r.breaking, findings: renderFindings(r.findings) };
        console.warn(
            `[release-safety] SQL linter: ${r.breaking ? `BREAKING (${r.findings.length} finding(s))` : 'no breaking shapes found'}`,
        );
    }

    // P2: deterministic REST API breaking-change diff (oasdiff). Auto-runs when a
    // previous tag exists and oasdiff is available (OASDIFF_BIN or PATH); the CI
    // workflow installs it. Soft fail-safe: any problem leaves api.rest unchecked
    // and never fails the release. Runs BEFORE the AI review so a flagged break can
    // be handed to the reviewer to validate (does the in-flight frontend break?).
    let restApi: ApiSurface | null = null;
    if (args.lastTag) {
        restApi = diffRestApi({
            lastTag: args.lastTag,
            newRef: 'HEAD',
            log: (m) => console.warn(`[rest-api-diff] ${m}`),
        });
    }

    // P3: deterministic MCP tool-surface diff (committed snapshot between tags).
    // Auto-runs when a previous tag exists; soft fail-safe (snapshot absent at a
    // ref → api.mcp unchecked), never fails the release.
    let mcpApi: ApiSurface | null = null;
    if (args.lastTag) {
        mcpApi = diffMcpTools({
            lastTag: args.lastTag,
            newRef: 'HEAD',
            log: (m) => console.warn(`[mcp-tools-diff] ${m}`),
        });
    }

    // P6: gated AI rolling-update review — the VALIDATION layer over the
    // deterministic detectors. Runs when a key is present AND something was flagged
    // worth validating: a migration is present (even a linter-clean one — it can
    // recognise an expand/contract the linter can't), OR a REST/MCP break was
    // flagged (it decides whether an in-flight frontend/client actually breaks). It
    // is fed the deterministic breaking lists so it validates exactly what the
    // detectors found. Any degrade leaves the verdict at the linter floor / cautious
    // default — the review can only ever make the marker more accurate, never
    // falsely safe, and never fails the release.
    const restBreakingChanges =
        restApi?.checked && restApi.breaking === true ? restApi.changes : [];
    const mcpBreakingChanges =
        mcpApi?.checked && mcpApi.breaking === true ? mcpApi.changes : [];
    const reviewable =
        migrations?.present === true ||
        restBreakingChanges.length > 0 ||
        mcpBreakingChanges.length > 0;
    let aiReview: AiReviewSummary | null = null;
    if (wantAiReview && markerEnabled && reviewable && args.lastTag) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn('[release-safety] --ai-review requested but ANTHROPIC_API_KEY not set; rollingUpdateSafe stays "unknown"');
        } else {
            console.warn('[release-safety] running AI rolling-update review...');
            const r = await aiRollingUpdateReview({
                apiKey,
                lastTag: args.lastTag,
                version: args.version,
                restBreaking: restBreakingChanges,
                mcpBreaking: mcpBreakingChanges,
                log: (m) => console.warn(`[ai-review] ${m}`),
            });
            if (r) {
                aiReview = {
                    rollingUpdateSafe: r.rollingUpdateSafe,
                    recommendedStrategy: r.recommendedStrategy,
                    summary: r.summary,
                };
                console.warn(
                    `[release-safety] AI verdict: ${r.modelVerdict}/${r.confidence} (${r.toolCalls} tool calls) -> rollingUpdateSafe=${JSON.stringify(r.rollingUpdateSafe)}`,
                );
            } else {
                console.warn('[release-safety] AI review degraded; rollingUpdateSafe stays "unknown"');
            }
        }
    }

    // Expand-version tracing: when the AI cleared a linter-flagged drop/rename as
    // the safe "contract" step, trace from git history the EARLIEST release the
    // app stopped referencing the object — a more permissive (but still provably
    // safe) upgrade floor than the conservative previousVersion. Best-effort;
    // null stays conservative.
    let expandContractFloor: string | null = null;
    if (sqlLint?.breaking && aiReview?.rollingUpdateSafe === true && args.lastTag) {
        const objects = lintFindings
            .filter((f) => ['drop-column', 'rename-column', 'drop-table', 'rename-table'].includes(f.rule))
            .map((f) => f.object)
            .filter((o): o is string => Boolean(o));
        if (objects.length > 0) {
            expandContractFloor = findExpandFloor({
                objects,
                fromRef: args.lastTag,
                log: (m) => console.warn(`[expand-version] ${m}`),
            });
            if (expandContractFloor) {
                console.warn(`[release-safety] expand version traced: minPreviousVersion -> ${expandContractFloor}`);
            }
        }
    }

    // P4: human-authored upgrade-path overrides. A missing file is fine (mechanism
    // unused); a present-but-malformed file throws here and FAILS the release —
    // never silently drop a maintainer's declared required-stop.
    const overrides = loadUpgradeOverrides(args.overrides);
    const upgrade = resolveUpgrade(overrides, args.version);

    const marker = buildMarker({
        version: args.version,
        previousVersion: args.previousVersion,
        releaseDate: new Date().toISOString(),
        migrations,
        aiReview,
        sqlLint,
        expandContractFloor,
        restApi,
        mcpApi,
        upgrade,
    });

    const json = `${JSON.stringify(marker, null, 2)}\n`;
    // Always print the marker (CI logs + the PR preview workflow read this); only
    // write the file — the thing that becomes the published release asset — when
    // the kill-switch is on.
    if (markerEnabled) {
        writeAtomic(args.out, json);
        console.log(`[release-safety] wrote ${args.out}`);
    } else {
        console.log(
            `[release-safety] marker disabled (RELEASE_SAFETY_MARKER_ENABLED != "true"); not writing ${args.out}`,
        );
    }
    console.log(json);
}

// Only run the IO shell when executed directly (not when imported by tests).
const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('gen-release-safety.ts') === true;

if (invokedDirectly) {
    // Fail loud: never emit a falsely-safe marker.
    main().catch((err) => {
        console.error(
            `[release-safety] FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
    });
}
