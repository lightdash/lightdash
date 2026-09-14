import { PromotionAction } from '@lightdash/common';
import { promises as fs } from 'fs';
import { Response } from 'node-fetch';
import * as os from 'os';
import * as path from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { lightdashApi, lightdashRawApi } from '../dbt/apiClient';
import { downloadThemes, prepareThemeUploads, uploadThemes } from './themes';

vi.mock('../dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    lightdashRawApi: vi.fn(),
}));

const manifest = (slug: string) => ({
    codeVersion: 1,
    slug,
    name: 'Acme Brand',
    description: null,
    extraInstructions: null,
});

const createThemeDirectory = async (
    contentRoot: string,
    slug: string,
): Promise<string> => {
    const directory = path.join(contentRoot, 'themes', slug);
    await Promise.all(
        ['css', 'fonts', 'images', 'instructions'].map((folder) =>
            fs.mkdir(path.join(directory, folder), { recursive: true }),
        ),
    );
    await fs.writeFile(
        path.join(directory, 'lightdash-theme.yml'),
        stringifyYaml(manifest(slug)),
    );
    await fs.writeFile(
        path.join(directory, 'css', 'theme.css'),
        ':root { --brand: #123456; }',
    );
    return directory;
};

describe('organization theme content-as-code', () => {
    let temporaryRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue([] as never);
        temporaryRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), 'themes-test-'),
        );
    });

    afterEach(async () => {
        await fs.rm(temporaryRoot, { recursive: true, force: true });
    });

    it('treats a missing themes directory as an empty upload', async () => {
        await expect(prepareThemeUploads(temporaryRoot)).resolves.toEqual([]);
    });

    it('rejects nested paths during preflight', async () => {
        const themeDirectory = await createThemeDirectory(
            temporaryRoot,
            'acme-brand',
        );
        await fs.mkdir(path.join(themeDirectory, 'css', 'nested'));

        await expect(prepareThemeUploads(temporaryRoot)).rejects.toThrow(
            'without symlinks or nested directories',
        );
    });

    it('rejects symlinked files during preflight', async () => {
        const themeDirectory = await createThemeDirectory(
            temporaryRoot,
            'acme-brand',
        );
        await fs.symlink(
            path.join(themeDirectory, 'css', 'theme.css'),
            path.join(themeDirectory, 'css', 'linked.css'),
        );

        await expect(prepareThemeUploads(temporaryRoot)).rejects.toThrow(
            'without symlinks or nested directories',
        );
    });

    it('accepts Git-dropped empty directories and ignores local filesystem artifacts', async () => {
        const themeDirectory = await createThemeDirectory(
            temporaryRoot,
            'acme-brand',
        );
        await Promise.all(
            ['fonts', 'images', 'instructions'].map((folder) =>
                fs.rmdir(path.join(themeDirectory, folder)),
            ),
        );
        await Promise.all([
            fs.writeFile(
                path.join(temporaryRoot, 'themes', '.DS_Store'),
                'metadata',
            ),
            fs.writeFile(path.join(themeDirectory, '.DS_Store'), 'metadata'),
            fs.writeFile(
                path.join(themeDirectory, 'css', '.DS_Store'),
                'metadata',
            ),
            fs.mkdir(
                path.join(temporaryRoot, 'themes', '.lightdash-theme-ABC123'),
            ),
            fs.mkdir(
                path.join(
                    temporaryRoot,
                    'themes',
                    'acme-brand.backup-00000000-0000-4000-8000-000000000001',
                ),
            ),
        ]);

        const prepared = await prepareThemeUploads(temporaryRoot);

        expect(prepared).toHaveLength(1);
        expect(prepared[0].manifest.slug).toBe('acme-brand');
    });

    it('round-trips a downloaded package and replaces stale theme files', async () => {
        const sourceRoot = path.join(temporaryRoot, 'source');
        const destinationRoot = path.join(temporaryRoot, 'destination');
        await createThemeDirectory(sourceRoot, 'acme-brand');
        const [prepared] = await prepareThemeUploads(sourceRoot);

        const staleDirectory = await createThemeDirectory(
            destinationRoot,
            'acme-brand',
        );
        await createThemeDirectory(destinationRoot, 'remotely-deleted');
        await fs.writeFile(path.join(staleDirectory, 'stale.txt'), 'stale');

        vi.mocked(lightdashApi).mockResolvedValue([
            { slug: 'acme-brand' },
        ] as never);
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(prepared.archive),
        );

        await expect(downloadThemes(destinationRoot)).resolves.toBe(1);

        await expect(
            fs.readFile(
                path.join(
                    destinationRoot,
                    'themes',
                    'acme-brand',
                    'css',
                    'theme.css',
                ),
                'utf8',
            ),
        ).resolves.toContain('--brand');
        await expect(
            fs.stat(
                path.join(destinationRoot, 'themes', 'acme-brand', 'stale.txt'),
            ),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(
            fs.stat(path.join(destinationRoot, 'themes', 'remotely-deleted')),
        ).rejects.toMatchObject({ code: 'ENOENT' });

        const [downloaded] = await prepareThemeUploads(destinationRoot);
        expect(downloaded.archive).toEqual(prepared.archive);
    });

    it('keeps the previous local theme set when a package download fails', async () => {
        const sourceRoot = path.join(temporaryRoot, 'source');
        const destinationRoot = path.join(temporaryRoot, 'destination');
        await createThemeDirectory(sourceRoot, 'first-theme');
        const [prepared] = await prepareThemeUploads(sourceRoot);
        const existingDirectory = await createThemeDirectory(
            destinationRoot,
            'existing-theme',
        );
        await fs.writeFile(
            path.join(existingDirectory, 'local-marker.txt'),
            'keep me',
        );

        vi.mocked(lightdashApi).mockResolvedValue([
            { slug: 'first-theme' },
            { slug: 'second-theme' },
        ] as never);
        vi.mocked(lightdashRawApi)
            .mockResolvedValueOnce(new Response(prepared.archive))
            .mockResolvedValueOnce(new Response(Buffer.from('not a tar')));

        await expect(downloadThemes(destinationRoot)).rejects.toThrow();

        await expect(
            fs.readFile(
                path.join(existingDirectory, 'local-marker.txt'),
                'utf8',
            ),
        ).resolves.toBe('keep me');
        await expect(
            fs.stat(path.join(destinationRoot, 'themes', 'first-theme')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('reports completed and failed imports without claiming full success', async () => {
        await createThemeDirectory(temporaryRoot, 'first-theme');
        await createThemeDirectory(temporaryRoot, 'second-theme');
        const prepared = await prepareThemeUploads(temporaryRoot);
        vi.mocked(lightdashRawApi)
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status: 'ok',
                        results: {
                            slug: 'first-theme',
                            action: PromotionAction.CREATE,
                        },
                    }),
                ),
            )
            .mockRejectedValueOnce(new Error('remote failure'));

        const summary = await uploadThemes(prepared);

        expect(summary).toEqual({
            created: 1,
            updated: 0,
            unchanged: 0,
            failed: 1,
            completedSlugs: ['first-theme'],
            failures: [
                {
                    message:
                        'Failed to upload theme "second-theme": remote failure',
                },
            ],
        });
    });

    it('reports the action returned for every successful import', async () => {
        await createThemeDirectory(temporaryRoot, 'created-theme');
        await createThemeDirectory(temporaryRoot, 'updated-theme');
        await createThemeDirectory(temporaryRoot, 'unchanged-theme');
        const prepared = await prepareThemeUploads(temporaryRoot);
        for (const theme of prepared) {
            const actionBySlug: Record<string, PromotionAction> = {
                'created-theme': PromotionAction.CREATE,
                'updated-theme': PromotionAction.UPDATE,
                'unchanged-theme': PromotionAction.NO_CHANGES,
            };
            vi.mocked(lightdashRawApi).mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status: 'ok',
                        results: {
                            slug: theme.manifest.slug,
                            action: actionBySlug[theme.manifest.slug],
                        },
                    }),
                ),
            );
        }

        await expect(uploadThemes(prepared)).resolves.toMatchObject({
            created: 1,
            updated: 1,
            unchanged: 1,
            failed: 0,
        });
    });

    it('classifies successful imports returned by older servers', async () => {
        await createThemeDirectory(temporaryRoot, 'existing-theme');
        await createThemeDirectory(temporaryRoot, 'new-theme');
        const prepared = await prepareThemeUploads(temporaryRoot);
        vi.mocked(lightdashApi).mockResolvedValue([
            { slug: 'existing-theme' },
        ] as never);
        vi.mocked(lightdashRawApi)
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status: 'ok',
                        results: { slug: 'existing-theme' },
                    }),
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status: 'ok',
                        results: { slug: 'new-theme' },
                    }),
                ),
            );

        await expect(uploadThemes(prepared)).resolves.toMatchObject({
            created: 1,
            updated: 1,
            unchanged: 0,
            failed: 0,
        });
    });
});
