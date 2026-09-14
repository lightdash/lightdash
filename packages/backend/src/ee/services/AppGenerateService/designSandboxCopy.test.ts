import { Readable } from 'node:stream';
import { makeTestTrueTypeFont } from '../../../testing/makeTestTrueTypeFont';
import { copyDesignIntoSandbox } from './designSandboxCopy';

const makeFontFile = (fileUuid: string, filename: string) => ({
    fileUuid,
    kind: 'font' as const,
    filename,
    contentType: 'font/ttf',
    sizeBytes: 100,
    createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('copyDesignIntoSandbox', () => {
    it('omits a restricted legacy font while preserving an ordinary web font', async () => {
        const restrictedFile = makeFontFile('restricted-file', 'brand.ttf');
        const ordinaryFile = makeFontFile('ordinary-file', 'inter.ttf');
        const restrictedBody = makeTestTrueTypeFont({
            familyName: 'SF Pro',
            fullName: 'SF Pro Regular',
            postscriptName: 'SFPro-Regular',
        });
        const ordinaryBody = makeTestTrueTypeFont({
            familyName: 'Inter',
            fullName: 'Inter Regular',
            postscriptName: 'Inter-Regular',
        });
        const design = {
            designUuid: 'design-uuid',
            organizationUuid: 'organization-uuid',
            slug: 'brand',
            name: 'Brand',
            description: null,
            extraInstructions: null,
            isDefault: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
            createdByUserUuid: null,
            files: [restrictedFile, ordinaryFile],
        };
        const send = vi.fn((command: { input: { Key?: string } }) =>
            Promise.resolve({
                Body: Readable.from(
                    command.input.Key?.includes(restrictedFile.fileUuid)
                        ? restrictedBody
                        : ordinaryBody,
                ),
            }),
        );
        const write = vi.fn().mockResolvedValue(undefined);
        const run = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: '',
            exitCode: 0,
        });
        const logger = {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        };

        const result = await copyDesignIntoSandbox({
            sandbox: {
                commands: { run },
                files: { write },
            } as never,
            s3Client: { send } as never,
            bucket: 'themes',
            organizationDesignModel: {
                findInOrganization: vi.fn().mockResolvedValue(design),
            } as never,
            organizationUuid: design.organizationUuid,
            designUuid: design.designUuid,
            logger: logger as never,
        });

        expect(write).toHaveBeenCalledExactlyOnceWith(
            '/app/src/design/fonts/inter.ttf',
            ordinaryBody,
        );
        expect(result.fontPaths).toEqual(['/app/src/design/fonts/inter.ttf']);
        expect(result.omittedRestrictedFonts).toEqual([
            expect.objectContaining({
                fallback: expect.stringContaining('system-ui'),
            }),
        ]);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('omitted restricted Apple font'),
        );
    });
});
