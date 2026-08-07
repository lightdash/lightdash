/**
 * SPK-872 — emits the per-release migration-facts asset.
 *
 * At release time, selects the hand-authored facts (scripts/migration-facts.json)
 * for the migrations shipped in this release and writes `migration-facts.json`,
 * which @semantic-release/github attaches beside release-safety.json. The
 * upgrade preflight (scripts/preflight.ts, SPK-701) downloads one facts asset
 * per release in the upgrade range and merges them.
 *
 * Same kill-switch as the marker: writes nothing unless
 * RELEASE_SAFETY_MARKER_ENABLED=true. PURE core (migrationNamesFromChanges,
 * selectFactsForMigrations) + thin IO shell that FAILS LOUD — a facts entry
 * pointing at a nonexistent migration file aborts the release step rather than
 * shipping a typo.
 *
 * Run:
 *   npx tsx scripts/gen-migration-facts.ts --last-tag <tag> --out migration-facts.json [--all]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { compareVersions } from '@lightdash/common';
import { deriveMigrationFact } from './derive-migration-facts';
import { GitChange } from './gen-release-safety';
import { FactsFile, MigrationFact, parseFactsFile } from './preflight';

const CORE_MIGRATION_DIR = 'packages/backend/src/database/migrations';
const ENTERPRISE_MIGRATION_DIR = 'packages/backend/src/ee/database/migrations';
const MIGRATION_DIRS = [CORE_MIGRATION_DIR, ENTERPRISE_MIGRATION_DIR] as const;

const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;

export const DEFAULT_SOURCE = path.join(__dirname, 'migration-facts.json');

export function isMigrationPath(
    filePath: string,
    migrationDirs: readonly string[] = MIGRATION_DIRS,
): boolean {
    return (
        migrationDirs.includes(path.dirname(filePath)) &&
        MIGRATION_FILENAME_RE.test(path.basename(filePath))
    );
}

export function migrationNamesFromPaths(
    paths: string[],
    migrationDirs: readonly string[] = MIGRATION_DIRS,
): Set<string> {
    return new Set(
        paths
            .filter((filePath) => isMigrationPath(filePath, migrationDirs))
            .map((filePath) => path.basename(filePath).replace(/\.(ts|js)$/, '')),
    );
}

/** migration names (basename, no extension) ADDED in the range */
export function migrationNamesFromChanges(
    changes: GitChange[],
    migrationDirs: readonly string[] = MIGRATION_DIRS,
): Set<string> {
    return migrationNamesFromPaths(
        changes
            .filter((change) => change.status.startsWith('A'))
            .map((change) => change.path),
        migrationDirs,
    );
}

/**
 * Authored facts win: they carry backfill SQL and human judgement that
 * derivation deliberately does not attempt.
 */
export function mergeAuthoredAndDerivedFacts(
    authored: MigrationFact[],
    derived: MigrationFact[],
): MigrationFact[] {
    const authoredNames = new Set(authored.map((fact) => fact.migration));
    return [
        ...authored,
        ...derived.filter((fact) => !authoredNames.has(fact.migration)),
    ].sort((a, b) => a.migration.localeCompare(b.migration));
}

export function selectFactsForMigrations(
    facts: MigrationFact[],
    releaseMigrations: Set<string>,
): { selected: MigrationFact[]; withoutFacts: string[] } {
    const byName = new Map(facts.map((fact) => [fact.migration, fact]));
    const selected = [...releaseMigrations]
        .sort()
        .flatMap((name) => (byName.has(name) ? [byName.get(name) as MigrationFact] : []));
    const withoutFacts = [...releaseMigrations]
        .sort()
        .filter((name) => !byName.has(name));
    return { selected, withoutFacts };
}

