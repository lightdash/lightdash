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
 *   npx tsx scripts/gen-migration-facts.ts --last-tag <tag> --out migration-facts.json
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GitChange } from './gen-release-safety';
import { FactsFile, MigrationFact, parseFactsFile } from './preflight';

const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
] as const;

const MIGRATION_FILENAME_RE = /^\d{14}_.+\.(ts|js)$/;

export const DEFAULT_SOURCE = path.join(__dirname, 'migration-facts.json');

/** migration names (basename, no extension) ADDED in the range */
export function migrationNamesFromChanges(changes: GitChange[]): Set<string> {
    const names = new Set<string>();
    for (const change of changes) {
        if (!change.status.startsWith('A')) continue;
        const base = path.basename(change.path);
        if (!MIGRATION_FILENAME_RE.test(base)) continue;
        names.add(base.replace(/\.(ts|js)$/, ''));
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
        changes.push({ status: parts[0], path: parts[parts.length - 1] });
    }
    return changes;
}

function assertFactsPointAtRealMigrations(facts: MigrationFact[]): void {
    for (const fact of facts) {
        const exists = MIGRATION_DIRS.some(
            (dir) =>
                fs.existsSync(path.join(dir, `${fact.migration}.ts`)) ||
                fs.existsSync(path.join(dir, `${fact.migration}.js`)),
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
    if (!lastTag || !out) {
        throw new Error(
            'usage: gen-migration-facts.ts --last-tag <tag> --out <file> [--source <facts file>]',
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
    assertFactsPointAtRealMigrations(factsFile.migrationFacts);

    const changes = gitNameStatus(`${lastTag}..HEAD`, MIGRATION_DIRS);
    const releaseMigrations = migrationNamesFromChanges(changes);
    const { selected, withoutFacts } = selectFactsForMigrations(
        factsFile.migrationFacts,
        releaseMigrations,
    );
    for (const name of withoutFacts) {
        console.log(`[migration-facts] no facts authored for ${name} (fine unless it backfills)`);
    }

    const output: FactsFile = {
        schemaVersion: factsFile.schemaVersion,
        migrationFacts: selected,
    };
    const json = JSON.stringify(output, null, 4);
    parseFactsFile(json);
    writeAtomic(out, `${json}\n`);
    console.log(
        `[migration-facts] wrote ${out}: ${selected.length} fact(s) for ${releaseMigrations.size} migration(s) in ${lastTag}..HEAD`,
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
