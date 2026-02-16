import { NotFoundError } from '@lightdash/common';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { DbPersistentDownloadFile } from '../../database/entities/persistentDownloadFile';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import { PersistentDownloadFileService } from './PersistentDownloadFileService';

const mockS3GetFileUrl = jest.fn();
const mockModelCreate = jest.fn();
const mockModelGet = jest.fn();

const baseData = {
    s3Key: 'exports/test-file.csv',
    fileType: 'csv',
    organizationUuid: 'org-uuid-123',
    projectUuid: 'project-uuid-456',
    createdByUserUuid: 'user-uuid-789',
};

const createService = (
    configOverrides: Partial<LightdashConfig['persistentDownloadUrls']> = {},
) =>
    new PersistentDownloadFileService({
        lightdashConfig: {
            ...lightdashConfigMock,
            persistentDownloadUrls: {
                ...lightdashConfigMock.persistentDownloadUrls,
                ...configOverrides,
            },
        },
        persistentDownloadFileModel: {
            create: mockModelCreate,
            get: mockModelGet,
        } as unknown as PersistentDownloadFileModel,
        fileStorageClient: {
            getFileUrl: mockS3GetFileUrl,
        } as unknown as FileStorageClient,
    });

describe('PersistentDownloadFileService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createPersistentUrl', () => {
        it('should return raw S3 URL when feature is disabled', async () => {
            mockS3GetFileUrl.mockResolvedValue(
                'https://s3.amazonaws.com/bucket/test-file.csv',
            );
            const service = createService({ enabled: false });

            const url = await service.createPersistentUrl(baseData);

            expect(url).toBe('https://s3.amazonaws.com/bucket/test-file.csv');
            expect(mockS3GetFileUrl).toHaveBeenCalledWith(baseData.s3Key);
            expect(mockModelCreate).not.toHaveBeenCalled();
        });

        it('should create persistent URL when feature is enabled', async () => {
            mockModelCreate.mockResolvedValue(undefined);
            const service = createService({
                enabled: true,
                expirationSeconds: 3600,
            });

            const url = await service.createPersistentUrl(baseData);

            expect(url).toMatch(
                /^https:\/\/test\.lightdash\.cloud\/api\/v1\/file\/[\w-]{21}$/,
            );
            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    s3Key: baseData.s3Key,
                    fileType: baseData.fileType,
                    organizationUuid: baseData.organizationUuid,
                    projectUuid: baseData.projectUuid,
                    createdByUserUuid: baseData.createdByUserUuid,
                    expiresAt: expect.any(Date),
                }),
            );
            expect(mockS3GetFileUrl).not.toHaveBeenCalled();
        });

        it('should set expiresAt based on configured expirationSeconds', async () => {
            mockModelCreate.mockResolvedValue(undefined);
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const service = createService({
                enabled: true,
                expirationSeconds: 7200,
            });

            await service.createPersistentUrl(baseData);

            const createCall = mockModelCreate.mock.calls[0][0];
            expect(createCall.expiresAt.getTime()).toBe(now + 7200 * 1000);

            jest.restoreAllMocks();
        });

        it('should use expirationSeconds override when provided', async () => {
            mockModelCreate.mockResolvedValue(undefined);
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const service = createService({
                enabled: true,
                expirationSeconds: 259200,
            });

            await service.createPersistentUrl({
                ...baseData,
                expirationSeconds: 86400,
            });

            const createCall = mockModelCreate.mock.calls[0][0];
            expect(createCall.expiresAt.getTime()).toBe(now + 86400 * 1000);

            jest.restoreAllMocks();
        });

        it('should fall back to config expirationSeconds when override is undefined', async () => {
            mockModelCreate.mockResolvedValue(undefined);
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const service = createService({
                enabled: true,
                expirationSeconds: 259200,
            });

            await service.createPersistentUrl({
                ...baseData,
                expirationSeconds: undefined,
            });

            const createCall = mockModelCreate.mock.calls[0][0];
            expect(createCall.expiresAt.getTime()).toBe(now + 259200 * 1000);

            jest.restoreAllMocks();
        });
    });

    describe('getSignedUrl', () => {
        it('should return fresh S3 signed URL for valid file', async () => {
            const futureDate = new Date(Date.now() + 3600 * 1000);
            mockModelGet.mockResolvedValue({
                nanoid: 'test-nanoid-123456789',
                s3_key: 'exports/test-file.csv',
                expires_at: futureDate,
            } as DbPersistentDownloadFile);
            mockS3GetFileUrl.mockResolvedValue(
                'http://mock-s3:9000/mock_bucket/exports/test-file.csv?signed',
            );

            const service = createService({ enabled: true });
            const url = await service.getSignedUrl('test-nanoid-123456789');

            expect(url).toBe(
                'http://mock-s3:9000/mock_bucket/exports/test-file.csv?signed',
            );
            expect(mockModelGet).toHaveBeenCalledWith('test-nanoid-123456789');
            expect(mockS3GetFileUrl).toHaveBeenCalledWith(
                'exports/test-file.csv',
                300,
            );
        });

        it('should throw NotFoundError for expired file', async () => {
            const pastDate = new Date(Date.now() - 3600 * 1000);
            mockModelGet.mockResolvedValue({
                nanoid: 'test-nanoid-123456789',
                s3_key: 'exports/test-file.csv',
                expires_at: pastDate,
            } as DbPersistentDownloadFile);

            const service = createService({ enabled: true });

            await expect(
                service.getSignedUrl('test-nanoid-123456789'),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileUrl).not.toHaveBeenCalled();
        });

        it('should throw NotFoundError when file does not exist', async () => {
            mockModelGet.mockRejectedValue(
                new NotFoundError('Cannot find file'),
            );

            const service = createService({ enabled: true });

            await expect(
                service.getSignedUrl('nonexistent-nanoid1234'),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
