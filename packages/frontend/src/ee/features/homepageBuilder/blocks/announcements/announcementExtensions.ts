import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { createContentMentionExtension } from '../../../aiCopilot/components/ChatElements/contentMentions';

export const createAnnouncementExtensions = (
    getProjectUuid: () => string | undefined,
) => [
    StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
    }),
    Placeholder.configure({
        placeholder:
            'Post an announcement to this audience — type @ to mention a chart or dashboard…',
    }),
    createContentMentionExtension({
        getProjectUuid,
        getPriorityItems: () => [],
    }),
];
