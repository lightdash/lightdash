import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ContentType,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';
const USER_UUID = 'user-uuid';
const AGENT_UUID = 'agent-uuid';
const ARTIFACT_UUID = 'artifact-uuid';
const VERSION_UUID = 'version-uuid';
const PROMPT_UUID = 'prompt-uuid';

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => undefined),
        rules: [],
    },
} as unknown as SessionUser;

const makeArtifact = (overrides: {
    savedQueryUuid?: string | null;
    savedDashboardUuid?: string | null;
}) => ({
    artifactUuid: ARTIFACT_UUID,
    versionUuid: VERSION_UUID,
    promptUuid: PROMPT_UUID,
    title: 'Artifact title',
    description: null,
    savedQueryUuid: overrides.savedQueryUuid ?? null,
    savedDashboardUuid: overrides.savedDashboardUuid ?? null,
});

const buildService = ({
    artifact,
    promptSavedQueryUuid = null,
}: {
    artifact: ReturnType<typeof makeArtifact>;
    promptSavedQueryUuid?: string | null;
}) => {
    const contentVerificationModel = {
        verify: vi.fn().mockResolvedValue(undefined),
        unverify: vi.fn().mockResolvedValue(undefined),
    };
    const analytics = { track: vi.fn() };
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue({
            name: 'Agent',
            projectUuid: PROJECT_UUID,
        }),
        getArtifact: vi.fn().mockResolvedValue(artifact),
        setArtifactVersionVerified: vi.fn().mockResolvedValue(undefined),
        findPromptSavedQueryUuid: vi
            .fn()
            .mockResolvedValue(promptSavedQueryUuid),
        getArtifactEmbedding: vi.fn().mockResolvedValue({
            embedding: [],
            provider: 'test',
            model: 'test',
        }),
        getArtifactQuestion: vi.fn().mockResolvedValue('Existing question'),
        getVerifiedSavedArtifactContent: vi.fn().mockResolvedValue([
            {
                contentType: 'chart',
                contentUuid: 'chart-uuid',
                name: 'Verified chart',
                spaceUuid: 'space-uuid',
            },
        ]),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
        }),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        projectModel,
        contentVerificationModel,
        analytics,
        featureFlagService,
        lightdashConfig: {
            siteUrl: 'https://app.example.com',
            ai: { copilot: { embeddingEnabled: true } },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, contentVerificationModel, analytics, aiAgentModel };
};

const setVerified = (service: AiAgentService, verified: boolean) =>
    service.setArtifactVersionVerified(user, {
        agentUuid: AGENT_UUID,
        artifactUuid: ARTIFACT_UUID,
        versionUuid: VERSION_UUID,
        verified,
    });

describe('AiAgentService content verification bridge', () => {
    it('allows view-only access when listing verified AI artifacts', async () => {
        const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
        can('view', 'ContentVerification', {
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
        });
        const viewOnlyUser = { ...user, ability: build() } as SessionUser;
        const { service, aiAgentModel } = buildService({
            artifact: makeArtifact({}),
        });

        await expect(
            service.getVerifiedSavedArtifactContent(viewOnlyUser, PROJECT_UUID),
        ).resolves.toEqual([
            {
                contentType: 'chart',
                contentUuid: 'chart-uuid',
                name: 'Verified chart',
                spaceUuid: 'space-uuid',
            },
        ]);
        expect(
            aiAgentModel.getVerifiedSavedArtifactContent,
        ).toHaveBeenCalledWith(PROJECT_UUID);
    });

    it('verifying an artifact saved as a chart (via prompt) writes a chart verification and tracks source ai_artifact', async () => {
        const { service, contentVerificationModel, analytics } = buildService({
            artifact: makeArtifact({}),
            promptSavedQueryUuid: 'chart-uuid',
        });

        await setVerified(service, true);

        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.CHART,
            'chart-uuid',
            PROJECT_UUID,
            USER_UUID,
        );
        expect(analytics.track).toHaveBeenCalledWith({
            event: 'content_verification.created',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                contentType: ContentType.CHART,
                contentId: 'chart-uuid',
                source: 'ai_artifact',
            },
        });
    });

    it('prefers the artifact version chart link over the prompt link', async () => {
        const { service, contentVerificationModel, aiAgentModel } =
            buildService({
                artifact: makeArtifact({ savedQueryUuid: 'version-chart' }),
                promptSavedQueryUuid: 'prompt-chart',
            });

        await setVerified(service, true);

        expect(aiAgentModel.findPromptSavedQueryUuid).not.toHaveBeenCalled();
        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.CHART,
            'version-chart',
            PROJECT_UUID,
            USER_UUID,
        );
    });

    it('verifying an artifact saved as a dashboard writes a dashboard verification', async () => {
        const { service, contentVerificationModel, analytics } = buildService({
            artifact: makeArtifact({ savedDashboardUuid: 'dashboard-uuid' }),
        });

        await setVerified(service, true);

        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            'dashboard-uuid',
            PROJECT_UUID,
            USER_UUID,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.created',
                properties: expect.objectContaining({
                    contentType: ContentType.DASHBOARD,
                    contentId: 'dashboard-uuid',
                    source: 'ai_artifact',
                }),
            }),
        );
    });

    it('unverifying removes the verification and tracks the deletion', async () => {
        const { service, contentVerificationModel, analytics } = buildService({
            artifact: makeArtifact({}),
            promptSavedQueryUuid: 'chart-uuid',
        });

        await setVerified(service, false);

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.CHART,
            'chart-uuid',
        );
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.deleted',
                properties: expect.objectContaining({
                    source: 'ai_artifact',
                }),
            }),
        );
    });

    it('does nothing for artifacts not persisted as saved content', async () => {
        const { service, contentVerificationModel, analytics } = buildService({
            artifact: makeArtifact({}),
            promptSavedQueryUuid: null,
        });

        await setVerified(service, true);

        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.created',
            }),
        );
    });
});
