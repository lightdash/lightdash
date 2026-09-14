import { PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { generateSuggestion } from '../../../../../components/common/SuggestionList/generateSuggestion';
import {
    SLASH_COMMAND_ITEMS,
    type SlashCommandItem,
} from './slashCommandItems';
import { renderSlashCommandItem } from './SlashCommandMenuItem';

const slashCommandPluginKey = new PluginKey('homepageMarkdownSlashCommand');

export interface SlashCommandOptions {
    items: SlashCommandItem[];
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
    name: 'slashCommand',

    addOptions() {
        return { items: SLASH_COMMAND_ITEMS };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion<SlashCommandItem>({
                editor: this.editor,
                char: '/',
                startOfLine: false,
                pluginKey: slashCommandPluginKey,
                ...generateSuggestion<SlashCommandItem>({
                    items: this.options.items,
                    command: ({ editor, range, props }) => {
                        const item = props as SlashCommandItem;
                        item.run(editor, range);
                    },
                    renderItem: renderSlashCommandItem,
                    emptyMessage: 'No matching block type',
                }),
            }),
        ];
    },
});
