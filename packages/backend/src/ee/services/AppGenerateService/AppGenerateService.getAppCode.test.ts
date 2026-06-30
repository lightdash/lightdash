// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { assertCanViewApp } from './appAuthz';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

// Mock appAuthz so permission checks are controllable in tests
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const APP_UUID = 'app-uuid-1234';
const PROJECT_UUID = 'project-uuid-5678';
const ORG_UUID = 'org-uuid-abcd';
const VERSION = 3;

const fakeApp = {
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: null,
    created_by_user_uuid: 'user-uuid',
    name: 'My App',
    description: 'A test app',
    template: null,
};

const fakeAppVersion = {
    app_version_id: 'version-id',
    app_id: APP_UUID,
    version: VERSION,
    status: 'ready' as const,
    prompt: '',
    error: null,
};

const fakeUser: SessionUser = {
    userId: 1,
    userUuid: 'user-uuid',
    email: 'test@lightdash.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: ORG_UUID,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    ability: { can: () => true, cannot: () => false } as never,
    abilityRules: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    timezone: null,
};

// Two fake files in S3
const FAKE_FILES = [
    { key: `apps/${APP_UUID}/versions/${VERSION}/index.html`, body: 'hello' },
    {
        key: `apps/${APP_UUID}/versions/${VERSION}/assets/app.js`,
        body: 'world',
    },
];

type FakeCommand = {
    constructor: { name: string };
    input: Record<string, unknown>;
};

/** Build a fake S3 client whose send() returns list then get responses. */
function makeFakeS3() {
    const prefix = `apps/${APP_UUID}/versions/${VERSION}/`;
    let listCallCount = 0;

    const send = vi.fn(async (command: FakeCommand) => {
        const cmdName = command.constructor.name;

        if (cmdName === 'ListObjectsV2Command') {
            listCallCount += 1;
            if (listCallCount > 1) {
                return { Contents: [], IsTruncated: false };
            }
            return {
                Contents: FAKE_FILES.map((f) => ({ Key: f.key })),
                IsTruncated: false,
            };
        }

        if (cmdName === 'GetObjectCommand') {
            const key = command.input.Key as string;
            const file = FAKE_FILES.find((f) => f.key === key);
            const body = file ? file.body : '';
            return {
                Body: Readable.from([Buffer.from(body)]),
            };
        }

        throw new Error(`Unexpected command: ${cmdName}`);
    });

    return {
        client: { send } as never,
        bucket: 'test-bucket',
        send,
        prefix,
    };
}

// ── service factory ───────────────────────────────────────────────────────────

