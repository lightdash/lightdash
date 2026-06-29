/**
 * Backtest the release-safety migration detector across the last N release tags.
 * Replays `detectMigrations` over each adjacent tag pair and reports the
 * distribution of clear-to-roll vs migration-bearing releases.
 *
 * This is the empirical ship-gate for PROD-8359: it answers "would the marker
 * just say 'unknown' on every release, or does it carry real signal?".
 *
 * Run: `npx tsx scripts/release-safety-backtest.ts [count]`   (default 200)
 */
import { execFileSync } from 'child_process';
import { detectMigrations, GitChange } from './gen-release-safety';

const MIGRATION_DIRS = [
    'packages/backend/src/database/migrations',
    'packages/backend/src/ee/database/migrations',
];

const count = Number(process.argv[2]) || 200;

function git(args: string[]): string {
    return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

const tags = git(['tag', '--sort=-creatordate'])
    .split('\n')
    .filter((t) => /^\d+\.\d+\.\d+$/.test(t))
    .slice(0, count + 1);

function tagDate(tag: string): string {
    // commit date of the tagged commit, ISO date only
    return git(['log', '-1', '--format=%cs', tag]);
}

let present = 0;
let absent = 0;
let totalMigs = 0;
let eeReleases = 0;
const withMigrations: string[] = [];

for (let i = 0; i < tags.length - 1; i += 1) {
    const cur = tags[i];
    const prev = tags[i + 1];
    const out = execFileSync(
        'git',
        ['diff', '--name-status', `${prev}..${cur}`, '--', ...MIGRATION_DIRS],
        { encoding: 'utf-8' },
    );
    const changes: GitChange[] = out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
            const p = l.split('\t');
            return { status: p[0], path: p[p.length - 1] };
        });
    const r = detectMigrations(changes);
    if (r.present) {
        present += 1;
        totalMigs += r.count;
        if (r.ee) eeReleases += 1;
        withMigrations.push(
            `  ${`${prev}..${cur}`.padEnd(20)} ${r.count} migration${r.count === 1 ? '' : 's'}${r.ee ? ' (incl. ee)' : ''}  [${r.files.join(', ')}]`,
        );
    } else {
        absent += 1;
    }
}

const n = present + absent;
const newest = tags[0];
const oldest = tags[n - 1];
const newestDate = tagDate(newest);
const oldestDate = tagDate(oldest);
const days =
    (Date.parse(newestDate) - Date.parse(oldestDate)) / (1000 * 60 * 60 * 24);

console.log(`\nRelease-safety backtest — last ${n} releases`);
console.log(
    `Range: ${oldest} (${oldestDate}) .. ${newest} (${newestDate})  ~${Math.round(days)} days, ${(n / Math.max(days, 1)).toFixed(1)} releases/day\n`,
);
console.log('Migration-bearing releases (marker => rollingUpdateSafe:"unknown", Recreate):');
console.log(withMigrations.length ? withMigrations.join('\n') : '  (none)');
console.log('');
console.log(
    `Summary: ${present} with migrations (${((present / n) * 100).toFixed(1)}%), ` +
        `${absent} clear-to-roll (${((absent / n) * 100).toFixed(1)}%), ` +
        `${totalMigs} migrations total, ${eeReleases} release(s) touched ee.`,
);
