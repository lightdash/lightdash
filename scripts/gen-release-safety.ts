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
 * time, and writes the file atomically.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { isReleaseVersion } from '../packages/cli/src/releaseSafety';
import { aiRollingUpdateReview } from './ai-migration-review';
import { compareVersions, findExpandFloor } from './expand-version';
import { diffMcpTools } from './mcp-tools-diff';
import type { ConfigSurface } from './release-safety-config-diff';
import { diffConfigBetweenRefs } from './release-safety-config-diff';
import type {
    ApiSurface,
    ReleaseSafetyMarker,
    TriState,
} from './release-safety-contract';
import { collectBreakingChangeDeclarationsBetweenRefs } from './release-safety-declarations';
import type { BreakingChangeDeclaration } from './release-safety-declarations';
import {
    appendReleaseSafetyMarker,
    CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION,
    loadReleaseSafetyIndex,
    writeReleaseSafetyIndex,
} from './release-safety-index';
import type {
    MigrationDetail,
    MigrationOperation,
} from './release-safety-migrations';
import {
    isMigrationPath,
    readMigrationMetadata,
} from './release-safety-migrations';
import { diffRestApi, SPEC_PATH } from './rest-api-diff';
import {
    lintMigrations,
    renderFindings,
    SqlLintFinding,
} from './sql-migration-lint';
import {
    CarriedFloor,
    carriedUpgradeFloor,
    DEFAULT_OVERRIDES_PATH,
    loadUpgradeOverrides,
    recordDerivedFloor,
    requiredStopsUpTo,
    resolveUpgrade,
    UpgradeOverridesFile,
    UpgradeResolution,
} from './upgrade-overrides';

export const MARKER_SCHEMA_VERSION = '2' as const;
export type { ApiSurface, ReleaseSafetyMarker, TriState };

const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
] as const;

const EE_MIGRATION_DIR = 'packages/backend/src/ee/database/migrations';

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

/**
 * PURE. Classify a list of git changes (scoped to the migration dirs) into a
 * migrations result. Counts ADDED timestamped files only — modified/renamed
 * historical migrations are not counted; deletions are surfaced as a warning.
 */
