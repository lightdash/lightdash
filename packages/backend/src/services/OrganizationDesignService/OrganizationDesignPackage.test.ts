import {
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
    ParameterError,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import { pack as tarPack, type Headers } from 'tar-stream';
import { stringify as stringifyYaml } from 'yaml';
import {
    buildOrganizationDesignPackage,
    parseOrganizationDesignPackage,
} from './OrganizationDesignPackage';

const MANIFEST: OrganizationDesignPackageManifest = {
    codeVersion: ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    slug: 'acme-brand',
    name: 'Acme Brand',
    description: 'Primary brand',
    extraInstructions: 'Prefer generous whitespace.',
};

const makeRawTar = (
    entries: Array<{ header: Headers; body?: Buffer }>,
): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const packer = tarPack();
        const chunks: Buffer[] = [];
        packer.on('data', (chunk: Buffer) => chunks.push(chunk));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);

        const addNext = (index: number): void => {
            if (index >= entries.length) {
                packer.finalize();
                return;
            }
            const entry = entries[index];
            packer.entry(entry.header, entry.body, (error) => {
                if (error) reject(error);
                else addNext(index + 1);
            });
        };
        addNext(0);
    });

const manifestEntry = (manifest: Record<string, unknown> = MANIFEST) => ({
    header: { name: ORGANIZATION_DESIGN_PACKAGE_MANIFEST } satisfies Headers,
    body: Buffer.from(stringifyYaml(manifest), 'utf8'),
});

describe('OrganizationDesignPackage', () => {
    it('round-trips a deterministic canonical package', async () => {
        const first = await buildOrganizationDesignPackage(MANIFEST, [
            {
                kind: 'image',
                filename: 'logo.svg',
                contentType: 'image/svg+xml',
                body: Buffer.from('<svg></svg>'),
            },
            {
                kind: 'css',
                filename: 'theme.css',
                contentType: 'text/css',
                body: Buffer.from(':root { --brand: #123456; }'),
            },
        ]);

        const parsed = await parseOrganizationDesignPackage(first);
        const second = await buildOrganizationDesignPackage(
            parsed.manifest,
            parsed.files,
        );

        expect(parsed.manifest).toEqual(MANIFEST);
        expect(
            parsed.files.map(({ kind, filename, contentType }) => ({
                kind,
                filename,
                contentType,
            })),
        ).toEqual([
            {
                kind: 'css',
                filename: 'theme.css',
                contentType: 'text/css; charset=utf-8',
            },
            {
                kind: 'image',
                filename: 'logo.svg',
                contentType: 'image/svg+xml',
            },
        ]);
        expect(second).toEqual(first);
    });

    it('reports a structurally invalid tar as a parameter error', async () => {
        const archive = await buildOrganizationDesignPackage(MANIFEST, []);
        archive[0] = archive[0] === 108 ? 109 : 108;

        await expect(parseOrganizationDesignPackage(archive)).rejects.toEqual(
            expect.objectContaining({
                name: 'ParameterError',
                statusCode: 400,
            }),
        );
    });

    it.each([
        {
            name: 'path traversal',
            entries: [
                manifestEntry(),
                {
                    header: { name: '../theme.css' } satisfies Headers,
                    body: Buffer.from('body {}'),
                },
            ],
        },
        {
            name: 'a symbolic link',
            entries: [
                manifestEntry(),
                {
                    header: {
                        name: 'images/logo.svg',
                        type: 'symlink',
                        linkname: '/etc/passwd',
                    } satisfies Headers,
                },
            ],
        },
        {
            name: 'case-insensitive duplicate paths',
            entries: [
                manifestEntry(),
                {
                    header: { name: 'css/theme.css' } satisfies Headers,
                    body: Buffer.from('body {}'),
                },
                {
                    header: { name: 'CSS/THEME.CSS' } satisfies Headers,
                    body: Buffer.from('body {}'),
                },
            ],
        },
        {
            name: 'a filename that changes when normalized',
            entries: [
                manifestEntry(),
                {
                    header: { name: 'css/ theme.css ' } satisfies Headers,
                    body: Buffer.from('body {}'),
                },
            ],
        },
    ])('rejects $name', async ({ entries }) => {
        const archive = await makeRawTar(entries);

        await expect(parseOrganizationDesignPackage(archive)).rejects.toThrow(
            ParameterError,
        );
    });

    it.each([
        {
            name: 'an unsupported code version',
            manifest: { ...MANIFEST, codeVersion: 2 },
        },
        {
            name: 'a UUID-shaped slug that would be selector-ambiguous',
            manifest: {
                ...MANIFEST,
                slug: '00000000-0000-4000-8000-000000000010',
            },
        },
        {
            name: 'a special UUID-shaped slug that would be selector-ambiguous',
            manifest: {
                ...MANIFEST,
                slug: '00000000-0000-0000-0000-000000000000',
            },
        },
        {
            name: 'an unknown field that would otherwise be ignored',
            manifest: { ...MANIFEST, default: true },
        },
    ])('rejects a manifest with $name', async ({ manifest }) => {
        const archive = await makeRawTar([manifestEntry(manifest)]);

        await expect(parseOrganizationDesignPackage(archive)).rejects.toThrow(
            ParameterError,
        );
    });
});
