import {
    createPrivateKey,
    randomBytes,
    sign as signBytes,
} from 'node:crypto';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

function encodeJson(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseResponse(text, label) {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid ${label}: ${error.message}`);
    }
}

function validatePositiveInteger(value, label) {
    if (!/^[1-9][0-9]*$/.test(String(value || ''))) {
        throw new Error(`${label} must be a positive integer`);
    }
    return String(value);
}

function validateRepository(repository) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ''))) {
        throw new Error('GitHub repository must use the owner/repository format');
    }
    return repository;
}

function refPath(branch) {
    return branch.split('/').map(encodeURIComponent).join('/');
}

export class GithubApiError extends Error {
    constructor(status, body) {
        const detail = JSON.stringify(body).slice(0, 2000);
        super(`GitHub API error (${status}): ${detail}`);
        this.name = 'GithubApiError';
        this.status = status;
        this.body = body;
    }
}

export function decodeGithubPrivateKey(encoded) {
    let privateKey;
    try {
        privateKey = Buffer.from(String(encoded || ''), 'base64').toString('utf8');
        createPrivateKey(privateKey);
    } catch {
        throw new Error('GITHUB_APP_PRIVATE_KEY must be a base64-encoded PEM private key');
    }
    return privateKey;
}

export function createGithubAppJwt({ appId, privateKey, now = Date.now() }) {
    const issuer = validatePositiveInteger(appId, 'GITHUB_APP_ID');
    createPrivateKey(privateKey);
    const nowSeconds = Math.floor(now / 1000);
    const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
    const payload = encodeJson({
        iat: nowSeconds - 60,
        exp: nowSeconds + 9 * 60,
        iss: issuer,
    });
    const unsigned = `${header}.${payload}`;
    const signature = signBytes('RSA-SHA256', Buffer.from(unsigned), privateKey)
        .toString('base64url');
    return `${unsigned}.${signature}`;
}

export function createGithubAppClient({
    appId,
    installationId,
    privateKey,
    repository,
    fetchImpl = fetch,
    now = () => Date.now(),
}) {
    const normalizedAppId = validatePositiveInteger(appId, 'GITHUB_APP_ID');
    const normalizedInstallationId = validatePositiveInteger(
        installationId,
        'GITHUB_APP_INSTALLATION_ID',
    );
    const normalizedRepository = validateRepository(repository);
    createPrivateKey(privateKey);
    const [, repo] = normalizedRepository.split('/');
    let cachedToken = null;

    async function installationToken() {
        const currentTime = now();
        if (
            cachedToken &&
            cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > currentTime
        ) {
            return cachedToken.token;
        }

        const jwt = createGithubAppJwt({
            appId: normalizedAppId,
            privateKey,
            now: currentTime,
        });
        const response = await fetchImpl(
            `${GITHUB_API_URL}/app/installations/${normalizedInstallationId}/access_tokens`,
            {
                method: 'POST',
                signal: AbortSignal.timeout(30_000),
                headers: {
                    accept: 'application/vnd.github+json',
                    authorization: `Bearer ${jwt}`,
                    'content-type': 'application/json',
                    'x-github-api-version': '2022-11-28',
                },
                body: JSON.stringify({
                    repositories: [repo],
                    permissions: {
                        contents: 'write',
                        pull_requests: 'write',
                    },
                }),
            },
        );
        const body = parseResponse(
            await response.text(),
            'GitHub installation token response',
        );
        if (!response.ok) throw new GithubApiError(response.status, body);
        if (!body.token || !body.expires_at) {
            throw new Error('GitHub installation token response is missing token or expiry');
        }
        const expiresAt = Date.parse(body.expires_at);
        if (!Number.isFinite(expiresAt)) {
            throw new Error('GitHub installation token has an invalid expiry');
        }
        cachedToken = { token: body.token, expiresAt };
        return cachedToken.token;
    }

    async function request(path, options = {}, allowRetry = true) {
        const token = await installationToken();
        const response = await fetchImpl(
            path === '/graphql' ? GITHUB_GRAPHQL_URL : `${GITHUB_API_URL}${path}`,
            {
                ...options,
                signal: options.signal || AbortSignal.timeout(30_000),
                headers: {
                    accept: 'application/vnd.github+json',
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                    'x-github-api-version': '2022-11-28',
                    ...options.headers,
                },
                body:
                    options.body && typeof options.body !== 'string'
                        ? JSON.stringify(options.body)
                        : options.body,
            },
        );
        const body = parseResponse(await response.text(), 'GitHub response');
        if (response.status === 401 && allowRetry) {
            cachedToken = null;
            return request(path, options, false);
        }
        if (!response.ok) throw new GithubApiError(response.status, body);
        if (body.errors?.length) {
            throw new Error(`GitHub GraphQL error: ${JSON.stringify(body.errors).slice(0, 2000)}`);
        }
        return body.data ?? body;
    }

    return {
        installationToken,
        request,
        async validateRepositoryAccess() {
            const metadata = await request(`/repos/${normalizedRepository}`);
            if (
                String(metadata.full_name || '').toLowerCase() !==
                normalizedRepository.toLowerCase()
            ) {
                throw new Error(`GitHub App cannot access ${normalizedRepository}`);
            }
            return metadata;
        },
    };
}

export async function publishVerifiedCommit({
    client,
    repository,
    branch,
    baseCommit,
    headline,
    fileChanges,
    stagingLabel,
    onCleanupError = () => {},
}) {
    validateRepository(repository);
    if (!/^[0-9a-f]{40}$/i.test(baseCommit)) {
        throw new Error('Base commit must be a full Git SHA');
    }
    if (!fileChanges.additions.length && !fileChanges.deletions.length) {
        throw new Error('Cannot create a signed commit without file changes');
    }

    const safeLabel = String(stagingLabel || 'publish')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'publish';
    const stagingBranch = `linear/staging-${safeLabel}-${randomBytes(6).toString('hex')}`;
    const stagingRef = `refs/heads/${stagingBranch}`;
    let stagingCreated = false;

    try {
        await client.request(`/repos/${repository}/git/refs`, {
            method: 'POST',
            body: { ref: stagingRef, sha: baseCommit },
        });
        stagingCreated = true;

        const result = await client.request('/graphql', {
            method: 'POST',
            body: {
                query: `mutation($input: CreateCommitOnBranchInput!) {
                    createCommitOnBranch(input: $input) {
                        commit { oid url }
                    }
                }`,
                variables: {
                    input: {
                        branch: {
                            repositoryNameWithOwner: repository,
                            branchName: stagingBranch,
                        },
                        message: { headline },
                        expectedHeadOid: baseCommit,
                        fileChanges,
                    },
                },
            },
        });
        const commit = result.createCommitOnBranch?.commit;
        if (!commit?.oid || !commit?.url) {
            throw new Error('GitHub did not return the created commit');
        }

        const details = await client.request(
            `/repos/${repository}/commits/${commit.oid}`,
        );
        const verification = details.commit?.verification;
        if (!verification?.verified || verification.reason !== 'valid') {
            throw new Error(
                `GitHub did not verify the commit signature (${verification?.reason || 'unknown'})`,
            );
        }

        try {
            await client.request(
                `/repos/${repository}/git/ref/heads/${refPath(branch)}`,
            );
            await client.request(
                `/repos/${repository}/git/refs/heads/${refPath(branch)}`,
                {
                    method: 'PATCH',
                    body: { sha: commit.oid, force: true },
                },
            );
        } catch (error) {
            if (!(error instanceof GithubApiError) || error.status !== 404) {
                throw error;
            }
            await client.request(`/repos/${repository}/git/refs`, {
                method: 'POST',
                body: { ref: `refs/heads/${branch}`, sha: commit.oid },
            });
        }
        return commit;
    } finally {
        if (stagingCreated) {
            await client.request(
                `/repos/${repository}/git/refs/heads/${refPath(stagingBranch)}`,
                { method: 'DELETE' },
            ).catch(onCleanupError);
        }
    }
}
