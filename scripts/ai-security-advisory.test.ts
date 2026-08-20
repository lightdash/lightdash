import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import {
    advisoryAlreadyExists,
    analyzeRelease,
    calculateCvss31BaseScore,
    createEligibleDrafts,
    extractJson,
    findingFingerprint,
    GitHubAdvisoryClient,
    isFindingEligibleForVerification,
    isSafeRepoPath,
    renderAdvisoryDescription,
    SecurityFinding,
    validateAnalysisShape,
    validateVerificationShape,
    VerificationResult,
    verifyReleaseFindings,
} from './ai-security-advisory';

function finding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
    return {
        title: 'Authorization check can be bypassed',
        confidence: 'high',
        disposition: 'exploitable',
        severity: 'high',
        proposedCvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N',
        cvssScore: 8.1,
        primaryCweId: 'CWE-862',
        cweIds: ['CWE-862'],
        affectedProducts: ['server'],
        introducedVersion: '1.0.0',
        primaryFixCommit: 'a'.repeat(40),
        relatedFixCommits: ['b'.repeat(40)],
        fixPullRequests: [123],
        summary: 'A missing authorization check could expose another project.',
        details: 'The old handler trusted a project identifier before the fix.',
        impact: 'An authenticated user could access data outside their project.',
        attackerControlledSource:
            'An authenticated user supplies another project identifier.',
        securityBoundary: 'The request crosses the project tenant boundary.',
        effectiveImpact:
            'The response exposes data belonging to another project.',
        existingControlsChecked: [
            {
                path: 'packages/backend/src/example.ts',
                reason: 'The old handler has no downstream project check.',
            },
        ],
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

function verification(
    findings: SecurityFinding[],
    verdict: VerificationResult['findings'][number]['verdict'] = 'confirmed_exploitable',
): VerificationResult {
    return {
        schemaVersion: 1,
        previousTag: '1.2.2',
        releaseTag: '1.2.3',
        findings: findings
            .filter(isFindingEligibleForVerification)
            .map((candidate) => ({
                fingerprint: findingFingerprint(candidate, '1.2.3'),
                verdict,
                rationale:
                    'The old code permits effective cross-project access.',
                evidence: candidate.existingControlsChecked,
            })),
    };
}

async function run(): Promise<void> {
    assert.strictEqual(
        calculateCvss31BaseScore(
            'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        ),
        9.8,
    );
    assert.strictEqual(
        calculateCvss31BaseScore(
            'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N',
        ),
        8.1,
    );
    assert.strictEqual(
        calculateCvss31BaseScore(
            'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N',
        ),
        6.4,
    );
    assert.throws(
        () =>
            calculateCvss31BaseScore(
                'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
            ),
        /Only CVSS v3\.1/,
    );
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

    assert.deepStrictEqual(
        extractJson(
            'The `${user}` interpolation is fixed.\n{"schemaVersion": 1, "findings": []}',
        ),
        { schemaVersion: 1, findings: [] },
    );
    assert.deepStrictEqual(
        extractJson('```json\n{"schemaVersion": 1}\n```\nNo findings remain.'),
        { schemaVersion: 1 },
    );
    assert.deepStrictEqual(
        extractJson('{"example": true} and the result:\n{"schemaVersion": 1}'),
        { schemaVersion: 1 },
    );
    assert.deepStrictEqual(
        extractJson('{"nested": {"value": "a \\"quoted { brace\\""}} trailing prose }'),
        { nested: { value: 'a "quoted { brace"' } },
    );
    assert.throws(() => extractJson('no json here {broken'), /did not return JSON/);
    assert.throws(() => extractJson('[1, 2, 3]'), /did not return JSON/);

    const parsed = validateAnalysisShape(
        {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [finding({ severity: 'low' })],
        },
        { previousTag: '1.2.2', releaseTag: '1.2.3' },
    );
    assert.strictEqual(parsed.findings.length, 1);
    assert.strictEqual(parsed.findings[0].cvssScore, 8.1);
    assert.strictEqual(parsed.findings[0].severity, 'high');
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
    for (const primaryCweId of ['CWE-200', 'CWE-284']) {
        assert.throws(
            () =>
                validateAnalysisShape(
                    {
                        schemaVersion: 1,
                        previousTag: '1.2.2',
                        releaseTag: '1.2.3',
                        findings: [
                            finding({
                                primaryCweId,
                                cweIds: [primaryCweId, 'CWE-862'],
                            }),
                        ],
                    },
                    { previousTag: '1.2.2', releaseTag: '1.2.3' },
                ),
            /Discouraged primary CWE/,
        );
    }
    assert.strictEqual(
        validateAnalysisShape(
            {
                schemaVersion: 1,
                previousTag: '1.2.2',
                releaseTag: '1.2.3',
                findings: [
                    finding({
                        primaryCweId: 'CWE-862',
                        cweIds: ['CWE-200', 'CWE-862'],
                    }),
                ],
            },
            { previousTag: '1.2.2', releaseTag: '1.2.3' },
        ).findings[0].primaryCweId,
        'CWE-862',
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
    assert.match(
        description,
        /Proposed affected range: `>= 1\.0\.0, < 1\.2\.3`/,
    );
    assert.match(description, /\(8\.1, high\)/);
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
    const manualDuplicate = {
        ...duplicate,
        description: `Fixed by https://github.com/lightdash/lightdash/commit/${finding().primaryFixCommit}`,
    };
    assert.strictEqual(
        advisoryAlreadyExists(
            finding({
                evidence: [{ path: 'different.ts', reason: 'Different' }],
            }),
            '1.2.3',
            [manualDuplicate],
            'lightdash/lightdash',
        )?.ghsa_id,
        manualDuplicate.ghsa_id,
    );
    assert.strictEqual(
        advisoryAlreadyExists(
            finding({
                evidence: [{ path: 'different.ts', reason: 'Different' }],
            }),
            '1.2.3',
            [duplicate],
            'lightdash/lightdash',
        ),
        null,
    );

    const eligibleFinding = finding();
    const lowFinding = finding({ confidence: 'low', title: 'Low' });
    const createdPayloads: string[] = [];
    const drafts = await createEligibleDrafts({
        analysis: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [eligibleFinding, lowFinding],
        },
        verification: verification([eligibleFinding, lowFinding]),
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
    assert.match(
        createdPayloads[0],
        /Independent skeptical verification: \*\*confirmed_exploitable\*\*/,
    );

    const pr27518DefenseInDepth = finding({
        title: 'Out-of-organization space access row can be persisted',
        confidence: 'high',
        disposition: 'defense_in_depth',
        primaryCweId: 'CWE-862',
        cweIds: ['CWE-862'],
        fixPullRequests: [27518],
        details:
            'The write path accepted an out-of-organization user UUID before PR #27518.',
        impact: 'The row persists, but downstream controls prevent effective access and metadata disclosure.',
        attackerControlledSource:
            'A space administrator supplies an out-of-organization user UUID.',
        securityBoundary:
            'The claimed boundary is the target space project or organization.',
        effectiveImpact:
            'No confidentiality or integrity impact survives access resolution.',
        existingControlsChecked: [
            {
                path: 'packages/common/src/authorization/space/spaceAccessResolver.ts',
                reason: 'resolveSpaceAccess drops users without a project or organization role.',
            },
            {
                path: 'packages/backend/src/services/SpaceService/SpacePermissionService.ts',
                reason: 'CASL remains bound to the actual project or organization.',
            },
            {
                path: 'packages/backend/src/models/SpacePermissionModel.ts',
                reason: 'Raw direct access returns a null email for non-members.',
            },
        ],
    });
    const misclassifiedPr27518 = {
        ...pr27518DefenseInDepth,
        disposition: 'exploitable' as const,
    };
    const gatedFindings = [
        pr27518DefenseInDepth,
        finding({ confidence: 'medium', title: 'Medium confidence' }),
        finding({ introducedVersion: null, title: 'Unknown boundary' }),
        finding({
            proposedCvssVector: null,
            cvssScore: null,
            title: 'Unscored finding',
        }),
    ];
    let gatedCreateCount = 0;
    const gatedDrafts = await createEligibleDrafts({
        analysis: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: gatedFindings,
        },
        verification: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [
                {
                    fingerprint: findingFingerprint(
                        pr27518DefenseInDepth,
                        '1.2.3',
                    ),
                    verdict: 'confirmed_exploitable',
                    rationale:
                        'Incorrect verifier approval must not bypass gates.',
                    evidence: pr27518DefenseInDepth.existingControlsChecked,
                },
            ],
        },
        repository: 'lightdash/lightdash',
        releaseUrl: 'https://github.com/lightdash/lightdash/releases/tag/1.2.3',
        dockerDigest: null,
        existing: [],
        create: async () => {
            gatedCreateCount += 1;
            throw new Error('Ineligible finding reached draft creation');
        },
    });
    assert.deepStrictEqual(gatedDrafts, []);
    assert.strictEqual(gatedCreateCount, 0);

    const rejectedByVerifier = await createEligibleDrafts({
        analysis: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [misclassifiedPr27518],
        },
        verification: verification([misclassifiedPr27518], 'defense_in_depth'),
        repository: 'lightdash/lightdash',
        releaseUrl: 'https://github.com/lightdash/lightdash/releases/tag/1.2.3',
        dockerDigest: null,
        existing: [],
        create: async () => {
            throw new Error('Rejected verification reached draft creation');
        },
    });
    assert.deepStrictEqual(rejectedByVerifier, []);

    const firstSharedFinding = finding();
    const secondSharedFinding = finding({
        title: 'Session token remains valid after revocation',
        primaryCweId: 'CWE-613',
        cweIds: ['CWE-613'],
        evidence: [
            {
                path: 'packages/backend/src/session.ts',
                reason: 'The diff invalidates revoked sessions.',
            },
        ],
    });
    let sharedDraftCount = 0;
    const sharedFixDrafts = await createEligibleDrafts({
        analysis: {
            schemaVersion: 1,
            previousTag: '1.2.2',
            releaseTag: '1.2.3',
            findings: [firstSharedFinding, secondSharedFinding],
        },
        verification: verification([firstSharedFinding, secondSharedFinding]),
        repository: 'lightdash/lightdash',
        releaseUrl: 'https://github.com/lightdash/lightdash/releases/tag/1.2.3',
        dockerDigest: null,
        existing: [],
        create: async (_candidate, rendered) => {
            sharedDraftCount += 1;
            return {
                ghsa_id: `GHSA-shared-${sharedDraftCount}`,
                html_url: `https://github.com/lightdash/lightdash/security/advisories/GHSA-shared-${sharedDraftCount}`,
                description: rendered,
            };
        },
    });
    assert.strictEqual(sharedFixDrafts.length, 2);

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
        vulnerable_version_range: '>= 1.0.0, < 1.2.3',
        patched_versions: '1.2.3',
    });

    const paginatedRequests: string[] = [];
    const page = Array.from({ length: 100 }, (_, index) => ({
        ghsa_id: `GHSA-${index}`,
        html_url: `https://github.com/lightdash/lightdash/security/advisories/GHSA-${index}`,
        description: `advisory ${index}`,
    }));
    const paginatedClient = new GitHubAdvisoryClient(
        'lightdash/lightdash',
        'test-token',
        (async (input: string | URL | Request) => {
            const url = String(input);
            paginatedRequests.push(url);
            if (url.includes('state=triage') && !url.includes('after=')) {
                return new Response(JSON.stringify(page), {
                    status: 200,
                    headers: {
                        Link: '<https://api.github.com/repos/lightdash/lightdash/security-advisories?state=triage&per_page=100&after=next-cursor>; rel="next"',
                    },
                });
            }
            if (url.includes('after=next-cursor')) {
                return new Response(JSON.stringify([page[0]]), {
                    status: 200,
                });
            }
            return new Response('[]', { status: 200 });
        }) as typeof fetch,
    );
    assert.strictEqual((await paginatedClient.listAll()).length, 101);
    assert.strictEqual(paginatedRequests.length, 5);
    assert.ok(
        paginatedRequests.some((url) => url.includes('after=next-cursor')),
    );
    assert.ok(paginatedRequests.every((url) => !/[?&]page=/.test(url)));

    const verificationFingerprint = 'd'.repeat(64);
    assert.strictEqual(
        validateVerificationShape(
            {
                schemaVersion: 1,
                previousTag: '1.2.2',
                releaseTag: '1.2.3',
                findings: [
                    {
                        fingerprint: verificationFingerprint,
                        verdict: 'defense_in_depth',
                        rationale:
                            'An existing authorization check prevents access.',
                        evidence: [
                            {
                                path: 'package.json',
                                reason: 'The old code retains the relevant guard.',
                            },
                        ],
                    },
                ],
            },
            {
                previousTag: '1.2.2',
                releaseTag: '1.2.3',
                fingerprints: [verificationFingerprint],
            },
        ).findings[0].verdict,
        'defense_in_depth',
    );
    assert.throws(
        () =>
            validateVerificationShape(
                {
                    schemaVersion: 1,
                    previousTag: '1.2.2',
                    releaseTag: '1.2.3',
                    findings: [],
                },
                {
                    previousTag: '1.2.2',
                    releaseTag: '1.2.3',
                    fingerprints: [verificationFingerprint],
                },
            ),
        /missing candidate findings/,
    );

    const stableTags = execFileSync(
        'git',
        ['tag', '--list', '--sort=-version:refname'],
        { encoding: 'utf8' },
    )
        .split('\n')
        .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag));
    if (stableTags.length >= 2) {
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

        let parseRetryCalls = 0;
        let correctiveMessage = '';
        const retried = await analyzeRelease({
            apiKey: 'test',
            previousTag: stableTags[1],
            releaseTag: stableTags[0],
            fetchImpl: async (_input, init) => {
                parseRetryCalls += 1;
                if (parseRetryCalls === 2) {
                    const body = JSON.parse(String(init?.body));
                    correctiveMessage =
                        body.messages[body.messages.length - 1].content[0].text;
                }
                return new Response(
                    JSON.stringify({
                        stop_reason: 'end_turn',
                        content:
                            parseRetryCalls === 1
                                ? [
                                      {
                                          type: 'text',
                                          text: 'I found no issues in this release.',
                                      },
                                  ]
                                : [
                                      { type: 'text', text: 'Final result:' },
                                      {
                                          type: 'text',
                                          text: JSON.stringify({
                                              schemaVersion: 1,
                                              previousTag: stableTags[1],
                                              releaseTag: stableTags[0],
                                              findings: [],
                                          }),
                                      },
                                  ],
                    }),
                    { status: 200 },
                );
            },
        });
        assert.deepStrictEqual(retried.findings, []);
        assert.strictEqual(parseRetryCalls, 2);
        assert.match(correctiveMessage, /exactly one valid JSON object/);

        let validationRetryCalls = 0;
        let validationCorrectiveMessage = '';
        let analysisSystemPrompt = '';
        const validationRetried = await analyzeRelease({
            apiKey: 'test',
            previousTag: stableTags[1],
            releaseTag: stableTags[0],
            fetchImpl: async (_input, init) => {
                validationRetryCalls += 1;
                const body = JSON.parse(String(init?.body));
                analysisSystemPrompt = body.system[0].text;
                if (validationRetryCalls === 2) {
                    validationCorrectiveMessage =
                        body.messages[body.messages.length - 1].content[0].text;
                }
                return new Response(
                    JSON.stringify({
                        stop_reason: 'end_turn',
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    schemaVersion: 1,
                                    previousTag: stableTags[1],
                                    releaseTag: stableTags[0],
                                    findings:
                                        validationRetryCalls === 1
                                            ? [
                                                  finding({
                                                      proposedCvssVector:
                                                          'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N',
                                                  }),
                                              ]
                                            : [],
                                }),
                            },
                        ],
                    }),
                    { status: 200 },
                );
            },
        });
        assert.deepStrictEqual(validationRetried.findings, []);
        assert.strictEqual(validationRetryCalls, 2);
        assert.match(
            validationCorrectiveMessage,
            /CVSS vector has no security impact/,
        );
        assert.match(
            analysisSystemPrompt,
            /proposedCvssVector to null for defense_in_depth and uncertain/,
        );

        const verifierCandidate = finding({
            introducedVersion: stableTags[1],
            existingControlsChecked: [
                {
                    path: 'package.json',
                    reason: 'The verifier must inspect the old release.',
                },
            ],
        });
        const verifierFingerprint = findingFingerprint(
            verifierCandidate,
            stableTags[0],
        );
        let verifierSystemPrompt = '';
        let verifierCalls = 0;
        const verified = await verifyReleaseFindings({
            apiKey: 'test',
            analysis: {
                schemaVersion: 1,
                previousTag: stableTags[1],
                releaseTag: stableTags[0],
                findings: [verifierCandidate],
            },
            fetchImpl: async (_input, init) => {
                verifierCalls += 1;
                const body = JSON.parse(String(init?.body));
                verifierSystemPrompt = body.system[0].text;
                if (verifierCalls === 1) {
                    return new Response(
                        JSON.stringify({
                            stop_reason: 'tool_use',
                            content: [
                                {
                                    type: 'tool_use',
                                    id: 'verify-tool-1',
                                    name: 'read_old_file',
                                    input: { path: 'package.json' },
                                },
                            ],
                        }),
                        { status: 200 },
                    );
                }
                return new Response(
                    JSON.stringify({
                        stop_reason: 'end_turn',
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    schemaVersion: 1,
                                    previousTag: stableTags[1],
                                    releaseTag: stableTags[0],
                                    findings: [
                                        {
                                            fingerprint: verifierFingerprint,
                                            verdict: 'confirmed_exploitable',
                                            rationale:
                                                'The old code exposes another project after all checks.',
                                            evidence: [
                                                {
                                                    path: 'package.json',
                                                    reason: 'Old-release evidence was inspected.',
                                                },
                                            ],
                                        },
                                    ],
                                }),
                            },
                        ],
                    }),
                    { status: 200 },
                );
            },
        });
        assert.strictEqual(
            verified.findings[0].verdict,
            'confirmed_exploitable',
        );
        assert.match(verifierSystemPrompt, /independent skeptical reviewer/i);
        assert.match(verifierSystemPrompt, /Persisted invalid state is not/);
        assert.strictEqual(verifierCalls, 2);
    }

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
