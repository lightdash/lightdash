import { execa } from 'execa';
import type { GithubFileChanges } from './app.ts';

async function git(repo: string, args: string[]): Promise<string> {
	return (await execa('git', ['-C', repo, ...args])).stdout;
}

async function mode(repo: string, commit: string, path: string): Promise<string | undefined> {
	return (await git(repo, ['ls-tree', commit, '--', path])).match(/^([0-9]{6}) /)?.[1];
}

export async function collectGithubFileChanges(
	repo: string,
	baseCommit: string,
	headCommit: string,
): Promise<GithubFileChanges> {
	const output = await git(repo, ['diff', '--name-status', '--no-renames', '-z', baseCommit, headCommit, '--']);
	const fields = output.split('\0');
	if (fields.at(-1) === '') fields.pop();
	if (fields.length % 2 !== 0) throw new Error('Git returned malformed file changes');

	const changes: GithubFileChanges = { additions: [], deletions: [] };
	for (let index = 0; index < fields.length; index += 2) {
		const status = fields[index] as string;
		const path = fields[index + 1] as string;
		if (!['A', 'M', 'D'].includes(status)) {
			throw new Error(`GitHub API commits do not support status ${status}`);
		}
		if (status === 'D') {
			changes.deletions.push({ path });
			continue;
		}

		const headMode = await mode(repo, headCommit, path);
		const baseMode = status === 'M' ? await mode(repo, baseCommit, path) : undefined;
		if (!['100644', '100755'].includes(headMode ?? '')) {
			throw new Error(`GitHub API commits do not support file mode ${headMode ?? 'unknown'} for ${path}`);
		}
		if ((status === 'A' && headMode !== '100644') || (status === 'M' && headMode !== baseMode)) {
			throw new Error(`GitHub API commits do not support file mode changes for ${path}`);
		}

		const contents = await execa('git', ['-C', repo, 'show', `${headCommit}:${path}`], {
			encoding: 'buffer',
		});
		changes.additions.push({
			path,
			contents: Buffer.from(contents.stdout).toString('base64'),
		});
	}
	return changes;
}
