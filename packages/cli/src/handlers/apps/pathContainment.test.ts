import { ParameterError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    assertOutDirSafeToClear,
    canonicalizeForContainment,
} from './pathContainment';

const describePosix = process.platform === 'win32' ? describe.skip : describe;

const mkTmpDir = (prefix: string): Promise<string> =>
    fs.mkdtemp(path.join(os.tmpdir(), prefix));

describePosix('canonicalizeForContainment', () => {
    it('returns the realpath of an existing directory unchanged when there are no symlinks', async () => {
        const dir = await mkTmpDir('ld-canon-plain-');

        await expect(canonicalizeForContainment(dir)).resolves.toBe(
            await fs.realpath(dir),
        );
    });

    it('resolves a symlinked existing directory to its real target', async () => {
        const target = await mkTmpDir('ld-canon-target-');
        const linkParent = await mkTmpDir('ld-canon-linkparent-');
        const link = path.join(linkParent, 'link');
        await fs.symlink(target, link);

        await expect(canonicalizeForContainment(link)).resolves.toBe(
            await fs.realpath(target),
        );
    });

    it('walks up to the nearest existing ancestor and rejoins non-existent segments', async () => {
        const target = await mkTmpDir('ld-canon-target-');
        const linkParent = await mkTmpDir('ld-canon-linkparent-');
        const link = path.join(linkParent, 'link');
        await fs.symlink(target, link);
        const nonExistent = path.join(link, 'not', 'yet', 'created');

        await expect(canonicalizeForContainment(nonExistent)).resolves.toBe(
            path.join(await fs.realpath(target), 'not', 'yet', 'created'),
        );
    });

    it('rethrows a non-ENOENT realpath failure instead of treating it as non-existent', async () => {
        const dir = await mkTmpDir('ld-canon-notdir-');
        const filePath = path.join(dir, 'a-file');
        await fs.writeFile(filePath, 'not a directory');
        const impossiblePath = path.join(filePath, 'nested', 'more');

        await expect(
            canonicalizeForContainment(impossiblePath),
        ).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
});

describePosix('assertOutDirSafeToClear', () => {
    it('is a no-op when outDir does not exist yet', async () => {
        const appDir = await mkTmpDir('ld-safeclear-app-');
        const outDirParent = await mkTmpDir('ld-safeclear-outparent-');
        const outDir = path.join(outDirParent, 'dist');

        await expect(
            assertOutDirSafeToClear(appDir, outDir),
        ).resolves.toBeUndefined();
    });

    it('does not throw for a disjoint existing outDir', async () => {
        const appDir = await mkTmpDir('ld-safeclear-app-');
        const outDir = await mkTmpDir('ld-safeclear-outdir-');

        await expect(
            assertOutDirSafeToClear(appDir, outDir),
        ).resolves.toBeUndefined();
    });

    it('throws ParameterError when an existing outDir canonically contains appDir', async () => {
        const outDir = await mkTmpDir('ld-safeclear-container-');
        const appDir = path.join(outDir, 'app');
        await fs.mkdir(appDir);

        await expect(assertOutDirSafeToClear(appDir, outDir)).rejects.toThrow(
            ParameterError,
        );
    });

    it('throws ParameterError when outDir is reached via a symlinked ancestor that contains appDir', async () => {
        const parentDir = await mkTmpDir('ld-safeclear-parent-');
        const appDir = path.join(parentDir, 'app');
        await fs.mkdir(appDir);
        const linkParent = await mkTmpDir('ld-safeclear-linkparent-');
        const link = path.join(linkParent, 'link-to-parent');
        await fs.symlink(parentDir, link);

        await expect(assertOutDirSafeToClear(appDir, link)).rejects.toThrow(
            ParameterError,
        );
    });
});
