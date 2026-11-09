// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    FeatureFlags,
    NotFoundError,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';
import { featureFlagModelWith } from './AppGenerateService.mock';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue({ directOnly: false }),
}));

const APP_UUID = 'app-uuid-1234';
const PROJECT_UUID = 'project-uuid-5678';
const ORG_UUID = 'org-uuid-abcd';
const MANIFEST_KEY = `apps/${APP_UUID}/versions/3/assets/queries.json`;

const fakeApp = {
    app_id: APP_UUID,
    slug: 'revenue-app',
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: null,
    created_by_user_uuid: 'user-uuid',
    name: 'Revenue app',
    description: '',
    template: null,
    design_uuid: null,
};

const fakeUser = {
    userUuid: 'user-uuid',
    organizationUuid: ORG_UUID,
    role: OrganizationMemberRole.ADMIN,
    ability: { can: () => true, cannot: () => false } as never,
} as unknown as SessionUser;

const manifest = {
    version: 1,
    queries: [
        {
            kind: 'semantic',
            id: 'total-plays',
            title: 'Total plays',
            description: null,
            explore: 'orders',
            dimensions: [],
            metrics: ['unique_order_count'],
            filters: [],
            metricFilters: [],
            sorts: [],
            limit: 1,
            parameters: {},
            loc: 'src/App.jsx:28',
            bucket: 'static',
            slots: [],
        },
    ],
    bindings: [],
    error: null,
};

type FakeCommand = { constructor: { name: string }; input: { Key?: string } };

/** S3 stub: `objects` maps keys to bodies; anything else is NoSuchKey. */
function makeFakeS3(objects: Record<string, string>) {
    const send = vi.fn(async (command: FakeCommand) => {
        const key = command.input.Key ?? '';
        if (command.constructor.name === 'GetObjectCommand' && key in objects) {
            const { Readable } = await import('node:stream');
            return { Body: Readable.from([Buffer.from(objects[key])]) };
        }
        const { S3ServiceException } = await import('@aws-sdk/client-s3');
        throw new S3ServiceException({
            name: 'NoSuchKey',
            $fault: 'client',
            $metadata: { httpStatusCode: 404 },
        });
    });
    return { client: { send } as never, bucket: 'test-bucket' };
}

function buildService(
    appModel: Record<string, unknown>,
    s3: ReturnType<typeof makeFakeS3>,
): AppGenerateService {
    const svc = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {
            getAppByUuidOrSlug: vi.fn().mockResolvedValue(fakeApp),
            ...appModel,
        } as never,
        featureFlagModel: featureFlagModelWith({
            [FeatureFlags.EnableDataApps]: true,
        }) as never,
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
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: s3,
        appThumbnailClient: buildAppThumbnailClientMock(),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
    });
    vi.spyOn(
        svc as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    return svc;
}

const readyVersion = { app_id: APP_UUID, version: 3, status: 'ready' };

describe('AppGenerateService.getAppQueryManifest', () => {
    it('returns the manifest stored with the latest ready version', async () => {
        const svc = buildService(
            { getLatestReadyVersion: vi.fn().mockResolvedValue(readyVersion) },
            makeFakeS3({ [MANIFEST_KEY]: JSON.stringify(manifest) }),
        );

        await expect(
            svc.getAppQueryManifest(fakeUser, PROJECT_UUID, 'revenue-app'),
        ).resolves.toEqual({ version: 3, queries: manifest });
    });

    it('returns null queries when the version predates manifests', async () => {
        const svc = buildService(
            { getLatestReadyVersion: vi.fn().mockResolvedValue(readyVersion) },
            makeFakeS3({}),
        );

        await expect(
            svc.getAppQueryManifest(fakeUser, PROJECT_UUID, APP_UUID),
        ).resolves.toEqual({ version: 3, queries: null });
    });

    it('returns null queries when the stored file is not a manifest', async () => {
        const svc = buildService(
            { getLatestReadyVersion: vi.fn().mockResolvedValue(readyVersion) },
            makeFakeS3({ [MANIFEST_KEY]: '{not json' }),
        );

        await expect(
            svc.getAppQueryManifest(fakeUser, PROJECT_UUID, APP_UUID),
        ).resolves.toEqual({ version: 3, queries: null });
    });

    it('fails clearly when the app has no ready version', async () => {
        const svc = buildService(
            { getLatestReadyVersion: vi.fn().mockResolvedValue(null) },
            makeFakeS3({}),
        );

        await expect(
            svc.getAppQueryManifest(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(NotFoundError);
    });
});
