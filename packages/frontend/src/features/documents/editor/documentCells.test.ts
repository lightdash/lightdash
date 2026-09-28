import { ChartType, type DocumentCell } from '@lightdash/common';
import { Editor } from '@tiptap/core';
import { getDocumentCells } from './documentCells';
import { DOCUMENT_CHART_NODE } from './documentChartNode';
import { buildDocumentContent } from './documentContent';
import { createDocumentEditorExtensions } from './documentEditorExtensions';

const chart = (name: string): DocumentCell => ({
    type: 'chart',
    content: {
        source: 'semantic',
        chart: {
            name,
            description: '',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: { type: ChartType.TABLE },
        },
    },
});

const markdown = (text: string): DocumentCell => ({
    type: 'markdown',
    content: { markdown: text },
});

const load = (cells: DocumentCell[]) => {
    const editor = new Editor({
        extensions: createDocumentEditorExtensions({
            projectUuid: 'project',
            editing: { onInsertChart: null, onEditChart: null },
        }),
    });
    editor.commands.setContent(buildDocumentContent(editor, cells), {
        emitUpdate: false,
    });
    return editor;
};

describe('getDocumentCells', () => {
    it('round-trips markdown and chart cells in order', () => {
        const cells = [
            markdown('# Findings\n\nSome **bold** text.\n\n- one\n- two'),
            chart('Orders'),
            markdown(
                '## Detail\n\n| Status | Orders |\n| --- | --- |\n| completed | 97 |',
            ),
            chart('Returns'),
        ];
        const editor = load(cells);
        expect(getDocumentCells(editor)).toStrictEqual(cells);
        editor.destroy();
    });

    it('merges adjacent markdown cells and drops empty trailing paragraphs', () => {
        const editor = load([markdown('Intro'), markdown('# Findings')]);
        editor.commands.insertContentAt(editor.state.doc.content.size, {
            type: 'paragraph',
        });
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown('Intro\n\n# Findings'),
        ]);
        editor.destroy();
    });

    it('serialises an inserted chart node with its content and no markdown', () => {
        const editor = load([markdown('Before'), markdown('After')]);
        const inserted = chart('Inserted');
        editor.commands.insertContentAt(editor.state.doc.firstChild!.nodeSize, {
            type: DOCUMENT_CHART_NODE,
            attrs: { content: inserted.content, sourceIndex: null },
        });
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown('Before'),
            inserted,
            markdown('After'),
        ]);
        editor.destroy();
    });

    it.each([
        'Ends with a backslash \\',
        'Two backslashes \\\\ inside',
        'Stars * and _underscores_ and <angle> brackets',
        'Price is $5 and 100% and a # not heading',
    ])('keeps %s stable across a second round-trip', (text) => {
        const first = load([markdown(text)]);
        const once = getDocumentCells(first);
        first.destroy();
        const second = load(once);
        const twice = getDocumentCells(second);
        second.destroy();
        expect(twice).toStrictEqual(once);
        expect(second.state.doc.textContent).toBe(first.state.doc.textContent);
    });

    it('returns no cells for an empty document', () => {
        const editor = load([]);
        expect(getDocumentCells(editor)).toStrictEqual([]);
        editor.destroy();
    });
});
