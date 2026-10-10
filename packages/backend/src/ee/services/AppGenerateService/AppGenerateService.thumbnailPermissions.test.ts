import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ProjectType,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { type AppThumbnailClientArgs } from '../../clients/AppThumbnailClient';
import {
    buildAppThumbnailClientMock,
    createInMemoryAppThumbnailStorage,
} from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const ORGANIZATION_UUID = 'organization';
const PROJECT_UUID = 'project';
const APP_UUID = 'revenue-app';
const CHART_TYPE_UUID = 'funnel-chart-type';

const png = (label: string) =>
    Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(label),
    ]);

const userWith = (
    userUuid: string,
    rules: { action: string; subject: string }[],
): SessionUser => {
    const ability = new Ability(
        rules.map((rule) => ({
            ...rule,
            conditions: { projectUuid: PROJECT_UUID },
        })),
    );
    return {
        userUuid,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as SessionUser;
};

const manager = userWith('manager', [{ action: 'manage', subject: 'DataApp' }]);
const viewer = userWith('viewer', [{ action: 'view', subject: 'DataApp' }]);
const stranger = userWith('stranger', []);
const chartTypeAuthor = userWith('chart-type-author', [
    { action: 'manage', subject: 'Explore' },
]);

type AppModelFake = AppThumbnailClientArgs['appModel'];
type AppRow = Awaited<ReturnType<AppModelFake['getApp']>>;
type VersionRow = NonNullable<Awaited<ReturnType<AppModelFake['getVersion']>>>;

const buildScenario = () => {
    const appRow = (appUuid: string, template: string) =>
        ({
            app_id: appUuid,
            project_uuid: PROJECT_UUID,
            organization_uuid: ORGANIZATION_UUID,
            space_uuid: null,
            created_by_user_uuid: 'creator',
            name: appUuid,
            template,
        }) as AppRow;
    const apps = new Map<string, AppRow>([
        [APP_UUID, appRow(APP_UUID, 'dashboard')],
        [CHART_TYPE_UUID, appRow(CHART_TYPE_UUID, 'data_app_viz')],
    ]);
    const versions: VersionRow[] = [
        {
            app_id: APP_UUID,
            version: 1,
            status: 'ready',
            created_by_user_uuid: 'creator',
            thumbnail_captured_at: null,
            thumbnail_is_manual: null,
        } as VersionRow,
    ];
    const findVersion = (appUuid: string, version: number) =>
        versions.find(
            (row) => row.app_id === appUuid && row.version === version,
        ) ?? null;

    const appModel: AppModelFake = {
        getApp: async (appUuid, projectUuid) => {
            const app = apps.get(appUuid);
            if (!app || app.project_uuid !== projectUuid) {
                throw new NotFoundError('App not found');
            }
            return app;
        },
        findAppByUuid: async (appUuid) => apps.get(appUuid),
        getVersion: async (appUuid, version) => findVersion(appUuid, version),
        getLatestReadyVersion: async (appUuid) =>
            versions.findLast(
                (row) => row.app_id === appUuid && row.status === 'ready',
            ) ?? null,
        hasAnyVersionThumbnail: async (appUuid) =>
            versions.some(
                (row) =>
                    row.app_id === appUuid &&
                    row.thumbnail_captured_at !== null,
            ),
        setVersionThumbnail: async (appUuid, version, { isManual }) => {
            const row = findVersion(appUuid, version);
            if (!row) return false;
            row.thumbnail_captured_at = new Date();
            row.thumbnail_is_manual = isManual;
            return true;
        },
        clearVersionThumbnail: async (appUuid, version) => {
            const row = findVersion(appUuid, version);
            if (!row) return;
            row.thumbnail_captured_at = null;
            row.thumbnail_is_manual = null;
        },
    };

    const { storage, download } = createInMemoryAppThumbnailStorage();

    const service = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: { appRuntime: {} } as never,
        analytics: { track: () => undefined } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: { get: async () => ({ enabled: true }) } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: 'project-owner',
                upstreamProjectUuid: null,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                inheritsFromOrgOrProject: true,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock({ appModel, storage }),
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });

    const upload = (user: SessionUser, appUuid: string, image: Buffer) =>
        service.uploadThumbnail(
            user,
            PROJECT_UUID,
            'image/png',
            Readable.from([image]),
            image.length,
            appUuid,
            null,
        );

    const thumbnailAs = async (user: SessionUser, appUuid = APP_UUID) => {
        try {
            const { thumbnailUrl } = await service.getThumbnailUrl(
                user,
                PROJECT_UUID,
                appUuid,
            );
            return download(thumbnailUrl);
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    };

    return { service, upload, thumbnailAs };
};

describe('AppGenerateService thumbnail permissions', () => {
    it('gives anyone who can view the app its thumbnail', async () => {
        const s = buildScenario();
        await s.upload(manager, APP_UUID, png('hand-picked state'));

        expect(await s.thumbnailAs(viewer)).toBe(
            png('hand-picked state').toString(),
        );
    });

    it('refuses the thumbnail to a user who cannot view the app', async () => {
        const s = buildScenario();
        await s.upload(manager, APP_UUID, png('hand-picked state'));

        await expect(s.thumbnailAs(stranger)).rejects.toThrow(ForbiddenError);
    });

    it('refuses manual capture and removal to a user who can only view the app, changing nothing', async () => {
        const s = buildScenario();
        await s.upload(manager, APP_UUID, png('hand-picked state'));

        await expect(
            s.upload(viewer, APP_UUID, png('another state')),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            s.service.deleteThumbnail(viewer, PROJECT_UUID, APP_UUID, null),
        ).rejects.toThrow(ForbiddenError);

        expect(await s.thumbnailAs(manager)).toBe(
            png('hand-picked state').toString(),
        );
    });

    it('lets a user who can manage the app remove its thumbnail', async () => {
        const s = buildScenario();
        await s.upload(manager, APP_UUID, png('hand-picked state'));

        await s.service.deleteThumbnail(manager, PROJECT_UUID, APP_UUID, null);

        expect(await s.thumbnailAs(manager)).toBeNull();
    });

    it("gives a custom chart type's thumbnail only to a user who can use chart types", async () => {
        const s = buildScenario();
        await s.upload(manager, CHART_TYPE_UUID, png('funnel preview'));

        expect(await s.thumbnailAs(chartTypeAuthor, CHART_TYPE_UUID)).toBe(
            png('funnel preview').toString(),
        );
        await expect(s.thumbnailAs(viewer, CHART_TYPE_UUID)).rejects.toThrow(
            ForbiddenError,
        );
    });
});
