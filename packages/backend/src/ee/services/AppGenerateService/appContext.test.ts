import {
    CONTEXT_PREFIX,
    contextFile,
    promptHistoryToMarkdown,
    THEME_ASSET_CAP,
} from './appContext';

describe('appContext helpers', () => {
    it('caps theme assets at 30', () => {
        expect(THEME_ASSET_CAP).toBe(30);
    });
    it('prefixes and base64-encodes a context file', () => {
        const f = contextFile('semantic-layer.yml', 'models: []');
        expect(f.path).toBe(`${CONTEXT_PREFIX}semantic-layer.yml`);
        expect(Buffer.from(f.contentBase64, 'base64').toString('utf-8')).toBe(
            'models: []',
        );
    });
    it('renders prompt history newest first', () => {
        const md = promptHistoryToMarkdown([
            {
                version: 1,
                prompt: 'first',
                createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
                version: 2,
                prompt: 'second',
                createdAt: '2026-01-02T00:00:00.000Z',
            },
        ]);
        expect(md.indexOf('Version 2')).toBeLessThan(md.indexOf('Version 1'));
        expect(md).toContain('second');
    });
});
