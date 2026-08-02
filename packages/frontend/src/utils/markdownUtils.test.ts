import type { Root } from 'hast';
import { unified } from 'unified';
import { markdownSanitizeRehypePlugins } from './markdownUtils';

describe('markdownSanitizeRehypePlugins', () => {
    test('removes executable HTML while preserving safe elements', async () => {
        const tree: Root = {
            type: 'root',
            children: [
                {
                    type: 'element',
                    tagName: 'strong',
                    properties: {},
                    children: [{ type: 'text', value: 'Safe' }],
                },
                {
                    type: 'element',
                    tagName: 'img',
                    properties: {
                        src: 'x',
                        onError: "fetch('/session')",
                    },
                    children: [],
                },
                {
                    type: 'element',
                    tagName: 'script',
                    properties: {},
                    children: [{ type: 'text', value: "fetch('/session')" }],
                },
            ],
        };

        const sanitized = await unified()
            .use({ plugins: markdownSanitizeRehypePlugins })
            .run(tree);
        const serialized = JSON.stringify(sanitized);

        expect(serialized).toContain('strong');
        expect(serialized).toContain('img');
        expect(serialized).not.toContain('onError');
        expect(serialized).not.toContain('script');
        expect(serialized).not.toContain("fetch('/session')");
    });
});