export function buildFactsAsset(
    source: FactsFile,
    coreReleaseMigrations: Set<string>,
    enterpriseReleaseMigrations: Set<string>,
    includeAll: boolean,
    release: string | null,
    previousRelease: string | null,
    cumulativeThrough: string | null,
): FactsFile {
    const releaseMigrations = new Set([
        ...coreReleaseMigrations,
        ...enterpriseReleaseMigrations,
    ]);
    const { selected } = selectFactsForMigrations(
        source.migrationFacts,
        releaseMigrations,
    );
    const { withoutFacts: coreWithoutFacts } = selectFactsForMigrations(
        source.migrationFacts,
        coreReleaseMigrations,
    );
    const { withoutFacts: enterpriseWithoutFacts } = selectFactsForMigrations(
        source.migrationFacts,
        enterpriseReleaseMigrations,
    );
    return {
        schemaVersion: source.schemaVersion,
        release,
        previousRelease,
        cumulativeThrough,
        migrationsInRelease: coreReleaseMigrations.size,
        migrationsWithoutFacts: coreWithoutFacts,
        enterpriseMigrationsInRelease: enterpriseReleaseMigrations.size,
        enterpriseMigrationsWithoutFacts: enterpriseWithoutFacts,
        migrationFacts: includeAll || cumulativeThrough !== null
            ? [...source.migrationFacts].sort((a, b) =>
                  a.migration.localeCompare(b.migration),
              )
            : selected,
    };
}

export function gitNameStatus(range: string, dirs: readonly string[]): GitChange[] {
    const stdout = execFileSync(
        'git',
        ['diff', '--name-status', range, '--', ...dirs],
        { encoding: 'utf-8' },
    );
    const changes: GitChange[] = [];
    for (const line of stdout.split('\n')) {
        if (line.trim()) {
            const parts = line.split('\t');
            changes.push({ status: parts[0], path: parts[parts.length - 1] });
        }
    }
    return changes;
}

export function gitTreePaths(ref: string, dirs: readonly string[]): string[] {
    return execFileSync(
        'git',
        ['ls-tree', '-r', '--name-only', ref, '--', ...dirs],
        { encoding: 'utf-8' },
    )
        .split('\n')
        .filter((line) => line.length > 0);
}

const RELEASE_TAG_RE = /^\d+\.\d+\.\d+$/;

/**
 * The release a migration first shipped in, from the tags containing the commit
 * that added it. Filename timestamps do not track release order in this repo,
 * so they are never used. Returns null for a migration not yet in any release.
 */
export function introducedInFromGit(migrationPath: string): string | null {
    const addingCommit = execFileSync(
        'git',
        ['log', '--diff-filter=A', '--format=%H', '-1', '--', migrationPath],
        { encoding: 'utf-8' },
    ).trim();
    if (!addingCommit) return null;
    const tags = execFileSync(
        'git',
        ['tag', '--contains', addingCommit, '--list'],
        { encoding: 'utf-8' },
    )
        .split('\n')
        .map((tag) => tag.trim())
        .filter((tag) => RELEASE_TAG_RE.test(tag));
    return tags.sort(compareVersions)[0] ?? null;
}

export function deriveFactsForMigrations(
    migrationPaths: string[],
    pendingRelease: string | null,
    resolveIntroducedIn: (migrationPath: string) => string | null = introducedInFromGit,
): { facts: MigrationFact[]; unresolved: string[] } {
    const facts: MigrationFact[] = [];
    const unresolved: string[] = [];
    for (const migrationPath of migrationPaths) {
        const name = path.basename(migrationPath).replace(/\.(ts|js)$/, '');
        const introducedIn = resolveIntroducedIn(migrationPath) ?? pendingRelease;
        if (introducedIn === null) {
            unresolved.push(name);
            continue;
        }
        facts.push(
            deriveMigrationFact(
                fs.readFileSync(migrationPath, 'utf-8'),
                name,
                introducedIn,
            ),
        );
    }
    return { facts, unresolved };
}

export function assertFactsPointAtRealMigrations(
    facts: MigrationFact[],
    ref: string,
): void {
    for (const fact of facts) {
        const exists = MIGRATION_DIRS.some((dir) =>
            ['ts', 'js'].some((extension) => {
                try {
                    execFileSync(
                        'git',
                        ['cat-file', '-e', `${ref}:${dir}/${fact.migration}.${extension}`],
                        { stdio: 'ignore' },
                    );
                    return true;
                } catch {
                    return false;
                }
            }),
        );
        if (!exists) {
            throw new Error(
                `facts entry "${fact.migration}" does not match any migration file — typo, or the migration was removed`,
            );
        }
    }
}

function writeAtomic(outPath: string, contents: string): void {
    const dir = path.dirname(path.resolve(outPath));
    const tmp = path.join(dir, `.migration-facts.${process.pid}.tmp`);
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, outPath);
}

