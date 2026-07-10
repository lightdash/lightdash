import {
    FeatureFlags,
    ParameterError,
    TooManyRequestsError,
    type DataAppCode,
    type DataAppDependencies,
    type ImportAppCodeRequestBody,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { extract as tarExtract } from 'tar-stream';
import { AppGenerateService } from './AppGenerateService';
import { TEMPLATE_DEPENDENCIES } from './templateDependencies';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const PROJECT_UUID = 'proj-uuid-1';
const PROJECT_ORG_UUID = 'org-uuid-project'; // org derived from the project
const USER_ORG_UUID = 'org-uuid-user'; // org from the user session (different)
const USER_UUID = 'user-uuid-1';
const NEW_APP_UUID = 'new-app-uuid';
const EXISTING_APP_UUID = 'existing-app-uuid';

const makeUser = () =>
    ({
        userUuid: USER_UUID,
        organizationUuid: USER_ORG_UUID,
    }) as never;

const makeCode = (files?: DataAppCode['files']): DataAppCode => ({
    manifest: {
        codeVersion: 1,
        appUuid: 'some-uuid',
        projectUuid: PROJECT_UUID,
        version: 1,
        name: 'Test App',
        description: 'A test app',
        template: null,
        downloadedAt: new Date().toISOString(),
    },
    files: files ?? [
        {
            path: 'src/index.tsx',
            contentBase64: Buffer.from('hello').toString('base64'),
        },
        {
            path: 'src/App.tsx',
            contentBase64: Buffer.from('world').toString('base64'),
        },
    ],
});

const makeDeps = (
    customDeps: Record<string, string> = {},
    opts: { sdkVersion?: string; lockfile?: string } = {},
): DataAppDependencies => {
    const dependencies = {
        ...TEMPLATE_DEPENDENCIES,
        '@lightdash/query-sdk': opts.sdkVersion ?? '0.999.0',
        ...customDeps,
    };
    return {
        packageJson: JSON.stringify({ dependencies }),
        lockfile:
            opts.lockfile ??
            `lockfileVersion: '9.0'\n# ${Object.keys(dependencies).join(' ')}\n`,
    };
};

const s3SendSpy = vi.fn().mockResolvedValue({});

function buildService(
    opts: {
        customDependenciesEnabled?: boolean;
        customDependenciesOrgEnabled?: boolean;
    } = {},
) {
    const appModel = {
        findApp: vi.fn(),
        getApp: vi.fn(),
        createWithVersion: vi.fn().mockResolvedValue({
            app: { app_id: NEW_APP_UUID },
            version: { version: 1 },
        }),
        createVersion: vi.fn().mockResolvedValue({ version: 1 }),
        getLatestVersion: vi.fn().mockResolvedValue(null),
        countInProgressVersionsForProject: vi.fn().mockResolvedValue(0),
        updateApp: vi.fn().mockResolvedValue({}),
    };

    const schedulerClient = {
        appBuildFromSource: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };

    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => {
            if (
                featureFlagId === FeatureFlags.EnableDataAppCustomDependencies
            ) {
                return {
                    enabled: opts.customDependenciesOrgEnabled ?? true,
                };
            }
            return { enabled: true };
        }),
    };

    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: PROJECT_ORG_UUID,
            projectUuid: PROJECT_UUID,
        }),
    };

    const spacePermissionService = {
        getSpaceAccessContext: vi.fn().mockResolvedValue({}),
    };

    const lightdashConfig = {
        appRuntime: {
            customDependenciesEnabled: opts.customDependenciesEnabled ?? true,
        },
    };

    const service = new AppGenerateService({
        lightdashConfig: lightdashConfig as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: projectModel as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    // Stub ability checks to allow everything
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => true,
        cannot: () => false,
    });

    // Stub getS3Client to return our spy
    vi.spyOn(
        service as unknown as { getS3Client: () => unknown },
        'getS3Client',
    ).mockReturnValue({
        client: { send: s3SendSpy },
        bucket: 'test-bucket',
    });

    return { service, appModel, schedulerClient };
}

