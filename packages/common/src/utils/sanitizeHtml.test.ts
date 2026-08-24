import {
    HTML_SANITIZE_DEFAULT_RULES,
    HTML_SANITIZE_LEARN_LESSON_RULES,
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    sanitizeHtml,
} from './sanitizeHtml';

describe('sanitizeHtml', () => {
    test('empty input', () => {
        expect(sanitizeHtml('')).toEqual('');
    });

    test('no html tags in input', () => {
        expect(sanitizeHtml('Hello this is just some text')).toEqual(
            'Hello this is just some text',
        );
    });

    test('script tag is discarded', () => {
        expect(sanitizeHtml('<script>console.log("sup");</script>')).toEqual(
            '',
        );
    });

    test('script tag with neighboring text is discarded', () => {
        expect(
            sanitizeHtml('<script>console.log("sup");</script> Some text'),
        ).toEqual(' Some text');
    });

    test('valid tag is preserved', () => {
        expect(
            sanitizeHtml('<a href="https://www.lightdash.com/">Lightdash</a>'),
        ).toEqual('<a href="https://www.lightdash.com/">Lightdash</a>');
    });

    test('style tag in paragraph is discarded', () => {
        expect(
            sanitizeHtml('<p style="color:red;font-size:24px">@Foo</p>'),
        ).toEqual('<p>@Foo</p>');
    });

    describe('as part of markdown tiles', () => {
        test('markdown tile rule set', () => {
            expect(
                sanitizeHtml(
                    '<iframe src="https://google.com" width=400 height="300"></iframe>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<iframe src="https://google.com" width="400" height="300"></iframe>',
            );

            expect(
                sanitizeHtml(
                    '<img src="https://google.com" width=400 height="300" />',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<img src="https://google.com" width="400" height="300" />',
            );

            expect(
                sanitizeHtml(
                    '<style>body { content: "hello this is ur bank"; }</style>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('');
        });

        test('style tag in span is preserved', () => {
            expect(
                sanitizeHtml(
                    '<span style="color:red;font-size:24px">@Foo</span>',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('<span style="color:red;font-size:24px">@Foo</span>');
        });

        test('valid tag with surrounding + inner text', () => {
            expect(
                sanitizeHtml(
                    'Here is some text <p>And a paragraph.</p><br />',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('Here is some text <p>And a paragraph.</p><br />');
        });

        test('double sanitization (with invalid tags)', () => {
            expect(
                sanitizeHtml(
                    sanitizeHtml(
                        '<script>console.log("boo");</script><p><span style="color: red">@Foo</span></p>',
                        HTML_SANITIZE_MARKDOWN_TILE_RULES,
                    ),
                ),
            ).toEqual('<p><span style="color:red">@Foo</span></p>');
        });

        test('malformed tag', () => {
            expect(
                sanitizeHtml(
                    '<span style="color:red">@Foo',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('<span style="color:red">@Foo</span>');
        });

        test('valid style attribute in allowed tags', () => {
            const allowedTags = [
                '<span style="color:red">Text</span>',
                '<a href="#" style="font-size:16px">Link</a>',
                '<p style="font-weight:bold">Paragraph</p>',
            ];

            allowedTags.forEach((tag) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(tag);
            });
        });

        test('invalid style attributes in allowed tags', () => {
            const invalidTags = [
                [
                    '<span style="background-image:url(\'https://example.com/image.jpg\');">Text</span>',
                    '<span>Text</span>',
                ],
                [
                    '<a href="#" style="border:1px solid black">Link</a>',
                    '<a href="#">Link</a>',
                ],
                [
                    '<p style="text-align:right;background: red;">Paragraph</p>',
                    '<p style="text-align:right;background:red">Paragraph</p>',
                ],
                [
                    '<p style="color:rgba(1,1,1,0)">Paragraph</p>',
                    '<p>Paragraph</p>',
                ],
                ['<p style="color:#0000">Paragraph</p>', '<p>Paragraph</p>'],
                [
                    '<p style="color:#00000000">Paragraph</p>',
                    '<p>Paragraph</p>',
                ],
            ];

            invalidTags.forEach(([tag, expected]) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(expected);
            });
        });

        test('valid style attribute in allowed tags with multiple styles', () => {
            const tag = '<span style="color:red;font-weight:bold">Text</span>';
            expect(
                sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(tag);
        });

        test('invalid style attributes in allowed tags with multiple styles', () => {
            expect(
                sanitizeHtml(
                    `<span style="color:red;font-weight:bold;text-align:right;background: url('foo.jpg')">Text</span>`,
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual(
                '<span style="color:red;font-weight:bold;text-align:right">Text</span>',
            );
        });

        test('responsive CSS properties are preserved', () => {
            const responsiveTags = [
                '<img src="logo.png" style="max-width:100%;height:auto;max-height:40px" />',
                '<img src="logo.png" style="min-width:50px;min-height:20px" />',
                '<img src="logo.png" style="object-fit:contain" />',
                '<img src="logo.png" style="width:auto;max-width:none" />',
                '<div style="max-width:100%;max-height:none">Content</div>',
            ];

            responsiveTags.forEach((tag) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(tag);
            });
        });

        test('invalid object-fit values are stripped', () => {
            expect(
                sanitizeHtml(
                    '<img src="logo.png" style="object-fit:url(evil)" />',
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                ),
            ).toEqual('<img src="logo.png" />');
        });

        test('style attributes in disallowed tags', () => {
            const disallowedTags = [
                [
                    '<div style="color:red;">Text</div>',
                    '<div style="color:red">Text</div>',
                ],
                [
                    '<table style="border:1px solid black;"><tr><td>Cell</td></tr></table>',
                    '<table><tr><td>Cell</td></tr></table>',
                ],
            ];

            disallowedTags.forEach(([tag, expected]) => {
                expect(
                    sanitizeHtml(tag, HTML_SANITIZE_MARKDOWN_TILE_RULES),
                ).toEqual(expected);
            });
        });
    });

    describe('hostile script URIs in scheme-carrying attributes (CVE-2026-53606)', () => {
        const hostileCases: Array<{
            input: string;
            expectedDefault: string;
            expectedMarkdown: string;
        }> = [
            {
                input: '<form action="javascript:alert(1)"><input type="submit"></form>',
                expectedDefault: '',
                expectedMarkdown: '',
            },
            {
                input: '<button formaction="javascript:alert(1)">click</button>',
                expectedDefault: 'click',
                expectedMarkdown: 'click',
            },
            {
                input: '<object data="javascript:alert(1)"></object>',
                expectedDefault: '',
                expectedMarkdown: '',
            },
            {
                input: '<video poster="javascript:alert(1)"></video>',
                expectedDefault: '',
                expectedMarkdown: '',
            },
            {
                input: '<body background="javascript:alert(1)">text</body>',
                expectedDefault: 'text',
                expectedMarkdown: 'text',
            },
            {
                input: '<table background="javascript:alert(1)"><tr><td>cell</td></tr></table>',
                expectedDefault: '<table><tr><td>cell</td></tr></table>',
                expectedMarkdown: '<table><tr><td>cell</td></tr></table>',
            },
            {
                input: '<iframe src="javascript:alert(1)" width="400"></iframe>',
                expectedDefault: '',
                expectedMarkdown: '<iframe width="400"></iframe>',
            },
            {
                input: '<img src="javascript:alert(1)" alt="x" />',
                expectedDefault: '',
                expectedMarkdown: '<img alt="x" />',
            },
            {
                input: '<a href="javascript:alert(1)">link</a>',
                expectedDefault: '<a>link</a>',
                expectedMarkdown: '<a>link</a>',
            },
        ];

        hostileCases.forEach(({ input, expectedDefault, expectedMarkdown }) => {
            test(`strips javascript: URI from ${input}`, () => {
                const defaultOutput = sanitizeHtml(
                    input,
                    HTML_SANITIZE_DEFAULT_RULES,
                );
                const markdownOutput = sanitizeHtml(
                    input,
                    HTML_SANITIZE_MARKDOWN_TILE_RULES,
                );

                expect(defaultOutput).toEqual(expectedDefault);
                expect(markdownOutput).toEqual(expectedMarkdown);
                expect(defaultOutput).not.toContain('javascript');
                expect(markdownOutput).not.toContain('javascript');
            });
        });
    });

    describe('legitimate URL-bearing content is preserved', () => {
        test('https iframe embed keeps src, dimensions and name', () => {
            const input =
                '<iframe src="https://www.youtube.com/embed/abc123" width="560" height="315" name="yt"></iframe>';
            expect(
                sanitizeHtml(input, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(input);
        });

        test('protocol-relative iframe src is preserved', () => {
            const input = '<iframe src="//example.com/embed"></iframe>';
            expect(
                sanitizeHtml(input, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(input);
        });

        test('https img with dimensions, alt and style is preserved', () => {
            const input =
                '<img src="https://example.com/logo.png" width="100" height="50" alt="logo" style="max-width:100%" />';
            expect(
                sanitizeHtml(input, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(input);
        });

        test('styled span mention survives both rule sets', () => {
            const input = '<span style="color:red">@Foo Bar</span>';
            expect(sanitizeHtml(input, HTML_SANITIZE_DEFAULT_RULES)).toEqual(
                input,
            );
            expect(
                sanitizeHtml(input, HTML_SANITIZE_MARKDOWN_TILE_RULES),
            ).toEqual(input);
        });

        test('rendered markdown email body survives default rules', () => {
            const input =
                '<h1>Weekly report</h1><p>Hello <strong>team</strong>, see <a href="https://example.com/dashboard">the dashboard</a>.</p><ul><li>First item</li><li>Second item</li></ul>';
            expect(sanitizeHtml(input, HTML_SANITIZE_DEFAULT_RULES)).toEqual(
                input,
            );
        });
    });
});

describe('HTML_SANITIZE_LEARN_LESSON_RULES', () => {
    const lesson =
        '<p>Open Browse<a class="cit" href="#fig-1" data-hl="r1">1</a>.</p>' +
        '<span class="figwrap" id="fig-1"><img src="https://x/y.png" alt="Spaces">' +
        '<span class="hlbox below pl-l" data-r="r1" data-label="1 · Browse" style="left:10.5%;top:1.2%;width:7.5%;height:4%"></span></span>' +
        '<figure class="shot" id="fig-2"><img src="https://x/z.png" alt=""><figcaption>Cap</figcaption></figure>';

    test('keeps citation pins, figure ids and positioned highlight boxes', () => {
        const out = sanitizeHtml(lesson, HTML_SANITIZE_LEARN_LESSON_RULES);
        expect(out).toContain(
            '<a class="cit" href="#fig-1" data-hl="r1">1</a>',
        );
        expect(out).toContain('<span class="figwrap" id="fig-1">');
        expect(out).toContain('data-r="r1"');
        expect(out).toContain('data-label="1 · Browse"');
        expect(out).toContain('left:10.5%');
        expect(out).toContain('height:4%');
        expect(out).toContain('<figure class="shot" id="fig-2">');
    });

    test('still drops scripts, stylesheets and unsafe styles', () => {
        const out = sanitizeHtml(
            '<style>a{}</style><script>x()</script>' +
                '<span class="hlbox" style="position:fixed;left:10%;background:url(x)"></span>',
            HTML_SANITIZE_LEARN_LESSON_RULES,
        );
        expect(out).not.toContain('<style');
        expect(out).not.toContain('<script');
        expect(out).not.toContain('position');
        expect(out).not.toContain('url(');
        expect(out).toContain('left:10%');
    });
});

describe('HTML_SANITIZE_LEARN_LESSON_RULES demo placeholders', () => {
    test('keeps the data-demo mount point and nothing else on it', () => {
        const out = sanitizeHtml(
            '<div data-demo="save-chart" onclick="x()"></div>',
            HTML_SANITIZE_LEARN_LESSON_RULES,
        );
        expect(out).toBe('<div data-demo="save-chart"></div>');
    });
});

describe('HTML_SANITIZE_LEARN_LESSON_RULES frames', () => {
    test('drops iframes even though markdown tiles allow them', () => {
        const out = sanitizeHtml(
            '<p>Before</p><iframe src="https://example.com/login" width="600" height="400"></iframe><p>After</p>',
            HTML_SANITIZE_LEARN_LESSON_RULES,
        );
        expect(out).toBe('<p>Before</p><p>After</p>');
    });
});
