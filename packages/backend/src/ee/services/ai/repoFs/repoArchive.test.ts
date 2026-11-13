import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { pack } from 'tar-stream';
import {
    getRepoArchiveStream,
    getRepoTree,
} from '../../../../clients/github/Github';
import {
    clearKeptRepoArchives,
    createGithubRepoSource,
    readRepoArchive,
} from './githubRepoSource';

vi.mock('../../../../clients/github/Github');

type Entry = { name: string; content: string | Buffer } | { link: string };

const archive = async (entries: Entry[]): Promise<Readable> => {
    const tar = pack();
    entries.forEach((entry) => {
        if ('link' in entry) {
            tar.entry({
                name: `acme-jaffle-abc123/${entry.link}`,
                type: 'symlink',
                linkname: '../secrets',
            });
        } else {
            tar.entry(
                { name: `acme-jaffle-abc123/${entry.name}` },
                entry.content,
            );
        }
    });
    tar.finalize();
    const chunks: Buffer[] = [];
    for await (const chunk of tar) chunks.push(chunk);
    return Readable.from([gzipSync(Buffer.concat(chunks))]);
};

describe('readRepoArchive', () => {
    const entries: Entry[] = [
        { name: 'README.md', content: '# hi' },
        { name: 'dbt/models/a.sql', content: 'select 1' },
        { name: 'dbt/models/schema.yml', content: 'version: 2' },
        { name: 'dbt/.env', content: 'SECRET=1' },
        { name: 'dbt/logo.png', content: Buffer.from([1, 0, 2]) },
        { name: 'dbt/big.csv', content: 'x'.repeat(1024 * 1024 + 1) },
        { link: 'dbt/models/link.sql' },
    ];

    it('keeps the text files of the whole repo', async () => {
        const files = await readRepoArchive(await archive(entries), {
            prefix: '',
            maxBytes: 1024,
        });
        expect([...(files ?? new Map()).keys()].sort()).toEqual([
            'README.md',
            'dbt/models/a.sql',
            'dbt/models/schema.yml',
        ]);
    });

    it('keeps only what is under the sub path, relative to it', async () => {
        const files = await readRepoArchive(await archive(entries), {
            prefix: 'dbt/',
            maxBytes: 1024,
        });
        expect(files).toEqual(
            new Map([
                ['models/a.sql', 'select 1'],
                ['models/schema.yml', 'version: 2'],
            ]),
        );
    });

    it('holds nothing once the text passes the limit', async () => {
        expect(
            await readRepoArchive(await archive(entries), {
                prefix: '',
                maxBytes: 10,
            }),
        ).toBeNull();
    });
});

describe('an archive kept across agent runs', () => {
    const run = async (sha: string, maxBytes = 1024) => {
        vi.mocked(getRepoTree).mockResolvedValue({
            files: [{ path: 'models/a.sql', size: 8 }],
            truncated: false,
            sha,
        });
        const source = createGithubRepoSource({
            owner: 'acme',
            repo: 'jaffle',
            branch: 'main',
            token: 'tok',
        });
        await source.listAllPaths();
        return source.readAll?.(maxBytes);
    };

    beforeEach(() => {
        clearKeptRepoArchives();
        vi.mocked(getRepoArchiveStream).mockReset();
        vi.mocked(getRepoArchiveStream).mockImplementation(() =>
            archive([{ name: 'models/a.sql', content: 'select 1' }]),
        );
    });

    it('is downloaded once while the tree stays the same', async () => {
        expect((await run('tree-1'))?.get('models/a.sql')).toBe('select 1');
        expect((await run('tree-1'))?.get('models/a.sql')).toBe('select 1');
        expect(getRepoArchiveStream).toHaveBeenCalledTimes(1);
        // The listed tree is what is downloaded, so a branch that moves cannot fill this entry with other files.
        expect(getRepoArchiveStream).toHaveBeenCalledWith(
            expect.objectContaining({ ref: 'tree-1' }),
        );
    });

    it('is downloaded once by runs listing the same tree at the same time', async () => {
        const [first, second] = await Promise.all([
            run('tree-1'),
            run('tree-1'),
        ]);
        expect(first?.get('models/a.sql')).toBe('select 1');
        expect(second).toBe(first);
        expect(getRepoArchiveStream).toHaveBeenCalledTimes(1);
    });

    it('is not downloaded again once its text was too large to hold', async () => {
        expect(await run('tree-1', 4)).toBeNull();
        expect(await run('tree-1', 4)).toBeNull();
        expect(getRepoArchiveStream).toHaveBeenCalledTimes(1);
    });

    it('is downloaded again once the tree changes', async () => {
        await run('tree-1');
        await run('tree-2');
        expect(getRepoArchiveStream).toHaveBeenCalledTimes(2);
    });
});
