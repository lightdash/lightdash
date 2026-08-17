import assert from 'node:assert/strict';
import {
    generateKeyPairSync,
    verify as verifySignature,
} from 'node:crypto';
import test from 'node:test';
import {
    GithubApiError,
    createGithubAppClient,
    createGithubAppJwt,
    decodeGithubPrivateKey,
    publishVerifiedCommit,
} from './github-app.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), { status });
}

test('creates a valid GitHub App JWT', () => {
    const now = Date.parse('2026-08-14T12:00:00Z');
    const jwt = createGithubAppJwt({
        appId: '1234',
        privateKey: privateKeyPem,
        now,
    });
    const [header, payload, signature] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {
        alg: 'RS256',
        typ: 'JWT',
    });
    assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
        iat: Math.floor(now / 1000) - 60,
        exp: Math.floor(now / 1000) + 540,
        iss: '1234',
    });
    assert.equal(
        verifySignature(
            'RSA-SHA256',
            Buffer.from(`${header}.${payload}`),
            publicKey,
            Buffer.from(signature, 'base64url'),
        ),
        true,
    );
});

test('decodes and validates the configured private key', () => {
    const encoded = Buffer.from(privateKeyPem).toString('base64');
    assert.equal(decodeGithubPrivateKey(encoded), privateKeyPem);
    assert.throws(() => decodeGithubPrivateKey('not-a-key'), /base64-encoded PEM/);
});

test('mints repository-scoped tokens and caches them until near expiry', async () => {
    const requests = [];
    let currentTime = Date.parse('2026-08-14T12:00:00Z');
    const fetchImpl = async (url, options) => {
        requests.push({ url, options });
        if (url.includes('/access_tokens')) {
            return jsonResponse(201, {
                token: `token-${requests.length}`,
                expires_at: new Date(currentTime + 60 * 60 * 1000).toISOString(),
            });
        }
        return jsonResponse(200, { full_name: 'lightdash/lightdash' });
    };
    const client = createGithubAppClient({
        appId: '1234',
        installationId: '5678',
        privateKey: privateKeyPem,
        repository: 'lightdash/lightdash',
        fetchImpl,
        now: () => currentTime,
    });

    await client.validateRepositoryAccess();
    await client.validateRepositoryAccess();
    assert.equal(requests.filter(({ url }) => url.includes('/access_tokens')).length, 1);
    const tokenRequest = requests.find(({ url }) => url.includes('/access_tokens'));
    assert.deepEqual(JSON.parse(tokenRequest.options.body), {
        repositories: ['lightdash'],
        permissions: { contents: 'write', pull_requests: 'write' },
    });

    currentTime += 56 * 60 * 1000;
    await client.validateRepositoryAccess();
    assert.equal(requests.filter(({ url }) => url.includes('/access_tokens')).length, 2);
});

test('rejects malformed GitHub App configuration', () => {
    assert.throws(
        () => createGithubAppClient({
            appId: 'app',
            installationId: '5678',
            privateKey: privateKeyPem,
            repository: 'lightdash/lightdash',
        }),
        /GITHUB_APP_ID/,
    );
    assert.throws(
        () => createGithubAppClient({
            appId: '1234',
            installationId: '5678',
            privateKey: privateKeyPem,
            repository: 'invalid',
        }),
        /owner\/repository/,
    );
});

