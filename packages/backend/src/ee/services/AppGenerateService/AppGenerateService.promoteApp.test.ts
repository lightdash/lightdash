import {
    CopyObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Ability } from '@casl/ability';
import {
    assertUnreachable,
    ProjectType,
    type AppGeneratePipelineJobPayload,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { pack } from 'tar-stream';
import {
    MockSandbox,
    MockSandboxManager,
} from '../SandboxRuntime/SandboxRuntime.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));

const PREVIEW_PROJECT_UUID = 'preview-project';
const PRODUCTION_PROJECT_UUID = 'production-project';
const ORGANIZATION_UUID = 'organization';
const USER_UUID = 'user';
const PREVIEW_APP_UUID = 'preview-app';
const PRODUCTION_APP_UUID = 'production-app';
const STALE_SANDBOX_UUID = 'stale-sandbox';
const PROMOTED_SOURCE = 'export const state = "promoted";';
const STALE_SOURCE = 'export const state = "stale";';
const SOURCE_PATH = '/app/src/App.tsx';

type AppRow = {
    app_id: string;
    project_uuid: string;
    organization_uuid: string;
    space_uuid: null;
    design_uuid: null;
    sandbox_id: string | null;
    upstream_app_uuid: string | null;
    template: 'data_app';
    name: string;
    slug: string;
    description: null;
    created_by_user_uuid: string;
    deleted_at: null;
    deleted_by_user_uuid: null;
};

type VersionRow = {
    app_version_id: string;
    app_id: string;
    version: number;
    prompt: string;
    status: 'ready' | 'pending' | 'sandbox';
    created_at: Date;
    error: null;
    resources: null;
    dependencies: null;
    viz_schema: null;
    data_references: null;
};

type S3Command = ListObjectsV2Command | CopyObjectCommand | GetObjectCommand;

const makeSourceTar = (source: string): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const archive = pack();
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        archive.entry({ name: 'src/App.tsx' }, source, (error) => {
            if (error) reject(error);
            else archive.finalize();
        });
    });

