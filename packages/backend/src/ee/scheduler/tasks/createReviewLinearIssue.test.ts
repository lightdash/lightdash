import { type Mock } from 'vitest';
import {
    buildIssueDescription,
    createReviewLinearIssue,
} from './createReviewLinearIssue';

type Deps = Parameters<typeof createReviewLinearIssue>[0];

const ORGANIZATION_UUID = 'org-1';
const PROJECT_UUID = 'project-1';
const FINGERPRINT = 'fp-1';

const payload = {
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    fingerprints: [FINGERPRINT],
    reviewRunUuid: 'run-1',
};

const makeDeps = (overrides: Record<string, unknown> = {}) => {
    const createIssueForOrganization = vi.fn().mockResolvedValue({
        id: 'issue-1',
        identifier: 'PRD-12',
        url: 'https://linear.app/acme/issue/PRD-12',
        title: 'Broken metric',
    });
    const updateReviewItemLinkedIssueUrl = vi.fn().mockResolvedValue(undefined);

    return {
        siteUrl: 'https://app.example.com',
        model: {
            getLinearDestination: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                enabled: true,
                linearTeamId: 'team-1',
                linearProjectId: 'project-linear-1',
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
                latestFinding: {
                    threadUuid: 'thread-1',
                    agentUuid: 'agent-1',
                },
                agentUuid: 'agent-1',
            }),
            updateReviewItemLinkedIssueUrl,
        },
        projectModel: {
            get: vi.fn().mockResolvedValue({ name: 'Jaffle shop' }),
        },
        linearAppService: {
            createIssueForOrganization,
        },
        analytics: {
            track: vi.fn(),
        },
        createIssueForOrganization,
        updateReviewItemLinkedIssueUrl,
        ...overrides,
    } as unknown as Deps & {
        createIssueForOrganization: Mock;
        updateReviewItemLinkedIssueUrl: Mock;
    };
};

describe('createReviewLinearIssue', () => {
    it('does nothing when AI agent reviews are disabled', async () => {
        const deps = makeDeps({
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue({
                    aiAgentReviewsEnabled: false,
                }),
            },
        });

        await createReviewLinearIssue(deps)(payload);

        expect(deps.createIssueForOrganization).not.toHaveBeenCalled();
    });

    it('does nothing when Linear export is disabled', async () => {
        const deps = makeDeps({
            model: {
                getLinearDestination: vi.fn().mockResolvedValue({
                    enabled: false,
                    linearTeamId: 'team-1',
                    linearProjectId: null,
                }),
            },
        });

        await createReviewLinearIssue(deps)(payload);

        expect(deps.createIssueForOrganization).not.toHaveBeenCalled();
    });

    it('creates a Linear issue and stores the linked URL', async () => {
        const deps = makeDeps();

        await createReviewLinearIssue(deps)(payload);

        expect(deps.createIssueForOrganization).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            expect.objectContaining({
                title: 'Broken metric',
                teamId: 'team-1',
                projectId: 'project-linear-1',
                description: expect.stringContaining('**Priority:** high'),
            }),
        );
        expect(deps.updateReviewItemLinkedIssueUrl).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            fingerprint: FINGERPRINT,
            linkedIssueUrl: 'https://linear.app/acme/issue/PRD-12',
        });
    });

    it('fails the job when Linear rejects an item so it is retried', async () => {
        const deps = makeDeps({
            linearAppService: {
                createIssueForOrganization: vi
                    .fn()
                    .mockRejectedValue(new Error('Linear is down')),
            },
        });

        await expect(createReviewLinearIssue(deps)(payload)).rejects.toThrow(
            FINGERPRINT,
        );
        expect(deps.updateReviewItemLinkedIssueUrl).not.toHaveBeenCalled();
    });

    it('skips review items that already have a linked issue', async () => {
        const deps = makeDeps({
            aiAgentReviewClassifierModel: {
                getReviewItem: vi.fn().mockResolvedValue({
                    title: 'Broken metric',
                    description: 'Count is wrong',
                    primaryRootCause: 'semantic_layer',
                    priority: 'high',
                    findingCount: 1,
                    targetRefs: [],
                    linkedIssueUrl: 'https://linear.app/acme/issue/PRD-1',
                    latestFinding: null,
                    agentUuid: null,
                }),
                updateReviewItemLinkedIssueUrl: vi.fn(),
            },
        });

        await createReviewLinearIssue(deps)(payload);

        expect(deps.createIssueForOrganization).not.toHaveBeenCalled();
    });
});

describe('buildIssueDescription', () => {
    it('includes useful metadata without conversation evidence', () => {
        const description = buildIssueDescription({
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

        expect(description).toContain('**Occurrences:** 3');
        expect(description).toContain('- orders / count_orders');
        expect(description).toContain('[Open in Lightdash]');
    });
});
