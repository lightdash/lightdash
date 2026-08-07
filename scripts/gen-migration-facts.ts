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
import { GitChange } from './gen-release-safety';
import { FactsFile, MigrationFact, parseFactsFile } from './preflight';

const CORE_MIGRATION_DIR = 'packages/backend/src/database/migrations';
const ENTERPRISE_MIGRATION_DIR = 'packages/backend/src/ee/database/migrations';
const MIGRATION_DIRS = [CORE_MIGRATION_DIR, ENTERPRISE_MIGRATION_DIR] as const;

const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;

export const DEFAULT_SOURCE = path.join(__dirname, 'migration-facts.json');

/** migration names (basename, no extension) ADDED in the range */
export function migrationNamesFromChanges(
    changes: GitChange[],
    migrationDirs: readonly string[] = MIGRATION_DIRS,
): Set<string> {
    const names = new Set<string>();
    for (const change of changes) {
        if (
            change.status.startsWith('A') &&
            migrationDirs.includes(path.dirname(change.path))
        ) {
            const base = path.basename(change.path);
            if (MIGRATION_FILENAME_RE.test(base)) {
                names.add(base.replace(/\.(ts|js)$/, ''));
            }
        }
    }
    return names;
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
        migrationsInRelease: coreReleaseMigrations.size,
        migrationsWithoutFacts: coreWithoutFacts,
        enterpriseMigrationsInRelease: enterpriseReleaseMigrations.size,
        enterpriseMigrationsWithoutFacts: enterpriseWithoutFacts,
        migrationFacts: includeAll
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
    if (!lastTag || !out) {
        throw new Error(
            'usage: gen-migration-facts.ts --last-tag <tag> --out <file> [--to <ref>] [--release <version>] [--source <facts file>] [--all]',
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

    const changes = gitNameStatus(`${lastTag}..${to}`, MIGRATION_DIRS);
    const coreReleaseMigrations = migrationNamesFromChanges(changes, [CORE_MIGRATION_DIR]);
    const enterpriseReleaseMigrations = migrationNamesFromChanges(changes, [
        ENTERPRISE_MIGRATION_DIR,
    ]);
    const output = buildFactsAsset(
        factsFile,
        coreReleaseMigrations,
        enterpriseReleaseMigrations,
        argv.includes('--all'),
        release,
        lastTag,
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
        `[migration-facts] wrote ${out}: ${output.migrationFacts.length} fact(s) for ${coreReleaseMigrations.size} core and ${enterpriseReleaseMigrations.size} Enterprise migration(s) in ${lastTag}..${to}${argv.includes('--all') ? ' (--all)' : ''}`,
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
