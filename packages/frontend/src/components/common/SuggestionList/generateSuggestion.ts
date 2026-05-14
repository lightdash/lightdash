import { type MentionOptions } from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import { type ReactNode } from 'react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    SuggestionList,
    type SuggestionItem,
    type SuggestionListRef,
} from './SuggestionList';

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

type GenerateSuggestionConfig<T extends SuggestionItem> = {
    items: T[];
    command: NonNullable<MentionOptions['suggestion']['command']>;
    renderItem: (
        item: T,
        isSelected: boolean,
        onClick: () => void,
    ) => ReactNode;
    getGroupKey?: (item: T) => string;
    groupLabels?: Record<string, string>;
    emptyMessage?: string;
};

export const generateSuggestion = <T extends SuggestionItem>(
    config: GenerateSuggestionConfig<T>,
): MentionOptions['suggestion'] => ({
    items: ({ query }) =>
        config.items.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
        ),
    command: config.command,
    render: () => {
        let component: ReactRenderer<SuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;

        return {
            onStart: (props) => {
                component = new ReactRenderer(SuggestionList, {
                    props: {
                        ...props,
                        renderItem: config.renderItem,
                        getGroupKey: config.getGroupKey,
                        groupLabels: config.groupLabels,
                        emptyMessage: config.emptyMessage,
                    },
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
                component?.updateProps({
                    ...props,
                    renderItem: config.renderItem,
                    getGroupKey: config.getGroupKey,
                    groupLabels: config.groupLabels,
                    emptyMessage: config.emptyMessage,
                });
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
