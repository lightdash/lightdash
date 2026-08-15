import { createPrivateKey, randomBytes, sign } from 'node:crypto';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface GithubRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
	headers?: Record<string, string>;
	body?: unknown;
}

export interface GithubAppClient {
	request<T>(path: string, options?: GithubRequestOptions): Promise<T>;
	validateRepositoryAccess(): Promise<void>;
}

export interface GithubFileChanges {
	additions: Array<{ path: string; contents: string }>;
	deletions: Array<{ path: string }>;
}

interface GithubCommit {
	oid: string;
	url: string;
}

function encodeJson(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseResponse(text: string, label: string): unknown {
	if (!text) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : error}`);
	}
}

function positiveInteger(value: string, label: string): string {
	if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive integer`);
	return value;
}

function repositoryName(value: string): string {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error('GitHub repository must use owner/repository format');
	}
	return value;
}

function refPath(branch: string): string {
	return branch.split('/').map(encodeURIComponent).join('/');
}

export class GithubApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
	) {
		const detail =
			typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
				? `: ${body.message}`
				: '';
		super(`GitHub API error (${status})${detail}`);
		this.name = 'GithubApiError';
	}
}

export function decodeGithubPrivateKey(encoded: string): string {
	try {
		const privateKey = Buffer.from(encoded, 'base64').toString('utf8');
		createPrivateKey(privateKey);
		return privateKey;
	} catch {
		throw new Error('GITHUB_APP_PRIVATE_KEY must be a base64-encoded PEM private key');
	}
}

export function createGithubAppJwt(options: { appId: string; privateKey: string; now?: number }): string {
	const issuer = positiveInteger(options.appId, 'GITHUB_APP_ID');
	createPrivateKey(options.privateKey);
	const now = Math.floor((options.now ?? Date.now()) / 1000);
	const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
	const payload = encodeJson({
		iat: now - 60,
		exp: now + 9 * 60,
		iss: issuer,
	});
	const unsigned = `${header}.${payload}`;
	const signature = sign('RSA-SHA256', Buffer.from(unsigned), options.privateKey).toString('base64url');
	return `${unsigned}.${signature}`;
}

