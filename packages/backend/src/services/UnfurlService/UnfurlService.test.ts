import {
    DownloadFileType,
    LightdashPage,
    NotFoundError,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type DownloadFileModel } from '../../models/DownloadFileModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
import { type SavedSqlModel } from '../../models/SavedSqlModel';
import { type ShareModel } from '../../models/ShareModel';
import { type SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { type SlackUnfurlImageModel } from '../../models/SlackUnfurlImageModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UnfurlService } from './UnfurlService';

const mockFileStorageClient = {
    isEnabled: jest.fn(),
    uploadImage: jest.fn(),
    getFileUrl: jest.fn(),
    objectExists: jest.fn(),
    uploadPdf: jest.fn(),
    uploadTxt: jest.fn(),
    uploadCsv: jest.fn(),
    uploadZip: jest.fn(),
    uploadExcel: jest.fn(),
    streamResults: jest.fn(),
    getFileStream: jest.fn(),
    createUploadStream: jest.fn(),
    expirationDays: undefined,
};

const mockSlackUnfurlImageModel = {
    create: jest.fn(),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
};

const mockDownloadFileModel = {
    createDownloadFile: jest.fn(),
    getDownloadFile: jest.fn(),
};

function createService(
    overrides: Partial<{
        savedSqlModel: Partial<SavedSqlModel>;
    }> = {},
) {
    return new UnfurlService({
        lightdashConfig: {
            siteUrl: 'https://app.lightdash.cloud',
            headlessBrowser: {
                internalLightdashHost: 'http://headless-browser:8080',
            },
        } as unknown as LightdashConfig,
        dashboardModel: {} as unknown as DashboardModel,
        savedChartModel: {} as unknown as SavedChartModel,
        savedSqlModel: (overrides.savedSqlModel ??
            {}) as unknown as SavedSqlModel,
        shareModel: {} as unknown as ShareModel,
        fileStorageClient:
            mockFileStorageClient as unknown as FileStorageClient,
        slackClient: {} as unknown as SlackClient,
        projectModel: {} as unknown as ProjectModel,
        downloadFileModel:
            mockDownloadFileModel as unknown as DownloadFileModel,
        slackUnfurlImageModel:
            mockSlackUnfurlImageModel as unknown as SlackUnfurlImageModel,
        analytics: {} as unknown as LightdashAnalytics,
        slackAuthenticationModel: {} as unknown as SlackAuthenticationModel,
        spacePermissionService: {} as unknown as SpacePermissionService,
    });
}

describe('UnfurlService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getPreviewSignedUrl', () => {
        const service = createService();

        it('returns a signed URL when the storage object exists', async () => {
            mockSlackUnfurlImageModel.get.mockResolvedValueOnce({
                nanoid: 'abcdefghijklmnopqrstu',
                s3_key: 'slack-image-xyz.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
            });
            mockFileStorageClient.objectExists.mockResolvedValueOnce(true);
            mockFileStorageClient.getFileUrl.mockResolvedValueOnce(
                'https://s3.example.com/signed-url',
            );

            const result = await service.getPreviewSignedUrl(
                'abcdefghijklmnopqrstu',
            );

            expect(result).toBe('https://s3.example.com/signed-url');
        });

        it('throws NotFoundError when the DB row does not exist', async () => {
            mockSlackUnfurlImageModel.get.mockRejectedValueOnce(
                new NotFoundError('Slack unfurl image not found'),
            );

            await expect(
                service.getPreviewSignedUrl('nonexistentnanoid12345'),
            ).rejects.toThrow(NotFoundError);
        });

        it('throws NotFoundError when the storage object is missing', async () => {
            mockSlackUnfurlImageModel.get.mockResolvedValueOnce({
                nanoid: 'deadkeyabcdefghijklmn',
                s3_key: 'slack-image-deleted.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
            });
            mockFileStorageClient.objectExists.mockResolvedValueOnce(false);

            await expect(
                service.getPreviewSignedUrl('deadkeyabcdefghijklmn'),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('unfurlImage image URL strategy', () => {
        const service = createService();
        const imageBuffer = Buffer.from('fake-png');

        beforeEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            jest.spyOn(service as any, 'getUserCookie').mockResolvedValue(
                'mock-cookie',
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            jest.spyOn(service as any, 'saveScreenshot').mockResolvedValue({
                imageBuffer,
                pdfBuffer: undefined,
            });
        });

        const callUnfurlImage = (orgUuid: string | undefined) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            jest.spyOn(service as any, 'unfurlDetails').mockResolvedValue(
                orgUuid
                    ? {
                          title: 'Test',
                          organizationUuid: orgUuid,
                          pageType: 'dashboard',
                          minimalUrl: 'https://app.lightdash.cloud/test',
                          imageUrl: undefined,
                      }
                    : undefined,
            );

            return service.unfurlImage({
                url: 'https://app.lightdash.cloud/test',
                imageId: 'slack-image-test_abc',
                authUserUuid: 'user-uuid-1',
                context: 'slack' as never,
                selectedTabs: null,
            });
        };

        it('S3 enabled + orgUuid → creates preview record and returns preview URL', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );
            mockSlackUnfurlImageModel.create.mockResolvedValue(undefined);

            const result = await callUnfurlImage('org-uuid-1');

            expect(mockFileStorageClient.uploadImage).toHaveBeenCalledWith(
                imageBuffer,
                'slack-image-test_abc',
            );
            expect(mockSlackUnfurlImageModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    s3Key: 'slack-image-test_abc.png',
                    organizationUuid: 'org-uuid-1',
                }),
            );
            expect(result.imageUrl).toMatch(
                /^https:\/\/app\.lightdash\.cloud\/api\/v1\/slack\/preview\//,
            );
        });

        it('missing orgUuid → returns raw S3 URL, no DB create', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(true);
            mockFileStorageClient.uploadImage.mockResolvedValue(
                'https://s3.example.com/raw-signed-url',
            );

            const result = await callUnfurlImage(undefined);

            expect(mockFileStorageClient.uploadImage).toHaveBeenCalled();
            expect(mockSlackUnfurlImageModel.create).not.toHaveBeenCalled();
            expect(result.imageUrl).toBe(
                'https://s3.example.com/raw-signed-url',
            );
        });

        it('S3 disabled → uses local /tmp path', async () => {
            mockFileStorageClient.isEnabled.mockReturnValue(false);
            mockDownloadFileModel.createDownloadFile.mockResolvedValue(
                undefined,
            );

            const result = await callUnfurlImage('org-uuid-1');

            expect(mockSlackUnfurlImageModel.create).not.toHaveBeenCalled();
            expect(mockDownloadFileModel.createDownloadFile).toHaveBeenCalled();
            expect(result.imageUrl).toMatch(
                /^https:\/\/app\.lightdash\.cloud\/api\/v1\/slack\/image\//,
            );
        });
    });

    describe('parseUrl - SQL Runner charts', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const SQL_CHART_UUID = '11111111-2222-3333-4444-555555555555';

        it('recognizes a saved SQL Runner URL and rewrites to a minimal URL', async () => {
            const getBySlug = jest.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'my chart',
                description: null,
            });
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/my-saved-chart`,
            );

            expect(result.isValid).toBe(true);
            expect(result.lightdashPage).toBe('sql_chart');
            expect(result.projectUuid).toBe(PROJECT_UUID);
            expect(result.savedSqlUuid).toBe(SQL_CHART_UUID);
            expect(result.minimalUrl).toBe(
                `http://headless-browser:8080/minimal/projects/${PROJECT_UUID}/sql-runner/${SQL_CHART_UUID}`,
            );
            expect(getBySlug).toHaveBeenCalledWith(
                PROJECT_UUID,
                'my-saved-chart',
            );
        });

        it('also recognizes `/sql-runner/<slug>/edit` and resolves to the same minimal URL', async () => {
            const getBySlug = jest.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'my chart',
                description: null,
            });
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/my-saved-chart/edit`,
            );

            expect(result.isValid).toBe(true);
            expect(result.savedSqlUuid).toBe(SQL_CHART_UUID);
            expect(getBySlug).toHaveBeenCalledWith(
                PROJECT_UUID,
                'my-saved-chart',
            );
        });

        it('returns isValid: false when the slug does not resolve to a saved chart', async () => {
            const getBySlug = jest
                .fn()
                .mockRejectedValue(new Error('not found'));
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner/missing-chart`,
            );

            expect(result.isValid).toBe(false);
        });

        it('returns isValid: false for `/sql-runner` with no slug (unsaved chart)', async () => {
            const getBySlug = jest.fn();
            const service = createService({
                savedSqlModel: { getBySlug } as Partial<SavedSqlModel>,
            });

            const result = await service.parseUrl(
                `https://app.lightdash.cloud/projects/${PROJECT_UUID}/sql-runner`,
            );

            expect(result.isValid).toBe(false);
            expect(getBySlug).not.toHaveBeenCalled();
        });
    });

    describe('getTitleAndDescription - SQL_CHART', () => {
        const PROJECT_UUID = '21eef0b9-5bae-40f3-851e-9554588e71a6';
        const SQL_CHART_UUID = '11111111-2222-3333-4444-555555555555';

        it('returns chart name + description + organizationUuid from saved_sql', async () => {
            const getByUuid = jest.fn().mockResolvedValue({
                savedSqlUuid: SQL_CHART_UUID,
                name: 'Prompts created over time',
                description: 'A monthly trend of AI prompts',
                organization: {
                    organizationUuid: '00000000-0000-0000-0000-000000000aaa',
                },
            });
            const service = createService({
                savedSqlModel: { getByUuid } as Partial<SavedSqlModel>,
            });

            const result = await service.getTitleAndDescription(
                {
                    isValid: true,
                    lightdashPage: LightdashPage.SQL_CHART,
                    url: 'irrelevant',
                    minimalUrl: 'irrelevant',
                    projectUuid: PROJECT_UUID,
                    savedSqlUuid: SQL_CHART_UUID,
                },
                null,
            );

            expect(result.title).toBe('Prompts created over time');
            expect(result.description).toBe('A monthly trend of AI prompts');
            expect(result.organizationUuid).toBe(
                '00000000-0000-0000-0000-000000000aaa',
            );
            expect(result.resourceUuid).toBe(SQL_CHART_UUID);
            expect(getByUuid).toHaveBeenCalledWith(SQL_CHART_UUID);
        });
    });
});
