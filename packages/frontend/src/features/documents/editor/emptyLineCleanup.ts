import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Removes an empty top-level line once the cursor leaves it: saving drops
 * empty lines anyway, so keeping them would show space the reader never
 * sees. The cursor's own line, the last line (the editor keeps one after the
 * final block) and an empty document's only line are left alone.
 */
export const EmptyLineCleanup = Extension.create({
    name: 'documentEmptyLineCleanup',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('documentEmptyLineCleanup'),
                appendTransaction: (transactions, _oldState, newState) => {
                    if (
                        !this.editor.isEditable ||
                        !transactions.some(
                            (tr) => tr.selectionSet || tr.docChanged,
                        )
                    ) {
                        return null;
                    }
                    const { doc, selection } = newState;
                    const lastIndex = doc.childCount - 1;
                    const ranges: Array<{ from: number; to: number }> = [];
                    doc.forEach((node, offset, index) => {
                        const end = offset + node.nodeSize;
                        const holdsCursor =
                            selection.from >= offset && selection.from <= end;
                        if (
                            index < lastIndex &&
                            node.type.name === 'paragraph' &&
                            node.content.size === 0 &&
                            !holdsCursor
                        ) {
                            ranges.push({ from: offset, to: end });
                        }
                    });
                    if (ranges.length === 0) {
                        return null;
                    }
                    const { tr } = newState;
                    ranges
                        .reverse()
                        .forEach(({ from, to }) => tr.delete(from, to));
                    return tr;
                },
            }),
        ];
    },
});
