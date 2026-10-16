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
    organizationSettingsModelWith,
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
const IMAGE_ID = '0f4c5d6e-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('a screenshot of real data'),
]);

const ability = new Ability(
    ['manage', 'create', 'view'].map((action) => ({
        action,
        subject: 'DataApp',
        conditions: { projectUuid: PROJECT_UUID },
    })),
);
const builder = {
    userUuid: 'builder',
    organizationUuid: ORGANIZATION_UUID,
    isActive: true,
    ability,
    abilityRules: ability.rules,
} as unknown as SessionUser;

type AppModelFake = AppThumbnailClientArgs['appModel'];
type AppRow = Awaited<ReturnType<AppModelFake['getApp']>>;
type VersionRow = NonNullable<Awaited<ReturnType<AppModelFake['getVersion']>>>;

/**
 * A service whose org has the given stored captures choice (changeable while
 * the test runs), on an instance whose `LIGHTDASH_APP_CAPTURES_ENABLED` is
 * `capturesEnabledOnInstance`.
 */
const buildService = ({
    storedCapturesChoice = null,
    capturesEnabledOnInstance = true,
}: {
    storedCapturesChoice?: boolean | null;
    capturesEnabledOnInstance?: boolean;
} = {}) => {
    const captures = { stored: storedCapturesChoice };
    const appRow = {
        app_id: APP_UUID,
        project_uuid: PROJECT_UUID,
        organization_uuid: ORGANIZATION_UUID,
        space_uuid: null,
        created_by_user_uuid: 'builder',
        name: 'Revenue app',
        template: 'dashboard',
    } as AppRow;
    const version = {
        app_id: APP_UUID,
        version: 1,
        status: 'ready',
        created_by_user_uuid: 'builder',
        thumbnail_captured_at: null,
        thumbnail_is_manual: null,
    } as VersionRow;
    const appImageExists = vi.fn(async () => true);
    const appModel: AppModelFake & {
        findApp: () => Promise<AppRow>;
        appImageExists: typeof appImageExists;
    } = {
        getApp: async () => appRow,
        findApp: async () => appRow,
        findAppByUuid: async () => appRow,
        appImageExists,
        getVersion: async () => version,
        getLatestReadyVersion: async () => version,
        hasAnyVersionThumbnail: async () =>
            version.thumbnail_captured_at !== null,
        setVersionThumbnail: async (_appUuid, _version, { isManual }) => {
            version.thumbnail_captured_at = new Date();
            version.thumbnail_is_manual = isManual;
            return true;
        },
        clearVersionThumbnail: async () => {
            version.thumbnail_captured_at = null;
            version.thumbnail_is_manual = null;
        },
    };
    const { storage, download } = createInMemoryAppThumbnailStorage();
    const appThumbnailClient = buildAppThumbnailClientMock({
        appModel,
        storage,
        capturesEnabledOnInstance,
        organizationSettingsModel: organizationSettingsModelWith(
            () => null,
            () => captures.stored,
        ),
    });
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
        appThumbnailClient,
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });

    const uploadScreenshot = () => {
        const body = Readable.from([png]);
        const read = vi.spyOn(body, 'read');
        return {
            result: service.uploadFile(
                builder,
                PROJECT_UUID,
                'image/png',
                body,
                png.length,
                APP_UUID,
                'screenshot.png',
                'screenshot',
            ),
            bodyWasRead: () => read.mock.calls.length > 0,
        };
    };
    const uploadThumbnail = () =>
        service.uploadThumbnail(
            builder,
            PROJECT_UUID,
            'image/png',
            Readable.from([png]),
            png.length,
            APP_UUID,
            null,
        );
    /** The served app thumbnail, or null when the API says there is none. */
    const appThumbnail = async () => {
        try {
            const { thumbnailUrl } = await service.getThumbnailUrl(
                builder,
                PROJECT_UUID,
                APP_UUID,
            );
            return download(thumbnailUrl);
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    };
    const versionThumbnail = async () => {
        try {
            const { thumbnailUrl } = await service.getVersionThumbnailUrl(
                builder,
                PROJECT_UUID,
                APP_UUID,
                1,
            );
            return download(thumbnailUrl);
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    };

    const attachedImage = () =>
        service.getImageUrl(builder, PROJECT_UUID, APP_UUID, IMAGE_ID);

    return {
        service,
        captures,
        appImageExists,
        uploadScreenshot,
        uploadThumbnail,
        appThumbnail,
        versionThumbnail,
        attachedImage,
    };
};

describe('AppGenerateService data app captures switch', () => {
    it('is on for an organization that never changed it', async () => {
        const { service } = buildService();

        expect(await service.areDataAppCapturesEnabled(ORGANIZATION_UUID)).toBe(
            true,
        );
    });

    it('is off when the organization turned it off', async () => {
        const { service } = buildService({ storedCapturesChoice: false });

        expect(await service.areDataAppCapturesEnabled(ORGANIZATION_UUID)).toBe(
            false,
        );
    });

    it('cannot be turned on past the instance env', async () => {
        const { service } = buildService({
            storedCapturesChoice: true,
            capturesEnabledOnInstance: false,
        });

        expect(await service.areDataAppCapturesEnabled(ORGANIZATION_UUID)).toBe(
            false,
        );
    });

    it('refuses a screenshot upload before reading its body while off', async () => {
        const { uploadScreenshot } = buildService({
            storedCapturesChoice: false,
        });

        const { result, bodyWasRead } = uploadScreenshot();

        await expect(result).rejects.toThrow(ForbiddenError);
        await expect(result).rejects.toThrow(
            'Screenshots and file attachments are disabled for this organization',
        );
        expect(bodyWasRead()).toBe(false);
    });

    it('refuses a manual thumbnail while off', async () => {
        const { uploadThumbnail } = buildService({
            storedCapturesChoice: false,
        });

        await expect(uploadThumbnail()).rejects.toThrow(ForbiddenError);
    });

    it('refuses both when the instance env has captures off, whatever the org set', async () => {
        const { uploadScreenshot, uploadThumbnail } = buildService({
            storedCapturesChoice: true,
            capturesEnabledOnInstance: false,
        });

        await expect(uploadScreenshot().result).rejects.toThrow(ForbiddenError);
        await expect(uploadThumbnail()).rejects.toThrow(ForbiddenError);
    });

    it('hides stored thumbnails while off and shows them again when turned back on', async () => {
        const s = buildService();
        await s.uploadThumbnail();
        expect(await s.appThumbnail()).toBe(png.toString());
        expect(await s.versionThumbnail()).toBe(png.toString());

        s.captures.stored = false;
        expect(await s.appThumbnail()).toBeNull();
        expect(await s.versionThumbnail()).toBeNull();

        s.captures.stored = true;
        expect(await s.appThumbnail()).toBe(png.toString());
        expect(await s.versionThumbnail()).toBe(png.toString());
    });

    it('hides images attached to earlier builds while off, before looking them up', async () => {
        const s = buildService({ storedCapturesChoice: false });

        await expect(s.attachedImage()).rejects.toThrow(NotFoundError);
        expect(s.appImageExists).not.toHaveBeenCalled();
    });

    it('looks attached images up as usual while on', async () => {
        const s = buildService();

        // No object storage in this harness, so the lookup is as far as it
        // gets; the point is that the captures guard let it through.
        await s.attachedImage().catch(() => undefined);
        expect(s.appImageExists).toHaveBeenCalledWith(APP_UUID, IMAGE_ID);
    });
});
