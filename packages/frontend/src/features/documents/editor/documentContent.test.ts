import { ChartType, type DocumentCell } from '@lightdash/common';
import { Editor } from '@tiptap/core';
import { DOMParser } from '@tiptap/pm/model';
import { buildDocumentContent } from './documentContent';
import { createDocumentEditorExtensions } from './documentEditorExtensions';
import { getDocumentHeadings } from './DocumentHeadingIds';

const chart: DocumentCell = {
    type: 'chart',
    content: {
        source: 'semantic',
        chart: {
            name: 'Orders',
            description: '',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_count'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: { type: ChartType.TABLE },
        },
    },
};

const markdown = (text: string): DocumentCell => ({
    type: 'markdown',
    content: { markdown: text },
});

const createEditor = () =>
    new Editor({
        editable: false,
        extensions: createDocumentEditorExtensions({ projectUuid: 'project' }),
    });

const load = (cells: DocumentCell[]) => {
    const editor = createEditor();
    editor.commands.setContent(buildDocumentContent(editor, cells), {
        emitUpdate: false,
    });
    return editor;
};

describe('buildDocumentContent', () => {
    it('keeps cells in order and places chart nodes with their saved index', () => {
        const editor = load([
            markdown('# Findings\n\nSome text'),
            chart,
            markdown('# Recommendations'),
        ]);
        const types = editor.state.doc.content.content.map((node) =>
            node.type.name === 'documentChart'
                ? `chart:${node.attrs.sourceIndex}`
                : node.type.name,
        );
        expect(types).toEqual(['heading', 'paragraph', 'chart:1', 'heading']);
        expect(editor.state.doc.content.content[2].attrs.content).toStrictEqual(
            chart.content,
        );
        editor.destroy();
    });

    it('parses GitHub-flavoured tables into table nodes', () => {
        const editor = load([
            markdown('| Status | Orders |\n| --- | ---: |\n| completed | 97 |'),
        ]);
        const table = editor.state.doc.firstChild;
        expect(table?.type.name).toBe('table');
        expect(table?.childCount).toBe(2);
        expect(table?.firstChild?.firstChild?.type.name).toBe('tableHeader');
        expect(table?.textContent).toContain('completed');
        editor.destroy();
    });

    it('escapes raw HTML instead of parsing it', () => {
        const editor = load([
            markdown('<script>alert(1)</script>\n\n<img src=x onerror="x">'),
        ]);
        expect(editor.getHTML()).not.toContain('<script');
        expect(editor.getHTML()).not.toContain('<img');
        editor.destroy();
    });

    it('drops links with unsafe protocols but keeps their text', () => {
        const editor = load([
            markdown(
                '[unsafe](javascript:alert%281%29) and [safe](https://example.com/report)',
            ),
        ]);
        const html = editor.getHTML();
        expect(html).not.toContain('href="javascript:');
        expect(html).toContain('href="https://example.com/report"');
        expect(editor.state.doc.textContent).toContain('unsafe');
        editor.destroy();
    });

    it('renders a placeholder paragraph for an unknown cell type', () => {
        const editor = load([
            markdown('# Findings'),
            { type: 'widget', content: {} } as unknown as DocumentCell,
        ]);
        expect(editor.state.doc.lastChild?.textContent).toBe(
            'This content type is not supported yet.',
        );
        expect(editor.state.doc.childCount).toBe(2);
        editor.destroy();
    });
});

describe('getDocumentHeadings', () => {
    it('lists non-empty top-level H1s in order with positional ids', () => {
        const editor = load([
            markdown('Intro\n\n# Findings\n\n## Detail\n\n#\n\n> # Quoted'),
            chart,
            markdown('# Recommendations'),
        ]);
        expect(getDocumentHeadings(editor.state.doc)).toEqual([
            { id: 'document-heading-0', label: 'Findings' },
            { id: 'document-heading-1', label: 'Recommendations' },
        ]);
        editor.destroy();
    });

    it('stamps ids and markers onto the rendered headings', () => {
        const editor = load([
            markdown('Intro'),
            markdown('# Findings\n\n# Recommendations'),
        ]);
        const rendered = editor.view.dom.querySelectorAll('h1');
        expect(
            Array.from(rendered).map((heading) => [
                heading.id,
                heading.getAttribute('data-report-heading'),
                heading.getAttribute('data-first-heading'),
            ]),
        ).toEqual([
            ['document-heading-0', '', 'true'],
            ['document-heading-1', '', null],
        ]);
        editor.destroy();
    });
});

describe('pasted chart HTML', () => {
    // Paste parses clipboard HTML with ProseMirror's DOM parser
    const parsedContent = (attribute: string) => {
        const editor = createEditor();
        const element = document.createElement('div');
        const chartElement = document.createElement('div');
        chartElement.setAttribute('data-document-chart', attribute);
        element.appendChild(chartElement);
        const doc = DOMParser.fromSchema(editor.schema).parse(element);
        let content: unknown = 'no chart node';
        doc.forEach((node) => {
            if (node.type.name === 'documentChart') {
                content = node.attrs.content;
            }
        });
        editor.destroy();
        return content;
    };

    it('keeps a well-formed chart', () => {
        expect(parsedContent(JSON.stringify(chart.content))).toStrictEqual(
            chart.content,
        );
    });

    it.each([
        ['not JSON', '{broken'],
        ['a bare string', JSON.stringify('chart')],
        [
            'a chart without a name',
            JSON.stringify({
                source: 'semantic',
                chart: { tableName: 'orders' },
            }),
        ],
        [
            'an unknown source',
            JSON.stringify({ ...chart.content, source: 'sql' }),
        ],
        [
            'a merge chart without its merge',
            JSON.stringify({ ...chart.content, source: 'merge' }),
        ],
    ])('drops %s instead of rendering it', (_label, attribute) => {
        expect(parsedContent(attribute)).toBeNull();
    });
});
