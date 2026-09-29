import { Table } from '@tiptap/extension-table';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';

/** The slice of tiptap-markdown's serializer state these serializers use. */
type MarkdownState = {
    out: string;
    inTable: boolean;
    write: (content: string) => void;
    ensureNewLine: () => void;
    renderInline: (node: ProseMirrorNode) => void;
    closeBlock: (node: ProseMirrorNode) => void;
};

const DELIMITERS: Record<string, string> = {
    left: ':---',
    center: ':---:',
    right: '---:',
};

/** A textblock with its line breaks as spaces, since a table row is one line. */
const withoutLineBreaks = (block: ProseMirrorNode) => {
    const inline: ProseMirrorNode[] = [];
    block.forEach((child) => {
        inline.push(
            child.type.name === 'hardBreak'
                ? block.type.schema.text(' ', child.marks)
                : child,
        );
    });
    return block.copy(Fragment.from(inline));
};

/** Markdown cells are one line: extra paragraphs, list items and breaks join with a space. */
const writeCell = (state: MarkdownState, cell: ProseMirrorNode) => {
    const start = state.out.length;
    let wroteText = false;
    cell.descendants((child) => {
        if (!child.isTextblock) {
            return true;
        }
        if (child.textContent.trim()) {
            if (wroteText) {
                state.write(' ');
            }
            state.renderInline(withoutLineBreaks(child));
            wroteText = true;
        }
        return false;
    });
    // Content pipes would otherwise split the cell (GFM escapes them in code too)
    state.out = `${state.out.slice(0, start)}${state.out
        .slice(start)
        .replace(/\|/g, '\\|')}`;
};

/**
 * GFM tables that keep column alignment and never fall back to HTML: with
 * HTML off, tiptap-markdown would otherwise save a multi-paragraph cell's
 * whole table as the text "[table]", and line breaks as "[hardBreak]".
 */
export const DocumentTable = Table.extend({
    addStorage() {
        return {
            markdown: {
                serialize(state: MarkdownState, node: ProseMirrorNode) {
                    state.inTable = true;
                    node.forEach((row, _rowOffset, rowIndex) => {
                        state.write('| ');
                        row.forEach((cell, _cellOffset, cellIndex) => {
                            if (cellIndex) {
                                state.write(' | ');
                            }
                            writeCell(state, cell);
                        });
                        state.write(' |');
                        state.ensureNewLine();
                        if (rowIndex === 0) {
                            const delimiters: string[] = [];
                            row.forEach((cell) =>
                                delimiters.push(
                                    DELIMITERS[cell.attrs.align] ?? '---',
                                ),
                            );
                            state.write(`| ${delimiters.join(' | ')} |`);
                            state.ensureNewLine();
                        }
                    });
                    state.closeBlock(node);
                    state.inTable = false;
                },
                parse: {},
            },
        };
    },
});
