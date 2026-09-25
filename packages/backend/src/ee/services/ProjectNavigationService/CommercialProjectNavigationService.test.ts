import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ProjectType,
    type AiAgentSummary,
    type MemberAbility,
    type ProjectSummary,
    type SessionUser,
} from '@lightdash/common';
import { CommercialProjectNavigationService } from './CommercialProjectNavigationService';

const organizationUuid = '00000000-0000-4000-8000-000000000001';
const projectUuid = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-09-25T00:00:00Z');

const project: ProjectSummary = {
    name: 'Jaffle shop',
    projectUuid,
    slug: 'jaffle-shop',
    organizationUuid,
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: undefined,
    createdByUserUuid: null,
    provisioningSource: null,
};

const agent: AiAgentSummary = {
    uuid: '00000000-0000-4000-8000-000000000004',
    name: 'Analyst',
    description: null,
    integrations: [],
    tags: null,
    projectUuid,
    organizationUuid,
    createdAt: now,
    updatedAt: now,
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: false,
    enableUserContext: false,
    enableSqlMode: false,
    adminOnly: false,
    modelConfig: null,
    version: 1,
    threadRetentionHours: null,
};

const buildUser = (
    define: (builder: AbilityBuilder<MemberAbility>) => void,
): SessionUser => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    builder.can('view', 'Project', { organizationUuid });
    define(builder);
    return {
        userUuid: '00000000-0000-4000-8000-000000000003',
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        organizationUuid,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        isSetupComplete: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        timezone: null,
        avatarUrl: null,
        avatarGradient: null,
        abilityRules: builder.rules,
        ability: builder.build(),
    };
};

const agentViewer = buildUser(({ can }) => {
    can('view', 'AiAgent', { organizationUuid });
});

const agentManager = buildUser(({ can }) => {
    can('view', 'AiAgent', { organizationUuid });
    can('manage', 'AiAgent', { organizationUuid });
});

const setup = ({
    aiAgentsVisible = true,
    accessibleAgents = [agent],
}: {
    aiAgentsVisible?: boolean;
    accessibleAgents?: AiAgentSummary[];
} = {}) => {
    const listAgents = vi.fn(async () => accessibleAgents);
    const service = new CommercialProjectNavigationService({
        projectModel: { getSummary: vi.fn(async () => project) },
        catalogModel: { hasMetricsInCatalog: vi.fn(async () => false) },
        featureFlagService: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: false,
            })),
        },
        aiOrganizationSettingsService: {
            areAiAgentsVisible: vi.fn(async () => aiAgentsVisible),
        },
        aiAgentService: { listAgents },
    });
    return { service, listAgents };
};

describe('CommercialProjectNavigationService Ask AI', () => {
    it('hides Ask AI from users who cannot view agents', async () => {
        const { service, listAgents } = setup();

        const navigation = await service.getProjectNavigation(
            buildUser(() => {}),
            projectUuid,
        );

        expect(navigation.askAi).toBe(false);
        expect(listAgents).not.toHaveBeenCalled();
    });

    it('hides Ask AI when AI agents are not visible to the organization', async () => {
        const { service } = setup({ aiAgentsVisible: false });

        const navigation = await service.getProjectNavigation(
            agentManager,
            projectUuid,
        );

        expect(navigation.askAi).toBe(false);
    });

    it('shows Ask AI to managers without listing agents', async () => {
        const { service, listAgents } = setup({ accessibleAgents: [] });

        const navigation = await service.getProjectNavigation(
            agentManager,
            projectUuid,
        );

        expect(navigation.askAi).toBe(true);
        expect(listAgents).not.toHaveBeenCalled();
    });

    it.each([
        { accessibleAgents: [agent], expected: true },
        { accessibleAgents: [], expected: false },
    ])(
        'shows Ask AI to viewers only when they can access an agent: $expected',
        async ({ accessibleAgents, expected }) => {
            const { service, listAgents } = setup({ accessibleAgents });

            const navigation = await service.getProjectNavigation(
                agentViewer,
                projectUuid,
            );

            expect(navigation.askAi).toBe(expected);
            expect(listAgents).toHaveBeenCalledWith(agentViewer, projectUuid);
        },
    );
});
