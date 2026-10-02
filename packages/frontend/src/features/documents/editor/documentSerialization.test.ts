import {
    ChartType,
    fromDocumentChartBlocks,
    getDocumentChartBlocks,
    type DocumentChartBlock,
} from '@lightdash/common';
import { Editor } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { TextSelection } from '@tiptap/pm/state';
import { DOCUMENT_CHART_NODE } from './documentChartNode';
import { buildDocumentContent } from './documentContent';
import { createDocumentEditorExtensions } from './documentEditorExtensions';
import {
    getDocumentContent,
    getTopLevelInsertPosition,
} from './documentSerialization';
import { moveTopLevelNode } from './moveTopLevelNode';

const chart = (name: string, id = 'c1'): DocumentChartBlock => ({
    type: 'chart',
    id,
    chart: {
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

const markdown = (text: string): DocumentChartBlock => ({
    type: 'markdown',
    markdown: text,
});

const chartContent = (block: DocumentChartBlock) => {
    if (block.type !== 'chart') throw new Error('Not a chart block');
    return block.chart;
};

/** The saved content of the editor, read back as blocks in reading order. */
const getBlocks = (editor: Editor) =>
    getDocumentChartBlocks(getDocumentContent(editor));

const load = (blocks: DocumentChartBlock[]) => {
    const editor = new Editor({
        extensions: createDocumentEditorExtensions({
            projectUuid: 'project',
            editing: { onInsertChart: null, onEditChart: null },
        }),
    });
    editor.commands.setContent(
        buildDocumentContent(editor, fromDocumentChartBlocks(blocks)),
        {
            emitUpdate: false,
        },
    );
    return editor;
};

describe('getDocumentContent', () => {
    it('round-trips markdown and charts in order', () => {
        const cells = [
            markdown('# Findings\n\nSome **bold** text.\n\n- one\n- two'),
            chart('Orders'),
            markdown(
                '## Detail\n\n| Status | Orders |\n| --- | --- |\n| completed | 97 |',
            ),
            chart('Returns', 'c2'),
        ];
        const editor = load(cells);
        expect(getBlocks(editor)).toStrictEqual(cells);
        editor.destroy();
    });

    it('merges adjacent markdown and drops empty trailing paragraphs', () => {
        const editor = load([markdown('Intro'), markdown('# Findings')]);
        editor.commands.insertContentAt(editor.state.doc.content.size, {
            type: 'paragraph',
        });
        expect(getBlocks(editor)).toStrictEqual([
            markdown('Intro\n\n# Findings'),
        ]);
        editor.destroy();
    });

    it('serialises an inserted chart node under a temporary key', () => {
        const editor = load([markdown('Before'), markdown('After')]);
        const inserted = chart('Inserted', 'new-1');
        editor.commands.insertContentAt(editor.state.doc.firstChild!.nodeSize, {
            type: DOCUMENT_CHART_NODE,
            attrs: {
                content: chartContent(inserted),
                chartId: null,
                isSaved: false,
            },
        });
        expect(getBlocks(editor)).toStrictEqual([
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
        const once = getBlocks(first);
        first.destroy();
        const second = load(once);
        const twice = getBlocks(second);
        second.destroy();
        expect(twice).toStrictEqual(once);
        expect(second.state.doc.textContent).toBe(first.state.doc.textContent);
    });

    it('returns no blocks for an empty document', () => {
        const editor = load([]);
        expect(getBlocks(editor)).toStrictEqual([]);
        expect(getDocumentContent(editor)).toStrictEqual({
            markdown: '',
            charts: {},
        });
        editor.destroy();
    });

    it('keeps the chart id of a chart edited in place', () => {
        const editor = load([markdown('Intro'), chart('Orders', 'c3')]);
        let position = -1;
        editor.state.doc.forEach((node, offset) => {
            if (node.type.name === DOCUMENT_CHART_NODE) position = offset;
        });
        const edited = chart('Edited orders', 'c3');
        editor.view.dispatch(
            editor.state.tr.setNodeMarkup(position, undefined, {
                content: chartContent(edited),
                chartId: 'c3',
                isSaved: false,
            }),
        );
        expect(getBlocks(editor)).toStrictEqual([markdown('Intro'), edited]);
        editor.destroy();
    });

    it('gives a duplicated chart id a temporary key', () => {
        const orders = chart('Orders', 'c3');
        const editor = load([orders]);
        editor.commands.insertContentAt(editor.state.doc.content.size, {
            type: DOCUMENT_CHART_NODE,
            attrs: {
                content: chartContent(orders),
                chartId: 'c3',
                isSaved: true,
            },
        });
        expect(getBlocks(editor)).toStrictEqual([
            orders,
            { ...orders, id: 'new-1' },
        ]);
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
        expect(getBlocks(editor)).toStrictEqual([
            markdown('Intro'),
            first,
            markdown('After'),
        ]);
        editor.destroy();
    });

    it('writes between two adjacent charts', () => {
        const first = chart('First');
        const second = chart('Second', 'c2');
        const editor = load([first, second]);
        typeAt(editor, editor.state.doc.firstChild!.nodeSize, 'Between');
        expect(getBlocks(editor)).toStrictEqual([
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
        expect(getBlocks(editor)).toStrictEqual([
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

    it('reorders blocks and keeps the chart id so the chart keeps its query', () => {
        const orders = chart('Orders');
        const editor = load([markdown('# Intro'), orders, markdown('Outro')]);
        moveTopLevel(editor, 1, 2);
        expect(getBlocks(editor)).toStrictEqual([
            markdown('# Intro\n\nOutro'),
            orders,
        ]);
        let movedId: unknown = null;
        editor.state.doc.forEach((node) => {
            if (node.type.name === 'documentChart') {
                movedId = node.attrs.chartId;
            }
        });
        expect(movedId).toBe('c1');
        editor.destroy();
    });

    it('serialises identically after a move back to the start position', () => {
        const blocks = [
            markdown('# Intro'),
            chart('Orders'),
            markdown('Outro'),
        ];
        const editor = load(blocks);
        moveTopLevel(editor, 1, 2);
        moveTopLevel(editor, 2, 1);
        expect(getBlocks(editor)).toStrictEqual(blocks);
        editor.destroy();
    });
});

describe('moving charts with the keyboard', () => {
    const chartPosition = (editor: ReturnType<typeof load>, name: string) => {
        let found = -1;
        editor.state.doc.forEach((node, offset) => {
            if (node.attrs.content?.chart?.name === name) found = offset;
        });
        return found;
    };

    it('moves a chart past one block at a time and keeps it selected', () => {
        const orders = chart('Orders');
        const editor = load([markdown('# Intro'), markdown('Body'), orders]);
        const up = moveTopLevelNode(
            editor.state,
            chartPosition(editor, 'Orders'),
            -1,
        );
        editor.view.dispatch(up!.tr);
        expect(getBlocks(editor)).toStrictEqual([
            markdown('# Intro'),
            orders,
            markdown('Body'),
        ]);
        expect(editor.state.selection.from).toBe(up!.position);
        expect(
            editor.state.doc.nodeAt(editor.state.selection.from)?.type.name,
        ).toBe(DOCUMENT_CHART_NODE);
        const down = moveTopLevelNode(editor.state, up!.position, 1);
        editor.view.dispatch(down!.tr);
        expect(getBlocks(editor)).toStrictEqual([
            markdown('# Intro\n\nBody'),
            orders,
        ]);
        editor.destroy();
    });

    it('stops at the start of the document', () => {
        const editor = load([chart('First'), markdown('After')]);
        expect(moveTopLevelNode(editor.state, 0, -1)).toBeNull();
        editor.destroy();
    });

    it('stops at the end of the document', () => {
        const editor = load([markdown('Before'), chart('Last')]);
        let last = 0;
        editor.state.doc.forEach((_node, offset) => {
            last = offset;
        });
        expect(moveTopLevelNode(editor.state, last, 1)).toBeNull();
        editor.destroy();
    });

    it('swaps two adjacent charts', () => {
        const first = chart('First');
        const second = chart('Second', 'c2');
        const editor = load([first, second]);
        editor.view.dispatch(moveTopLevelNode(editor.state, 0, 1)!.tr);
        expect(getBlocks(editor)).toStrictEqual([second, first]);
        editor.destroy();
    });

    it('moves a chart with Mod-Shift-ArrowUp when it is selected', () => {
        const orders = chart('Orders');
        const editor = load([markdown('Intro'), orders]);
        editor.commands.setNodeSelection(chartPosition(editor, 'Orders'));
        editor.view.dom.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                shiftKey: true,
                // `Mod` is Cmd on macOS and Ctrl elsewhere
                metaKey: /Mac/.test(navigator.platform),
                ctrlKey: !/Mac/.test(navigator.platform),
                bubbles: true,
            }),
        );
        expect(getBlocks(editor)[0]).toStrictEqual(orders);
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
            attrs: {
                content: chartContent(chart('Orders')),
                chartId: null,
                isSaved: false,
            },
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
        expect(getBlocks(editor)).toStrictEqual([markdown(table)]);
        editor.destroy();
    });

    it('keeps the table and its text when Enter splits a cell', () => {
        const editor = load([markdown(table)]);
        caretAfter(editor, 'completed');
        editor.commands.keyboardShortcut('Enter');
        editor.commands.insertContent('late');
        expect(getBlocks(editor)).toStrictEqual([
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
        const [block] = getBlocks(editor);
        expect(block).toStrictEqual(
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
        const [block] = getBlocks(editor);
        expect(block.type).toBe('markdown');
        const text = block.type === 'markdown' ? block.markdown : '';
        expect(text).not.toContain('[table]');
        expect(text).toContain('| completed | 97 | ok first |');
        editor.destroy();
    });

    it('escapes a pipe typed into a cell and keeps empty cells', () => {
        const editor = load([markdown('| A | B |\n| --- | --- |\n| x |  |')]);
        caretAfter(editor, 'x');
        editor.commands.insertContent('|y');
        const reloaded = load(getBlocks(editor));
        const cells: string[] = [];
        reloaded.state.doc.descendants((node) => {
            if (node.type.name === 'tableCell') cells.push(node.textContent);
        });
        expect(cells).toStrictEqual(['x|y', '']);
        editor.destroy();
        reloaded.destroy();
    });
});

describe('getDocumentContent tag-like text', () => {
    test('keeps a typed chart tag as text across saves', () => {
        const editor = load([markdown('Intro')]);
        editor.commands.setContent({
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: '<document-chart id="c1">' },
                    ],
                },
                {
                    type: 'codeBlock',
                    content: [
                        { type: 'text', text: '<document-chart id="c2">' },
                    ],
                },
            ],
        });
        const saved = getDocumentContent(editor);
        expect(saved.charts).toEqual({});
        expect(getDocumentChartBlocks(saved)).toEqual([
            {
                type: 'markdown',
                markdown:
                    '&lt;document-chart id="c1"&gt;\n\n```\n<document-chart id="c2">\n```',
            },
        ]);
        const reloaded = load(getDocumentChartBlocks(saved));
        expect(getDocumentContent(reloaded)).toEqual(saved);
        editor.destroy();
        reloaded.destroy();
    });
});
