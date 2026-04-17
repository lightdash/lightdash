import { DownloadFileType, NotFoundError } from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type DownloadFileModel } from '../../models/DownloadFileModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
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

function createService() {
    return new UnfurlService({
        lightdashConfig: {
            siteUrl: 'https://app.lightdash.cloud',
        } as unknown as LightdashConfig,
        dashboardModel: {} as unknown as DashboardModel,
        savedChartModel: {} as unknown as SavedChartModel,
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
});
