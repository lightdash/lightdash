import { publishPullRequest } from '../src/github/publish.ts';
import { isMain, loadAppEnv, runMain } from './lib/app.ts';

async function main(): Promise<void> {
	loadAppEnv();
	const vm = process.argv[2];
	if (!vm) throw new Error('usage: publish-pr.ts <vm-name> [ssh-host]');
	const url = await publishPullRequest({
		vm,
		host: process.argv[3],
		previewUrl: process.env.PREVIEW_URL,
		issue: process.env.LINEAR_ISSUE,
	});
	console.log(`PR: ${url}`);
}

export { publishPullRequest };

if (isMain(import.meta.url)) runMain(main);
