import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import {
	GithubApiError,
	createGithubAppClient,
	createGithubAppJwt,
	publishVerifiedCommit,
	type GithubAppClient,
} from './app.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
});
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

test('includes the GitHub response message in API errors', () => {
	const error = new GithubApiError(401, { message: 'Bad credentials' });
	assert.equal(error.message, 'GitHub API error (401): Bad credentials');
});

test('creates a valid GitHub App JWT', () => {
	const now = Date.parse('2026-08-14T12:00:00Z');
	const jwt = createGithubAppJwt({
		appId: '1234',
		privateKey: privateKeyPem,
		now,
	});
	const [header, payload, signature] = jwt.split('.') as [string, string, string];
	assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), {
		iat: Math.floor(now / 1000) - 60,
		exp: Math.floor(now / 1000) + 540,
		iss: '1234',
	});
	assert.equal(
		verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')),
		true,
	);
});

test('mints a repository-scoped installation token', async () => {
	const requests: Array<{ url: string; body?: string }> = [];
	const client = createGithubAppClient({
		appId: '1234',
		installationId: '5678',
		privateKey: privateKeyPem,
		repository: 'lightdash/lightdash',
		fetchImpl: async (input, options) => {
			const url = String(input);
			requests.push({
				url,
				body: typeof options?.body === 'string' ? options.body : undefined,
			});
			if (url.endsWith('/access_tokens')) {
				return Response.json({
					token: 'token',
					expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
				});
			}
			return Response.json({ full_name: 'lightdash/lightdash' });
		},
	});

	await client.validateRepositoryAccess();
	await client.validateRepositoryAccess();
	const tokenRequests = requests.filter(({ url }) => url.endsWith('/access_tokens'));
	assert.equal(tokenRequests.length, 1);
	assert.deepEqual(JSON.parse(tokenRequests[0]?.body ?? ''), {
		repositories: ['lightdash'],
		permissions: { contents: 'write', pull_requests: 'write' },
	});
});

test('verifies the commit before moving the PR branch', async () => {
	const calls: Array<{ path: string; method?: string }> = [];
	const client = {
		async request<T>(path: string, options?: RequestInit): Promise<T> {
			calls.push({ path, method: options?.method });
			if (path === '/graphql') {
				return {
					createCommitOnBranch: {
						commit: {
							oid: 'b'.repeat(40),
							url: 'https://github.com/commit',
						},
					},
				} as T;
			}
			if (path.includes('/commits/')) {
				return {
					commit: {
						verification: { verified: true, reason: 'valid' },
					},
				} as T;
			}
			return {} as T;
		},
		async validateRepositoryAccess() {},
	} as GithubAppClient;

	await publishVerifiedCommit({
		client,
		repository: 'lightdash/lightdash',
		branch: 'linear/prod-1-vm',
		baseCommit: 'a'.repeat(40),
		headline: 'fix: test publish',
		fileChanges: {
			additions: [{ path: 'file.txt', contents: 'aGk=' }],
			deletions: [],
		},
		stagingLabel: 'prod-1-vm',
	});

	const verifyIndex = calls.findIndex(({ path }) => path.includes('/commits/'));
	const moveIndex = calls.findIndex(
		({ path, method }) => path.includes('/git/refs/heads/linear/prod-1-vm') && method === 'PATCH',
	);
	assert.ok(verifyIndex >= 0 && moveIndex > verifyIndex);
	assert.equal(calls.at(-1)?.method, 'DELETE');
});

test('does not move an unverified commit', async () => {
	const calls: string[] = [];
	const client = {
		async request<T>(path: string): Promise<T> {
			calls.push(path);
			if (path === '/graphql') {
				return {
					createCommitOnBranch: {
						commit: {
							oid: 'b'.repeat(40),
							url: 'https://github.com/commit',
						},
					},
				} as T;
			}
			if (path.includes('/commits/')) {
				return {
					commit: {
						verification: { verified: false, reason: 'unsigned' },
					},
				} as T;
			}
			return {} as T;
		},
		async validateRepositoryAccess() {},
	} as GithubAppClient;

	await assert.rejects(
		publishVerifiedCommit({
			client,
			repository: 'lightdash/lightdash',
			branch: 'linear/prod-1-vm',
			baseCommit: 'a'.repeat(40),
			headline: 'fix: test publish',
			fileChanges: {
				additions: [{ path: 'file.txt', contents: 'aGk=' }],
				deletions: [],
			},
			stagingLabel: 'prod-1-vm',
		}),
		/did not verify/,
	);
	assert.equal(calls.some((path) => path.includes('/git/ref/heads/linear/prod-1-vm')), false);
});

test('creates the PR branch on first publish', async () => {
	const createdRefs: unknown[] = [];
	const client = {
		async request<T>(path: string, options?: { body?: unknown }): Promise<T> {
			if (path === '/graphql') {
				return {
					createCommitOnBranch: {
						commit: {
							oid: 'b'.repeat(40),
							url: 'https://github.com/commit',
						},
					},
				} as T;
			}
			if (path.includes('/commits/')) {
				return {
					commit: {
						verification: { verified: true, reason: 'valid' },
					},
				} as T;
			}
			if (path.includes('/git/ref/heads/linear/prod-1-vm')) {
				throw new GithubApiError(404, { message: 'Not Found' });
			}
			if (path.endsWith('/git/refs')) createdRefs.push(options?.body);
			return {} as T;
		},
		async validateRepositoryAccess() {},
	} as GithubAppClient;

	await publishVerifiedCommit({
		client,
		repository: 'lightdash/lightdash',
		branch: 'linear/prod-1-vm',
		baseCommit: 'a'.repeat(40),
		headline: 'fix: test publish',
		fileChanges: {
			additions: [{ path: 'file.txt', contents: 'aGk=' }],
			deletions: [],
		},
		stagingLabel: 'prod-1-vm',
	});

	assert.deepEqual(createdRefs.at(-1), {
		ref: 'refs/heads/linear/prod-1-vm',
		sha: 'b'.repeat(40),
	});
});
