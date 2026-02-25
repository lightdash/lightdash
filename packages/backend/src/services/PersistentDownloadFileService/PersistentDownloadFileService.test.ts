import { NotFoundError } from '@lightdash/common';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { DbPersistentDownloadFile } from '../../database/entities/persistentDownloadFile';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import {
    PersistentDownloadFileService,
    type PersistentFile,
} from './PersistentDownloadFileService';

const mockS3GetFileUrl = jest.fn();
const mockS3GetFileStream = jest.fn();
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
            getFileStream: mockS3GetFileStream,
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

    describe('getFile', () => {
        it('should return file metadata for valid non-expired file', async () => {
            const futureDate = new Date(Date.now() + 3600 * 1000);
            mockModelGet.mockResolvedValue({
                nanoid: 'test-nanoid-123456789',
                s3_key: 'exports/test-file.csv',
                file_type: 'csv',
                expires_at: futureDate,
                organization_uuid: 'org-uuid-123',
                project_uuid: 'project-uuid-456',
                created_by_user_uuid: 'user-uuid-789',
            } as DbPersistentDownloadFile);

            const service = createService({ enabled: true });
            const file = await service.getFile('test-nanoid-123456789');

            expect(file).toEqual({
                nanoid: 'test-nanoid-123456789',
                s3Key: 'exports/test-file.csv',
                fileType: 'csv',
                organizationUuid: 'org-uuid-123',
                projectUuid: 'project-uuid-456',
                createdByUserUuid: 'user-uuid-789',
            });
            expect(mockModelGet).toHaveBeenCalledWith('test-nanoid-123456789');
        });

        it('should throw NotFoundError for expired file', async () => {
            const pastDate = new Date(Date.now() - 3600 * 1000);
            mockModelGet.mockResolvedValue({
                nanoid: 'test-nanoid-123456789',
                s3_key: 'exports/test-file.csv',
                file_type: 'csv',
                expires_at: pastDate,
            } as DbPersistentDownloadFile);

            const service = createService({ enabled: true });

            await expect(
                service.getFile('test-nanoid-123456789'),
            ).rejects.toThrow(NotFoundError);
        });

        it('should throw NotFoundError for non-existent file', async () => {
            mockModelGet.mockRejectedValue(
                new NotFoundError('Cannot find file'),
            );

            const service = createService({ enabled: true });

            await expect(
                service.getFile('nonexistent-nanoid1234'),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('getFileStream', () => {
        const validFile: PersistentFile = {
            nanoid: 'test-nanoid-123456789',
            s3Key: 'exports/test-image.png',
            fileType: 'image',
            organizationUuid: 'org-uuid-123',
            projectUuid: 'project-uuid-456',
            createdByUserUuid: 'user-uuid-789',
        };

        it('should return stream and file type for valid file', async () => {
            const mockStream = { pipe: jest.fn() };
            mockS3GetFileStream.mockResolvedValue(mockStream);

            const service = createService({ enabled: true });
            const result = await service.getFileStream(validFile);

            expect(result.stream).toBe(mockStream);
            expect(result.fileType).toBe('image');
            expect(mockS3GetFileStream).toHaveBeenCalledWith(
                'exports/test-image.png',
            );
            expect(mockModelGet).not.toHaveBeenCalled();
        });
    });

    describe('getSignedUrl', () => {
        const validFile: PersistentFile = {
            nanoid: 'test-nanoid-123456789',
            s3Key: 'exports/test-file.csv',
            fileType: 'csv',
            organizationUuid: 'org-uuid-123',
            projectUuid: 'project-uuid-456',
            createdByUserUuid: 'user-uuid-789',
        };

        it('should return fresh S3 signed URL for valid file', async () => {
            mockS3GetFileUrl.mockResolvedValue(
                'http://mock-s3:9000/mock_bucket/exports/test-file.csv?signed',
            );

            const service = createService({ enabled: true });
            const url = await service.getSignedUrl(validFile);

            expect(url).toBe(
                'http://mock-s3:9000/mock_bucket/exports/test-file.csv?signed',
            );
            expect(mockModelGet).not.toHaveBeenCalled();
            expect(mockS3GetFileUrl).toHaveBeenCalledWith(
                'exports/test-file.csv',
                300,
            );
        });
    });
});
