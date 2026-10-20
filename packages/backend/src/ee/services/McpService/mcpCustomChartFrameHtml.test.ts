import { JSDOM } from 'jsdom';
import {
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
