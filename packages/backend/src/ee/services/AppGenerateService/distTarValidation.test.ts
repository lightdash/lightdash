import { ParameterError } from '@lightdash/common';
import { pack, type Headers } from 'tar-stream';
import { assertValidDistTar } from './distTarValidation';

type TarEntrySpec = {
    name: string;
    content?: string;
    type?: Headers['type'];
};

/** Build a real tar buffer from entry specs via tar-stream pack(). */
async function buildTar(entries: TarEntrySpec[]): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const p = pack();
        const chunks: Buffer[] = [];
        p.on('data', (c: Buffer) => chunks.push(c));
        p.on('end', () => resolve(Buffer.concat(chunks)));
        p.on('error', reject);

        const addNext = (index: number): void => {
            if (index >= entries.length) {
                p.finalize();
                return;
            }
            const entry = entries[index];
            const header: Headers = {
                name: entry.name,
                type: entry.type ?? 'file',
            };
            const onDone = (err?: Error | null): void => {
                if (err) {
                    reject(err);
                    return;
                }
                addNext(index + 1);
            };
            if (header.type === 'file') {
                p.entry(header, entry.content ?? '', onDone);
            } else {
                p.entry(header, onDone);
            }
        };
        addNext(0);
    });
}

const HAPPY_PATH_ENTRIES: TarEntrySpec[] = [
    { name: 'dist/', type: 'directory' },
    { name: 'dist/index.html', content: '<html></html>' },
    { name: 'dist/assets/', type: 'directory' },
    { name: 'dist/assets/app.js', content: 'console.log(1)' },
    { name: 'dist/assets/app.css', content: 'body{}' },
];

describe('assertValidDistTar', () => {
    it('accepts a fixture-shaped dist tar (index.html + flat assets)', async () => {
        const tar = await buildTar(HAPPY_PATH_ENTRIES);

        await expect(assertValidDistTar(tar)).resolves.toBeUndefined();
    });

    it('accepts a leading-underscore asset name (rollup _commonjsHelpers chunks)', async () => {
        const tar = await buildTar([
            ...HAPPY_PATH_ENTRIES,
            { name: 'dist/assets/_commonjsHelpers-Bc9lxTvG.js', content: '//' },
        ]);

        await expect(assertValidDistTar(tar)).resolves.toBeUndefined();
    });

    it('rejects an entry named dist/source.tar (would overwrite the source artifact)', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/source.tar', content: 'evil' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
        await expect(assertValidDistTar(tar)).rejects.toThrow(
            /dist\/source\.tar/,
        );
    });

    it('rejects a dotted-path traversal under assets (dist/assets/../x)', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/../x', content: 'evil' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
    });

    it('rejects a nested subdirectory under assets (dist/assets/sub/x.js)', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/sub/x.js', content: 'evil' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
        await expect(assertValidDistTar(tar)).rejects.toThrow(
            /dist\/assets\/sub\/x\.js/,
        );
    });

    it('rejects an entry name with characters outside the allowed asset pattern', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/../../etc/passwd', content: 'evil' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
    });

    it('rejects more than 500 regular files', async () => {
        const entries: TarEntrySpec[] = [
            { name: 'dist/index.html', content: '<html/>' },
        ];
        for (let i = 0; i < 501; i += 1) {
            entries.push({
                name: `dist/assets/file-${i}.js`,
                content: 'x',
            });
        }
        const tar = await buildTar(entries);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
        await expect(assertValidDistTar(tar)).rejects.toThrow(/too many files/);
    });

    it('accepts exactly 500 regular files (index.html + 499 assets)', async () => {
        const entries: TarEntrySpec[] = [
            { name: 'dist/index.html', content: '<html/>' },
        ];
        for (let i = 0; i < 499; i += 1) {
            entries.push({
                name: `dist/assets/file-${i}.js`,
                content: 'x',
            });
        }
        const tar = await buildTar(entries);

        await expect(assertValidDistTar(tar)).resolves.toBeUndefined();
    });

    it('rejects duplicate entries', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/app.js', content: 'a' },
            { name: 'dist/assets/app.js', content: 'b' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
        await expect(assertValidDistTar(tar)).rejects.toThrow(/duplicate/);
    });

    it('rejects a tar missing dist/index.html', async () => {
        const tar = await buildTar([
            { name: 'dist/assets/app.js', content: 'a' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
        await expect(assertValidDistTar(tar)).rejects.toThrow(
            /dist\/index\.html/,
        );
    });

    it('rejects an unexpected directory entry', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/other/', type: 'directory' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
    });

    it('rejects a symlink entry', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/evil', type: 'symlink' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
    });

    it('rejects a hardlink entry', async () => {
        const tar = await buildTar([
            { name: 'dist/index.html', content: '<html/>' },
            { name: 'dist/assets/evil', type: 'link' },
        ]);

        await expect(assertValidDistTar(tar)).rejects.toThrow(ParameterError);
    });
});
