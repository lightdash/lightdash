import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { ApiOrganizationDesign } from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { OrganizationDesignModel } from '../../models/OrganizationDesignModel';
import { parseOrganizationDesignPackage } from './OrganizationDesignPackage';
import { OrganizationDesignService } from './OrganizationDesignService';

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
