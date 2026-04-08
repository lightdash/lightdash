import { type MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    FunctionSuggestionList,
    type FunctionSuggestionItem,
    type FunctionSuggestionListRef,
} from './FunctionSuggestionList';

const DOM_RECT_FALLBACK: DOMRect = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
        return {};
    },
};

export const generateFunctionSuggestion = (
    functions: FunctionSuggestionItem[],
): MentionOptions['suggestion'] => ({
    char: '#',
    allowedPrefixes: null,
    items: ({ query }) =>
        functions.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
        ),
    command: ({ editor, range, props }) => {
        const fn = props as FunctionSuggestionItem;
        editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: 'text', text: `${fn.id}(` }])
            .run();
    },
    render: () => {
        let component: ReactRenderer<FunctionSuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;

        return {
            onStart: (props) => {
                component = new ReactRenderer(FunctionSuggestionList, {
                    props,
                    editor: props.editor,
                });

                popup = tippy('body', {
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    maxWidth: 'none',
                })[0];
            },

            onUpdate(props) {
                component?.updateProps(props);
                popup?.setProps({
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                });
            },

            onKeyDown(props) {
                if (props.event.key === 'Escape') {
                    popup?.hide();
                    return true;
                }
                if (!component?.ref) return false;
                return component.ref.onKeyDown(props);
            },

            onExit() {
                popup?.destroy();
                component?.destroy();
                popup = undefined;
                component = undefined;
            },
        };
    },
});
