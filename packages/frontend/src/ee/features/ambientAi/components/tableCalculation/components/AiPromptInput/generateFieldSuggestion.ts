import { type MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    FieldSuggestionList,
    type FieldSuggestionItem,
    type FieldSuggestionListRef,
} from './FieldSuggestionList';

/**
 * Workaround for the current typing incompatibility between Tippy.js and Tiptap
 * Suggestion utility.
 *
 * @see https://github.com/ueberdosis/tiptap/issues/2795#issuecomment-1160623792
 */
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

export const generateFieldSuggestion = (
    fields: FieldSuggestionItem[],
): MentionOptions['suggestion'] => ({
    items: ({ query }) =>
        fields.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
        ),
    // Custom command to ensure both id and label are stored as attrs
    command: ({ editor, range, props }) => {
        const suggestion = props as FieldSuggestionItem;
        editor
            .chain()
            .focus()
            .insertContentAt(range, [
                {
                    type: 'mention',
                    attrs: {
                        id: suggestion.id,
                        label: suggestion.label,
                    },
                },
                { type: 'text', text: ' ' },
            ])
            .run();
    },
    render: () => {
        let component: ReactRenderer<FieldSuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;

        return {
            onStart: (props) => {
                component = new ReactRenderer(FieldSuggestionList, {
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

                if (!component?.ref) {
                    return false;
                }

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