export function detectMigrations(changes: GitChange[]): MigrationsResult {
    const added: string[] = [];
    const deletedHistorical: string[] = [];

    for (const change of changes) {
        if (!isMigrationPath(change.path)) continue;
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
    migrationDetails?: MigrationDetail[];
    migrationOperations?: MigrationOperation[];
    migrationMetadataComplete?: boolean;
    declarationMetadataComplete?: boolean;
    declaredBreaks?: BreakingChangeDeclaration[];
    config?: ConfigSurface | null;
    /**
     * Optional verdict from the gated AI migration review (P6). Applied only when
     * migrations.present === true. null means the review didn't run or degraded —
     * leave rollingUpdateSafe at its honest "unknown" default.
     */
    aiReview?: AiReviewSummary | null;
    /**
     * Optional result of the deterministic SQL-shape migration linter — the
     * non-LLM floor under the AI review. Applied only when migrations.present ===
     * true. A "breaking" finding sets the deterministic unsafe floor; a
     * definitive code-aware review may clear it as an expand/contract step.
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
     * Optional result of the REST API breaking-change diff (P2). A null/unchecked
     * result leaves the honest "not checked" stub.
     */
    restApi?: ApiSurface | null;
    /**
     * Optional result of the MCP tool-surface breaking-change diff (P3). A
     * null/unchecked result leaves the honest "not checked" stub.
     */
    mcpApi?: ApiSurface | null;
    /**
     * Optional resolved upgrade-path overrides (P4). Applied to the upgrade block
     * when a committed overrides file was present. null leaves the honest stub.
     */
    upgrade?: UpgradeResolution | null;
    /**
     * Optional forward-carried upgrade floor (high-water mark) computed from the
     * committed overrides across ALL releases <= this one. Only ever RAISES
     * upgrade.minPreviousVersion (never lowers — the safe direction), so a single
     * marker is sufficient for a version-skip: an operator reading only this marker
     * still cannot be told "safe from anywhere" when an in-between release dropped
     * something their old pods use. null/absent leaves the per-release floor as-is.
     */
    carriedFloor?: CarriedFloor | null;
    /**
     * Optional list of required-stop releases at or before this version (from the
     * committed overrides). Surfaced verbatim as `upgrade.requiredStops`. Absent →
     * empty list.
     */
    requiredStops?: string[];
}

export interface AiReviewSummary {
    rollingUpdateSafe: TriState;
    recommendedStrategy: 'Recreate' | 'RollingUpdate' | 'unknown';
    summary: string;
}

export interface SqlLintSummary {
    /** True if the linter actually scanned at least one migration. */
    ran: boolean;
    breaking: boolean;
    /** Pre-rendered finding strings for the marker note. */
    findings: string[];
}

export interface DeterministicSafetyInput {
    migrations: MigrationsResult | null;
    migrationOperations?: readonly MigrationOperation[];
    migrationMetadataComplete?: boolean;
    declarationMetadataComplete?: boolean;
    declaredBreaks?: readonly BreakingChangeDeclaration[];
    config?: ConfigSurface | null;
    restApi?: ApiSurface | null;
    mcpApi?: ApiSurface | null;
    sqlLint?: SqlLintSummary | null;
}

const DETERMINISTIC_OPERATION_SAFETY = {
    'create-index-concurrently': true,
    'create-unique-index-concurrently': false,
    'drop-index-concurrently-if-exists': true,
    'set-statement-timeout': true,
    'reset-statement-timeout': true,
    'set-lock-timeout': true,
    'reset-lock-timeout': true,
    'select-invalid-index': true,
    unknown: false,
} satisfies Record<MigrationOperation, boolean>;

export function isDeterministicallyRollingUpdateSafe(
    input: DeterministicSafetyInput,
): boolean {
    const operations = input.migrationOperations ?? [];
    return (
        input.migrations?.present === true &&
        input.migrationMetadataComplete === true &&
        input.declarationMetadataComplete === true &&
        input.restApi?.checked === true &&
        input.restApi.breaking === false &&
        input.mcpApi?.checked === true &&
        input.mcpApi.breaking === false &&
        input.config?.checked === true &&
        input.config.breaking === false &&
        (input.declaredBreaks?.length ?? 0) === 0 &&
        !(input.sqlLint?.ran && input.sqlLint.breaking) &&
        operations.length > 0 &&
        operations.every(
            (operation) =>
                DETERMINISTIC_OPERATION_SAFETY[operation] === true,
        )
    );
}

export function isAiReviewEligible(input: DeterministicSafetyInput): boolean {
    const apiBreak =
        input.restApi?.breaking === true || input.mcpApi?.breaking === true;
    return (
        apiBreak ||
        (input.migrations?.present === true &&
            !isDeterministicallyRollingUpdateSafe(input))
    );
}

/**
 * PURE. The upgrade floor THIS release contributes on its own: non-null ONLY when
 * the AI cleared a linter-flagged destructive change as the safe "contract" step
 * of an expand/contract (it verified the previous release no longer references the
 * dropped object). Returns the git-traced expand version when available (more
 * permissive, still provably safe), else the conservative previousVersion.
 *
 * Single source of truth shared by `buildMarker` (sets the live floor on this
 * release's marker) and the IO shell (persists it into the committed overrides so
 * FUTURE releases carry it forward — they cannot re-derive it without re-running
 * the AI). Keeping one function means the persisted value can never drift from the
 * value the marker advertises.
 */
export function ownExpandContractFloor(input: {
    migrations: MigrationsResult | null;
    sqlLint?: SqlLintSummary | null;
    aiReview?: AiReviewSummary | null;
    expandContractFloor?: string | null;
    previousVersion: string | null;
}): string | null {
    const present: TriState = input.migrations
        ? input.migrations.present
        : 'unknown';
    const linterFlagged = Boolean(
        input.sqlLint?.ran && input.sqlLint.breaking && present === true,
    );
    const cleared = Boolean(
        linterFlagged &&
        input.aiReview &&
        input.aiReview.rollingUpdateSafe === true,
    );
    if (!cleared) return null;
    return input.expandContractFloor || input.previousVersion || null;
}

/**
 * PURE. Assemble the marker from already-gathered inputs. Encodes the honesty
 * rules: definitive AI verdicts stand despite incomplete metadata. Declared
 * and config breaks plus required stops remain unsafe; a linter finding holds
 * unless a definitive AI verdict clears it.
 */
export function buildMarker(input: BuildMarkerInput): ReleaseSafetyMarker {
    const present: TriState = input.migrations
        ? input.migrations.present
        : 'unknown';
    const uncheckedApi: ApiSurface = {
        checked: false,
        breaking: 'unknown',
        changes: [],
        breakingCount: 0,
        advisories: [],
        advisoryCount: 0,
    };
    const rest = input.restApi?.checked ? input.restApi : uncheckedApi;
    const mcp = input.mcpApi?.checked ? input.mcpApi : uncheckedApi;
    const config: ConfigSurface = input.config?.checked
        ? input.config
        : { checked: false, breaking: 'unknown', changes: [] };
    const declaredBreaks = input.declaredBreaks ?? [];
    const metadataComplete =
        (input.migrationMetadataComplete ?? true) &&
        (input.declarationMetadataComplete ?? true);
    const deterministicBreak =
        config.breaking === true || declaredBreaks.length > 0;
    const apiBreak = rest.breaking === true || mcp.breaking === true;
    const linterFlagged = Boolean(
        input.sqlLint?.ran && input.sqlLint.breaking && present === true,
    );
    const fullyChecked =
        rest.checked && mcp.checked && config.checked && metadataComplete;
    const deterministicallySafe = isDeterministicallyRollingUpdateSafe(input);
    const requiredStops = [
        ...new Set([
            ...(input.requiredStops ?? []),
            ...(declaredBreaks.some(
                (declaredBreak) => declaredBreak.requiredStop,
            )
                ? [input.version]
                : []),
        ]),
    ].sort(compareVersions);

    let rollingUpdateSafe: TriState = 'unknown';
    if (
        (present === false &&
            fullyChecked &&
            !apiBreak &&
            !deterministicBreak) ||
        deterministicallySafe
    ) {
        rollingUpdateSafe = true;
    }
    if (linterFlagged || deterministicBreak) {
        rollingUpdateSafe = false;
    }
    if (
        input.aiReview &&
        input.aiReview.rollingUpdateSafe !== 'unknown' &&
        (present === true || apiBreak)
    ) {
        rollingUpdateSafe = input.aiReview.rollingUpdateSafe;
    }
    if (deterministicBreak || requiredStops.includes(input.version)) {
        rollingUpdateSafe = false;
    }

    const ownFloor = ownExpandContractFloor({
        migrations: input.migrations,
        sqlLint: input.sqlLint,
        aiReview: input.aiReview,
        expandContractFloor: input.expandContractFloor,
        previousVersion: input.previousVersion,
    });
    let minPreviousVersion = input.upgrade?.consulted
        ? input.upgrade.minPreviousVersion
        : null;
    if (minPreviousVersion === null && ownFloor !== null) {
        minPreviousVersion = ownFloor;
    }
    const carriedFloor = input.carriedFloor?.minPreviousVersion ?? null;
    if (
        carriedFloor !== null &&
        (minPreviousVersion === null ||
            compareVersions(carriedFloor, minPreviousVersion) > 0)
    ) {
        minPreviousVersion = carriedFloor;
    }

    const migrationDetails = input.migrationDetails ?? [];
    const coreCount = migrationDetails.filter(
        (migration) => migration.edition === 'core',
    ).length;
    const eeCount = migrationDetails.filter(
        (migration) => migration.edition === 'ee',
    ).length;

    return {
        schemaVersion: MARKER_SCHEMA_VERSION,
        version: input.version,
        previousVersion: input.previousVersion,
        releaseDate: input.releaseDate,
        migrations: {
            present,
            count: input.migrations?.count ?? 0,
            coreCount,
            eeCount,
            files: migrationDetails,
        },
        compatibility: {
            rollingUpdateSafe,
            recommendedStrategy:
                rollingUpdateSafe === true ? 'RollingUpdate' : 'Recreate',
        },
        api: { rest, mcp },
        config,
        upgrade: { minPreviousVersion, requiredStops },
        declaredBreaks,
    };
}

// ---------------------------------------------------------------------------
// IO shell
// ---------------------------------------------------------------------------

export interface CliArgs {
    version: string;
    previousVersion: string | null;
    lastTag: string | null;
    toRef: string;
    releaseDate: string | null;
    out: string;
    index: string;
    overrides: string;
    restBaseSpec: string | null;
    restNewSpec: string | null;
    restFromTag: boolean;
    restFromRefs: boolean;
    backfilled: boolean;
    mcpBaseSnapshot: string | null;
    mcpNewSnapshot: string | null;
}

export function parseArgs(argv: string[]): CliArgs {
    const get = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const version = get('version');
    if (!version) {
        throw new Error('--version is required');
    }
    const previousVersion = get('previous-version') || null;
    const restBaseSpec = get('rest-base-spec') || null;
    const restNewSpec = get('rest-new-spec') || null;
    const restFromTag = argv.includes('--rest-from-tag');
    const restFromRefs = argv.includes('--rest-from-refs');
    const mcpBaseSnapshot = get('mcp-base-snapshot') || null;
    const mcpNewSnapshot = get('mcp-new-snapshot') || null;
    if (Boolean(restBaseSpec) !== Boolean(restNewSpec)) {
        throw new Error(
            '--rest-base-spec and --rest-new-spec must be given together',
        );
    }
    if (restFromTag && restBaseSpec) {
        throw new Error(
            '--rest-from-tag cannot be combined with --rest-base-spec/--rest-new-spec',
        );
    }
    if (restFromTag && restFromRefs) {
        throw new Error(
            '--rest-from-tag cannot be combined with --rest-from-refs',
        );
    }
    if (Boolean(mcpBaseSnapshot) !== Boolean(mcpNewSnapshot)) {
        throw new Error(
            '--mcp-base-snapshot and --mcp-new-snapshot must be given together',
        );
    }
    return {
        version,
        previousVersion,
        lastTag: get('last-tag') || previousVersion,
        toRef: get('to-ref') || 'HEAD',
        releaseDate: get('release-date') || null,
        out: get('out') || 'release-safety.json',
        index: get('index') || 'release-safety-index.json',
        overrides: get('overrides') || DEFAULT_OVERRIDES_PATH,
        restBaseSpec,
        restNewSpec,
        restFromTag,
        restFromRefs,
        backfilled: argv.includes('--backfilled'),
        mcpBaseSnapshot,
        mcpNewSnapshot,
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

function isResolvableGitRef(ref: string): boolean {
    try {
        execFileSync(
            'git',
            ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
            {
                stdio: 'ignore',
            },
        );
        return true;
    } catch {
        return false;
    }
}

/** IO: write JSON atomically (temp file + rename) so a crash never leaves a partial. */
function writeAtomic(outPath: string, contents: string): void {
    const dir = path.dirname(path.resolve(outPath));
    const tmp = path.join(dir, `.release-safety.${process.pid}.tmp`);
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, outPath);
}

export async function generateReleaseSafety(
    argv: string[],
    suppliedOverrides?: UpgradeOverridesFile | null,
): Promise<ReleaseSafetyMarker> {
    const args = parseArgs(argv);
    const overrides =
        suppliedOverrides === undefined
            ? loadUpgradeOverrides(args.overrides)
            : suppliedOverrides;
    // Kill-switch: the marker is dark-launched. Unless RELEASE_SAFETY_MARKER_ENABLED
    // is "true", the generator still computes + prints the marker to stdout but
    // does NOT write the output file (so no GitHub release asset is published) and
    // skips the paid AI review (so a dark release spends nothing). The PR preview
    // workflow sets it true to write its throwaway temp file.
    const markerEnabled = process.env.RELEASE_SAFETY_MARKER_ENABLED === 'true';
    const wantAiReview = argv.includes('--ai-review');

    let migrations: MigrationsResult | null = null;
    let migrationPaths: string[] = [];
    let declarations = { added: [], diagnostics: [] } as ReturnType<
        typeof collectBreakingChangeDeclarationsBetweenRefs
    >;
    if (args.lastTag) {
        const range = `${args.lastTag}..${args.toRef}`;
        const unresolvableRefs = [args.lastTag, args.toRef].filter(
            (ref) => !isResolvableGitRef(ref),
        );
        if (unresolvableRefs.length > 0) {
            console.warn(
                `[release-safety] WARNING: cannot resolve migration diff ref(s) ${unresolvableRefs.join(', ')}; emitting migrations.present="unknown"`,
            );
        } else {
            const changes = gitNameStatus(range, MIGRATION_DIRS);
            declarations = collectBreakingChangeDeclarationsBetweenRefs(
                args.lastTag,
                args.toRef,
            );
            migrations = detectMigrations(changes);
            migrationPaths = changes
                .filter(
                    (change) =>
                        change.status.startsWith('A') &&
                        isMigrationPath(change.path),
                )
                .map((change) => change.path)
                .sort();
            if (migrations.deletedHistorical.length > 0) {
                console.warn(
                    `[release-safety] WARNING: historical migrations deleted in ${range}: ` +
                        migrations.deletedHistorical.join(', '),
                );
            }
        }
    } else {
        console.warn(
            '[release-safety] no previous tag/version; emitting migrations.present="unknown"',
        );
    }

    const migrationMetadata = readMigrationMetadata({
        paths: migrationPaths,
        ref: args.toRef,
        log: (message) =>
            console.warn(`[release-safety-migrations] ${message}`),
    });
    for (const diagnostic of declarations.diagnostics) {
        console.warn(
            `[release-safety-declarations] ${diagnostic.file}:${diagnostic.line} ${diagnostic.message}`,
        );
    }

    const config = args.lastTag
        ? diffConfigBetweenRefs({
              fromRef: args.lastTag,
              toRef: args.toRef,
              log: (message) =>
                  console.warn(`[release-safety-config] ${message}`),
          })
        : { checked: false, breaking: 'unknown' as const, changes: [] };

    // Deterministic SQL-shape linter — the always-on floor. Runs (no flag, no
    // key) whenever the cheap detector found migrations. Its "breaking" is a
    // baseline, NOT the last word: the AI review below can clear a flagged
    // drop/rename when it verifies the previous release no longer uses the object.
    let sqlLint: SqlLintSummary | null = null;
    let lintFindings: SqlLintFinding[] = [];
    if (migrations?.present === true && args.lastTag) {
        const r = lintMigrations({
            lastTag: args.lastTag,
            newRef: args.toRef,
            log: (m) => console.warn(`[sql-lint] ${m}`),
        });
        lintFindings = r.findings;
        sqlLint = {
            ran: r.ran,
            breaking: r.breaking,
            findings: renderFindings(r.findings),
        };
        console.warn(
            `[release-safety] SQL linter: ${r.breaking ? `BREAKING (${r.findings.length} finding(s))` : 'no breaking shapes found'}`,
        );
    }

    // P2: deterministic REST API breaking-change diff (oasdiff). Runs when the
    // caller named both sides of the comparison and oasdiff is available
    // (OASDIFF_BIN or PATH); the CI workflows install it. Soft fail-safe: any
    // problem leaves api.rest unchecked and never fails the release. Runs BEFORE
    // the AI review so a flagged break can be handed to the reviewer to validate
    // (does the in-flight frontend break?).
    //
    // Which specs to diff is the CALLER's decision, never an inference, because
    // the committed spec means different things at different call sites. At
    // RELEASE time it is genuine — the release job regenerates it before this runs
    // — so --rest-from-tag takes the old side from the previous tag and the new
    // side from the working tree. On a PR it is a release-time artifact no feature
    // branch can touch (.husky/pre-commit unstages it), identical on both sides of
    // the diff, so the caller hands over two freshly generated specs instead.
    // Neither flag means the REST surface is not checked at all: silence is the
    // honest answer, where diffing the stale spec against itself would have
    // reported "no breaking changes" for a break nothing looked for.
    let restApi: ApiSurface | null = null;
    if (args.restBaseSpec && args.restNewSpec) {
        restApi = diffRestApi({
            baseSpecPath: args.restBaseSpec,
            newSpecPath: args.restNewSpec,
            log: (m) => console.warn(`[rest-api-diff] ${m}`),
        });
    } else if (args.restFromTag && args.lastTag) {
        restApi = diffRestApi({
            lastTag: args.lastTag,
            newSpecPath: SPEC_PATH,
            log: (m) => console.warn(`[rest-api-diff] ${m}`),
        });
    } else if (args.restFromTag) {
        console.warn(
            '[release-safety] --rest-from-tag needs a previous tag; api.rest stays unchecked',
        );
    } else if (args.restFromRefs && args.lastTag) {
        restApi = diffRestApi({
            lastTag: args.lastTag,
            newRef: args.toRef,
            log: (m) => console.warn(`[rest-api-diff] ${m}`),
        });
    } else if (args.restFromRefs) {
        console.warn(
            '[release-safety] --rest-from-refs needs a previous tag; api.rest stays unchecked',
        );
    } else {
        console.warn(
            '[release-safety] no REST spec source given; api.rest stays unchecked',
        );
    }

    // P3: deterministic MCP tool-surface diff (committed snapshot between tags).
    // Auto-runs when a previous tag exists; soft fail-safe (snapshot absent at a
    // ref → api.mcp unchecked), never fails the release.
    let mcpApi: ApiSurface | null = null;
    if (args.mcpBaseSnapshot && args.mcpNewSnapshot) {
        mcpApi = diffMcpTools({
            baseSnapshotPath: args.mcpBaseSnapshot,
            newSnapshotPath: args.mcpNewSnapshot,
            log: (m) => console.warn(`[mcp-tools-diff] ${m}`),
        });
    } else if (args.lastTag) {
        mcpApi = diffMcpTools({
            lastTag: args.lastTag,
            newRef: args.toRef,
            log: (m) => console.warn(`[mcp-tools-diff] ${m}`),
        });
    } else {
        console.warn(
            '[release-safety] no MCP snapshot source given; api.mcp stays unchecked',
        );
    }

    // P6: gated AI rolling-update review — the VALIDATION layer over the
    // deterministic detectors. Runs when a key is present AND something was flagged
    // worth validating: a migration is not deterministically proven safe, OR a
    // REST/MCP break was flagged (it decides whether an in-flight frontend/client
    // actually breaks). It is fed the deterministic breaking lists so it validates
    // exactly what the detectors found. Any degrade leaves the verdict at the linter
    // floor /
    // cautious default and never fails the release.
    const restBreakingChanges =
        restApi?.checked && restApi.breaking === true ? restApi.changes : [];
    const mcpBreakingChanges =
        mcpApi?.checked && mcpApi.breaking === true ? mcpApi.changes : [];
    const reviewable = isAiReviewEligible({
        migrations,
        migrationOperations: migrationMetadata.operations,
        migrationMetadataComplete: migrationMetadata.complete,
        declarationMetadataComplete: declarations.diagnostics.length === 0,
        declaredBreaks: declarations.added,
        config,
        restApi,
        mcpApi,
        sqlLint,
    });
    let aiReview: AiReviewSummary | null = null;
    if (wantAiReview && markerEnabled && reviewable && args.lastTag) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn(
                '[release-safety] --ai-review requested but ANTHROPIC_API_KEY not set; rollingUpdateSafe stays "unknown"',
            );
        } else {
            console.warn(
                '[release-safety] running AI rolling-update review...',
            );
            const r = await aiRollingUpdateReview({
                apiKey,
                lastTag: args.lastTag,
                version: args.version,
                newRef: args.toRef,
                // Hand the AI the deterministic linter's specific findings so it
                // validates exactly what the linter flagged (confirm or clear via
                // expand/contract), rather than re-deriving the shape from the files.
                sqlLintFindings: sqlLint?.breaking ? sqlLint.findings : [],
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
                console.warn(
                    '[release-safety] AI review degraded; rollingUpdateSafe stays "unknown"',
                );
            }
        }
    }

    // Expand-version tracing: when the AI cleared a linter-flagged drop/rename as
    // the safe "contract" step, trace from git history the EARLIEST release the
    // app stopped referencing the object — a more permissive (but still provably
    // safe) upgrade floor than the conservative previousVersion. Best-effort;
    // null stays conservative.
    let expandContractFloor: string | null = null;
    if (
        sqlLint?.breaking &&
        aiReview?.rollingUpdateSafe === true &&
        args.lastTag
    ) {
        const objects = lintFindings
            .filter((f) =>
                [
                    'drop-column',
                    'rename-column',
                    'drop-table',
                    'rename-table',
                ].includes(f.rule),
            )
            .map((f) => f.object)
            .filter((o): o is string => Boolean(o));
        if (objects.length > 0) {
            expandContractFloor = findExpandFloor({
                objects,
                fromRef: args.lastTag,
                log: (m) => console.warn(`[expand-version] ${m}`),
            });
            if (expandContractFloor) {
                console.warn(
                    `[release-safety] expand version traced: minPreviousVersion -> ${expandContractFloor}`,
                );
            }
        }
    }

    // P4: human-authored upgrade-path overrides. A missing file is fine (mechanism
    // unused); a present-but-malformed file fails before this detector path runs.
    const upgrade = resolveUpgrade(overrides, args.version);
    // Forward-carried floor: the high-water mark of every floor / required stop
    // declared in any release at or before this one, so the marker is self-
    // sufficient for a version-skip (see buildMarker's carriedFloor fold).
    const carriedFloor = carriedUpgradeFloor(overrides, args.version);
    // Full list of required stops at/before this release, so a consumer can read
    // every mandatory waypoint from a single marker (see upgrade.requiredStops).
    const requiredStops = requiredStopsUpTo(overrides, args.version);

    const marker = buildMarker({
        version: args.version,
        previousVersion: args.previousVersion,
        releaseDate:
            args.releaseDate ??
            (args.backfilled
                ? execFileSync(
                      'git',
                      ['log', '-1', '--format=%cI', args.toRef],
                      { encoding: 'utf-8' },
                  ).trim()
                : new Date().toISOString()),
        migrations,
        migrationDetails: migrationMetadata.migrations,
        migrationOperations: migrationMetadata.operations,
        migrationMetadataComplete: migrationMetadata.complete,
        declarationMetadataComplete: declarations.diagnostics.length === 0,
        declaredBreaks: declarations.added,
        config,
        aiReview,
        sqlLint,
        expandContractFloor,
        restApi,
        mcpApi,
        upgrade,
        carriedFloor,
        requiredStops,
    });

    // Persist THIS release's own auto-derived expand/contract floor into the
    // committed overrides so EVERY future release carries it forward automatically
    // (carriedUpgradeFloor) — no maintainer action, and no need to re-run the AI on
    // historical releases. Same kill-switch as the asset: while dark we never touch
    // the repo. Write-if-absent, so a hand-authored floor always wins. The file is
    // committed by @semantic-release/git (see release.config.js); an unchanged file
    // (no new floor, or already recorded) is a no-op in that commit.
    const ownFloor = ownExpandContractFloor({
        migrations,
        sqlLint,
        aiReview,
        expandContractFloor,
        previousVersion: args.previousVersion,
    });
    if (markerEnabled && ownFloor) {
        const wrote = recordDerivedFloor(
            args.overrides,
            args.version,
            ownFloor,
        );
        console.warn(
            wrote
                ? `[release-safety] recorded upgrade floor in ${args.overrides}: ${args.version} -> minPreviousVersion ${ownFloor}`
                : `[release-safety] upgrade floor for ${args.version} already declared in ${args.overrides}; left as-is`,
        );
    }

    const json = `${JSON.stringify(marker, null, 2)}\n`;
    // Always print the marker (CI logs + the PR preview workflow read this); only
    // write the file — the thing that becomes the published release asset — when
    // the kill-switch is on.
    if (markerEnabled) {
        writeAtomic(args.out, json);
        console.log(`[release-safety] wrote ${args.out}`);
        if (isReleaseVersion(args.version)) {
            const currentIndex = loadReleaseSafetyIndex(args.index);
            const nextIndex = appendReleaseSafetyMarker({
                index: currentIndex,
                marker,
                backfilled: args.backfilled,
                backfillFloorVersion:
                    CONFIGURE_RELEASE_SAFETY_BACKFILL_FLOOR_VERSION,
            });
            writeReleaseSafetyIndex(args.index, nextIndex);
            console.log(`[release-safety] wrote ${args.index}`);
        } else {
            console.log(
                `[release-safety] synthetic version ${args.version}; not updating the cumulative index`,
            );
        }
    } else {
        console.log(
            `[release-safety] marker disabled (RELEASE_SAFETY_MARKER_ENABLED != "true"); not writing ${args.out}`,
        );
    }
    console.log(json);
    return marker;
}

// Only run the IO shell when executed directly (not when imported by tests).
const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('gen-release-safety.ts') === true;

if (invokedDirectly) {
    const argv = process.argv.slice(2);
    const overrides = loadUpgradeOverrides(parseArgs(argv).overrides);
    generateReleaseSafety(argv, overrides).catch((err) => {
        console.error(
            `[release-safety] FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
        const value = (name: string): string | undefined => {
            const index = argv.indexOf(`--${name}`);
            return index >= 0 ? argv[index + 1] : undefined;
        };
        const marker = buildMarker({
            version: value('version') ?? 'unknown',
            previousVersion: value('previous-version') ?? null,
            releaseDate: value('release-date') ?? new Date().toISOString(),
            migrations: null,
            migrationDetails: [],
            migrationMetadataComplete: false,
            declarationMetadataComplete: false,
            declaredBreaks: [],
            config: null,
            restApi: null,
            mcpApi: null,
        });
        const json = `${JSON.stringify(marker, null, 2)}\n`;
        if (process.env.RELEASE_SAFETY_MARKER_ENABLED === 'true') {
            try {
                writeAtomic(value('out') ?? 'release-safety.json', json);
            } catch (writeError) {
                console.error(
                    `[release-safety] fallback write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
                );
            }
        }
        console.log(json);
        process.exitCode = 1;
    });
}
