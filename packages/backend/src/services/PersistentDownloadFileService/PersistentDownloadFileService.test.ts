import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    PersistentDownloadFileAccessMode,
    PersistentDownloadFileStorage,
    PossibleAbilities,
    type Account,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import { Readable } from 'stream';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { buildAccount } from '../../auth/account/account.mock';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { DbPersistentDownloadFile } from '../../database/entities/persistentDownloadFile';
import { PersistentDownloadFileModel } from '../../models/PersistentDownloadFileModel';
import { PersistentDownloadFileService } from './PersistentDownloadFileService';

const mockS3GetFileUrl = vi.fn();
const mockS3GetFileStream = vi.fn();
const mockS3UploadImage = vi.fn();
const mockS3DeleteFile = vi.fn();
const mockUploadsGetFileStream = vi.fn();
const mockUploadsUploadImage = vi.fn();
const mockUploadsDeleteFile = vi.fn();
const mockModelCreate = vi.fn();
const mockModelGet = vi.fn();
const mockModelDelete = vi.fn();
const mockTrack = vi.fn();
const mockProjectGetSummary = vi.fn();
const mockAssertAnalyticsProjectAccess = vi.fn();

const baseData = {
    s3Key: 'exports/test-file.csv',
    fileType: 'csv',
    organizationUuid: 'test-org-uuid',
    projectUuid: 'test-project-uuid',
    createdByUserUuid: 'test-user-uuid',
    accessMode: PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR as const,
};

const createService = (
    configOverrides: Partial<LightdashConfig['persistentDownloadUrls']> = {},
    lightdashSecrets: LightdashConfig['lightdashSecrets'] = lightdashConfigMock.lightdashSecrets,
    {
        uploadsBucketConfigured = true,
    }: { uploadsBucketConfigured?: boolean } = {},
) =>
    new PersistentDownloadFileService({
        projectModel: { getSummary: mockProjectGetSummary },
        getProjectService: () => ({
            assertAnalyticsProjectAccess: mockAssertAnalyticsProjectAccess,
        }),
        analytics: {
            track: mockTrack,
        } as unknown as LightdashAnalytics,
        lightdashConfig: {
            ...lightdashConfigMock,
            lightdashSecrets,
            persistentDownloadUrls: {
                ...lightdashConfigMock.persistentDownloadUrls,
                enabled: true,
                ...configOverrides,
            },
        },
        persistentDownloadFileModel: {
            create: mockModelCreate,
            get: mockModelGet,
            delete: mockModelDelete,
        } as unknown as PersistentDownloadFileModel,
        fileStorageClient: {
            getFileUrl: mockS3GetFileUrl,
            getFileStream: mockS3GetFileStream,
            uploadImage: mockS3UploadImage,
            deleteFile: mockS3DeleteFile,
        } as unknown as FileStorageClient,
        uploadsFileStorageClient: uploadsBucketConfigured
            ? ({
                  getFileStream: mockUploadsGetFileStream,
                  uploadImage: mockUploadsUploadImage,
                  deleteFile: mockUploadsDeleteFile,
              } as unknown as FileStorageClient)
            : null,
    });

const requestContext = (account?: Account, downloadToken?: string) => ({
    account,
    downloadToken,
    ip: '127.0.0.1',
    userAgent: 'test-agent',
});

const fileRow = (
    accessMode: PersistentDownloadFileAccessMode,
    overrides: Partial<DbPersistentDownloadFile> = {},
): DbPersistentDownloadFile => ({
    nanoid: 'test-nanoid-123456789',
    s3_key: 'exports/test-file.csv',
    file_type: 'csv',
    organization_uuid: 'test-org-uuid',
    project_uuid: 'test-project-uuid',
    created_by_user_uuid: 'test-user-uuid',
    access_mode: accessMode,
    storage: PersistentDownloadFileStorage.EXPORTS,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
});

const uploadRow = (overrides: Partial<DbPersistentDownloadFile> = {}) =>
    fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT, {
        s3_key: 'ai-agents/agent-uuid/avatar.png',
        file_type: 'image',
        storage: PersistentDownloadFileStorage.UPLOADS,
        ...overrides,
    });

