import { describe, expect, it } from 'vitest';
import { parseHomepageConfig, sanitizeHomepageConfig } from './schema';
import { defaultHomepageConfig, type HomepageConfig } from './types';

const validConfig: HomepageConfig = {
    version: 1,
    rows: [
        {
            id: 'row-1',
            blocks: [
                { id: 'b1', type: 'markdown', config: { content: '# Hi' } },
                {
                    id: 'b2',
                    type: 'collection',
                    config: {
                        title: 'Key dashboards',
                        items: [{ contentType: 'dashboard', uuid: 'd1' }],
                        source: 'pinned',
                        verifiedOnly: true,
                        limit: 6,
                    },
                },
            ],
        },
        {
            id: 'row-2',
            blocks: [
                {
                    id: 'b3',
                    type: 'quick-actions',
                    config: {
                        actions: [
                            { type: 'ask-ai', primary: true },
                            {
                                type: 'dashboard',
                                dashboardUuid: 'd2',
                                label: 'KPIs',
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

describe('parseHomepageConfig', () => {
    it('round-trips a valid config unchanged', () => {
        expect(parseHomepageConfig(validConfig)).toEqual(validConfig);
    });

    it('round-trips the default config', () => {
        const config = defaultHomepageConfig();
        expect(parseHomepageConfig(config)).toEqual(config);
    });

    it('strips unknown properties instead of persisting them', () => {
        const withExtras = {
            version: 1,
            junk: 'top-level',
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'markdown',
                            config: { content: 'x', legacyField: true },
                            surprise: 42,
                        },
                    ],
                },
            ],
        };
        expect(parseHomepageConfig(withExtras)).toEqual({
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'markdown',
                            config: { content: 'x' },
                        },
                    ],
                },
            ],
        });
    });

    it('migrates legacy hero blocks to markdown', () => {
        const legacy = {
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'hero',
                            config: { title: 'Welcome', subtitle: 'Hello' },
                        },
                    ],
                },
            ],
        };
        expect(parseHomepageConfig(legacy)).toEqual({
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'markdown',
                            config: { content: '## Welcome\n\nHello' },
                        },
                    ],
                },
            ],
        });
    });

    it('rejects an unknown block type', () => {
        const config = {
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [{ id: 'b1', type: 'mystery', config: {} }],
                },
            ],
        };
        expect(() => parseHomepageConfig(config)).toThrow(
            /Invalid homepage config/,
        );
    });

    it('rejects a block with a wrong config shape', () => {
        const config = {
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        { id: 'b1', type: 'markdown', config: { content: 7 } },
                    ],
                },
            ],
        };
        expect(() => parseHomepageConfig(config)).toThrow(
            /Invalid homepage config/,
        );
    });

    it('rejects unsupported versions and non-objects', () => {
        expect(() => parseHomepageConfig({ version: 2, rows: [] })).toThrow();
        expect(() => parseHomepageConfig(null)).toThrow();
        expect(() => parseHomepageConfig('{}')).toThrow();
    });

    it('rejects rows over the block cap', () => {
        const block = (id: string) => ({
            id,
            type: 'favorites' as const,
            config: { title: 'Favs' },
        });
        const config = {
            version: 1,
            rows: [
                { id: 'row-1', blocks: [block('a'), block('b'), block('c')] },
            ],
        };
        expect(() => parseHomepageConfig(config)).toThrow(/at most/);
    });
});

describe('sanitizeHomepageConfig', () => {
    it('returns a valid config unchanged', () => {
        expect(sanitizeHomepageConfig(validConfig)).toEqual(validConfig);
    });

    it('drops invalid blocks but keeps the rest of the page', () => {
        const config = {
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'markdown',
                            config: { content: 'x' },
                        },
                        { id: 'b2', type: 'from-the-future', config: {} },
                    ],
                },
            ],
        };
        expect(sanitizeHomepageConfig(config)).toEqual({
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'markdown',
                            config: { content: 'x' },
                        },
                    ],
                },
            ],
        });
    });

    it('migrates legacy hero blocks instead of dropping them', () => {
        const config = {
            version: 1,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        { id: 'b1', type: 'hero', config: { title: 'Hey' } },
                    ],
                },
            ],
        };
        expect(sanitizeHomepageConfig(config).rows[0].blocks).toEqual([
            { id: 'b1', type: 'markdown', config: { content: '## Hey' } },
        ]);
    });

    it('keeps oversized rows (read path never loses stored blocks)', () => {
        const block = (id: string) => ({
            id,
            type: 'favorites' as const,
            config: { title: 'Favs' },
        });
        const config = {
            version: 1,
            rows: [
                { id: 'row-1', blocks: [block('a'), block('b'), block('c')] },
            ],
        };
        expect(sanitizeHomepageConfig(config).rows[0].blocks).toHaveLength(3);
    });

    it('throws on a config that was never renderable', () => {
        expect(() => sanitizeHomepageConfig(null)).toThrow(/Corrupt/);
        expect(() => sanitizeHomepageConfig({ rows: 'nope' })).toThrow(
            /Corrupt/,
        );
    });
});
