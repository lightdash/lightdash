import {
    parseDocumentAsCode,
    parseDocumentAsCodeFile,
    parseDocumentContent,
    parseStoredDocumentContent,
} from './document';
import {
    FUTURE_BLOCK_TAG,
    FUTURE_DOCUMENT_CONTENT,
    FUTURE_KIND_CHART,
    FUTURE_VERSION_CHART,
    KNOWN_DOCUMENT_CHART,
} from './documentCompatibility.mock';
import {
    getDocumentChartBlocks,
    getDocumentSummaryMarkdown,
} from './documentMarkdown';

const stored = parseStoredDocumentContent(FUTURE_DOCUMENT_CONTENT);

describe('reading content saved by a newer release', () => {
    test('keeps what it reads as charts and the rest as unsupported content', () => {
        expect(stored).toEqual({
            markdown: FUTURE_DOCUMENT_CONTENT.markdown,
            charts: { c1: KNOWN_DOCUMENT_CHART },
            unsupportedCharts: {
                c2: FUTURE_KIND_CHART,
                c3: FUTURE_VERSION_CHART,
            },
        });
    });

    test('places unsupported content in reading order', () => {
        expect(
            getDocumentChartBlocks(stored).map((block) => block.type),
        ).toEqual([
            'markdown',
            'chart',
            'markdown',
            'unsupportedChart',
            'unsupportedChart',
            'unsupportedTag',
            'markdown',
        ]);
    });

    test('reads a known chart that fails validation as unsupported', () => {
        const broken = { source: 'semantic', chart: { name: 'No query' } };
        expect(
            parseStoredDocumentContent({
                markdown: '<document-chart id="c1">',
                charts: { c1: broken },
            }).unsupportedCharts,
        ).toEqual({ c1: broken });
    });

    test('leaves HTML lines as markdown', () => {
        const markdown = 'Line one\n\n<br>\n\n<img src="chart.png">';
        expect(
            getDocumentChartBlocks({ markdown, charts: {} }).map(
                (block) => block.type,
            ),
        ).toEqual(['markdown']);
    });

    test('omits unsupportedCharts when every chart is readable', () => {
        expect(
            parseStoredDocumentContent({
                markdown: '<document-chart id="c1">',
                charts: { c1: { ...KNOWN_DOCUMENT_CHART, version: 1 } },
            }),
        ).toEqual({
            markdown: '<document-chart id="c1">',
            charts: { c1: KNOWN_DOCUMENT_CHART },
        });
    });

    test('shows agents which charts they cannot read', () => {
        expect(getDocumentSummaryMarkdown(stored)).toContain(
            '<document-chart id="c2" unsupported="true">',
        );
    });
});

describe('writing content that holds newer-release content', () => {
    test('rejects it when there is no previous version', () => {
        expect(() => parseDocumentContent(2, FUTURE_DOCUMENT_CONTENT)).toThrow(
            'Chart "c2" is "image", which this version doesn\'t support',
        );
    });

    test('accepts it unchanged from the previous version', () => {
        expect(parseDocumentContent(2, stored, { previous: stored })).toEqual(
            stored,
        );
    });

    test('keeps it through a text edit', () => {
        const edited = {
            ...stored,
            markdown: stored.markdown.replace('Closing text.', 'New ending.'),
        };
        expect(parseDocumentContent(2, edited, { previous: stored })).toEqual(
            edited,
        );
    });

    test('carries over unsupported charts a client leaves out', () => {
        expect(
            parseDocumentContent(
                2,
                { markdown: stored.markdown, charts: stored.charts },
                { previous: stored },
            ),
        ).toEqual(stored);
    });

    test('drops unsupported content whose block was removed', () => {
        const markdown = stored.markdown
            .replace('\n\n<document-chart id="c2">', '')
            .replace(`\n\n${FUTURE_BLOCK_TAG}`, '');
        expect(
            parseDocumentContent(
                2,
                { ...stored, markdown },
                { previous: stored },
            ),
        ).toEqual({
            markdown,
            charts: stored.charts,
            unsupportedCharts: { c3: FUTURE_VERSION_CHART },
        });
    });

    test('rejects a changed unsupported chart', () => {
        expect(() =>
            parseDocumentContent(
                2,
                {
                    ...stored,
                    unsupportedCharts: {
                        ...stored.unsupportedCharts,
                        c2: { ...FUTURE_KIND_CHART, image: {} },
                    },
                },
                { previous: stored },
            ),
        ).toThrow('Chart "c2" is "image"');
    });

    test('names the version of a known kind it cannot read', () => {
        expect(() =>
            parseDocumentContent(2, {
                markdown: '<document-chart id="c1">',
                charts: { c1: FUTURE_VERSION_CHART },
            }),
        ).toThrow('Chart "c1" is "semantic" version 99');
    });

    test('rejects a new unsupported block tag', () => {
        expect(() =>
            parseDocumentContent(
                2,
                { ...stored, markdown: `${stored.markdown}\n\n<new-block>` },
                { previous: stored },
            ),
        ).toThrow("<new-block> isn't supported by this version");
    });

    test('drops the version of a chart it reads', () => {
        expect(
            parseDocumentContent(2, {
                markdown: '<document-chart id="c1">',
                charts: { c1: { ...KNOWN_DOCUMENT_CHART, version: 1 } },
            }).charts,
        ).toEqual({ c1: KNOWN_DOCUMENT_CHART });
    });
});

describe('Document files', () => {
    const file = {
        name: 'Quarterly review',
        slug: 'quarterly-review',
        spaceSlug: 'finance',
        schemaVersion: 2,
        ...FUTURE_DOCUMENT_CONTENT,
        addedLater: true,
    };

    test('pass the outer-shape check with newer charts and fields', () => {
        expect(parseDocumentAsCodeFile(file)).toEqual({
            ...file,
            description: '',
        });
    });

    test.each([
        [{ ...file, markdown: 1 }, 'markdown must be a string'],
        [{ ...file, charts: { c1: {} } }, 'must be an object with a source'],
        [{ ...file, schemaVersion: '2' }, 'schemaVersion must be an integer'],
        [{ ...file, slug: '' }, 'must be non-empty strings'],
    ])('fail the outer-shape check when malformed: %j', (raw, message) => {
        expect(() => parseDocumentAsCodeFile(raw)).toThrow(message);
    });

    test('are validated strictly on write', () => {
        const { addedLater, ...known } = file;
        expect(() => parseDocumentAsCode(file)).toThrow(
            'Unknown Document fields: addedLater',
        );
        expect(() => parseDocumentAsCode(known)).toThrow('Chart "c2"');
        expect(
            parseDocumentAsCode(
                { ...known, unsupportedCharts: stored.unsupportedCharts },
                { previous: stored },
            ),
        ).toEqual({ ...known, description: '', ...stored });
    });
});
