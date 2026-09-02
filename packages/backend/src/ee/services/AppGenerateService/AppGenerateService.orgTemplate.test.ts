import {
    defineUserAbility,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const ORG_UUID = 'org-1';
const USER_UUID = 'user-1';

const TEMPLATE = {
    templateUuid: 'tpl-1',
    organizationUuid: ORG_UUID,
    slug: 'metric-forecaster',
    name: 'Metric Forecaster',
    description: 'x',
    category: 'Forecasting',
    questions: [],
    kind: 'seeded',
    fileCount: 3,
    createdByUserUuid: 'someone',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const buildUser = (role: OrganizationMemberRole): SessionUser =>
    ({
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        role,
        ability: defineUserAbility(
            {
                role,
                organizationUuid: ORG_UUID,
                userUuid: USER_UUID,
                roleUuid: undefined,
            },
            [],
        ),
    }) as unknown as SessionUser;

const buildService = ({
    flagEnabled = true,
    template = TEMPLATE as typeof TEMPLATE | null,
} = {}) =>
    new AppGenerateService({
        dataAppTemplateService: {
            // findForBuild resolves undefined for an unknown slug
            findForBuild: vi.fn().mockResolvedValue(template ?? undefined),
        } as never,
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {} as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });

const resolve = (service: AppGenerateService, user: SessionUser) =>
    (
        service as unknown as {
            resolveOrgTemplateForBuild: (
                u: SessionUser,
                org: string,
                slug: string,
            ) => Promise<typeof TEMPLATE>;
        }
    ).resolveOrgTemplateForBuild(user, ORG_UUID, 'metric-forecaster');

describe('AppGenerateService: building from an organization template', () => {
    it('resolves the template for a user holding create:DataAppFromTemplate', async () => {
        const template = await resolve(
            buildService(),
            buildUser(OrganizationMemberRole.EDITOR),
        );
        expect(template.slug).toBe('metric-forecaster');
    });

    it('refuses users without create:DataAppFromTemplate', async () => {
        await expect(
            resolve(
                buildService(),
                buildUser(OrganizationMemberRole.INTERACTIVE_VIEWER),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('refuses builds when the templates feature is off', async () => {
        await expect(
            resolve(
                buildService({ flagEnabled: false }),
                buildUser(OrganizationMemberRole.ADMIN),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('reports an unknown slug as not found', async () => {
        await expect(
            resolve(
                buildService({ template: null }),
                buildUser(OrganizationMemberRole.EDITOR),
            ),
        ).rejects.toThrow(NotFoundError);
    });
});
