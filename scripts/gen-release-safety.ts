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
import { aiMigrationReview } from './ai-migration-review';
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

/**
 * PURE. Assemble the marker from already-gathered inputs. Encodes the honesty
 * rules: rollingUpdateSafe is never silently true/false for a migration-bearing
 * (or unknown) release.
 */
export function buildMarker(input: BuildMarkerInput): ReleaseSafetyMarker {
    const { version, previousVersion, releaseDate, migrations, aiReview, restApi } = input;

    const present: TriState = migrations ? migrations.present : 'unknown';

    let rollingUpdateSafe: TriState;
    let recommendedStrategy: ReleaseSafetyMarker['compatibility']['recommendedStrategy'];
    let notes: string;

    if (present === false) {
        // No schema migrations in this release. Safe with respect to the migration
        // check only — see blind-spot note.
        rollingUpdateSafe = true;
        recommendedStrategy = 'RollingUpdate';
        notes = `No database migrations detected in this release. ${BLIND_SPOT_NOTE}`;
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

    // P6: a gated AI review can resolve the "unknown" verdict for a
    // migration-bearing release. It only ever overrides when migrations are
    // present (never invents a verdict for a no-migration or first release).
    if (aiReview && present === true) {
        rollingUpdateSafe = aiReview.rollingUpdateSafe;
        recommendedStrategy = aiReview.recommendedStrategy;
        notes = `AI migration review: ${aiReview.summary} ${BLIND_SPOT_NOTE}`;
        capabilities.push('ai-review');
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
    if (input.upgrade && input.upgrade.consulted) {
        upgrade = {
            minPreviousVersion: input.upgrade.minPreviousVersion,
            requiredStop: input.upgrade.requiredStop,
            note: input.upgrade.note,
        };
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

    // P6: gated AI review. Only runs when the cheap detector found migrations
    // (so ~10% of releases) and a key is present. Any degrade leaves the verdict
    // at its honest "unknown" — the review can only ever make the marker more
    // informative, never falsely safe, and never fails the release.
    let aiReview: AiReviewSummary | null = null;
    if (wantAiReview && migrations?.present === true && args.lastTag) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn('[release-safety] --ai-review requested but ANTHROPIC_API_KEY not set; rollingUpdateSafe stays "unknown"');
        } else {
            console.warn('[release-safety] running AI migration review...');
            const r = await aiMigrationReview({
                apiKey,
                lastTag: args.lastTag,
                version: args.version,
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

    // P2: deterministic REST API breaking-change diff (oasdiff). Auto-runs when a
    // previous tag exists and oasdiff is available (OASDIFF_BIN or PATH); the CI
    // workflow installs it. Soft fail-safe: any problem leaves api.rest unchecked
    // and never fails the release.
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
        restApi,
        mcpApi,
        upgrade,
    });

    const json = `${JSON.stringify(marker, null, 2)}\n`;
    writeAtomic(args.out, json);
    console.log(`[release-safety] wrote ${args.out}`);
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