function buildService(overrides: {
    appModel?: Record<string, unknown>;
    s3ClientOverride?: { client: never; bucket: string };
}): AppGenerateService {
    const { appModel = {}, s3ClientOverride } = overrides;

    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const spacePermissionService = {
        getSpaceAccessContext: vi.fn().mockResolvedValue({}),
    };

    const svc = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
    });

    if (s3ClientOverride) {
        vi.spyOn(
            svc as unknown as { getS3Client: () => unknown },
            'getS3Client',
        ).mockReturnValue(s3ClientOverride);
    }

    return svc;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AppGenerateService.getAppCode', () => {
    beforeEach(() => {
        vi.mocked(assertCanViewApp).mockResolvedValue(undefined);
    });

    it('returns a DataAppCode with manifest and files for the latest ready version', async () => {
        const fakeS3 = makeFakeS3();
        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3 });

        const result = await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        // manifest fields
        expect(result.manifest.appUuid).toBe(APP_UUID);
        expect(result.manifest.projectUuid).toBe(PROJECT_UUID);
        expect(result.manifest.version).toBe(VERSION);
        expect(result.manifest.name).toBe('My App');
        expect(result.manifest.description).toBe('A test app');
        expect(result.manifest.template).toBeNull();
        expect(typeof result.manifest.downloadedAt).toBe('string');
        expect(result.manifest.codeVersion).toBe(1);

        // files
        expect(result.files).toHaveLength(2);
        const indexFile = result.files.find((f) => f.path === 'index.html');
        expect(indexFile).toBeDefined();
        expect(Buffer.from(indexFile!.contentBase64, 'base64').toString()).toBe(
            'hello',
        );
        const jsFile = result.files.find((f) => f.path === 'assets/app.js');
        expect(jsFile).toBeDefined();
        expect(Buffer.from(jsFile!.contentBase64, 'base64').toString()).toBe(
            'world',
        );
    });

    it('uses the provided version number instead of latest ready', async () => {
        const EXPLICIT_VERSION = 7;
        const prefix7 = `apps/${APP_UUID}/versions/${EXPLICIT_VERSION}/`;
        const files7 = [{ key: `${prefix7}index.html`, body: 'v7-hello' }];
        let lc = 0;
        const send7 = vi.fn(async (command: FakeCommand) => {
            const cmdName = command.constructor.name;
            if (cmdName === 'ListObjectsV2Command') {
                lc += 1;
                if (lc > 1) return { Contents: [], IsTruncated: false };
                return {
                    Contents: files7.map((f) => ({ Key: f.key })),
                    IsTruncated: false,
                };
            }
            if (cmdName === 'GetObjectCommand') {
                const key = command.input.Key as string;
                const file = files7.find((f) => f.key === key);
                return {
                    Body: Readable.from([Buffer.from(file?.body ?? '')]),
                };
            }
            throw new Error(`Unexpected: ${cmdName}`);
        });
        const fakeS37 = {
            client: { send: send7 } as never,
            bucket: 'test-bucket',
        };

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn(),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS37 });
        const result = await svc.getAppCode(
            fakeUser,
            PROJECT_UUID,
            APP_UUID,
            EXPLICIT_VERSION,
        );

        expect(result.manifest.version).toBe(EXPLICIT_VERSION);
        expect(appModel.getLatestReadyVersion).not.toHaveBeenCalled();
        expect(result.files).toHaveLength(1);
    });

    it('fetches all files across two S3 pages (pagination loop)', async () => {
        const prefix = `apps/${APP_UUID}/versions/${VERSION}/`;
        const page1Key = `${prefix}index.html`;
        const page2Key = `${prefix}assets/app.js`;

        const sendPaged = vi.fn(async (command: FakeCommand) => {
            const cmdName = command.constructor.name;

            if (cmdName === 'ListObjectsV2Command') {
                const token = command.input.ContinuationToken as
                    | string
                    | undefined;
                if (!token) {
                    return {
                        IsTruncated: true,
                        NextContinuationToken: 'tok',
                        Contents: [{ Key: page1Key }],
                    };
                }
                return {
                    IsTruncated: false,
                    Contents: [{ Key: page2Key }],
                };
            }

            if (cmdName === 'GetObjectCommand') {
                const key = command.input.Key as string;
                const body = key === page1Key ? 'hello' : 'world';
                return { Body: Readable.from([Buffer.from(body)]) };
            }

            throw new Error(`Unexpected command: ${cmdName}`);
        });

        const fakeS3Paged = {
            client: { send: sendPaged } as never,
            bucket: 'test-bucket',
        };
        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(fakeAppVersion),
        };

        const svc = buildService({ appModel, s3ClientOverride: fakeS3Paged });
        const result = await svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID);

        // Both pages' files must appear — dropping the loop would yield only one.
        expect(result.files).toHaveLength(2);
        const indexFile = result.files.find((f) => f.path === 'index.html');
        expect(indexFile).toBeDefined();
        expect(Buffer.from(indexFile!.contentBase64, 'base64').toString()).toBe(
            'hello',
        );
        const jsFile = result.files.find((f) => f.path === 'assets/app.js');
        expect(jsFile).toBeDefined();
        expect(Buffer.from(jsFile!.contentBase64, 'base64').toString()).toBe(
            'world',
        );
    });

    it('throws NotFoundError when no ready version exists and version is omitted', async () => {
        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
            getLatestReadyVersion: vi.fn().mockResolvedValue(null),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: { client: {} as never, bucket: 'b' },
        });

        await expect(
            svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the user cannot view the app', async () => {
        vi.mocked(assertCanViewApp).mockRejectedValue(
            new ForbiddenError(
                'Insufficient permissions to access this data app',
            ),
        );

        const appModel = {
            getApp: vi.fn().mockResolvedValue(fakeApp),
        };

        const svc = buildService({
            appModel,
            s3ClientOverride: { client: {} as never, bucket: 'b' },
        });

        await expect(
            svc.getAppCode(fakeUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ForbiddenError);
    });
});
