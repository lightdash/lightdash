import type { CommandProps } from '@tiptap/core';

/** Deletes an atom mention sitting right before the caret in one Backspace, like a character. */
export const deleteMentionBeforeCaret =
    (nodeName: string) =>
    ({ tr, state }: CommandProps): boolean => {
        const { empty, anchor } = state.selection;
        if (!empty || anchor <= 0) return false;
        let deleted = false;
        state.doc.nodesBetween(Math.max(0, anchor - 1), anchor, (node, pos) => {
            if (node.type.name === nodeName) {
                tr.delete(pos, pos + node.nodeSize);
                deleted = true;
                return false;
            }
            return true;
        });
        return deleted;
    };
