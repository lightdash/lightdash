import { execa } from 'execa';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectGithubFileChanges } from './git-changes.ts';

test('converts added, modified, and deleted files', async () => {
	const repo = await mkdtemp(join(tmpdir(), 'linear-agent-git-changes-'));
	try {
		await execa('git', ['init', '-q', repo]);
		await writeFile(join(repo, 'modify.txt'), 'before');
		await writeFile(join(repo, 'delete.txt'), 'remove');
		await execa('git', ['-C', repo, 'add', '.']);
		await execa('git', [
			'-C',
			repo,
			'-c',
			'user.name=Test',
			'-c',
			'user.email=test@example.com',
			'commit',
			'-qm',
			'base',
		]);
		const base = (await execa('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout;

		await writeFile(join(repo, 'modify.txt'), 'after');
		await writeFile(join(repo, 'add.bin'), Buffer.from([0, 1, 2, 255]));
		await rm(join(repo, 'delete.txt'));
		await execa('git', ['-C', repo, 'add', '-A']);
		await execa('git', [
			'-C',
			repo,
			'-c',
			'user.name=Test',
			'-c',
			'user.email=test@example.com',
			'commit',
			'-qm',
			'change',
		]);
		const head = (await execa('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout;

		const changes = await collectGithubFileChanges(repo, base, head);
		assert.deepEqual(changes.deletions, [{ path: 'delete.txt' }]);
		assert.deepEqual(changes.additions.map(({ path }) => path).sort(), ['add.bin', 'modify.txt']);
		assert.equal(
			changes.additions.find(({ path }) => path === 'add.bin')?.contents,
			Buffer.from([0, 1, 2, 255]).toString('base64'),
		);
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});
