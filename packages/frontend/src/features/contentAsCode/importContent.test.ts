import { ContentAsCodeType } from '@lightdash/common';
import { dump } from 'js-yaml';
import { assert, describe, expect, it, vi } from 'vitest';
import {
    getDuplicateImportIds,
    parseImportFile,
    runContentImport,
    type ImportEntry,
} from './importContent';

const read = (content: string, name = 'space.yml') => {
    const file = new File([content], name);
    Object.defineProperty(file, 'text', { value: async () => content });
    return parseImportFile(file);
};

const space = (slug: string): ImportEntry => ({
    id: slug,
    fileName: `${slug}.yml`,
    document: {
        type: 'space',
        content: {
            contentType: ContentAsCodeType.SPACE,
            spaceName: slug,
            slug,
        },
    },
    status: 'ready',
    message: null,
    warnings: [],
});

describe('content import', () => {
    it('accepts API-exported dashboards with a null description', async () => {
        const result = await read(
            JSON.stringify({
                contentType: 'dashboard',
                version: 1,
                name: 'Overview',
                slug: 'overview',
                spaceSlug: 'sales',
                description: null,
                tiles: [],
                tabs: [],
            }),
            'overview.yml',
        );
        expect(result.status).toBe('ready');
        assert(result.document?.type === 'dashboard');
        expect(result.document.content.description).toBeUndefined();
    });
    it('shows the backend validation or permission message in the file result', async () => {
        const updates: ImportEntry[] = [];
        await runContentImport({
            entries: [space('sales')],
            upload: vi.fn().mockRejectedValue({
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'You cannot upload to this space.',
                    data: {},
                },
            }),
            onUpdate: (entry) => updates.push(entry),
            shouldStop: () => false,
        });
        expect(updates.at(-1)).toMatchObject({
            status: 'error',
            message: 'You cannot upload to this space.',
        });
    });
    it('reads legacy metadata-only space exports without requiring a version', async () => {
        const result = await read(
            'contentType: space\nspaceName: Sales\nslug: sales',
        );
        expect(result.status).toBe('ready');
    });

    it('resolves YAML merges like the CLI', async () => {
        const result = await read(
            '<<: &space\n  contentType: space\n  spaceName: Sales\n  slug: sales',
        );
        expect(result.status).toBe('ready');
    });

    it('preserves ordinary aliases and CLI timestamp normalization', async () => {
        const result = await read(
            'contentType: dashboard\nversion: 1\nname: &name Sales\nslug: sales\nspaceSlug: sales\ndescription: *name\ntabs: []\ntiles: []\ndownloadedAt: 2026-10-21T10:00:00Z',
            'sales.yaml',
        );
        expect(result).toMatchObject({
            status: 'ready',
            document: {
                content: {
                    description: 'Sales',
                    downloadedAt: '2026-10-21T10:00:00.000Z',
                },
            },
        });
    });

    it('rejects unsupported types, empty files, invalid YAML, and multiple documents', async () => {
        for (const content of [
            '',
            'contentType: sql_chart',
            'a: [',
            '---\ncontentType: space\n---\nslug: sales',
        ]) {
            expect((await read(content)).status).toBe('invalid');
        }
    });

    it.each(['.yml', '.yaml', '.YML'])(
        'accepts YAML exports with %s extensions',
        async (extension) => {
            expect(
                (
                    await read(
                        'contentType: space\nspaceName: Sales\nslug: sales',
                        `sales${extension}`,
                    )
                ).status,
            ).toBe('ready');
        },
    );

    it('rejects JSON and other file extensions before reading their contents', async () => {
        for (const name of ['space.json', 'space.txt', 'space.yml.json']) {
            const file = new File(['contentType: space'], name);
            const text = vi.fn();
            Object.defineProperty(file, 'text', { value: text });
            expect(await parseImportFile(file)).toMatchObject({
                status: 'invalid',
                message: 'Choose a .yml or .yaml file.',
            });
            expect(text).not.toHaveBeenCalled();
        }
    });

    it.each([
        '!!js/function "function () { return 1; }"',
        '!!js/undefined ""',
        '!!js/regexp /test/',
        '!custom value',
    ])('rejects executable or custom YAML tags: %s', async (tag) => {
        const result = await read(
            `contentType: space\nspaceName: ${tag}\nslug: sales`,
        );
        expect(result.status).toBe('invalid');
        expect(result.document).toBeNull();
        expect(result.message).toContain('unknown tag');
    });

    it('rejects recursive aliases and excessive alias expansion', async () => {
        expect(
            (
                await read(
                    'contentType: space\nspaceName: &loop [*loop]\nslug: sales',
                )
            ).status,
        ).toBe('invalid');
        let source = 'a: &a [x, x, x, x, x, x, x, x, x, x]';
        for (const [previous, next] of [
            ['a', 'b'],
            ['b', 'c'],
            ['c', 'd'],
            ['d', 'e'],
        ]) {
            source += `\n${next}: &${next} [${Array(10).fill(`*${previous}`).join(', ')}]`;
        }
        expect(await read(source)).toMatchObject({
            status: 'invalid',
            document: null,
            message: expect.stringContaining('expands beyond'),
        });
        const repeatedString = `a: &a ${'x'.repeat(1024 * 1024)}\nb: [*a, *a, *a, *a, *a]`;
        expect(await read(repeatedString)).toMatchObject({
            status: 'invalid',
            message: expect.stringContaining('expands beyond'),
        });
    });

    it('rejects duplicate YAML keys and non-finite numbers', async () => {
        expect(
            (await read('contentType: space\nslug: one\nslug: two')).status,
        ).toBe('invalid');
        expect(
            await read(
                'contentType: space\nspaceName: Sales\nslug: sales\nversion: .nan',
            ),
        ).toMatchObject({
            status: 'invalid',
            message: 'YAML numbers must be finite.',
        });
    });

    it('validates the full dashboard schema rather than accepting an envelope alone', async () => {
        const result = await read(
            'contentType: dashboard\nname: Sales\nslug: sales\nspaceSlug: sales\nversion: 1',
        );
        expect(result.status).toBe('invalid');
        expect(result.message).toContain('tiles');
    });

    it('rejects duplicate access emails after normalization', async () => {
        const result = await read(
            dump({
                contentType: 'space',
                spaceName: 'Sales',
                slug: 'sales',
                version: 1,
                access: {
                    inheritParentPermissions: false,
                    projectMemberAccessRole: null,
                    groups: [],
                    users: [
                        { email: 'Javi@example.com', role: 'viewer' },
                        { email: ' javi@example.com ', role: 'editor' },
                    ],
                },
            }),
        );
        expect(result.status).toBe('invalid');
        expect(result.message).toContain('only once');
    });

    it('identifies duplicate content across different filenames', () => {
        const first = space('sales');
        const second = { ...first, id: 'copy', fileName: 'copy.yaml' };
        expect([...getDuplicateImportIds([first, second])]).toEqual([
            'sales',
            'copy',
        ]);
    });

    it('waits for parent spaces, retains successes on retry, and blocks failed descendants', async () => {
        const upload = vi
            .fn()
            .mockRejectedValueOnce(new Error('Permission denied'));
        const updates: ImportEntry[] = [];
        await runContentImport({
            entries: [
                space('sales/monthly'),
                { ...space('done'), status: 'success' },
                space('sales'),
            ],
            upload,
            onUpdate: (entry) => updates.push(entry),
            shouldStop: () => false,
        });
        expect(upload).toHaveBeenCalledTimes(1);
        expect(upload.mock.calls[0][0].content.slug).toBe('sales');
        expect(updates.at(-1)).toMatchObject({
            id: 'sales/monthly',
            status: 'blocked',
        });
    });

    it('stops scheduling requests after the in-flight file finishes', async () => {
        let stopped = false;
        const upload = vi.fn().mockImplementation(async () => {
            stopped = true;
            return { message: 'Created', warnings: [] };
        });
        const updates: ImportEntry[] = [];
        await runContentImport({
            entries: [space('one'), space('two')],
            upload,
            onUpdate: (entry) => updates.push(entry),
            shouldStop: () => stopped,
        });
        expect(upload).toHaveBeenCalledTimes(1);
        expect(updates.at(-1)?.status).toBe('success');
    });

    it('blocks a dependent dashboard after a chart fails, then retries only unfinished content', async () => {
        const chart = await read(
            dump({
                contentType: 'chart',
                version: 1,
                name: 'Revenue',
                slug: 'revenue',
                spaceSlug: 'sales',
                tableName: 'orders',
                chartConfig: { type: 'table' },
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            }),
            'chart.yml',
        );
        const dashboard = await read(
            dump({
                contentType: 'dashboard',
                version: 1,
                name: 'Overview',
                slug: 'overview',
                spaceSlug: 'sales',
                tabs: [],
                tiles: [
                    {
                        type: 'saved_chart',
                        tileSlug: 'revenue',
                        x: 0,
                        y: 0,
                        w: 18,
                        h: 6,
                        properties: {
                            chartSlug: 'revenue',
                            chartName: 'Revenue',
                        },
                    },
                ],
            }),
            'dashboard.yml',
        );
        expect(chart.status).toBe('ready');
        expect(dashboard.status).toBe('ready');
        const entries = new Map(
            [
                chart,
                dashboard,
                { ...space('sales'), status: 'success' as const },
            ].map((entry) => [entry.id, entry]),
        );
        const upload = vi
            .fn()
            .mockRejectedValueOnce(new Error('Missing field'));
        const onUpdate = (entry: ImportEntry) => {
            entries.set(entry.id, entry);
        };
        await runContentImport({
            entries: [...entries.values()],
            upload,
            onUpdate,
            shouldStop: () => false,
        });
        expect(entries.get(dashboard.id)?.status).toBe('blocked');
        expect(upload).toHaveBeenCalledTimes(1);
        upload.mockResolvedValue({ message: 'Updated', warnings: [] });
        await runContentImport({
            entries: [...entries.values()],
            upload,
            onUpdate,
            shouldStop: () => false,
        });
        expect(upload.mock.calls.map(([document]) => document.type)).toEqual([
            'chart',
            'chart',
            'dashboard',
        ]);
        expect(
            [...entries.values()].every((entry) => entry.status === 'success'),
        ).toBe(true);
    });
});
