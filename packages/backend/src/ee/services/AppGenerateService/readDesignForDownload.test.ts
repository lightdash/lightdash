import { Readable } from 'stream';

// A minimal helper that builds a fake S3 response body from a Buffer.
// readS3ObjectAsBuffer checks for `.on` (stream-like) then iterates as async iterable.
// Node's Readable satisfies both requirements.
const makeS3Body = (buf: Buffer) => Readable.from(buf);

// Build a fake S3 client whose send() always returns a body containing the
// given buffer content. In real usage different keys return different files;
// here we give every call the same small buffer — enough to verify the
// plumbing without caring about content.
const makeS3Client = (content: Buffer = Buffer.from('file-content')) => ({
    send: vi
        .fn()
        .mockImplementation(() =>
            Promise.resolve({ Body: makeS3Body(content) }),
        ),
});

const KIND_EXTENSIONS: Record<
    'css' | 'font' | 'image' | 'instruction',
    string
> = {
    css: 'css',
    font: 'woff2',
    image: 'png',
    instruction: 'md',
};

const makeDesignFile = (
    kind: 'css' | 'font' | 'image' | 'instruction',
    n: number,
) => ({
    fileUuid: `file-uuid-${kind}-${n}`,
    kind,
    filename: `${kind}-${n}.${KIND_EXTENSIONS[kind]}`,
    contentType: 'application/octet-stream',
    sizeBytes: 100,
    createdAt: new Date('2024-01-01'),
});

const makeDesign = (
    files: ReturnType<typeof makeDesignFile>[],
    extraInstructions: string | null = null,
) => ({
    designUuid: 'design-uuid-1',
    organizationUuid: 'org-uuid-1',
    name: 'Test Design',
    description: null,
    extraInstructions,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdByUserUuid: null,
    files,
});

const makeOrganizationDesignModel = (
    design: ReturnType<typeof makeDesign> | undefined,
) => ({
    findInOrganization: vi.fn().mockResolvedValue(design),
});

const makeLogger = () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
});

describe('readDesignForDownload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('(a) returns empty context when designUuid is null', async () => {
        const { readDesignForDownload } =
            await import('./readDesignForDownload');
        const s3Client = makeS3Client();
        const organizationDesignModel = makeOrganizationDesignModel(undefined);
        const logger = makeLogger();

        const result = await readDesignForDownload({
            s3Client: s3Client as never,
            bucket: 'test-bucket',
            organizationDesignModel: organizationDesignModel as never,
            organizationUuid: 'org-uuid-1',
            designUuid: null,
            logger: logger as never,
        });

        expect(result).toEqual({
            instructions: null,
            assets: [],
            skippedAssetCount: 0,
        });
        expect(
            organizationDesignModel.findInOrganization,
        ).not.toHaveBeenCalled();
        expect(s3Client.send).not.toHaveBeenCalled();
    });

    it('(b) returns 2 assets and instructions when design has 2 assets + 1 instruction file', async () => {
        const { readDesignForDownload } =
            await import('./readDesignForDownload');
        const files = [
            makeDesignFile('css', 1),
            makeDesignFile('image', 1),
            makeDesignFile('instruction', 1),
        ];
        const design = makeDesign(files);
        const organizationDesignModel = makeOrganizationDesignModel(design);
        const s3Client = makeS3Client(Buffer.from('# My instructions'));
        const logger = makeLogger();

        const result = await readDesignForDownload({
            s3Client: s3Client as never,
            bucket: 'test-bucket',
            organizationDesignModel: organizationDesignModel as never,
            organizationUuid: 'org-uuid-1',
            designUuid: 'design-uuid-1',
            logger: logger as never,
        });

        expect(result.assets).toHaveLength(2);
        expect(result.skippedAssetCount).toBe(0);
        expect(result.instructions).not.toBeNull();
        expect(result.instructions?.path).toBe(
            '.lightdash/context/theme/instructions.md',
        );
        // All 3 files fetched from S3 (2 assets + 1 instruction)
        expect(s3Client.send).toHaveBeenCalledTimes(3);
    });

    it('(c) returns 0 assets and skippedAssetCount=31 when design has 31 assets, with instructions still present', async () => {
        const { readDesignForDownload } =
            await import('./readDesignForDownload');
        const assetFiles = Array.from({ length: 31 }, (_, i) =>
            makeDesignFile('css', i),
        );
        const instructionFile = makeDesignFile('instruction', 1);
        const files = [...assetFiles, instructionFile];
        const design = makeDesign(files);
        const organizationDesignModel = makeOrganizationDesignModel(design);
        const s3Client = makeS3Client(Buffer.from('# Theme instructions'));
        const logger = makeLogger();

        const result = await readDesignForDownload({
            s3Client: s3Client as never,
            bucket: 'test-bucket',
            organizationDesignModel: organizationDesignModel as never,
            organizationUuid: 'org-uuid-1',
            designUuid: 'design-uuid-1',
            logger: logger as never,
        });

        expect(result.assets).toHaveLength(0);
        expect(result.skippedAssetCount).toBe(31);
        // Instructions should still be present (instruction file was read + cap note appended)
        expect(result.instructions).not.toBeNull();
        expect(result.instructions?.path).toBe(
            '.lightdash/context/theme/instructions.md',
        );
        // Only the 1 instruction file is fetched from S3 (assets are skipped)
        expect(s3Client.send).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalled();
    });
});
