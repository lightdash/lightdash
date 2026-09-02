// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    DATA_REFERENCE_EXTRACTOR_VERSION,
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
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue(undefined),
}));

const APP_UUID = 'app-uuid-1234';
const PROJECT_UUID = 'project-uuid-5678';
const ORG_UUID = 'org-uuid-abcd';

const fakeApp = {
    app_id: APP_UUID,
    slug: 'revenue-app',
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: 'space-uuid',
    created_by_user_uuid: 'user-uuid',
    name: 'Revenue app',
    description: 'Revenue by region',
    template: 'dashboard' as const,
    design_uuid: null,
};

const dataReferences = {
    extractorVersion: DATA_REFERENCE_EXTRACTOR_VERSION,
    references: [],
    parseErrors: [],
    stats: {
        callSites: 0,
        fullyResolved: 0,
        partiallyResolved: 0,
        unresolved: 0,
    },
};

const makeVersion = (
    version: number,
    status: 'ready' | 'building' | 'error',
) => ({
    app_version_id: `version-${version}`,
    app_id: APP_UUID,
    version,
    status,
    prompt: 'Build a revenue app',
    error: null,
    resources: null,
    viz_schema: null,
    data_references: status === 'ready' ? dataReferences : null,
});

const fakeUser = {
    userUuid: 'user-uuid',
    organizationUuid: ORG_UUID,
    role: OrganizationMemberRole.ADMIN,
    ability: { can: () => true, cannot: () => false } as never,
} as unknown as SessionUser;

function buildService(appModel: Record<string, unknown>): AppGenerateService {
    const svc = new AppGenerateService({
        dataAppTemplateService: {} as never,
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {
            findAppBySlug: vi.fn().mockResolvedValue(fakeApp),
            countVersions: vi.fn().mockResolvedValue(2),
            findAppCreator: vi.fn().mockResolvedValue({
                userUuid: 'user-uuid',
                firstName: 'Ada',
                lastName: 'Lovelace',
            }),
            ...appModel,
        } as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {
            getSpaceSummary: vi
                .fn()
                .mockResolvedValue({ path: 'sales.emea', uuid: 'space-uuid' }),
        } as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            getSpaceAccessContext: vi.fn().mockResolvedValue({}),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            listAppLinks: vi
                .fn()
                .mockResolvedValue([
                    { alias: 'crm', connection: { slug: 'hubspot' } },
                ]),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });
    vi.spyOn(
        svc as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    return svc;
}

describe('AppGenerateService.readDataApp', () => {
    it('reads the latest ready version and flags a newer version still building', async () => {
        const ready = makeVersion(1, 'ready');
        const svc = buildService({
            getLatestReadyVersion: vi.fn().mockResolvedValue(ready),
            getLatestVersion: vi
                .fn()
                .mockResolvedValue(makeVersion(2, 'building')),
            getVersion: vi.fn().mockResolvedValue(ready),
        });

        const result = await svc.readDataApp(
            fakeUser,
            PROJECT_UUID,
            'revenue-app',
        );

        expect(result).toEqual({
            app: {
                uuid: APP_UUID,
                slug: 'revenue-app',
                name: 'Revenue app',
                description: 'Revenue by region',
                template: 'dashboard',
                spaceUuid: 'space-uuid',
            },
            spaceSlug: 'sales/emea',
            externalConnections: [{ alias: 'crm', connectionSlug: 'hubspot' }],
            vizSchema: null,
            version: 1,
            versionCount: 2,
            newerVersion: { version: 2, status: 'building' },
            createdBy: {
                userUuid: 'user-uuid',
                firstName: 'Ada',
                lastName: 'Lovelace',
            },
            resources: null,
            dataReferences,
        });
    });

    it('reports no newer version when the latest version is the ready one', async () => {
        const ready = makeVersion(3, 'ready');
        const svc = buildService({
            getLatestReadyVersion: vi.fn().mockResolvedValue(ready),
            getLatestVersion: vi.fn().mockResolvedValue(ready),
            getVersion: vi.fn().mockResolvedValue(ready),
        });

        const result = await svc.readDataApp(
            fakeUser,
            PROJECT_UUID,
            'revenue-app',
        );

        expect(result.newerVersion).toBeNull();
    });

    it('fails clearly when the app has no ready version', async () => {
        const svc = buildService({
            getLatestReadyVersion: vi.fn().mockResolvedValue(null),
        });

        await expect(
            svc.readDataApp(fakeUser, PROJECT_UUID, 'revenue-app'),
        ).rejects.toThrow(
            new NotFoundError(
                'Data app "revenue-app" has no ready version yet, so it cannot be read',
            ),
        );
    });

    it('fails clearly when no app matches the slug', async () => {
        const svc = buildService({
            findAppBySlug: vi.fn().mockResolvedValue(undefined),
        });

        await expect(
            svc.readDataApp(fakeUser, PROJECT_UUID, 'missing-app'),
        ).rejects.toThrow(
            new NotFoundError('Data app "missing-app" was not found'),
        );
    });
});
