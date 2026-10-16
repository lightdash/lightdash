import {
    prepareMcpCustomChartTypeHtml,
    toMetaContentSecurityPolicy,
} from './buildMcpCustomChartTypeRender';

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

    it('puts the policy and base url first in head', () => {
        const html = prepareMcpCustomChartTypeHtml({
            indexHtml:
                '<!doctype html><html lang="en"><HEAD data-x="1"><link rel="stylesheet" href="./assets/a.css"></HEAD></html>',
            indexUrl,
            cspHeader: "default-src 'none'; frame-ancestors 'none'",
        });

        expect(html).toBe(
            `<!doctype html><html lang="en"><HEAD data-x="1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><base href="${indexUrl}"><link rel="stylesheet" href="./assets/a.css"></HEAD></html>`,
        );
    });

    it('escapes attribute values', () => {
        const html = prepareMcpCustomChartTypeHtml({
            indexHtml: '<head></head>',
            indexUrl: 'https://preview.example/?a="b"&c=<d>',
            cspHeader: "img-src 'self'",
        });

        expect(html).toContain(
            '<base href="https://preview.example/?a=&quot;b&quot;&amp;c=&lt;d&gt;">',
        );
    });

    it('does not match a header element as head', () => {
        expect(
            prepareMcpCustomChartTypeHtml({
                indexHtml: '<body><header></header></body>',
                indexUrl,
                cspHeader: "default-src 'none'",
            }),
        ).toBeNull();
    });
});
