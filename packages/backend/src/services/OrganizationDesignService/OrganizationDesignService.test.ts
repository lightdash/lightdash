import {
    DeleteObjectsCommand,
    GetObjectCommand,
    NoSuchKey,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import {
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    ParameterError,
    PromotionAction,
    type ApiOrganizationDesign,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { OrganizationDesignModel } from '../../models/OrganizationDesignModel';
import { makeTestTrueTypeFont } from '../../testing/makeTestTrueTypeFont';
import {
    buildOrganizationDesignPackage,
    parseOrganizationDesignPackage,
} from './OrganizationDesignPackage';
import { OrganizationDesignService } from './OrganizationDesignService';

const MANIFEST: OrganizationDesignPackageManifest = {
    codeVersion: ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    slug: 'acme-brand',
    name: 'Acme Brand',
    description: 'Primary brand',
    extraInstructions: 'Prefer generous whitespace.',
};

describe('OrganizationDesignService package export', () => {
    it('exports the effective file and theme metadata as a canonical package', async () => {
        const effectiveBody = Buffer.from(':root { color: purple; }');
        const design: ApiOrganizationDesign = {
            designUuid: '00000000-0000-4000-8000-000000000010',
            organizationUuid: 'test-org-uuid',
            slug: 'acme-brand',
            name: 'Acme Brand',
            description: 'Primary brand',
            extraInstructions: 'Prefer generous whitespace.',
            isDefault: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
            createdByUserUuid: 'test-user-uuid',
            files: [
                {
                    fileUuid: '00000000-0000-4000-8000-000000000100',
                    kind: 'css',
                    filename: 'theme.css',
                    contentType: 'text/css',
                    sizeBytes: 3,
                    createdAt: new Date('2026-01-01T00:00:00Z'),
                },
                {
                    fileUuid: '00000000-0000-4000-8000-000000000101',
                    kind: 'css',
                    filename: 'THEME.CSS',
                    contentType: 'text/css',
                    sizeBytes: effectiveBody.length,
                    createdAt: new Date('2026-01-02T00:00:00Z'),
                },
            ],
        };
        const organizationDesignModel = {
            findByIdOrSlug: vi.fn().mockResolvedValue(design),
        };
        const send = vi.fn(async (command: unknown) => {
            expect(command).toBeInstanceOf(GetObjectCommand);
            expect((command as GetObjectCommand).input.Key).toContain(
                design.files[1].fileUuid,
            );
            return {
                Body: {
                    transformToByteArray: async () => effectiveBody,
                },
            };
        });
        const service = new OrganizationDesignService({
            lightdashConfig: lightdashConfigMock,
            organizationDesignModel:
                organizationDesignModel as unknown as OrganizationDesignModel,
        });
        (
            service as unknown as {
                createAuditedAbility: () => { cannot: () => boolean };
                getS3Client: () => { client: S3Client; bucket: string };
            }
        ).createAuditedAbility = () => ({ cannot: () => false });
        (
            service as unknown as {
                getS3Client: () => { client: S3Client; bucket: string };
            }
        ).getS3Client = () => ({
            client: { send } as unknown as S3Client,
            bucket: 'themes',
        });

        const result = await service.exportPackage(buildAccount(), design.slug);
        const parsed = await parseOrganizationDesignPackage(result.body);

        expect(result.filename).toBe('acme-brand.tar');
        expect(parsed.manifest).toEqual({
            codeVersion: 1,
            slug: design.slug,
            name: design.name,
            description: design.description,
            extraInstructions: design.extraInstructions,
        });
        expect(parsed.files).toEqual([
            expect.objectContaining({
                kind: 'css',
                filename: 'THEME.CSS',
                body: effectiveBody,
            }),
        ]);
        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe('OrganizationDesignService package activation', () => {
    const existingDesign: ApiOrganizationDesign = {
        designUuid: '00000000-0000-4000-8000-000000000010',
        organizationUuid: 'test-org-uuid',
        slug: MANIFEST.slug,
        name: 'Previous brand',
        description: null,
        extraInstructions: null,
        isDefault: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        createdByUserUuid: 'test-user-uuid',
        files: [
            {
                fileUuid: '00000000-0000-4000-8000-000000000100',
                kind: 'css',
                filename: 'old.css',
                contentType: 'text/css; charset=utf-8',
                sizeBytes: 6,
                createdAt: new Date('2026-01-01T00:00:00Z'),
            },
        ],
    };

    const makeService = ({
        replaceFiles,
        send,
        design = existingDesign,
        confirmPackageSnapshot = vi.fn(),
        createWithFiles = vi.fn(),
        addFile = vi.fn(),
    }: {
        replaceFiles: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        design?: ApiOrganizationDesign | null;
        confirmPackageSnapshot?: ReturnType<typeof vi.fn>;
        createWithFiles?: ReturnType<typeof vi.fn>;
        addFile?: ReturnType<typeof vi.fn>;
    }) => {
        const organizationDesignModel = {
            findByIdOrSlug: vi.fn().mockResolvedValue(design),
            confirmPackageSnapshot,
            replaceFiles,
            createWithFiles,
            addFile,
        };
        const service = new OrganizationDesignService({
            lightdashConfig: lightdashConfigMock,
            organizationDesignModel:
                organizationDesignModel as unknown as OrganizationDesignModel,
        });
        (
            service as unknown as {
                createAuditedAbility: () => { cannot: () => boolean };
                getS3Client: () => { client: S3Client; bucket: string };
            }
        ).createAuditedAbility = () => ({ cannot: () => false });
        (
            service as unknown as {
                getS3Client: () => { client: S3Client; bucket: string };
            }
        ).getS3Client = () => ({
            client: { send } as unknown as S3Client,
            bucket: 'themes',
        });
        return { service, organizationDesignModel };
    };

    const packageBody = Buffer.from('body { color: red; }');
    const makeArchive = () =>
        buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'css',
                filename: 'theme.css',
                contentType: 'text/css; charset=utf-8',
                body: packageBody,
            },
        ]);

    const restrictedFontBody = makeTestTrueTypeFont({
        familyName: 'SF Pro',
        fullName: 'SF Pro Regular',
        postscriptName: 'SFPro-Regular',
    });

    const matchingDesign: ApiOrganizationDesign = {
        ...existingDesign,
        name: MANIFEST.name,
        description: MANIFEST.description,
        extraInstructions: MANIFEST.extraInstructions,
        files: [
            {
                ...existingDesign.files[0],
                filename: 'theme.css',
                contentType: 'text/css; charset=utf-8',
                sizeBytes: packageBody.length,
            },
        ],
    };

    it('reports create when the package slug does not exist', async () => {
        const send = vi.fn().mockResolvedValue({});
        const replaceFiles = vi.fn();
        const createWithFiles = vi.fn().mockResolvedValue(matchingDesign);
        const { service, organizationDesignModel } = makeService({
            replaceFiles,
            send,
            design: null,
            createWithFiles,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...matchingDesign,
            action: PromotionAction.CREATE,
        });

        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
        expect(createWithFiles).toHaveBeenCalledOnce();
        expect(
            organizationDesignModel.confirmPackageSnapshot,
        ).not.toHaveBeenCalled();
        expect(replaceFiles).not.toHaveBeenCalled();
    });

    it('rejects a renamed restricted font upload before writing to S3', async () => {
        const send = vi.fn().mockResolvedValue({});
        const addFile = vi.fn();
        const { service } = makeService({
            replaceFiles: vi.fn(),
            send,
            addFile,
        });

        await expect(
            service.uploadFile(buildAccount(), existingDesign.slug, {
                kind: 'font',
                filename: 'acme-sans.ttf',
                contentType: 'font/ttf',
                body: Readable.from(restrictedFontBody),
                contentLength: restrictedFontBody.length,
            }),
        ).rejects.toThrow(/acme-sans\.ttf.*restricted Apple system font/);

        expect(send).not.toHaveBeenCalled();
        expect(addFile).not.toHaveBeenCalled();
    });

    it('continues to store a signature-valid font without readable names', async () => {
        const body = Buffer.alloc(12);
        body.writeUInt32BE(0x00010000, 0);
        const storedFile = {
            fileUuid: '00000000-0000-4000-8000-000000000201',
            kind: 'font' as const,
            filename: 'subset.ttf',
            contentType: 'font/ttf',
            sizeBytes: body.length,
            createdAt: new Date('2026-01-01T00:00:00Z'),
        };
        const send = vi.fn().mockResolvedValue({});
        const addFile = vi.fn().mockResolvedValue(storedFile);
        const { service } = makeService({
            replaceFiles: vi.fn(),
            send,
            addFile,
        });

        await expect(
            service.uploadFile(buildAccount(), existingDesign.slug, {
                kind: 'font',
                filename: storedFile.filename,
                contentType: storedFile.contentType,
                body: Readable.from(body),
                contentLength: body.length,
            }),
        ).resolves.toEqual(storedFile);

        expect(send).toHaveBeenCalledOnce();
        expect(addFile).toHaveBeenCalledOnce();
    });

    it('rejects a restricted font package before staging or activation', async () => {
        const send = vi.fn().mockResolvedValue({});
        const replaceFiles = vi.fn();
        const { service } = makeService({ replaceFiles, send });
        const archive = await buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'font',
                filename: 'acme-sans.ttf',
                contentType: 'font/ttf',
                body: restrictedFontBody,
            },
        ]);

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).rejects.toThrow(/restricted Apple system font/);

        expect(send).not.toHaveBeenCalled();
        expect(replaceFiles).not.toHaveBeenCalled();
    });

    it('returns no changes without staging when package metadata and S3 bytes match', async () => {
        const send = vi.fn(async (command: unknown) => {
            expect(command).toBeInstanceOf(GetObjectCommand);
            return {
                Body: {
                    transformToByteArray: async () => packageBody,
                },
            };
        });
        const replaceFiles = vi.fn();
        const confirmPackageSnapshot = vi
            .fn()
            .mockResolvedValue(matchingDesign);
        const { service } = makeService({
            replaceFiles,
            send,
            design: matchingDesign,
            confirmPackageSnapshot,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...matchingDesign,
            action: PromotionAction.NO_CHANGES,
        });

        expect(send).toHaveBeenCalledOnce();
        expect(confirmPackageSnapshot).toHaveBeenCalledWith(
            'test-org-uuid',
            matchingDesign,
        );
        expect(replaceFiles).not.toHaveBeenCalled();
    });

    it('preserves a byte-identical legacy restricted font package as a no-op', async () => {
        const legacyFontDesign: ApiOrganizationDesign = {
            ...matchingDesign,
            files: [
                {
                    ...matchingDesign.files[0],
                    kind: 'font',
                    filename: 'legacy-brand.ttf',
                    contentType: 'font/ttf',
                    sizeBytes: restrictedFontBody.length,
                },
            ],
        };
        const send = vi.fn(async (command: unknown) => {
            expect(command).toBeInstanceOf(GetObjectCommand);
            return {
                Body: {
                    transformToByteArray: async () => restrictedFontBody,
                },
            };
        });
        const replaceFiles = vi.fn();
        const confirmPackageSnapshot = vi
            .fn()
            .mockResolvedValue(legacyFontDesign);
        const { service } = makeService({
            replaceFiles,
            send,
            design: legacyFontDesign,
            confirmPackageSnapshot,
        });
        const archive = await buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'font',
                filename: 'legacy-brand.ttf',
                contentType: 'font/ttf',
                body: restrictedFontBody,
            },
        ]);

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...legacyFontDesign,
            action: PromotionAction.NO_CHANGES,
        });

        expect(send).toHaveBeenCalledOnce();
        expect(replaceFiles).not.toHaveBeenCalled();
    });

    it('ignores UI-provided content types when package metadata and bytes match', async () => {
        const uiAuthoredDesign: ApiOrganizationDesign = {
            ...matchingDesign,
            files: matchingDesign.files.map((file) => ({
                ...file,
                contentType: 'text/css',
            })),
        };
        const send = vi.fn(async (command: unknown) => {
            expect(command).toBeInstanceOf(GetObjectCommand);
            return {
                Body: {
                    transformToByteArray: async () => packageBody,
                },
            };
        });
        const replaceFiles = vi.fn();
        const confirmPackageSnapshot = vi
            .fn()
            .mockResolvedValue(uiAuthoredDesign);
        const { service } = makeService({
            replaceFiles,
            send,
            design: uiAuthoredDesign,
            confirmPackageSnapshot,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...uiAuthoredDesign,
            action: PromotionAction.NO_CHANGES,
        });

        expect(send).toHaveBeenCalledOnce();
        expect(replaceFiles).not.toHaveBeenCalled();
    });

    it('replaces a package when an existing S3 object is missing', async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof GetObjectCommand) {
                throw new NoSuchKey({
                    message: 'The specified key does not exist',
                    $metadata: { httpStatusCode: 404 },
                });
            }
            return {};
        });
        const updatedDesign = { ...matchingDesign, files: [] };
        const replaceFiles = vi.fn().mockResolvedValue({
            design: updatedDesign,
            removedFiles: matchingDesign.files,
        });
        const { service } = makeService({
            replaceFiles,
            send,
            design: matchingDesign,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...updatedDesign,
            action: PromotionAction.UPDATE,
        });

        expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
        expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
        expect(replaceFiles).toHaveBeenCalledOnce();
    });

    it('replaces a package to compact shadowed duplicate file rows', async () => {
        const duplicateDesign: ApiOrganizationDesign = {
            ...matchingDesign,
            files: [
                {
                    ...matchingDesign.files[0],
                    fileUuid: '00000000-0000-4000-8000-000000000099',
                    filename: 'THEME.CSS',
                },
                matchingDesign.files[0],
            ],
        };
        const send = vi.fn().mockResolvedValue({});
        const updatedDesign = { ...matchingDesign, files: [] };
        const replaceFiles = vi.fn().mockResolvedValue({
            design: updatedDesign,
            removedFiles: duplicateDesign.files,
        });
        const { service } = makeService({
            replaceFiles,
            send,
            design: duplicateDesign,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...updatedDesign,
            action: PromotionAction.UPDATE,
        });

        expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
        expect(send.mock.calls).not.toContainEqual([
            expect.any(GetObjectCommand),
        ]);
        expect(replaceFiles).toHaveBeenCalledOnce();
    });

    it('updates when an existing file has the same size but different bytes', async () => {
        const existingBody = Buffer.from('body { color: tan; }');
        expect(existingBody).toHaveLength(packageBody.length);
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof GetObjectCommand) {
                return {
                    Body: {
                        transformToByteArray: async () => existingBody,
                    },
                };
            }
            return {};
        });
        const updatedDesign = {
            ...matchingDesign,
            files: [],
        };
        const replaceFiles = vi.fn().mockResolvedValue({
            design: updatedDesign,
            removedFiles: matchingDesign.files,
        });
        const { service, organizationDesignModel } = makeService({
            replaceFiles,
            send,
            design: matchingDesign,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...updatedDesign,
            action: PromotionAction.UPDATE,
        });

        expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
        expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
        expect(
            organizationDesignModel.confirmPackageSnapshot,
        ).not.toHaveBeenCalled();
        expect(replaceFiles).toHaveBeenCalledOnce();
    });

    it('updates when the locked snapshot changed after matching S3 bytes were read', async () => {
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof GetObjectCommand) {
                return {
                    Body: {
                        transformToByteArray: async () => packageBody,
                    },
                };
            }
            return {};
        });
        const updatedDesign = { ...matchingDesign, files: [] };
        const replaceFiles = vi.fn().mockResolvedValue({
            design: updatedDesign,
            removedFiles: matchingDesign.files,
        });
        const confirmPackageSnapshot = vi.fn().mockResolvedValue(undefined);
        const { service } = makeService({
            replaceFiles,
            send,
            design: matchingDesign,
            confirmPackageSnapshot,
        });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).resolves.toEqual({
            ...updatedDesign,
            action: PromotionAction.UPDATE,
        });

        expect(confirmPackageSnapshot).toHaveBeenCalledOnce();
        expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
        expect(replaceFiles).toHaveBeenCalledOnce();
    });

    it('stages files before the row-locked swap and removes the replaced objects afterward', async () => {
        const events: string[] = [];
        const send = vi.fn(async (command: unknown) => {
            if (command instanceof PutObjectCommand) events.push('stage');
            if (command instanceof DeleteObjectsCommand) events.push('cleanup');
            return {};
        });
        const updatedDesign = {
            ...existingDesign,
            name: MANIFEST.name,
            description: MANIFEST.description,
            extraInstructions: MANIFEST.extraInstructions,
            files: [],
        };
        const replaceFiles = vi.fn(async () => {
            events.push('swap');
            return {
                design: updatedDesign,
                removedFiles: existingDesign.files,
            };
        });
        const { service } = makeService({ replaceFiles, send });
        const archive = await makeArchive();

        const result = await service.importPackage(buildAccount(), {
            body: Readable.from(archive),
            contentLength: archive.length,
        });

        expect(result).toEqual({
            ...updatedDesign,
            action: PromotionAction.UPDATE,
        });
        expect(events).toEqual(['stage', 'swap', 'cleanup']);
        const cleanup = send.mock.calls[1][0];
        expect(cleanup).toBeInstanceOf(DeleteObjectsCommand);
        expect((cleanup as DeleteObjectsCommand).input.Delete?.Objects).toEqual(
            [
                {
                    Key: `designs/test-org-uuid/${existingDesign.designUuid}/${existingDesign.files[0].fileUuid}/old.css`,
                },
            ],
        );
    });

    it('removes staged objects when database activation fails', async () => {
        const send = vi.fn().mockResolvedValue({});
        const replaceFiles = vi.fn().mockRejectedValue(new Error('DB failed'));
        const { service } = makeService({ replaceFiles, send });
        const archive = await makeArchive();

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).rejects.toThrow('DB failed');

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
        const cleanup = send.mock.calls[1][0];
        expect(cleanup).toBeInstanceOf(DeleteObjectsCommand);
        expect(
            (cleanup as DeleteObjectsCommand).input.Delete?.Objects?.[0]?.Key,
        ).toMatch(
            new RegExp(
                `^designs/test-org-uuid/${existingDesign.designUuid}/.+/theme\\.css$`,
            ),
        );
    });

    it('validates file content before staging or activating the package', async () => {
        const send = vi.fn().mockResolvedValue({});
        const replaceFiles = vi.fn();
        const { service } = makeService({ replaceFiles, send });
        const archive = await buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'image',
                filename: 'logo.png',
                contentType: 'image/png',
                body: Buffer.from('not a png'),
            },
        ]);

        await expect(
            service.importPackage(buildAccount(), {
                body: Readable.from(archive),
                contentLength: archive.length,
            }),
        ).rejects.toThrow(ParameterError);

        expect(send).not.toHaveBeenCalled();
        expect(replaceFiles).not.toHaveBeenCalled();
    });
});
