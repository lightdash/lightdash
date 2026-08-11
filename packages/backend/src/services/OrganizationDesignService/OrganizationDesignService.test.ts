import {
    DeleteObjectsCommand,
    GetObjectCommand,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import {
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    ParameterError,
    type ApiOrganizationDesign,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { OrganizationDesignModel } from '../../models/OrganizationDesignModel';
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
    }: {
        replaceFiles: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
    }) => {
        const organizationDesignModel = {
            findByIdOrSlug: vi.fn().mockResolvedValue(existingDesign),
            replaceFiles,
            createWithFiles: vi.fn(),
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
        return { service };
    };

    const makeArchive = () =>
        buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'css',
                filename: 'theme.css',
                contentType: 'text/css; charset=utf-8',
                body: Buffer.from('body { color: red; }'),
            },
        ]);

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

        expect(result).toEqual(updatedDesign);
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
