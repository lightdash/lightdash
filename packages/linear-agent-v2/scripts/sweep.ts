import { sweepLeakedVms, ttlMsFromEnv } from '../src/sandboxes/sweeper.ts';
import { isMain, loadAppEnv, runMain } from './lib/app.ts';

async function main(): Promise<void> {
	loadAppEnv();
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const ttlFlag = args.indexOf('--ttl-hours');
	const ttlMs =
		ttlFlag !== -1 && args[ttlFlag + 1] !== undefined
			? Number(args[ttlFlag + 1]) * 60 * 60 * 1000
			: ttlMsFromEnv();
	if (!Number.isFinite(ttlMs) || ttlMs < 0) {
		throw new Error('usage: sweep.ts [--ttl-hours N] [--dry-run]');
	}

	const report = await sweepLeakedVms({ ttlMs, dryRun });
	for (const kept of report.kept) console.error(`kept  ${kept.name} — ${kept.reason}`);
	for (const name of report.swept) console.log(`${dryRun ? 'would sweep' : 'swept'} ${name}`);
	if (report.swept.length === 0) console.error('nothing to sweep');
}

if (isMain(import.meta.url)) runMain(main);