const accountWith = ({
    userUuid = 'test-user-uuid',
    organizationUuid = 'test-org-uuid',
    canViewProject = true,
}: {
    userUuid?: string;
    organizationUuid?: string;
    canViewProject?: boolean;
} = {}): Account => {
    const account = buildAccount();
    return {
        ...account,
        organization: {
            ...account.organization,
            organizationUuid,
        },
        user: {
            ...account.user,
            userUuid,
            id: userUuid,
            ability: new Ability<PossibleAbilities>(
                canViewProject ? [{ subject: 'Project', action: 'view' }] : [],
            ),
        },
    };
};

describe('PersistentDownloadFileService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectGetSummary.mockReset().mockResolvedValue({
            projectUuid: 'test-project-uuid',
            organizationUuid: 'test-org-uuid',
            provisioningSource: null,
        });
        mockAssertAnalyticsProjectAccess
            .mockReset()
            .mockResolvedValue(undefined);
        mockModelCreate.mockResolvedValue(undefined);
        mockS3GetFileStream.mockResolvedValue({
            stream: Readable.from(['hello,world\n']),
            contentDisposition: null,
        });
        mockUploadsGetFileStream.mockResolvedValue({
            stream: Readable.from(['png']),
            contentDisposition: null,
        });
    });

    describe('protected Analytics exports', () => {
        const analyticsProject = {
            projectUuid: 'test-project-uuid',
            organizationUuid: 'test-org-uuid',
            provisioningSource: 'analytics',
        };
        const fileId = 'test-nanoid-123456789';
        const tokenFor = (service: PersistentDownloadFileService) =>
            new URL(
                service.signPersistentUrl(
                    `https://test.lightdash.cloud/api/v1/file/${fileId}`,
                    3600,
                ),
            ).searchParams.get('downloadToken')!;

        beforeEach(() => {
            mockProjectGetSummary.mockResolvedValue(analyticsProject);
        });

        it.each(['csv', 'xlsx', 'jsonl', 's3_jsonl', 'zip'])(
            'rechecks Analytics access when opening a protected %s export',
            async (fileType) => {
                mockModelGet.mockResolvedValue(
                    fileRow(
                        PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                        {
                            file_type: fileType,
                        },
                    ),
                );
                const account = accountWith();
                await expect(
                    createService().getFileStream(
                        fileId,
                        requestContext(account),
                    ),
                ).resolves.toMatchObject({ fileType });
                expect(mockAssertAnalyticsProjectAccess).toHaveBeenCalledWith(
                    account,
                    analyticsProject,
                );
            },
        );

        it.each([
            PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
            PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT,
        ])(
            'denies %s after Analytics access is revoked, even with a token',
            async (mode) => {
                mockModelGet.mockResolvedValue(fileRow(mode));
                const service = createService();
                const context = requestContext(
                    accountWith(),
                    tokenFor(service),
                );
                await service.getFileStream(fileId, context);
                mockS3GetFileStream.mockClear();
                mockAssertAnalyticsProjectAccess.mockRejectedValue(
                    new ForbiddenError(
                        'Managed analytics requires the View managed analytics permission',
                    ),
                );
                await expect(
                    service.getFileStream(fileId, context),
                ).rejects.toThrow(NotFoundError);
                expect(mockS3GetFileStream).not.toHaveBeenCalled();
            },
        );

        it('denies access when the Analytics feature check rejects the organization', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            mockAssertAnalyticsProjectAccess.mockRejectedValue(
                new ForbiddenError(
                    'Internal analytics projects are not enabled for this organization',
                ),
            );
            await expect(
                createService().getFileStream(
                    fileId,
                    requestContext(accountWith()),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it.each([
            ['anonymous', undefined],
            [
                'another organization',
                accountWith({ organizationUuid: 'another-org' }),
            ],
            ['without project access', accountWith({ canViewProject: false })],
        ] as const)(
            'does not let a token bypass protected project access for %s',
            async (_label, account) => {
                mockModelGet.mockResolvedValue(
                    fileRow(
                        PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT,
                    ),
                );
                const service = createService();
                await expect(
                    service.getFileStream(
                        fileId,
                        requestContext(account, tokenFor(service)),
                    ),
                ).rejects.toThrow(NotFoundError);
                expect(mockS3GetFileStream).not.toHaveBeenCalled();
            },
        );

        it('retains creator-only access even when another user has Analytics access', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            await expect(
                createService().getFileStream(
                    fileId,
                    requestContext(accountWith({ userUuid: 'another-user' })),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('rejects a file whose stored organization does not own its project', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            mockProjectGetSummary.mockResolvedValue({
                ...analyticsProject,
                organizationUuid: 'another-org',
            });
            await expect(
                createService().getFileStream(
                    fileId,
                    requestContext(accountWith()),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockAssertAnalyticsProjectAccess).not.toHaveBeenCalled();
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it.each([
            PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
            PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT,
        ])(
            'denies %s data exports after project deletion clears the foreign key',
            async (mode) => {
                mockModelGet.mockResolvedValue(
                    fileRow(mode, { project_uuid: null }),
                );
                const service = createService();
                await expect(
                    service.getFileStream(
                        fileId,
                        requestContext(accountWith(), tokenFor(service)),
                    ),
                ).rejects.toThrow(NotFoundError);
                expect(mockS3GetFileStream).not.toHaveBeenCalled();
            },
        );

        it('does not serve files from a deleted project', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT),
            );
            mockProjectGetSummary.mockRejectedValue(
                new NotFoundError('Project not found'),
            );
            const service = createService();
            await expect(
                service.getFileStream(
                    fileId,
                    requestContext(accountWith(), tokenFor(service)),
                ),
            ).rejects.toThrow('Cannot find file');
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it.each(['csv', 'xlsx', 'zip', 'image'])(
            'preserves explicitly signed scheduled %s sharing without a session',
            async (fileType) => {
                mockModelGet.mockResolvedValue(
                    fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                        file_type: fileType,
                    }),
                );
                const service = createService();
                await expect(
                    service.getFileStream(
                        fileId,
                        requestContext(undefined, tokenFor(service)),
                    ),
                ).resolves.toMatchObject({ fileType });
                expect(mockProjectGetSummary).not.toHaveBeenCalled();
                expect(mockAssertAnalyticsProjectAccess).not.toHaveBeenCalled();
            },
        );

        it('preserves signed project image access', async () => {
            mockModelGet.mockResolvedValue(uploadRow());
            const service = createService();
            await expect(
                service.getFileStream(
                    fileId,
                    requestContext(undefined, tokenFor(service)),
                ),
            ).resolves.toMatchObject({ fileType: 'image' });
            expect(mockProjectGetSummary).not.toHaveBeenCalled();
        });
    });

    describe('uploadPersistentImage', () => {
        const uploadData = {
            image: Buffer.from('png'),
            storageId: 'ai-agents/agent-uuid/avatar',
            organizationUuid: 'test-org-uuid',
            projectUuid: 'test-project-uuid',
            createdByUserUuid: 'test-user-uuid',
            accessMode:
                PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT as const,
            expirationSeconds: 10 * 365 * 24 * 60 * 60,
        };

        it('stores the image in the uploads bucket and records that on the link', async () => {
            const url = await createService().uploadPersistentImage(uploadData);

            expect(url).toMatch(
                /^https:\/\/test\.lightdash\.cloud\/api\/v1\/file\/[\w-]{21}$/,
            );
            expect(mockUploadsUploadImage).toHaveBeenCalledWith(
                uploadData.image,
                uploadData.storageId,
            );
            expect(mockS3UploadImage).not.toHaveBeenCalled();
            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    s3Key: 'ai-agents/agent-uuid/avatar.png',
                    fileType: 'image',
                    storage: PersistentDownloadFileStorage.UPLOADS,
                }),
            );
        });

        it('keeps the image in the exports bucket when no uploads bucket is configured', async () => {
            await createService({}, undefined, {
                uploadsBucketConfigured: false,
            }).uploadPersistentImage(uploadData);

            expect(mockS3UploadImage).toHaveBeenCalledWith(
                uploadData.image,
                uploadData.storageId,
            );
            expect(mockUploadsUploadImage).not.toHaveBeenCalled();
            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    storage: PersistentDownloadFileStorage.EXPORTS,
                }),
            );
        });
    });

    describe('deleteFileWithKeyPrefix', () => {
        it('deletes an upload from the uploads bucket', async () => {
            mockModelGet.mockResolvedValue(uploadRow());

            await createService().deleteFileWithKeyPrefix(
                'test-nanoid-123456789',
                'ai-agents/agent-uuid/',
            );

            expect(mockUploadsDeleteFile).toHaveBeenCalledWith(
                'ai-agents/agent-uuid/avatar.png',
            );
            expect(mockS3DeleteFile).not.toHaveBeenCalled();
            expect(mockModelDelete).toHaveBeenCalledWith(
                'test-nanoid-123456789',
            );
        });

        it('refuses to delete a file outside the caller prefix', async () => {
            mockModelGet.mockResolvedValue(uploadRow());

            await expect(
                createService().deleteFileWithKeyPrefix(
                    'test-nanoid-123456789',
                    'announcements/',
                ),
            ).rejects.toThrow(ParameterError);
            expect(mockUploadsDeleteFile).not.toHaveBeenCalled();
            expect(mockModelDelete).not.toHaveBeenCalled();
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createPersistentUrl', () => {
        it('records the link as an export', async () => {
            await createService().createPersistentUrl(baseData);

            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    storage: PersistentDownloadFileStorage.EXPORTS,
                }),
            );
        });

        it('always creates an access-controlled persistent URL', async () => {
            const service = createService({ enabled: false });

            const url = await service.createPersistentUrl(baseData);

            expect(url).toMatch(
                /^https:\/\/test\.lightdash\.cloud\/api\/v1\/file\/[\w-]{21}$/,
            );
            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...baseData,
                    expiresAt: expect.any(Date),
                }),
            );
            expect(mockS3GetFileUrl).not.toHaveBeenCalled();
        });

        it('retains direct S3 URLs for signed files when persistent URLs are disabled', async () => {
            mockS3GetFileUrl.mockResolvedValue(
                'https://storage.test/presigned-file',
            );
            const service = createService({ enabled: false });

            await expect(
                service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                    expirationSeconds: 3600,
                }),
            ).resolves.toBe('https://storage.test/presigned-file');
            expect(mockS3GetFileUrl).toHaveBeenCalledWith(baseData.s3Key, 3600);
            expect(mockModelCreate).not.toHaveBeenCalled();
        });

        it('adds a file-bound token only for signed URLs', async () => {
            const service = createService();

            const url = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );

            expect(url.searchParams.get('downloadToken')).toBeTruthy();
            expect(mockModelCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
        });

        it('keeps signed tokens valid for the configured file lifetime', async () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);
            const service = createService({ enabled: false });

            const url = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                    expirationSeconds: 30 * 24 * 60 * 60,
                }),
            );
            const decoded = jwt.decode(
                url.searchParams.get('downloadToken')!,
            ) as jwt.JwtPayload;

            expect(decoded.exp! - decoded.iat!).toBe(30 * 24 * 60 * 60);
            expect(mockModelCreate.mock.calls[0][0].expiresAt.getTime()).toBe(
                now + 30 * 24 * 60 * 60 * 1000,
            );
            vi.restoreAllMocks();
        });

        it('uses the configured expiry and includes IDs in analytics', async () => {
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);
            const service = createService({ expirationSeconds: 7200 });

            const url = new URL(await service.createPersistentUrl(baseData));
            const fileId = url.pathname.split('/').at(-1)!;

            expect(mockModelCreate.mock.calls[0][0].expiresAt.getTime()).toBe(
                now + 7200 * 1000,
            );
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        fileUuid: fileId,
                    }),
                }),
            );
            vi.restoreAllMocks();
        });

        it('keeps signed tokens out of service logs', async () => {
            const service = createService();
            const logger = {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
            };
            Object.assign(service, { logger });
            const signedUrl = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            const downloadToken = signedUrl.searchParams.get('downloadToken')!;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                }),
            );

            await service.getFileStream(
                fileId,
                requestContext(undefined, downloadToken),
            );

            const serializedLogs = JSON.stringify(
                Object.values(logger).flatMap((method) => method.mock.calls),
            );
            expect(serializedLogs).toContain(fileId);
            expect(serializedLogs).not.toContain(downloadToken);
        });
    });

    describe('signPersistentUrl', () => {
        it('adds a file-bound token with the requested lifetime', () => {
            const service = createService();

            const url = new URL(
                service.signPersistentUrl(
                    'https://test.lightdash.cloud/api/v1/file/test-nanoid-123456789',
                    3600,
                ),
            );
            const decoded = jwt.decode(
                url.searchParams.get('downloadToken')!,
            ) as jwt.JwtPayload;

            expect(url.pathname).toBe('/api/v1/file/test-nanoid-123456789');
            expect(decoded.fileId).toBe('test-nanoid-123456789');
            expect(decoded.exp! - decoded.iat!).toBe(3600);
        });

        it('rejects URLs that are not persistent file URLs', () => {
            const service = createService();

            expect(() =>
                service.signPersistentUrl('https://example.com/avatar.png', 60),
            ).toThrow(ParameterError);
        });
    });

    describe('getFileStream', () => {
        it('streams an upload from the exports bucket after the uploads bucket is removed', async () => {
            mockModelGet.mockResolvedValue(uploadRow());

            await createService({}, undefined, {
                uploadsBucketConfigured: false,
            }).getFileStream(
                'test-nanoid-123456789',
                requestContext(accountWith()),
            );

            expect(mockS3GetFileStream).toHaveBeenCalledWith(
                'ai-agents/agent-uuid/avatar.png',
            );
        });

        it('streams an upload from the uploads bucket', async () => {
            mockModelGet.mockResolvedValue(uploadRow());

            await expect(
                createService().getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith()),
                ),
            ).resolves.toMatchObject({
                fileType: 'image',
                s3Key: 'ai-agents/agent-uuid/avatar.png',
            });
            expect(mockUploadsGetFileStream).toHaveBeenCalledWith(
                'ai-agents/agent-uuid/avatar.png',
            );
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('allows a creator who can still view the project', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith()),
                ),
            ).resolves.toMatchObject({
                fileType: 'csv',
                s3Key: 'exports/test-file.csv',
            });
            expect(mockS3GetFileStream).toHaveBeenCalledOnce();
        });

        it('returns the content disposition stored on the object', async () => {
            mockS3GetFileStream.mockResolvedValue({
                stream: Readable.from(['hello,world\n']),
                contentDisposition: 'attachment; filename="My Chart.csv"',
            });
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );

            await expect(
                createService().getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith()),
                ),
            ).resolves.toMatchObject({
                contentDisposition: 'attachment; filename="My Chart.csv"',
            });
        });

        it('returns a null content disposition when the object has none', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );

            await expect(
                createService().getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith()),
                ),
            ).resolves.toMatchObject({ contentDisposition: null });
        });

        it('denies another project member for a creator-bound export', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith({ userUuid: 'other-user' })),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('allows the creator through personal access token authentication', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            const account = {
                ...accountWith(),
                authentication: { type: 'pat', source: 'test-token' },
            } as Account;
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(account),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('denies creator-bound rows without a creator UUID', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(
                    PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                    {
                        created_by_user_uuid: null,
                    },
                ),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith()),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('denies the creator after project access is removed', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith({ canViewProject: false })),
                ),
            ).rejects.toThrow(NotFoundError);
        });

        it('allows another project member to read a shared project asset', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith({ userUuid: 'other-user' })),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('allows inactive service account principals to read shared project assets', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT),
            );
            const baseAccount = accountWith({ userUuid: 'service-user' });
            const account = {
                ...baseAccount,
                authentication: {
                    type: 'service-account',
                    source: 'test-token',
                    serviceAccountUuid: 'service-account-uuid',
                    serviceAccountDescription: 'test',
                },
                user: { ...baseAccount.user, isActive: false },
            } as Account;
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(account),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('allows projectless images only within the owning organization', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(
                    PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT,
                    { project_uuid: null, file_type: 'image' },
                ),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith({ userUuid: 'other-user' })),
                ),
            ).resolves.toMatchObject({ fileType: 'image' });
            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(
                        accountWith({ organizationUuid: 'other-org' }),
                    ),
                ),
            ).rejects.toThrow(NotFoundError);
        });

        it('allows a valid signed token without authentication', async () => {
            const service = createService();
            const signedUrl = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                }),
            );

            await expect(
                service.getFileStream(
                    fileId,
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('accepts tokens across a secret rotation in both orderings', async () => {
            const oldOnly = createService(undefined, {
                active: 'old secret',
                fallbacks: [],
                all: ['old secret'],
            });
            const newActiveOldFallback = createService(undefined, {
                active: 'new secret',
                fallbacks: ['old secret'],
                all: ['new secret', 'old secret'],
            });
            const oldActiveNewFallback = createService(undefined, {
                active: 'old secret',
                fallbacks: ['new secret'],
                all: ['old secret', 'new secret'],
            });

            const signedUrl = new URL(
                await oldOnly.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            const downloadToken = signedUrl.searchParams.get('downloadToken')!;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                }),
            );

            await expect(
                newActiveOldFallback.getFileStream(
                    fileId,
                    requestContext(undefined, downloadToken),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
            await expect(
                oldActiveNewFallback.getFileStream(
                    fileId,
                    requestContext(undefined, downloadToken),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('rejects a token signed with a secret outside the keyring', async () => {
            const unknownSecretService = createService(undefined, {
                active: 'unknown secret',
                fallbacks: [],
                all: ['unknown secret'],
            });
            const signedUrl = new URL(
                await unknownSecretService.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                }),
            );

            await expect(
                createService().getFileStream(
                    fileId,
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('rejects a token bound to another file', async () => {
            const service = createService();
            const signedUrl = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED),
            );

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('rejects a tampered token before opening S3', async () => {
            const service = createService();
            const signedUrl = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            const tokenParts = signedUrl.searchParams
                .get('downloadToken')!
                .split('.');
            const signature = tokenParts[2];
            const middle = Math.floor(signature.length / 2);
            tokenParts[2] = `${signature.slice(0, middle)}${signature[middle] === 'a' ? 'b' : 'a'}${signature.slice(middle + 1)}`;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                }),
            );

            await expect(
                service.getFileStream(
                    fileId,
                    requestContext(undefined, tokenParts.join('.')),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('rejects an expired token before opening S3', async () => {
            const now = Date.now();
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
            const service = createService();
            const signedUrl = new URL(
                await service.createPersistentUrl({
                    ...baseData,
                    accessMode: PersistentDownloadFileAccessMode.SIGNED,
                    expirationSeconds: 1,
                }),
            );
            const fileId = signedUrl.pathname.split('/').at(-1)!;
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.SIGNED, {
                    nanoid: fileId,
                    expires_at: new Date(now + 60 * 60 * 1000),
                }),
            );
            nowSpy.mockReturnValue(now + 2000);

            await expect(
                service.getFileStream(
                    fileId,
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });

        it('denies a shared project asset without authentication or token', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(),
                ),
            ).rejects.toThrow(NotFoundError);
        });

        it('allows a shared project asset with a token minted for it', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT),
            );
            const service = createService();
            const signedUrl = new URL(
                service.signPersistentUrl(
                    'https://test.lightdash.cloud/api/v1/file/test-nanoid-123456789',
                    3600,
                ),
            );

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('does not accept minted tokens for creator-bound exports', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR),
            );
            const service = createService();
            const signedUrl = new URL(
                service.signPersistentUrl(
                    'https://test.lightdash.cloud/api/v1/file/test-nanoid-123456789',
                    3600,
                ),
            );

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(
                        undefined,
                        signedUrl.searchParams.get('downloadToken')!,
                    ),
                ),
            ).rejects.toThrow(NotFoundError);
        });

        it('preserves anonymous access for legacy rows until expiry', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.LEGACY_PUBLIC),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
        });

        it('rejects expired rows before opening S3', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(PersistentDownloadFileAccessMode.LEGACY_PUBLIC, {
                    expires_at: new Date(Date.now() - 1000),
                }),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(mockS3GetFileStream).not.toHaveBeenCalled();
        });
    });
});
