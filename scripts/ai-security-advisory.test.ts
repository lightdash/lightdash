import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import {
    advisoryAlreadyExists,
    analyzeRelease,
    createEligibleDrafts,
    findingFingerprint,
    GitHubAdvisoryClient,
    isSafeRepoPath,
    renderAdvisoryDescription,
    SecurityFinding,
    validateAnalysisShape,
} from './ai-security-advisory';

function finding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
    return {
        title: 'Authorization check can be bypassed',
        confidence: 'high',
        severity: 'high',
        proposedCvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N',
        cweIds: ['CWE-862'],
        affectedProducts: ['server'],
        introducedVersion: null,
        primaryFixCommit: 'a'.repeat(40),
        relatedFixCommits: ['b'.repeat(40)],
        fixPullRequests: [123],
        summary: 'A missing authorization check could expose another project.',
        details: 'The old handler trusted a project identifier before the fix.',
        impact: 'An authenticated user could access data outside their project.',
        workaround: 'Restrict access to trusted users until upgrading.',
        remediation: 'Upgrade to the patched release.',
        evidence: [
            {
                path: 'packages/backend/src/example.ts',
                reason: 'The diff adds the missing project authorization check.',
            },
        ],
        existingAdvisoryMatch: null,
        ...overrides,
    };
}

