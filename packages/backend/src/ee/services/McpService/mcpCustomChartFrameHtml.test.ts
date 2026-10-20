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

    it('puts the policy and base url right after the doctype', () => {
        expect(
            prepare(
                '<!doctype html><html lang="en"><HEAD data-x="1"><link rel="stylesheet" href="./assets/a.css"></HEAD></html>',
            ),
        ).toBe(
            `<!doctype html>${tags}<html lang="en"><HEAD data-x="1"><link rel="stylesheet" href="${indexUrl}assets/a.css"></HEAD></html>`,
        );
    });

    it('keeps an uppercase doctype first', () => {
        expect(
            prepare('<!DOCTYPE HTML PUBLIC "x">\n<html><head></head></html>'),
        ).toBe(`<!DOCTYPE HTML PUBLIC "x">${tags}\n<html><head></head></html>`);
    });

    it('keeps a doctype that follows a comment first', () => {
        expect(
            prepare(
                '<!-- build 1 -->\n<!doctype html><html><head></head></html>',
            ),
        ).toBe(
            `<!-- build 1 -->\n<!doctype html>${tags}<html><head></head></html>`,
        );
    });

    it.each([
        [
            'a commented-out head',
            '<!doctype html><!-- <head> --><html><head><script>1</script></head></html>',
        ],
        [
            'a script before head',
            '<!doctype html><script>alert(1)</script><html><head></head></html>',
        ],
        ['no head', '<!doctype html><body><header></header></body>'],
        [
            'a comment the parser closes early',
            '<!doctype html><!--><script>1</script>--><html></html>',
        ],
    ])('puts the policy ahead of the bundle with %s', (_case, indexHtml) => {
        const html = prepare(indexHtml);
        expect(html.startsWith(`<!doctype html>${tags}`)).toBe(true);
        expect(html.slice(`<!doctype html>${tags}`.length)).toBe(
            indexHtml.slice('<!doctype html>'.length),
        );
    });

    it.each([
        '<!--><script>1</script>--><!doctype html>',
        '<!---><script>1</script>--><!doctype html>',
        '<!-- --!><script>1</script>--><!doctype html>',
    ])(
        'keeps the policy first when %s closes its comment early',
        (indexHtml) => {
            expect(prepare(indexHtml)).toBe(`${tags}${indexHtml}`);
        },
    );

    it.each([
        ['a no-break space', String.fromCharCode(0xa0)],
        ['a vertical tab', String.fromCharCode(0x0b)],
        ['a line separator', String.fromCharCode(0x2028)],
    ])(
        'keeps the policy first when %s, which html treats as text, precedes the doctype',
        (_case, prefix) => {
            const indexHtml = `${prefix}<!doctype html><html><head></head></html>`;
            expect(prepare(indexHtml)).toBe(`${tags}${indexHtml}`);
        },
    );

    it('starts the document with the policy when there is no doctype', () => {
        expect(prepare('<script>alert(1)</script><head></head>')).toBe(
            `${tags}<script>alert(1)</script><head></head>`,
        );
    });

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
