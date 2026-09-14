import { Ability } from '@casl/ability';
import {
    NotFoundError,
    PersistentDownloadFileAccessMode,
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
const mockModelCreate = vi.fn();
const mockModelGet = vi.fn();
const mockTrack = vi.fn();

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
) =>
    new PersistentDownloadFileService({
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
        } as unknown as PersistentDownloadFileModel,
        fileStorageClient: {
            getFileUrl: mockS3GetFileUrl,
            getFileStream: mockS3GetFileStream,
        } as unknown as FileStorageClient,
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
    created_at: new Date(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
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
        mockModelCreate.mockResolvedValue(undefined);
        mockS3GetFileStream.mockResolvedValue({
            stream: Readable.from(['hello,world\n']),
            contentDisposition: null,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createPersistentUrl', () => {
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

    describe('getFileStream', () => {
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

        it('allows projectless assets only within the owning organization', async () => {
            mockModelGet.mockResolvedValue(
                fileRow(
                    PersistentDownloadFileAccessMode.AUTHENTICATED_PROJECT,
                    { project_uuid: null },
                ),
            );
            const service = createService();

            await expect(
                service.getFileStream(
                    'test-nanoid-123456789',
                    requestContext(accountWith({ userUuid: 'other-user' })),
                ),
            ).resolves.toMatchObject({ fileType: 'csv' });
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
