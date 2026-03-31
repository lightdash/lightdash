import { NotFoundError } from '@lightdash/common';
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
};

const mockDownloadFileModel = {
    createDownloadFile: jest.fn(),
    getDownloadFile: jest.fn(),
};

describe('UnfurlService', () => {
    describe('getPreviewSignedUrl', () => {
        const service = new UnfurlService({
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

        afterEach(() => {
            jest.clearAllMocks();
        });

        it('returns a signed URL for a valid record', async () => {
            mockSlackUnfurlImageModel.get.mockResolvedValueOnce({
                nanoid: 'abcdefghijklmnopqrstu',
                s3_key: 'slack-image-xyz.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
            });
            mockFileStorageClient.getFileUrl.mockResolvedValueOnce(
                'https://s3.example.com/signed-url',
            );

            const result = await service.getPreviewSignedUrl(
                'abcdefghijklmnopqrstu',
            );

            expect(result).toBe('https://s3.example.com/signed-url');
            expect(mockSlackUnfurlImageModel.get).toHaveBeenCalledWith(
                'abcdefghijklmnopqrstu',
            );
            expect(mockFileStorageClient.getFileUrl).toHaveBeenCalledWith(
                'slack-image-xyz.png',
                300,
            );
        });

        it('propagates NotFoundError when record does not exist', async () => {
            mockSlackUnfurlImageModel.get.mockRejectedValueOnce(
                new NotFoundError('Slack unfurl image not found'),
            );

            await expect(
                service.getPreviewSignedUrl('nonexistentnanoid12345'),
            ).rejects.toThrow(NotFoundError);

            expect(mockFileStorageClient.getFileUrl).not.toHaveBeenCalled();
        });
    });
});
