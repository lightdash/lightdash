import { Ability, AbilityBuilder } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    ProjectType,
    type MemberAbility,
    type ProjectSummary,
    type SessionUser,
} from '@lightdash/common';
import {
    ProjectNavigationService,
    type ProjectNavigationServiceArguments,
} from './ProjectNavigationService';

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

const buildUser = (
    define: (builder: AbilityBuilder<MemberAbility>) => void,
): SessionUser => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
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

const viewer = buildUser(({ can }) => {
    can('view', 'Project', { organizationUuid });
});

const agentManager = buildUser(({ can }) => {
    can('view', 'Project', { organizationUuid });
    can('manage', 'AiAgent', { organizationUuid });
});

const setup = ({
    summary = project,
    hasMetrics = true,
    enabledFlags = [FeatureFlags.AiAutopilot, FeatureFlags.EnableLearn],
}: {
    summary?: ProjectSummary;
    hasMetrics?: boolean;
    enabledFlags?: string[];
} = {}) => {
    const dependencies: ProjectNavigationServiceArguments = {
        projectModel: { getSummary: vi.fn(async () => summary) },
        catalogModel: { hasMetricsInCatalog: vi.fn(async () => hasMetrics) },
        featureFlagService: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: enabledFlags.includes(featureFlagId),
            })),
        },
    };
    return {
        dependencies,
        service: new ProjectNavigationService(dependencies),
    };
};

describe('ProjectNavigationService', () => {
    it('rejects users who cannot view the project', async () => {
        const { service } = setup();
        const outsider = buildUser(() => {});

        await expect(
            service.getProjectNavigation(outsider, projectUuid),
        ).rejects.toThrow(ForbiddenError);
    });

    it('never shows Ask AI without the enterprise service', async () => {
        const { service } = setup();

        const navigation = await service.getProjectNavigation(
            agentManager,
            projectUuid,
        );

        expect(navigation.askAi).toBe(false);
    });

    it.each([
        { hasMetrics: true, expected: true },
        { hasMetrics: false, expected: false },
    ])(
        'shows metrics when the catalog has metrics: $hasMetrics',
        async ({ hasMetrics, expected }) => {
            const { service } = setup({ hasMetrics });

            const navigation = await service.getProjectNavigation(
                viewer,
                projectUuid,
            );

            expect(navigation.metrics).toBe(expected);
        },
    );

    it.each([
        { user: agentManager, flagOn: true, expected: true },
        { user: agentManager, flagOn: false, expected: false },
        { user: viewer, flagOn: true, expected: false },
    ])(
        'shows Autopilot only to agent managers with the flag on (flag $flagOn)',
        async ({ user, flagOn, expected }) => {
            const { service } = setup({
                enabledFlags: flagOn ? [FeatureFlags.AiAutopilot] : [],
            });

            const navigation = await service.getProjectNavigation(
                user,
                projectUuid,
            );

            expect(navigation.autopilot).toBe(expected);
        },
    );

    it.each([
        { flagOn: false, type: ProjectType.DEFAULT, expected: false },
        { flagOn: true, type: ProjectType.DEFAULT, expected: true },
        { flagOn: true, type: ProjectType.PREVIEW, expected: false },
    ])(
        'shows Learn with flag $flagOn on a $type project: $expected',
        async ({ flagOn, type, expected }) => {
            const { service } = setup({
                summary: { ...project, type },
                enabledFlags: flagOn ? [FeatureFlags.EnableLearn] : [],
            });

            const navigation = await service.getProjectNavigation(
                viewer,
                projectUuid,
            );

            expect(navigation.learn).toBe(expected);
        },
    );

    it('hides only the item whose check fails', async () => {
        const { service, dependencies } = setup();
        vi.mocked(
            dependencies.catalogModel.hasMetricsInCatalog,
        ).mockRejectedValue(new Error('catalog unavailable'));

        const navigation = await service.getProjectNavigation(
            agentManager,
            projectUuid,
        );

        expect(navigation).toEqual({
            metrics: false,
            askAi: false,
            autopilot: true,
            learn: true,
        });
    });
});