describe('AppGenerateService.importAppCode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        s3SendSpy.mockResolvedValue({});
    });

    it('create mode: creates a new app with version 1 and enqueues build', async () => {
        const { service, appModel, schedulerClient } = buildService();

        appModel.findApp.mockResolvedValue(undefined); // no existing app

        const result = await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: makeCode(),
        } as ImportAppCodeRequestBody);

        expect(result.action).toBe('create');
        expect(result.version).toBe(1);
        expect(result.appUuid).toBe(NEW_APP_UUID);

        // createWithVersion called with pending status
        expect(appModel.createWithVersion).toHaveBeenCalledWith(
            expect.objectContaining({ project_uuid: PROJECT_UUID }),
            { version: 1, prompt: '' },
            'pending',
            expect.any(Object),
            undefined, // no declared dependencies
        );

        // S3 PutObjectCommand sent for source.tar
        expect(s3SendSpy).toHaveBeenCalledOnce();
        const putArg = s3SendSpy.mock.calls[0][0];
        expect(putArg.input.Key).toMatch(
            new RegExp(`apps/${NEW_APP_UUID}/versions/1/source\\.tar$`),
        );
        expect(putArg.input.Bucket).toBe('test-bucket');

        // scheduler enqueued with project org, not user's org
        expect(schedulerClient.appBuildFromSource).toHaveBeenCalledWith({
            appUuid: NEW_APP_UUID,
            version: 1,
            projectUuid: PROJECT_UUID,
            organizationUuid: PROJECT_ORG_UUID,
            userUuid: USER_UUID,
        });
        expect(schedulerClient.appBuildFromSource).not.toHaveBeenCalledWith(
            expect.objectContaining({ organizationUuid: USER_ORG_UUID }),
        );
    });

    it('append mode: appends version 5 when latest is 4 and enqueues build', async () => {
        const { service, appModel, schedulerClient } = buildService();

        const existingApp = {
            app_id: EXISTING_APP_UUID,
            project_uuid: PROJECT_UUID,
            space_uuid: null,
            created_by_user_uuid: USER_UUID,
            organization_uuid: PROJECT_ORG_UUID,
            name: 'Test App',
            description: 'A test app',
        };
        appModel.findApp.mockResolvedValue(existingApp);
        appModel.getLatestVersion.mockResolvedValue({ version: 4 });

        const result = await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: makeCode(),
            targetAppUuid: EXISTING_APP_UUID,
        } as ImportAppCodeRequestBody);

        expect(result.action).toBe('append');
        expect(result.version).toBe(5);
        expect(result.appUuid).toBe(EXISTING_APP_UUID);

        // createVersion called with pending status and version 5
        expect(appModel.createVersion).toHaveBeenCalledWith(
            EXISTING_APP_UUID,
            { version: 5, prompt: '' },
            'pending',
            USER_UUID,
            expect.any(Object),
            undefined, // no declared dependencies
        );

        // scheduler enqueued with version 5 and project org, not user's org
        expect(schedulerClient.appBuildFromSource).toHaveBeenCalledWith({
            appUuid: EXISTING_APP_UUID,
            version: 5,
            projectUuid: PROJECT_UUID,
            organizationUuid: PROJECT_ORG_UUID,
            userUuid: USER_UUID,
        });
        expect(schedulerClient.appBuildFromSource).not.toHaveBeenCalledWith(
            expect.objectContaining({ organizationUuid: USER_ORG_UUID }),
        );
    });

    it('throws ParameterError when targetAppUuid is given but app is not found', async () => {
        const { service, appModel, schedulerClient } = buildService();

        appModel.findApp.mockResolvedValue(undefined); // not found

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: makeCode(),
                targetAppUuid: EXISTING_APP_UUID,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow(ParameterError);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: makeCode(),
                targetAppUuid: EXISTING_APP_UUID,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow(
            `App ${EXISTING_APP_UUID} not found in project ${PROJECT_UUID}`,
        );

        // must not create or enqueue
        expect(appModel.createWithVersion).not.toHaveBeenCalled();
        expect(schedulerClient.appBuildFromSource).not.toHaveBeenCalled();
    });

    it('throws ParameterError when bundle has no src/ files', async () => {
        const { service } = buildService();

        const noSrcCode = makeCode([
            {
                path: 'public/index.html',
                contentBase64: Buffer.from('<html></html>').toString('base64'),
            },
            {
                path: 'dist/bundle.js',
                contentBase64: Buffer.from('console.log(1)').toString('base64'),
            },
        ]);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: noSrcCode,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow(ParameterError);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: noSrcCode,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow('bundle has no src/ files to build');
    });

    it('throws TooManyRequestsError when in-progress build count is at the cap', async () => {
        const { service, appModel, schedulerClient } = buildService();

        appModel.findApp.mockResolvedValue(undefined);
        appModel.countInProgressVersionsForProject.mockResolvedValue(5);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: makeCode(),
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow(TooManyRequestsError);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: makeCode(),
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow('Too many app builds in progress for this project');

        // must not create a version or enqueue a build
        expect(appModel.createWithVersion).not.toHaveBeenCalled();
        expect(schedulerClient.appBuildFromSource).not.toHaveBeenCalled();
    });

    it('proceeds normally when in-progress build count is zero', async () => {
        const { service, appModel, schedulerClient } = buildService();

        appModel.findApp.mockResolvedValue(undefined);
        appModel.countInProgressVersionsForProject.mockResolvedValue(0);

        const result = await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: makeCode(),
        } as ImportAppCodeRequestBody);

        expect(result.action).toBe('create');
        expect(appModel.createWithVersion).toHaveBeenCalledOnce();
        expect(schedulerClient.appBuildFromSource).toHaveBeenCalledOnce();
    });

    it('append mode: calls updateApp when manifest name and description differ from existing app', async () => {
        const { service, appModel } = buildService();

        const existingApp = {
            app_id: EXISTING_APP_UUID,
            project_uuid: PROJECT_UUID,
            space_uuid: null,
            created_by_user_uuid: USER_UUID,
            organization_uuid: PROJECT_ORG_UUID,
            name: 'Old Name',
            description: 'Old description',
        };
        appModel.findApp.mockResolvedValue(existingApp);
        appModel.getLatestVersion.mockResolvedValue({ version: 1 });

        const updatedCode = makeCode();
        updatedCode.manifest.name = 'New Name';
        updatedCode.manifest.description = 'New description';

        await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: updatedCode,
            targetAppUuid: EXISTING_APP_UUID,
        } as ImportAppCodeRequestBody);

        expect(appModel.updateApp).toHaveBeenCalledOnce();
        expect(appModel.updateApp).toHaveBeenCalledWith(
            EXISTING_APP_UUID,
            PROJECT_UUID,
            { name: 'New Name', description: 'New description' },
        );
    });

    it('append mode: does not call updateApp when manifest name and description are unchanged', async () => {
        const { service, appModel } = buildService();

        const existingApp = {
            app_id: EXISTING_APP_UUID,
            project_uuid: PROJECT_UUID,
            space_uuid: null,
            created_by_user_uuid: USER_UUID,
            organization_uuid: PROJECT_ORG_UUID,
            name: 'Test App',
            description: 'A test app',
        };
        appModel.findApp.mockResolvedValue(existingApp);
        appModel.getLatestVersion.mockResolvedValue({ version: 1 });

        await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: makeCode(),
            targetAppUuid: EXISTING_APP_UUID,
        } as ImportAppCodeRequestBody);

        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('throws ParameterError when custom deps are present but customDependenciesEnabled is false', async () => {
        const { service, appModel } = buildService({
            customDependenciesEnabled: false,
        });

        appModel.findApp.mockResolvedValue(undefined);

        const codeWithCustomDep = {
            ...makeCode(),
            dependencies: makeDeps({ 'deck.gl': '9.3.5' }),
        };

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: codeWithCustomDep,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow(ParameterError);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: codeWithCustomDep,
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow('LIGHTDASH_APP_CUSTOM_DEPENDENCIES_ENABLED');
    });

    it('accepts template-only upload when customDependenciesEnabled is false', async () => {
        const { service, appModel, schedulerClient } = buildService({
            customDependenciesEnabled: false,
        });

        appModel.findApp.mockResolvedValue(undefined);

        // Template-only = no custom deps above the baseline
        const result = await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: { ...makeCode(), dependencies: makeDeps() },
        } as ImportAppCodeRequestBody);

        expect(result.action).toBe('create');
        expect(schedulerClient.appBuildFromSource).toHaveBeenCalledOnce();
    });

    it('rejects custom deps when the instance allows them but the org flag is off', async () => {
        const { service, appModel } = buildService({
            customDependenciesEnabled: true,
            customDependenciesOrgEnabled: false,
        });

        appModel.findApp.mockResolvedValue(undefined);

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, {
                code: {
                    ...makeCode(),
                    dependencies: makeDeps({ 'deck.gl': '9.3.5' }),
                },
            } as ImportAppCodeRequestBody),
        ).rejects.toThrow('not enabled for your organization');
    });

    it('accepts custom deps when both the instance and org flag allow them', async () => {
        const { service, appModel, schedulerClient } = buildService({
            customDependenciesEnabled: true,
            customDependenciesOrgEnabled: true,
        });

        appModel.findApp.mockResolvedValue(undefined);

        const result = await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: {
                ...makeCode(),
                dependencies: makeDeps({ 'deck.gl': '9.3.5' }),
            },
        } as ImportAppCodeRequestBody);

        expect(result.action).toBe('create');
        expect(schedulerClient.appBuildFromSource).toHaveBeenCalledOnce();
    });

    it('create mode: source.tar contains only src/ entries when bundle has mixed files', async () => {
        const { service, appModel } = buildService();

        appModel.findApp.mockResolvedValue(undefined);

        const mixedCode = makeCode([
            {
                path: 'src/App.jsx',
                contentBase64: Buffer.from('// app').toString('base64'),
            },
            {
                path: 'vite.config.js',
                contentBase64: Buffer.from('// vite').toString('base64'),
            },
            {
                path: '.lightdash/context/semantic-layer.yml',
                contentBase64: Buffer.from('# context').toString('base64'),
            },
        ]);

        await service.importAppCode(makeUser(), PROJECT_UUID, {
            code: mixedCode,
        } as ImportAppCodeRequestBody);

        const putArg = s3SendSpy.mock.calls[0][0];
        const tarBuffer = putArg.input.Body as Buffer;

        const entryNames = await new Promise<string[]>((resolve, reject) => {
            const names: string[] = [];
            const extractor = tarExtract();
            extractor.on('entry', (header, stream, next) => {
                names.push(header.name);
                stream.resume();
                stream.on('end', next);
            });
            extractor.on('finish', () => resolve(names));
            extractor.on('error', reject);
            extractor.end(tarBuffer);
        });

        expect(entryNames).toEqual(['src/App.jsx']);
    });
});
