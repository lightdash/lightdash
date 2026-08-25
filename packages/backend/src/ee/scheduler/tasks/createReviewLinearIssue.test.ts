import { createReviewLinearIssue } from './createReviewLinearIssue';

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
            getSettings: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                enabled: false,
                slackChannelId: null,
                linearEnabled: true,
                linearTeamId: 'team-1',
                linearProjectId: 'project-linear-1',
            }),
        },
        aiAgentReviewClassifierModel: {
            getReviewItem: vi.fn().mockResolvedValue({
                title: 'Broken metric',
                description: 'Count is wrong',
                primaryRootCause: 'semantic_layer',
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
    };
};

describe('createReviewLinearIssue', () => {
    it('does nothing when Linear export is disabled', async () => {
        const deps = makeDeps({
            model: {
                getSettings: vi.fn().mockResolvedValue({
                    linearEnabled: false,
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
            }),
        );
        expect(deps.updateReviewItemLinkedIssueUrl).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            fingerprint: FINGERPRINT,
            linkedIssueUrl: 'https://linear.app/acme/issue/PRD-12',
        });
    });

    it('skips review items that already have a linked issue', async () => {
        const deps = makeDeps({
            aiAgentReviewClassifierModel: {
                getReviewItem: vi.fn().mockResolvedValue({
                    title: 'Broken metric',
                    description: 'Count is wrong',
                    primaryRootCause: 'semantic_layer',
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
