import { type Mock } from 'vitest';
import {
    buildJiraIssueDescription,
    createReviewJiraIssue,
} from './createReviewJiraIssue';

type Deps = Parameters<typeof createReviewJiraIssue>[0];

const payload = {
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    fingerprints: ['fp-1'],
    reviewRunUuid: 'run-1',
};

const makeDeps = (overrides: Record<string, unknown> = {}) => {
    const createIssueForOrganization = vi.fn().mockResolvedValue({
        id: '100',
        key: 'DATA-42',
        url: 'https://acme.atlassian.net/browse/DATA-42',
    });
    const setLinkedIssueUrl = vi.fn().mockResolvedValue(undefined);
    return {
        siteUrl: 'https://app.example.com',
        model: {
            getJiraDestination: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                enabled: true,
                jiraProjectId: '10',
                jiraIssueTypeId: '1',
            }),
        },
        aiOrganizationSettingsModel: {
            findByOrganizationUuid: vi.fn().mockResolvedValue({
                aiAgentReviewsEnabled: true,
            }),
        },
        aiAgentReviewClassifierModel: {
            getReviewItem: vi.fn().mockResolvedValue({
                title: 'Broken metric',
                description: 'Count is wrong',
                primaryRootCause: 'semantic_layer',
                priority: 'high',
                findingCount: 3,
                targetRefs: [
                    {
                        type: 'metric',
                        modelName: 'orders',
                        metricName: 'count_orders',
                    },
                ],
                linkedIssueUrl: null,
                linkedJiraIssueUrl: null,
                latestFinding: null,
                agentUuid: null,
            }),
            withReviewItemJiraLinkedIssueLock: vi
                .fn()
                .mockImplementation(
                    (
                        _args: unknown,
                        run: (
                            url: string | null,
                            setUrl: (url: string) => Promise<void>,
                        ) => Promise<void>,
                    ) => run(null, setLinkedIssueUrl),
                ),
        },
        projectModel: {
            get: vi.fn().mockResolvedValue({ name: 'Jaffle shop' }),
        },
        jiraAppService: {
            createIssueForOrganization,
            linkIssueUrlForOrganization: vi.fn().mockResolvedValue(undefined),
        },
        analytics: { track: vi.fn() },
        createIssueForOrganization,
        setLinkedIssueUrl,
        ...overrides,
    } as unknown as Deps & {
        createIssueForOrganization: Mock;
        setLinkedIssueUrl: Mock;
    };
};

describe('createReviewJiraIssue', () => {
    it('creates a Jira issue and stores its URL', async () => {
        const deps = makeDeps();
        await createReviewJiraIssue(deps)(payload);
        expect(deps.createIssueForOrganization).toHaveBeenCalledWith(
            'org-1',
            expect.objectContaining({
                title: 'Broken metric',
                projectId: '10',
                issueTypeId: '1',
                description: expect.stringContaining('Priority: high'),
            }),
        );
        expect(deps.setLinkedIssueUrl).toHaveBeenCalledWith(
            'https://acme.atlassian.net/browse/DATA-42',
        );
        expect(
            deps.jiraAppService.linkIssueUrlForOrganization,
        ).toHaveBeenCalledWith('org-1', {
            issueIdOrKey: 'DATA-42',
            url: expect.stringContaining('/generalSettings/ai/reviews'),
            title: 'Open in Lightdash', // pragma: allowlist secret
        });
    });

    it('does nothing when Jira routing is disabled', async () => {
        const deps = makeDeps({
            model: {
                getJiraDestination: vi.fn().mockResolvedValue({
                    enabled: false,
                    jiraProjectId: '10',
                    jiraIssueTypeId: '1',
                }),
            },
        });
        await createReviewJiraIssue(deps)(payload);
        expect(deps.createIssueForOrganization).not.toHaveBeenCalled();
    });

    it('uses the locked Jira URL to prevent duplicate issues', async () => {
        const deps = makeDeps({
            aiAgentReviewClassifierModel: {
                getReviewItem: vi.fn().mockResolvedValue({
                    title: 'Broken metric',
                    description: 'Count is wrong',
                    primaryRootCause: 'semantic_layer',
                    priority: 'high',
                    findingCount: 1,
                    targetRefs: [],
                }),
                withReviewItemJiraLinkedIssueLock: vi
                    .fn()
                    .mockImplementation(
                        (
                            _args: unknown,
                            run: (url: string | null) => Promise<void>,
                        ) => run('https://acme.atlassian.net/browse/DATA-42'),
                    ),
            },
        });
        await createReviewJiraIssue(deps)(payload);
        expect(deps.createIssueForOrganization).not.toHaveBeenCalled();
    });

    it('fails the job so transient Jira errors are retried', async () => {
        const deps = makeDeps({
            jiraAppService: {
                createIssueForOrganization: vi
                    .fn()
                    .mockRejectedValue(new Error('Jira is down')),
            },
        });
        await expect(createReviewJiraIssue(deps)(payload)).rejects.toThrow(
            'fp-1',
        );
        expect(deps.setLinkedIssueUrl).not.toHaveBeenCalled();
    });
});

describe('buildJiraIssueDescription', () => {
    it('includes review metadata and affected objects', () => {
        const description = buildJiraIssueDescription({
            description: 'Count is wrong',
            rootCause: 'semantic_layer',
            priority: 'high',
            findingCount: 3,
            targetRefs: [
                {
                    type: 'metric',
                    modelName: 'orders',
                    metricName: 'count_orders',
                },
            ],
            projectName: 'Jaffle shop',
            reviewUrl: 'https://app.example.com/reviews',
        });
        expect(description).toContain('Occurrences: 3');
        expect(description).toContain('- orders / count_orders');
        expect(description).toContain('Open in Lightdash:');
    });
});
