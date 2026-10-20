import { JSDOM } from 'jsdom';
import {
    fetchMcpCustomChartFrameHtml,
    loadMcpCustomChartFrameHtml,
    MCP_CUSTOM_CHART_FRAME_TOOL_NAME,
    prepareMcpCustomChartTypeHtml,
    toMetaContentSecurityPolicy,
} from './mcpCustomChartFrameHtml';

describe('toMetaContentSecurityPolicy', () => {
    it('drops directives a meta policy does not support', () => {
        expect(
            toMetaContentSecurityPolicy(
                "default-src 'none'; frame-ancestors https://a.example; script-src 'self'; report-uri /csp; sandbox allow-scripts; ",
            ),
        ).toBe("default-src 'none'; script-src 'self'");
    });
});

describe('prepareMcpCustomChartTypeHtml', () => {
    const indexUrl = 'https://preview.example/api/apps/a/versions/1/t/x.y.z/';

    const contentSecurityPolicy = "default-src 'none'";
    const tags = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'"><base href="${indexUrl}">`;
    const prepare = (html: string) =>
        prepareMcpCustomChartTypeHtml(html, {
            contentSecurityPolicy,
            baseUrl: indexUrl,
        });

    it('starts the document with its own doctype, policy and base url', () => {
        expect(
            prepare(
                '<!doctype html><html lang="en"><head><link rel="stylesheet" href="./assets/a.css"></head></html>',
            ),
        ).toBe(
            `<!doctype html>${tags}<!doctype html><html lang="en"><head><link rel="stylesheet" href="${indexUrl}assets/a.css"></head></html>`,
        );
    });

    it.each([
        [
            'a plain bundle',
            '<!doctype html><html lang="en"><head><script>1</script></head></html>',
        ],
        [
            'a legacy doctype',
            '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><html><head></head></html>',
        ],
        [
            'a leading comment',
            '<!-- build 1 -->\n<!doctype html><html><head></head></html>',
        ],
        [
            'a commented-out head',
            '<!doctype html><!-- <head> --><html><head><script>1</script></head></html>',
        ],
        [
            'a script before head',
            '<!doctype html><script>1</script><html><head></head></html>',
        ],
        ['no doctype', '<script>1</script><head></head>'],
        [
            'an early-closing <!--> comment',
            '<!--><script>1</script>--><!doctype html>',
        ],
        [
            'an early-closing <!---> comment',
            '<!---><script>1</script>--><!doctype html>',
        ],
        [
            'an early-closing --!> comment',
            '<!-- --!><script>1</script>--><!doctype html>',
        ],
        [
            'a leading no-break space',
            `${String.fromCharCode(0xa0)}<!doctype html><head><script>1</script></head>`,
        ],
        [
            'a leading vertical tab',
            `${String.fromCharCode(0x0b)}<!doctype html><head><script>1</script></head>`,
        ],
        [
            'a leading line separator',
            `${String.fromCharCode(0x2028)}<!doctype html><head><script>1</script></head>`,
        ],
        [
            'a leading byte order mark',
            `${String.fromCharCode(0xfeff)}<!doctype html><head><script>1</script></head>`,
        ],
    ])(
        'parses with the policy first in head in standards mode for %s',
        (_case, indexHtml) => {
            const { document } = new JSDOM(prepare(indexHtml)).window;

            expect(document.compatMode).toBe('CSS1Compat');
            expect(document.head.firstElementChild?.outerHTML).toBe(
                `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`,
            );
        },
    );

    it('makes relative asset urls absolute', () => {
        const html = prepare(
            '<head><script type="module" crossorigin src="./assets/index.js"></script><link href="https://cdn.example/x.css"><a href="#top"></a></head>',
        );

        expect(html).toContain(`src="${indexUrl}assets/index.js"`);
        expect(html).toContain('href="https://cdn.example/x.css"');
        expect(html).toContain('href="#top"');
    });

    it('escapes attribute values', () => {
        const html = prepareMcpCustomChartTypeHtml('<head></head>', {
            contentSecurityPolicy: 'img-src \'self\' "x"',
            baseUrl: 'https://preview.example/?a="b"&c=<d>',
        });

        expect(html).toContain('content="img-src \'self\' &quot;x&quot;"');
        expect(html).toContain(
            '<base href="https://preview.example/?a=&quot;b&quot;&amp;c=&lt;d&gt;">',
        );
    });
});