async function run(): Promise<void> {
    assert.strictEqual(isSafeRepoPath('packages/backend/src/example.ts'), true);
    for (const unsafe of [
        '',
        '/etc/passwd',
        '../secret',
        'packages/../secret',
        '.git/config',
        'dir\\file',
    ]) {
        assert.strictEqual(isSafeRepoPath(unsafe), false, unsafe);
    }

    const parsed = validateAnalysisShape(
        {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [finding()],
        },
        { previousTag: '1.2.2', releaseTag: '1.2.3' },
    );
    assert.strictEqual(parsed.findings.length, 1);
    assert.strictEqual(
        validateAnalysisShape(
            {
                schemaVersion: 1,
                previousTag: '1.2.2',
                releaseTag: '1.2.3',
                findings: [finding({ title: 'Unsafe\n<!channel>' })],
            },
            { previousTag: '1.2.2', releaseTag: '1.2.3' },
        ).findings[0].title,
        'Unsafe <!channel>',
    );
    assert.throws(
        () =>
            validateAnalysisShape(
                {
                    schemaVersion: 1,
                    previousTag: '1.2.2',
                    releaseTag: '1.2.3',
                    findings: [finding({ cweIds: ['not-a-cwe'] })],
                },
                { previousTag: '1.2.2', releaseTag: '1.2.3' },
            ),
        /CWE/,
    );
    assert.throws(
        () =>
            validateAnalysisShape(
                {
                    schemaVersion: 1,
                    previousTag: '1.2.2',
                    releaseTag: '1.2.3',
                    findings: [
                        finding({
                            evidence: [{ path: '../secret', reason: 'bad' }],
                        }),
                    ],
                },
                { previousTag: '1.2.2', releaseTag: '1.2.3' },
            ),
        /evidence path/,
    );

    const reordered = finding({
        cweIds: ['CWE-862', 'CWE-639'],
        affectedProducts: ['server', 'cli'],
    });
    const reorderedCopy = finding({
        cweIds: ['CWE-639', 'CWE-862'],
        affectedProducts: ['cli', 'server'],
    });
    assert.strictEqual(
        findingFingerprint(reordered, '1.2.3'),
        findingFingerprint(reorderedCopy, '1.2.3'),
    );

    const description = renderAdvisoryDescription({
        finding: finding(),
        repository: 'lightdash/lightdash',
        releaseTag: '1.2.3',
        releaseUrl: 'https://github.com/lightdash/lightdash/releases/tag/1.2.3',
        dockerDigest: null,
    });
    assert.match(description, /^## Summary/);
    assert.doesNotMatch(description, /unverified AI-generated private draft/);
    assert.match(description, /conservatively proposes `< 1\.2\.3`/);
    assert.match(description, /fingerprint=[0-9a-f]{64}/);
    assert.doesNotMatch(description, /state.*published/i);

    const duplicate = {
        ghsa_id: 'GHSA-r263-56q3-8v3v',
        html_url:
            'https://github.com/lightdash/lightdash/security/advisories/GHSA-r263-56q3-8v3v',
        description,
    };
    assert.strictEqual(
        advisoryAlreadyExists(
            finding(),
            '1.2.3',
            [duplicate],
            'lightdash/lightdash',
        )?.ghsa_id,
        duplicate.ghsa_id,
    );

    const createdPayloads: string[] = [];
    const drafts = await createEligibleDrafts({
        analysis: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [finding(), finding({ confidence: 'low', title: 'Low' })],
        },
        repository: 'lightdash/lightdash',
        releaseUrl: 'https://github.com/lightdash/lightdash/releases/tag/1.2.3',
        dockerDigest: `sha256:${'c'.repeat(64)}`,
        existing: [],
        create: async (_candidate, rendered) => {
            createdPayloads.push(rendered);
            return {
                ghsa_id: 'GHSA-r263-56q3-8v3v',
                html_url:
                    'https://github.com/lightdash/lightdash/security/advisories/GHSA-r263-56q3-8v3v',
                description: rendered,
            };
        },
    });
    assert.strictEqual(drafts.length, 1);
    assert.strictEqual(createdPayloads.length, 1);

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = async (
        input: string | URL | Request,
        init?: RequestInit,
    ) => {
        const url = String(input);
        requests.push({ url, init });
        if (init?.method === 'POST') {
            return new Response(
                JSON.stringify({
                    ghsa_id: 'GHSA-r263-56q3-8v3v',
                    html_url:
                        'https://github.com/lightdash/lightdash/security/advisories/GHSA-r263-56q3-8v3v',
                    description: 'draft',
                }),
                { status: 201 },
            );
        }
        return new Response('[]', { status: 200 });
    };
    const client = new GitHubAdvisoryClient(
        'lightdash/lightdash',
        'test-token',
        mockFetch as typeof fetch,
    );
    assert.deepStrictEqual(await client.listAll(), []);
    await client.createDraft({
        finding: finding(),
        releaseTag: '1.2.3',
        description,
    });
    assert.strictEqual(
        requests.filter((request) => request.init?.method === 'POST').length,
        1,
    );
    const createBody = JSON.parse(
        String(
            requests.find((request) => request.init?.method === 'POST')?.init
                ?.body,
        ),
    );
    assert.strictEqual(createBody.state, undefined);
    assert.strictEqual(createBody.cve_id, undefined);
    assert.deepStrictEqual(createBody.vulnerabilities[0], {
        package: { ecosystem: 'other', name: 'lightdash/lightdash' },
        vulnerable_version_range: '< 1.2.3',
        patched_versions: '1.2.3',
    });

    const stableTags = execFileSync(
        'git',
        ['tag', '--list', '--sort=-version:refname'],
        { encoding: 'utf8' },
    )
        .split('\n')
        .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag));
    assert.ok(stableTags.length >= 2, 'test requires two stable release tags');
    const toolCallResponse = new Response(
        JSON.stringify({
            stop_reason: 'tool_use',
            content: [
                {
                    type: 'tool_use',
                    id: 'tool-1',
                    name: 'list_changed_files',
                    input: {},
                },
            ],
        }),
        { status: 200 },
    );
    await assert.rejects(
        analyzeRelease({
            apiKey: 'test',
            previousTag: stableTags[1],
            releaseTag: stableTags[0],
            maxToolCalls: 0,
            fetchImpl: async () => toolCallResponse,
        }),
        /tool budget/,
    );
    await assert.rejects(
        analyzeRelease({
            apiKey: 'test',
            previousTag: stableTags[1],
            releaseTag: stableTags[0],
            fetchImpl: async () => new Response('{}', { status: 500 }),
        }),
        /HTTP 500/,
    );
    await assert.rejects(
        analyzeRelease({
            apiKey: 'test',
            previousTag: stableTags[1],
            releaseTag: stableTags[0],
            fetchImpl: async () =>
                new Response(
                    JSON.stringify({
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: 'not json' }],
                    }),
                    { status: 200 },
                ),
        }),
        /JSON/,
    );

    const workflow = fs.readFileSync(
        '.github/workflows/ai-security-advisories.yml',
        'utf8',
    );
    assert.match(workflow, /types: \[published\]/);
    assert.match(workflow, /default: false/);
    assert.match(workflow, /permissions:\n\s+contents: read/);
    assert.match(workflow, /secrets\.SECURITY_ADVISORY_TOKEN/);
    assert.match(workflow, /SECURITY_ALERTS_SLACK_WEBHOOK_URL/);
    assert.doesNotMatch(workflow, /create-github-app-token/);
    assert.doesNotMatch(workflow, /SECURITY_ADVISORY_APP_(ID|PRIVATE_KEY)/);
    assert.doesNotMatch(workflow, /security-advisories\/[^\s"']+\/cve/);
    assert.doesNotMatch(workflow, /state:\s*published/);

    const triageWorkflow = fs.readFileSync(
        '.github/workflows/security-advisory-triage-reminder.yml',
        'utf8',
    );
    assert.match(triageWorkflow, /cron: '0 10 \* \* \*'/);
    assert.match(triageWorkflow, /timezone: 'Europe\/Lisbon'/);
    assert.match(triageWorkflow, /state=triage/);
    assert.match(triageWorkflow, /secrets\.SECURITY_ADVISORY_TOKEN/);
    assert.match(triageWorkflow, /secrets\.SECURITY_ALERTS_SLACK_WEBHOOK_URL/);
    assert.match(triageWorkflow, /\.summary/);
    assert.match(triageWorkflow, /\.html_url/);
    assert.doesNotMatch(triageWorkflow, /state=(draft|published|closed)/);
    assert.doesNotMatch(triageWorkflow, /security-advisories\/[^\s"']+\/cve/);
}

run()
    .then(() => console.log('ai-security-advisory: all tests passed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
