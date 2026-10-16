import {
    IconBlockquote,
    IconCode,
    IconH1,
    IconH2,
    IconH3,
    IconList,
    IconListNumbers,
    IconMinus,
    IconPhoto,
    IconPilcrow,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type Editor, type Range } from '@tiptap/react';
import { type SuggestionItem } from '../../../../../components/common/SuggestionList/SuggestionList';
import i18n from '../../../../../i18n/i18n';

export type SlashCommandItem = SuggestionItem & {
    description: string;
    icon: TablerIcon;
    run: (editor: Editor, range: Range) => void;
};

// Getters keep the copy lazy: resolved at render, never at module load.
const slashItem = (
    id: string,
    icon: TablerIcon,
    run: SlashCommandItem['run'],
): SlashCommandItem => ({
    id,
    icon,
    run,
    get label() {
        return i18n.t(`slashCommands.${id}.label`, { ns: 'homepageBuilder' });
    },
    get description() {
        return i18n.t(`slashCommands.${id}.description`, {
            ns: 'homepageBuilder',
        });
    },
});

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
    slashItem('text', IconPilcrow, (editor, range) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    ),
    slashItem('heading1', IconH1, (editor, range) =>
        editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 1 })
            .run(),
    ),
    slashItem('heading2', IconH2, (editor, range) =>
        editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 2 })
            .run(),
    ),
    slashItem('heading3', IconH3, (editor, range) =>
        editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 3 })
            .run(),
    ),
    slashItem('bulletList', IconList, (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    ),
    slashItem('orderedList', IconListNumbers, (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    ),
    slashItem('blockquote', IconBlockquote, (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    ),
    slashItem('codeBlock', IconCode, (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    ),
    slashItem('divider', IconMinus, (editor, range) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    ),
];

export const createSlashCommandItems = (options?: {
    onInsertImage?: () => void;
}): SlashCommandItem[] => {
    if (!options?.onInsertImage) return SLASH_COMMAND_ITEMS;
    const { onInsertImage } = options;
    return [
        ...SLASH_COMMAND_ITEMS,
        slashItem('image', IconPhoto, (editor, range) => {
            editor.chain().focus().deleteRange(range).run();
            onInsertImage();
        }),
    ];
};