function main(): void {
    const argv = process.argv.slice(2);
    const get = (flag: string): string | null => {
        const i = argv.indexOf(flag);
        return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
    };
    const lastTag = get('--last-tag');
    const out = get('--out');
    const to = get('--to') ?? 'HEAD';
    const release = get('--release');
    const cumulativeThrough = get('--cumulative-through');
    if (!lastTag || !out) {
        throw new Error(
            'usage: gen-migration-facts.ts --last-tag <tag> --out <file> [--to <ref>] [--release <version>] [--cumulative-through <version>] [--source <facts file>] [--all]',
        );
    }
    if (process.env.RELEASE_SAFETY_MARKER_ENABLED !== 'true') {
        console.log(
            `[migration-facts] disabled (RELEASE_SAFETY_MARKER_ENABLED != "true"); not writing ${out}`,
        );
        return;
    }
    const source = get('--source') ?? DEFAULT_SOURCE;
    const factsFile = parseFactsFile(fs.readFileSync(source, 'utf-8'));
    assertFactsPointAtRealMigrations(factsFile.migrationFacts, 'HEAD');

    if (argv.includes('--derive')) {
        const authoredNames = new Set(
            factsFile.migrationFacts.map((fact) => fact.migration),
        );
        const undocumented = gitTreePaths(to, MIGRATION_DIRS).filter(
            (migrationPath) =>
                isMigrationPath(migrationPath) &&
                !authoredNames.has(
                    path.basename(migrationPath).replace(/\.(ts|js)$/, ''),
                ),
        );
        const { facts: derived, unresolved } = deriveFactsForMigrations(
            undocumented,
            cumulativeThrough ?? release,
        );
        for (const name of unresolved) {
            console.log(
                `[migration-facts] no release contains ${name} yet and no --release given; derived no fact for it`,
            );
        }
        factsFile.migrationFacts = mergeAuthoredAndDerivedFacts(
            factsFile.migrationFacts,
            derived,
        );
        console.log(
            `[migration-facts] derived ${derived.length} fact(s) for migrations with none authored; ${unresolved.length} could not be placed in a release`,
        );
    }

    const changes = cumulativeThrough
        ? null
        : gitNameStatus(`${lastTag}..${to}`, MIGRATION_DIRS);
    const paths = cumulativeThrough ? gitTreePaths(to, MIGRATION_DIRS) : null;
    const coreReleaseMigrations = cumulativeThrough
        ? migrationNamesFromPaths(paths ?? [], [CORE_MIGRATION_DIR])
        : migrationNamesFromChanges(changes ?? [], [CORE_MIGRATION_DIR]);
    const enterpriseReleaseMigrations = cumulativeThrough
        ? migrationNamesFromPaths(paths ?? [], [ENTERPRISE_MIGRATION_DIR])
        : migrationNamesFromChanges(changes ?? [], [ENTERPRISE_MIGRATION_DIR]);
    const includeAll = argv.includes('--all') || cumulativeThrough !== null;
    const output = buildFactsAsset(
        factsFile,
        coreReleaseMigrations,
        enterpriseReleaseMigrations,
        includeAll,
        cumulativeThrough ?? release,
        cumulativeThrough ? null : lastTag,
        cumulativeThrough,
    );
    for (const name of output.migrationsWithoutFacts ?? []) {
        console.log(`[migration-facts] no facts authored for ${name} (fine unless it backfills)`);
    }
    for (const name of output.enterpriseMigrationsWithoutFacts ?? []) {
        console.log(
            `[migration-facts] no facts authored for Enterprise migration ${name} (fine unless it backfills)`,
        );
    }

    const json = JSON.stringify(output, null, 4);
    parseFactsFile(json);
    writeAtomic(out, `${json}\n`);
    console.log(
        `[migration-facts] wrote ${out}: ${output.migrationFacts.length} fact(s) for ${coreReleaseMigrations.size} core and ${enterpriseReleaseMigrations.size} Enterprise migration(s) ${cumulativeThrough ? `cumulative through ${cumulativeThrough}` : `in ${lastTag}..${to}`}${includeAll ? ' (--all)' : ''}`,
    );
}

const isCliInvocation =
    require.main === module ||
    process.argv[1]?.endsWith('gen-migration-facts.ts') === true;

if (isCliInvocation) {
    try {
        main();
    } catch (err) {
        console.error(
            `[migration-facts] FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
    }
}