export function createGithubAppClient(options: {
	appId: string;
	installationId: string;
	privateKey: string;
	repository: string;
	fetchImpl?: typeof fetch;
	now?: () => number;
}): GithubAppClient {
	const appId = positiveInteger(options.appId, 'GITHUB_APP_ID');
	const installationId = positiveInteger(options.installationId, 'GITHUB_APP_INSTALLATION_ID');
	const repository = repositoryName(options.repository);
	const repo = repository.split('/')[1] as string;
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? Date.now;
	createPrivateKey(options.privateKey);
	let cachedToken: { token: string; expiresAt: number } | undefined;

	async function installationToken(): Promise<string> {
		const currentTime = now();
		if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > currentTime) {
			return cachedToken.token;
		}

		const response = await fetchImpl(`${GITHUB_API_URL}/app/installations/${installationId}/access_tokens`, {
			method: 'POST',
			signal: AbortSignal.timeout(30_000),
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${createGithubAppJwt({ appId, privateKey: options.privateKey, now: currentTime })}`,
				'content-type': 'application/json',
				'x-github-api-version': '2022-11-28',
			},
			body: JSON.stringify({
				repositories: [repo],
				permissions: { contents: 'write', pull_requests: 'write' },
			}),
		});
		const body = parseResponse(await response.text(), 'GitHub token response') as {
			token?: unknown;
			expires_at?: unknown;
		};
		if (!response.ok) throw new GithubApiError(response.status, body);
		if (typeof body.token !== 'string' || typeof body.expires_at !== 'string') {
			throw new Error('GitHub installation token response is incomplete');
		}
		const expiresAt = Date.parse(body.expires_at);
		if (!Number.isFinite(expiresAt)) throw new Error('GitHub installation token expiry is invalid');
		cachedToken = { token: body.token, expiresAt };
		return body.token;
	}

	async function request<T>(path: string, requestOptions: GithubRequestOptions = {}, allowRetry = true): Promise<T> {
		const token = await installationToken();
		const { body, headers, ...rest } = requestOptions;
		const response = await fetchImpl(path === '/graphql' ? GITHUB_GRAPHQL_URL : `${GITHUB_API_URL}${path}`, {
			...rest,
			signal: requestOptions.signal ?? AbortSignal.timeout(30_000),
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
				'x-github-api-version': '2022-11-28',
				...headers,
			},
			body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
		});
		const parsed = parseResponse(await response.text(), 'GitHub response') as {
			data?: T;
			errors?: unknown[];
		};
		if (response.status === 401 && allowRetry) {
			cachedToken = undefined;
			return request<T>(path, requestOptions, false);
		}
		if (!response.ok) throw new GithubApiError(response.status, parsed);
		if (parsed.errors?.length) {
			throw new Error(`GitHub GraphQL error: ${JSON.stringify(parsed.errors).slice(0, 2000)}`);
		}
		return (parsed.data ?? parsed) as T;
	}

	return {
		request,
		async validateRepositoryAccess(): Promise<void> {
			const metadata = await request<{ full_name?: unknown }>(`/repos/${repository}`);
			if (
				typeof metadata.full_name !== 'string' ||
				metadata.full_name.toLowerCase() !== repository.toLowerCase()
			) {
				throw new Error(`GitHub App cannot access ${repository}`);
			}
		},
	};
}

export async function publishVerifiedCommit(options: {
	client: GithubAppClient;
	repository: string;
	branch: string;
	baseCommit: string;
	headline: string;
	fileChanges: GithubFileChanges;
	stagingLabel: string;
}): Promise<GithubCommit> {
	const repository = repositoryName(options.repository);
	if (!/^[0-9a-f]{40}$/i.test(options.baseCommit)) {
		throw new Error('Base commit must be a full Git SHA');
	}
	if (!options.fileChanges.additions.length && !options.fileChanges.deletions.length) {
		throw new Error('Cannot create a signed commit without file changes');
	}

	const label =
		options.stagingLabel
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'publish';
	const stagingBranch = `linear/staging-${label}-${randomBytes(6).toString('hex')}`;
	let stagingCreated = false;

	try {
		await options.client.request(`/repos/${repository}/git/refs`, {
			method: 'POST',
			body: {
				ref: `refs/heads/${stagingBranch}`,
				sha: options.baseCommit,
			},
		});
		stagingCreated = true;

		const result = await options.client.request<{
			createCommitOnBranch?: { commit?: GithubCommit };
		}>('/graphql', {
			method: 'POST',
			body: {
				query: `mutation($input: CreateCommitOnBranchInput!) {
					createCommitOnBranch(input: $input) { commit { oid url } }
				}`,
				variables: {
					input: {
						branch: {
							repositoryNameWithOwner: repository,
							branchName: stagingBranch,
						},
						message: { headline: options.headline },
						expectedHeadOid: options.baseCommit,
						fileChanges: options.fileChanges,
					},
				},
			},
		});
		const commit = result.createCommitOnBranch?.commit;
		if (!commit?.oid || !commit.url) throw new Error('GitHub did not return the created commit');

		const details = await options.client.request<{
			commit?: { verification?: { verified?: boolean; reason?: string } };
		}>(`/repos/${repository}/commits/${commit.oid}`);
		const verification = details.commit?.verification;
		if (!verification?.verified || verification.reason !== 'valid') {
			throw new Error(`GitHub did not verify the commit signature (${verification?.reason ?? 'unknown'})`);
		}

		try {
			await options.client.request(`/repos/${repository}/git/ref/heads/${refPath(options.branch)}`);
			await options.client.request(`/repos/${repository}/git/refs/heads/${refPath(options.branch)}`, {
				method: 'PATCH',
				body: { sha: commit.oid, force: true },
			});
		} catch (error) {
			if (!(error instanceof GithubApiError) || error.status !== 404) throw error;
			await options.client.request(`/repos/${repository}/git/refs`, {
				method: 'POST',
				body: { ref: `refs/heads/${options.branch}`, sha: commit.oid },
			});
		}
		return commit;
	} finally {
		if (stagingCreated) {
			await options.client
				.request(`/repos/${repository}/git/refs/heads/${refPath(stagingBranch)}`, {
					method: 'DELETE',
				})
				.catch((error: unknown) => {
					console.error(
						'[github] staging branch cleanup failed:',
						error instanceof Error ? error.message : error,
					);
				});
		}
	}
}
