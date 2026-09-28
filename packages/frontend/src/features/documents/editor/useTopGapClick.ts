import { GapCursor } from '@tiptap/pm/gapcursor';
import { type Editor } from '@tiptap/react';
import { useEffect } from 'react';

/**
 * When a document starts with a chart there is no text position above it, so
 * a click in the strip between the title block and the body puts the cursor
 * there; typing then creates a paragraph above the chart.
 */
export const useTopGapClick = (editor: Editor | null) => {
    useEffect(() => {
        if (!editor) {
            return undefined;
        }
        const onMouseDown = (event: MouseEvent) => {
            if (
                event.button !== 0 ||
                !editor.isInitialized ||
                editor.isDestroyed ||
                !editor.isEditable
            ) {
                return;
            }
            const body = editor.view.dom;
            const header = body.closest('article')?.querySelector('header');
            const first = editor.state.doc.firstChild;
            if (!header || !first || first.isTextblock) {
                return;
            }
            const bodyBox = body.getBoundingClientRect();
            if (
                event.clientX < bodyBox.left ||
                event.clientX > bodyBox.right ||
                event.clientY < header.getBoundingClientRect().bottom ||
                event.clientY >= bodyBox.top
            ) {
                return;
            }
            event.preventDefault();
            editor
                .chain()
                .focus()
                .command(({ tr }) => {
                    tr.setSelection(new GapCursor(tr.doc.resolve(0)));
                    return true;
                })
                .run();
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [editor]);
};
