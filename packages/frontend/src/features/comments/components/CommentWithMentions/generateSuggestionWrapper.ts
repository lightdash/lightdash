import { type MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { type SuggestionsItem } from '../../types';
import { SuggestionList, type SuggestionListRef } from './SuggestionList';

/**
 * Workaround for the current typing incompatibility between Tippy.js and Tiptap
 * Suggestion utility.
 *
 * @see https://github.com/ueberdosis/tiptap/issues/2795#issuecomment-1160623792
 *
 * Adopted from
 * https://github.com/Doist/typist/blob/a1726a6be089e3e1452def641dfcfc622ac3e942/stories/typist-editor/constants/suggestions.ts#L169-L186
 * Taken from
 * https://github.com/sjdemartini/mui-tiptap/blob/4ff56f8c77e565186656d7cc97adfd1a7960a572/src/demo/mentionSuggestionOptions.ts
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

export const generateSuggestionWrapper = (
    suggestions: SuggestionsItem[],
): MentionOptions['suggestion'] => ({
    items: ({ query }) =>
        suggestions.filter((item) =>
            item.label.toLowerCase().startsWith(query.toLowerCase()),
        ),
    render: () => {
        let component: ReactRenderer<SuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;

        return {
            onStart: (props) => {
                component = new ReactRenderer(SuggestionList, {
                    props,
                    editor: props.editor,
                });

                popup = tippy('body', {
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                    appendTo: 'parent',
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
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
