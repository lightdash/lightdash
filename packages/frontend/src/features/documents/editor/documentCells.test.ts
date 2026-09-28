import { ChartType, type DocumentCell } from '@lightdash/common';
import { Editor } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { TextSelection } from '@tiptap/pm/state';
import { getDocumentCells, getTopLevelInsertPosition } from './documentCells';
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

describe('writing around charts', () => {
    const typeAt = (
        editor: ReturnType<typeof load>,
        position: number,
        text: string,
    ) => {
        const $pos = editor.state.doc.resolve(position);
        editor.view.dispatch(editor.state.tr.setSelection(new GapCursor($pos)));
        editor.commands.insertContent(text);
    };

    it('writes above a chart that starts the document', () => {
        const first = chart('First');
        const editor = load([first, markdown('After')]);
        typeAt(editor, 0, 'Intro');
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown('Intro'),
            first,
            markdown('After'),
        ]);
        editor.destroy();
    });

    it('writes between two adjacent charts', () => {
        const first = chart('First');
        const second = chart('Second');
        const editor = load([first, second]);
        typeAt(editor, editor.state.doc.firstChild!.nodeSize, 'Between');
        expect(getDocumentCells(editor)).toStrictEqual([
            first,
            markdown('Between'),
            second,
        ]);
        editor.destroy();
    });

    it('keeps an empty line after a chart that ends the document', () => {
        const last = chart('Last');
        const editor = load([markdown('Before'), last]);
        expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
        const end = editor.state.doc.content.size - 1;
        editor.commands.setTextSelection(end);
        editor.commands.insertContent('After');
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown('Before'),
            last,
            markdown('After'),
        ]);
        editor.destroy();
    });
});

describe('moving charts', () => {
    /** Moves the top-level node at `from` so it ends up at index `to`, like a drop does. */
    const moveTopLevel = (
        editor: ReturnType<typeof load>,
        from: number,
        to: number,
    ) => {
        const { tr, doc } = editor.state;
        let start = 0;
        doc.forEach((_node, offset, index) => {
            if (index === from) start = offset;
        });
        const node = doc.child(from);
        tr.delete(start, start + node.nodeSize);
        let insertAt = 0;
        tr.doc.forEach((child, offset, index) => {
            if (index < to) insertAt = offset + child.nodeSize;
        });
        tr.insert(insertAt, node);
        editor.view.dispatch(tr);
    };

    it('reorders cells and keeps the saved cell index so the chart keeps its query', () => {
        const orders = chart('Orders');
        const editor = load([markdown('# Intro'), orders, markdown('Outro')]);
        moveTopLevel(editor, 1, 2);
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown('# Intro\n\nOutro'),
            orders,
        ]);
        let movedIndex: unknown = null;
        editor.state.doc.forEach((node) => {
            if (node.type.name === 'documentChart') {
                movedIndex = node.attrs.sourceIndex;
            }
        });
        expect(movedIndex).toBe(1);
        editor.destroy();
    });

    it('serialises identically after a move back to the start position', () => {
        const cells = [markdown('# Intro'), chart('Orders'), markdown('Outro')];
        const editor = load(cells);
        moveTopLevel(editor, 1, 2);
        moveTopLevel(editor, 2, 1);
        expect(getDocumentCells(editor)).toStrictEqual(cells);
        editor.destroy();
    });
});

describe('top-level charts', () => {
    it('never allows a chart inside a table cell, list item or quote', () => {
        const editor = load([markdown('Text')]);
        const { schema } = editor;
        const chartType = schema.nodes.documentChart;
        for (const name of [
            'tableCell',
            'tableHeader',
            'listItem',
            'blockquote',
        ]) {
            expect(
                schema.nodes[name].contentMatch.matchType(chartType),
            ).toBeNull();
        }
        expect(
            schema.nodes.doc.contentMatch.matchType(chartType),
        ).not.toBeNull();
        editor.destroy();
    });

    it('drops a pasted chart that lands inside a list instead of nesting it', () => {
        const editor = load([markdown('- one\n- two')]);
        const inList = 4;
        editor.commands.insertContentAt(inList, {
            type: 'documentChart',
            attrs: { content: chart('Orders').content, sourceIndex: null },
        });
        let nested = false;
        editor.state.doc.forEach((top) =>
            top.descendants((node) => {
                if (node.type.name === 'documentChart') nested = true;
            }),
        );
        expect(nested).toBe(false);
        editor.destroy();
    });

    it('resolves an insertion inside a list to just after that list', () => {
        const editor = load([markdown('- one\n- two'), markdown('After')]);
        const list = editor.state.doc.firstChild!;
        expect(getTopLevelInsertPosition(editor.state.doc, 4)).toBe(
            list.nodeSize,
        );
        expect(getTopLevelInsertPosition(editor.state.doc, 0)).toBe(0);
        editor.destroy();
    });
});

describe('markdown tables', () => {
    const table =
        '| Status | Orders | Note |\n| :--- | ---: | :---: |\n| completed | 97 | ok |';

    const caretAfter = (editor: ReturnType<typeof load>, text: string) => {
        let position = -1;
        editor.state.doc.descendants((node, offset) => {
            if (node.isText && node.text === text) {
                position = offset + text.length;
            }
        });
        editor.view.dispatch(
            editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, position),
            ),
        );
    };

    it('keeps column alignment across a save', () => {
        const editor = load([markdown(table)]);
        expect(getDocumentCells(editor)).toStrictEqual([markdown(table)]);
        editor.destroy();
    });

    it('keeps the table and its text when Enter splits a cell', () => {
        const editor = load([markdown(table)]);
        caretAfter(editor, 'completed');
        editor.commands.keyboardShortcut('Enter');
        editor.commands.insertContent('late');
        expect(getDocumentCells(editor)).toStrictEqual([
            markdown(
                '| Status | Orders | Note |\n| :--- | ---: | :---: |\n| completed late | 97 | ok |',
            ),
        ]);
        editor.destroy();
    });

    it('writes a line break inside a cell as a space', () => {
        const editor = load([markdown(table)]);
        caretAfter(editor, 'ok');
        editor.commands.setHardBreak();
        editor.commands.insertContent('checked');
        const [cell] = getDocumentCells(editor);
        expect(cell).toStrictEqual(
            markdown(
                '| Status | Orders | Note |\n| :--- | ---: | :---: |\n| completed | 97 | ok checked |',
            ),
        );
        editor.destroy();
    });

    it('flattens a list typed into a cell instead of dropping the table', () => {
        const editor = load([markdown(table)]);
        caretAfter(editor, 'ok');
        editor.commands.keyboardShortcut('Enter');
        editor.commands.insertContent('- first');
        const [cell] = getDocumentCells(editor);
        expect(cell.type).toBe('markdown');
        const text = cell.type === 'markdown' ? cell.content.markdown : '';
        expect(text).not.toContain('[table]');
        expect(text).toContain('| completed | 97 | ok first |');
        editor.destroy();
    });

    it('escapes a pipe typed into a cell and keeps empty cells', () => {
        const editor = load([markdown('| A | B |\n| --- | --- |\n| x |  |')]);
        caretAfter(editor, 'x');
        editor.commands.insertContent('|y');
        const reloaded = load(getDocumentCells(editor));
        const cells: string[] = [];
        reloaded.state.doc.descendants((node) => {
            if (node.type.name === 'tableCell') cells.push(node.textContent);
        });
        expect(cells).toStrictEqual(['x|y', '']);
        editor.destroy();
        reloaded.destroy();
    });
});
