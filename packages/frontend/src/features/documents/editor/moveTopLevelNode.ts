import { NodeSelection, type EditorState } from '@tiptap/pm/state';

export type MoveDirection = -1 | 1;

/**
 * Moves the top-level node at `position` past its neighbour, keeping it
 * selected: the keyboard counterpart of dragging a chart. Null at an edge.
 */
export const moveTopLevelNode = (
    state: EditorState,
    position: number,
    direction: MoveDirection,
) => {
    const { doc } = state;
    const node = doc.nodeAt(position);
    if (!node || doc.resolve(position).depth !== 0) {
        return null;
    }
    const index = doc.resolve(position).index(0);
    const neighbourIndex = index + direction;
    if (neighbourIndex < 0 || neighbourIndex >= doc.childCount) {
        return null;
    }
    const neighbour = doc.child(neighbourIndex);
    const target =
        direction === -1
            ? position - neighbour.nodeSize
            : position + neighbour.nodeSize;
    const tr = state.tr.delete(position, position + node.nodeSize);
    tr.insert(target, node);
    tr.setSelection(NodeSelection.create(tr.doc, target));
    return { tr: tr.scrollIntoView(), position: target };
};
