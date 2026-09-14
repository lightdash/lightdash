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

export type SlashCommandItem = SuggestionItem & {
    description: string;
    icon: TablerIcon;
    run: (editor: Editor, range: Range) => void;
};

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
    {
        id: 'text',
        label: 'Text',
        description: 'Plain paragraph',
        icon: IconPilcrow,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
        id: 'heading1',
        label: 'Heading 1',
        description: 'Big section heading',
        icon: IconH1,
        run: (editor, range) =>
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .setNode('heading', { level: 1 })
                .run(),
    },
    {
        id: 'heading2',
        label: 'Heading 2',
        description: 'Medium section heading',
        icon: IconH2,
        run: (editor, range) =>
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .setNode('heading', { level: 2 })
                .run(),
    },
    {
        id: 'heading3',
        label: 'Heading 3',
        description: 'Small section heading',
        icon: IconH3,
        run: (editor, range) =>
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .setNode('heading', { level: 3 })
                .run(),
    },
    {
        id: 'bulletList',
        label: 'Bulleted list',
        description: 'Simple unordered list',
        icon: IconList,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
        id: 'orderedList',
        label: 'Numbered list',
        description: 'Ordered list with numbers',
        icon: IconListNumbers,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
        id: 'blockquote',
        label: 'Quote',
        description: 'Indented callout text',
        icon: IconBlockquote,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
        id: 'codeBlock',
        label: 'Code block',
        description: 'Monospaced code snippet',
        icon: IconCode,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
        id: 'divider',
        label: 'Divider',
        description: 'Horizontal rule',
        icon: IconMinus,
        run: (editor, range) =>
            editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
];

export const createSlashCommandItems = (options?: {
    onInsertImage?: () => void;
}): SlashCommandItem[] => {
    if (!options?.onInsertImage) return SLASH_COMMAND_ITEMS;
    const { onInsertImage } = options;
    return [
        ...SLASH_COMMAND_ITEMS,
        {
            id: 'image',
            label: 'Image',
            description: 'Upload an image',
            icon: IconPhoto,
            run: (editor, range) => {
                editor.chain().focus().deleteRange(range).run();
                onInsertImage();
            },
        },
    ];
};
