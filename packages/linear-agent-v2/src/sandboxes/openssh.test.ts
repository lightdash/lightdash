import assert from 'node:assert/strict';
import test from 'node:test';
import { gitSshCommand, sshArgs } from './openssh.ts';

test('uses only the configured SSH key', () => {
	const args = sshArgs('/tmp/exe key', 'sandbox.exe.xyz', ['git', 'status']);
	assert.deepEqual(args, [
		'-i',
		'/tmp/exe key',
		'-o',
		'IdentitiesOnly=yes',
		'-o',
		'IdentityAgent=none',
		'-o',
		'StrictHostKeyChecking=accept-new',
		'-o',
		'BatchMode=yes',
		'exedev@sandbox.exe.xyz',
		"'git' 'status'",
	]);
	assert.match(gitSshCommand('/tmp/exe key'), /IdentitiesOnly=yes.*IdentityAgent=none/);
});
