import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ProjectType,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import {
    buildAppThumbnailClientMock,
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

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('a screenshot of real data'),
]);

const ability = new Ability(
    ['manage', 'create'].map((action) => ({
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

/**
 * A service whose org has the given stored captures choice, on an instance
 * whose `LIGHTDASH_APP_CAPTURES_ENABLED` is `capturesEnabledOnInstance`.
 */
const buildService = ({
    storedCapturesChoice = null,
    capturesEnabledOnInstance = true,
}: {
    storedCapturesChoice?: boolean | null;
    capturesEnabledOnInstance?: boolean;
} = {}) => {
    const appRow = {
        app_id: APP_UUID,
        project_uuid: PROJECT_UUID,
        organization_uuid: ORGANIZATION_UUID,
        space_uuid: null,
        created_by_user_uuid: 'builder',
        name: 'Revenue app',
        template: 'dashboard',
    };
    const appModel = {
        getApp: async () => appRow,
        findApp: async () => appRow,
        findAppByUuid: async () => appRow,
    };
    const appThumbnailClient = buildAppThumbnailClientMock({
        appModel: appModel as never,
        capturesEnabledOnInstance,
        organizationSettingsModel: organizationSettingsModelWith(
            () => null,
            () => storedCapturesChoice,
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

    return { service, uploadScreenshot, uploadThumbnail };
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
});
