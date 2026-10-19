import {
    ChartType,
    fromDocumentChartBlocks,
    type DocumentChartBlock,
} from '@lightdash/common';
import { Editor } from '@tiptap/core';
import { sharedLightdashApi } from '../../../api';
import { buildDocumentContent } from './documentContent';
import { createDocumentEditorExtensions } from './documentEditorExtensions';

const chartBlock = (id: string): DocumentChartBlock => ({
    type: 'chart',
    id,
    chart: {
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
});

const chart = chartBlock('c1');

const markdown = (text: string): DocumentChartBlock => ({
    type: 'markdown',
    markdown: text,
});

const load = (blocks: DocumentChartBlock[], editable = true) => {
    const editor = new Editor({
        editable,
        extensions: createDocumentEditorExtensions(sharedLightdashApi, {
            projectUuid: 'project',
            editing: editable
                ? { onInsertChart: null, onEditChart: null }
                : undefined,
        }),
    });
    editor.commands.setContent(
        buildDocumentContent(editor, fromDocumentChartBlocks(blocks)),
        { emitUpdate: false },
    );
    return editor;
};

const layout = (editor: Editor) => {
    const blocks: string[] = [];
    editor.state.doc.forEach((node) =>
        blocks.push(
            node.type.name === 'paragraph'
                ? `p:${node.textContent}`
                : node.type.name,
        ),
    );
    return blocks;
};

/** Start of the top-level block at `index`, plus one to land inside it. */
const insideBlock = (editor: Editor, index: number) => {
    let position = 0;
    editor.state.doc.forEach((_node, offset, i) => {
        if (i === index) position = offset + 1;
    });
    return position;
};

describe('empty line cleanup', () => {
    it('removes an empty line between charts once the cursor leaves it', () => {
        const editor = load([chart, chartBlock('c2'), markdown('After')]);
        editor.commands.insertContentAt(editor.state.doc.firstChild!.nodeSize, {
            type: 'paragraph',
        });
        editor.commands.setTextSelection(insideBlock(editor, 1));
        expect(layout(editor)).toEqual([
            'documentChart',
            'p:',
            'documentChart',
            'p:After',
        ]);
        editor.commands.setTextSelection(insideBlock(editor, 3));
        expect(layout(editor)).toEqual([
            'documentChart',
            'documentChart',
            'p:After',
        ]);
        editor.destroy();
    });

    it('clears a blank line between text paragraphs when the cursor moves on', () => {
        const editor = load([markdown('One\n\nTwo')]);
        editor.commands.setTextSelection(4);
        editor.commands.splitBlock();
        expect(layout(editor)).toEqual(['p:One', 'p:', 'p:Two']);
        editor.commands.setTextSelection(insideBlock(editor, 2));
        expect(layout(editor)).toEqual(['p:One', 'p:Two']);
        editor.destroy();
    });

    it('keeps the last line after a trailing chart and an empty document', () => {
        const trailing = load([markdown('Before'), chart]);
        trailing.commands.setTextSelection(1);
        expect(layout(trailing)).toEqual(['p:Before', 'documentChart', 'p:']);
        trailing.destroy();

        const empty = load([]);
        empty.commands.selectAll();
        expect(layout(empty)).toEqual(['p:']);
        empty.destroy();
    });

    it('does nothing in the reader', () => {
        const editor = load([markdown('One\n\nTwo')], false);
        editor.view.dispatch(
            editor.state.tr.insert(5, editor.schema.nodes.paragraph.create()),
        );
        editor.commands.setTextSelection(1);
        expect(layout(editor)).toEqual(['p:One', 'p:', 'p:Two']);
        editor.destroy();
    });
});