test('publishes a verified commit before moving the existing PR branch', async () => {
    const calls = [];
    const client = {
        async request(path, options = {}) {
            calls.push({ path, options });
            if (path === '/graphql') {
                return {
                    createCommitOnBranch: {
                        commit: { oid: 'b'.repeat(40), url: 'https://github.com/commit' },
                    },
                };
            }
            if (path.endsWith(`/commits/${'b'.repeat(40)}`)) {
                return { commit: { verification: { verified: true, reason: 'valid' } } };
            }
            return { object: { sha: 'a'.repeat(40) } };
        },
    };
    const fileChanges = {
        additions: [{ path: 'file.txt', contents: 'aGVsbG8=' }],
        deletions: [{ path: 'old.txt' }],
    };
    const commit = await publishVerifiedCommit({
        client,
        repository: 'lightdash/lightdash',
        branch: 'linear/prod-1-abc123',
        baseCommit: 'a'.repeat(40),
        headline: 'chore(linear-agent): test signed commit',
        fileChanges,
        stagingLabel: 'job-1',
    });

    assert.equal(commit.oid, 'b'.repeat(40));
    const graphql = calls.find(({ path }) => path === '/graphql');
    assert.equal(
        graphql.options.body.variables.input.branch.repositoryNameWithOwner,
        'lightdash/lightdash',
    );
    assert.deepEqual(graphql.options.body.variables.input.fileChanges, fileChanges);
    const verificationIndex = calls.findIndex(({ path }) => path.includes('/commits/'));
    const moveIndex = calls.findIndex(
        ({ path, options }) => path.includes('/git/refs/heads/linear/prod-1-abc123') &&
            options.method === 'PATCH',
    );
    assert.ok(verificationIndex >= 0 && moveIndex > verificationIndex);
    assert.deepEqual(calls[moveIndex].options.body, {
        sha: 'b'.repeat(40),
        force: true,
    });
    assert.equal(calls.at(-1).options.method, 'DELETE');
    assert.match(calls.at(-1).path, /git\/refs\/heads\/linear\/staging-job-1-/);
});

test('does not move the PR branch when GitHub does not verify the commit', async () => {
    const calls = [];
    const client = {
        async request(path, options = {}) {
            calls.push({ path, options });
            if (path === '/graphql') {
                return {
                    createCommitOnBranch: {
                        commit: { oid: 'b'.repeat(40), url: 'https://github.com/commit' },
                    },
                };
            }
            if (path.includes('/commits/')) {
                return { commit: { verification: { verified: false, reason: 'unsigned' } } };
            }
            return {};
        },
    };

    await assert.rejects(
        publishVerifiedCommit({
            client,
            repository: 'lightdash/lightdash',
            branch: 'linear/prod-1-abc123',
            baseCommit: 'a'.repeat(40),
            headline: 'chore(linear-agent): test signed commit',
            fileChanges: {
                additions: [{ path: 'file.txt', contents: 'aGVsbG8=' }],
                deletions: [],
            },
            stagingLabel: 'job-1',
        }),
        /did not verify/,
    );
    assert.equal(
        calls.some(({ path }) => path.includes('/git/ref/heads/linear/prod-1-abc123')),
        false,
    );
    assert.equal(calls.at(-1).options.method, 'DELETE');
});

test('creates the PR branch when it does not exist', async () => {
    const calls = [];
    const client = {
        async request(path, options = {}) {
            calls.push({ path, options });
            if (path === '/graphql') {
                return {
                    createCommitOnBranch: {
                        commit: { oid: 'b'.repeat(40), url: 'https://github.com/commit' },
                    },
                };
            }
            if (path.includes('/commits/')) {
                return { commit: { verification: { verified: true, reason: 'valid' } } };
            }
            if (path.includes('/git/ref/heads/linear/prod-1-abc123')) {
                throw new GithubApiError(404, { message: 'Not Found' });
            }
            return {};
        },
    };

    await publishVerifiedCommit({
        client,
        repository: 'lightdash/lightdash',
        branch: 'linear/prod-1-abc123',
        baseCommit: 'a'.repeat(40),
        headline: 'chore(linear-agent): test signed commit',
        fileChanges: {
            additions: [{ path: 'file.txt', contents: 'aGVsbG8=' }],
            deletions: [],
        },
        stagingLabel: 'job-1',
    });
    assert.equal(
        calls.some(
            ({ path, options }) => path.endsWith('/git/refs') &&
                options.body?.ref === 'refs/heads/linear/prod-1-abc123',
        ),
        true,
    );
});
