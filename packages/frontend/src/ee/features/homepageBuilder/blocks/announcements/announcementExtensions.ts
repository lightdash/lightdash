import { IconPhoto } from '@tabler/icons-react';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { createContentMentionExtension } from '../../../aiCopilot/components/ChatElements/contentMentions';
import { SlashCommand } from '../markdownEditor/SlashCommandExtension';
import { type SlashCommandItem } from '../markdownEditor/slashCommandItems';

export const createAnnouncementExtensions = (
    getProjectUuid: () => string | undefined,
    onInsertImage?: () => void,
) => {
    const imageSlashItems: SlashCommandItem[] = onInsertImage
        ? [
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
          ]
        : [];
    return [
        StarterKit.configure({
            heading: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            codeBlock: false,
            horizontalRule: false,
        }),
        Image.configure({
            HTMLAttributes: { class: 'announcement-image' },
        }),
        Placeholder.configure({
            placeholder:
                'Share an update — type / to add an image, @ to mention a chart or dashboard…',
        }),
        createContentMentionExtension({
            getProjectUuid,
            getPriorityItems: () => [],
            includeFilesAndRepositories: false,
        }),
        ...(onInsertImage
            ? [SlashCommand.configure({ items: imageSlashItems })]
            : []),
    ];
};
