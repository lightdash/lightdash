import { NodeSelection } from '@tiptap/pm/state';
import { type Editor } from '@tiptap/react';
import { useEffect } from 'react';
import { DOCUMENT_CHART_NODE } from './documentChartNode';

const DROP_AT_START_ATTRIBUTE = 'data-drop-at-start';
const EDGE_SCROLL_ZONE_PX = 80;
const EDGE_SCROLL_MAX_STEP_PX = 60;

const getScrollContainer = (element: HTMLElement): HTMLElement | null => {
    for (
        let current = element.parentElement;
        current;
        current = current.parentElement
    ) {
        const { overflowY } = getComputedStyle(current);
        if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            current.scrollHeight > current.clientHeight
        ) {
            return current;
        }
    }
    return null;
};

/** Scrolls faster the closer the pointer is to the container's top or bottom edge. */
const scrollNearEdge = (container: HTMLElement, clientY: number) => {
    const box = container.getBoundingClientRect();
    const fromTop = clientY - box.top;
    const fromBottom = box.bottom - clientY;
    const step = (distance: number) =>
        Math.ceil(
            ((EDGE_SCROLL_ZONE_PX - distance) / EDGE_SCROLL_ZONE_PX) *
                EDGE_SCROLL_MAX_STEP_PX,
        );
    if (fromTop >= 0 && fromTop < EDGE_SCROLL_ZONE_PX) {
        container.scrollBy(0, -step(fromTop));
    } else if (fromBottom >= 0 && fromBottom < EDGE_SCROLL_ZONE_PX) {
        container.scrollBy(0, step(fromBottom));
    }
};

/** The chart being dragged in this editor; its drag handle selects it on dragstart. */
const getDraggedChart = (editor: Editor): NodeSelection | null => {
    if (!editor.view.dragging) {
        return null;
    }
    const { selection } = editor.state;
    return selection instanceof NodeSelection &&
        selection.node.type.name === DOCUMENT_CHART_NODE
        ? selection
        : null;
};

/**
 * Makes moving a chart to the top reachable: the title block above the body
 * is outside the editor, so a chart dropped anywhere above the body moves to
 * the top of the document, and the page scrolls near its edges mid-drag.
 */
export const useTopDropZone = (editor: Editor | null) => {
    useEffect(() => {
        if (!editor) {
            return undefined;
        }
        // The view only exists once the editor is attached to the page
        const getBody = () =>
            editor.isInitialized && !editor.isDestroyed
                ? editor.view.dom
                : null;
        const isAboveBody = (body: HTMLElement, event: DragEvent) => {
            const header = body.closest('article')?.querySelector('header');
            if (!header) {
                return false;
            }
            const bodyBox = body.getBoundingClientRect();
            return (
                event.clientX >= bodyBox.left &&
                event.clientX <= bodyBox.right &&
                event.clientY >= header.getBoundingClientRect().top &&
                event.clientY < bodyBox.top
            );
        };
        const clear = () => getBody()?.removeAttribute(DROP_AT_START_ATTRIBUTE);
        const onDragOver = (event: DragEvent) => {
            const body = getBody();
            if (!body) {
                return;
            }
            const draggingChart =
                editor.isEditable && !!getDraggedChart(editor);
            const container = draggingChart ? getScrollContainer(body) : null;
            if (container) {
                scrollNearEdge(container, event.clientY);
            }
            if (draggingChart && isAboveBody(body, event)) {
                event.preventDefault();
                body.setAttribute(DROP_AT_START_ATTRIBUTE, '');
            } else {
                body.removeAttribute(DROP_AT_START_ATTRIBUTE);
            }
        };
        const onDrop = (event: DragEvent) => {
            const body = getBody();
            if (!body) {
                return;
            }
            body.removeAttribute(DROP_AT_START_ATTRIBUTE);
            const dragged = getDraggedChart(editor);
            if (!editor.isEditable || !dragged || !isAboveBody(body, event)) {
                return;
            }
            event.preventDefault();
            const { tr } = editor.state;
            tr.delete(dragged.from, dragged.to);
            tr.insert(0, dragged.node);
            tr.setSelection(NodeSelection.create(tr.doc, 0));
            editor.view.dispatch(tr.scrollIntoView());
            editor.view.dragging = null;
            editor.commands.focus();
        };
        document.addEventListener('dragover', onDragOver);
        document.addEventListener('drop', onDrop);
        document.addEventListener('dragend', clear);
        return () => {
            clear();
            document.removeEventListener('dragover', onDragOver);
            document.removeEventListener('drop', onDrop);
            document.removeEventListener('dragend', clear);
        };
    }, [editor]);
};