describe('fetchMcpCustomChartFrameHtml', () => {
    const indexUrl = 'https://preview.example/api/apps/a/versions/1/t/x.y.z/';
    const contentSecurityPolicy = "default-src 'none'";
    const { signal } = new AbortController();
    const respond = (body: string, status = 200) =>
        vi.fn().mockResolvedValue(new Response(body, { status }));

    it('fetches the bundle without credentials or caching and prepares it', async () => {
        const fetchFn = respond('<!doctype html><head></head>');

        await expect(
            fetchMcpCustomChartFrameHtml(
                { indexUrl, contentSecurityPolicy },
                { fetchFn, signal },
            ),
        ).resolves.toEqual({
            kind: 'html',
            html: `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><base href="${indexUrl}"><!doctype html><head></head>`,
        });
        expect(fetchFn).toHaveBeenCalledWith(indexUrl, {
            credentials: 'omit',
            cache: 'no-store',
            signal,
        });
    });

    it.each([
        ['a refused token', respond('{"status":"error"}', 403)],
        ['a missing bundle', respond('', 404)],
        [
            'a network error',
            vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        ],
        [
            'an aborted request',
            vi
                .fn()
                .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
        ],
    ])('reports %s as unavailable', async (_case, fetchFn) => {
        await expect(
            fetchMcpCustomChartFrameHtml(
                { indexUrl, contentSecurityPolicy },
                { fetchFn, signal },
            ),
        ).resolves.toEqual({ kind: 'unavailable' });
    });

    it('does not fetch without a policy to run the bundle under', async () => {
        const fetchFn = respond('<head></head>');

        await expect(
            fetchMcpCustomChartFrameHtml(
                { indexUrl, contentSecurityPolicy: null },
                { fetchFn, signal },
            ),
        ).resolves.toEqual({ kind: 'unavailable' });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe('loadMcpCustomChartFrameHtml', () => {
    const indexUrl = 'https://preview.example/api/apps/a/versions/1/t/x.y.z/';
    const contentSecurityPolicy = "default-src 'none'";
    const request = {
        projectUuid: 'project-1',
        agentUuid: null,
        dataAppVizUuid: 'a',
        version: 1,
    };
    const { signal } = new AbortController();
    const respond = (result: unknown) => vi.fn().mockResolvedValue(result);
    const html = () =>
        vi.fn().mockResolvedValue(new Response('<!doctype html><head></head>'));

    it('asks the frame tool for the bundle url and fetches it', async () => {
        const callTool = respond({
            content: [],
            structuredContent: { indexUrl, contentSecurityPolicy },
        });
        const fetchFn = html();

        await expect(
            loadMcpCustomChartFrameHtml(request, { callTool, fetchFn, signal }),
        ).resolves.toEqual({
            kind: 'html',
            html: `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><base href="${indexUrl}"><!doctype html><head></head>`,
        });
        expect(callTool).toHaveBeenCalledWith(
            {
                name: MCP_CUSTOM_CHART_FRAME_TOOL_NAME,
                arguments: {
                    projectUuid: 'project-1',
                    dataAppVizUuid: 'a',
                    version: 1,
                },
            },
            { signal },
        );
        expect(fetchFn).toHaveBeenCalledWith(indexUrl, {
            credentials: 'omit',
            cache: 'no-store',
            signal,
        });
    });

    it.each([
        [
            'an error result',
            respond({
                isError: true,
                content: [{ type: 'text', text: 'nope' }],
                structuredContent: { indexUrl, contentSecurityPolicy },
            }),
        ],
        [
            'a failed call',
            vi.fn().mockRejectedValue(new Error('Tool call failed')),
        ],
        [
            'a malformed result',
            respond({
                structuredContent: { indexUrl, contentSecurityPolicy: 1 },
            }),
        ],
        ['no tool call support', null],
    ])(
        'reports %s as unavailable without fetching',
        async (_case, callTool) => {
            const fetchFn = html();

            await expect(
                loadMcpCustomChartFrameHtml(request, {
                    callTool,
                    fetchFn,
                    signal,
                }),
            ).resolves.toEqual({ kind: 'unavailable' });
            expect(fetchFn).not.toHaveBeenCalled();
        },
    );
});