const makeUser = (): SessionUser => {
    const ability = new Ability([{ action: 'manage', subject: 'DataApp' }]);
    return {
        userUuid: USER_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as SessionUser;
};

async function buildScenario() {
    const previewApp: AppRow = {
        app_id: PREVIEW_APP_UUID,
        project_uuid: PREVIEW_PROJECT_UUID,
        organization_uuid: ORGANIZATION_UUID,
        space_uuid: null,
        design_uuid: null,
        sandbox_id: 'preview-sandbox',
        upstream_app_uuid: PRODUCTION_APP_UUID,
        template: 'data_app',
        name: 'Revenue app',
        slug: 'revenue-app',
        description: null,
        created_by_user_uuid: USER_UUID,
        deleted_at: null,
        deleted_by_user_uuid: null,
    };
    const productionApp: AppRow = {
        ...previewApp,
        app_id: PRODUCTION_APP_UUID,
        project_uuid: PRODUCTION_PROJECT_UUID,
        sandbox_id: STALE_SANDBOX_UUID,
        upstream_app_uuid: null,
    };
    const apps = new Map([
        [PREVIEW_APP_UUID, previewApp],
        [PRODUCTION_APP_UUID, productionApp],
    ]);
    const versions = new Map<string, VersionRow[]>([
        [
            PREVIEW_APP_UUID,
            [
                {
                    app_version_id: 'preview-version-3',
                    app_id: PREVIEW_APP_UUID,
                    version: 3,
                    prompt: 'Fix currency formatting',
                    status: 'ready',
                    created_at: new Date(),
                    error: null,
                    resources: null,
                    dependencies: null,
                    viz_schema: null,
                    data_references: null,
                },
            ],
        ],
        [
            PRODUCTION_APP_UUID,
            [
                {
                    app_version_id: 'production-version-6',
                    app_id: PRODUCTION_APP_UUID,
                    version: 6,
                    prompt: 'Old prompt',
                    status: 'ready',
                    created_at: new Date(),
                    error: null,
                    resources: null,
                    dependencies: null,
                    viz_schema: null,
                    data_references: null,
                },
            ],
        ],
    ]);
    const objects = new Map<string, Buffer>([
        [
            `apps/${PREVIEW_APP_UUID}/versions/3/source.tar`,
            await makeSourceTar(PROMOTED_SOURCE),
        ],
        [
            `apps/${PRODUCTION_APP_UUID}/versions/6/source.tar`,
            await makeSourceTar(STALE_SOURCE),
        ],
    ]);
    const s3Client = {
        send: async (command: S3Command) => {
            if (command instanceof ListObjectsV2Command) {
                const prefix = command.input.Prefix ?? '';
                return {
                    Contents: [...objects.keys()]
                        .filter((key) => key.startsWith(prefix))
                        .map((Key) => ({ Key })),
                };
            }
            if (command instanceof CopyObjectCommand) {
                const source = decodeURIComponent(
                    (command.input.CopySource ?? '').replace(
                        '/test-bucket/',
                        '',
                    ),
                );
                const value = objects.get(source);
                if (!value || !command.input.Key) {
                    throw new Error('Missing copy source');
                }
                objects.set(command.input.Key, value);
                return {};
            }
            if (command instanceof GetObjectCommand) {
                const value = objects.get(command.input.Key ?? '');
                if (!value) throw new Error('Missing object');
                return { Body: Readable.from([value]) };
            }
            return assertUnreachable(command, 'Unexpected S3 command');
        },
    };
    const appModel = {
        getApp: async (appUuid: string, projectUuid: string) => {
            const app = apps.get(appUuid);
            if (!app || app.project_uuid !== projectUuid) {
                throw new Error('App not found');
            }
            return app;
        },
        findAppByUuid: async (appUuid: string) => apps.get(appUuid),
        getLatestReadyVersion: async (appUuid: string) =>
            versions
                .get(appUuid)
                ?.findLast((version) => version.status === 'ready'),
        getLatestVersion: async (appUuid: string) =>
            versions.get(appUuid)?.at(-1),
        getVersion: async (appUuid: string, version: number) =>
            versions.get(appUuid)?.find((row) => row.version === version),
        getVersionStatus: async (appUuid: string, version: number) =>
            versions.get(appUuid)?.find((row) => row.version === version)
                ?.status,
        createVersion: async (
            appUuid: string,
            input: { version: number; prompt: string },
            status: VersionRow['status'],
        ) => {
            const row: VersionRow = {
                app_version_id: `${appUuid}-version-${input.version}`,
                app_id: appUuid,
                version: input.version,
                prompt: input.prompt,
                status,
                created_at: new Date(),
                error: null,
                resources: null,
                dependencies: null,
                viz_schema: null,
                data_references: null,
            };
            versions.get(appUuid)?.push(row);
            return row;
        },
        updateVersionStatusIfInProgress: async (
            appUuid: string,
            version: number,
            status: VersionRow['status'] | 'catalog',
        ) => {
            const row = versions
                .get(appUuid)
                ?.find((item) => item.version === version);
            if (!row || status === 'catalog') return false;
            row.status = status;
            return true;
        },
        updateSandboxUuid: async (
            appUuid: string,
            sandboxUuid: string | null,
        ) => {
            const app = apps.get(appUuid);
            if (!app) throw new Error('App not found');
            app.sandbox_id = sandboxUuid;
        },
        syncPromotedApp: async () => undefined,
        updateStatusMessage: async () => undefined,
        touchVersionIfInProgress: async () => undefined,
    };
    let pipelinePayload: AppGeneratePipelineJobPayload | undefined;
    const sandboxManager = new MockSandboxManager({
        sandboxUuid: STALE_SANDBOX_UUID,
        sandbox: new MockSandbox('stale-provider', {
            [SOURCE_PATH]: STALE_SOURCE,
        }),
    });
    const service = new AppGenerateService({
        dataAppTemplateService: {} as never,
        lightdashConfig: {
            appRuntime: {
                dataAppCodingAgent: 'claude',
                dependencyRegistryHosts: [],
                e2bTemplateName: 'test-template',
                e2bTemplateTag: 'latest',
                otel: { enabled: false },
                sampleDataEnabled: false,
            },
        } as never,
        analytics: { track: () => undefined } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {
            findSessionUserAndOrgByUuid: async () => makeUser(),
            findServiceAccountByUserUuid: async () => undefined,
        } as never,
        appModel: appModel as never,
        featureFlagModel: { get: async () => ({ enabled: true }) } as never,
        organizationDesignModel: {
            findInOrganization: async () => null,
        } as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: async (projectUuid: string) =>
                projectUuid === PREVIEW_PROJECT_UUID
                    ? {
                          projectUuid,
                          organizationUuid: ORGANIZATION_UUID,
                          name: 'Preview',
                          type: ProjectType.PREVIEW,
                          createdByUserUuid: USER_UUID,
                          upstreamProjectUuid: PRODUCTION_PROJECT_UUID,
                      }
                    : {
                          projectUuid,
                          organizationUuid: ORGANIZATION_UUID,
                          name: 'Production',
                          type: ProjectType.DEFAULT,
                          createdByUserUuid: USER_UUID,
                          upstreamProjectUuid: null,
                      },
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {
            appGeneratePipeline: async (
                payload: AppGeneratePipelineJobPayload,
            ) => {
                pipelinePayload = payload;
                return { jobId: 'job' };
            },
        } as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PRODUCTION_PROJECT_UUID,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            listAppLinks: async () => [],
            replaceAppLinks: async () => undefined,
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getDataAppModelVisibility: async () => null,
            getClaudeCodeConfig: async () => ({
                defaultProvider: 'anthropic',
                providers: { anthropic: { apiKey: 'test-key' } },
                selfManagedProviders: [],
                byoProviders: [],
            }),
        } as never,
        sandboxManager,
        appRuntimeS3: { client: s3Client as never, bucket: 'test-bucket' },
    });

    return {
        service,
        apps,
        getPipelinePayload: () => pipelinePayload,
        sandboxManager,
    };
}

describe('AppGenerateService promotion', () => {
    it('cold-starts the first production iteration from promoted source', async () => {
        const { service, apps, getPipelinePayload, sandboxManager } =
            await buildScenario();
        const user = makeUser();

        await service.promoteApp(user, PREVIEW_PROJECT_UUID, PREVIEW_APP_UUID);

        expect(apps.get(PRODUCTION_APP_UUID)?.sandbox_id).toBeNull();
        expect(sandboxManager.has(STALE_SANDBOX_UUID)).toBe(false);

        await service.iterateApp(
            user,
            PRODUCTION_PROJECT_UUID,
            PRODUCTION_APP_UUID,
            'Add a total',
            [],
        );

        const payload = getPipelinePayload();
        expect(payload).toBeDefined();
        await service.runPipeline(payload!, 0);

        const source = await sandboxManager
            .getActiveSandbox()
            .files.read(SOURCE_PATH);
        expect(source).toBe(PROMOTED_SOURCE);
    });

    it('clears production sandbox state when provider cleanup fails', async () => {
        const { service, apps, sandboxManager } = await buildScenario();
        sandboxManager.destroyError = new Error('provider unavailable');

        await service.promoteApp(
            makeUser(),
            PREVIEW_PROJECT_UUID,
            PREVIEW_APP_UUID,
        );

        expect(apps.get(PRODUCTION_APP_UUID)?.sandbox_id).toBeNull();
    });
});
